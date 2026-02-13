// ============================================================
// useExecution.ts - Manage execution + plugin UI state (US-RUN-04/05/06/07)
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import type { Ref } from 'preact';
import type { ExecutionStatus, LogEntry, PluginUIState } from '../../plugin/types/runner.types';
import { DEFAULT_PLUGIN_UI } from '../../plugin/types/runner.types';
import type { PluginMessage } from '../../plugin/types/messages.types';
import { sendToPlugin } from './useMessaging';
import * as logsStreamer from '../lib/logs-streamer';
import { executeProxyFetch } from '../lib/proxy-fetch';

interface UseExecutionReturn {
  status: ExecutionStatus;
  executionId: string | null;
  logs: LogEntry[];
  duration: number | null;
  error: string | null;
  pluginUI: PluginUIState;
  pluginIframeRef: Ref<HTMLIFrameElement>;
  start: (codeJs: string, uiHtml: string, projectId: string) => void;
  stop: () => void;
  reset: () => void;
  handlePluginMessage: (msg: PluginMessage) => boolean;
  sendToPluginIframe: (data: unknown) => void;
  setSupabaseUrl: (url: string) => void;
}

const MAX_LOGS = 1000;

export function useExecution(): UseExecutionReturn {
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pluginUI, setPluginUI] = useState<PluginUIState>(DEFAULT_PLUGIN_UI);
  const pluginIframeRef = useRef<HTMLIFrameElement>(null);

  const executionIdRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const supabaseUrlRef = useRef<string>('');

  const start = useCallback((codeJs: string, uiHtml: string, projectId: string) => {
    setStatus('loading');
    setLogs([]);
    setDuration(null);
    setError(null);
    setExecutionId(null);
    setPluginUI(DEFAULT_PLUGIN_UI);
    projectIdRef.current = projectId;
    sendToPlugin({ type: 'EXECUTE_PLUGIN', payload: { codeJs, uiHtml, projectId } });
  }, []);

  const stop = useCallback(() => {
    sendToPlugin({ type: 'STOP_EXECUTION' });
  }, []);

  const reset = useCallback(() => {
    logsStreamer.stopStream();
    executionIdRef.current = null;
    projectIdRef.current = null;
    setStatus('idle');
    setExecutionId(null);
    setLogs([]);
    setDuration(null);
    setError(null);
    setPluginUI(DEFAULT_PLUGIN_UI);
  }, []);

  const sendToPluginIframe = useCallback((data: unknown) => {
    const iframe = pluginIframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ pluginMessage: data }, '*');
    }
  }, []);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
    logsStreamer.pushLog(entry);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!executionIdRef.current) return;
      const entry: LogEntry = {
        level: 'error',
        message: `[Unhandled Error] ${event.message || 'Unknown error'}`,
        timestamp: Date.now(),
        source: 'unhandled',
        stackTrace: event.error?.stack || `at ${event.filename}:${event.lineno}:${event.colno}`,
      };
      addLog(entry);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!executionIdRef.current) return;
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      const entry: LogEntry = {
        level: 'error',
        message: `[Unhandled Rejection] ${message}`,
        timestamp: Date.now(),
        source: 'unhandled',
        stackTrace: stack,
      };
      addLog(entry);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [addLog]);

  const handlePluginMessage = useCallback((msg: PluginMessage): boolean => {
    switch (msg.type) {
      case 'EXECUTION_STARTED': {
        const { executionId: eid, projectId: pid } = msg.payload;
        setExecutionId(eid);
        executionIdRef.current = eid;
        setStatus('running');
        setLogs([]);
        setDuration(null);
        setError(null);

        const url = supabaseUrlRef.current;
        if (url && pid && eid) {
          logsStreamer.startStream({ projectId: pid, executionId: eid, supabaseUrl: url });
        }
        return true;
      }

      case 'EXECUTION_LOG': {
        const entry: LogEntry = {
          level: msg.payload.level,
          message: msg.payload.message,
          timestamp: msg.payload.timestamp,
          source: msg.payload.source,
          stackTrace: msg.payload.stackTrace,
        };
        addLog(entry);
        return true;
      }

      case 'EXECUTION_DONE':
        setDuration(msg.payload.duration);
        if (msg.payload.duration === -1) {
          setStatus('stopped');
          executionIdRef.current = null;
          logsStreamer.stopStream();
        } else {
          setStatus('done');
        }
        return true;

      case 'EXECUTION_ERROR':
        setError(msg.payload.message);
        setStatus('error');
        executionIdRef.current = null;
        if (msg.payload.stack) {
          addLog({
            level: 'error',
            message: msg.payload.message,
            timestamp: Date.now(),
            source: 'error',
            stackTrace: msg.payload.stack,
          });
        }
        logsStreamer.stopStream();
        return true;

      case 'PLUGIN_SHOW_UI':
        setPluginUI({
          visible: msg.payload.visible,
          html: msg.payload.html,
          width: msg.payload.width,
          height: msg.payload.height,
          title: msg.payload.title,
        });
        return true;

      case 'PLUGIN_UI_POST_MESSAGE':
        sendToPluginIframe(msg.payload.data);
        return true;

      case 'PLUGIN_UI_RESIZE':
        setPluginUI((prev) => ({ ...prev, width: msg.payload.width, height: msg.payload.height }));
        return true;

      case 'PLUGIN_UI_CLOSE':
        setPluginUI(DEFAULT_PLUGIN_UI);
        return true;

      case 'PROXY_FETCH_REQUEST': {
        const url = supabaseUrlRef.current;
        if (url) {
          executeProxyFetch(msg.payload, url).then((response) => {
            sendToPlugin({ type: 'PROXY_FETCH_RESPONSE', payload: response });
          });
        } else {
          sendToPlugin({
            type: 'PROXY_FETCH_RESPONSE',
            payload: {
              requestId: msg.payload.requestId,
              ok: false,
              status: 0,
              statusText: '',
              headers: {},
              body: null,
              error: 'Supabase URL not configured',
            },
          });
        }
        return true;
      }

      default:
        return false;
    }
  }, [sendToPluginIframe, addLog]);

  const setSupabaseUrl = useCallback((url: string) => {
    supabaseUrlRef.current = url;
  }, []);

  return {
    status,
    executionId,
    logs,
    duration,
    error,
    pluginUI,
    pluginIframeRef,
    start,
    stop,
    reset,
    handlePluginMessage,
    sendToPluginIframe,
    setSupabaseUrl,
  };
}
