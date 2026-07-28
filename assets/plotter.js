/*
 * plotter.js — pen-plotter SVG export for GenArt sketches.
 *
 * Wraps p5.plotSvg (https://github.com/golanlevin/p5.plotSvg) so any sketch using
 * the GenArt harness gets a "Save SVG" button in its panel and the V key. The
 * export re-runs the sketch through G.reset(), which rewinds the PRNG first — so
 * the SVG is the same artwork as the seed currently on screen, not a new one.
 *
 * Load after p5, lil-gui, genart.js and p5.plotSvg:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/p5.plotsvg@latest/lib/p5.plotSvg.js"></script>
 *   <script src="../../assets/plotter.js"></script>
 *
 * Then, right after creating the harness:
 *
 *   G = GenArt.create({ title: 'My Piece', params: {...}, onReset: reset });
 *   Plotter.attach(G);
 *
 * Options:
 *   dpi        (96)      SVG document resolution — sets the pixel→mm scale downstream
 *   filename   (title)   basename; the seed and .svg are appended
 *   render     (G.reset) function that paints one complete artwork. Override for
 *                        animated sketches, where reset() only seeds the system and
 *                        the picture accumulates in draw().
 *   byColor    (false)   group paths by stroke colour → one Inkscape layer per pen
 *   key        ('v')     keyboard shortcut, or null to bind none
 *
 * Remember: only STROKED geometry is exported. fill(), alpha, background(), images
 * and blend modes do not exist for a pen — see docs/plotter-guide.md.
 */
(function (global) {
  'use strict';

  function slugify(s) {
    return String(s || 'sketch')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function attach(G, opts) {
    opts = opts || {};

    if (typeof global.beginRecordSvg !== 'function') {
      console.warn(
        'plotter.js: p5.plotSvg not found — SVG export disabled. Add the CDN <script> tag.'
      );
      return null;
    }

    const base = opts.filename || slugify(G && G.title);
    const render = typeof opts.render === 'function' ? opts.render : function () { G.reset(); };

    function saveSVG() {
      // Configure before recording; each call is guarded so a future/older build of
      // p5.plotSvg missing one of these doesn't break the export.
      if (typeof global.setSvgResolutionDPI === 'function') {
        global.setSvgResolutionDPI(opts.dpi || 96);
      }
      if (opts.byColor && typeof global.setSvgGroupByStrokeColor === 'function') {
        global.setSvgGroupByStrokeColor(true);
      }

      global.beginRecordSvg(base + '-' + G.seed + '.svg');
      try {
        render();
      } finally {
        global.endRecordSvg(); // always close the recorder, even if the sketch throws
      }
    }

    // --- panel button ---
    if (G.gui && typeof G.gui.add === 'function') {
      G.gui.add({ saveSVG: saveSVG }, 'saveSVG').name('Save SVG' + (opts.key === null ? '' : ' (V)'));
    }

    // --- key binding (a listener, so it doesn't collide with the sketch's keyPressed) ---
    const key = opts.key === undefined ? 'v' : opts.key;
    if (key) {
      global.document.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key.toLowerCase() === key) saveSVG();
      });
    }

    return { saveSVG: saveSVG };
  }

  global.Plotter = { attach: attach };
})(window);
