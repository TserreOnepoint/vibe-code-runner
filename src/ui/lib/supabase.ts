// ============================================================
// supabase.ts - Client Supabase singleton for ui.html
// Runs in UI iframe: has fetch, DOM, window
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Initialize or re-initialize the Supabase client.
 * Called on boot with settings from code.js, or with defaults.
 */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: false,       // We persist via figma.clientStorage, not localStorage
      autoRefreshToken: false,     // Manual refresh via auto-reconnect flow
    },
  });
  return client;
}

/**
 * Get the current Supabase client instance.
 * Throws if not initialized.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  return client;
}

/**
 * Set an existing session on the client (for auto-reconnect).
 */
export async function setSession(accessToken: string, refreshToken: string): Promise<boolean> {
  const sb = getSupabase();
  const { error } = await sb.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    console.error('setSession error:', error.message);
    return false;
  }
  return true;
}
