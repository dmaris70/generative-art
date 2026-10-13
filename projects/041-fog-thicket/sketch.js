// Fog Thicket — study and generator after a black-and-white photograph (one image supplied
// 2026-10-12; photographer and title not known, not asserted): bare saplings in fog over snow,
// a dark band of thicket across the middle, pale trees above, thin stems reaching down into white.
// MECHANISM: every plant is grown in metres, in 3-D, on a ground planted once, and projected
// through a camera; nothing is shaded and only the ground hides anything. Fog is a single law,
// p = exp(−distance · mean σ over the altitudes the sight line crosses), read as the chance that a
// stretch of line is inked at all. Tone is never drawn: the dark band is
// the height of the sheet onto which the twig zones of every depth project together, and the pale
// is where the air between the eye and the line has taken the ink.
// Views: drawing · strata (each stratum alone, the ground, the fog law, the whole) · construction.
// Registers: line (the plotter drawing; fog breaks the line) · tone (fog sets each line's grey and
// washes the snow and air by the same law).
// Cameras: eye (the reading) · low · raised · aerial · overhead — one world, planted once.
// Scales: stand (the photograph's distances) · monument (a valley and its ranges, thousands of trees).
// Keys: R new seed + new parameters · C next view · E next camera · T line / tone · S save PNG · V save SVG.

let G;
// Sheet formats. Portrait's field has the source's 625 : 960; landscape and panorama are for the
// monument scale (any scale may use any format).
const FORMATS = [[840, 1240], [1240, 900], [1800, 840]];
let W = 840, H = 1240;
const F = {};
function setFormat(i) {
  [W, H] = FORMATS[i] || FORMATS[0];
  Object.assign(F, { x0: 70, y0: 70, x1: W - 70, y1: H - 95 });
  F.w = F.x1 - F.x0; F.h = F.y1 - F.y0;
}
setFormat(0);
const WORK_ID = '041-fog-thicket';
const SOURCE_SEED = GenArt._hashStr(WORK_ID);
const PAPER = [246, 245, 241];
const PENS = { ink: '#1a1a1a', sepia: '#8a6a3d' };
// The tone register: the same law read as luminance. A line at survival p is ink·p + air·(1 − p);
// the snow and the water are washed toward the same air by the same p. One air, no hues.
const TONE = { ink: [26, 26, 26], air: [212, 214, 211], snow: [244, 244, 240], water: [198, 201, 200] };
const QN = 24;                                             // grey steps in the tone register
const EYE = 1.6;                                           // eye height, metres
const LC = 1.4;                                            // inking chunk, sheet units
const LETTERS = 'ABCDEFGH';

let S = 2, scene = null, pending = 0, castCache = null;
const TILE = (() => {
  try { const g = new URL(location.href).searchParams.get('gui'); return g === '0' || g === 'false' || g === 'off'; }
  catch (e) { return false; }
})();

// A URL without a seed opens on the work's own seed: the reading of the photograph.
(function () {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('seed')) { u.searchParams.set('seed', String(SOURCE_SEED)); history.replaceState(null, '', u.toString()); }
  } catch (e) { /* file:// without history */ }
})();

function setup() {
  pixelDensity(1);
  createCanvas(10, 10);
  if (TILE) document.body.classList.add('tile');
  G = GenArt.create({
    title: 'Fog Thicket',
    params: {
      view: { value: 0, options: { drawing: 0, strata: 1, construction: 2 }, label: 'view' },
      register: { value: 0, options: { 'line (plotter)': 0, 'tone (wash)': 1 }, label: 'register' },
      scale: { value: 0, options: { stand: 0, monument: 1 }, label: 'scale' },
      format: { value: 0, options: { portrait: 0, landscape: 1, panorama: 2 }, label: 'format' },
      camera: { value: 0, options: { eye: 0, low: 1, raised: 2, aerial: 3, overhead: 4 }, label: 'camera' },
      fog: { value: 0, options: { seeded: 0, aloft: 1, low: 2, bank: 3, clear: 4 }, label: 'fog' },
      mist: { value: 1, min: 0, max: 3, step: 0.05, label: 'fog amount' },
      ground: { value: 0, options: { seeded: 0, snow: 1, drift: 2, water: 3, roots: 4 }, label: 'ground' },
      hills: { value: 0, options: { seeded: 0, flat: 1, rolling: 2, high: 3, valley: 4, ridge: 5 }, label: 'ground form' },
      relief: { value: -1, min: -1, max: 1.6, step: 0.05, label: 'snow bank m (-1=seed)' },
      strata: { value: 0, min: 0, max: 4, step: 1, label: 'strata (0=seed)' },
      event: { value: 0, options: { seeded: 0, none: 1, clearing: 2, 'lone tree': 3 }, label: 'event' },
      density: { value: 1, min: 0.2, max: 2.5, step: 0.05, label: 'density' },
      horizon: { value: 0, min: 0, max: 0.8, step: 0.01, label: 'horizon (0=seed)' },
      wind: { value: 0, min: -1, max: 1, step: 0.05, label: 'wind' },
      pen: { value: 0.5, min: 0.3, max: 1.2, step: 0.05, label: 'pen' },
      tooth: { value: 0.8, min: 0, max: 2, step: 0.05, label: 'tooth' },
      res: { value: 2, options: { '840 px': 1, '1680 px': 2, '2520 px': 3, '3360 px': 4 }, label: 'output' },
    },
    onReset: reset,
    resetOnFinish: true,                                   // sliders repaint on release (monument renders are heavy)
  });
  if (G.gui) {
    const btn = G.gui.controllersRecursive().find((c) => c.property === 'randomize');
    if (btn) btn.object.randomize = randomizeAll;
    G.gui.add({ saveSVG }, 'saveSVG').name('Save SVG (V)');
  }
  noLoop();
  render();
}

// Randomize: a new seed and a new value for every drawing parameter; most stay on "seeded" so the
// seed's own plan speaks. View and output size stay.
function randomizeAll() {
  const v = G.params, r = Math.random;
  const q = (a, b, step) => +(Math.round((a + (b - a) * r()) / step) * step).toFixed(2);
  v.fog = r() < 0.7 ? 0 : 1 + Math.floor(r() * 4);
  v.ground = r() < 0.7 ? 0 : 1 + Math.floor(r() * 4);
  v.hills = r() < 0.75 ? 0 : 1 + Math.floor(r() * 5);
  v.relief = r() < 0.75 ? -1 : q(0, 1.4, 0.05);
  v.strata = r() < 0.75 ? 0 : 1 + Math.floor(r() * 4);
  v.event = r() < 0.8 ? 0 : 1 + Math.floor(r() * 3);
  v.mist = q(0.5, 1.8, 0.05);
  v.density = q(0.6, 1.6, 0.05);
  v.horizon = r() < 0.75 ? 0 : q(0.3, 0.75, 0.01);
  v.wind = r() < 0.6 ? 0 : q(-0.8, 0.8, 0.05);
  v.pen = q(0.4, 0.75, 0.05);
  v.tooth = q(0.3, 1.4, 0.05);
  for (const c of G.gui ? G.gui.controllersRecursive() : []) c.updateDisplay();
  G.randomize();
}

function reset() {
  clearTimeout(pending);
  pending = setTimeout(render, 40);
}

function render() {
  const t0 = performance.now();
  S = TILE ? 1.2 : G.param('res');
  setFormat(G.param('format'));
  // The fog may take most of a sheet but not all of it: below a floor of ink (a tenth of the
  // source reading's) the same air is thinned by half and the sheet re-inked, at most three times.
  // The test uses the expected ink (length × p), so both registers make the same decision.
  for (let pass = 0; pass < 4; pass++) {
    scene = compose();
    scene.fog.s0 *= Math.pow(0.5, pass);
    scene.thinned = pass;
    scene.lines = []; scene.expect = 0;
    scene.tone = G.param('register') === 1;
    plantAll(scene);
    if (scene.expect > INK_FLOOR * (F.w * F.h) / (700 * 1075) || G.param('mist') === 0) break;
  }
  groundMarks(scene);
  if (scene.mono) crestLines(scene);
  scene.out = buildView(scene, G.param('view'));
  const t1 = performance.now();
  resizeCanvas(Math.round(W * S), Math.round(H * S));
  paint(scene.out);
  fitCSS();
  let pts = 0; for (const l of scene.lines) pts += l.pts.length;
  console.log(`[041] seed ${G.seed}${scene.source ? ' (source reading)' : ''} · ${scene.strata.length} strata · ` +
    `${scene.nPlants} plants (${scene.nInked} in view) · camera ${scene.cam.name} · ${scene.lines.length} inked lines · ${pts} vertices · fog ${scene.fog.mode} · ` +
    `ground ${scene.ground} · ${scene.terrain.mode} / relief ${(scene.terrain.relief || 0).toFixed(2)} m · expected ink ${scene.expect | 0} · drawn ${inkLength(scene) | 0}${scene.thinned ? ' (air thinned ×' + scene.thinned + ')' : ''} · grow+ink ${(t1 - t0) | 0} ms · paint ${(performance.now() - t1) | 0} ms`);
}

const INK_FLOOR = 56000;                                  // sheet units of expected ink; ~1/10 of the source reading
function inkLength(sc) {
  let L = 0;
  for (const l of sc.lines) for (let i = 1; i < l.pts.length; i++) L += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]);
  return L;
}

// The p5 canvas holds the full-resolution sheet (what Save PNG writes); the screen shows a copy
// reduced by repeated halving so dense line averages to grey instead of beating into moiré.
let shown = null;
function fitCSS() {
  const pad = TILE ? 0 : 24, dpr = window.devicePixelRatio || 1;
  const k = Math.min((windowWidth - pad * 2) / W, (windowHeight - pad * 2) / H);
  const cw = Math.max(12, Math.round(W * k)), ch = Math.max(16, Math.round(H * k));   // a hidden pane reports 0 × 0
  const tw = Math.round(cw * dpr), th = Math.round(ch * dpr);
  const full = document.querySelector('canvas.p5Canvas') || document.querySelector('canvas');
  full.style.display = 'none';
  if (!shown) { shown = document.createElement('canvas'); shown.id = 'sheet'; full.parentNode.insertBefore(shown, full); }
  let src = full;
  while (src.width > tw * 2 && src.width > 4) {
    const half = document.createElement('canvas');
    half.width = Math.ceil(src.width / 2); half.height = Math.ceil(src.height / 2);
    const hc = half.getContext('2d');
    hc.imageSmoothingQuality = 'high';
    hc.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  shown.width = tw; shown.height = th;
  shown.style.width = cw + 'px'; shown.style.height = ch + 'px';
  const sc = shown.getContext('2d');
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(src, 0, 0, tw, th);
}

function windowResized() { if (scene) fitCSS(); }

// Capture phase: lil-gui stops keydown from leaving its panel.
window.addEventListener('keydown', (e) => {
  if (!G || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'r') randomizeAll();
  else if (k === 'c') {
    G.params.view = (G.param('view') + 1) % 3;
    for (const c of G.gui ? G.gui.controllersRecursive() : []) c.updateDisplay();
    G.reset();
  }
  else if (k === 'e') {
    G.params.camera = (G.param('camera') + 1) % CAMERAS.length;
    for (const c of G.gui ? G.gui.controllersRecursive() : []) c.updateDisplay();
    G.reset();
  }
  else if (k === 't') {
    G.params.register = 1 - G.param('register');
    for (const c of G.gui ? G.gui.controllersRecursive() : []) c.updateDisplay();
    G.reset();
  }
  else if (k === 's') saveCanvas('fog-thicket-' + G.seed, 'png');
  else if (k === 'v') saveSVG();
  else return;
  e.preventDefault();
}, true);

// ------------------------------------------------------------------ randomness

function rngFor(name) {
  const r = GenArt._mulberry32(GenArt._hashStr(G.seed + '/' + name));
  const R = () => r();
  R.range = (a, b) => a + (b - a) * r();
  R.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  R.chance = (p) => r() < p;
  R.pick = (arr) => arr[Math.floor(r() * arr.length)];
  R.gauss = () => (r() + r() + r() + r() - 2) / 0.5774;
  R.wpick = (items, w) => {
    let t = 0; for (const x of w) t += x;
    let u = r() * t;
    for (let i = 0; i < items.length; i++) { u -= w[i]; if (u <= 0) return items[i]; }
    return items[items.length - 1];
  };
  return R;
}

function h32(a, b) {
  let k = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  k ^= k >>> 15; k = Math.imul(k, 0x85ebca6b); k ^= k >>> 13; k = Math.imul(k, 0xc2b2ae35); k ^= k >>> 16;
  return (k >>> 0) / 4294967296;
}
function vn1(key, x) {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  const a = h32(key, i), b = h32(key, i + 1);
  return a + (b - a) * s;
}
function vn2(key, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const k = (i, j) => h32(key ^ Math.imul(j, 0x9e3779b1), i);
  const a = k(ix, iy), b = k(ix + 1, iy), c = k(ix, iy + 1), e = k(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}
function fbm2(key, x, y) { return 0.55 * vn2(key, x, y) + 0.3 * vn2(key + 7, x * 2.1, y * 2.1) + 0.15 * vn2(key + 13, x * 4.3, y * 4.3); }

// ------------------------------------------------------------------ the plan

// Species: what grows, how tall, how close it usually stands, how many to the square metre.
const SPECIES = {
  thicket: { H: 2.6, z: [3.8, 28], rho: 0.9, cap: 900, label: 'THICKET' },
  aspen: { H: 14, z: [10, 40], rho: 0.06, cap: 260, label: 'ASPEN' },
  fork: { H: 11, z: [8, 45], rho: 0.018, cap: 160, label: 'FORKED' },
  spruce: { H: 16, z: [8, 60], rho: 0.035, cap: 320, label: 'SPRUCE' },
  whip: { H: 9, z: [6, 30], rho: 0.012, cap: 90, label: 'WEEPING' },
  reed: { H: 0.9, z: [3.6, 10], rho: 0.35, cap: 500, label: 'REED' },
};
const SPECIES_KEYS = Object.keys(SPECIES);

function compose() {
  const R = rngFor('plan');
  const source = G.seed === SOURCE_SEED;
  // every seeded choice is drawn first, whatever the overrides; then the overrides apply
  const plan = {
    yh: R.range(0.32, 0.72),
    fogMode: R.wpick(['aloft', 'ground', 'bank', 'clear'], [4.5, 2.5, 2, 1]),
    s0: R.range(0.02, 0.036), hs: R.range(2, 4.5), hg: R.range(0.8, 2.2), hb: R.range(3, 9), wb: R.range(1.2, 3.5),
    ground: R.wpick(['snow', 'drift', 'water', 'roots'], [4.5, 2.5, 2, 1]),
    hill: R.wpick(['flat', 'rolling', 'high', 'valley', 'ridge'], [4.5, 2.5, 1.2, 1.5, 1.5]),
    lean: R.gauss() * 0.06,
    nStrata: R.wpick([1, 2, 3, 4], [1, 3, 3, 1.5]),
    event: R.wpick(['none', 'clearing', 'lone'], [5.5, 2.5, 2]),
    zShore: R.range(7, 16),
  };
  const cands = [];
  for (let i = 0; i < 4; i++) cands.push(stratumPlan(R, i));
  const ev = { lone: loneTree(R), clear: { zc: R.range(6, 20), x: R.range(0.25, 0.75), ru: R.range(0.25, 0.7), rz: R.range(2.5, 7) } };
  if (G.param('scale') === 1) {
    const gO = ['', 'snow', 'drift', 'water', 'roots'][G.param('ground')];
    if (gO) plan.ground = gO;
    const eO = ['', 'none', 'clearing', 'lone'][G.param('event')];
    if (eO) plan.event = eO;
    return composeMonument(plan);
  }

  if (source) {
    // the reading of the photograph: one row of thicket in front of a fogged stand of tall poles
    Object.assign(plan, { yh: 0.6, fogMode: 'aloft', s0: 0.0216, hs: 3.6, ground: 'snow', hill: 'flat', lean: 0.01, event: 'none' });
    cands.length = 0;
    cands.push({ sp: 'aspen', arr: 'scatter', z: [13, 32], rho: 0.13, Hm: 13.5, zone: 0.3, lean: 0 });
    cands.push({ sp: 'thicket', arr: 'scatter', z: [3.8, 26], rho: 0.85, Hm: 2.5, zone: 0.46, lean: 0 });
    plan.nStrata = 2;
  }

  const fogO = ['', 'aloft', 'ground', 'bank', 'clear'][G.param('fog')];
  if (fogO) plan.fogMode = fogO;
  const gO = ['', 'snow', 'drift', 'water', 'roots'][G.param('ground')];
  if (gO) plan.ground = gO;
  const hO = ['', 'flat', 'rolling', 'high', 'valley', 'ridge'][G.param('hills')];
  if (hO) plan.hill = hO;
  if (G.param('horizon') > 0) plan.yh = G.param('horizon');
  const eO = ['', 'none', 'clearing', 'lone'][G.param('event')];
  if (eO) plan.event = eO;
  const n = G.param('strata') > 0 ? Math.min(G.param('strata'), cands.length) : plan.nStrata;
  if (plan.ground === 'water') plan.hill = 'flat';

  const YH = F.y0 + plan.yh * F.h;
  const sc = {
    source, plan,
    YH, K0: (F.y1 - YH) * 3.6 / EYE, cx0: (F.x0 + F.x1) / 2,
    fog: { mode: plan.fogMode, s0: plan.s0 * G.param('mist'), hs: plan.hs, hg: plan.hg, hb: plan.hb, wb: plan.wb },
    ground: plan.ground,
    terrain: terrainPlan(plan),
    lean: plan.lean + G.param('wind') * 0.35,
    strata: cands.slice(0, n),
    event: plan.event,
    zShore: plan.zShore,
  };
  sc.water = { level: 0, is: (x, y) => y > 0.3 && y < sc.zShore };
  sc.strata.forEach((s, i) => { s.letter = LETTERS[i]; s.idx = i; });
  if (sc.event === 'lone') {
    const l = ev.lone, z = l.z[0];
    // the lone tree stands near, and is cut to keep its crown on the sheet
    l.Hm = Math.max(SPECIES[l.sp].H * 0.3, Math.min(l.Hm, EYE + (YH - F.y0 - 0.1 * F.h) * z / sc.K0));
    l.letter = LETTERS[sc.strata.length]; l.idx = sc.strata.length; l.lone = true;
    sc.strata.push(l);
  }
  if (sc.event === 'clearing') {
    const c = ev.clear;
    c.uc = (F.x0 + c.x * F.w - sc.cx0) * c.zc / sc.K0;
    c.ruM = c.ru * F.w * c.zc / sc.K0 / 2;
    sc.clear = c;
  }
  // the camera, the ground as a height field, and one traced sight line per cell (cached: they
  // depend on the ground and the camera, not on the fog)
  sc.cam = makeCamera(sc, CAMERAS[G.param('camera')]);
  sc.occludes = sc.terrain.mode !== 'flat' || sc.terrain.relief > 0;
  if (sc.occludes || G.param('register') === 1) {
    const k = [G.seed, ...['format', 'camera', 'hills', 'relief', 'ground', 'horizon', 'strata', 'event'].map((n) => G.param(n))].join('|');
    if (!castCache || castCache.k !== k) {
      sc.hf = buildHeightfield(sc);
      castCache = { k, hf: sc.hf, buf: castGround(sc) };
    }
    sc.hf = castCache.hf; sc.buf = castCache.buf;
  }
  return sc;
}

// The ground form, from its own stream so the rest of the plan is untouched by it. Every form
// carries snow: one or two banks across the view (a crest up to about a metre high) and low drifts.
// From an eye at 1.6 m a bank hides the ground for some metres behind it, so whatever stands
// there loses its base along the crest. That cut is the snow line; nothing draws it.
function terrainPlan(plan) {
  const R = rngFor('terrain');
  const T = {
    mode: plan.hill, key: (GenArt._hashStr(G.seed + '/hill') | 0),
    relief: R.range(0.3, 1.1),
    banks: [R.range(6, 14), R.range(14, 26)].slice(0, R.chance(0.35) ? 2 : 1),
    amp: { flat: 0, rolling: 3.5, high: 11, valley: R.range(5, 12), ridge: R.range(3, 9) }[plan.hill],
    uc: R.range(-0.14, 0.14), floor: R.range(0.02, 0.1), vW: R.range(0.12, 0.24),   // valley: as angles from the eye
    zr: R.range(8, 20), slope: R.range(-0.35, 0.35), wr: R.range(1.5, 4), tilt: R.range(-0.08, 0.08),
  };
  if (G.seed === SOURCE_SEED) { T.relief = 0.7; T.banks = [9]; }
  if (G.param('relief') >= 0) T.relief = G.param('relief');
  if (plan.ground === 'water') T.relief = 0;
  return T;
}

function stratumPlan(R, i) {
  const sp = R.wpick(SPECIES_KEYS, [3, 2.5, 1.5, 1.6, 1, 0.8]);
  const D = SPECIES[sp];
  const zn = R.range(D.z[0], D.z[0] + (D.z[1] - D.z[0]) * 0.4);
  const zf = Math.min(D.z[1] * 1.3, R.range(zn * 1.6, D.z[1]));
  return {
    sp, arr: R.wpick(['scatter', 'clump', 'row'], [5.5, 3, 1.5]),
    z: [zn, zf], rho: D.rho * R.range(0.5, 1.5), Hm: D.H * R.range(0.7, 1.3),
    zone: R.range(0.36, 0.56), lean: R.gauss() * 0.05,
    clumpL: R.range(3, 10), clumpT: R.range(0.45, 0.6),
    rows: R.int(1, 3), rowStep: R.range(1.5, 6),
  };
}

function loneTree(R) {
  const sp = R.pick(['aspen', 'fork', 'spruce', 'whip']);
  return { sp, arr: 'lone', z: [R.range(4.5, 7.5), 0], x: R.pick([R.range(0.18, 0.38), R.range(0.62, 0.82)]),
    rho: 0, Hm: SPECIES[sp].H * R.range(0.55, 0.85), zone: 0.45, lean: R.gauss() * 0.04 };
}

// ------------------------------------------------------------------ the world and the cameras

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Ground altitude, metres, at world (x, y): x across, y away from the reference eye. The ground
// under the eye stays at 0; forms grow with distance.
function groundAlt(sc, x, y) {
  const T = sc.terrain;
  if (T.mode === 'monument') return monumentAlt(sc, x, y);
  let A = 0;
  if (T.relief) {
    A += 0.25 * T.relief * (fbm2(T.key + 3, x / 7, y / 6) - 0.5) * 2 * clamp01((y - 3) / 5);
    for (let b = 0; b < T.banks.length; b++) {
      const yb = T.banks[b] * (1 + 0.35 * (fbm2(T.key + 11 + b, x / 9, 0.5) - 0.5)), w = 0.9 + 0.08 * yb;
      A += T.relief * (b ? 0.8 : 1) * Math.exp(-(((y - yb) / w) ** 2));
    }
  }
  if (T.mode === 'rolling' || T.mode === 'high') A += T.amp * (fbm2(T.key, x / 26, y / 22) - 0.38) * clamp01((y - 5) / 16) * 1.8;
  else if (T.mode === 'valley') {
    // a valley opening away from the eye: a floor, then sides that steepen away from it. Width is
    // an angle from the eye and height grows with distance, so its walls keep their slope at eye level.
    const yy = Math.max(1, y), d = Math.max(0, Math.abs(x / yy - T.uc) - T.floor);
    A += (T.amp * (yy / 20) * Math.pow(d / T.vW, 1.3) + 1.5 * (fbm2(T.key, x / 18, y / 18) - 0.5)) * clamp01((y - 4) / 12);
  } else if (T.mode === 'ridge') {
    // one ridge across the view, its crest nearer on one side: a rise, then a long fall behind
    const yr = Math.max(8, T.zr + T.slope * 2 * x);
    const rise = 1 / (1 + Math.exp(-(y - yr) / T.wr)), fall = Math.exp(-Math.max(0, y - yr - 2 * T.wr) / (T.wr * 8));
    A += T.amp * rise * (0.35 + 0.65 * fall) + T.tilt * x * clamp01((y - 5) / 16) + 1.2 * (fbm2(T.key, x / 15, y / 15) - 0.5) * rise;
  }
  return A;
}

// The reference eye: 1.6 m above the snow at the origin, looking level along +y. It fixes the
// world: every stand is planted across a wedge WEDGE times as wide as this eye's gaze, whatever
// camera then looks at it. From above, the wedge is the shape of the forest.
const WEDGE = 1.7;
const gazeHalf = (sc, y) => 0.5 * WEDGE * F.w * Math.max(0, y) / sc.K0;

const CAMERAS = ['eye', 'low', 'raised', 'aerial', 'overhead'];
const CAMERA_LABEL = { eye: 'EYE 1.6M', low: 'LOW 0.35M', raised: 'RAISED 7M', aerial: 'AERIAL 42M', overhead: 'OVERHEAD 150M' };
// A pinhole camera with pitch only (no roll, no yaw): position, pitch down, focal K (sheet units)
// and the sheet point of its axis.
function pinhole(name, wx, wy, wA, phi, K, px, py) {
  return { name, C: [wx, wy, wA], phi, cf: Math.cos(phi), sf: Math.sin(phi), K, px, py };
}
function makeCamera(sc, name) {
  if (name === 'eye') return pinhole(name, 0, 0, EYE, 0, sc.K0, sc.cx0, sc.YH);
  if (name === 'low') return pinhole(name, 0, 0, 0.35, 0, sc.K0, sc.cx0, F.y0 + 0.82 * F.h);
  // raised cameras stand behind the eye and look at the middle of the planted ground. They are
  // fitted to half the tallest stand in height, and in width to the wedge only as far as a fitting
  // depth (raised: under half-way, aerial: most of the way, overhead: all of it); beyond that the
  // stand runs off the sheet.
  const yN = Math.min(...sc.strata.map((s) => s.z[0])), yF = Math.max(...sc.strata.map((s) => (s.lone ? s.z[0] : s.z[1])));
  const yM = (yN + yF) / 2, Hx = Math.max(...sc.strata.map((s) => s.Hm));
  const [cy, cA] = { raised: [-6, 7], aerial: [-28, 42], overhead: [yM * 0.55, 150] }[name];
  const c = pinhole(name, 0, cy, cA, Math.atan2(cA, yM - cy), 1, 0, 0);
  const yFit = yN + (yF - yN) * { raised: 0.4, aerial: 0.7, overhead: 1 }[name];
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (let i = 0; i <= 16; i++) {
    const y = yN + (yF - yN) * i / 16, w = gazeHalf(sc, y);
    for (const x of [-w, -w / 2, 0, w / 2, w]) for (const h of [0, 0.5 * Hx]) {
      const q = project({ cam: c }, x, y, groundAlt(sc, x, y) + h);
      if (!q) continue;
      if (y <= yFit + 1e-6) { X0 = Math.min(X0, q[0]); X1 = Math.max(X1, q[0]); }
      Y0 = Math.min(Y0, q[1]); Y1 = Math.max(Y1, q[1]);
    }
  }
  c.px = F.x0 + F.w / 2 - 0;                               // the axis is on x = 0, the stand is symmetric about it
  if (name === 'overhead') {
    c.K = Math.min(0.94 * F.w / (X1 - X0), 0.94 * F.h / (Y1 - Y0));
    c.py = F.y0 + F.h / 2 - c.K * (Y0 + Y1) / 2;
  } else {
    // sized by width alone; the middle of the stand sits a little below the sheet's middle
    c.K = 0.94 * F.w / (X1 - X0);
    const m = project({ cam: { ...c, K: 1, px: 0, py: 0 } }, 0, yM, groundAlt(sc, 0, yM));
    c.py = F.y0 + 0.58 * F.h - c.K * m[1];
  }
  return c;
}
// World → [sheet x, sheet y, depth along the axis, distance from the camera]; null behind the camera.
function project(sc, x, y, A) {
  const c = sc.cam, dx = x - c.C[0], dy = y - c.C[1], dA = A - c.C[2];
  const t = dy * c.cf - dA * c.sf;
  if (t < (sc.near || 0.3)) return null;
  return [c.px + c.K * dx / t, c.py - c.K * (dy * c.sf + dA * c.cf) / t, t, Math.hypot(dx, dy, dA)];
}

// Fog density by altitude. Fog aloft thickens with height up to its top (22 m), above which the
// air is nearly clear, so a camera above the fog looks down through it.
const FOG_TOP = 22;
function sigma(f, A) {
  A = Math.max(0, A);
  if (f.mode === 'aloft') return A < FOG_TOP ? f.s0 * (0.35 + A / f.hs) : f.s0 * 0.15;
  if (f.mode === 'ground') return f.s0 * (0.12 + 3.2 * Math.exp(-A / f.hg));
  if (f.mode === 'bank') return f.s0 * (0.12 + 2.6 * Math.exp(-(((A - f.hb) / f.wb) ** 2)));
  // the monument's fogs, at the scale of a valley
  if (f.mode === 'valley') return f.s0 * (0.25 + 5 * Math.exp(-A / f.hg));
  if (f.mode === 'ceiling') return f.s0 * (0.25 + 4 / (1 + Math.exp(-(A - f.ceil) / (0.08 * f.ceil + 5))));
  if (f.mode === 'belt') return f.s0 * (0.25 + 5 * Math.exp(-(((A - f.hb) / f.wb) ** 2)));
  if (f.mode === 'haze') return f.s0 * (0.6 + 0.4 * Math.exp(-A / 400));
  return f.s0 * 0.25;
}
// The law: survival along a sight line = exp(−distance × mean σ over the altitudes it crosses).
function fogPath(sc, dist, A0, A1) {
  let m = 0;
  for (let i = 0; i < 6; i++) m += sigma(sc.fog, A0 + (A1 - A0) * (i + 0.5) / 6);
  return Math.exp(-dist * m / 6);
}
const fogAt = (sc, dist, A) => fogPath(sc, dist, sc.cam.C[2], A);

// The ground as a sampled height field (0.45 m), for tracing sight lines; exact outside it.
function buildHeightfield(sc) {
  const d = 0.45, yA = -40, yB = 140, xr = gazeHalf(sc, yB) + 10;
  const nx = Math.ceil(2 * xr / d) + 1, ny = Math.ceil((yB - yA) / d) + 1, Z = new Float32Array(nx * ny);
  let max = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = groundAlt(sc, -xr + i * d, yA + j * d);
    Z[j * nx + i] = v; if (v > max) max = v;
  }
  return { grids: [{ d, yA, xr, nx, ny, Z, max }], max };
}
function gAt(sc, x, y) {
  for (const H of sc.hf.grids) {
    const u = (x + H.xr) / H.d, v = (y - H.yA) / H.d;
    if (u < 0 || v < 0 || u >= H.nx - 1 || v >= H.ny - 1) continue;
    const i = u | 0, j = v | 0, a = u - i, b = v - j, k = j * H.nx + i, Z = H.Z;
    return Z[k] * (1 - a) * (1 - b) + Z[k + 1] * a * (1 - b) + Z[k + H.nx] * (1 - a) * b + Z[k + H.nx + 1] * a * b;
  }
  return groundAlt(sc, x, y);
}

// One sight line per 1.5-unit cell of the field, traced to the ground. The distance at which it
// meets the ground is what hides the lines behind a bank, a ridge or a valley wall, from any
// camera; the same trace is the tone register's wash.
function castGround(sc) {
  const CELL = sc.mono ? 2 : 1.5, grow = sc.mono ? 0.02 : 0.012, tMax = sc.mono ? sc.terrain.Ymax * 2.5 : 700;
  const c = sc.cam, nx = Math.ceil(F.w / CELL), ny = Math.ceil(F.h / CELL);
  const D = new Float32Array(nx * ny).fill(Infinity), HA = new Float32Array(nx * ny), HY = new Float32Array(nx * ny), HX = new Float32Array(nx * ny);
  const top = sc.hf.max + 0.5, [cx, cy, cA] = c.C;
  for (let j = 0; j < ny; j++) {
    const Y = (c.py - (F.y0 + (j + 0.5) * CELL)) / c.K;
    for (let i = 0; i < nx; i++) {
      const X = (F.x0 + (i + 0.5) * CELL - c.px) / c.K;
      let dx = X, dy = c.cf + Y * c.sf, dA = -c.sf + Y * c.cf;
      const L = Math.hypot(dx, dy, dA); dx /= L; dy /= L; dA /= L;
      const horiz = Math.sqrt(1 - dA * dA), down = Math.max(0, -dA);
      let t = 0.3, prev = t;
      for (let k = 0; k < 900; k++) {
        const A = cA + dA * t;
        if ((A > top && dA >= 0) || t > tMax) break;
        const h = A - gAt(sc, cx + dx * t, cy + dy * t);
        if (h <= 0) {
          let lo = prev, hi = t;
          for (let b = 0; b < 6; b++) {
            const m = (lo + hi) / 2;
            if (cA + dA * m - gAt(sc, cx + dx * m, cy + dy * m) <= 0) hi = m; else lo = m;
          }
          const n = j * nx + i;
          D[n] = hi; HA[n] = cA + dA * hi; HY[n] = cy + dy * hi; HX[n] = cx + dx * hi;
          break;
        }
        prev = t;
        t += Math.max(0.1 + grow * t, 0.5 * h / (down + 0.8 * horiz));
      }
    }
  }
  return { nx, ny, D, HA, HY, HX, cell: CELL };
}
// A point at sheet (sx, sy), dist metres from the camera, is hidden when its sight line meets the
// ground first.
function hidden(sc, sx, sy, dist) {
  const B = sc.buf;
  if (!B || !sc.occludes) return false;
  const i = Math.floor((sx - F.x0) / B.cell), j = Math.floor((sy - F.y0) / B.cell);
  if (i < 0 || j < 0 || i >= B.nx || j >= B.ny) return false;
  return dist > B.D[j * B.nx + i] + 0.3 + 0.01 * dist;
}

// ------------------------------------------------------------------ growth (in metres, in 3-D)

// A turtle in a vertical plane of azimuth th through its start: a = 0 is straight up, positive
// leans toward th. Each branch has its own plane, so a plant is a 3-D body any camera can see.
function walk(R, p, a, len, n, o, th) {
  const ct = Math.cos(th), stt = Math.sin(th), st = len / n;
  let [x, y, h] = p;
  const pts = [[x, y, h]], ang = [a];
  for (let i = 0; i < n; i++) {
    a += R.gauss() * (o.wig || 0) + (o.curl || 0) + (o.wind || 0) * ct;
    a -= a * (o.pull || 0);
    if (o.droop) a += o.droop * (a >= 0 ? 1 : -1) * (0.3 + Math.sin(Math.abs(a)));
    a = Math.max(-Math.PI, Math.min(Math.PI, a));
    const s = Math.sin(a) * st;
    x += s * ct; y += s * stt; h += Math.cos(a) * st;
    pts.push([x, y, h]); ang.push(a);
  }
  return { pts, ang, th };
}
const br = (w, d0, d1, o) => ({ pts: w.pts, d0, d1, o });
const side = (R) => (R() < 0.5 ? -1 : 1);
const TAU = Math.PI * 2, GOLD = 2.39996;
const turn = (R, th, sd) => th + R.gauss() * sd;           // a child's plane: near its parent's

const GROW = {
  // a clump of whips from one root: bare below, a zone of upward twigs above
  thicket(R, Hm, st, lean) {
    const out = [], ns = R.int(3, 9), wind = lean * 0.03;
    for (let s = 0; s < ns; s++) {
      const len = Hm * R.range(0.6, 1.25), th = R() * TAU;
      const w = walk(R, [R.gauss() * 0.1, R.gauss() * 0.1, 0], lean * Math.cos(th) + Math.abs(R.gauss()) * 0.26, len, 26,
        { wig: 0.04, pull: 0.035, curl: R.gauss() * 0.006, wind }, th);
      out.push(br(w, 0.012 * len / Hm, 0.003, 1));
      if (R.chance(0.3)) {                                 // a low fork: the V of two whips from one stem
        const i = R.int(3, 8);
        const f = walk(R, w.pts[i], w.ang[i] + side(R) * R.range(0.2, 0.5), len * R.range(0.5, 0.8), 20, { wig: 0.04, pull: 0.03, wind }, turn(R, th, 0.6));
        out.push(br(f, 0.007, 0.002, 1));
      }
      const tz = st.zone + R.gauss() * 0.06;
      for (let i = 1; i < 26; i++) {
        const t = i / 26;
        if (t < tz || !R.chance(0.5)) continue;
        const L = len * R.range(0.1, 0.32) * (1.25 - t);
        const tw = walk(R, w.pts[i], w.ang[i] + side(R) * R.range(0.35, 1.05), L, 7, { wig: 0.08, pull: 0.035, wind }, turn(R, th, 1.1));
        out.push(br(tw, 0.005, 0.0015, 2));
        for (let k = 2; k < 7; k++) {
          if (!R.chance(0.35)) continue;
          const t2 = walk(R, tw.pts[k], tw.ang[k] + side(R) * R.range(0.3, 0.7), L * R.range(0.25, 0.5), 4, { wig: 0.1, pull: 0.12 }, turn(R, tw.th, 1.1));
          out.push(br(t2, 0.002, 0.001, 3));
        }
      }
    }
    return out;
  },
  // one pole; short upward limbs from a third of the way up, spiralling round it
  aspen(R, Hm, st, lean) {
    const out = [], th0 = R() * TAU;
    const tr = walk(R, [0, 0, 0], lean * 0.5 + R.gauss() * 0.03, Hm, 44, { wig: 0.012, pull: 0.04 }, 0);
    out.push(br(tr, 0.009 * Hm, 0.02, 1));
    const b0 = R.range(0.18, 0.4);
    for (let i = 1; i < 44; i++) {
      const t = i / 44;
      if (t < b0 || !R.chance(0.38)) continue;
      const L = Hm * R.range(0.1, 0.26) * (1.25 - t), th = th0 + i * GOLD;
      const lb = walk(R, tr.pts[i], R.range(0.4, 0.85), L, 12, { wig: 0.05, pull: 0.06, wind: lean * 0.02 }, th);
      out.push(br(lb, 0.0022 * Hm, 0.004, 2));
      for (let k = 2; k < 12; k++) {
        if (!R.chance(0.4)) continue;
        const sb = walk(R, lb.pts[k], lb.ang[k] + side(R) * R.range(0.35, 0.8), L * R.range(0.2, 0.45), 5, { wig: 0.08, pull: 0.08 }, turn(R, th, 1));
        out.push(br(sb, 0.004, 0.0015, 3));
      }
    }
    return out;
  },
  // every limb ends in two (now and then three), each in its own plane
  fork(R, Hm, st, lean) {
    const out = [], maxD = R.int(5, 7);
    const rec = (p, a, len, d, depth, th) => {
      const w = walk(R, p, a, len, Math.max(3, Math.round(len / Hm * 34)), { wig: 0.045, pull: 0.03, wind: lean * 0.02 }, th);
      out.push(br(w, d, d * 0.72, depth < 2 ? 1 : depth < 4 ? 2 : 3));
      if (depth === maxD) return;
      const end = w.pts[w.pts.length - 1], ae = w.ang[w.ang.length - 1];
      const k = R.chance(0.18) ? 3 : 2, spread = R.range(0.25, 0.6), th2 = turn(R, th, 0.9);
      for (let c = 0; c < k; c++) {
        const a2 = ae + (k === 2 ? (c ? 1 : -1) * spread * R.range(0.6, 1.25) : (c - 1) * spread);
        rec(end, a2, len * R.range(0.62, 0.8), d * 0.72, depth + 1, th2);
      }
    };
    rec([0, 0, 0], lean * 0.5 + R.gauss() * 0.04, Hm * R.range(0.22, 0.35), 0.02 * Hm, 0, R() * TAU);
    return out;
  },
  // a spire of drooping whorls of three, shortest at the top
  spruce(R, Hm, st, lean) {
    const out = [], th0 = R() * TAU;
    const tr = walk(R, [0, 0, 0], lean * 0.3, Hm, 36, { wig: 0.006, pull: 0.1 }, 0);
    out.push(br(tr, 0.016 * Hm, 0.003, 1));
    const nodes = R.int(26, 42);
    for (let j = 0; j < nodes; j++) {
      const t = 0.05 + 0.92 * j / nodes, i = Math.round(t * 36);
      const L = Hm * 0.2 * Math.pow(1 - t, 0.9) * R.range(0.75, 1.1);
      if (L < 0.05) continue;
      for (let m = 0; m < 3; m++) {
        const th = th0 + j * GOLD + m * TAU / 3;
        const lb = walk(R, tr.pts[i], R.range(1.6, 2.05), L, 6, { wig: 0.05, droop: 0.03 }, th);
        out.push(br(lb, 0.004, 0.0015, 2));
        for (let k = 2; k < 6; k++) {
          if (!R.chance(0.3)) continue;
          out.push(br(walk(R, lb.pts[k], lb.ang[k] - side(R) * 0.6, L * 0.3, 3, { wig: 0.1 }, turn(R, th, 0.8)), 0.002, 0.001, 3));
        }
      }
    }
    return out;
  },
  // a short trunk, a few limbs, and strands that rise, arch and hang
  whip(R, Hm, st, lean) {
    const out = [];
    const tr = walk(R, [0, 0, 0], lean * 0.5 + R.gauss() * 0.05, Hm * R.range(0.25, 0.4), 12, { wig: 0.03, pull: 0.05 }, 0);
    out.push(br(tr, 0.03 * Hm, 0.018 * Hm, 1));
    const e = tr.pts[tr.pts.length - 1], nl = R.int(3, 6), th0 = R() * TAU;
    for (let l = 0; l < nl; l++) {
      const th = th0 + l * TAU / nl + R.gauss() * 0.3;
      const lb = walk(R, e, R.range(0.15, 0.7), Hm * R.range(0.25, 0.42), 12, { wig: 0.04, pull: 0.02 }, th);
      out.push(br(lb, 0.012 * Hm, 0.004 * Hm, 1));
      for (let i = 4; i <= 12; i++) {
        if (!R.chance(0.55)) continue;
        const s = walk(R, lb.pts[i], lb.ang[i] + R.range(-0.4, 0.4), Hm * R.range(0.35, 0.7), 16,
          { wig: 0.03, droop: R.range(0.12, 0.2), wind: lean * 0.04 }, turn(R, th, 0.6));
        out.push(br(s, 0.003, 0.0012, 2));
      }
    }
    return out;
  },
  // a tuft of near-straight blades
  reed(R, Hm, st, lean) {
    const out = [], n = R.int(5, 15);
    for (let b = 0; b < n; b++) {
      const th = R() * TAU;
      out.push(br(walk(R, [R.gauss() * 0.04, R.gauss() * 0.04, 0], lean * 2 * Math.cos(th) + Math.abs(R.gauss()) * 0.3, Hm * R.range(0.4, 1), 5,
        { curl: R.gauss() * 0.03 }, th), 0.004, 0.0015, 2));
    }
    return out;
  },
};

// ------------------------------------------------------------------ planting

function plantAll(sc) {
  if (sc.mono) return plantMonument(sc);
  const plants = [];
  const dens = G.param('density');
  const yMin = sc.ground === 'water' ? sc.zShore : 0;
  for (const st of sc.strata) {
    const R = rngFor('stratum/' + st.idx + '/' + st.sp);
    const D = SPECIES[st.sp];
    const put = (x, y) => {
      if (sc.clear) {
        const c = sc.clear;
        if (((x - c.uc) / c.ruM) ** 2 + ((y - c.zc) / c.rz) ** 2 < 1) return;
      }
      plants.push({ st, x, y, Hm: st.Hm * (st.lone ? 1 : R.range(0.75, 1.3)), seed: R() });
    };
    if (st.arr === 'lone') {
      const y = st.z[0];
      put((F.x0 + st.x * F.w - sc.cx0) * y / sc.K0, y);
      continue;
    }
    let zn = st.z[0], zf = st.z[1];
    if (yMin) { zn = Math.max(zn, yMin); zf = Math.max(zf, zn + (st.sp === 'reed' ? 3 : 6)); if (st.sp === 'reed') zf = Math.min(zf, zn + 3); }
    if (st.arr === 'row') {
      for (let r = 0; r < st.rows; r++) {
        const y = zn + (zf - zn) * (st.rows === 1 ? 0.35 : r / (st.rows - 1));
        const step = st.rowStep * Math.sqrt(st.Hm / 6) / Math.sqrt(dens);
        const off = R.range(0, step);
        let cnt = 0;
        for (let x = -gazeHalf(sc, y) + off; x < gazeHalf(sc, y) && cnt < D.cap * 1.6; x += step, cnt++) put(x + R.gauss() * step * 0.08, y + R.gauss() * 0.15);
      }
      continue;
    }
    // Plants are drawn one after another from the stratum's stream, so more density only adds
    // plants after the ones already there; a plant's own stream and its ink keys are its own.
    const area = WEDGE * F.w / (2 * sc.K0) * (zf * zf - zn * zn);
    let n = Math.min(D.cap * 1.6, Math.round(st.rho * dens * area));
    const key = GenArt._hashStr(G.seed + '/clump/' + st.idx) | 0;
    const tries = st.arr === 'clump' ? n * 4 : n;
    for (let k = 0; k < tries && n > 0; k++) {
      const y = Math.sqrt(zn * zn + R() * (zf * zf - zn * zn));
      const x = (R() * 2 - 1) * gazeHalf(sc, y);
      if (st.arr === 'clump' && fbm2(key, x / st.clumpL, y / st.clumpL) < st.clumpT) continue;
      put(x, y); n--;
    }
  }
  plants.sort((a, b) => b.y - a.y);
  sc.nPlants = plants.length;
  sc.nInked = 0;
  for (const pl of plants) inkPlant(sc, pl);
}

// The ink of every line is keyed by its plant, branch, pass and kind, never by drawing order.
const inkKey = (pk, bi, kind) => (h32(pk ^ Math.imul(kind + 1, 0x9e3779b1), bi) * 4294967296) | 0;

function inkPlant(sc, pl) {
  const st = pl.st, sp = pl.sp || st.sp, pk = Math.floor(pl.seed * 4294967296) | 0;
  const g = groundAlt(sc, pl.x, pl.y), base = project(sc, pl.x, pl.y, g);
  if (!base) return;
  const s = sc.cam.K / base[2], hp = pl.Hm * s, reach = hp * 1.3;
  if (base[0] < F.x0 - reach || base[0] > F.x1 + reach || base[1] < F.y0 - reach || base[1] > F.y1 + reach) return;
  if (sc.mono) {
    // a tree the fog has wholly taken, or the ground wholly hides, is not grown
    const top = project(sc, pl.x, pl.y, g + pl.Hm), mid = project(sc, pl.x, pl.y, g + pl.Hm * 0.5);
    if (Math.max(fogAt(sc, base[3], g), top ? fogAt(sc, top[3], g + pl.Hm) : 0) < 0.025) return;
    if (top && mid && hidden(sc, base[0], base[1], base[3]) && hidden(sc, mid[0], mid[1], mid[3]) && hidden(sc, top[0], top[1], top[3])) return;
  }
  sc.nInked++;
  const R = rngFor('plant/' + (pk >>> 0));
  const lean = sc.lean + st.lean + R.gauss() * 0.03;
  // near trees in full; far ones (under 40 sheet units tall, monument only) as the distant mark
  const branches = sc.mono && hp < 40 ? GLYPH[sp](R, pl.Hm, hp, lean) : GROW[sp](R, pl.Hm, st, lean);
  const toSheet = (pts, f) => {
    const P = [];
    for (const p of pts) { const q = f(p); if (!q) return null; P.push(q); }
    return P;
  };
  branches.forEach((b, bi) => {
    const P = toSheet(b.pts, ([dx, dy, h]) => {
      const q = project(sc, pl.x + dx, pl.y + dy, g + h);
      return q && [q[0], q[1], hidden(sc, q[0], q[1], q[3]) ? 0 : fogAt(sc, q[3], g + h)];
    });
    if (P) inkBranch(sc, P, b, s, st.idx, 0, inkKey(pk, bi, 0));
  });
  if (sc.ground === 'water') {
    // the mirror image in the water plane, seen only where its sight line meets water: in level
    // bands, each kept or lost and slid sideways
    const C = sc.cam.C, Wl = sc.water.level, rk = GenArt._hashStr(G.seed + '/ripple') | 0;
    const mirror = (x, y, A) => {                           // where the sight line to the image meets the water
      const Am = 2 * Wl - A, f = (C[2] - Wl) / (C[2] - Am);
      return [C[0] + f * (x - C[0]), C[1] + f * (y - C[1]), Am];
    };
    const [bx, by] = mirror(pl.x, pl.y, g), [tx, ty] = mirror(pl.x, pl.y, g + pl.Hm);
    if (C[2] > Wl && (sc.water.is(bx, by) || sc.water.is(tx, ty))) {
      branches.forEach((b, bi) => {
        const P = toSheet(resample3(b.pts, 2 / s), ([dx, dy, h]) => {
          const x = pl.x + dx, y = pl.y + dy, [xh, yh, Am] = mirror(x, y, g + h);
          const q = project(sc, x, y, Am);
          if (!q) return null;
          const range = Math.hypot(xh - C[0], yh - C[1]), band = Math.floor(yh / (0.2 + 0.004 * range));
          if (!sc.water.is(xh, yh) || h32(rk, band) > 0.55) return [q[0], q[1], 0];
          const th = (yh - C[1]) * sc.cam.cf - (Wl - C[2]) * sc.cam.sf, dW = Math.hypot(xh - C[0], yh - C[1], Wl - C[2]);
          return [q[0] + (h32(rk + 1, band) - 0.5) * (0.08 + 0.002 * range) * sc.cam.K / th, q[1],
            hidden(sc, q[0], q[1], dW) ? 0 : fogPath(sc, q[3], C[2], g + h) * 0.6];
        });
        if (P) inkBranch(sc, P, b, s, st.idx, 1, inkKey(pk, bi, 1));
      });
    }
  }
  if (sc.ground === 'roots') {
    // the same grammar, grown down into the ground, seen through it
    const RR = rngFor('roots/' + (pk >>> 0));
    const roots = GROW[sp === 'reed' ? 'reed' : 'fork'](RR, pl.Hm * (sp === 'reed' ? 0.6 : 0.45), st, 0);
    const pBase = fogAt(sc, base[3], g);
    roots.forEach((b, bi) => {
      const P = toSheet(b.pts, ([dx, dy, h]) => {
        const q = project(sc, pl.x + dx * 1.3, pl.y + dy * 1.3, g - h);
        return q && [q[0], q[1], pBase * Math.exp(-h / (pl.Hm * 0.4))];
      });
      if (P) inkBranch(sc, P, b, s, st.idx, 2, inkKey(pk, bi, 2));
    });
  }
}

function resample3(P, step) {
  const out = [P[0]];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}

// One branch → its passes. A pen has no width, so a stem is as many parallel passes as its
// diameter holds; the outer passes end first (the taper) and fog takes them first (contrast).
function inkBranch(sc, P, b, s, stIdx, kind, key) {
  const n = P.length;
  if (n < 2) return;
  const pen = G.param('pen'), gap = pen * 0.9;
  const dS = (t) => (b.d0 + (b.d1 - b.d0) * t) * s;
  const np = Math.max(1, Math.min(sc.mono ? 12 : 7, Math.round(dS(0) / gap)));
  const thin = 1 + 0.5 * (b.o - 1);
  const N = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(n - 1, i + 1)];
    const dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy) || 1;
    N.push([-dy / L, dx / L]);
  }
  for (let j = 0; j < np; j++) {
    const off = (j - (np - 1) / 2) * gap, rank = Math.abs(off) / gap;
    const Q = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const inside = Math.abs(off) <= dS(t) / 2 + gap * 0.25;
      const p = P[i][2] > 0 && inside ? Math.pow(P[i][2], thin * (1 + 0.8 * rank)) : 0;
      Q[i] = [P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off, p];
    }
    dashLine(sc, Q, (h32(key, j) * 4294967296) | 0, b.o, stIdx, kind);
  }
}

// Fog as a law of inking: walk the line in short chunks; a chunk is inked when a coherent noise
// along the line falls under p. At p = 1 the line is whole, at p = 0 it is gone, between it breaks.
// In the tone register the line is never broken by chance: it is split where its grey step
// changes, and each piece is drawn at its own grey.
function dashLine(sc, Q, key, order, stIdx, kind) {
  let run = null, arc = 0, ci = 0, rq = 0;
  const close = () => { if (run && run.length >= 2) sc.lines.push({ pts: run, o: order, st: stIdx, kind, key, q: rq }); run = null; };
  for (let i = 0; i + 1 < Q.length; i++) {
    const a = Q[i], b = Q[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const m = Math.max(1, Math.ceil(L / LC));
    for (let k = 0; k < m; k++, ci++) {
      const tm = (k + 0.5) / m;
      const p = a[2] + (b[2] - a[2]) * tm;
      const xm = a[0] + dx * tm, ym = a[1] + dy * tm;
      const inF = xm >= F.x0 && xm <= F.x1 && ym >= F.y0 && ym <= F.y1;
      if (inF && p > 0) sc.expect += p * L / m;
      const t0 = k / m;
      let on;
      if (sc.tone) {
        const q = Math.round(p * QN);
        on = q > 0 && inF;
        if (on && run && q !== rq) { run.push(clampF(a[0] + dx * t0, a[1] + dy * t0)); close(); }
        if (on) rq = q;
      } else {
        const v = 0.62 * vn1(key, (arc + L * tm) / 3.2) + 0.38 * h32(key ^ 0x2545f491, ci);
        on = p > 0 && v < p && inF;
      }
      if (on) {
        if (!run) run = [clampF(a[0] + dx * t0, a[1] + dy * t0)];
        if (k === m - 1) run.push(clampF(b[0], b[1]));
      } else if (run) {
        if (k > 0) run.push(clampF(a[0] + dx * t0, a[1] + dy * t0));
        close();
      }
    }
    arc += L;
  }
  close();
}
const clampF = (x, y) => [Math.max(F.x0, Math.min(F.x1, x)), Math.max(F.y0, Math.min(F.y1, y))];

// The ground itself is not drawn, except: drifted snow (a few broken contours across the wedge)
// and, on water, a scatter of short level ripples.
function groundMarks(sc) {
  const R = rngFor('ground'), gk = GenArt._hashStr(G.seed + '/marks') | 0;
  if (sc.mono) {
    // on the lake, short level ripples where the traced sight lines meet water
    if (sc.ground !== 'water' || !sc.buf) return;
    const B = sc.buf;
    for (let i = 0; i < 260; i++) {
      const n = Math.floor(R() * B.nx * B.ny), L = R.range(4, 30);
      if (!isFinite(B.D[n]) || !sc.water.is(B.HX[n], B.HY[n])) continue;
      const sx = F.x0 + (n % B.nx + 0.5) * B.cell, sy = F.y0 + (Math.floor(n / B.nx) + 0.5) * B.cell, p = fogAt(sc, B.D[n], sc.water.level);
      dashLine(sc, [[sx, sy, p], [sx + L, sy, p]], inkKey(gk, 2000 + i, 4), 2, -1, 3);
    }
    return;
  }
  if (sc.ground === 'drift') {
    const n = R.int(12, 30);
    for (let i = 0; i < n; i++) {
      const yd = Math.sqrt(16 + R() * (1600 - 16)), w = gazeHalf(sc, yd), xa = R.range(-1, 0.6) * w, len = w * R.range(0.3, 1.1);
      const k = inkKey(gk, i, 3), Q = [], step = Math.max(0.1, 4 * yd / sc.K0);
      for (let x = xa; x <= xa + len; x += step) {
        const y = yd + 0.04 * yd * (vn1(k, x / 6) - 0.5), A = groundAlt(sc, x, y) + 0.02;
        const q = project(sc, x, y, A);
        if (!q) continue;
        Q.push([q[0], q[1], hidden(sc, q[0], q[1], q[3]) ? 0 : fogAt(sc, q[3], A) * 0.55]);
      }
      dashLine(sc, Q, k, 2, -1, 3);
    }
  }
  if (sc.ground === 'water') {
    const n = R.int(30, 70);
    for (let i = 0; i < n; i++) {
      const yw = 1 / (1 / 2.5 + R() * (1 / sc.zShore - 1 / 2.5)), x = R.range(-1, 1) * gazeHalf(sc, yw), L = (4 + R() * 40) * yw / sc.K0;
      const a = project(sc, x, yw, 0), b = project(sc, x + L, yw, 0);
      if (!a || !b) continue;
      dashLine(sc, [[a[0], a[1], fogAt(sc, a[3], 0)], [b[0], b[1], fogAt(sc, b[3], 0)]], inkKey(gk, 1000 + i, 4), 2, -1, 3);
    }
  }
}

// ------------------------------------------------------------------ monument: the same law at the scale of a landscape

// At monument scale the eye stands on a hill above a valley; behind the valley, three to six
// ranges, each farther and taller. The forest is planted over all of it by zone and altitude, a few
// thousand trees; near trees are grown in full, far ones as the engraver's distant mark, by their
// size on the sheet. Nothing about a range is drawn but its crest, and the fog decides how much of
// each range is left: the ranges pale in order because the air between them is the only tone.
const SPECIES_M = {
  thicket: { H: 2.8 }, aspen: { H: 17 }, fork: { H: 15 }, spruce: { H: 24 }, whip: { H: 11 }, reed: { H: 1.1 },
};
const HFOV = [36, 46, 62].map((d) => d * Math.PI / 180); // by format: portrait, landscape, panorama
const THIN0 = 600;                                         // beyond this, planting thins as (THIN0 / y)²

function composeMonument(plan) {
  const R = rngFor('monument');
  const T = {
    mode: 'monument', key: (GenArt._hashStr(G.seed + '/monument') | 0), relief: 0,
    V: R.range(40, 120), Ld: R.range(40, 140), ridges: [],
    treeline: R.range(0.45, 0.8), rho: R.range(0.003, 0.0055), fg: R.range(2, 6),
  };
  // Each range is taller in proportion to its distance, by a slope that grows with its rank, so
  // every range shows over the one before it by about the same angle: the ranges stack.
  const nR = R.int(3, 6), lift = R.range(0.045, 0.07), stepA = R.range(0.018, 0.032);
  let y = R.range(1500, 3000);
  for (let k = 0; k < nR && y < 24000; k++) {
    T.ridges.push({ y, H: T.V + y * (lift + stepA * k) * R.range(0.85, 1.15), w: y * R.range(0.1, 0.18), key: T.key + 101 * (k + 1) });
    y *= R.range(1.45, 1.9);
  }
  T.Ymax = Math.min(30000, T.ridges[T.ridges.length - 1].y * 1.3);
  T.maxH = Math.max(...T.ridges.map((r) => r.H));
  T.treelineA = T.treeline * T.maxH;
  const fogMode = R.wpick(['valley', 'ceiling', 'belt', 'haze'], [3.5, 2.5, 2, 1.5]);
  const fog = { mode: fogMode, s0: R.range(0.00008, 0.0002) * G.param('mist'), hg: R.range(0.2, 0.7) * T.V,
    ceil: R.range(0.35, 0.9) * T.maxH, hb: R.range(0.15, 0.6) * T.maxH, wb: R.range(0.05, 0.15) * T.maxH };
  const fO = ['', 'valley', 'ceiling', 'belt', 'haze'][G.param('fog')];
  if (fO) fog.mode = fO;
  const ground = plan.ground === 'water' ? 'water' : plan.ground === 'roots' ? 'snow' : plan.ground;
  T.Wl = ground === 'water' ? R.range(1.5, 5) : -Infinity;
  const lone = R.chance(0.7) || plan.event === 'lone';
  const loneSpec = { sp: R.pick(['fork', 'fork', 'spruce']), y: R.range(28, 60), side: R.chance(0.5) ? -1 : 1, h: R.range(0.9, 1.3), at: R.range(0.55, 0.85) };
  const yh = G.param('horizon') > 0 ? G.param('horizon') : R.range(0.22, 0.38);
  const YH = F.y0 + yh * F.h, K0 = F.w / (2 * Math.tan(HFOV[G.param('format')] / 2));
  const zones = [
    { sp: 'aspen', label: 'FOREGROUND', z: [0, T.fg] },
    { sp: 'thicket', label: 'VALLEY FLOOR', z: [T.fg, T.ridges[0].y] },
    { sp: 'spruce', label: 'SLOPES', z: [T.fg, T.Ymax] },
    { sp: 'aspen', label: 'GROVES', z: [T.fg, T.Ymax] },
  ];
  if (lone) zones.push({ sp: loneSpec.sp, label: 'GIANT', z: [loneSpec.y, loneSpec.y], lone: true });
  zones.forEach((s, i) => { s.letter = LETTERS[i]; s.idx = i; s.arr = 'zone'; s.Hm = SPECIES_M[s.sp].H; s.zone = 0.45; s.lean = 0; });
  const sc = {
    source: false, mono: true, near: 3, plan, YH, K0, cx0: (F.x0 + F.x1) / 2,
    fog, ground, terrain: T, lean: plan.lean * 0.5 + G.param('wind') * 0.35,
    strata: zones, event: lone ? 'lone' : 'none', lone: lone ? loneSpec : null, zShore: 0,
  };
  sc.water = { level: T.Wl, is: (x, y2) => y2 > T.fg * 0.5 && monumentRaw(sc, x, y2) < T.Wl };
  sc.cam = makeMonumentCamera(sc, CAMERAS[G.param('camera')]);
  sc.occludes = true;
  const k = ['M', G.seed, G.param('format'), ...['camera', 'ground', 'horizon', 'event'].map((n) => G.param(n))].join('|');
  if (!castCache || castCache.k !== k) {
    sc.hf = buildHeightfieldM(sc);
    castCache = { k, hf: sc.hf, buf: castGround(sc) };
  }
  sc.hf = castCache.hf; sc.buf = castCache.buf;
  return sc;
}

// The landform: the hill under the eye, a valley floor, and the ranges.
function monumentRaw(sc, x, y) {
  const T = sc.terrain;
  // the eye's ground: a flat top that ends, a few metres ahead, in a drop to the valley
  const e = T.fg + 0.6 * T.Ld * (fbm2(T.key + 4, x / 300, 0.5) - 0.5), t = clamp01((y - e) / T.Ld);
  // an escarpment: steepest at its lip, easing out onto the valley floor, so nothing below the
  // lip is hidden by a shoulder
  let A = T.V * Math.pow(1 - t, 2.5) * (0.9 + 0.2 * fbm2(T.key + 5, x / 250, y / 250));
  A += 15 * (fbm2(T.key + 6, x / 900, y / 900) - 0.5) * clamp01(y / 600);
  for (const r of T.ridges) {
    const yk = r.y + r.w * 2.4 * (fbm2(r.key, x / (r.y * 0.5), 0.3) - 0.5);
    const Hk = r.H * (0.4 + 1.2 * fbm2(r.key + 1, x / (r.y * 0.35), 0.7));
    const d = (y - yk) / (y < yk ? r.w : r.w * 1.8);
    A += Hk * Math.exp(-d * d);
    // gullies down the faces, deeper on the higher ranges
    A -= Hk * 0.18 * Math.exp(-d * d * 0.5) * Math.max(0, fbm2(r.key + 2, x / (r.y * 0.06), y / (r.y * 0.25)) - 0.45);
  }
  return A;
}
function monumentAlt(sc, x, y) { return Math.max(monumentRaw(sc, x, y), sc.terrain.Wl); }

// Two grids: fine near the eye, coarse over the whole wedge; exact beyond.
function buildHeightfieldM(sc) {
  const grid = (d, xr, yA, yB) => {
    const nx = Math.ceil(2 * xr / d) + 1, ny = Math.ceil((yB - yA) / d) + 1, Z = new Float32Array(nx * ny);
    let max = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = groundAlt(sc, -xr + i * d, yA + j * d); Z[j * nx + i] = v; if (v > max) max = v; }
    return { d, yA, xr, nx, ny, Z, max };
  };
  const T = sc.terrain, g1 = grid(2, 250, -100, 600), g2 = grid(12, gazeHalf(sc, 4000) + 300, -200, 4000);
  const g3 = grid(90, gazeHalf(sc, T.Ymax * 1.4) + 1000, -500, T.Ymax * 1.4);
  return { grids: [g1, g2, g3], max: Math.max(g1.max, g2.max, g3.max) };
}

function makeMonumentCamera(sc, name) {
  const T = sc.terrain, V = groundAlt(sc, 0, 0), yM = T.ridges[Math.min(1, T.ridges.length - 1)].y;
  const atH = (c) => { c.py = sc.YH + c.K * Math.tan(c.phi); return c; };   // horizon at the plan's height
  if (name === 'eye') return atH(pinhole(name, 0, 0, V + EYE, 0.02, sc.K0, sc.cx0, 0));
  if (name === 'low') {
    // down on the valley floor, looking up at the ranges
    const yv = (T.fg + T.ridges[0].y) * 0.45;
    return pinhole(name, 0, yv, groundAlt(sc, 0, yv) + EYE, -0.06, sc.K0, sc.cx0, F.y0 + 0.7 * F.h);
  }
  if (name === 'raised') return atH(pinhole(name, 0, -150, V + 300, 0.05, sc.K0, sc.cx0, 0));
  if (name === 'aerial') {
    const c = pinhole(name, 0, -4000, 3000, Math.atan2(3000, yM + 4000), sc.K0, sc.cx0, 0);
    c.py = F.y0 + 0.4 * F.h - c.K * project({ cam: { ...c, K: 1, px: 0, py: 0 } }, 0, yM, 0)[1];
    return c;
  }
  // overhead: the whole wedge as a plan
  const yC = T.Ymax * 0.5, alt = T.Ymax * 1.6;
  const c = pinhole(name, 0, yC - alt * 0.12, alt, Math.atan2(alt, alt * 0.12), 1, 0, 0);
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const y = T.Ymax * i / 20, w = gazeHalf(sc, y);
    for (const x of [-w, 0, w]) { const q = project({ cam: c }, x, y, 0); if (!q) continue; X0 = Math.min(X0, q[0]); X1 = Math.max(X1, q[0]); Y0 = Math.min(Y0, q[1]); Y1 = Math.max(Y1, q[1]); }
  }
  c.K = Math.min(0.94 * F.w / (X1 - X0), 0.94 * F.h / (Y1 - Y0));
  c.px = F.x0 + F.w / 2; c.py = F.y0 + F.h / 2 - c.K * (Y0 + Y1) / 2;
  return c;
}

function plantMonument(sc) {
  const T = sc.terrain, R = rngFor('monument/plant'), dens = G.param('density');
  const ck = GenArt._hashStr(G.seed + '/cover') | 0, plants = [];
  // Density is true out to THIN0 and thins as (THIN0 / y)² beyond, so that the far forest keeps a
  // constant density on the sheet: each far mark stands for (y / THIN0)² trees.
  const c = gazeHalf(sc, 1), Lg = Math.log(T.Ymax / THIN0), wNear = 0.5 / (0.5 + Lg);
  const n = Math.min(60000, Math.round(T.rho * dens * 2 * c * THIN0 * THIN0 * (0.5 + Lg)));
  const floorA = (y) => 15 * (fbm2(T.key + 6, 0, y / 900) - 0.5) * clamp01(y / 600);
  for (let k = 0; k < n; k++) {
    // every draw first, so a candidate's fate never shifts the stream
    const a = R(), b = R(), y = a < wNear ? THIN0 * Math.sqrt(b) : THIN0 * Math.exp(b * Lg);
    const x = (2 * R() - 1) * gazeHalf(sc, y), u = R(), sh = R(), hv = R(), seed = R();
    if (y < 3.2) continue;
    const raw = monumentRaw(sc, x, y);
    if (raw < T.Wl) continue;                                // the lake
    let st, sp;
    const lowA = raw - Math.max(T.Wl, floorA(y)) < 8 && y > T.fg;
    if (y < T.fg) {
      // the ledge underfoot: a few reed tufts, the photograph's thin stems reaching down
      if (sh < 0.4) continue;
      st = sc.strata[0]; sp = 'reed';
    }
    else if (lowA) {
      // the valley floor: reeds at the water, then scrub, and stands of forest where the cover is
      st = sc.strata[1];
      const cov = fbm2(ck + 2, x / 400, y / 400);
      sp = raw - T.Wl < 1.2 ? (u < 0.7 ? 'reed' : 'thicket')
        : cov > 0.52 ? (u < 0.7 ? 'spruce' : u < 0.92 ? 'aspen' : 'fork')
        : cov < 0.4 && u < 0.5 ? null : u < 0.7 ? 'thicket' : u < 0.76 ? 'whip' : u < 0.88 ? 'fork' : 'reed';
      if (!sp) continue;
    } else {
      if (raw > T.treelineA - 120 * sh) continue;           // bare summits, a ragged treeline
      if (fbm2(ck, x / 500, y / 500) < 0.36 + 0.1 * clamp01(raw / T.treelineA)) continue;   // meadows, screes
      const grove = fbm2(ck + 1, x / 250, y / 250) > 0.58;
      st = sc.strata[grove ? 3 : 2];
      sp = grove ? (u < 0.85 ? 'aspen' : 'fork') : (u < 0.9 ? 'spruce' : u < 0.96 ? 'fork' : 'aspen');
    }
    const Hm = SPECIES_M[sp].H * (0.65 + 0.7 * hv) * (raw > T.treelineA * 0.7 ? 0.7 : 1) * (y < T.fg && sp !== 'thicket' && sp !== 'reed' ? 0.35 : 1);
    // the view from the edge is kept open: a tree that would stand over 120 sheet units is rarer
    // in proportion (one giant is placed on purpose, below)
    const hpE = Hm * sc.K0 / y;
    if (hpE > 120 && (seed * 7.31) % 1 > Math.pow(120 / hpE, 1.5)) continue;
    plants.push({ st, sp, x, y, Hm, seed });
  }
  if (sc.lone) {
    const L = sc.lone, y = L.y, x = L.side * gazeHalf(sc, y) / WEDGE * L.at;
    plants.push({ st: sc.strata[sc.strata.length - 1], sp: L.sp, x, y, Hm: SPECIES_M[L.sp].H * L.h * 1.3, seed: R(), giant: true });
  }
  plants.sort((a, b) => b.y - a.y);
  sc.nPlants = plants.length;
  sc.nInked = 0;
  for (const pl of plants) inkPlant(sc, pl);
}

// The distant mark: each species reduced to what survives at a few sheet units, in proportion to
// its size on the sheet (hp, sheet units).
const GLYPH = {
  spruce(R, Hm, hp, lean) {
    const out = [br(walk(R, [0, 0, 0], lean * 0.3, Hm, 4, { wig: 0.01 }, 0), 0.016 * Hm, 0.003, 1)];
    const m = Math.max(3, Math.min(16, Math.round(hp / 2.2)));
    for (let j = 0; j < m; j++) {
      const t = 0.08 + 0.86 * j / m, L = Hm * 0.22 * Math.pow(1 - t, 0.9) * R.range(0.8, 1.15);
      for (const th of [0, Math.PI]) out.push(br(walk(R, [0, 0, t * Hm], R.range(1.75, 2.15), L, 2, { droop: 0.04 }, th + R.gauss() * 0.4), 0.003, 0.001, 2));
    }
    return out;
  },
  aspen(R, Hm, hp, lean) {
    const out = [br(walk(R, [0, 0, 0], lean * 0.5 + R.gauss() * 0.03, Hm, 5, { wig: 0.01 }, 0), 0.009 * Hm, 0.02, 1)];
    const m = Math.max(2, Math.min(10, Math.round(hp / 4)));
    for (let j = 0; j < m; j++) {
      const h = Hm * R.range(0.35, 0.95), th = R() * TAU;
      out.push(br(walk(R, [0, 0, h], R.range(0.35, 0.75), Hm * 0.2 * (1.2 - h / Hm), 3, { pull: 0.05 }, th), 0.002 * Hm, 0.004, 2));
    }
    return out;
  },
  fork(R, Hm, hp, lean) {
    const out = [], maxD = Math.max(2, Math.min(5, Math.round(hp / 7)));
    const rec = (p, a, len, depth, th) => {
      const w = walk(R, p, a, len, 2, { wig: 0.05 }, th);
      out.push(br(w, 0.02 * Hm * Math.pow(0.72, depth), 0.02 * Hm * Math.pow(0.72, depth + 1), depth < 2 ? 1 : 2));
      if (depth === maxD) return;
      const e = w.pts[w.pts.length - 1], ae = w.ang[w.ang.length - 1], s = R.range(0.3, 0.6);
      for (const sgn of [-1, 1]) rec(e, ae + sgn * s, len * R.range(0.62, 0.8), depth + 1, th + R.gauss() * 0.6);
    };
    rec([0, 0, 0], lean * 0.5, Hm * R.range(0.25, 0.35), 0, R() * TAU);
    return out;
  },
  thicket(R, Hm, hp, lean) {
    const out = [], m = Math.max(3, Math.min(10, Math.round(hp / 1.4)));
    for (let j = 0; j < m; j++) out.push(br(walk(R, [0, 0, 0], lean + R.gauss() * 0.3, Hm * R.range(0.6, 1.15), 3, { wig: 0.06 }, R() * TAU), 0.006, 0.002, j ? 2 : 1));
    return out;
  },
  whip(R, Hm, hp, lean) {
    const out = [br(walk(R, [0, 0, 0], lean * 0.5, Hm * 0.35, 3, {}, 0), 0.03 * Hm, 0.018 * Hm, 1)];
    const m = Math.max(3, Math.min(10, Math.round(hp / 3)));
    for (let j = 0; j < m; j++) out.push(br(walk(R, [0, 0, Hm * 0.35], R.range(-0.6, 0.6), Hm * R.range(0.5, 0.8), 5, { droop: 0.22 }, R() * TAU), 0.003, 0.0012, 2));
    return out;
  },
  reed(R, Hm, hp, lean) {
    const out = [], m = Math.max(3, Math.min(7, Math.round(hp)));
    for (let j = 0; j < m; j++) out.push(br(walk(R, [0, 0, 0], lean + R.gauss() * 0.3, Hm * R.range(0.5, 1), 2, {}, R() * TAU), 0.004, 0.0015, 2));
    return out;
  },
};

// Crests: for each range, along x, the point of its face that stands highest above the camera's
// line of sight (the silhouette from this camera), inked by the same fog, cut by nearer ground.
// Above the treeline the bare faces are drawn by fall lines: from the crest, short strokes down the
// steepest descent of the face, stopping where the forest begins. Nothing else draws a mountain.
function crestLines(sc) {
  const T = sc.terrain, C = sc.cam.C, ck = GenArt._hashStr(G.seed + '/crest') | 0;
  if (sc.cam.name === 'overhead') return;
  T.ridges.forEach((r, k) => {
    const Q = [], step = 3 * Math.max(1, r.y - C[1]) / sc.cam.K, half = gazeHalf(sc, r.y) * 1.2;
    let i = 0;
    for (let x = -half; x <= half; x += step, i++) {
      let best = -Infinity, by = 0, bA = 0;
      for (let j = 0; j <= 14; j++) {
        const y = r.y - 1.6 * r.w + j * 3.4 * r.w / 14, A = groundAlt(sc, x, y);
        const e = (A - C[2]) / Math.max(1, Math.hypot(x - C[0], y - C[1]));
        if (e > best) { best = e; by = y; bA = A; }
      }
      const q = project(sc, x, by, bA + 0.5);
      if (!q) continue;
      Q.push([q[0], q[1], hidden(sc, q[0], q[1], q[3]) ? 0 : fogAt(sc, q[3], bA) * 0.9]);
      // fall lines from crest points above the treeline, as dense as the face is steep
      if (bA < T.treelineA * 0.85) continue;
      const ds = r.w / 16, e = ds * 0.3, F2 = [];
      {
        const y1 = by - ds * 2, gx = groundAlt(sc, x + e, y1) - groundAlt(sc, x - e, y1), gy = groundAlt(sc, x, y1 + e) - groundAlt(sc, x, y1 - e);
        if (h32(ck + k, i) > Math.min(0.9, Math.max(0, (Math.hypot(gx, gy) / (2 * e) - 0.2) * 1.4))) continue;
      }
      let px = x, py = by;
      const len = 10 + Math.floor(h32(ck + k + 50, i) * 14);
      for (let n = 0; n < len; n++) {
        const A = groundAlt(sc, px, py);
        const fq = project(sc, px, py, A + 0.5);
        if (!fq) break;
        F2.push([fq[0], fq[1], hidden(sc, fq[0], fq[1], fq[3]) ? 0 : fogAt(sc, fq[3], A) * 0.75]);
        if (A < T.treelineA - 30) break;
        const gx = groundAlt(sc, px + e, py) - groundAlt(sc, px - e, py), gy = groundAlt(sc, px, py + e) - groundAlt(sc, px, py - e);
        const L = Math.hypot(gx, gy) || 1;
        px -= gx / L * ds; py -= gy / L * ds;
      }
      if (F2.length > 1) dashLine(sc, F2, inkKey(ck + 1, k * 100000 + i, 6), 2, -1, 3);
    }
    dashLine(sc, Q, inkKey(ck, k, 5), 1, -1, 3);
  });
}

// ------------------------------------------------------------------ views

const seg = (out, x0, y0, x1, y1, pen, w) => out.push({ pts: [[x0, y0], [x1, y1]], pen: pen || 'ink', w: w || 1 });
function dashed(out, a, b, pen, on, off) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d < L; d += on + off) {
    const t0 = d / L, t1 = Math.min(1, (d + on) / L);
    seg(out, a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, pen);
  }
}
function txt(out, str, x, y, size, pen) {
  for (const pl of StrokeFont.text(str, x, y, size)) {
    if (pl.length === 1) { seg(out, pl[0].x, pl[0].y, pl[0].x + 0.3, pl[0].y, pen); continue; }
    out.push({ pts: pl.map((p) => [p.x, p.y]), pen: pen || 'ink', w: 1 });
  }
}
const FOG_LABEL = { aloft: 'FOG ALOFT', ground: 'GROUND FOG', bank: 'FOG BANK', clear: 'CLEAR AIR',
  valley: 'VALLEY FOG', ceiling: 'CLOUD CEILING', belt: 'FOG BELT', haze: 'HAZE' };
const MONUMENT_CAMERA_LABEL = { eye: 'VANTAGE', low: 'VALLEY FLOOR', raised: 'RAISED 300M', aerial: 'AERIAL 3000M', overhead: 'PLAN' };

function buildView(sc, view) {
  const out = [];
  if (view === 1) strataView(sc, out);
  else if (view === 2) construction(sc, out);
  else for (const l of sc.lines) out.push({ pts: l.pts, pen: 'ink', w: 1, q: l.q });
  sheet(sc, out, view);
  return out;
}

// The catalogue line and corner marks.
function sheet(sc, out, view) {
  const y = F.y1 + 30, sz = 8;
  txt(out, '041 FOG THICKET' + (sc.mono ? ' / MONUMENT' : ''), F.x0, y, sz);
  const right = sc.source ? 'SOURCE READING' : 'SEED ' + G.seed;
  txt(out, right, F.x1 - StrokeFont.width(right, sz), y, sz);
  const mid = (sc.mono
    ? `${sc.nInked} TREES / ${sc.terrain.ridges.length} RANGES / ${FOG_LABEL[sc.fog.mode]} / ${sc.ground === 'water' ? 'LAKE' : sc.ground.toUpperCase()}` +
      (sc.tone ? ' / TONE' : '') + ' / ' + MONUMENT_CAMERA_LABEL[sc.cam.name]
    : `${sc.strata.length} STRATA / ${FOG_LABEL[sc.fog.mode]} / ${sc.ground.toUpperCase()}` +
      (sc.terrain.mode !== 'flat' ? ' / ' + sc.terrain.mode.toUpperCase() : '') + (sc.tone ? ' / TONE' : '') +
      (sc.cam.name !== 'eye' ? ' / ' + CAMERA_LABEL[sc.cam.name] : '')) +
    (view ? ' / ' + ['', 'STRATA', 'CONSTRUCTION'][view] : '');
  txt(out, mid, (W - StrokeFont.width(mid, sz * 0.8)) / 2, y + 1, sz * 0.8);
  const m = 22, l = 12;
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    seg(out, cx, cy, cx + l * sx, cy); seg(out, cx, cy, cx, cy + l * sy);
  }
}

const stratumLabel = (sc, st) => st.label ? `${st.letter} ${st.label} / Z ${st.z[0].toFixed(0)}-${st.z[1].toFixed(0)}M` : `${st.letter} ${SPECIES[st.sp].label}${st.lone ? ' LONE' : ' ' + st.arr.toUpperCase()}` +
  ` / Z ${st.z[0].toFixed(0)}${st.lone ? '' : '-' + st.z[1].toFixed(0)}M / H ${st.Hm.toFixed(1)}M`;

// Strata: the drawing taken apart. Each stratum alone, then the ground marks (if any), the fog law
// as a field (ink = what the fog takes), and the whole. Small panels keep their tone by keeping
// only a share of the finer twigs.
function strataView(sc, out) {
  const panels = sc.strata.map((st) => ({ kind: 'st', st }));
  if (sc.lines.some((l) => l.st === -1)) panels.push({ kind: 'ground' });
  panels.push({ kind: 'fog' }, { kind: 'all' });
  const gx = 18, gy = 34, n = panels.length;
  let best = null;
  for (let c = 1; c <= 4; c++) {
    const r = Math.ceil(n / c), pw = Math.min((F.w - gx * (c - 1)) / c, ((F.h - gy * (r - 1) - gy) / r) * F.w / F.h);
    if (!best || pw > best.pw) best = { c, r, pw };
  }
  const { c, r, pw } = best, ph = pw * F.h / F.w, k = pw / F.w;
  const ox = F.x0 + (F.w - (c * pw + (c - 1) * gx)) / 2, oy = F.y0 + (F.h - (r * ph + (r - 1) * gy) - gy + 14) / 2;
  panels.forEach((P, i) => {
    const px = ox + (i % c) * (pw + gx), py = oy + Math.floor(i / c) * (ph + gy);
    const T = (p) => [px + (p[0] - F.x0) * k, py + (p[1] - F.y0) * k];
    const keep = Math.min(1, k * 1.5);
    for (const [a, b] of [[[px, py], [px + pw, py]], [[px + pw, py], [px + pw, py + ph]], [[px + pw, py + ph], [px, py + ph]], [[px, py + ph], [px, py]]]) seg(out, a[0], a[1], b[0], b[1]);
    let label;
    if (P.kind === 'fog') { fogPanel(sc, out, px, py, pw, ph); label = 'FOG  P = EXP(-Z S(H))'; }
    else {
      for (const l of sc.lines) {
        if (P.kind === 'st' && l.st !== P.st.idx) continue;
        if (P.kind === 'ground' && l.st !== -1) continue;
        if (l.o >= 2 && h32(l.key, 7) > keep) continue;
        out.push({ pts: l.pts.map(T), pen: 'ink', w: 1, q: l.q });
      }
      label = P.kind === 'st' ? stratumLabel(sc, P.st) : P.kind === 'ground' ? 'GROUND / ' + sc.ground.toUpperCase() : 'ALL';
    }
    const sz = Math.min(6, pw / 40);
    txt(out, label, px, py + ph + 6, sz);
  });
}

// The fog law drawn as a field: depth across, altitude up; level rulings inked where the fog takes
// the line (1 - p). The strata stand in it as sepia bars at their depths and heights.
function fogPanel(sc, out, px, py, pw, ph) {
  const zMax = sc.mono ? 3000 : 60, aMax = sc.mono ? Math.round(sc.terrain.maxH * 1.3) : 24, pitch = 2.4, key = GenArt._hashStr(G.seed + '/fogpanel') | 0;
  const zx = (z) => px + 6 + (pw - 12) * z / zMax, ay = (A) => py + ph - 6 - (ph - 12) * A / aMax;
  let row = 0;
  for (let y = py + 6; y < py + ph - 6; y += pitch, row++) {
    const A = (py + ph - 6 - y) / (ph - 12) * aMax;
    let run = null, ci = 0;
    for (let x = px + 6; x < px + pw - 6; x += LC, ci++) {
      const z = (x - px - 6) / (pw - 12) * zMax;
      const on = h32(key + row, ci) < 1 - fogPath(sc, z, sc.cam.C[2], A);
      if (on && !run) run = [[x, y]];
      if (!on && run) { run.push([x, y]); out.push({ pts: run, pen: 'ink', w: 1 }); run = null; }
    }
    if (run) { run.push([px + pw - 6, y]); out.push({ pts: run, pen: 'ink', w: 1 }); }
  }
  for (const st of sc.strata) {
    const z0 = st.z[0], z1 = st.lone ? st.z[0] + 0.6 : st.z[1];
    const xa = zx(Math.min(zMax, z0)), xb = zx(Math.min(zMax, z1)), yt = ay(Math.min(aMax, st.Hm));
    seg(out, xa, ay(0) - 1, xb, ay(0) - 1, 'sepia'); seg(out, xa, yt, xb, yt, 'sepia');
    seg(out, xa, ay(0) - 1, xa, yt, 'sepia');
    txt(out, st.letter, xa + 2, yt - 8, 5, 'sepia');
  }
  dashed(out, [px + 6, ay(Math.min(aMax, sc.cam.C[2]))], [px + pw - 6, ay(Math.min(aMax, sc.cam.C[2]))], 'sepia', 3, 3);
}

// Construction: a thinned drawing; in sepia the horizon, the ground at measured distances from
// the eye, each stratum's band of ground, the clearing, the shore and the survival curve; from any
// camera but the eye, also the wedge that was planted, the eye's own gaze inside it, and the eye.
function construction(sc, out) {
  for (const l of sc.lines) if (l.o <= 1 || h32(l.key, 3) < 0.3) out.push({ pts: l.pts, pen: 'ink', w: 1, q: l.q });
  const P = 'sepia', c = sc.cam, inF = (q) => q && q[0] >= F.x0 && q[0] <= F.x1 && q[1] >= F.y0 && q[1] <= F.y1;
  // a ground line through world points, drawn every other step; returns its last point on the sheet
  const groundLine = (pts, every = 2) => {
    const Q = pts.map(([x, y]) => project(sc, x, y, groundAlt(sc, x, y)));
    let last = null;
    for (let i = 0; i + 1 < Q.length; i += every) if (inF(Q[i]) && inF(Q[i + 1])) { seg(out, Q[i][0], Q[i][1], Q[i + 1][0], Q[i + 1][1], P); last = Q[i + 1]; }
    return last;
  };
  const across = (y, f = 1) => { const w = gazeHalf(sc, y) * f, pts = []; for (let i = 0; i <= 80; i++) pts.push([-w + 2 * w * i / 80, y]); return pts; };
  const yh = c.py - c.K * Math.tan(c.phi);
  if (yh > F.y0 && yh < F.y1) {
    dashed(out, [F.x0, yh], [F.x1, yh], P, 6, 4);
    txt(out, c.name === 'eye' && !sc.mono ? 'EYE 1.6M' : 'HORIZON', F.x0 + 4, yh - 10, 6, P);
  }
  for (const y of sc.mono ? [100, 200, 500, 1000, 2000, 4000] : [4, 6, 10, 20, 40, 80]) {
    const q = groundLine(across(y));
    if (q) txt(out, `${y} M`, Math.min(F.x1 - 22, q[0] + 4), q[1] - 3, 5, P);
  }
  const eyeLike = !sc.mono && (c.name === 'eye' || c.name === 'low');
  sc.strata.forEach((st, i) => {
    txt(out, stratumLabel(sc, st), F.x0 + 6, F.y0 + 8 + i * 10, 6, P);
    const y0 = st.z[0], y1 = st.lone ? st.z[0] : st.z[1];
    if (eyeLike) {
      const x = F.x0 - 14 - i * 9, qa = project(sc, 0, y0, 0), qb = project(sc, 0, y1, 0);
      if (!qa || !qb) return;
      const ya = Math.min(F.y1, qa[1]), yb = qb[1];
      seg(out, x, ya, x, yb, P); seg(out, x - 2, ya, x + 2, ya, P); seg(out, x - 2, yb, x + 2, yb, P);
      txt(out, st.letter, x - 2, ya + 4, 5, P);
    } else {
      for (const y of st.lone ? [y0] : [y0, y1]) {
        groundLine(across(y), 3);
        const q = project(sc, -gazeHalf(sc, y), y, groundAlt(sc, -gazeHalf(sc, y), y));
        if (inF(q)) txt(out, st.letter, q[0] - 8, q[1] - 3, 5, P);
      }
    }
  });
  if (sc.mono) {
    // each range's axis, labelled with its distance and height
    sc.terrain.ridges.forEach((r, k) => {
      const q = groundLine(across(r.y, 0.9), 3);
      if (q) txt(out, `RANGE ${k + 1} / ${Math.round(r.y)} M / ${Math.round(r.H)} M`, Math.max(F.x0 + 4, q[0] - 120), q[1] - 9, 5, P);
    });
  }
  if (!eyeLike && !sc.mono) {
    // the planted wedge and, inside it, what the eye itself sees
    const yF = Math.max(...sc.strata.map((s) => (s.lone ? s.z[0] : s.z[1]))) * 1.05;
    for (const f of [1, -1, 1 / WEDGE, -1 / WEDGE]) {
      const pts = []; for (let i = 0; i <= 60; i++) { const y = 0.5 + (yF - 0.5) * i / 60; pts.push([f * gazeHalf(sc, y), y]); }
      groundLine(pts, Math.abs(f) === 1 ? 1 : 2);
    }
    const q = project(sc, gazeHalf(sc, yF) / WEDGE, yF, groundAlt(sc, gazeHalf(sc, yF) / WEDGE, yF));
    if (inF(q)) txt(out, 'WHAT THE EYE SEES', Math.min(F.x1 - 90, q[0] + 4), q[1] - 3, 5, P);
    const e0 = project(sc, 0, 0, 0), e1 = project(sc, 0, 0, EYE);
    if (inF(e0) && inF(e1)) { seg(out, e0[0], e0[1], e1[0], e1[1], P); seg(out, e1[0] - 3, e1[1], e1[0] + 3, e1[1], P); txt(out, 'EYE', e1[0] + 4, e1[1] - 3, 5, P); }
  }
  if (sc.clear) {
    const cl = sc.clear, pts = [];
    for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; pts.push([cl.uc + Math.cos(t) * cl.ruM, cl.zc + Math.sin(t) * cl.rz]); }
    groundLine(pts);
    const q = project(sc, cl.uc, cl.zc, 0);
    if (inF(q)) txt(out, 'CLEARING', q[0] - 16, q[1] - 3, 5, P);
  }
  if (sc.ground === 'water') {
    const q = groundLine(across(sc.zShore), 1);
    if (q) txt(out, 'SHORE', Math.min(F.x1 - 30, q[0] - 30), q[1] + 4, 5, P);
  }
  // survival curve p(altitude) at 20 m from the eye, in a box at the upper right
  const bw = 120, bh = 150, bx = F.x1 - bw - 8, by = F.y0 + 8;
  for (const [a, b] of [[[bx, by], [bx + bw, by]], [[bx + bw, by], [bx + bw, by + bh]], [[bx + bw, by + bh], [bx, by + bh]], [[bx, by + bh], [bx, by]]]) seg(out, a[0], a[1], b[0], b[1], P);
  const curve = [];
  const dRef = sc.mono ? 1000 : 20, aTop = sc.mono ? sc.terrain.maxH * 1.3 : 24;
  for (let i = 0; i <= 48; i++) { const A = aTop * i / 48; curve.push([bx + 4 + (bw - 8) * fogPath(sc, dRef, sc.cam.C[2], A), by + bh - 4 - (bh - 20) * A / aTop]); }
  out.push({ pts: curve, pen: P, w: 1 });
  txt(out, `P AT ${dRef}M FROM THE CAMERA`, bx + 4, by + 4, 5, P);
  txt(out, '0', bx + 3, by + bh + 3, 4, P); txt(out, '1', bx + bw - 6, by + bh + 3, 4, P);
}

// ------------------------------------------------------------------ painting

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const toneInk = (q) => `rgb(${mix(TONE.air, TONE.ink, q / QN).join(',')})`;
// The colour of every stroke group: a pen, or in the tone register an ink grey by survival.
function strokeGroups(out) {
  const groups = new Map();
  for (const l of out) {
    const k = l.pen === 'ink' && l.q ? 'q' + l.q : l.pen;
    if (!groups.has(k)) groups.set(k, { colour: k[0] === 'q' ? toneInk(+k.slice(1)) : PENS[k], lines: [] });
    groups.get(k).lines.push(l);
  }
  // pale first, so darker strokes lie over lighter ones
  return [...groups.entries()].sort((a, b) => (a[0][0] === 'q' ? +a[0].slice(1) : 99) - (b[0][0] === 'q' ? +b[0].slice(1) : 99));
}

function paint(out) {
  const ctx = drawingContext;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${PAPER.join(',')})`;
  ctx.fillRect(0, 0, width, height);
  if (scene.tone && G.param('view') === 0) wash(scene);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pen = G.param('pen');
  for (const [, grp] of strokeGroups(out)) {
    ctx.strokeStyle = grp.colour;
    ctx.lineWidth = Math.max(0.35, pen * S);
    ctx.beginPath();
    let c = 0;
    for (const l of grp.lines) {
      ctx.moveTo(l.pts[0][0] * S, l.pts[0][1] * S);
      for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i][0] * S, l.pts[i][1] * S);
      if (++c % 4000 === 0) { ctx.stroke(); ctx.beginPath(); }
    }
    ctx.stroke();
  }
  if (scene.tone) grain(G.param('tooth')); else tooth(G.param('tooth'));
}

// The wash: every traced sight line that meets the ground is filled with snow (or water) seen
// through the air along it; a line that meets nothing is air. Drawn at cell resolution and
// smoothed, inside the field.
function wash(sc) {
  const B = sc.buf, ctx = drawingContext;
  ctx.fillStyle = `rgb(${TONE.air.join(',')})`;
  ctx.fillRect(F.x0 * S, F.y0 * S, F.w * S, F.h * S);
  if (!B) return;
  const cv = document.createElement('canvas'); cv.width = B.nx; cv.height = B.ny;
  const cc = cv.getContext('2d'), img = cc.createImageData(B.nx, B.ny), d = img.data, cA = sc.cam.C[2];
  for (let n = 0; n < B.nx * B.ny; n++) {
    let col = TONE.air;
    if (isFinite(B.D[n])) {
      const surf = sc.ground === 'water' && sc.water.is(B.HX[n], B.HY[n]) ? TONE.water : TONE.snow;
      col = mix(TONE.air, surf, fogPath(sc, B.D[n], cA, B.HA[n]));
    }
    d[n * 4] = col[0]; d[n * 4 + 1] = col[1]; d[n * 4 + 2] = col[2]; d[n * 4 + 3] = 255;
  }
  cc.putImageData(img, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(F.x0 * S, F.y0 * S, F.w * S, F.h * S); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, F.x0 * S, F.y0 * S, B.nx * B.cell * S, B.ny * B.cell * S);
  ctx.restore();
}

// Film grain for the tone register: a fixed per-pixel noise, light on light and dark alike.
function grain(amount) {
  if (amount <= 0) return;
  const ctx = drawingContext, img = ctx.getImageData(0, 0, width, height), d = img.data;
  const seed = GenArt._hashStr(G.seed + '/grain') | 0;
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    const g = (h32(seed, n) + h32(seed + 1, n) - 1) * 9 * amount;
    d[i] += g; d[i + 1] += g; d[i + 2] += g;
  }
  ctx.putImageData(img, 0, 0);
}

// Paper tooth: a two-scale grain in sheet units; on its high points the ink skips (PNG only).
function tooth(amount) {
  if (amount <= 0) return;
  const ctx = drawingContext, w = width, h = height;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const seed = GenArt._hashStr(G.seed + '/tooth') | 0;
  const vnoise = (x, y) => vn2(seed, x, y);
  const P0 = PAPER, pl = P0[1], inkL = 0x1a;
  const thr = 1 - 0.24 * Math.min(1.6, amount);
  const f1 = 1 / (0.45 * S), f2 = 1 / (1.7 * S);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = 0.7 * vnoise(x * f1, y * f1) + 0.3 * vnoise(x * f2 + 91.3, y * f2 + 17.7);
      const c = Math.abs(d[i + 1] - pl) / Math.abs(inkL - pl);
      const keep = c > 0.02 ? 1 - Math.max(0, Math.min(1, (n - thr) / 0.12)) * 0.8 : 1;
      const g = (n - 0.5) * 6 * amount;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = P0[ch] - g + (d[i + ch] - P0[ch]) * keep;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ plotter export

function saveSVG() {
  if (!scene) return;
  const f = (n) => n.toFixed(2), pen = G.param('pen');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:rgb(${PAPER.join(',')})">\n` +
    `<!-- ${WORK_ID} · seed ${G.seed} · ${scene.out.length} polylines · paper tooth is not drawn -->\n`;
  if (scene.tone) svg += '<!-- tone register: strokes are grouped by grey; the wash and grain are not drawn. For the plotter use the line register. -->\n';
  for (const [P, grp] of strokeGroups(scene.out)) {
    const mine = grp.lines;
    svg += `<g id="${P[0] === 'q' ? 'grey-' + P.slice(1) : 'pen-' + P}" stroke="${grp.colour}" stroke-width="${pen.toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
    for (let i = 0; i < mine.length; i += 400) {
      let d = '';
      for (const l of mine.slice(i, i + 400)) d += 'M' + l.pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L');
      svg += `<path d="${d}"/>\n`;
    }
    svg += '</g>\n';
  }
  svg += '</svg>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `fog-thicket-${G.seed}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
