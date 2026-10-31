// 048 — Plotted Field: the panel, the sheet on screen and the exports.
// The piece itself is field.js. Keys: R new field · S save PNG · V save SVG · [ ] previous / next view.

let G, R = null, job = 0;
const QS = new URLSearchParams(location.search);
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile
const SHEET_KEYS = ['A4', 'A3', 'A2', 'A1'];
const canvas = document.getElementById('view'), ctx = canvas.getContext('2d');
const status = document.getElementById('status');

(function start() {
  const FV = 'The view', MO = 'The moment', GR = 'The grass', PA = 'The sheet';
  G = GenArt.create({
    title: 'Plotted Field',
    resetOnFinish: true,
    params: {
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
      sheet: { value: 1, options: { A4: 0, A3: 1, A2: 2, A1: 3 }, label: 'paper', group: PA },
      pen: { value: 0.3, min: 0.1, max: 0.8, step: 0.05, label: 'pen (mm)', group: PA },
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
  });
  window.addEventListener('resize', draw);
  reset();
})();

function options() {
  const p = (k) => +G.param(k);
  return {
    seed: G.seed, view: p('view'), fov: p('fov'), instant: p('instant'), wind: p('wind'), windTurn: p('windTurn'),
    light: p('light'), moon: p('moon'), moonHeight: p('moonHeight'), density: p('density'), body: p('body'),
    haze: p('haze'), hazeLength: p('hazeLength'), cutoff: p('cutoff'), sheet: SHEET_KEYS[p('sheet')] || 'A3', grain: p('grain'),
  };
}
function stepView(d) {
  const v = ((+G.param('view') - 1 + d + 25) % 25) + 1;
  G.params.view = v;
  if (G.gui) G.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  G.reset();
}
function reset() {
  const my = ++job;
  status.textContent = 'planting and drawing…';
  // let the message paint before the (≈1 s) build blocks the thread
  setTimeout(() => {
    if (my !== job) return;
    R = PlottedField.build(options());
    const s = R.stats;
    status.textContent = 'field ' + G.seed + ' · view ' + R.camera.view + '/25 · eye ' + R.camera.height.toFixed(2) + ' m · '
      + s.strokes.toLocaleString() + ' strokes · ' + s.ink.toFixed(0) + ' m of line · ≈' + Math.round(s.minutes) + ' min at the plotter';
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
  paint(ctx, R, k, ox, oy, '#1b1a1f');
}
function paint(c, r, k, ox, oy, ink) {
  c.strokeStyle = ink; c.lineWidth = Math.max(0.5, +G.param('pen') * k); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (const s of r.strokes) {
    c.moveTo(ox + s[0] * k, oy + s[1] * k);
    for (let i = 2; i < s.length; i += 2) c.lineTo(ox + s[i] * k, oy + s[i + 1] * k);
  }
  for (const pl of PlottedField.captionLines(r)) {
    c.moveTo(ox + pl[0].x * k, oy + pl[0].y * k);
    for (const p of pl.slice(1)) c.lineTo(ox + p.x * k, oy + p.y * k);
  }
  c.stroke();
}

// ───────────────────────── exports ─────────────────────────
const fileBase = () => 'plotted-field-' + G.seed + '-view-' + R.camera.view;
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function saveSVG() {
  if (!R) return;
  download(new Blob([PlottedField.svg(R, { pen: +G.param('pen') })], { type: 'image/svg+xml' }), fileBase() + '.svg');
}
function savePNG() {
  if (!R) return;
  const k = 3000 / R.sheet.w, c = document.createElement('canvas');     // 3000 px across the sheet
  c.width = Math.round(R.sheet.w * k); c.height = Math.round(R.sheet.h * k);
  const x = c.getContext('2d'); x.fillStyle = '#f3efe6'; x.fillRect(0, 0, c.width, c.height);
  paint(x, R, k, 0, 0, '#1b1a1f');
  c.toBlob((b) => download(b, fileBase() + '.png'));
}
