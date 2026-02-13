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

export async function executeProxyFetch(
  request: ProxyFetchRequest,
  supabaseUrl: string,
): Promise<ProxyFetchResponse> {
  try {
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return errorResponse(request.requestId, 'No auth session \u2014 cannot proxy fetch');
    }

    const proxyUrl = `${supabaseUrl}${PROXY_EDGE_FUNCTION}`;

    const proxyPayload: Record<string, unknown> = {
      target_url: request.url,
      method: request.method,
      headers: request.headers,
    };

    if (request.body != null) {
      proxyPayload.body = tryParseJSON(request.body);
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyPayload),
    });

    const rawBody = await response.text();
    let envelope: any = null;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      // Not JSON
    }

    if (envelope && envelope.error && !('data' in envelope)) {
      return errorResponse(request.requestId, envelope.error);
    }

    if (envelope && typeof envelope === 'object' && 'data' in envelope) {
      const targetStatus = (envelope.status as number) || response.status;
      const targetOk = targetStatus >= 200 && targetStatus < 300;
      const targetHeaders = (envelope.headers || {}) as Record<string, string>;
      const targetBody = typeof envelope.data === 'string'
        ? envelope.data
        : JSON.stringify(envelope.data);

      return {
        requestId: request.requestId,
        ok: targetOk,
        status: targetStatus,
        statusText: targetOk ? 'OK' : `HTTP ${targetStatus}`,
        headers: targetHeaders,
        body: targetBody,
      };
    }

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
      body: rawBody,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[proxy-fetch-ui] Error for ${request.method} ${request.url}: ${message}`);
    return errorResponse(request.requestId, message);
  }
}

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
