// ============================================================
// useAuth.ts - Auth state + signIn / signOut / auto-reconnect
// ============================================================

import { useState, useCallback, useRef } from 'preact/hooks';
import type { AuthState, AuthUser } from '../../plugin/types/runner.types';
import type { PluginMessage, AuthPayload } from '../../plugin/types/messages.types';
import { getSupabase, setSession } from '../lib/supabase';
import { sendToPlugin } from './useMessaging';

const INITIAL_STATE: AuthState = {
  authenticated: false,
  user: null,
  loading: true,
  error: null,
};

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(INITIAL_STATE);
  const bootDone = useRef(false);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuth(prev => ({ ...prev, loading: true, error: null }));

    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        setAuth(prev => ({ ...prev, loading: false, error: error.message }));
        return;
      }

      const session = data.session;
      if (!session) {
        setAuth(prev => ({ ...prev, loading: false, error: 'No session returned' }));
        return;
      }

      const user: AuthUser = {
        id: data.user.id,
        email: data.user.email || email,
      };

      const payload: AuthPayload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user,
      };
      sendToPlugin({ type: 'STORE_AUTH', payload });

      setAuth({ authenticated: true, user, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setAuth(prev => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const sb = getSupabase();
      await sb.auth.signOut();
    } catch {
      // Ignore signOut errors
    }

    sendToPlugin({ type: 'CLEAR_AUTH' });
    setAuth({ authenticated: false, user: null, loading: false, error: null });
  }, []);

  const handlePluginMessage = useCallback(async (msg: PluginMessage) => {
    switch (msg.type) {
      case 'AUTH_RESTORED': {
        const { access_token, refresh_token, user } = msg.payload;

        const ok = await setSession(access_token, refresh_token);
        if (ok) {
          const sb = getSupabase();
          const { data, error } = await sb.auth.getUser();

          if (error || !data.user) {
            sendToPlugin({ type: 'CLEAR_AUTH' });
            setAuth({ authenticated: false, user: null, loading: false, error: null });
          } else {
            setAuth({
              authenticated: true,
              user: { id: data.user.id, email: data.user.email || user.email },
              loading: false,
              error: null,
            });
          }
        } else {
          sendToPlugin({ type: 'CLEAR_AUTH' });
          setAuth({ authenticated: false, user: null, loading: false, error: null });
        }
        bootDone.current = true;
        break;
      }

      case 'AUTH_EMPTY': {
        setAuth({ authenticated: false, user: null, loading: false, error: null });
        bootDone.current = true;
        break;
      }

      case 'AUTH_STORED':
      case 'AUTH_CLEARED':
        break;

      case 'ERROR': {
        if (msg.payload.source === 'controller') {
          setAuth(prev => ({ ...prev, loading: false, error: msg.payload.message }));
        }
        break;
      }

      default:
        break;
    }
  }, []);

  const clearError = useCallback(() => {
    setAuth(prev => ({ ...prev, error: null }));
  }, []);

  return { auth, signIn, signOut, handlePluginMessage, clearError };
}
