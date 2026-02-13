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

const MAX_LOGS_PER_EXECUTION = 1000;

let originalLog: typeof console.log | null = null;
let originalWarn: typeof console.warn | null = null;
let originalError: typeof console.error | null = null;
let isOverridden = false;
let logCount = 0;
let capReached = false;

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

function extractStack(args: unknown[]): string | undefined {
  for (const a of args) {
    if (a instanceof Error && a.stack) {
      return a.stack;
    }
  }
  return undefined;
}

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

export function override(callback: LogCallback): void {
  if (isOverridden) return;

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

export function getLogCount(): number {
  return logCount;
}
