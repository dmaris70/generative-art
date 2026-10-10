// 039 — Ridge, encounters — stroke by stroke
//
// 028's scene (its engine, loaded unchanged: the same seed gives the same diptych), painted
// in oil one stroke after another by a painter that looks at the canvas before each stroke
// (painter.js), with paint that behaves as paint while the stroke is laid (paint.js). See
// README.md.

let G;
let SC = null; // 028's scene: two sheets of buffers (038's bridge)
let SHEETS = []; // per sheet: { painter, off (an offscreen canvas), img (its ImageData) }
let ACTIVE = 0; // the sheet being painted
let R = null, U = 1, PANEL_W = 0;
let JOB = 0;
let PG = null;
const ROOM = [14, 14, 16];
const GAP = 40; // sheet units between the two sheets
const FRAME_BUDGET_MS = 34;
const SHOW_MS = 250;
const UI = { status: 'loading the places…' };

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  const PA = 'Painting', SN = 'Scene', BR = 'The painter', PO = 'Oil', WA = 'Watercolour';
  G = GenArt.create({
    title: 'Ridge, encounters — stroke by stroke',
    applyOnDemand: true,
    closedGroups: [PO, WA],
    params: {
      medium: { value: 0, options: { oil: 0, watercolour: 1 }, label: 'medium', group: PA },
      palette: { value: 0, options: { 'full palette': 0, 'grisaille (white, black, umber)': 1 }, label: 'palette', group: PA },
      warmth: { value: 1, min: 0, max: 1.5, step: 0.05, label: 'glow of the light', group: PA },
      regime: { value: 0, options: { 'by seed': 0, exposure: 1, looming: 2, whiteout: 3, passage: 4, clearing: 5 }, label: 'register', group: SN },
      event: { value: 0, options: { 'by seed': 0, none: 1, tarn: 2, hut: 3, bird: 4, moon: 5 }, label: 'rare event (as 028)', group: SN },
      smear: { value: 1, min: 0, max: 2, step: 0.05, label: 'movement of the body (painted)', group: SN },
      brush: { value: 7, min: 4, max: 16, step: 0.5, label: 'finest brush (px)', group: BR },
      tol: { value: 0.03, min: 0.015, max: 0.12, step: 0.005, label: 'tolerance (how exact)', group: BR },
      aim: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'correction in the mix', group: PO },
      wipeAt: { value: 0.12, min: 0.03, max: 0.4, step: 0.01, label: 'wipe the brush past (ΔE)', group: PO },
      dirt: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'dirty palette (brush into piles)', group: PO },
      spread: { value: 1, min: 0.4, max: 2.5, step: 0.05, label: 'water spreads', group: WA },
      dryRate: { value: 1, min: 0.25, max: 4, step: 0.05, label: 'drying speed (×)', group: BR },
      fatOverLean: { value: 1, options: { 'fat over lean (as taught)': 1, 'lean over fat (it will crack)': 0 }, label: 'layers', group: PO },
      age: { value: 0, min: 0, max: 300, step: 5, label: 'age (years)', group: PO },
      res: { value: 0, options: { 'auto (screen)': 0, '1×': 1, '1.5×': 1.5, '2× (heavy)': 2 }, label: 'canvas resolution', group: BR },
      pick: { value: 0.3, min: 0, max: 0.6, step: 0.02, label: 'pickup of wet paint', group: PO },
      reach: { value: 6, min: 2, max: 14, step: 0.5, label: 'a brushful lasts (widths)', group: PO },
      streak: { value: 0.12, min: 0, max: 0.6, step: 0.05, label: 'unevenly mixed brushful', group: PO },
      dryBrush: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'dry brush (breaks)', group: PO },
      impasto: { value: 1, min: 0, max: 2, step: 0.05, label: 'loaded lights (impasto)', group: PO },
      relief: { value: 0.45, min: 0, max: 2, step: 0.05, label: 'relief under the light', group: BR },
    },
    onReset: reset,
  });
  addShuffle();
  noLoop();
  textFont('ui-sans-serif, system-ui, sans-serif');
  requestAnimationFrame(() => loadDEMs().then(() => reset()));
}

function shuffleAll() {
  const r = (a, b) => a + Math.random() * (b - a);
  const step = (v, d) => (d.step ? Number((d.min + Math.round((v - d.min) / d.step) * d.step).toFixed(6)) : v);
  const guard = {
    event: () => (Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 5)),
    brush: (d) => step(r(5.5, 12), d), // finer than this and a sheet takes too long
    tol: (d) => step(r(0.025, 0.06), d),
    res: () => 0, // the screen decides
    age: (d) => (Math.random() < 0.6 ? 0 : step(r(d.min, d.max), d)),
    fatOverLean: () => (Math.random() < 0.8 ? 1 : 0),
    aim: (d) => step(r(0.2, 0.6), d),
  };
  G.shuffle((k, d) => (guard[k] ? guard[k](d) : undefined));
}
function addShuffle() {
  const gui = G.gui;
  if (!gui) return;
  const shuf = gui.add({ shuffleAll }, 'shuffleAll').name('🔀 shuffle everything (X)');
  const apply = gui.controllers.find((c) => /Apply/.test(c._name));
  if (apply) apply.domElement.after(shuf.domElement);
}

function panelSpace() {
  const g = G.gui, el = g && g.domElement;
  if (!el || g._closed || g._hidden || windowWidth <= 700) return 0;
  return el.offsetWidth ? el.offsetWidth + 12 : 0;
}

// the canvas px per sheet unit: as many as the screen shows (in 0.5 steps, 1 to 1.5), unless
// set; 2× takes about 700 MB while a sheet is being painted
function canvasRes() {
  const set = G.param('res');
  if (set) return set;
  layout();
  const shown = SC ? U * pixelDensity() : 1; // device px per sheet unit
  return Math.min(1.5, Math.max(1, Math.round(shown * 2) / 2));
}
function layout() {
  const sw = (SC ? SC.sheets[0].W : 1080) * 2 + GAP, sh = SC ? SC.sheets[0].H : 1350;
  const avail = width - PANEL_W;
  U = Math.min((avail * 0.96) / sw, (height * 0.94) / sh);
  R = { x: (avail - sw * U) / 2, y: (height - sh * U) / 2, w: sw * U, h: sh * U };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reset() {
  const job = ++JOB;
  randomSeed(G.seed);
  noiseSeed(G.seed);
  PANEL_W = panelSpace();
  UI.status = 'finding the place, the body, the weather…';
  SC = null;
  SHEETS = [];
  ACTIVE = 0;
  window.DONE = false;
  loop();
  setTimeout(() => {
    if (job !== JOB) return;
    const P = (k) => G.param(k);
    const place = new URLSearchParams(location.search).get('place') || '';
    SC = ridgeScene(G.seed, { regime: P('regime'), event: P('event'), place });
    const mono = P('palette') === 1;
    PG = PG || makePigments(PIGMENT_DEFS);
    const pal = makePalette(PG, mono ? 'mono' : 'colour');
    const o = {
      palette: mono ? 'mono' : 'colour', brush: P('brush'), tol: P('tol'), aim: P('aim'), wipeAt: P('wipeAt'), dryRate: P('dryRate'),
      pick: P('pick'), reach: P('reach'), streak: P('streak'), dryBrush: P('dryBrush'), impasto: P('impasto'), smear: P('smear'),
      fatOverLean: P('fatOverLean') === 1, age: P('age'), res: canvasRes(), dirt: P('dirt'), hold: 1 / P('spread'),
    };
    UI.res = o.res;
    SHEETS = SC.sheets.map((B, k) => {
      const C = colourise(B, SC.light, mono ? 'mono' : 'colour', P('warmth'));
      const rng = mulberry32((G.seed ^ 0x39c0ffee) + k * 7919);
      const painter = P('medium') === 1 ? makeWCPainter(B, C, PG, o, rng) : makePainter(B, C, PG, pal, o, rng);
      const off = document.createElement('canvas');
      off.width = painter.cv.w; off.height = painter.cv.h;
      const ctx = off.getContext('2d');
      const img = ctx.createImageData(off.width, off.height);
      return { painter, off, ctx, img };
    });
    window.STATS = SHEETS.map((s) => s.painter.stats);
    loop();
  }, 30);
}

// show what changed on a sheet: its paint, lit, into the offscreen canvas
function show(S, r) {
  const cv = S.painter.cv;
  const x0 = Math.max(0, r[0] - 1), y0 = Math.max(0, r[1] - 1), x1 = Math.min(cv.w, r[2] + 1), y1 = Math.min(cv.h, r[3] + 1);
  if (x1 <= x0 || y1 <= y0) return;
  cv.renderRect(S.img.data, x0, y0, x1, y1, G.param('relief'));
  S.ctx.putImageData(S.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
}

function draw() {
  background(...ROOM);
  layout();
  if (SC && SHEETS.length) {
    // paint; what changed is shown at most every SHOW_MS (lighting the paint costs time)
    const t0 = performance.now();
    let pending = null;
    while (ACTIVE < 2 && performance.now() - t0 < FRAME_BUDGET_MS) {
      const S = SHEETS[ACTIVE];
      const r = S.painter.step(FRAME_BUDGET_MS - (performance.now() - t0));
      if (r) S.dirty = S.dirty ? [Math.min(S.dirty[0], r[0]), Math.min(S.dirty[1], r[1]), Math.max(S.dirty[2], r[2]), Math.max(S.dirty[3], r[3])] : r;
      if (S.painter.done) {
        show(S, [0, 0, S.painter.cv.w, S.painter.cv.h]);
        S.dirty = null;
        // the finished sheet lives on in its image; the paint's state is let go
        S.painter.cv.release();
        ACTIVE++;
        continue;
      }
      pending = S;
    }
    if (pending && pending.dirty && t0 - (pending.shown || 0) > SHOW_MS) { show(pending, pending.dirty); pending.dirty = null; pending.shown = t0; }
    // the sheets on their mats
    const ctx = drawingContext;
    for (let k = 0; k < 2; k++) {
      const B = SC.sheets[k], ox = R.x + k * (B.W + GAP) * U;
      noStroke();
      fill(...B.mat);
      rect(ox, R.y, B.W * U, B.H * U);
      if (SHEETS[k] && (k <= ACTIVE)) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(SHEETS[k].off, ox + B.box[0] * U, R.y + B.box[1] * U, B.box[2] * U, B.box[3] * U);
      }
    }
    if (ACTIVE >= 2) {
      noLoop();
      window.DONE = true;
      const s = SHEETS.map((x) => x.painter.stats);
      UI.status = 'done · ' + SC.placeLabel + ' · ' + SC.regime + ' · ' + SC.light + ' light · ' + (s[0].washes != null ? (s[0].washes + s[1].washes).toLocaleString() + ' washes · ' : (s[0].strokes + s[1].strokes).toLocaleString() + ' strokes · ') +
        (s[0].hours + s[1].hours).toFixed(1) + ' h at the easel · ' + UI.res + '×' + (G.param('age') > 0 ? ' · aged ' + G.param('age') + ' years' : '');
    } else if (pending) {
      const p = pending.painter;
      UI.status = (ACTIVE ? 'right' : 'left') + ' sheet · ' + p.stage + ' · ' + (p.stats.washes != null ? p.stats.washes.toLocaleString() + ' washes' : p.stats.strokes.toLocaleString() + ' strokes');
    }
  }
  // the status line, under the pictures
  noStroke();
  fill(200, 200, 194, 150);
  textSize(12);
  textAlign(LEFT, BOTTOM);
  text(UI.status, R.x, height - 8);
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 'x' || key === 'X') shuffleAll();
  if (key === 's' || key === 'S') saveCanvas('ridge-stroke-by-stroke-' + G.seed, 'png');
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  PANEL_W = panelSpace();
  if (!SC) return;
  redraw();
}
