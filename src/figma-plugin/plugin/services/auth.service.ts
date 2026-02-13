// ============================================================
// auth.service.ts - JWT persistence via figma.clientStorage
// Runs in code.js sandbox (no DOM, no fetch)
// ============================================================

import type { AuthPayload, RunnerSettings } from '../types/messages.types';

const STORAGE_KEY_AUTH = 'vibe_runner_auth';
const STORAGE_KEY_SETTINGS = 'vibe_runner_settings';
const STORAGE_KEY_LAST_PROJECT = 'vibe_runner_last_project';

// --- Auth ---

export async function storeAuth(payload: AuthPayload): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY_AUTH, payload);
}

export async function getStoredAuth(): Promise<AuthPayload | null> {
  const data = await figma.clientStorage.getAsync(STORAGE_KEY_AUTH);
  if (!data || !data.access_token || !data.refresh_token || !data.user) {
    return null;
  }
  return data as AuthPayload;
}

export async function clearAuth(): Promise<void> {
  await figma.clientStorage.deleteAsync(STORAGE_KEY_AUTH);
}

// --- Settings ---

export async function storeSetting(key: string, value: unknown): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, [key]: value };
  await figma.clientStorage.setAsync(STORAGE_KEY_SETTINGS, updated);
}

export async function getSettings(): Promise<Partial<RunnerSettings>> {
  const data = await figma.clientStorage.getAsync(STORAGE_KEY_SETTINGS);
  return (data as Partial<RunnerSettings>) || {};
}

// --- Last project ---

export async function storeLastProject(projectId: string): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY_LAST_PROJECT, projectId);
}

export async function getLastProject(): Promise<string | null> {
  const data = await figma.clientStorage.getAsync(STORAGE_KEY_LAST_PROJECT);
  return (data as string) || null;
}

// --- Clear all ---

export async function clearAll(): Promise<void> {
  await figma.clientStorage.deleteAsync(STORAGE_KEY_AUTH);
  await figma.clientStorage.deleteAsync(STORAGE_KEY_SETTINGS);
  await figma.clientStorage.deleteAsync(STORAGE_KEY_LAST_PROJECT);
}
