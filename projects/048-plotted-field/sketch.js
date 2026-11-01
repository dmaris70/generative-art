// 048 — Plotted Field: the panel, the sheet on screen and the exports.
// The piece itself is field.js. Keys: R new field · S save PNG · V save SVG · [ ] previous / next view · M the map / the view.

let G, R = null, job = 0;
const QS = new URLSearchParams(location.search);
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile
const SHEET_KEYS = ['A4', 'A3', 'A2', 'A1'], INK_KEYS = ['sepia', 'green', 'grey', 'black'];
const canvas = document.getElementById('view'), ctx = canvas.getContext('2d');
const status = document.getElementById('status');

(function start() {
  const FV = 'The view', MO = 'The moment', GR = 'The grass', PA = 'The sheet';
  G = GenArt.create({
    title: 'Plotted Field',
    resetOnFinish: true,
    params: {
      kind: { value: 0, options: { 'a view': 0, 'the map of the 25 views': 1 }, label: 'sheet', group: FV },
      view: { value: 1, min: 1, max: 25, step: 1, label: 'view (1 … 25 of this field)', group: FV },
      fov: { value: 55, min: 25, max: 90, step: 1, label: 'lens (° across)', group: FV },
      instant: { value: 1200, min: 0, max: 3599, step: 1, label: 'seconds into the hour', group: MO },
      wind: { value: 0.6, min: 0, max: 1.2, step: 0.01, label: 'wind', group: MO },
      windTurn: { value: 0, min: -180, max: 180, step: 1, label: 'wind turned (°)', group: MO },
      light: { value: 0.35, min: 0, max: 0.9, step: 0.01, label: 'moonlight (pen lifts)', group: MO },
      moon: { value: 40, min: -180, max: 180, step: 1, label: 'moon, from behind (°)', group: MO },
      moonHeight: { value: 25, min: 2, max: 80, step: 1, label: 'moon height (°)', group: MO },
      density: { value: 220, min: 40, max: 600, step: 10, label: 'blades per m²', group: GR },
      body: { value: 1.6, min: 0.5, max: 4, step: 0.1, label: 'blade body (occlusion)', group: GR },
      haze: { value: 6, min: 2, max: 30, step: 0.5, label: 'recession begins (m)', group: GR },
      hazeLength: { value: 16, min: 2, max: 60, step: 1, label: 'recession length (m)', group: GR },
      cutoff: { value: 1.4, min: 0.4, max: 4, step: 0.1, label: 'smallest blade drawn (mm)', group: GR },
      heads: { value: 0.08, min: 0, max: 0.6, step: 0.01, label: 'seed heads (share of tall blades)', group: GR },
      sheet: { value: 1, options: { A4: 0, A3: 1, A2: 2, A1: 3 }, label: 'paper', group: PA },
      pen: { value: 0.3, min: 0.1, max: 0.8, step: 0.05, label: 'pen (mm)', group: PA },
      ink2: { value: 0, options: { sepia: 0, green: 1, grey: 2, black: 3 }, label: 'second pen (heads, tall grass)', group: PA },
      grain: { value: 0.2, min: 0.1, max: 0.5, step: 0.05, label: 'occlusion grain (mm)', group: PA },
    },
    onReset: reset,
  });
  if (TILE && G.gui) G.gui.hide();
  if (TILE) status.hidden = true;
  if (G.gui) G.gui.add({ saveSVG }, 'saveSVG').name('Save SVG (V)');
  window.saveCanvas = () => savePNG();
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
    else if (e.key === 'v' || e.key === 'V') saveSVG();
    else if (e.key === '[' || e.key === ']') stepView(e.key === ']' ? 1 : -1);
    else if (e.key === 'm' || e.key === 'M') { G.params.kind = +G.param('kind') ? 0 : 1; refreshPanel(); G.reset(); }
  });
  window.addEventListener('resize', draw);
  reset();
})();

function options() {
  const p = (k) => +G.param(k);
  return {
    seed: G.seed, view: p('view'), fov: p('fov'), instant: p('instant'), wind: p('wind'), windTurn: p('windTurn'),
    light: p('light'), moon: p('moon'), moonHeight: p('moonHeight'), density: p('density'), body: p('body'),
    haze: p('haze'), hazeLength: p('hazeLength'), cutoff: p('cutoff'), heads: p('heads'), sheet: SHEET_KEYS[p('sheet')] || 'A3', grain: p('grain'),
  };
}
function stepView(d) {
  const v = ((+G.param('view') - 1 + d + 25) % 25) + 1;
  G.params.view = v; G.params.kind = 0;
  refreshPanel();
  G.reset();
}
function refreshPanel() { if (G.gui) G.gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
const ink2 = () => INK_KEYS[+G.param('ink2')] || 'sepia';
function reset() {
  const my = ++job;
  status.textContent = 'planting and drawing…';
  // let the message paint before the (≈1 s) build blocks the thread
  setTimeout(() => {
    if (my !== job) return;
    const map = +G.param('kind') === 1;
    R = map ? PlottedField.buildMap(options()) : PlottedField.build(options());
    const s = R.stats;
    status.textContent = 'field ' + G.seed + ' · ' + (map ? 'the map of the 25 views' : 'view ' + R.camera.view + '/25 · eye ' + R.camera.height.toFixed(2) + ' m · ' + s.heads + ' seed heads') + ' · '
      + s.strokesAll.toLocaleString() + ' strokes · ' + s.inkAll.toFixed(0) + ' m of line · ≈' + Math.round(s.minutes) + ' min at the plotter';
    draw();
  }, 20);
}

// ───────────────────────── the sheet on screen ─────────────────────────
function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#16161a'; ctx.fillRect(0, 0, W, H);
  if (!R) return;
  const pad = TILE ? 0 : 28, k = Math.min((W - 2 * pad) / R.sheet.w, (H - 2 * pad - (TILE ? 0 : 18)) / R.sheet.h);
  const ox = (W - R.sheet.w * k) / 2, oy = (H - R.sheet.h * k) / 2 - (TILE ? 0 : 9);
  ctx.fillStyle = '#f3efe6'; ctx.fillRect(ox, oy, R.sheet.w * k, R.sheet.h * k);
  paint(ctx, R, k, ox, oy);
}
// each layer in its pen's ink, in plotting order
function paint(c, r, k, ox, oy) {
  c.lineWidth = Math.max(0.5, +G.param('pen') * k); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const layer of r.layers) {
    c.strokeStyle = layer.pen === 2 ? PlottedField.INKS[ink2()] : PlottedField.INKS.black;
    c.beginPath();
    for (const s of layer.strokes) {
      c.moveTo(ox + s[0] * k, oy + s[1] * k);
      for (let i = 2; i < s.length; i += 2) c.lineTo(ox + s[i] * k, oy + s[i + 1] * k);
    }
    c.stroke();
  }
}

// ───────────────────────── exports ─────────────────────────
const fileBase = () => 'plotted-field-' + G.seed + (R.kind === 'map' ? '-map' : '-view-' + R.camera.view);
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function saveSVG() {
  if (!R) return;
  download(new Blob([PlottedField.svg(R, { pen: +G.param('pen'), ink2: ink2() })], { type: 'image/svg+xml' }), fileBase() + '.svg');
}
function savePNG() {
  if (!R) return;
  const k = 3000 / R.sheet.w, c = document.createElement('canvas');     // 3000 px across the sheet
  c.width = Math.round(R.sheet.w * k); c.height = Math.round(R.sheet.h * k);
  const x = c.getContext('2d'); x.fillStyle = '#f3efe6'; x.fillRect(0, 0, c.width, c.height);
  paint(x, R, k, 0, 0);
  c.toBlob((b) => download(b, fileBase() + '.png'));
}
