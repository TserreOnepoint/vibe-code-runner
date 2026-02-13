// ============================================================
// useProjects.ts - Fetch + refresh project list (US-RUN-02)
// ============================================================

import { useState, useCallback } from 'preact/hooks';
import type { Project } from '../../plugin/types/runner.types';
import { getSupabase } from '../lib/supabase';

interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  clearError: () => void;
}

export function useProjects(userId: string | null): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      const sb = getSupabase();
      const { data, error: dbError } = await sb.from('projects').select('id, name, description, status, updated_at').eq('user_id', userId).order('updated_at', { ascending: false });
      if (dbError) { setError(dbError.message); setLoading(false); return; }
      setProjects((data as Project[]) || []); setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message); setLoading(false);
    }
  }, [userId]);

  const clearError = useCallback(() => setError(null), []);
  return { projects, loading, error, fetch: fetchProjects, clearError };
}
