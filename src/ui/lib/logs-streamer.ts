// ============================================================
// logs-streamer.ts - US-RUN-06: Log capture & forwarding to Supabase
//
// Responsibilities:
//   1. Broadcast each log to Realtime channel `project:{projectId}:logs`
//      so the web app can display them live.
//   2. Buffer logs and batch-insert into `execution_logs` table
//      every FLUSH_INTERVAL_MS (5s) or on stream end.
//
// Batch insert uses the `proxy` edge function to bypass RLS
// (execution_logs requires service_role for writes).
// If the proxy insert fails, it degrades gracefully \u2014 logs are
// still available via Realtime broadcast.
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
let buffer: ExecutionLogRow[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let streamConfig: StreamConfig | null = null;
let channelReady = false;

interface StreamConfig {
  projectId: string;
  executionId: string;
  supabaseUrl: string;
}

interface ExecutionLogRow {
  project_id: string;
  execution_id: string;
  level: string;
  message: string;
  stack_trace: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================
// Public API
// ============================================================

/**
 * Start a new log stream for an execution.
 * Opens a Realtime channel and starts the flush timer.
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
      }
    });
  } catch (err) {
    console.warn('[logs-streamer] Failed to open Realtime channel:', err);
    channel = null;
  }

  // Start periodic flush
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

  // 1. Realtime broadcast (fire and forget)
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

  // 2. Buffer for batch insert
  buffer.push({
    project_id: streamConfig.projectId,
    execution_id: streamConfig.executionId,
    level: log.level,
    message: log.message,
    stack_trace: log.stackTrace || null,
    source: log.source || 'console',
    metadata: null,
    created_at: new Date(log.timestamp).toISOString(),
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
// Internal: batch insert via proxy edge function
// ============================================================

/**
 * Flush buffered logs to execution_logs table via the proxy edge function.
 * The proxy runs server-side with service_role access, bypassing RLS.
 *
 * If the proxy call fails, logs are lost from persistence but remain
 * available in the UI and via Realtime broadcast.
 */
async function flushBuffer(): Promise<void> {
  if (buffer.length === 0 || !streamConfig) return;

  // Take current buffer and reset
  const toFlush = buffer.splice(0);

  // Split into batches
  for (let i = 0; i < toFlush.length; i += MAX_BATCH_SIZE) {
    const batch = toFlush.slice(i, i + MAX_BATCH_SIZE);
    await insertBatch(batch);
  }
}

/**
 * Insert a batch of logs via the proxy edge function.
 */
async function insertBatch(rows: ExecutionLogRow[]): Promise<void> {
  if (!streamConfig || rows.length === 0) return;

  try {
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      console.warn('[logs-streamer] No access token, skipping batch insert');
      return;
    }

    // Use proxy edge function to insert with service_role privileges
    const response = await fetch(`${streamConfig.supabaseUrl}/functions/v1/proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target_url: `${streamConfig.supabaseUrl}/rest/v1/execution_logs`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(rows),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`[logs-streamer] Proxy insert failed (${response.status}): ${text}`);
    }
  } catch (err) {
    console.warn('[logs-streamer] Batch insert error:', err);
  }
}
