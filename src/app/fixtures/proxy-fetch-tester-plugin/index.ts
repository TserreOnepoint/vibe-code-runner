// ============================================================
// Proxy Fetch Tester plugin - bundle index (US-RUN-07)
//
// Tests the custom fetch() injected into plugin code.js context.
// Covers:
//   - GET/POST JSON to jsonplaceholder (allowed domain)
//   - .text(), .json(), .clone() response methods
//   - Blocked domains (google.com, example.org)
//   - Query parameters
// ============================================================

import { CODE_JS } from './code-js';
import { UI_HTML } from './ui-html';
import { MANIFEST_CONFIG } from './manifest';
import type { PluginFixture } from '../hello-plugin';

export const PROXY_FETCH_TESTER_PLUGIN: PluginFixture = {
  name: 'Proxy Fetch Tester',
  description: 'Plugin de test US-RUN-07 \u2014 teste fetch() via proxy edge function : GET/POST JSON (allowed), domaines bloques (google.com, example.org), .text(), .clone().',
  manifest: MANIFEST_CONFIG,
  files: [
    { path: 'code.js', content: CODE_JS, language: 'javascript' },
    { path: 'ui.html', content: UI_HTML, language: 'html' },
  ],
};

export { CODE_JS, UI_HTML, MANIFEST_CONFIG };
