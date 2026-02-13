// ============================================================
// executor.service.ts - Dynamic plugin execution (US-RUN-04/05)
// Runs in code.js sandbox: has figma.* API, NO DOM, NO fetch
// ============================================================

import * as consoleService from './console.service';
import type { CapturedLog } from './console.service';
import * as uiBridge from './ui-bridge.service';
import * as proxyFetchService from './proxy-fetch.service';
import type { PluginMessage } from '../types/messages.types';

const EXECUTION_TIMEOUT_MS = 60_000;

const RUNNER_DEFAULT_WIDTH = 360;
const RUNNER_DEFAULT_HEIGHT = 480;

let currentExecutionId: string | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let aborted = false;

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ExecutorCallbacks {
  sendToUI: (msg: PluginMessage) => void;
}

export function execute(
  codeJs: string,
  uiHtml: string,
  projectId: string,
  callbacks: ExecutorCallbacks,
): void {
  if (currentExecutionId) {
    fullCleanup();
  }

  const executionId = uuidv4();
  currentExecutionId = executionId;
  aborted = false;
  const startTime = Date.now();

  callbacks.sendToUI({
    type: 'EXECUTION_STARTED',
    payload: { executionId, projectId },
  });

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

  const figmaProxy = uiBridge.createFigmaProxy({
    sendToUI: callbacks.sendToUI,
    getExecutionId: () => currentExecutionId,
    onResizeRunner: (width: number, height: number) => {
      try {
        figma.ui.resize(width, height);
      } catch (e) {
        // Ignore resize errors
      }
    },
    onClosePlugin: () => {
      if (currentExecutionId === executionId && !aborted) {
        const duration = Date.now() - startTime;
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

  const proxyFetch = proxyFetchService.createProxyFetch({
    sendToUI: callbacks.sendToUI,
    getExecutionId: () => currentExecutionId,
  });

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

    const execFn = new Function('figma', 'fetch', wrappedCode);
    const result = execFn(figmaProxy, proxyFetch);

    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (!aborted && currentExecutionId === executionId) {
            const duration = Date.now() - startTime;
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
      if (!aborted && currentExecutionId === executionId) {
        const duration = Date.now() - startTime;
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

export function stop(callbacks: ExecutorCallbacks): void {
  if (!currentExecutionId) return;

  const executionId = currentExecutionId;
  aborted = true;
  fullCleanup();

  callbacks.sendToUI({
    type: 'EXECUTION_DONE',
    payload: { executionId, duration: -1 },
  });
}

export function isRunning(): boolean {
  return currentExecutionId !== null;
}

export function getExecutionId(): string | null {
  return currentExecutionId;
}

function softCleanup(): void {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

function fullCleanup(): void {
  consoleService.restore();
  softCleanup();
  uiBridge.reset();
  proxyFetchService.cleanup();
  currentExecutionId = null;
  aborted = false;
}

function extractError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}
