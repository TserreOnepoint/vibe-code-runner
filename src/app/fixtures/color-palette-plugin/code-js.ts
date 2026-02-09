// ============================================================
// code.js content for Color Palette test plugin
// Tests manifest-based UI dimensions (500x600)
// Runs in Figma sandbox: no DOM, no fetch, no window
// ============================================================

export const CODE_JS = `
figma.showUI(__html__, { width: 800, height: 400 });

figma.ui.onmessage = (msg) => {
  if (msg.type === 'generate-palette') {
    const count = msg.count || 5;
    const baseHue = Math.floor(Math.random() * 360);
    const rects = [];

    for (let i = 0; i < count; i++) {
      const rect = figma.createRectangle();
      const hue = (baseHue + i * (360 / count)) % 360;

      // HSL to RGB conversion
      var s = 0.7, l = 0.55;
      var c = (1 - Math.abs(2 * l - 1)) * s;
      var x = c * (1 - Math.abs((hue / 60) % 2 - 1));
      var m = l - c / 2;
      var r1, g1, b1;
      if (hue < 60)       { r1 = c; g1 = x; b1 = 0; }
      else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
      else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
      else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
      else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
      else                { r1 = c; g1 = 0; b1 = x; }

      rect.resize(80, 80);
      rect.x = i * 100;
      rect.y = 0;
      rect.cornerRadius = 8;
      rect.fills = [{
        type: 'SOLID',
        color: { r: r1 + m, g: g1 + m, b: b1 + m }
      }];
      rect.name = 'Swatch ' + (i + 1);
      figma.currentPage.appendChild(rect);
      rects.push(rect);
    }

    figma.viewport.scrollAndZoomIntoView(rects);

    var hexColors = rects.map(function(r) {
      var fill = r.fills[0].color;
      var toHex = function(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); };
      return '#' + toHex(fill.r) + toHex(fill.g) + toHex(fill.b);
    });

    figma.ui.postMessage({
      type: 'palette-created',
      colors: hexColors,
      count: count
    });

    console.log('[ColorPalette] Generated ' + count + ' swatches, base hue: ' + baseHue);
  }

  if (msg.type === 'apply-to-selection') {
    var sel = figma.currentPage.selection;
    if (sel.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Aucun element selectionne' });
      return;
    }
    var color = msg.color;
    var r = parseInt(color.slice(1, 3), 16) / 255;
    var g = parseInt(color.slice(3, 5), 16) / 255;
    var b = parseInt(color.slice(5, 7), 16) / 255;

    sel.forEach(function(node) {
      if ('fills' in node) {
        node.fills = [{ type: 'SOLID', color: { r: r, g: g, b: b } }];
      }
    });

    figma.ui.postMessage({
      type: 'applied',
      message: 'Couleur ' + color + ' appliquee a ' + sel.length + ' element(s)'
    });
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

console.log('[ColorPalette] code.js loaded — UI dimensions: 500x600');
`.trim();
