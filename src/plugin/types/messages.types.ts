// ============================================================
// Message contracts between code.js (plugin) and ui.html (UI)
// ============================================================

// --- UI -> Plugin (messages sent from ui.html to code.js) ---

export type UIMessage =
  | { type: 'STORE_AUTH'; payload: AuthPayload }
  | { type: 'CLEAR_AUTH' }
  | { type: 'GET_STORED_AUTH' }
  | { type: 'STORE_SETTING'; payload: { key: string; value: unknown } }
  | { type: 'GET_SETTINGS' };

export interface AuthPayload {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
  };
}

// --- Plugin -> UI (messages sent from code.js to ui.html) ---

export type PluginMessage =
  | { type: 'AUTH_RESTORED'; payload: AuthPayload }
  | { type: 'AUTH_EMPTY' }
  | { type: 'AUTH_STORED' }
  | { type: 'AUTH_CLEARED' }
  | { type: 'SETTINGS_DATA'; payload: RunnerSettings }
  | { type: 'SETTING_STORED' }
  | { type: 'ERROR'; payload: { message: string; source: string } };

// --- Settings ---

export interface RunnerSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  debugMode: boolean;
  autoReconnect: boolean;
}

export const DEFAULT_SETTINGS: RunnerSettings = {
  supabaseUrl: 'https://qpmttafobnkargxmkorw.supabase.co',
  supabaseAnonKey: '',
  debugMode: false,
  autoReconnect: true,
};
