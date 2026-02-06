// ============================================================
// supabase.ts - Client Supabase singleton for ui.html
// Runs in UI iframe: has fetch, DOM, window
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

/**
 * Initialize or re-initialize the Supabase client.
 * Idempotent: skips re-creation if url+key haven't changed.
 */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (client && currentUrl === url && currentKey === anonKey) {
    return client;
  }
  currentUrl = url;
  currentKey = anonKey;
  client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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
