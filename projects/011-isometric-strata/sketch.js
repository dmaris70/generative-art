// Isometric Strata — generative architectural drawing sheets.
//
// Every seed is a complete working drawing: a title block, a north arrow, the
// palette's swatches, a framed axonometric (or a plan and section) of a
// building on its site with the floor levels scaled up the margin, and a
// footer with a legend whose counts are tallied from the geometry actually
// drawn, a scale bar, and the sheet's specification. The building is one of
// twelve styles — the Mexican-modern patio mat, the deconstructivist tower,
// the geodesic expo mast, the brutalist mosaic block, the Five Points villa,
// the De Stijl house, the Metabolist capsule tower, the Palladian villa, the
// Archigram plug-in rig, the Miesian glass box, the Cycladic village, the
// Rossian analogous city — each a vocabulary of parts recombined by the seed,
// standing on one of six site types.
//
// Pipeline: seed → spec (style, site, paper, palette, detail…) → Scene of 3-D
// primitives (styles/*.js + site.js) → depth sort → hand-drawn render
// (render.js) onto textured paper (paper.js) inside the chrome (sheet.js).
// The engine is lib/strata.js; this file only wires it to the harness.
//
// Keys: R randomize · S save PNG.

let G;
let state = null;

function setup() {
  fitCanvas();
  pixelDensity(min(2, displayDensity()));
  G = GenArt.create({
    title: 'Isometric Strata',
    params: {
      view: { value: 0, min: 0, max: 2, step: 1, label: 'view (0 auto, 1 axon, 2 plan+section)' },
      mode: { value: 0, min: 0, max: 12, step: 1, label: 'style (0 auto, 1 mex, 2 decon, 3 geo, 4 brut, 5 corb, 6 stijl, 7 metab, 8 pall, 9 archi, 10 mies, 11 cyc, 12 rossi)' },
      floors: { value: 0, min: 0, max: 10, step: 1, label: 'floors (0 auto)' },
      detail: { value: 0, min: 0, max: 3, step: 1, label: 'detail (0 auto)' },
      density: { value: 0, min: 0, max: 3, step: 1, label: 'site density (0 auto)' },
      bldgs: { value: 0, min: 0, max: 2, step: 1, label: 'buildings (0 auto)' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
      ink: { value: 1, min: 0.5, max: 1.8, step: 0.05, label: 'ink weight' },
    },
    onReset: reset,
  });
  if (G.gui) {
    G.gui.add({ portfolio: function () {
      const u = new URL('portfolio.html', window.location.href);
      u.searchParams.set('seed', String(G.seed));
      if (G.param('mode') | 0) u.searchParams.set('style', String(G.param('mode') | 0));
      window.open(u.toString(), '_blank');
    } }, 'portfolio').name('⊞ Portfolio board');
  }
  reset();
}

function fitCanvas() {
  // a host page may reserve a strip (window.STRATA_INSET px) for its own bar
  const inset = window.STRATA_INSET || 0;
  const w = Math.min(windowWidth, (windowHeight - inset) * (Strata.SW / Strata.SH));
  const h = w * (Strata.SH / Strata.SW);
  if (!window._c) window._c = createCanvas(w, h);
  else resizeCanvas(w, h);
}

function opts() {
  return {
    seed: G.seed,
    view: G.param('view'), mode: G.param('mode'), floors: G.param('floors'), detail: G.param('detail'),
    density: G.param('density'), bldgs: G.param('bldgs'), wobble: G.param('wobble'), ink: G.param('ink'),
  };
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  state = Strata.build(opts());
  window.__strata = Object.assign({ G: G }, state);
  render();
}

function render() {
  if (state) Strata.paint(window, state, opts());
}

function draw() {}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('isometric-strata-' + G.seed, 'png');
}

function windowResized() {
  fitCanvas();
  render();
}
