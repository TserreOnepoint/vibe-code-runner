// ============================================================
// useExecution.ts - Manage execution + plugin UI state (US-RUN-04/05)
// ============================================================

import { useState, useCallback, useRef } from 'preact/hooks';
import type { Ref } from 'preact';
import type { ExecutionStatus, LogEntry, PluginUIState } from '../../plugin/types/runner.types';
import { DEFAULT_PLUGIN_UI } from '../../plugin/types/runner.types';
import type { PluginMessage } from '../../plugin/types/messages.types';
import { sendToPlugin } from './useMessaging';

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
}

const MAX_LOGS = 500;

export function useExecution(): UseExecutionReturn {
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pluginUI, setPluginUI] = useState<PluginUIState>(DEFAULT_PLUGIN_UI);
  const pluginIframeRef = useRef<HTMLIFrameElement>(null);

  const start = useCallback((codeJs: string, uiHtml: string, projectId: string) => {
    setStatus('loading');
    setLogs([]);
    setDuration(null);
    setError(null);
    setExecutionId(null);
    setPluginUI(DEFAULT_PLUGIN_UI);
    sendToPlugin({ type: 'EXECUTE_PLUGIN', payload: { codeJs, uiHtml, projectId } });
  }, []);

  const stop = useCallback(() => {
    sendToPlugin({ type: 'STOP_EXECUTION' });
  }, []);

  const reset = useCallback(() => {
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
   * Handle execution-related and plugin UI messages.
   * Returns true if the message was handled, false otherwise.
   */
  const handlePluginMessage = useCallback((msg: PluginMessage): boolean => {
    switch (msg.type) {
      case 'EXECUTION_STARTED':
        setExecutionId(msg.payload.executionId);
        setStatus('running');
        setLogs([]);
        setDuration(null);
        setError(null);
        return true;

      case 'EXECUTION_LOG':
        setLogs((prev) => {
          const entry: LogEntry = {
            level: msg.payload.level,
            message: msg.payload.message,
            timestamp: msg.payload.timestamp,
          };
          const next = [...prev, entry];
          return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        });
        return true;

      case 'EXECUTION_DONE':
        setDuration(msg.payload.duration);
        setStatus(msg.payload.duration === -1 ? 'stopped' : 'done');
        // Keep plugin UI visible after execution ends (plugin may still be interactive)
        return true;

      case 'EXECUTION_ERROR':
        setError(msg.payload.message);
        setStatus('error');
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

      default:
        return false;
    }
  }, [sendToPluginIframe]);

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
  };
}