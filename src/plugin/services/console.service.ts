// ============================================================
// console.service.ts - Override console.log/warn/error to capture logs
// Runs in code.js sandbox (no DOM, no fetch)
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error';

export interface CapturedLog {
  level: LogLevel;
  message: string;
  timestamp: number;
}

type LogCallback = (log: CapturedLog) => void;

// Original console methods (saved before override)
let originalLog: typeof console.log | null = null;
let originalWarn: typeof console.warn | null = null;
let originalError: typeof console.error | null = null;
let isOverridden = false;

/**
 * Serialize arguments to a single string (like console does).
 */
function serialize(...args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/**
 * Override console.log/warn/error to intercept logs.
 * Each intercepted call:
 * 1. Calls the original console method (so logs still appear in devtools)
 * 2. Invokes the callback with a structured CapturedLog
 */
export function override(callback: LogCallback): void {
  if (isOverridden) return;

  originalLog = console.log;
  originalWarn = console.warn;
  originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog?.apply(console, args);
    callback({ level: 'info', message: serialize(...args), timestamp: Date.now() });
  };

  console.warn = (...args: unknown[]) => {
    originalWarn?.apply(console, args);
    callback({ level: 'warn', message: serialize(...args), timestamp: Date.now() });
  };

  console.error = (...args: unknown[]) => {
    originalError?.apply(console, args);
    callback({ level: 'error', message: serialize(...args), timestamp: Date.now() });
  };

  isOverridden = true;
}

/**
 * Restore original console methods.
 */
export function restore(): void {
  if (!isOverridden) return;

  if (originalLog) console.log = originalLog;
  if (originalWarn) console.warn = originalWarn;
  if (originalError) console.error = originalError;

  originalLog = null;
  originalWarn = null;
  originalError = null;
  isOverridden = false;
}
