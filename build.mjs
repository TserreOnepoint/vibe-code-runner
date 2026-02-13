// ============================================================
// build.mjs - esbuild pipeline for Vibe Code Runner
// Output: code.js + ui.html + manifest.json (already in repo)
// ============================================================

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, watch } from 'node:fs';

const isWatch = process.argv.includes('--watch');

// Virtual entry: imports App and mounts it on #app
// This avoids needing a separate src/ui/index.tsx file
const UI_ENTRY = `
import { h, render } from 'preact';
import App from './src/figma-plugin/ui/App';
render(h(App, null), document.getElementById('app'));
`;

// --- Build code.js (Figma plugin sandbox) ---

async function buildCode() {
  await esbuild.build({
    entryPoints: ['src/figma-plugin/plugin/controller.ts'],
    bundle: true,
    outfile: 'code.js',
    format: 'iife',
    platform: 'neutral',
    target: 'es6',
  });
  console.log('[build] code.js');
}

// --- Build ui.html (iframe, everything inlined) ---

async function buildUI() {
  const result = await esbuild.build({
    stdin: {
      contents: UI_ENTRY,
      resolveDir: '.',
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es6',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    minify: true,
  });

  const js = result.outputFiles[0].text;
  const css = readFileSync('src/figma-plugin/ui/styles/tokens.css', 'utf-8');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>`;

  writeFileSync('ui.html', html);
  console.log('[build] ui.html');
}

// --- Main ---

async function build() {
  const start = Date.now();
  await Promise.all([buildCode(), buildUI()]);
  console.log(`[build] Done in ${Date.now() - start}ms`);
}

await build();

// --- Watch mode ---

if (isWatch) {
  console.log('[watch] Watching src/ for changes...');
  let timeout = null;
  watch('src/figma-plugin', { recursive: true }, () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(async () => {
      try {
        await build();
      } catch (err) {
        console.error('[watch] Error:', err.message);
      }
    }, 150);
  });
}
