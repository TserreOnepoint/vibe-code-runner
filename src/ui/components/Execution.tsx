// ============================================================
// Execution.tsx - US-RUN-04/05 : execution screen with plugin UI iframe
// ============================================================

import { h, FunctionalComponent } from 'preact';
import type { Ref } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ExecutionStatus, LogEntry, ParsedBundle, Project, PluginUIState } from '../../plugin/types/runner.types';
import { sendToPlugin } from '../hooks/useMessaging';
import { ErrorBanner } from './ErrorBanner';

type Tab = 'plugin' | 'console';

interface Props {
  project: Project;
  bundle: ParsedBundle;
  status: ExecutionStatus;
  executionId: string | null;
  logs: LogEntry[];
  duration: number | null;
  error: string | null;
  pluginUI: PluginUIState;
  pluginIframeRef: Ref<HTMLIFrameElement>;
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
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
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
  pluginUI,
  pluginIframeRef,
  onExecute,
  onStop,
  onReset,
  onBack,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const hasPluginUI = pluginUI.html !== null;
  const [activeTab, setActiveTab] = useState<Tab>('console');

  // Auto-switch to plugin tab when plugin UI is shown
  useEffect(() => {
    if (hasPluginUI && pluginUI.visible) {
      setActiveTab('plugin');
    }
  }, [hasPluginUI, pluginUI.visible]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (activeTab === 'console') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, activeTab]);

  // Listen for messages from plugin iframe -> forward to code.js
  useEffect(() => {
    if (!hasPluginUI) return;

    const handleIframeMessage = (event: MessageEvent) => {
      // Only handle messages from our plugin iframe
      const iframe = pluginIframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const pluginMessage = event.data?.pluginMessage;
      if (pluginMessage !== undefined && executionId) {
        // Forward to controller (code.js) which dispatches to plugin's onmessage
        sendToPlugin({
          type: 'PLUGIN_UI_MESSAGE',
          payload: { executionId, data: pluginMessage },
        });
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [hasPluginUI, executionId, pluginIframeRef]);

  const isRunning = status === 'running' || status === 'loading';
  const canExecute = status === 'idle' || status === 'done' || status === 'error' || status === 'stopped';

  return (
    <div class="screen" style={{ gap: 0, padding: 0 }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-lg) var(--space-lg) 0' }}>
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

        {/* Tabs: Plugin UI / Console (only show tabs if plugin has UI) */}
        {hasPluginUI && (
          <div class="exec-tabs">
            <button
              class={`exec-tab ${activeTab === 'plugin' ? 'exec-tab-active' : ''}`}
              onClick={() => setActiveTab('plugin')}
            >
              Plugin UI
              {pluginUI.title ? ` - ${pluginUI.title}` : ''}
            </button>
            <button
              class={`exec-tab ${activeTab === 'console' ? 'exec-tab-active' : ''}`}
              onClick={() => setActiveTab('console')}
            >
              Console
              {logs.length > 0 && (
                <span class="exec-tab-badge">{logs.length}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Tab content area */}
      <div class="exec-tab-content">
        {/* Plugin UI iframe (US-RUN-05) */}
        {hasPluginUI && activeTab === 'plugin' && (
          <div class="exec-plugin-ui-container">
            <iframe
              ref={pluginIframeRef}
              class="exec-plugin-iframe"
              srcDoc={pluginUI.html!}
              sandbox="allow-scripts allow-forms"
              style={{
                width: '100%',
                height: `${pluginUI.height}px`,
                maxHeight: '100%',
              }}
              title={pluginUI.title || 'Plugin UI'}
            />
          </div>
        )}

        {/* Console (logs) - shown when console tab active OR when no plugin UI */}
        {(activeTab === 'console' || !hasPluginUI) && (
          <div class="exec-console-panel">
            {!hasPluginUI && (
              <div class="exec-logs-header">
                <span>Console</span>
                <span class="exec-logs-count">{logs.length}</span>
              </div>
            )}
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
        )}
      </div>
    </div>
  );
};