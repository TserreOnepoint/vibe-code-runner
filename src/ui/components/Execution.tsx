// ============================================================
// Execution.tsx - US-RUN-04 : execution screen
// ============================================================

import { h, FunctionalComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ExecutionStatus, LogEntry, ParsedBundle, Project } from '../../plugin/types/runner.types';
import { ErrorBanner } from './ErrorBanner';

interface Props {
  project: Project;
  bundle: ParsedBundle;
  status: ExecutionStatus;
  executionId: string | null;
  logs: LogEntry[];
  duration: number | null;
  error: string | null;
  onExecute: () => void;
  onStop: () => void;
  onReset: () => void;
  onBack: () => void;
}

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  idle: 'Pret',
  loading: 'Demarrage...',
  running: 'En cours',
  stopped: 'Arrete',
  error: 'Erreur',
  done: 'Termine',
};

const STATUS_COLORS: Record<ExecutionStatus, string> = {
  idle: 'var(--color-text-muted)',
  loading: 'var(--color-warning)',
  running: 'var(--color-success)',
  stopped: 'var(--color-warning)',
  error: 'var(--color-error)',
  done: 'var(--color-success)',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: 'var(--color-text)',
  warn: 'var(--color-warning)',
  error: 'var(--color-error)',
};

const LOG_LEVEL_LABELS: Record<string, string> = {
  info: 'LOG',
  warn: 'WRN',
  error: 'ERR',
};

export const Execution: FunctionalComponent<Props> = ({
  project,
  bundle,
  status,
  executionId,
  logs,
  duration,
  error,
  onExecute,
  onStop,
  onReset,
  onBack,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const isRunning = status === 'running' || status === 'loading';
  const canExecute = status === 'idle' || status === 'done' || status === 'error' || status === 'stopped';

  return (
    <div class="screen" style={{ gap: 0 }}>
      {/* Header */}
      <div class="screen-header">
        <div class="exec-top-row">
          <button class="btn btn-ghost" onClick={onBack} disabled={isRunning}>
            &larr;
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div class="screen-title" style={{ fontSize: 'var(--font-size-lg)', marginBottom: 0 }}>
              {project.name}
            </div>
            <div class="screen-subtitle">
              {bundle.files.length} fichier{bundle.files.length > 1 ? 's' : ''} &middot; {bundle.manifest.name}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div class="exec-status-bar">
        <div class="exec-status-indicator">
          <span
            class="exec-status-dot"
            style={{
              background: STATUS_COLORS[status],
              boxShadow: isRunning ? `0 0 6px ${STATUS_COLORS[status]}` : 'none',
            }}
          />
          <span style={{ color: STATUS_COLORS[status], fontWeight: 500 }}>
            {STATUS_LABELS[status]}
          </span>
        </div>
        {duration !== null && duration >= 0 && (
          <span class="exec-duration">{formatDuration(duration)}</span>
        )}
        {executionId && (
          <span class="exec-id" title={executionId}>
            {executionId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && <ErrorBanner message={error} onDismiss={onReset} />}

      {/* Action buttons */}
      <div class="exec-actions">
        {canExecute && (
          <button class="btn btn-primary btn-full" onClick={onExecute}>
            {status === 'idle' ? 'Executer' : 'Re-executer'}
          </button>
        )}
        {isRunning && (
          <button class="btn btn-danger btn-full" onClick={onStop}>
            Arreter
          </button>
        )}
      </div>

      {/* Logs console */}
      <div class="exec-logs-header">
        <span>Console</span>
        <span class="exec-logs-count">{logs.length}</span>
      </div>
      <div class="exec-logs">
        {logs.length === 0 && !isRunning && (
          <div class="exec-logs-empty">
            Aucun log. Lancez l'execution pour voir la sortie console.
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} class="exec-log-entry" style={{ color: LOG_LEVEL_COLORS[log.level] }}>
            <span class="exec-log-time">{formatTimestamp(log.timestamp)}</span>
            <span class="exec-log-level">{LOG_LEVEL_LABELS[log.level]}</span>
            <span class="exec-log-msg">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
