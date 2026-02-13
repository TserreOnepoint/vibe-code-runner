// ============================================================
// useExecution.ts - Manage execution + plugin UI state (US-RUN-04/05/06)
//
// US-RUN-06 additions:
//   - Integrates logs-streamer for Realtime broadcast + batch insert
//   - Captures window.onerror + unhandledrejection as error logs
//   - MAX_LOGS raised to 1000 (matches console.service cap)
// US-RUN-07 additions:
//   - Adds proxy-fetch for handling fetch requests from plugin code
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

  // Refs for current execution context (used by error handlers)
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
    // Stop streamer if active
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

  /**
   * Forward a message from plugin code (via controller) to the plugin iframe.
   * Called when we receive PLUGIN_UI_POST_MESSAGE.
   */
  const sendToPluginIframe = useCallback((data: unknown) => {
    const iframe = pluginIframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ pluginMessage: data }, '*');
    }
  }, []);

  /**
   * Internal: add a log entry to state + push to streamer.
   */
  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
    // Push to Realtime + buffer for batch insert
    logsStreamer.pushLog(entry);
  }, []);

  // --- US-RUN-06: Capture unhandled errors from window ---

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Only capture if an execution is active
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

  /**
   * Handle execution-related and plugin UI messages.
   * Returns true if the message was handled, false otherwise.
   */
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

        // Resolve Supabase URL for streamer
        // (supabaseUrlRef is set externally via setSupabaseUrl or from settings)
        const url = supabaseUrlRef.current;
        if (url && pid && eid) {
          logsStreamer.startStream({
            projectId: pid,
            executionId: eid,
            supabaseUrl: url,
          });
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
          // Manual stop — fully clean up streamer
          setStatus('stopped');
          executionIdRef.current = null;
          logsStreamer.stopStream();
        } else {
          // Normal completion — keep streamer alive for event-driven plugins
          // (figma.ui.onmessage handlers may still produce logs)
          // Streamer is stopped later on reset(), stop(), or new execute().
          setStatus('done');
        }
        // Keep plugin UI visible after execution ends (plugin may still be interactive)
        return true;

      case 'EXECUTION_ERROR':
        setError(msg.payload.message);
        setStatus('error');
        executionIdRef.current = null;
        // Log the error itself as a log entry with stack trace
        if (msg.payload.stack) {
          addLog({
            level: 'error',
            message: msg.payload.message,
            timestamp: Date.now(),
            source: 'error',
            stackTrace: msg.payload.stack,
          });
        }
        // Stop streamer (flushes remaining buffer)
        logsStreamer.stopStream();
        return true;

      // --- Plugin UI messages (US-RUN-05) ---

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
        // Forward from plugin code to plugin iframe
        sendToPluginIframe(msg.payload.data);
        return true;

      case 'PLUGIN_UI_RESIZE':
        setPluginUI((prev) => ({
          ...prev,
          width: msg.payload.width,
          height: msg.payload.height,
        }));
        return true;

      case 'PLUGIN_UI_CLOSE':
        setPluginUI(DEFAULT_PLUGIN_UI);
        return true;

      // --- Proxy fetch (US-RUN-07) ---

      case 'PROXY_FETCH_REQUEST': {
        const url = supabaseUrlRef.current;
        if (url) {
          executeProxyFetch(msg.payload, url).then((response) => {
            sendToPlugin({ type: 'PROXY_FETCH_RESPONSE', payload: response });
          });
        } else {
          // No Supabase URL configured — return error
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

  /**
   * Set the Supabase URL for the streamer (called from App.tsx when settings load).
   */
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
