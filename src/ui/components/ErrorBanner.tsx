// ============================================================
// ErrorBanner.tsx - US-RUN-11 : generic error display
// ============================================================

import { h } from 'preact';
import type { FunctionalComponent } from 'preact';

interface Props {
  message: string;
  onDismiss?: () => void;
}

export const ErrorBanner: FunctionalComponent<Props> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div class="error-banner">
      <span class="error-banner-message">{message}</span>
      {onDismiss && (
        <button class="error-banner-close" onClick={onDismiss} aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
};
