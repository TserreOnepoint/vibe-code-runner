// ============================================================
// ui-bridge.service.ts - Figma API proxy for loaded plugins (US-RUN-05)
//
// Creates a Proxy that intercepts plugin calls to figma.showUI(),
// figma.ui.postMessage(), figma.ui.onmessage, figma.closePlugin(), etc.
// and routes them through the Runner's message system.
//
// IMPORTANT: The Proxy uses an empty object {} as its target instead
// of the real `figma` global. This avoids the "proxy: inconsistent get"
// error that occurs when the target has non-configurable, non-writable
// properties (which `figma` does in the Figma sandbox) and the get trap
// returns a different value.
//
// The proxy is passed as a parameter to `new Function('figma', code)`,
// shadowing the global `figma` ONLY within plugin code.
//
// Runs in code.js sandbox (no DOM, no fetch).
// ============================================================

import type { PluginMessage } from '../types/messages.types';

const MAX_HTML_SIZE = 1_000_000; // 1MB

export interface UIBridgeCallbacks {
  sendToUI: (msg: PluginMessage) => void;
  getExecutionId: () => string | null;
  onClosePlugin?: () => void;
  onResizeRunner?: (width: number, height: number) => void;
}

// Plugin's registered onmessage handler (captured via proxy setter)
let pluginOnMessageHandler: ((msg: unknown, props?: unknown) => void) | null = null;

/**
 * Create a Proxy that wraps the global `figma` object.
 * Uses an empty {} as target to avoid Proxy invariant violations.
 * Intercepts UI-related calls; everything else forwards to real figma.
 */
export function createFigmaProxy(callbacks: UIBridgeCallbacks): typeof figma {
  pluginOnMessageHandler = null;

  // --- Proxy for figma.ui (target = empty object) ---

  const uiProxy = new Proxy({} as typeof figma.ui, {
    get(_target, prop) {
      // figma.ui.postMessage -> route to Runner UI -> plugin iframe
      if (prop === 'postMessage') {
        return (data: unknown, _opts?: unknown) => {
          const executionId = callbacks.getExecutionId();
          if (!executionId) return;
          callbacks.sendToUI({
            type: 'PLUGIN_UI_POST_MESSAGE',
            payload: { executionId, data },
          });
        };
      }

      // figma.ui.onmessage getter
      if (prop === 'onmessage') {
        return pluginOnMessageHandler;
      }

      // figma.ui.resize -> notify Runner UI
      if (prop === 'resize') {
        return (width: number, height: number) => {
          const executionId = callbacks.getExecutionId();
          if (!executionId) return;

          // Also resize the Runner plugin window itself
          if (callbacks.onResizeRunner) {
            callbacks.onResizeRunner(width, height);
          }

          callbacks.sendToUI({
            type: 'PLUGIN_UI_RESIZE',
            payload: { executionId, width, height },
          });
        };
      }

      // figma.ui.close -> notify Runner UI
      if (prop === 'close') {
        return () => {
          const executionId = callbacks.getExecutionId();
          if (!executionId) return;
          callbacks.sendToUI({
            type: 'PLUGIN_UI_CLOSE',
            payload: { executionId },
          });
        };
      }

      // Everything else (show, hide, reposition, etc.) -> forward to real figma.ui
      const val = (figma.ui as any)[prop];
      if (typeof val === 'function') {
        return val.bind(figma.ui);
      }
      return val;
    },

    set(_target, prop, value) {
      // Capture figma.ui.onmessage = handler
      if (prop === 'onmessage') {
        pluginOnMessageHandler = value;
        return true;
      }
      (figma.ui as any)[prop] = value;
      return true;
    },
  });

  // --- Proxy for figma (target = empty object) ---

  const figmaProxy = new Proxy({} as typeof figma, {
    get(_target, prop) {
      // figma.showUI -> validate + send PLUGIN_SHOW_UI
      if (prop === 'showUI') {
        return (html: string, opts?: { width?: number; height?: number; visible?: boolean; title?: string }) => {
          const executionId = callbacks.getExecutionId();
          if (!executionId) return;

          // Validate HTML size
          if (html.length > MAX_HTML_SIZE) {
            callbacks.sendToUI({
              type: 'EXECUTION_ERROR',
              payload: {
                executionId,
                message: `HTML trop volumineux: ${(html.length / 1024).toFixed(0)}KB (max ${MAX_HTML_SIZE / 1024}KB)`,
              },
            });
            return;
          }

          // Validate HTML content (basic check)
          if (!html.trim() || (!html.includes('<') && !html.includes('>'))) {
            callbacks.sendToUI({
              type: 'EXECUTION_ERROR',
              payload: {
                executionId,
                message: 'HTML invalide: contenu vide ou sans balises',
              },
            });
            return;
          }

          const width = opts?.width ?? 300;
          const height = opts?.height ?? 400;
          const visible = opts?.visible !== false;
          const title = opts?.title ?? '';

          // Resize the Runner plugin window to match the plugin UI dimensions
          if (callbacks.onResizeRunner) {
            callbacks.onResizeRunner(width, height);
          }

          callbacks.sendToUI({
            type: 'PLUGIN_SHOW_UI',
            payload: { executionId, html, width, height, visible, title },
          });
        };
      }

      // figma.closePlugin -> intercept: do NOT close the Runner, trigger callback
      if (prop === 'closePlugin') {
        return (_message?: string) => {
          if (callbacks.onClosePlugin) {
            callbacks.onClosePlugin();
          }
          // Intentionally NOT forwarding to real figma.closePlugin()
          // — that would close the Runner itself.
        };
      }

      // figma.ui -> return our proxy
      if (prop === 'ui') {
        return uiProxy;
      }

      // Everything else (createRectangle, currentPage, notify, etc.)
      // -> forward to real figma, binding methods so `this` is correct
      const val = (figma as any)[prop];
      if (typeof val === 'function') {
        return val.bind(figma);
      }
      return val;
    },

    set(_target, prop, value) {
      (figma as any)[prop] = value;
      return true;
    },

    has(_target, prop) {
      return prop in figma;
    },
  });

  return figmaProxy;
}

/**
 * Dispatch a message from plugin UI (iframe) to the plugin's onmessage handler.
 * Called by controller.ts when it receives PLUGIN_UI_MESSAGE from Runner UI.
 */
export function dispatchToPlugin(data: unknown): void {
  if (pluginOnMessageHandler) {
    try {
      pluginOnMessageHandler(data);
    } catch (err) {
      console.error('[ui-bridge] Error in plugin onmessage handler:', err);
    }
  }
}

/**
 * Reset bridge state (clear plugin's handler reference).
 * Called during full cleanup.
 */
export function reset(): void {
  pluginOnMessageHandler = null;
}
