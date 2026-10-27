// Isometric Strata — generative architectural drawing sheets.
//
// Every seed is a complete working drawing set of six sheets — site plan,
// plans, sections, elevations, axonometric, diagrams — each with a title block, a north
// arrow, the palette's swatches, the drawing of a building on its site with
// the floor levels scaled up the margin where they apply, and a
// footer with a legend whose counts are tallied from the geometry actually
// drawn, a scale bar, and the sheet's specification. The building is one of
// thirty-three styles — the Mexican-modern patio mat, the deconstructivist tower,
// the geodesic expo mast, the brutalist mosaic block, the Five Points villa,
// the De Stijl house, the Metabolist capsule tower, the Palladian villa, the
// Archigram plug-in rig, the Miesian glass box, the Cycladic village, the
// Rossian analogous city, and twenty-one more after Kahn, Loos, Terragni, Aalto, Wright, Bawa, Ando, the
// Constructivists, Scarpa, Superstudio, Friedman, Constant, Soleri, Sant'Elia, Otto, Price,
// Boullée, Ferriss, Ant Farm, Fresco and Shukhov — each a vocabulary of parts recombined by the seed,
// standing on one of six site types.
//
// Pipeline: seed → spec (style, site, paper, palette, detail…) → Scene of 3-D
// primitives (styles/*.js + site.js) → depth sort → hand-drawn render
// (render.js) onto textured paper (paper.js) inside the chrome (sheet.js).
// The engine is lib/strata.js; this file only wires it to the harness.
//
// Keys: R randomize · S save PNG · 1–6 pick the sheet of the set · 0 let the seed pick.

let G;
let state = null;

function setup() {
  fitCanvas();
  pixelDensity(min(2, displayDensity()));
  G = GenArt.create({
    title: 'Isometric Strata v2',
    params: {
      sheet: { value: 0, min: 0, max: 6, step: 1, label: 'sheet (0 auto, 1 site, 2 plans, 3 sections, 4 elevations, 5 axon, 6 diagrams)' },
      inks: { value: 0, min: 0, max: 6, step: 1, label: 'ink pair (0 auto, 1 blue+fl.orange, 2 fed.blue+fl.pink, 3 teal+sunflower, 4 black+red, 5 indigo+orange, 6 steel+yellow)' },
      mode: { value: 0, min: 0, max: 33, step: 1, label: 'style (0 auto, 1 mex, 2 decon, 3 geo, 4 brut, 5 corb, 6 stijl, 7 metab, 8 pall, 9 archi, 10 mies, 11 cyc, 12 rossi, 13 kahn, 14 loos, 15 terragni, 16 aalto, 17 wright, 18 bawa, 19 ando, 20 constr, 21 scarpa, 22 superstudio, 23 friedman, 24 constant, 25 soleri, 26 santelia, 27 otto, 28 price, 29 boullee, 30 ferriss, 31 antfarm, 32 fresco, 33 shukhov)' },
      floors: { value: 0, min: 0, max: 10, step: 1, label: 'floors (0 auto)' },
      detail: { value: 0, min: 0, max: 3, step: 1, label: 'detail (0 auto)' },
      density: { value: 0, min: 0, max: 3, step: 1, label: 'site density (0 auto)' },
      bldgs: { value: 0, min: 0, max: 2, step: 1, label: 'buildings (0 auto)' },
      schedule: { value: 1, min: 0, max: 1, step: 1, label: 'schedule column' },
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
    G.gui.add({ set: function () {
      const u = new URL('portfolio.html', window.location.href);
      u.searchParams.set('seed', String(G.seed));
      u.searchParams.set('set', 'sheets');
      if (G.param('mode') | 0) u.searchParams.set('style', String(G.param('mode') | 0));
      window.open(u.toString(), '_blank');
    } }, 'set').name('⊞ Drawing set A-01…05');
    G.gui.add({ meta: copyMetadata }, 'meta').name('Copy metadata JSON (M)');
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
    sheet: G.param('sheet'), inks: G.param('inks'), mode: G.param('mode'), floors: G.param('floors'), detail: G.param('detail'),
    density: G.param('density'), bldgs: G.param('bldgs'), wobble: G.param('wobble'), ink: G.param('ink'),
    schedule: G.param('schedule'),
  };
}

function copyMetadata() {
  if (!state) return;
  const json = JSON.stringify(Strata.metadata(state), null, 2);
  if (navigator.clipboard) navigator.clipboard.writeText(json).catch(function () {});
  console.log(json);
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  state = Strata.build(opts());
  window.__strata = Object.assign({ G: G, metadata: Strata.metadata(state) }, state);
  render();
}

function render() {
  if (state) Strata.paint(window, state, opts());
}

function draw() {}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('isometric-strata-' + G.seed, 'png');
  if (key === 'm' || key === 'M') copyMetadata();
  if (key >= '0' && key <= '6' && G.setParams) G.setParams({ sheet: Number(key) });
}

function windowResized() {
  fitCanvas();
  render();
}
