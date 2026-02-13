// ============================================================
// proxy-fetch.ts - US-RUN-07: UI-side proxy fetch handler
//
// Receives PROXY_FETCH_REQUEST from code.js, executes the fetch
// through the Supabase proxy edge function, returns the response
// as PROXY_FETCH_RESPONSE payload.
//
// Runs in ui.html (has real fetch, DOM, window).
// ============================================================

import { getSupabase } from './supabase';

const PROXY_EDGE_FUNCTION = '/functions/v1/proxy';

// --- Types ---

export interface ProxyFetchRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ProxyFetchResponse {
  requestId: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
  error?: string;
}

// ============================================================
// Public API
// ============================================================

/**
 * Execute a proxy fetch request via the Supabase proxy edge function.
 *
 * Flow:
 *   1. Get user JWT from Supabase auth session
 *   2. POST to proxy edge function with {target_url, method, headers, body}
 *   3. Return the response in a standardized format
 *
 * The proxy edge function handles domain whitelisting and forwards
 * the request to the target URL.
 */
export async function executeProxyFetch(
  request: ProxyFetchRequest,
  supabaseUrl: string,
): Promise<ProxyFetchResponse> {
  try {
    // Get auth token for proxy authentication
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return errorResponse(request.requestId, 'No auth session \u2014 cannot proxy fetch');
    }

    const proxyUrl = `${supabaseUrl}${PROXY_EDGE_FUNCTION}`;

    // Build proxy payload
    const proxyPayload: Record<string, unknown> = {
      target_url: request.url,
      method: request.method,
      headers: request.headers,
    };

    // Parse body: if it's valid JSON, send as object; otherwise as string
    if (request.body != null) {
      proxyPayload.body = tryParseJSON(request.body);
    }

    // Call the proxy edge function
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyPayload),
    });

    // Read response body as text
    const responseBody = await response.text();

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      requestId: request.requestId,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[proxy-fetch-ui] Error for ${request.method} ${request.url}: ${message}`);
    return errorResponse(request.requestId, message);
  }
}

// --- Helpers ---

function errorResponse(requestId: string, error: string): ProxyFetchResponse {
  return {
    requestId,
    ok: false,
    status: 0,
    statusText: '',
    headers: {},
    body: null,
    error,
  };
}

function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
