// ============================================================
// ProjectList.tsx - US-RUN-02 : project list + selection
// ============================================================

import { h, FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Project } from '../../plugin/types/runner.types';
import { StatusBadge } from './StatusBadge';
import { ErrorBanner } from './ErrorBanner';

interface Props {
  userId: string;
  userEmail: string;
  projects: Project[];
  loading: boolean;
  error: string | null;
  onFetch: () => Promise<void>;
  onClearError: () => void;
  onSelect: (project: Project) => void;
  onSignOut: () => void;
}

export const ProjectList: FunctionalComponent<Props> = ({
  userEmail,
  projects,
  loading,
  error,
  onFetch,
  onClearError,
  onSelect,
  onSignOut,
}) => {
  // Fetch on mount
  useEffect(() => {
    onFetch();
  }, [onFetch]);

  return (
    <div class="screen">
      <div class="screen-header">
        <div class="screen-title">My Projects</div>
        <div class="welcome">
          Signed in as <span class="welcome-email">{userEmail}</span>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={onClearError} />}

      {/* Toolbar: refresh */}
      <div class="project-toolbar">
        <button
          class="btn btn-ghost"
          onClick={onFetch}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Loading state */}
      {loading && projects.length === 0 && (
        <div class="loader" style={{ flex: 1 }}>
          <div class="spinner" />
          <span>Loading projects...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && !error && (
        <div class="project-empty">
          Create your first project on Vibe Code Studio
        </div>
      )}

      {/* Project list */}
      {projects.length > 0 && (
        <div class="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              class="project-item"
              onClick={() => onSelect(project)}
            >
              <div class="project-item-header">
                <span class="project-item-name">{project.name}</span>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <div class="project-item-desc">{project.description}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sign out */}
      <button
        class="btn btn-ghost"
        style={{ marginTop: 'auto' }}
        onClick={onSignOut}
      >
        Sign out
      </button>
    </div>
  );
};
