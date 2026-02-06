// ============================================================
// Login.tsx - US-RUN-01 : authentication form
// ============================================================

import { h, FunctionalComponent } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { ErrorBanner } from './ErrorBanner';

interface Props {
  loading: boolean;
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onClearError: () => void;
}

export const Login: FunctionalComponent<Props> = ({ loading, error, onSignIn, onClearError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim() !== '' && password !== '' && !loading;

  const handleSubmit = useCallback(
    (e: Event) => {
      e.preventDefault();
      if (!canSubmit) return;
      onSignIn(email.trim(), password);
    },
    [email, password, canSubmit, onSignIn],
  );

  return (
    <div class="screen">
      <div class="screen-header">
        <div class="screen-title">Vibe Code Runner</div>
        <div class="screen-subtitle">Sign in to access your projects</div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={onClearError} />}

      <form onSubmit={handleSubmit}>
        <div class="form-group">
          <label class="form-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            class="form-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            disabled={loading}
            autoFocus
          />
        </div>

        <div class="form-group">
          <label class="form-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            class="form-input"
            type="password"
            placeholder="Your password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            disabled={loading}
          />
        </div>

        <button type="submit" class="btn btn-primary btn-full" disabled={!canSubmit}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
