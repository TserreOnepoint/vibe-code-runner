// ============================================================
// App.tsx - Root Preact component, screen routing
// ============================================================

import { h, FunctionalComponent } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Screen, Project } from '../plugin/types/runner.types';
import type { PluginMessage, RunnerSettings } from '../plugin/types/messages.types';
import { DEFAULT_SETTINGS } from '../plugin/types/messages.types';
import { initSupabase } from './lib/supabase';
import { usePluginMessages, sendToPlugin } from './hooks/useMessaging';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useBundle } from './hooks/useBundle';
import { Login } from './components/Login';
import { ProjectList } from './components/ProjectList';

const App: FunctionalComponent = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [settings, setSettings] = useState<RunnerSettings>(DEFAULT_SETTINGS);
  const [supabaseReady, setSupabaseReady] = useState(false);

  const { auth, signIn, signOut, handlePluginMessage, clearError } = useAuth();
  const projectsHook = useProjects(auth.user?.id || null);
  const bundleHook = useBundle();

  // --- Select project: load bundle then navigate (US-RUN-03) ---

  const handleSelectProject = useCallback(async (project: Project) => {
    const success = await bundleHook.load(project);
    if (success) {
      setScreen('execution');
    }
    // On failure, bundleHook.error is set and user stays on projects screen
  }, [bundleHook.load]);

  // --- Back to projects (from execution or on bundle error) ---

  const handleBackToProjects = useCallback(() => {
    bundleHook.reset();
    setScreen('projects');
  }, [bundleHook.reset]);

  // --- Init Supabase client once we have settings ---

  useEffect(() => {
    if (settings.supabaseUrl && settings.supabaseAnonKey) {
      initSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      setSupabaseReady(true);
    }
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  // --- On boot: request settings from code.js, then auth ---

  useEffect(() => {
    sendToPlugin({ type: 'GET_SETTINGS' });
  }, []);

  // --- Route based on auth state ---

  useEffect(() => {
    if (auth.loading) return;

    if (auth.authenticated) {
      setScreen('projects');
    } else {
      setScreen('login');
      bundleHook.reset();
    }
  }, [auth.authenticated, auth.loading]);

  // --- Central message handler ---

  const onPluginMessage = useCallback(
    (msg: PluginMessage) => {
      // Settings must be handled here (before auth, to init supabase)
      if (msg.type === 'SETTINGS_DATA') {
        const merged = { ...DEFAULT_SETTINGS, ...msg.payload };
        setSettings(merged);

        // Init supabase then request auth
        initSupabase(merged.supabaseUrl, merged.supabaseAnonKey);
        setSupabaseReady(true);
        sendToPlugin({ type: 'GET_STORED_AUTH' });
        return;
      }

      // Acknowledgements we can ignore
      if (msg.type === 'LAST_PROJECT_STORED' || msg.type === 'LAST_PROJECT_DATA') {
        return;
      }

      // Delegate auth-related messages
      handlePluginMessage(msg);
    },
    [handlePluginMessage],
  );

  usePluginMessages(onPluginMessage);

  // --- Loading state (boot) ---

  if (!supabaseReady || auth.loading) {
    return (
      <div class="loader">
        <div class="spinner" />
        <span>Starting Runner...</span>
      </div>
    );
  }

  // --- Bundle loading overlay (US-RUN-03) ---

  if (bundleHook.loading) {
    return (
      <div class="loader">
        <div class="spinner" />
        <span>Chargement du plugin...</span>
      </div>
    );
  }

  // --- Screen routing ---

  switch (screen) {
    case 'login':
      return (
        <Login
          loading={auth.loading}
          error={auth.error}
          onSignIn={signIn}
          onClearError={clearError}
        />
      );

    case 'projects':
      if (!auth.user) return null;
      return (
        <ProjectList
          userId={auth.user.id}
          userEmail={auth.user.email}
          projects={projectsHook.projects}
          loading={projectsHook.loading}
          error={projectsHook.error}
          bundleError={bundleHook.error}
          onFetch={projectsHook.fetch}
          onClearError={projectsHook.clearError}
          onClearBundleError={bundleHook.clearError}
          onSelect={handleSelectProject}
          onSignOut={signOut}
        />
      );

    case 'execution':
      // Placeholder - US-RUN-04/05/09/10
      return (
        <div class="screen">
          <div class="screen-header">
            <div class="screen-title">
              {bundleHook.selectedProject?.name || 'Execution'}
            </div>
            <div class="screen-subtitle">
              {bundleHook.bundle
                ? `${bundleHook.bundle.files.length} fichiers charges`
                : 'Aucun bundle'}
            </div>
          </div>
          <button class="btn btn-ghost" onClick={handleBackToProjects}>
            &larr; Retour aux projets
          </button>
          <div style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-lg)' }}>
            Execution a venir (US-RUN-04)
          </div>
        </div>
      );

    case 'settings':
      // Placeholder - US-RUN-12
      return (
        <div class="screen">
          <div class="screen-title">Settings</div>
          <div style={{ color: 'var(--color-text-muted)' }}>Coming soon (US-RUN-12)</div>
        </div>
      );

    default:
      return null;
  }
};

export default App;
