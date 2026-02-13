// ============================================================
// useMessaging.ts - Bridge postMessage typesafe code <-> UI
// ============================================================

import { useEffect, useCallback } from 'preact/hooks';
import type { UIMessage, PluginMessage } from '../../plugin/types/messages.types';

type MessageHandler = (msg: PluginMessage) => void;

export function sendToPlugin(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function usePluginMessages(handler: MessageHandler): void {
  const stableHandler = useCallback(
    (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg && typeof msg.type === 'string') {
        handler(msg as PluginMessage);
      }
    },
    [handler],
  );

  useEffect(() => {
    window.addEventListener('message', stableHandler);
    return () => window.removeEventListener('message', stableHandler);
  }, [stableHandler]);
}
