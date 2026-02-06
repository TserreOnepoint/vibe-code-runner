// ============================================================
// controller.ts - Entry point code.js
// Runs in Figma sandbox: has figma.* API, NO DOM, NO fetch
// ============================================================

import type { UIMessage, PluginMessage } from './types/messages.types';
import { DEFAULT_SETTINGS } from './types/messages.types';
import * as authService from './services/auth.service';

// --- Show UI ---

figma.showUI(__html__, { width: 360, height: 480 });

// --- Send message to UI (typesafe) ---

function sendToUI(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

// --- Boot: attempt auto-reconnect ---

async function boot(): Promise<void> {
  try {
    const stored = await authService.getStoredAuth();
    if (stored) {
      sendToUI({ type: 'AUTH_RESTORED', payload: stored });
    } else {
      sendToUI({ type: 'AUTH_EMPTY' });
    }
  } catch (err) {
    console.error('Boot error reading auth:', err);
    sendToUI({ type: 'AUTH_EMPTY' });
  }
}

// --- Message handler ---

async function handleMessage(msg: UIMessage): Promise<void> {
  try {
    switch (msg.type) {
      case 'STORE_AUTH': {
        await authService.storeAuth(msg.payload);
        sendToUI({ type: 'AUTH_STORED' });
        break;
      }

      case 'CLEAR_AUTH': {
        await authService.clearAuth();
        sendToUI({ type: 'AUTH_CLEARED' });
        break;
      }

      case 'GET_STORED_AUTH': {
        const auth = await authService.getStoredAuth();
        if (auth) {
          sendToUI({ type: 'AUTH_RESTORED', payload: auth });
        } else {
          sendToUI({ type: 'AUTH_EMPTY' });
        }
        break;
      }

      case 'STORE_SETTING': {
        await authService.storeSetting(msg.payload.key, msg.payload.value);
        sendToUI({ type: 'SETTING_STORED' });
        break;
      }

      case 'GET_SETTINGS': {
        const stored = await authService.getSettings();
        const settings = { ...DEFAULT_SETTINGS, ...stored };
        sendToUI({ type: 'SETTINGS_DATA', payload: settings });
        break;
      }

      default: {
        const _exhaustive: never = msg;
        console.warn('Unknown message type:', (_exhaustive as any).type);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Controller error:', message);
    sendToUI({
      type: 'ERROR',
      payload: { message, source: 'controller' },
    });
  }
}

// --- Listen for UI messages ---

figma.ui.onmessage = (msg: unknown) => {
  handleMessage(msg as UIMessage);
};

// --- Start ---

boot();
