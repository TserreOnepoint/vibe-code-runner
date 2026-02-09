// ============================================================
// console.service.ts - Override console.log/warn/error to capture logs
// US-RUN-06: cap at MAX_LOGS per execution, stack traces for errors
// Runs in code.js sandbox (no DOM, no fetch)
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error';

export interface CapturedLog {
  level: LogLevel;
  message: string;
  timestamp: number;
  source: 'console' | 'error' | 'unhandled';
  stackTrace?: string;
}

type LogCallback = (log: CapturedLog) => void;

// Max logs per execution to prevent spam
const MAX_LOGS_PER_EXECUTION = 1000;

// Original console methods (saved before override)
let originalLog: typeof console.log | null = null;
let originalWarn: typeof console.warn | null = null;
let originalError: typeof console.error | null = null;
let isOverridden = false;
let logCount = 0;
let capReached = false;

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
 * Extract stack trace from an Error-like argument.
 */
function extractStack(args: unknown[]): string | undefined {
  for (const a of args) {
    if (a instanceof Error && a.stack) {
      return a.stack;
    }
  }
  return undefined;
}

/**
 * Check if we've hit the log cap. If so, emit one final warning.
 * Returns true if the cap has been reached (caller should skip the log).
 */
function checkCap(callback: LogCallback): boolean {
  if (capReached) return true;
  if (logCount >= MAX_LOGS_PER_EXECUTION) {
    capReached = true;
    callback({
      level: 'warn',
      message: `[Runner] Limite de ${MAX_LOGS_PER_EXECUTION} logs atteinte \u2014 logs suivants ignores.`,
      timestamp: Date.now(),
      source: 'console',
    });
    return true;
  }
  return false;
}

/**
 * Override console.log/warn/error to intercept logs.
 * Each intercepted call:
 * 1. Calls the original console method (so logs still appear in devtools)
 * 2. Invokes the callback with a structured CapturedLog
 *
 * Enforces MAX_LOGS_PER_EXECUTION cap per execution session.
 */
export function override(callback: LogCallback): void {
  if (isOverridden) return;

  // Reset counter for new execution
  logCount = 0;
  capReached = false;

  originalLog = console.log;
  originalWarn = console.warn;
  originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog?.apply(console, args);
    if (checkCap(callback)) return;
    logCount++;
    callback({
      level: 'info',
      message: serialize(...args),
      timestamp: Date.now(),
      source: 'console',
    });
  };

  console.warn = (...args: unknown[]) => {
    originalWarn?.apply(console, args);
    if (checkCap(callback)) return;
    logCount++;
    callback({
      level: 'warn',
      message: serialize(...args),
      timestamp: Date.now(),
      source: 'console',
    });
  };

  console.error = (...args: unknown[]) => {
    originalError?.apply(console, args);
    if (checkCap(callback)) return;
    logCount++;
    callback({
      level: 'error',
      message: serialize(...args),
      timestamp: Date.now(),
      source: 'console',
      stackTrace: extractStack(args),
    });
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

/**
 * Get current log count for this execution.
 */
export function getLogCount(): number {
  return logCount;
}
