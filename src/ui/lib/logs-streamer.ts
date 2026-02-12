// ============================================================
// logs-streamer.ts - US-RUN-06: Log capture & forwarding to Supabase
//
// Responsibilities:
//   1. Broadcast each log to Realtime channel `project:{projectId}:logs`
//      so the web app can display them live (immediate, fire-and-forget).
//   2. Buffer logs and batch-insert into `execution_logs` table
//      every FLUSH_INTERVAL_MS via the `logs-stream` edge function.
//
// The `logs-stream` edge function runs with service_role and handles:
//   - Validation, rate limiting
//   - Persistence in execution_logs (bypasses RLS)
//   - Server-side broadcast (event: 'log') as backup
//
// Direct Realtime broadcast (event: 'execution_log') provides
// immediate delivery; the edge function batch provides persistence.
//
// Runs in ui.html (has fetch, DOM, window).
// ============================================================

import { getSupabase } from './supabase';
import type { LogEntry } from '../../plugin/types/runner.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// --- Constants ---

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 50;

// --- State ---

let channel: RealtimeChannel | null = null;
let buffer: LogsStreamEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let streamConfig: StreamConfig | null = null;
let channelReady = false;

interface StreamConfig {
  projectId: string;
  executionId: string;
  supabaseUrl: string;
}

/** Format expected by the logs-stream edge function */
interface LogsStreamEntry {
  level: string;
  message: string;
  execution_id: string;
  timestamp: string; // ISO string
  stack_trace: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Start a new log stream for an execution.
 * Opens a Realtime channel for immediate broadcast and starts the flush timer.
 */
export function startStream(config: StreamConfig): void {
  // Clean up any previous stream
  stopStream();

  streamConfig = config;
  buffer = [];
  channelReady = false;

  try {
    const sb = getSupabase();
    const channelName = `project:${config.projectId}:logs`;

    channel = sb.channel(channelName);
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channelReady = true;
        console.log(`[logs-streamer] Channel ${channelName} subscribed`);
      }
    });
  } catch (err) {
    console.warn('[logs-streamer] Failed to open Realtime channel:', err);
    channel = null;
  }

  // Start periodic flush via logs-stream edge function
  flushTimer = setInterval(() => {
    flushBuffer().catch((err) => {
      console.warn('[logs-streamer] Flush error:', err);
    });
  }, FLUSH_INTERVAL_MS);
}

/**
 * Push a log entry: broadcast via Realtime + buffer for batch insert.
 */
export function pushLog(log: LogEntry): void {
  if (!streamConfig) return;

  // 1. Realtime broadcast — immediate delivery (fire and forget)
  if (channel && channelReady) {
    try {
      channel.send({
        type: 'broadcast',
        event: 'execution_log',
        payload: {
          execution_id: streamConfig.executionId,
          project_id: streamConfig.projectId,
          level: log.level,
          message: log.message,
          timestamp: log.timestamp,
          source: log.source || 'console',
          stack_trace: log.stackTrace || null,
        },
      });
    } catch {
      // Non-critical: Realtime broadcast failure is silent
    }
  }

  // 2. Buffer for batch insert via logs-stream edge function
  buffer.push({
    level: log.level,
    message: log.message,
    execution_id: streamConfig.executionId,
    timestamp: new Date(log.timestamp).toISOString(),
    stack_trace: log.stackTrace || null,
    source: log.source || 'console',
    metadata: null,
  });
}

/**
 * Stop the stream: flush remaining buffer, unsubscribe channel, clear timer.
 */
export async function stopStream(): Promise<void> {
  // Clear timer first
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Final flush
  if (buffer.length > 0 && streamConfig) {
    try {
      await flushBuffer();
    } catch (err) {
      console.warn('[logs-streamer] Final flush error:', err);
    }
  }

  // Unsubscribe channel
  if (channel) {
    try {
      const sb = getSupabase();
      sb.removeChannel(channel);
    } catch {
      // Ignore cleanup errors
    }
    channel = null;
    channelReady = false;
  }

  streamConfig = null;
  buffer = [];
}

/**
 * Check if a stream is currently active.
 */
export function isStreaming(): boolean {
  return streamConfig !== null;
}

// ============================================================
// Internal: batch insert via logs-stream edge function
// ============================================================

/**
 * Flush buffered logs via the `logs-stream` edge function.
 * The edge function runs with service_role, handling:
 *   - Persistence in execution_logs (bypasses RLS)
 *   - Server-side broadcast on `project:{projectId}:logs` (event: 'log')
 *   - Validation and rate limiting
 *
 * If the call fails, logs are lost from persistence but remain
 * available in the UI and via direct Realtime broadcast.
 */
async function flushBuffer(): Promise<void> {
  if (buffer.length === 0 || !streamConfig) return;

  // Take current buffer and reset
  const toFlush = buffer.splice(0);

  // Split into batches (logs-stream max is 100, we use 50)
  for (let i = 0; i < toFlush.length; i += MAX_BATCH_SIZE) {
    const batch = toFlush.slice(i, i + MAX_BATCH_SIZE);
    await sendBatch(batch);
  }
}

/**
 * Send a batch of logs to the logs-stream edge function.
 */
async function sendBatch(logs: LogsStreamEntry[]): Promise<void> {
  if (!streamConfig || logs.length === 0) return;

  try {
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      console.warn('[logs-streamer] No access token, skipping batch insert');
      return;
    }

    const response = await fetch(`${streamConfig.supabaseUrl}/functions/v1/logs-stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'stream_logs_batch',
        project_id: streamConfig.projectId,
        logs,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`[logs-streamer] logs-stream batch failed (${response.status}): ${text}`);
    } else {
      const result = await response.json().catch(() => null);
      if (result && !result.success) {
        console.warn('[logs-streamer] logs-stream returned error:', result.error);
      }
    }
  } catch (err) {
    console.warn('[logs-streamer] Batch send error:', err);
  }
}
