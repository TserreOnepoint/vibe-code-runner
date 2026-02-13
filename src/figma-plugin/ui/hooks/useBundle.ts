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

function validateManifest(raw: unknown): ManifestConfig {
  if (!raw || typeof raw !== 'object') throw new Error('Manifest absent ou invalide');
  const m = raw as Record<string, unknown>;
  const missing: string[] = [];
  if (!m.name || typeof m.name !== 'string') missing.push('name');
  if (!m.main || typeof m.main !== 'string') missing.push('main');
  if (!m.ui || typeof m.ui !== 'string') missing.push('ui');
  if (missing.length > 0) throw new Error(`Manifest incomplet, champs manquants: ${missing.join(', ')}`);
  return m as unknown as ManifestConfig;
}

function extractBundleFiles(files: BundleFile[]): { codeJs: string; uiHtml: string } {
  const codeFile = files.find((f) => f.path === 'code.js' || f.path.endsWith('/code.js'));
  const uiFile = files.find((f) => f.path === 'ui.html' || f.path.endsWith('/ui.html'));
  if (!codeFile) throw new Error('Fichier code.js introuvable dans le bundle');
  if (!uiFile) throw new Error('Fichier ui.html introuvable dans le bundle');
  if (!codeFile.content.trim()) throw new Error('code.js est vide');
  if (!uiFile.content.trim()) throw new Error('ui.html est vide');
  return { codeJs: codeFile.content, uiHtml: uiFile.content };
}

export function useBundle(): UseBundleReturn {
  const [bundle, setBundle] = useState<ParsedBundle | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (project: Project): Promise<boolean> => {
    setLoading(true); setError(null); setSelectedProject(project); setBundle(null);
    try {
      const sb = getSupabase();
      const { data, error: rpcError } = await sb.rpc('get_project_bundle', { p_project_id: project.id });
      if (rpcError) throw new Error(`Erreur chargement bundle: ${rpcError.message}`);
      if (!data) throw new Error('Bundle vide retourne par le serveur');
      const raw = typeof data === 'string' ? JSON.parse(data) : data;
      const manifestData = raw.manifest || raw.project?.manifest_config || raw.project?.manifest;
      const files: BundleFile[] = raw.files || [];
      const manifest = validateManifest(manifestData);
      const { codeJs, uiHtml } = extractBundleFiles(files);
      const parsed: ParsedBundle = { manifest, codeJs, uiHtml, files };
      setBundle(parsed); setLoading(false);
      sendToPlugin({ type: 'STORE_LAST_PROJECT', payload: { projectId: project.id } });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur reseau';
      setError(message); setLoading(false); setSelectedProject(null);
      return false;
    }
  }, []);

  const reset = useCallback(() => { setBundle(null); setSelectedProject(null); setError(null); setLoading(false); }, []);
  const clearError = useCallback(() => setError(null), []);

  return { bundle, selectedProject, loading, error, load, reset, clearError };
}
