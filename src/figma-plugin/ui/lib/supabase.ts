// ============================================================
// supabase.ts - Client Supabase singleton for ui.html
// Runs in UI iframe: has fetch, DOM, window
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

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

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  return client;
}

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
