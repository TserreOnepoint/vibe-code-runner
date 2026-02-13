// ============================================================
// Execution.tsx - US-RUN-04/05 : execution screen
// ============================================================

import { h, FunctionalComponent } from 'preact';
import type { Ref } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ExecutionStatus, LogEntry, ParsedBundle, Project, PluginUIState } from '../../plugin/types/runner.types';
import { sendToPlugin } from '../hooks/useMessaging';
import { ErrorBanner } from './ErrorBanner';

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
  idle: 'Pret', loading: 'Demarrage...', running: 'En cours',
  stopped: 'Arrete', error: 'Erreur', done: 'Termine',
};
const STATUS_COLORS: Record<ExecutionStatus, string> = {
  idle: 'var(--color-text-muted)', loading: 'var(--color-warning)',
  running: 'var(--color-success)', stopped: 'var(--color-warning)',
  error: 'var(--color-error)', done: 'var(--color-success)',
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
}

const LOG_LEVEL_COLORS: Record<string, string> = { info: 'var(--color-text)', warn: 'var(--color-warning)', error: 'var(--color-error)' };
const LOG_LEVEL_LABELS: Record<string, string> = { info: 'LOG', warn: 'WRN', error: 'ERR' };
const SOURCE_LABELS: Record<string, string> = { console: '', error: 'ERR', unhandled: 'UNC' };

const TerminalIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>);
const ArrowLeftIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>);
const RefreshIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>);
const StopIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>);
const XIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
const PlayIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>);

export const Execution: FunctionalComponent<Props> = ({ project, bundle, status, executionId, logs, duration, error, pluginUI, pluginIframeRef, onExecute, onStop, onReset, onBack }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const hasPluginUI = pluginUI.html !== null && pluginUI.visible;
  const isRunning = status === 'running' || status === 'loading';
  const canExecute = status === 'idle' || status === 'done' || status === 'error' || status === 'stopped';

  useEffect(() => { if (overlayOpen) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs.length, overlayOpen]);

  useEffect(() => {
    if (!hasPluginUI) return;
    const handleIframeMessage = (event: MessageEvent) => {
      const iframe = pluginIframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const pluginMessage = event.data?.pluginMessage;
      if (pluginMessage !== undefined && executionId) sendToPlugin({ type: 'PLUGIN_UI_MESSAGE', payload: { executionId, data: pluginMessage } });
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [hasPluginUI, executionId, pluginIframeRef]);

  useEffect(() => { if (status === 'idle') setOverlayOpen(false); }, [status]);
  const handleReload = useCallback(() => { setOverlayOpen(false); onExecute(); }, [onExecute]);
  const handleBack = useCallback(() => { setOverlayOpen(false); onBack(); }, [onBack]);

  const renderLogs = () => (<div class="exec-overlay-logs">{logs.length === 0 ? (<div class="exec-logs-empty">Aucun log.</div>) : (logs.map((log, i) => (<div key={i} class="exec-log-entry" style={{ color: LOG_LEVEL_COLORS[log.level] }}><span class="exec-log-time">{formatTimestamp(log.timestamp)}</span><span class="exec-log-level">{LOG_LEVEL_LABELS[log.level]}</span>{log.source && log.source !== 'console' && (<span class="exec-log-source">{SOURCE_LABELS[log.source]}</span>)}<span class="exec-log-msg">{log.message}{log.stackTrace && <div class="exec-log-stack">{log.stackTrace}</div>}</span></div>)))}<div ref={logsEndRef} /></div>);

  const renderOverlay = () => (<div class="exec-overlay-backdrop" onClick={() => setOverlayOpen(false)}><div class="exec-overlay-panel" onClick={(e: Event) => e.stopPropagation()}><div class="exec-overlay-header"><div class="exec-overlay-title"><span class="exec-overlay-project">{project.name}</span><div class="exec-overlay-status"><span class="exec-status-dot" style={{ background: STATUS_COLORS[status], boxShadow: isRunning ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }} /><span style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>{duration !== null && duration >= 0 && <span class="exec-overlay-duration">{formatDuration(duration)}</span>}</div></div><button class="exec-overlay-close" onClick={() => setOverlayOpen(false)} title="Fermer"><XIcon /></button></div>{error && <div style={{ padding: '0 var(--space-md)' }}><ErrorBanner message={error} onDismiss={onReset} /></div>}<div class="exec-overlay-console-header"><span>Console</span><span class="exec-overlay-log-count">{logs.length}</span></div>{renderLogs()}<div class="exec-overlay-actions"><button class="exec-overlay-btn exec-overlay-btn-back" onClick={handleBack} disabled={isRunning} title="Retour projets"><ArrowLeftIcon /><span>Projets</span></button>{canExecute && <button class="exec-overlay-btn exec-overlay-btn-reload" onClick={handleReload} title="Recharger le plugin"><RefreshIcon /><span>Recharger</span></button>}{isRunning && <button class="exec-overlay-btn exec-overlay-btn-stop" onClick={onStop} title="Arreter"><StopIcon /><span>Arreter</span></button>}</div></div></div>);

  if (hasPluginUI) {
    return (<div class="exec-fullscreen"><div class="exec-iframe-wrapper"><iframe ref={pluginIframeRef} class="exec-plugin-iframe" srcDoc={pluginUI.html!} sandbox="allow-scripts allow-forms" style={{ width: `${pluginUI.width}px`, height: `${pluginUI.height}px` }} title={pluginUI.title || 'Plugin UI'} /></div><button class={`exec-fab ${overlayOpen ? 'exec-fab-active' : ''}`} onClick={() => setOverlayOpen(!overlayOpen)} title="Console & controles"><TerminalIcon />{logs.length > 0 && !overlayOpen && <span class="exec-fab-badge">{logs.length > 99 ? '99+' : logs.length}</span>}</button>{overlayOpen && renderOverlay()}</div>);
  }

  return (<div class="screen" style={{ gap: 0, padding: 0 }}><div style={{ padding: 'var(--space-lg)' }}><div class="exec-top-row" style={{ marginBottom: 'var(--space-md)' }}><button class="btn btn-ghost" onClick={onBack} disabled={isRunning}>&larr;</button><div style={{ flex: 1, minWidth: 0 }}><div class="screen-title" style={{ fontSize: 'var(--font-size-lg)', marginBottom: 0 }}>{project.name}</div><div class="screen-subtitle">{bundle.files.length} fichier{bundle.files.length > 1 ? 's' : ''} &middot; {bundle.manifest.name}</div></div></div><div class="exec-status-bar"><div class="exec-status-indicator"><span class="exec-status-dot" style={{ background: STATUS_COLORS[status], boxShadow: isRunning ? `0 0 6px ${STATUS_COLORS[status]}` : 'none' }} /><span style={{ color: STATUS_COLORS[status], fontWeight: 500 }}>{STATUS_LABELS[status]}</span></div>{duration !== null && duration >= 0 && <span class="exec-duration">{formatDuration(duration)}</span>}{executionId && <span class="exec-id" title={executionId}>{executionId.slice(0, 8)}</span>}</div>{error && <ErrorBanner message={error} onDismiss={onReset} />}<div class="exec-actions">{canExecute && <button class="btn btn-primary btn-full" onClick={onExecute}><PlayIcon />{status === 'idle' ? 'Executer' : 'Re-executer'}</button>}{isRunning && <button class="btn btn-danger btn-full" onClick={onStop}><StopIcon />Arreter</button>}</div></div><div class="exec-console-panel"><div class="exec-logs-header"><span>Console</span><span class="exec-logs-count">{logs.length}</span></div><div class="exec-logs">{logs.length === 0 && !isRunning && <div class="exec-logs-empty">Aucun log. Lancez l'execution pour voir la sortie console.</div>}{logs.map((log, i) => (<div key={i} class="exec-log-entry" style={{ color: LOG_LEVEL_COLORS[log.level] }}><span class="exec-log-time">{formatTimestamp(log.timestamp)}</span><span class="exec-log-level">{LOG_LEVEL_LABELS[log.level]}</span>{log.source && log.source !== 'console' && <span class="exec-log-source">{SOURCE_LABELS[log.source]}</span>}<span class="exec-log-msg">{log.message}{log.stackTrace && <div class="exec-log-stack">{log.stackTrace}</div>}</span></div>))}<div ref={logsEndRef} /></div></div></div>);
};
