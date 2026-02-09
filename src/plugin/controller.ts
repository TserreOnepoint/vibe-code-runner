// ============================================================
// controller.ts - Entry point code.js
// Runs in Figma sandbox: has figma.* API, NO DOM, NO fetch
// ============================================================

import type { UIMessage, PluginMessage } from './types/messages.types';
import { DEFAULT_SETTINGS, RUNNER_DEFAULT_WIDTH, RUNNER_DEFAULT_HEIGHT } from './types/messages.types';
import * as authService from './services/auth.service';
import * as executorService from './services/executor.service';
import * as uiBridge from './services/ui-bridge.service';

// --- Show UI ---

figma.showUI(__html__, { width: RUNNER_DEFAULT_WIDTH, height: RUNNER_DEFAULT_HEIGHT });

// --- Send message to UI (typesafe) ---

function sendToUI(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

const executorCallbacks: executorService.ExecutorCallbacks = { sendToUI };

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

      case 'STORE_LAST_PROJECT': {
        await authService.storeLastProject(msg.payload.projectId);
        sendToUI({ type: 'LAST_PROJECT_STORED' });
        break;
      }

      case 'GET_LAST_PROJECT': {
        const projectId = await authService.getLastProject();
        sendToUI({ type: 'LAST_PROJECT_DATA', payload: { projectId } });
        break;
      }

      case 'EXECUTE_PLUGIN': {
        executorService.execute(
          msg.payload.codeJs,
          msg.payload.uiHtml,
          msg.payload.projectId,
          executorCallbacks,
        );
        break;
      }

      case 'STOP_EXECUTION': {
        executorService.stop(executorCallbacks);
        break;
      }

      case 'PLUGIN_UI_MESSAGE': {
        // Forward message from plugin iframe (via Runner UI) to plugin's onmessage handler
        uiBridge.dispatchToPlugin(msg.payload.data);
        break;
      }

      case 'RESTORE_RUNNER_SIZE': {
        // Restore Runner plugin window to default dimensions (called when navigating back to projects)
        figma.ui.resize(RUNNER_DEFAULT_WIDTH, RUNNER_DEFAULT_HEIGHT);
        // Clean up any lingering execution state
        if (executorService.getExecutionId()) {
          executorService.stop(executorCallbacks);
        }
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
