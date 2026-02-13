// ============================================================
// proxy-fetch.service.ts - US-RUN-07: Custom fetch for plugin sandbox
//
// Creates a fetch()-like function that plugins can call from code.js.
// Since code.js has NO native fetch, requests are routed through
// the Runner's message bridge:
//
//   Plugin code calls fetch(url)
//     -> code.js sends PROXY_FETCH_REQUEST to ui.html
//     -> ui.html calls proxy edge function
//     -> ui.html sends PROXY_FETCH_RESPONSE back to code.js
//     -> Promise resolves with a Response-like object
//
// Runs in code.js sandbox (no DOM, no real fetch).
// ============================================================

import type { PluginMessage } from '../types/messages.types';

const PROXY_FETCH_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (response: ProxyResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

interface ProxyFetchCallbacks {
  sendToUI: (msg: PluginMessage) => void;
  getExecutionId: () => string | null;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class ProxyResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  private _body: string | null;
  private _consumed = false;

  constructor(data: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
  }) {
    this.ok = data.ok;
    this.status = data.status;
    this.statusText = data.statusText;
    this.headers = data.headers;
    this._body = data.body;
  }

  async text(): Promise<string> {
    if (this._consumed) throw new Error('Response body already consumed');
    this._consumed = true;
    return this._body || '';
  }

  async json(): Promise<unknown> {
    if (this._consumed) throw new Error('Response body already consumed');
    this._consumed = true;
    if (!this._body) return null;
    return JSON.parse(this._body);
  }

  async blob(): Promise<{ size: number; type: string; text: string }> {
    if (this._consumed) throw new Error('Response body already consumed');
    this._consumed = true;
    const text = this._body || '';
    return {
      size: text.length,
      type: this.headers['content-type'] || 'application/octet-stream',
      text,
    };
  }

  async arrayBuffer(): Promise<never> {
    throw new Error('[proxy-fetch] arrayBuffer() not supported in Figma sandbox');
  }

  clone(): ProxyResponse {
    return new ProxyResponse({
      ok: this.ok,
      status: this.status,
      statusText: this.statusText,
      headers: { ...this.headers },
      body: this._body,
    });
  }
}

export function createProxyFetch(
  callbacks: ProxyFetchCallbacks,
): (input: string | URL, init?: RequestInit) => Promise<ProxyResponse> {
  return (input: string | URL, init?: RequestInit): Promise<ProxyResponse> => {
    const executionId = callbacks.getExecutionId();
    if (!executionId) {
      return Promise.reject(new Error('[proxy-fetch] No active execution'));
    }

    const url = typeof input === 'string' ? input : String(input);
    const method = (init?.method || 'GET').toUpperCase();

    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers as [string, string][]) {
          headers[k] = v;
        }
      } else {
        const h = init.headers as Record<string, string>;
        for (const k of Object.keys(h)) {
          headers[k] = h[k];
        }
      }
    }

    let body: string | null = null;
    if (init?.body != null) {
      body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    }

    const requestId = uuidv4();

    return new Promise<ProxyResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        console.error(`[proxy-fetch] Timeout after ${PROXY_FETCH_TIMEOUT_MS / 1000}s: ${method} ${url}`);
        reject(new Error(`Network error: timeout after ${PROXY_FETCH_TIMEOUT_MS / 1000}s for ${method} ${url}`));
      }, PROXY_FETCH_TIMEOUT_MS);

      pendingRequests.set(requestId, { resolve, reject, timer });

      console.log(`[proxy-fetch] ${method} ${url}`);

      callbacks.sendToUI({
        type: 'PROXY_FETCH_REQUEST',
        payload: { requestId, url, method, headers, body },
      });
    });
  };
}

export function resolveRequest(
  requestId: string,
  data: {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
    error?: string;
  },
): void {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingRequests.delete(requestId);

  if (data.error) {
    console.error(`[proxy-fetch] Error: ${data.error}`);
    pending.reject(new Error(`[proxy-fetch] ${data.error}`));
  } else {
    console.log(`[proxy-fetch] Response: ${data.status} ${data.statusText}`);
    pending.resolve(new ProxyResponse(data));
  }
}

export function cleanup(): void {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error('[proxy-fetch] Execution ended'));
  }
  pendingRequests.clear();
}

export function pendingCount(): number {
  return pendingRequests.size;
}
