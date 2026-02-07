// ============================================================
// ui-bridge.service.ts - Figma API proxy for loaded plugins (US-RUN-05)
//
// Creates a Proxy around the real `figma` global that intercepts:
//   - figma.showUI(html, opts) → validates HTML, sends PLUGIN_SHOW_UI
//   - figma.ui.postMessage(data) → sends PLUGIN_UI_POST_MESSAGE
//   - figma.ui.onmessage = handler → captures plugin's handler
//   - figma.ui.resize(w, h) → sends PLUGIN_UI_RESIZE
//   - figma.ui.close() → sends PLUGIN_UI_CLOSE
//
// The proxy is passed as a parameter to `new Function('figma', code)`,
// shadowing the global `figma` ONLY within plugin code. The real `figma`
// global remains untouched — the Runner's controller continues to use it
// for its own messages (EXECUTION_LOG, EXECUTION_DONE, etc.).
//
// Runs in code.js sandbox (no DOM, no fetch).
// ============================================================

import type { PluginMessage } from '../types/messages.types';

const MAX_HTML_SIZE = 1_000_000; // 1MB

export interface UIBridgeCallbacks {
  sendToUI: (msg: PluginMessage) => void;
  getExecutionId: () => string | null;
}

// Plugin's registered onmessage handler (captured via proxy setter)
let pluginOnMessageHandler: ((msg: unknown, props?: unknown) => void) | null = null;

/**
 * Create a Proxy of the global `figma` object.
 * Intercepts UI-related calls; everything else passes through transparently.
 */
export function createFigmaProxy(callbacks: UIBridgeCallbacks): typeof figma {
  pluginOnMessageHandler = null;

  // --- Proxy for figma.ui ---

  const uiProxy = new Proxy(figma.ui, {
    get(target, prop, receiver) {
      // figma.ui.postMessage → route to Runner UI → plugin iframe
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

      // figma.ui.resize → notify Runner UI
      if (prop === 'resize') {
        return (width: number, height: number) => {
          const executionId = callbacks.getExecutionId();
          if (!executionId) return;
          callbacks.sendToUI({
            type: 'PLUGIN_UI_RESIZE',
            payload: { executionId, width, height },
          });
        };
      }

      // figma.ui.close → notify Runner UI
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

      // Everything else (show, hide, reposition, etc.) → pass through
      return Reflect.get(target, prop, receiver);
    },

    set(_target, prop, value) {
      // Capture figma.ui.onmessage = handler
      if (prop === 'onmessage') {
        pluginOnMessageHandler = value;
        return true;
      }
      return Reflect.set(_target, prop, value);
    },
  });

  // --- Proxy for figma ---

  const figmaProxy = new Proxy(figma, {
    get(target, prop, receiver) {
      // figma.showUI → validate + send PLUGIN_SHOW_UI
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

          callbacks.sendToUI({
            type: 'PLUGIN_SHOW_UI',
            payload: { executionId, html, width, height, visible, title },
          });
        };
      }

      // figma.ui → return our proxy
      if (prop === 'ui') {
        return uiProxy;
      }

      // Everything else (createRectangle, currentPage, notify, closePlugin, etc.) → pass through
      const value = Reflect.get(target, prop, receiver);
      // Bind methods to the real figma so they work correctly
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });

  return figmaProxy as typeof figma;
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
 * Called during executor cleanup.
 */
export function reset(): void {
  pluginOnMessageHandler = null;
}
