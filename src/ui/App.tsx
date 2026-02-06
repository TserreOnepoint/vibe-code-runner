// ============================================================
// App.tsx - Root Preact component, screen routing
// ============================================================

import { h, FunctionalComponent } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Screen } from '../plugin/types/runner.types';
import type { Project } from '../plugin/types/runner.types';
import type { PluginMessage, RunnerSettings } from '../plugin/types/messages.types';
import { DEFAULT_SETTINGS } from '../plugin/types/messages.types';
import { initSupabase } from './lib/supabase';
import { usePluginMessages, sendToPlugin } from './hooks/useMessaging';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { Login } from './components/Login';
import { ProjectList } from './components/ProjectList';

const App: FunctionalComponent = () => {
  const [screen, setScreen] = useState<Screen>('login');
  const [settings, setSettings] = useState<RunnerSettings>(DEFAULT_SETTINGS);
  const [supabaseReady, setSupabaseReady] = useState(false);

  const { auth, signIn, signOut, handlePluginMessage, clearError } = useAuth();
  const projectsHook = useProjects(auth.user?.id || null);

  // Callback when user selects a project (US-RUN-03 placeholder)
  const handleSelectProject = useCallback((_project: Project) => {
    // Will navigate to execution screen in US-RUN-03
    setScreen('execution');
  }, []);

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

      // Delegate auth-related messages
      handlePluginMessage(msg);
    },
    [handlePluginMessage],
  );

  usePluginMessages(onPluginMessage);

  // --- Loading state ---

  if (!supabaseReady || auth.loading) {
    return (
      <div class="loader">
        <div class="spinner" />
        <span>Starting Runner...</span>
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
          onFetch={projectsHook.fetch}
          onClearError={projectsHook.clearError}
          onSelect={handleSelectProject}
          onSignOut={signOut}
        />
      );

    case 'execution':
      // Placeholder - US-RUN-04/05/09/10
      return (
        <div class="screen">
          <div class="screen-title">Execution</div>
          <div style={{ color: 'var(--color-text-muted)' }}>Coming soon (US-RUN-04)</div>
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
