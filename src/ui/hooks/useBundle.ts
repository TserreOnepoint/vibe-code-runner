// ============================================================
// useBundle.ts - Load, parse & validate project bundle (US-RUN-03)
// ============================================================

import { useState, useCallback } from 'preact/hooks';
import type { Project, BundleFile, ParsedBundle, ManifestConfig } from '../../plugin/types/runner.types';
import { getSupabase } from '../lib/supabase';
import { sendToPlugin } from './useMessaging';

interface UseBundleReturn {
  bundle: ParsedBundle | null;
  selectedProject: Project | null;
  loading: boolean;
  error: string | null;
  load: (project: Project) => Promise<boolean>;
  reset: () => void;
  clearError: () => void;
}

/**
 * Validate manifest has required fields: name, main, ui
 */
function validateManifest(raw: unknown): ManifestConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Manifest absent ou invalide');
  }
  const m = raw as Record<string, unknown>;
  const missing: string[] = [];
  if (!m.name || typeof m.name !== 'string') missing.push('name');
  if (!m.main || typeof m.main !== 'string') missing.push('main');
  if (!m.ui || typeof m.ui !== 'string') missing.push('ui');
  if (missing.length > 0) {
    throw new Error(`Manifest incomplet, champs manquants: ${missing.join(', ')}`);
  }
  return m as unknown as ManifestConfig;
}

/**
 * Extract code.js and ui.html from the file list.
 * Matching is path-based (exact or endsWith).
 */
function extractBundleFiles(files: BundleFile[]): { codeJs: string; uiHtml: string } {
  const codeFile = files.find(
    (f) => f.path === 'code.js' || f.path.endsWith('/code.js'),
  );
  const uiFile = files.find(
    (f) => f.path === 'ui.html' || f.path.endsWith('/ui.html'),
  );

  if (!codeFile) {
    throw new Error('Fichier code.js introuvable dans le bundle');
  }
  if (!uiFile) {
    throw new Error('Fichier ui.html introuvable dans le bundle');
  }
  if (!codeFile.content.trim()) {
    throw new Error('code.js est vide');
  }
  if (!uiFile.content.trim()) {
    throw new Error('ui.html est vide');
  }

  return { codeJs: codeFile.content, uiHtml: uiFile.content };
}

export function useBundle(): UseBundleReturn {
  const [bundle, setBundle] = useState<ParsedBundle | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (project: Project): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSelectedProject(project);
    setBundle(null);

    try {
      const sb = getSupabase();

      // Call the DB function get_project_bundle
      console.log('[useBundle] Loading bundle for project:', project.id, project.name);
      const { data, error: rpcError } = await sb.rpc('get_project_bundle', {
        p_project_id: project.id,
      });

      if (rpcError) {
        console.error('[useBundle] RPC error:', rpcError);
        throw new Error(`Erreur chargement bundle: ${rpcError.message}`);
      }

      if (!data) {
        console.error('[useBundle] RPC returned null/undefined data');
        throw new Error('Bundle vide retourne par le serveur');
      }

      // Debug: log raw response
      console.log('[useBundle] Raw data type:', typeof data);
      console.log('[useBundle] Raw data:', JSON.stringify(data, null, 2).slice(0, 2000));

      const raw = typeof data === 'string' ? JSON.parse(data) : data;

      console.log('[useBundle] Parsed raw keys:', Object.keys(raw));
      console.log('[useBundle] raw.manifest:', raw.manifest);
      console.log('[useBundle] raw.project:', raw.project);
      console.log('[useBundle] raw.files (count):', Array.isArray(raw.files) ? raw.files.length : typeof raw.files);

      // Try to find the manifest in the response
      // Could be raw.manifest, raw.project.manifest_config, or raw.project.manifest
      let manifestData = raw.manifest;
      if (!manifestData && raw.project) {
        console.log('[useBundle] raw.project keys:', Object.keys(raw.project));
        if (raw.project.manifest_config) {
          console.log('[useBundle] Found manifest at raw.project.manifest_config');
          manifestData = raw.project.manifest_config;
        } else if (raw.project.manifest) {
          console.log('[useBundle] Found manifest at raw.project.manifest');
          manifestData = raw.project.manifest;
        }
      }
      console.log('[useBundle] Resolved manifestData:', manifestData);

      const files: BundleFile[] = raw.files || [];
      const manifest = validateManifest(manifestData);
      const { codeJs, uiHtml } = extractBundleFiles(files);

      const parsed: ParsedBundle = { manifest, codeJs, uiHtml, files };
      setBundle(parsed);
      setLoading(false);

      // Persist last selected project in figma.clientStorage
      sendToPlugin({
        type: 'STORE_LAST_PROJECT',
        payload: { projectId: project.id },
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur reseau';
      setError(message);
      setLoading(false);
      setSelectedProject(null);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setBundle(null);
    setSelectedProject(null);
    setError(null);
    setLoading(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { bundle, selectedProject, loading, error, load, reset, clearError };
}
