// ============================================================
// Runner domain types
// ============================================================

export type Screen = 'login' | 'projects' | 'execution' | 'settings';

export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
}

export type ProjectStatus = 'draft' | 'ready' | 'error';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  updated_at: string;
}

export interface Bundle {
  manifest: Record<string, unknown>;
  files: BundleFile[];
}

export interface BundleFile {
  path: string;
  content: string;
  language: string;
}

// --- Parsed bundle (US-RUN-03) ---

export interface ManifestConfig {
  name: string;
  main: string;
  ui: string;
  api?: string;
  editorType?: string[];
  networkAccess?: { allowedDomains?: string[] };
  [key: string]: unknown;
}

export interface ParsedBundle {
  manifest: ManifestConfig;
  codeJs: string;
  uiHtml: string;
  files: BundleFile[];
}

export type ExecutionStatus = 'idle' | 'loading' | 'running' | 'stopped' | 'error' | 'done';

export interface ExecutionState {
  status: ExecutionStatus;
  projectId: string | null;
  executionId: string | null;
  startedAt: number | null;
  logs: LogEntry[];
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

// --- Plugin UI state (US-RUN-05) ---

export interface PluginUIState {
  visible: boolean;
  html: string | null;
  width: number;
  height: number;
  title: string;
}

export const DEFAULT_PLUGIN_UI: PluginUIState = {
  visible: false,
  html: null,
  width: 300,
  height: 400,
  title: '',
};

export interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  debugMode: boolean;
  autoReconnect: boolean;
}