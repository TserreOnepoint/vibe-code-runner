// ============================================================
// manifest.json config for Color Palette test plugin
//
// Conforme spec Figma: ui est un string (path vers le HTML)
// Les dimensions UI sont passees a runtime via figma.showUI(__html__, { width, height })
// dans code.js — le Runner les intercepte via le Proxy (ui-bridge.service.ts)
// ============================================================

export const MANIFEST_CONFIG = {
  name: 'Color Palette Generator',
  id: '1601712706906363590',
  api: '1.0.0',
  main: 'code.js',
  ui: 'ui.html',
  editorType: ['figma'],
  networkAccess: {
    allowedDomains: ['https://*.supabase.co'],
  },
};
