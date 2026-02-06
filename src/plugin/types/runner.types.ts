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

export interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  debugMode: boolean;
  autoReconnect: boolean;
}
