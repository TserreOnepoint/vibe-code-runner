// ============================================================
// logs-streamer.ts - US-RUN-06: Log capture & forwarding to Supabase
//
// Runs in ui.html (has fetch, DOM, window).
// ============================================================

import { getSupabase } from './supabase';
import type { LogEntry } from '../../plugin/types/runner.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 50;

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

interface LogsStreamEntry {
  level: string;
  message: string;
  execution_id: string;
  timestamp: string;
  stack_trace: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export function startStream(config: StreamConfig): void {
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

  flushTimer = setInterval(() => {
    flushBuffer().catch((err) => {
      console.warn('[logs-streamer] Flush error:', err);
    });
  }, FLUSH_INTERVAL_MS);
}

export function pushLog(log: LogEntry): void {
  if (!streamConfig) return;

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
      // Non-critical
    }
  }

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

export async function stopStream(): Promise<void> {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (buffer.length > 0 && streamConfig) {
    try {
      await flushBuffer();
    } catch (err) {
      console.warn('[logs-streamer] Final flush error:', err);
    }
  }

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

export function isStreaming(): boolean {
  return streamConfig !== null;
}

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0 || !streamConfig) return;

  const toFlush = buffer.splice(0);

  for (let i = 0; i < toFlush.length; i += MAX_BATCH_SIZE) {
    const batch = toFlush.slice(i, i + MAX_BATCH_SIZE);
    await sendBatch(batch);
  }
}

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
