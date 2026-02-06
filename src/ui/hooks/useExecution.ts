// ============================================================
// useExecution.ts - Manage execution state (US-RUN-04)
// ============================================================

import { useState, useCallback } from 'preact/hooks';
import type { ExecutionStatus, LogEntry } from '../../plugin/types/runner.types';
import type { PluginMessage } from '../../plugin/types/messages.types';
import { sendToPlugin } from './useMessaging';

interface UseExecutionReturn {
  status: ExecutionStatus;
  executionId: string | null;
  logs: LogEntry[];
  duration: number | null;
  error: string | null;
  start: (codeJs: string, uiHtml: string, projectId: string) => void;
  stop: () => void;
  reset: () => void;
  handlePluginMessage: (msg: PluginMessage) => boolean;
}

const MAX_LOGS = 500;

export function useExecution(): UseExecutionReturn {
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((codeJs: string, uiHtml: string, projectId: string) => {
    setStatus('loading');
    setLogs([]);
    setDuration(null);
    setError(null);
    setExecutionId(null);
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
  }, []);

  /**
   * Handle execution-related plugin messages.
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
          // Cap logs to prevent memory issues
          return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        });
        return true;

      case 'EXECUTION_DONE':
        setDuration(msg.payload.duration);
        setStatus(msg.payload.duration === -1 ? 'stopped' : 'done');
        return true;

      case 'EXECUTION_ERROR':
        setError(msg.payload.message);
        setStatus('error');
        return true;

      default:
        return false;
    }
  }, []);

  return {
    status,
    executionId,
    logs,
    duration,
    error,
    start,
    stop,
    reset,
    handlePluginMessage,
  };
}