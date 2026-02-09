// ============================================================
// executor.service.ts - Dynamic plugin execution (US-RUN-04/05)
// Runs in code.js sandbox: has figma.* API, NO DOM, NO fetch
// ============================================================

import * as consoleService from './console.service';
import type { CapturedLog } from './console.service';
import * as uiBridge from './ui-bridge.service';
import type { PluginMessage } from '../types/messages.types';

const EXECUTION_TIMEOUT_MS = 60_000; // 60 seconds

// Default Runner plugin window dimensions (must match controller.ts showUI call)
const RUNNER_DEFAULT_WIDTH = 360;
const RUNNER_DEFAULT_HEIGHT = 480;

// --- Active execution state ---

let currentExecutionId: string | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let aborted = false;

// --- UUID v4 generator (no crypto.randomUUID in Figma sandbox) ---

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Public API ---

export interface ExecutorCallbacks {
  sendToUI: (msg: PluginMessage) => void;
}

/**
 * Execute plugin code dynamically.
 * - Generates a unique execution_id
 * - Overrides console to capture logs
 * - Creates a figma Proxy to intercept showUI/ui.* calls (US-RUN-05)
 * - Passes proxy as `figma` parameter to new Function (shadows global)
 * - Injects __html__ for Figma build-time compatibility
 * - Enforces 60s timeout
 *
 * After synchronous/async completion, only a soft cleanup is performed
 * (console restore + timeout clear). The bridge and executionId remain
 * alive so plugin UI interactions (onmessage handlers) keep working.
 * Full cleanup happens on stop(), error, or when a new execute() is called.
 */
export function execute(
  codeJs: string,
  uiHtml: string,
  projectId: string,
  callbacks: ExecutorCallbacks,
): void {
  // If a previous execution is still registered, fully clean it up first
  if (currentExecutionId) {
    fullCleanup();
  }

  const executionId = uuidv4();
  currentExecutionId = executionId;
  aborted = false;
  const startTime = Date.now();

  // Notify UI: execution started
  callbacks.sendToUI({
    type: 'EXECUTION_STARTED',
    payload: { executionId, projectId },
  });

  // Override console to capture logs
  consoleService.override((log: CapturedLog) => {
    if (aborted || currentExecutionId !== executionId) return;
    callbacks.sendToUI({
      type: 'EXECUTION_LOG',
      payload: {
        executionId,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
        source: log.source,
        stackTrace: log.stackTrace,
      },
    });
  });

  // Create figma Proxy (US-RUN-05): intercepts showUI, ui.postMessage, ui.onmessage, etc.
  // Passed as parameter to new Function('figma', code) to shadow the global without touching it.
  const figmaProxy = uiBridge.createFigmaProxy({
    sendToUI: callbacks.sendToUI,
    getExecutionId: () => currentExecutionId,
    onResizeRunner: (width: number, height: number) => {
      // Resize the real Runner plugin window to match the loaded plugin's UI dimensions
      try {
        figma.ui.resize(width, height);
      } catch (e) {
        // Ignore resize errors (e.g. if running outside Figma)
      }
    },
    onClosePlugin: () => {
      // Plugin called figma.closePlugin() \u2014 end the execution gracefully
      if (currentExecutionId === executionId && !aborted) {
        const duration = Date.now() - startTime;
        // Send UI close first, then done
        callbacks.sendToUI({
          type: 'PLUGIN_UI_CLOSE',
          payload: { executionId },
        });
        fullCleanup();
        callbacks.sendToUI({
          type: 'EXECUTION_DONE',
          payload: { executionId, duration },
        });
      }
    },
  });

  // Set timeout (60s max)
  timeoutHandle = setTimeout(() => {
    if (currentExecutionId === executionId && !aborted) {
      aborted = true;
      fullCleanup();
      callbacks.sendToUI({
        type: 'EXECUTION_ERROR',
        payload: {
          executionId,
          message: `Timeout: execution interrompue apres ${EXECUTION_TIMEOUT_MS / 1000}s`,
        },
      });
    }
  }, EXECUTION_TIMEOUT_MS);

  try {
    // Inject __html__ (Figma build-time variable) so plugin code can call figma.showUI(__html__).
    // The 'figma' parameter shadows the global \u2014 plugin sees our proxy, Runner keeps the real one.
    const escapedHtml = uiHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const wrappedCode = `
      "use strict";
      var __html__ = \`${escapedHtml}\`;
      try {
        ${codeJs}
      } catch (__err__) {
        throw __err__;
      }
    `;

    // Pass figmaProxy as the 'figma' parameter \u2014 shadows global figma inside the function
    const execFn = new Function('figma', wrappedCode);
    const result = execFn(figmaProxy);

    // Handle async plugin code (returns a Promise)
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (!aborted && currentExecutionId === executionId) {
            const duration = Date.now() - startTime;
            // Soft cleanup: keep bridge alive for UI interactions
            softCleanup();
            callbacks.sendToUI({
              type: 'EXECUTION_DONE',
              payload: { executionId, duration },
            });
          }
        })
        .catch((err: unknown) => {
          if (!aborted && currentExecutionId === executionId) {
            fullCleanup();
            const { message, stack } = extractError(err);
            callbacks.sendToUI({
              type: 'EXECUTION_ERROR',
              payload: { executionId, message, stack },
            });
          }
        });
    } else {
      // Synchronous execution completed
      if (!aborted && currentExecutionId === executionId) {
        const duration = Date.now() - startTime;
        // Soft cleanup: keep bridge alive for UI interactions
        softCleanup();
        callbacks.sendToUI({
          type: 'EXECUTION_DONE',
          payload: { executionId, duration },
        });
      }
    }
  } catch (err) {
    if (!aborted && currentExecutionId === executionId) {
      fullCleanup();
      const { message, stack } = extractError(err);
      callbacks.sendToUI({
        type: 'EXECUTION_ERROR',
        payload: { executionId, message, stack },
      });
    }
  }
}

/**
 * Stop the current execution.
 * Sets the abort flag so no further logs/events are emitted.
 */
export function stop(callbacks: ExecutorCallbacks): void {
  if (!currentExecutionId) return;

  const executionId = currentExecutionId;
  aborted = true;
  fullCleanup();

  callbacks.sendToUI({
    type: 'EXECUTION_DONE',
    payload: { executionId, duration: -1 }, // -1 signals manual stop
  });
}

/**
 * Check if an execution is currently running.
 */
export function isRunning(): boolean {
  return currentExecutionId !== null;
}

/**
 * Get current execution ID (or null).
 */
export function getExecutionId(): string | null {
  return currentExecutionId;
}

// --- Internal helpers ---

/**
 * Soft cleanup: restore console + clear timeout only.
 * Keeps bridge and executionId alive so plugin UI handlers keep working.
 */
function softCleanup(): void {
  consoleService.restore();
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

/**
 * Full cleanup: soft cleanup + reset bridge + clear execution state.
 * Used on stop, error, timeout, closePlugin, or before a new execution.
 */
function fullCleanup(): void {
  softCleanup();
  uiBridge.reset();
  currentExecutionId = null;
  aborted = false;
}

function extractError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}
