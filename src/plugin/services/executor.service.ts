// ============================================================
// executor.service.ts - Dynamic plugin execution (US-RUN-04)
// Runs in code.js sandbox: has figma.* API, NO DOM, NO fetch
// ============================================================

import * as consoleService from './console.service';
import type { CapturedLog } from './console.service';
import type { PluginMessage } from '../types/messages.types';

const EXECUTION_TIMEOUT_MS = 60_000; // 60 seconds

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
 * - Wraps code in new Function() with try/catch
 * - Enforces 60s timeout
 * - Cleans up after execution
 */
export function execute(
  codeJs: string,
  projectId: string,
  callbacks: ExecutorCallbacks,
): void {
  // Prevent concurrent executions
  if (currentExecutionId) {
    callbacks.sendToUI({
      type: 'EXECUTION_ERROR',
      payload: {
        executionId: currentExecutionId,
        message: 'Une execution est deja en cours',
      },
    });
    return;
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
      },
    });
  });

  // Set timeout (60s max)
  timeoutHandle = setTimeout(() => {
    if (currentExecutionId === executionId && !aborted) {
      aborted = true;
      cleanup();
      callbacks.sendToUI({
        type: 'EXECUTION_ERROR',
        payload: {
          executionId,
          message: `Timeout: execution interrompue apres ${EXECUTION_TIMEOUT_MS / 1000}s`,
        },
      });
    }
  }, EXECUTION_TIMEOUT_MS);

  // Execute in next microtask to not block the message handler
  try {
    // Wrap code in a function to isolate scope.
    // figma.* is already global in the Figma sandbox, so the plugin code has access.
    const wrappedCode = `
      "use strict";
      try {
        ${codeJs}
      } catch (__err__) {
        throw __err__;
      }
    `;

    const execFn = new Function(wrappedCode);
    const result = execFn();

    // Handle async plugin code (returns a Promise)
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (!aborted && currentExecutionId === executionId) {
            const duration = Date.now() - startTime;
            cleanup();
            callbacks.sendToUI({
              type: 'EXECUTION_DONE',
              payload: { executionId, duration },
            });
          }
        })
        .catch((err: unknown) => {
          if (!aborted && currentExecutionId === executionId) {
            cleanup();
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
        cleanup();
        callbacks.sendToUI({
          type: 'EXECUTION_DONE',
          payload: { executionId, duration },
        });
      }
    }
  } catch (err) {
    if (!aborted && currentExecutionId === executionId) {
      cleanup();
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
  cleanup();

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

function cleanup(): void {
  consoleService.restore();
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  currentExecutionId = null;
  aborted = false;
}

function extractError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}
