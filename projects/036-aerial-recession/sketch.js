// 036 — Aerial Recession
//
// A landscape built the way the masters built depth, with every rule computed rather
// than painted by eye:
//
//   linear perspective   — one camera, one ground plane. Every ground object (field,
//                          hedge, tree, river bank, cloud) lives at a world depth z and
//                          is projected: screen size ∝ 1/z, everything converges on the
//                          horizon. Meanders, hedgerows and cloud rows compress on their own.
//   atmospheric persp.   — colour seen = mixRGB(local colour, haze, 1 − e^(−k·z)). Contrast,
//                          saturation, detail (noise octaves) and edge sharpness all fall
//                          off with that same transmittance term.
//   chiaroscuro          — one low sun on a third line. Peaks split into lit / shadow
//                          faces about their summits; trees throw long shadows away from
//                          it; silhouettes facing it carry a warm rim.
//   composition          — horizon near the lower third, sun on one vertical third, the
//                          dominant peak and the river's vanishing point on the other.
//                          The river is the leading line; a dark repoussoir tree and bank
//                          frame the light from the side opposite the sun.
//   edgework             — near edges are inked (found); far edges are wash only, and
//                          even near ridgelines lose their stroke where mist sits (lost).
//
// The canvas paints itself back-to-front over many frames (sky → far ranges → mist →
// ground → river → trees → repoussoir → grain), the order a painter would work in.
// Keys: R new seed · S save PNG.

const REF_W = 1500;
const REF_H = 1000;
const FIELD_ASPECT = REF_W / REF_H;
const FRAME_BUDGET_MS = 28;
// ?profile records per-pass timings in window.PROFILE (index, ms) for tuning.
const PROFILE = /[?&]profile\b/.test(location.search) ? (window.PROFILE = []) : null;
// ?stop=N halts the painting after pass N, to inspect any intermediate state.
const STOP = parseInt(new URLSearchParams(location.search).get('stop'), 10) || Infinity;

const MOODS = {
  'golden hour': {
    zenith: '#2c4470', upper: '#7486ad', horizon: '#f3c27f', glow: '#ffdc9c', sun: '#fff5dc',
    haze: '#d8b596', cloudShadow: '#6d6788', cloudLit: '#f5ad6c',
    rockFar: '#68658a', rockNear: '#4d4838', groundFar: '#8a8250', groundNear: '#3d3d22',
    fields: ['#a8964f', '#7b8040', '#c2a35a', '#6a7136', '#93874a'],
    foliage: '#2d3620', foliageLit: '#8f8a3a', silhouette: '#15120d',
    light: '#f4ad5c', shadow: '#33405f', water: '#41516e', clouds: 1.0, rays: 1.0,
  },
  'after the storm': {
    zenith: '#353e4a', upper: '#66707b', horizon: '#e5d3a0', glow: '#f5e3a6', sun: '#fffbea',
    haze: '#b5b9b2', cloudShadow: '#454c57', cloudLit: '#e6cb8c',
    rockFar: '#5a6470', rockNear: '#384036', groundFar: '#727d5d', groundNear: '#2c3828',
    fields: ['#6f7e4f', '#58693f', '#8e8f58', '#4b5c37', '#7d8a55'],
    foliage: '#1e2a1c', foliageLit: '#78864a', silhouette: '#101311',
    light: '#f0d185', shadow: '#2b3846', water: '#3b4652', clouds: 1.7, rays: 1.4,
  },
  'dawn mist': {
    zenith: '#5a7096', upper: '#a1b1cc', horizon: '#f3cfbd', glow: '#fbe1cf', sun: '#fff7ef',
    haze: '#d8d9e2', cloudShadow: '#8a8eae', cloudLit: '#f4bfac',
    rockFar: '#7b82a2', rockNear: '#4a5163', groundFar: '#8d947f', groundNear: '#38443a',
    fields: ['#8a9472', '#76845f', '#a19f7d', '#687659', '#949a78'],
    foliage: '#283226', foliageLit: '#a59b7d', silhouette: '#15191c',
    light: '#f7ccb2', shadow: '#47506d', water: '#62708e', clouds: 0.7, rays: 0.6,
  },
};

let G;
let S = null; // the scene: all geometry + colours, in REF coordinates
let tasks = [];
let taskIdx = 0;
let R, U; // field rect on screen, and screen px per REF unit
let brushK = 1; // brush scale currently applied (scaleBrushes compounds)

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));

  G = GenArt.create({
    title: 'Aerial Recession',
    params: {
      mood: { value: 0, options: { 'golden hour': 0, 'after the storm': 1, 'dawn mist': 2 }, label: 'mood' },
      sun: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'sun height' },
      haze: { value: 1.0, min: 0.3, max: 2.2, step: 0.05, label: 'atmosphere' },
      ranges: { value: 5, min: 3, max: 7, step: 1, label: 'mountain ranges' },
      mist: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'mist' },
      clouds: { value: 0.55, min: 0, max: 1, step: 0.05, label: 'clouds' },
      meander: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'river meander' },
      trees: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'trees' },
      frame: { value: 1.0, min: 0, max: 1, step: 0.05, label: 'repoussoir' },
      grain: { value: 0.5, min: 0, max: 1.2, step: 0.05, label: 'paper grain' },
    },
    onReset: reset,
  });

  // p5.brush binds to the WEBGL sketch once the p5 constructor has returned, so the
  // first brush-dependent frame waits one tick (same pattern as 032).
  noLoop();
  requestAnimationFrame(() => reset());
}

// ---------------------------------------------------------------------------------
// Reset: rebuild the whole scene from the seed, then queue the painting.
// ---------------------------------------------------------------------------------

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  S = buildScene();
  tasks = buildTasks(S);
  taskIdx = 0;
  window.DONE = false;
  loop();
}

function draw() {
  if (!S) return;
  translate(-width / 2, -height / 2);
  R = fieldRect(width, height);
  U = R.w / REF_W;
  const t0 = performance.now();
  const last = Math.min(tasks.length, STOP);
  while (taskIdx < last && performance.now() - t0 < FRAME_BUDGET_MS) {
    const ts = performance.now();
    try {
      tasks[taskIdx++]();
      if (PROFILE) PROFILE.push([taskIdx - 1, Math.round(performance.now() - ts)]);
    } catch (e) {
      // One bad mark must not stop the painting; report it and carry on.
      console.warn('aerial-recession: pass', taskIdx - 1, 'failed:', e && e.message);
    }
  }
  if (taskIdx >= last) {
    noLoop();
    window.DONE = true;
  }
}

// screen mapping (REF → canvas px, top-left origin after the translate in draw)
const X = (x) => R.x + x * U;
const Y = (y) => R.y + y * U;
const pts = (arr) => arr.map((p) => [X(p[0]), Y(p[1])]);

// brush.polygon with a guard: p5.brush sizes an offscreen buffer from the polygon's
// bounds, so degenerate (sub-pixel or non-finite) shapes are skipped, not passed on.
function bpoly(arr) {
  const P = pts(arr);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 - x0 < 1.5 || y1 - y0 < 1.5) return null;
  return brush.polygon(P);
}

function setBrushScale(k) {
  brush.scaleBrushes(k / brushK);
  brushK = k;
}

// ---------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------

function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shadeRGB(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeBand = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------

function buildScene() {
  const rng = G.rng;
  const rnd = (a, b) => a + (b - a) * rng();
  const mood = MOODS[Object.keys(MOODS)[G.param('mood')]] || MOODS['golden hour'];
  const C = {};
  for (const k in mood) C[k] = typeof mood[k] === 'string' ? hexRGB(mood[k]) : mood[k];
  C.fields = mood.fields.map(hexRGB);

  const sunH = G.param('sun');
  const s = { C, rnd, sunH };

  // --- composition: thirds ---
  s.HY = REF_H * (0.645 + rnd(-0.02, 0.02)); // horizon on (near) the lower third line
  s.CX = REF_W / 2;
  s.F = REF_H - s.HY; // focal length: ground at z = 1 meets the bottom edge
  s.sunSide = rng() < 0.5 ? -1 : 1; // -1: sun on the left third
  s.sunX = REF_W * (s.sunSide < 0 ? 1 / 3 : 2 / 3) + rnd(-35, 35);
  s.focalX = REF_W * (s.sunSide < 0 ? 2 / 3 : 1 / 3) + rnd(-25, 25);
  s.sunY = s.HY - 200; // provisional; set above the ridges once they exist
  // Lower sun → warmer, longer shadows, stronger glow.
  s.warmth = 1 - 0.55 * sunH;

  // --- atmospheric perspective: transmittance with distance ---
  const k = 0.0125 * G.param('haze');
  s.aerial = (z) => 1 - Math.exp(-k * z);

  // Sky colour at (x, y): vertical gradient + radial sun glow.
  s.sky = (x, y) => {
    const t = clamp01(y / s.HY);
    let c = t < 0.45 ? mixRGB(C.zenith, C.upper, t / 0.45) : mixRGB(C.upper, C.horizon, easeBand(0.45, 1, t));
    const dx = (x - s.sunX) / 1.6;
    const dy = y - s.sunY;
    const d = Math.sqrt(dx * dx + dy * dy);
    const g = Math.exp(-d / (210 + 140 * s.warmth)) * (0.75 + 0.25 * s.warmth);
    c = mixRGB(c, C.glow, clamp01(g));
    const band = Math.exp(-Math.abs(y - s.HY) / 70) * 0.35 * s.warmth;
    return mixRGB(c, C.glow, band * Math.exp(-Math.abs(x - s.sunX) / 700));
  };
  // Haze colour: warmer and brighter toward the sun.
  s.hazeAt = (x, y) => {
    const g = Math.exp(-Math.pow((x - s.sunX) / 520, 2)) * 0.65 * s.warmth;
    return mixRGB(mixRGB(C.haze, s.sky(x, Math.min(y, s.HY)), 0.35), C.glow, g);
  };
  // Seen colour of something with local colour c at depth z.
  s.seen = (c, z, x, y) => mixRGB(c, s.hazeAt(x, y), s.aerial(z));

  // --- projection onto the ground plane (camera height 1) ---
  s.gy = (z) => s.HY + s.F / z;
  s.gx = (wx, z) => s.CX + (s.F * wx) / z;

  s.clouds = buildClouds(s);
  s.ranges = buildRanges(s);
  // The sun hangs just above whatever ridge lies beneath it; at height 0 it touches the crest.
  let crest = s.HY;
  for (const L of s.ranges) {
    for (const p of L.ridge) if (Math.abs(p[0] - s.sunX) < 40) crest = Math.min(crest, p[1]);
  }
  s.sunY = crest - 22 - 270 * sunH;
  // The focal summit: the highest crest on the focal third, which the frame must not cover.
  s.peakTop = s.HY;
  for (const L of s.ranges) {
    for (const p of L.ridge) if (Math.abs(p[0] - s.focalX) < 60) s.peakTop = Math.min(s.peakTop, p[1]);
  }
  s.zGround = s.ranges[s.ranges.length - 1].z; // the ground plane runs up to the nearest hills
  s.river = buildRiver(s);
  s.fields = buildFields(s);
  s.trees = buildTrees(s);
  s.repoussoir = buildRepoussoir(s);
  s.grain = buildGrain(s);
  return s;
}

// Clouds sit on a ceiling above the camera; projection alone makes far ones smaller,
// flatter and lower, crowding toward the horizon. Each is a cluster of lobes over a
// flat base — the base is where the low sun catches it.
function buildClouds(s) {
  const { rnd, C } = s;
  const n = Math.round(G.param('clouds') * 18 * C.clouds);
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = Math.exp(rnd(Math.log(1.9), Math.log(40)));
    const ceil = 3.0 + rnd(-0.3, 0.45);
    const cy = s.HY - (s.F * ceil) / z;
    const halfView = ((REF_W / 2 + 150) * z) / s.F;
    const wx = rnd(-halfView, halfView);
    const cx = s.gx(wx, z);
    const w = Math.min(620, (rnd(2.2, 5.5) * s.F) / z);
    const elev = clamp01((s.HY - cy) / s.HY);
    const h = w * (0.06 + 0.2 * elev) * rnd(0.8, 1.2);
    const lobes = [];
    const nl = 3 + Math.floor(rnd(0, 5));
    for (let k = 0; k < nl; k++) {
      const u = nl === 1 ? 0.5 : k / (nl - 1);
      const lx = cx + (u - 0.5) * w * 0.75 + rnd(-0.06, 0.06) * w;
      const crown = Math.sin(Math.PI * u); // tallest in the middle
      const rx = w * rnd(0.16, 0.26) * (0.75 + 0.4 * crown);
      const ry = h * rnd(0.55, 0.85) * (0.6 + 0.6 * crown);
      lobes.push({ x: lx, y: cy - ry * 0.45, rx, ry, ph: rnd(0, 100) });
    }
    out.push({ z, cx, cy, w, h, lobes });
  }
  out.sort((a, b) => b.z - a.z);
  return out;
}

// Mountain ranges at geometric depths. Screen amplitude, detail (noise octaves),
// edge treatment and colour all derive from z.
function buildRanges(s) {
  const { rnd, C } = s;
  const N = G.param('ranges');
  const zFar = 230;
  const zNear = 11;
  const out = [];
  const peakLayer = N >= 4 ? 1 : 0;
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 1 : i / (N - 1);
    const z = zFar * Math.pow(zNear / zFar, t);
    const air = s.aerial(z);
    const amp = (250 - 165 * t) * rnd(0.85, 1.15);
    const base = s.gy(z);
    const oct = 2 + Math.round(5 * (1 - air));
    const ridged = 1 - t; // far = sharp alpine, near = rolling
    const feature = 230 + 180 * t;
    const off = rnd(0, 1000);
    const step = 4;
    const raw = [];
    for (let x = -30; x <= REF_W + 30; x += step) {
      let a = 0.5;
      let f = 1 / feature;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < oct; o++) {
        let n = noise(x * f + off, i * 31.7 + o * 9.1);
        const r = 1 - Math.abs(2 * n - 1);
        n = n * (1 - ridged) + r * r * ridged;
        sum += a * n;
        norm += a;
        a *= 0.5;
        f *= 2.07;
      }
      raw.push([x, sum / norm]);
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of raw) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    const peakW = rnd(110, 190);
    const ridge = raw.map(([x, v]) => {
      let h = (v - lo) / (hi - lo + 1e-6);
      if (i === peakLayer) {
        const d = (x - s.focalX) / peakW;
        h = Math.max(h, 0.4 + 1.25 * Math.exp(-d * d) - 0.12 * Math.abs(d));
      }
      return [x, base - amp * (0.12 + 0.88 * h)];
    });
    const local = mixRGB(C.rockFar, C.rockNear, t);
    out.push({ i, t, z, air, base, amp, ridge, local, peaks: findPeaks(ridge, s) });
  }
  return out;
}

// Each summit with real prominence gets a shadow face on the side away from the sun:
// summit → down the ridge to the next valley → down to the base → back up a jittered spur.
function findPeaks(ridge, s) {
  const peaks = [];
  const w = 9;
  for (let j = w; j < ridge.length - w; j++) {
    let isTop = true;
    for (let q = j - w; q <= j + w; q++) if (ridge[q][1] < ridge[j][1]) isTop = false;
    if (!isTop) continue;
    const dir = -s.sunSide; // shadow side
    let v = j;
    while (v + dir > 0 && v + dir < ridge.length - 1 && ridge[v + dir][1] >= ridge[v][1] - 0.5) v += dir;
    const prom = ridge[v][1] - ridge[j][1];
    if (prom > 8) peaks.push({ j, v, dir, prom });
  }
  return peaks;
}

// River: a world-space line whose projection vanishes exactly at the focal point where
// it meets the nearest hills, plus a meander that perspective compresses into S-curves.
function buildRiver(s) {
  const { rnd } = s;
  const zN = s.zGround * 0.98;
  const uFocal = s.focalX - s.CX;
  const uStart = -Math.sign(uFocal) * rnd(60, 260);
  const a = (uStart - uFocal) / (s.F * (1 - 1 / zN));
  const b = uStart / s.F - a;
  const A = 1.25 * G.param('meander');
  const ph = rnd(0, TWO_PI);
  const lam = rnd(0.55, 0.8);
  const center = (z) => {
    const sN = Math.log(z) / Math.log(zN);
    const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp01(sN))), 0.8);
    const m = A * env * Math.sin((TWO_PI * Math.log(z)) / lam + ph);
    return a + b * z + m; // world x
  };
  const halfW = (z) => 0.2 + 0.05 * Math.log(z);
  const samples = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const z = 0.8 * Math.pow(zN / 0.8, i / n);
    const cx = center(z);
    samples.push({ z, wl: cx - halfW(z), wr: cx + halfW(z) });
  }
  return { center, halfW, samples, zN };
}

// Patchwork fields: world-space cells on the ground plane, converging on the horizon.
function buildFields(s) {
  const { rnd, C } = s;
  const out = [];
  const zs = [0.8];
  while (zs[zs.length - 1] < s.zGround) zs.push(zs[zs.length - 1] * rnd(1.28, 1.5));
  zs[zs.length - 1] = s.zGround;
  for (let r = 0; r < zs.length - 1; r++) {
    const z0 = zs[r];
    const z1 = zs[r + 1];
    const cw = rnd(2.2, 3.4);
    const half = ((REF_W / 2 + 80) * z1) / s.F;
    const x0 = -Math.ceil(half / cw) * cw;
    for (let x = x0; x < half; x += cw) {
      const skew = rnd(-0.25, 0.25);
      const corners = [
        [s.gx(x, z0), s.gy(z0)],
        [s.gx(x + cw, z0), s.gy(z0)],
        [s.gx(x + cw + skew * (z1 - z0) * 0.1, z1), s.gy(z1)],
        [s.gx(x + skew * (z1 - z0) * 0.1, z1), s.gy(z1)],
      ];
      const zc = (z0 + z1) / 2;
      const col = C.fields[Math.floor(rnd(0, C.fields.length))];
      out.push({ z: zc, z0, z1, x, cw, poly: corners, col, hedge: rng01(s) < 0.28, hedgeSide: rng01(s) < 0.5 });
    }
  }
  return out;
}
const rng01 = (s) => s.rnd(0, 1);

// Trees on the ground plane: along hedgerows and in noise-driven copses, never in the river.
function buildTrees(s) {
  const { rnd } = s;
  const density = G.param('trees');
  const out = [];
  const river = s.river;
  const tries = Math.round(600 * density);
  for (let i = 0; i < tries; i++) {
    // Uniform in log z: as many trees per screen band near and far, so far copses read as texture.
    const z = Math.exp(rnd(Math.log(2.4), Math.log(s.zGround * 0.97)));
    const half = ((REF_W / 2 + 60) * z) / s.F;
    const wx = rnd(-half, half);
    const copse = noise(wx * 0.3 + 50, z * 0.25 + 80);
    if (copse < 0.55 && rnd(0, 1) > 0.06) continue;
    const rc = river.center(Math.min(z, river.zN));
    if (Math.abs(wx - rc) < river.halfW(z) + 0.15) continue;
    const hW = rnd(0.2, 0.34) * (rnd(0, 1) < 0.12 ? 1.5 : 1);
    out.push({ z, wx, hW, tall: rnd(0, 1) < 0.22, ph: rnd(0, 100) });
  }
  // Bank-side trees reinforce the leading line.
  for (let z = 2.2; z < s.zGround * 0.9; z *= rnd(1.15, 1.4)) {
    if (rnd(0, 1) < 0.4 * (0.4 + density)) {
      const side = rnd(0, 1) < 0.5 ? -1 : 1;
      const wx = river.center(z) + side * (river.halfW(z) + rnd(0.15, 0.35));
      out.push({ z, wx, hW: rnd(0.22, 0.32), tall: rnd(0, 1) < 0.5, ph: rnd(0, 100) });
    }
  }
  out.sort((a, b) => b.z - a.z);
  return out;
}

// Repoussoir: a dark bank rising toward the shadow side and a tree at
// that edge whose limbs arch over the top of the picture. A keep-clear zone (the sun,
// the focal third, the middle distance) prunes any limb that would wander into it.
function buildRepoussoir(s) {
  const { rnd } = s;
  const amt = G.param('frame');
  const side = -s.sunSide; // shadow side
  const edgeX = (u) => (side > 0 ? REF_W - u : u); // distance-from-edge → x
  const fromEdge = (x) => (side > 0 ? REF_W - x : x);

  const bank = [];
  const ph = rnd(0, 100);
  for (let x = -20; x <= REF_W + 20; x += 6) {
    const u = clamp01(1 - fromEdge(x) / REF_W); // 1 at the tree side
    const lift = (62 + 200 * Math.pow(u, 2.6)) * (0.3 + 0.7 * amt);
    const n = noise(ph + x * 0.004) * 46 + noise(ph + 9 + x * 0.025) * 14;
    bank.push([x, REF_H - lift - n + 24]);
  }

  const segs = [];
  const tips = [];
  const forks = [];
  if (amt > 0.05) {
    const bx = edgeX(rnd(50, 120));
    const inward = -side;
    const nearPeak = (x, y) => Math.hypot((x - s.focalX) / 1.3, y - s.peakTop) < 150;
    const clear = (x, y) =>
      Math.hypot(x - s.sunX, y - s.sunY) < 170 ||
      nearPeak(x, y) ||
      (fromEdge(x) > REF_W * 0.24 && y > REF_H * 0.3);
    const grow = (x, y, ang, len, w, depth) => {
      const p = [[x, y, w]];
      let cx = x;
      let cy = y;
      let a = ang;
      const steps = 7;
      let pruned = false;
      for (let k = 1; k <= steps; k++) {
        a += rnd(-0.09, 0.09);
        if (depth >= 2) a += 0.03 * Math.sign(Math.cos(a)) * (k / steps); // thin limbs droop
        // A limb that sees the keep-clear zone ahead curves gently up and back toward the
        // edge, the way a tree grows around an obstacle; only if it cannot does it stop.
        const turn = () => -inward * Math.sign(Math.cos(a) * inward || 1);
        if (depth > 0 && clear(cx + Math.cos(a) * len * 0.6, cy + Math.sin(a) * len * 0.6)) a += turn() * 0.12;
        let nx = cx + (Math.cos(a) * len) / steps;
        let ny = cy + (Math.sin(a) * len) / steps;
        for (let tries = 0; tries < 3 && depth > 0 && clear(nx, ny); tries++) {
          a += turn() * 0.12;
          nx = cx + (Math.cos(a) * len) / steps;
          ny = cy + (Math.sin(a) * len) / steps;
        }
        if (depth > 0 && clear(nx, ny)) {
          pruned = true;
          break;
        }
        cx = nx;
        cy = ny;
        p.push([cx, cy, w * (1 - (0.45 * k) / steps)]);
      }
      if (p.length < 3) return; // a limb stopped at birth is simply not grown
      if (pruned) {
        // Taper the last stretch to a point so a stopped limb never ends as a sawn stub.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.12 + (0.88 * q) / m;
      }
      segs.push({ pts: p, depth });
      if (depth >= 5 || w < 1.5 || p.length < steps + 1) {
        tips.push([cx, cy, depth]);
        return;
      }
      if (depth >= 3) forks.push([cx, cy, depth]); // foliage along the outer limbs, not only at tips
      const before = segs.length;
      const kids = depth === 0 ? 3 : rnd(0, 1) < 0.6 ? 2 : 3;
      for (let c = 0; c < kids; c++) {
        let na = a + rnd(-0.65, 0.65) + inward * rnd(0.15, 0.5) * (depth < 2 ? 1 : 0.4);
        const lo = -Math.PI + 0.1;
        const hi = -0.1;
        if (na > hi && na < Math.PI / 2) na = hi - rnd(0, 0.25);
        if (na < lo || na >= Math.PI / 2) na = lo + rnd(0, 0.25);
        grow(cx, cy, na, len * rnd(0.64, 0.84), w * rnd(0.52, 0.68), depth + 1);
      }
      if (segs.length === before) {
        // Every child was stopped by the keep-clear zone: this limb becomes a tip, tapered.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.12 + (0.88 * q) / m;
        tips.push([cx, cy, depth]);
      }
    };
    grow(bx, REF_H + 30, -Math.PI / 2 + inward * rnd(0.05, 0.14), rnd(340, 420) * (0.75 + 0.25 * amt), rnd(36, 48), 0);
  }
  // Foliage masses at tips and outer forks — high, and never over the sun.
  const leaves = [];
  const nodes = tips.map((t) => [...t, 1]).concat(forks.map((f) => [...f, 0.4]));
  for (const [x, y, d, weight] of nodes) {
    if (y > REF_H * 0.42 && fromEdge(x) > REF_W * 0.2) continue;
    const n = Math.round(rnd(6, 12) * amt * weight);
    for (let k = 0; k < n; k++) {
      const r = rnd(8, 24) * (d > 3 ? 1 : 1.35);
      const lx = x + rnd(-42, 42);
      const ly = y + rnd(-28, 18);
      if (Math.hypot(lx - s.sunX, ly - s.sunY) < 160 + r) continue;
      if (Math.hypot((lx - s.focalX) / 1.3, ly - s.peakTop) < 170 + r) continue;
      leaves.push({ x: lx, y: ly, r, ph: rnd(0, 100) });
    }
  }
  return { side, bank, segs, leaves, amt };
}

function buildGrain(s) {
  const { rnd } = s;
  const n = 26000;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = rnd(0, REF_W);
    out[i * 3 + 1] = rnd(0, REF_H);
    out[i * 3 + 2] = rnd(0, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------
// Painting order. Each entry is one small unit of work; draw() runs them under a budget.
// ---------------------------------------------------------------------------------

function buildTasks(s) {
  const T = [];

  T.push(() => {
    background(...matColour(s));
    setBrushScale(Math.max(0.3, U * 1.7));
    brush.noField();
  });
  T.push(() => paintSkyGradient(s));
  T.push(() => paintSun(s));
  for (const c of s.clouds) T.push(() => paintCloud(s, c));

  const nR = s.ranges.length;
  const raysAfter = Math.max(0, Math.floor(nR / 2) - 1);
  s.ranges.forEach((L, idx) => {
    T.push(() => paintRangeBody(s, L));
    T.push(() => paintRangeLight(s, L));
    if (L.t > 0.3) T.push(() => paintRangeTexture(s, L));
    T.push(() => paintRangeEdge(s, L));
    T.push(() => paintMist(s, L));
    if (idx === raysAfter) T.push(() => paintRays(s));
  });

  T.push(() => paintGroundBase(s));
  // Fields in chunks, far to near.
  const fields = s.fields.slice().sort((a, b) => b.z - a.z);
  for (let i = 0; i < fields.length; i += 12) {
    const chunk = fields.slice(i, i + 12);
    T.push(() => chunk.forEach((f) => paintField(s, f)));
  }
  T.push(() => paintGroundTexture(s));
  T.push(() => paintCloudShadows(s));
  for (let i = 0; i < fields.length; i += 16) {
    const chunk = fields.slice(i, i + 16);
    T.push(() => chunk.forEach((f) => paintHedge(s, f)));
  }
  T.push(() => paintRiver(s));
  T.push(() => paintRiverLight(s));
  // Trees far → near, in small batches (shadows first within each batch).
  for (let i = 0; i < s.trees.length; i += 6) {
    const chunk = s.trees.slice(i, i + 6);
    T.push(() => {
      chunk.forEach((tr) => paintTreeShadow(s, tr));
      chunk.forEach((tr) => paintTree(s, tr));
    });
  }
  T.push(() => paintLightVeil(s));
  T.push(() => paintBank(s));
  T.push(() => paintGrass(s, 0));
  T.push(() => paintGrass(s, 1));
  if (s.repoussoir.segs.length) {
    T.push(() => paintTrunk(s));
    const L = s.repoussoir.leaves;
    for (let i = 0; i < L.length; i += 25) {
      const chunk = L.slice(i, i + 25);
      T.push(() => chunk.forEach((lf) => paintLeafClump(s, lf)));
    }
    T.push(() => paintRim(s));
  }
  T.push(() => paintGrain(s));
  T.push(() => paintVignette(s));
  T.push(() => paintMat(s));
  return T;
}

function matColour(s) {
  return mixRGB([236, 229, 214], s.C.haze, 0.12);
}

// --- sky -------------------------------------------------------------------------

// The sky is sampled densely (48 × ~220) as per-row triangle strips: the sun glow is
// strongly nonlinear, so coarse interpolation would leave visible seams.
function paintSkyGradient(s) {
  noStroke();
  const step = 3;
  const xs = 48;
  for (let y = 0; y < s.HY + 40; y += step) {
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i <= xs; i++) {
      const x = (i / xs) * REF_W;
      const c0 = s.sky(x, y);
      const c1 = s.sky(x, y + step);
      fill(c0[0], c0[1], c0[2]);
      vertex(X(x), Y(y));
      fill(c1[0], c1[1], c1[2]);
      vertex(X(x), Y(y + step + 0.5));
    }
    endShape();
  }
}

function paintSun(s) {
  noStroke();
  const C = s.C;
  for (let r = 150; r > 22; r -= 4) {
    const a = 6 * Math.pow(1 - r / 150, 1.6);
    fill(C.glow[0], C.glow[1], C.glow[2], a * 6);
    circle(X(s.sunX), Y(s.sunY), r * 2 * U);
  }
  fill(C.sun[0], C.sun[1], C.sun[2], 245);
  circle(X(s.sunX), Y(s.sunY), 40 * U);
}

function cloudLobe(lb, base) {
  const out = [];
  const N = 22;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TWO_PI;
    const r = 0.85 + 0.3 * noise(lb.ph + Math.cos(a) * 1.3, lb.ph + Math.sin(a) * 1.3);
    out.push([lb.x + Math.cos(a) * lb.rx * r, Math.min(base, lb.y + Math.sin(a) * lb.ry * r)]);
  }
  return out;
}

function paintCloud(s, c) {
  const C = s.C;
  const air = clamp01(s.aerial(c.z * 4.5));
  const skyHere = s.sky(c.cx, c.cy);
  const body = mixRGB(mixRGB(C.cloudShadow, skyHere, 0.3), skyHere, air * 0.75);
  // Lit undersides: the sun is below the cloud base, so light catches the belly.
  const near = Math.exp(-Math.abs(c.cx - s.sunX) / 550);
  const lit = mixRGB(mixRGB(C.cloudLit, C.glow, near * 0.6), skyHere, air * 0.55);
  const base = c.cy + c.h * 0.18;
  brush.noStroke();
  brush.noHatch();
  for (const lb of c.lobes) {
    brush.fill(toHex(body), 95 - 45 * air);
    brush.fillBleed(0.16, 'out');
    brush.fillTexture(0.4, 0.3);
    bpoly(cloudLobe(lb, base));
  }
  // The lit belly: a thin band hugging the flat base, offset toward the sun.
  const band = [];
  const x0 = c.cx - c.w * 0.42;
  const x1 = c.cx + c.w * 0.42;
  const N = 16;
  for (let k = 0; k <= N; k++) {
    const x = x0 + ((x1 - x0) * k) / N;
    band.push([x + s.sunSide * c.w * 0.04, base - c.h * (0.12 + 0.18 * Math.sin((Math.PI * k) / N))]);
  }
  for (let k = N; k >= 0; k--) {
    const x = x0 + ((x1 - x0) * k) / N;
    band.push([x + s.sunSide * c.w * 0.04, base + c.h * 0.08 * Math.sin((Math.PI * k) / N)]);
  }
  brush.fill(toHex(lit), 100 - 55 * air);
  brush.fillBleed(0.2, 'out');
  brush.fillTexture(0.45, 0.2);
  bpoly(band);
  brush.noFill();
}

// Crepuscular rays: a fan of faint wedges rising from the low sun through the haze.
function paintRays(s) {
  const C = s.C;
  const n = 13;
  noStroke();
  const amp = 6 * C.rays * (0.6 + 0.6 * s.warmth) * (0.5 + 0.5 * G.param('clouds'));
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1.12 + 0.76 * (i / n)) + (noise(i * 3.1) - 0.5) * 0.08;
    const a1 = a0 + 0.03 + 0.045 * noise(i * 7.7);
    const L = 900;
    fill(C.glow[0], C.glow[1], C.glow[2], amp * (0.4 + noise(i * 1.9)));
    beginShape();
    vertex(X(s.sunX), Y(s.sunY));
    vertex(X(s.sunX + Math.cos(a0) * L), Y(s.sunY + Math.sin(a0) * L));
    vertex(X(s.sunX + Math.cos(a1) * L), Y(s.sunY + Math.sin(a1) * L));
    endShape(CLOSE);
  }
}

// --- ranges ----------------------------------------------------------------------

function rangeColour(s, L, x, y) {
  return s.seen(L.local, L.z, x, y);
}

function paintRangeBody(s, L) {
  const poly = L.ridge.concat([[REF_W + 30, REF_H + 30], [-30, REF_H + 30]]);
  const midX = s.focalX;
  const col = rangeColour(s, L, midX, L.base - L.amp * 0.5);
  // Opaque underpaint so nearer ranges truly occlude, then a textured glaze.
  brush.noStroke();
  brush.wash(toHex(col), 255);
  bpoly((poly));
  brush.noWash();
  const top = mixRGB(col, s.hazeAt(midX, L.base - L.amp), 0.25);
  brush.fill(toHex(top), 70);
  brush.fillBleed(0.08, 'in');
  brush.fillTexture(0.55, 0.15);
  bpoly((poly.slice(0, L.ridge.length).concat([[REF_W + 30, L.base + 10], [-30, L.base + 10]])));
  brush.noFill();
}

// Chiaroscuro: shadow faces away from the sun, warm glaze on faces toward it.
function paintRangeLight(s, L) {
  const C = s.C;
  const vis = 1 - L.air; // contrast falls with distance
  for (const pk of L.peaks) {
    const top = L.ridge[pk.j];
    const val = L.ridge[pk.v];
    const face = [];
    const a = Math.min(pk.j, pk.v);
    const b = Math.max(pk.j, pk.v);
    for (let q = a; q <= b; q++) face.push(L.ridge[q]);
    // The face runs down the mountain about as far as the summit stands proud of its valley.
    const depth = Math.min(L.base + 6 - top[1], (val[1] - top[1]) * 2.4 + 14);
    const spurDX = pk.dir * (val[0] - top[0] === 0 ? 20 : Math.abs(val[0] - top[0]) * 0.25);
    const spur = [];
    for (let k = 8; k >= 0; k--) {
      const u = k / 8;
      spur.push([
        top[0] + spurDX * u + (noise(top[0] * 0.05, u * 3) - 0.5) * 22 * u,
        top[1] + depth * u,
      ]);
    }
    const valBase = [val[0] + pk.dir * 10, Math.min(L.base + 6, val[1] + depth * 0.2)];
    const poly = pk.dir > 0 ? face.concat([valBase], spur) : [valBase].concat(face, spur.slice().reverse());
    // Painter's licence: shadow faces keep more of their value than strict haze allows,
    // so even the far focal peak shows its light/shadow split.
    const sh = s.seen(mixRGB(L.local, C.shadow, 0.6), L.z * 0.55, top[0], top[1]);
    brush.noStroke();
    brush.fill(toHex(shadeRGB(sh, 0.9)), 90 + 140 * vis);
    brush.fillBleed(0.12 + 0.2 * L.air, 'out');
    brush.fillTexture(0.35, 0.15);
    bpoly((poly));
  }
  // Warm light on the sunward slopes: a glaze along the upper ridge band.
  const band = [];
  for (const p of L.ridge) band.push([p[0], p[1] + 2]);
  for (let q = L.ridge.length - 1; q >= 0; q--) {
    const p = L.ridge[q];
    band.push([p[0], p[1] + 18 + 40 * (1 - L.t)]);
  }
  const lt = s.seen(mixRGB(L.local, C.light, 0.7), L.z * 0.7, s.sunX, L.base - L.amp);
  brush.fill(toHex(lt), (30 + 80 * vis) * s.warmth);
  brush.fillBleed(0.3, 'in');
  brush.fillTexture(0.6, 0.1);
  bpoly((band));
  brush.noFill();
}

// Near ranges get modelling strokes laid along the slope — scree and gullies — lit warm on
// sunward slopes, cool on the others; sparser and fainter with distance.
function paintRangeTexture(s, L) {
  const C = s.C;
  const vis = 1 - L.air;
  const n = Math.round(24 + 70 * L.t);
  for (let k = 0; k < n; k++) {
    const q = Math.floor(random(4, L.ridge.length - 4));
    const p = L.ridge[q];
    const dy = (L.ridge[q + 3][1] - L.ridge[q - 3][1]) / 24; // screen slope of the crest
    if (Math.abs(dy) < 0.15) continue; // flats carry no fall line
    // Descend along the crest's own slope, a little steeper, away from the summit.
    const dir = dy > 0 ? 1 : -1;
    let ang = Math.atan2(Math.abs(dy) * 1.25 + 0.15, dir);
    ang += random(-0.15, 0.15);
    const facingSun = dir === s.sunSide ? 1 : 0; // descending toward the sun = lit face
    const len = random(0.12, 0.32) * (L.base - p[1]);
    const col = facingSun ? mixRGB(L.local, C.light, 0.45) : mixRGB(L.local, C.shadow, 0.45);
    const seen = mixRGB(s.seen(col, L.z, p[0], p[1]), rangeColour(s, L, p[0], p[1]), 0.35);
    brush.set('2H', toHex(seen), 0.45 + 0.4 * vis);
    const x0 = p[0] + random(-6, 6);
    const y0 = p[1] + random(5, 16);
    brush.line(X(x0), Y(y0), X(x0 + Math.cos(ang) * len), Y(y0 + Math.sin(ang) * len));
  }
}

// Edgework: only nearer ridges are inked, and the ink breaks wherever mist noise is high.
function paintRangeEdge(s, L) {
  if (L.air > 0.55) return; // far ridges: lost edges, wash only
  const C = s.C;
  const vis = 1 - L.air;
  const col = s.seen(mixRGB(L.local, C.silhouette, 0.35), L.z * 0.8, s.focalX, L.base);
  brush.set(L.t > 0.75 ? '2B' : 'HB', toHex(col), 0.5 + 0.9 * vis);
  let run = [];
  const flush = () => {
    if (run.length > 3) brush.spline(run, 0.4);
    run = [];
  };
  for (let q = 0; q < L.ridge.length; q += 2) {
    const p = L.ridge[q];
    const found = noise(p[0] * 0.006 + L.i * 10, 3.3) > 0.42 + 0.25 * L.air;
    if (found) run.push([X(p[0]), Y(p[1]), 0.6 + 0.6 * noise(p[0] * 0.02)]);
    else flush();
  }
  flush();
}

// Mist pooling in the valley floor in front of each range: lost edges by construction.
// Three stacked glazes of falling height and opacity build a gradient with no hard crest.
function paintMist(s, L) {
  const m = G.param('mist');
  if (m <= 0.01) return;
  const C = s.C;
  const h = (14 + 50 * (1 - L.t)) * (0.4 + m);
  const col = mixRGB(s.hazeAt(s.CX, L.base), C.glow, 0.15 * s.warmth);
  brush.noStroke();
  for (let pass = 0; pass < 3; pass++) {
    const k = 1 - pass * 0.3;
    const top = [];
    for (let x = -30; x <= REF_W + 30; x += 20) {
      const n = noise(x * 0.004 + L.i * 5 + pass * 1.7, 9.1);
      top.push([x, L.base - h * k * (0.3 + 1.1 * n)]);
    }
    const poly = top.concat([[REF_W + 30, L.base + h * 0.45], [-30, L.base + h * 0.45]]);
    brush.fill(toHex(col), (22 + 36 * m) * (0.7 + 0.3 * pass));
    brush.fillBleed(0.4, 'out');
    brush.fillTexture(0.2, 0);
    bpoly(poly);
  }
  brush.noFill();
}

// --- ground plane ----------------------------------------------------------------

function groundColour(s, z, x) {
  const C = s.C;
  const t = clamp01(Math.log(z) / Math.log(s.zGround));
  let c = mixRGB(C.groundNear, C.groundFar, t);
  const lit = Math.exp(-Math.abs(x - s.sunX) / 900) * 0.25 * s.warmth;
  c = mixRGB(c, C.light, lit);
  return s.seen(c, z, x, s.gy(z));
}

function paintGroundBase(s) {
  noStroke();
  const zs = [];
  for (let z = 0.75; z < s.zGround * 1.02; z *= 1.08) zs.push(z);
  zs.push(s.zGround * 1.05);
  for (let i = zs.length - 1; i > 0; i--) {
    const za = zs[i];
    const zb = zs[i - 1];
    const ya = s.gy(za) - 2;
    const yb = s.gy(zb) + 1;
    const xsN = 8;
    for (let k = 0; k < xsN; k++) {
      const x0 = (k / xsN) * REF_W;
      const x1 = ((k + 1) / xsN) * REF_W;
      const ca = groundColour(s, za, x0);
      const cb = groundColour(s, za, x1);
      const cc = groundColour(s, zb, x1);
      const cd = groundColour(s, zb, x0);
      beginShape();
      fill(ca[0], ca[1], ca[2]);
      vertex(X(x0), Y(ya));
      fill(cb[0], cb[1], cb[2]);
      vertex(X(x1), Y(ya));
      fill(cc[0], cc[1], cc[2]);
      vertex(X(x1), Y(Math.min(REF_H + 20, yb)));
      fill(cd[0], cd[1], cd[2]);
      vertex(X(x0), Y(Math.min(REF_H + 20, yb)));
      endShape(CLOSE);
    }
  }
}

function paintField(s, f) {
  const C = s.C;
  const cx = (f.poly[0][0] + f.poly[2][0]) / 2;
  const base = groundColour(s, f.z, cx);
  const local = s.seen(mixRGB(f.col, C.light, 0.18 * s.warmth * Math.exp(-Math.abs(cx - s.sunX) / 700)), f.z, cx, s.gy(f.z));
  const col = mixRGB(base, local, 0.72);
  // Inset slightly so the base colour reads as the margin between fields.
  const ccx = f.poly.reduce((a, p) => a + p[0], 0) / 4;
  const ccy = f.poly.reduce((a, p) => a + p[1], 0) / 4;
  const ins = f.poly.map(([x, y]) => [ccx + (x - ccx) * 0.94, ccy + (y - ccy) * 0.86]);
  const big = Math.abs(f.poly[0][1] - f.poly[3][1]) > 14;
  brush.noStroke();
  if (big) {
    brush.fill(toHex(col), 95);
    brush.fillBleed(0.04, 'in');
    brush.fillTexture(0.5, 0.2);
  } else {
    brush.wash(toHex(col), 150);
  }
  bpoly((ins));
  brush.noWash();
  brush.noFill();
}

function paintGroundTexture(s) {
  // Furrows: short strokes on near fields, running toward the vanishing point.
  const C = s.C;
  const n = 70;
  for (let i = 0; i < n; i++) {
    const z = Math.exp(random(Math.log(1.1), Math.log(6)));
    const half = ((REF_W / 2) * z) / s.F;
    const wx = random(-half, half);
    const rc = s.river.center(Math.min(z, s.river.zN));
    if (Math.abs(wx - rc) < s.river.halfW(z) + 0.05) continue;
    const z2 = z * random(1.05, 1.15);
    const x = s.gx(wx, z);
    const col = mixRGB(groundColour(s, z, x), C.shadow, 0.18);
    brush.set('2H', toHex(col), 0.35 + 0.35 / z);
    brush.line(X(x), Y(s.gy(z)), X(s.gx(wx, z2)), Y(s.gy(z2)));
  }
}

// Hedgerows: a continuous low silhouette along a field's near edge with a bumpy crown and
// gaps, its height ∝ 1/z — rows of them step back into the distance.
function paintHedge(s, f) {
  if (!f.hedge || f.z0 < 2.4) return;
  const C = s.C;
  const z = f.z0;
  const y = s.gy(z);
  const body = s.seen(mixRGB(C.foliage, C.shadow, 0.15), z, s.gx(f.x, z), y);
  const lit = s.seen(mixRGB(C.foliageLit, C.light, 0.3 * s.warmth), z, s.gx(f.x, z), y);
  const runs = [];
  let run = [];
  for (let wx = f.x; wx <= f.x + f.cw; wx += 0.025) {
    const rc = s.river.center(Math.min(z, s.river.zN));
    const gap = noise(wx * 1.4, z * 1.3) < 0.4 || Math.abs(wx - rc) < s.river.halfW(z) + 0.12;
    if (gap) {
      if (run.length > 2) runs.push(run);
      run = [];
      continue;
    }
    const n = noise(wx * 14.3, z * 2);
    const h = ((0.025 + 0.09 * n * n) * s.F) / z;
    run.push([s.gx(wx, z), y - h]);
  }
  if (run.length > 2) runs.push(run);
  for (const r of runs) {
    const x0 = r[0][0];
    const x1 = r[r.length - 1][0];
    if (x1 < -20 || x0 > REF_W + 20 || x1 - x0 < 2) continue;
    const poly = r.concat([[x1, y + 0.6], [x0, y + 0.6]]);
    brush.noStroke();
    brush.wash(toHex(body), 240);
    bpoly(poly);
    // light catches the crown on the sun side
    const crown = r.map(([x, yy]) => [x + s.sunSide * 0.6, yy + 0.5]);
    const band = crown.concat(crown.slice().reverse().map(([x, yy]) => [x, yy + Math.max(1, (y - yy) * 0.35)]));
    brush.wash(toHex(mixRGB(body, lit, 0.5 * (1 - s.aerial(z)))), 200);
    bpoly(band);
    brush.noWash();
  }
}

// Cloud shadows on the plain: soft dark patches and the sunlit gaps between them —
// chiaroscuro at the scale of the land itself. Drawn in world space, so they flatten with z.
function paintCloudShadows(s) {
  const C = s.C;
  const n = Math.round(2 + 6 * G.param('clouds') * C.clouds);
  for (let i = 0; i < n; i++) {
    const z = Math.exp(random(Math.log(1.6), Math.log(s.zGround * 0.9)));
    const half = ((REF_W / 2) * z) / s.F;
    const wx = random(-half, half);
    const rw = random(1.2, 3.2);
    const rz = rw * random(0.5, 1.1);
    const poly = [];
    const N = 24;
    const ph = random(100);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TWO_PI;
      const r = 0.7 + 0.5 * noise(ph + Math.cos(a), ph + Math.sin(a));
      const zz = Math.max(0.9, z + Math.sin(a) * rz * r);
      poly.push([s.gx(wx + Math.cos(a) * rw * r, zz), s.gy(zz)]);
    }
    const col = mixRGB(groundColour(s, z, s.gx(wx, z)), C.shadow, 0.55);
    brush.noStroke();
    brush.fill(toHex(col), 115 * (1 - s.aerial(z) * 0.6));
    brush.fillBleed(0.25, 'out');
    brush.fillTexture(0.3, 0.1);
    bpoly(poly);
  }
  brush.noFill();
}

// --- river -----------------------------------------------------------------------

function waterColour(s, z, x) {
  const C = s.C;
  const y = s.gy(z);
  // A level surface mirrors the sky at the same angle above the horizon as the point is below it.
  const yr = s.HY - (y - s.HY) * 1.15;
  let c = s.sky(x, Math.max(0, yr));
  c = mixRGB(c, C.water, 0.12 + 0.22 * (1 - s.aerial(z * 3)));
  return mixRGB(shadeRGB(c, 0.88), s.hazeAt(x, y), s.aerial(z) * 0.6);
}

function paintRiver(s) {
  const r = s.river;
  const sm = r.samples;
  // Opaque body in strips (near→far colour change), then bank ink.
  for (let i = sm.length - 1; i > 0; i--) {
    const a = sm[i];
    const b = sm[i - 1];
    const quad = [
      [s.gx(a.wl, a.z), s.gy(a.z) - 0.6],
      [s.gx(a.wr, a.z), s.gy(a.z) - 0.6],
      [s.gx(b.wr, b.z), s.gy(b.z) + 0.6],
      [s.gx(b.wl, b.z), s.gy(b.z) + 0.6],
    ];
    const cx = s.gx((a.wl + a.wr) / 2, a.z);
    const c = waterColour(s, a.z, cx);
    noStroke();
    fill(c[0], c[1], c[2]);
    beginShape();
    for (const q of quad) vertex(X(q[0]), Y(q[1]));
    endShape(CLOSE);
  }
  // Texture glaze over the whole water body.
  const poly = sm.map((p) => [s.gx(p.wl, p.z), s.gy(p.z)]).concat(sm.slice().reverse().map((p) => [s.gx(p.wr, p.z), s.gy(p.z)]));
  brush.noStroke();
  brush.fill(toHex(waterColour(s, 4, s.focalX)), 40);
  brush.fillBleed(0.02, 'in');
  brush.fillTexture(0.7, 0.4);
  bpoly((poly));
  brush.noFill();
  // Banks: found edges near, lost far.
  const C = s.C;
  for (const side of ['wl', 'wr']) {
    let run = [];
    const flush = () => {
      if (run.length > 2) brush.spline(run, 0.5);
      run = [];
    };
    for (const p of sm) {
      if (p.z > 14) break;
      const x = s.gx(p[side], p.z);
      const y = s.gy(p.z);
      const col = s.seen(mixRGB(C.groundNear, C.silhouette, 0.5), p.z, x, y);
      if (run.length === 0) brush.set('2B', toHex(col), Math.min(2.2, 0.5 + 1.6 / p.z));
      if (noise(p.z * 0.9, side === 'wl' ? 1 : 2) > 0.36) run.push([X(x), Y(y), 1.2 / Math.sqrt(p.z)]);
      else flush();
    }
    flush();
  }
}

// Glitter path and ripples: short horizontal light strokes, brightest under the sun.
function paintRiverLight(s) {
  const C = s.C;
  const r = s.river;
  const n = 260;
  for (let i = 0; i < n; i++) {
    const z = Math.exp(random(Math.log(0.85), Math.log(r.zN)));
    const c = r.center(z);
    const hw = r.halfW(z);
    const wx = c + random(-hw, hw) * 0.85;
    const x = s.gx(wx, z);
    const y = s.gy(z) + random(-0.5, 0.5);
    const sunNear = Math.exp(-Math.pow((x - s.sunX) / 160, 2));
    if (random() > 0.25 + 0.75 * sunNear) continue;
    const len = (random(0.08, 0.3) * s.F) / z;
    const col = mixRGB(mixRGB(C.glow, C.sun, sunNear), s.hazeAt(x, y), s.aerial(z) * 0.5);
    brush.set('2H', toHex(col), 0.4 + 0.9 * sunNear + 0.4 / z);
    brush.line(X(x - len / 2), Y(y), X(x + len / 2), Y(y));
  }
}

// --- trees -----------------------------------------------------------------------

// Cast shadow on the ground: a thin strip running away from the sun; the lower the sun,
// the longer. Its vertical thickness is the crown's depth foreshortened by the ground plane.
function paintTreeShadow(s, tr) {
  const C = s.C;
  const x = s.gx(tr.wx, tr.z);
  const y = s.gy(tr.z);
  const h = (tr.hW * (tr.tall ? 2.3 : 1.15) * s.F) / tr.z;
  const len = h * (0.9 + 2.2 * (1 - s.sunH));
  const thick = Math.max(1.2, ((tr.hW * 0.9 * s.F) / (tr.z * tr.z)) * 0.6);
  const col = mixRGB(groundColour(s, tr.z, x), C.shadow, 0.45);
  noStroke();
  fill(col[0], col[1], col[2], 150 * (1 - s.aerial(tr.z) * 0.7));
  const cx = x - s.sunSide * len * 0.5;
  ellipse(X(cx), Y(y + thick * 0.2), len * U, thick * U);
}

function treeBlob(cx, cy, rx, ry, ph, N = 22) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TWO_PI;
    const r = 0.78 + 0.44 * noise(ph + Math.cos(a) * 1.2, ph + Math.sin(a) * 1.2);
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
}

function paintTree(s, tr) {
  const C = s.C;
  const x = s.gx(tr.wx, tr.z);
  if (x < -60 || x > REF_W + 60) return;
  const y = s.gy(tr.z);
  const sc = s.F / tr.z;
  const w = tr.hW * sc * (tr.tall ? 0.5 : 1);
  const h = tr.hW * sc * (tr.tall ? 2.3 : 1.15);
  const trunkH = h * 0.18;
  const air = s.aerial(tr.z);
  const body = s.seen(C.foliage, tr.z, x, y);
  const dark = s.seen(mixRGB(C.foliage, C.shadow, 0.45), tr.z, x, y);
  const lit = s.seen(mixRGB(C.foliageLit, C.light, 0.4 * s.warmth), tr.z, x, y);
  const big = w > 14;
  if (w > 5) {
    brush.set('HB', toHex(s.seen(C.silhouette, tr.z, x, y)), Math.min(1.6, 0.3 + w * 0.025));
    brush.line(X(x), Y(y + 1), X(x), Y(y - trunkH - h * 0.25));
  }
  const cy = y - trunkH - h * 0.5;
  // Opaque body so the tree occludes what is behind it.
  brush.noStroke();
  brush.wash(toHex(body), 255);
  bpoly(treeBlob(x, cy, w * 0.5, h * 0.5, tr.ph));
  brush.noWash();
  // Shadow half away from the sun, lit half toward it.
  const shadowBlob = treeBlob(x - s.sunSide * w * 0.16, cy + h * 0.08, w * 0.36, h * 0.4, tr.ph + 3, 16);
  const litBlob = treeBlob(x + s.sunSide * w * 0.17, cy - h * 0.1, w * 0.28, h * 0.32, tr.ph + 5, 16);
  if (big) {
    brush.fill(toHex(dark), 150);
    brush.fillBleed(0.05, 'in');
    brush.fillTexture(0.5, 0.3);
    bpoly(shadowBlob);
    brush.fill(toHex(lit), 140 * (1 - air * 0.6) * (0.5 + 0.5 * s.warmth));
    brush.fillBleed(0.06, 'out');
    brush.fillTexture(0.6, 0.2);
    bpoly(litBlob);
    brush.noFill();
  } else if (w > 2.5) {
    brush.wash(toHex(mixRGB(body, lit, 0.45 * (1 - air))), 220);
    bpoly(litBlob);
    brush.noWash();
  }
}

// A breath of light over the middle distance, so the foreground reads against it.
// A flat watercolour glaze clipped to the land (never the sky), densest near the sun.
function paintLightVeil(s) {
  const C = s.C;
  const top = s.HY - 6;
  const poly = [];
  const N = 30;
  for (let k = 0; k <= N; k++) poly.push([s.sunX - 700 + (1400 * k) / N, top]);
  for (let k = N; k >= 0; k--) {
    const x = s.sunX - 700 + (1400 * k) / N;
    poly.push([x, top + 40 + 170 * Math.exp(-Math.pow((x - s.sunX) / 380, 2))]);
  }
  brush.noStroke();
  brush.fill(toHex(C.glow), 55 * s.warmth);
  brush.fillBleed(0.3, 'out');
  brush.fillTexture(0.2, 0.05);
  bpoly(poly);
  brush.noFill();
}

// --- repoussoir ------------------------------------------------------------------

function paintBank(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const poly = rp.bank.concat([[REF_W + 30, REF_H + 40], [-30, REF_H + 40]]);
  const col = mixRGB(C.silhouette, C.groundNear, 0.22);
  brush.noStroke();
  brush.wash(toHex(col), 255);
  bpoly(poly);
  brush.noWash();
  // Light grazes the lip of the bank.
  const lip = [];
  for (const p of rp.bank) lip.push([p[0], p[1] - 1]);
  for (let q = rp.bank.length - 1; q >= 0; q--) lip.push([rp.bank[q][0], rp.bank[q][1] + 26]);
  brush.fill(toHex(mixRGB(col, C.light, 0.28 * s.warmth)), 80);
  brush.fillBleed(0.12, 'in');
  brush.fillTexture(0.7, 0.2);
  bpoly(lip);
  brush.fill(toHex(mixRGB(col, C.shadow, 0.4)), 110);
  brush.fillBleed(0.04, 'in');
  brush.fillTexture(0.8, 0.3);
  bpoly(poly);
  brush.noFill();
}

// Grass along the bank lip: dark blades (pass 0), then warm rim on sunward tips (pass 1).
function paintGrass(s, pass) {
  const C = s.C;
  const rp = s.repoussoir;
  const b = rp.bank;
  const n = 340;
  for (let i = 0; i < n; i++) {
    const q = Math.floor(random(1, b.length - 1));
    const [bx, by] = b[q];
    const clump = noise(bx * 0.012, 4);
    if (clump < 0.3) continue; // grass grows in tufts, not as a comb
    const len = random(8, 40) * (0.4 + 1.2 * clump);
    const lean = random(-0.35, 0.35) + 0.25 * -s.sunSide * noise(bx * 0.004);
    const ang = -Math.PI / 2 + lean;
    const x1 = bx + Math.cos(ang) * len;
    const y1 = by + Math.sin(ang) * len + 6;
    if (pass === 0) {
      brush.set(random() < 0.5 ? '2B' : 'HB', toHex(mixRGB(C.silhouette, C.foliage, random(0, 0.4))), random(0.6, 1.4));
      brush.spline([[X(bx), Y(by + 6), 1], [X((bx + x1) / 2 + lean * 6), Y((by + y1) / 2), 0.8], [X(x1), Y(y1), 0.3]], 0.6);
    } else {
      const sunward = s.sunSide < 0 ? 1 - bx / REF_W : bx / REF_W;
      if (random() > 0.15 + 0.6 * sunward) continue;
      const col = mixRGB(C.light, C.glow, 0.3);
      brush.set('2H', toHex(col), random(0.4, 0.9));
      const tx = bx + Math.cos(ang) * len * 0.6;
      const ty = by + Math.sin(ang) * len * 0.6 + 6;
      brush.line(X(tx + s.sunSide * 0.8), Y(ty), X(x1 + s.sunSide * 0.8), Y(y1));
    }
  }
}

// Limbs: anything thicker than a few units is a filled ribbon whose width follows the
// branch's own taper, so a limb hands its width on to its children without a step;
// only the twigs are pencil strokes.
function paintTrunk(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const dark = mixRGB(C.silhouette, C.shadow, 0.12);
  const segs = rp.segs.slice().sort((a, b) => b.pts[0][2] - a.pts[0][2]);
  for (const seg of segs) {
    if (seg.pts[0][2] >= 2.5) {
      const left = [];
      const right = [];
      for (let k = 0; k < seg.pts.length; k++) {
        const p = seg.pts[k];
        const q = seg.pts[Math.min(k + 1, seg.pts.length - 1)];
        const o = seg.pts[Math.max(k - 1, 0)];
        const dx = q[0] - o[0];
        const dy = q[1] - o[1];
        const d = Math.hypot(dx, dy) || 1;
        const hw = Math.max(0.6, p[2] * 0.5);
        left.push([p[0] - (dy / d) * hw, p[1] + (dx / d) * hw]);
        right.push([p[0] + (dy / d) * hw, p[1] - (dx / d) * hw]);
      }
      brush.noStroke();
      brush.wash(toHex(dark), 255);
      bpoly(left.concat(right.slice().reverse()));
      brush.noWash();
      if (seg.pts[0][2] > 12) {
        // bark: a few long strokes along the limb
        for (let k = 0; k < 3; k++) {
          const off = random(-0.3, 0.3);
          const line = seg.pts.map((p) => [X(p[0] + off * p[2]), Y(p[1]), 0.6]);
          brush.set('2B', toHex(mixRGB(dark, C.shadow, 0.35)), 0.7);
          brush.spline(line, 0.5);
        }
      }
    } else {
      brush.set('2B', toHex(dark), 1);
      const line = seg.pts.map((p) => [X(p[0]), Y(p[1]), Math.max(0.3, Math.min(1.4, p[2] / 2))]);
      brush.strokeWeight(Math.max(0.5, seg.pts[0][2] * 0.45));
      brush.spline(line, 0.5);
    }
  }
}

function paintLeafClump(s, lf) {
  const C = s.C;
  const col = mixRGB(C.silhouette, C.foliage, 0.3 + 0.2 * noise(lf.ph));
  brush.noStroke();
  brush.wash(toHex(col), 235);
  bpoly(treeBlob(lf.x, lf.y, lf.r, lf.r * 0.78, lf.ph, 18));
  brush.noWash();
  // Leaf texture at the edge: a few dabs breaking the outline.
  for (let k = 0; k < 4; k++) {
    const a = random(TWO_PI);
    const rr = lf.r * random(0.25, 0.45);
    brush.wash(toHex(col), 220);
    bpoly(treeBlob(lf.x + Math.cos(a) * lf.r * 0.95, lf.y + Math.sin(a) * lf.r * 0.75, rr, rr * 0.8, lf.ph + k * 3, 10));
    brush.noWash();
  }
}

// Rim light: silhouette edges facing the sun catch a thin warm line — only where the edge
// is an outer edge (not buried inside a neighbouring clump).
function paintRim(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const col = toHex(mixRGB(C.light, C.glow, 0.5));
  const L = rp.leaves;
  for (const lf of L) {
    const towardSun = Math.atan2(s.sunY - lf.y, s.sunX - lf.x);
    const px = lf.x + Math.cos(towardSun) * lf.r;
    const py = lf.y + Math.sin(towardSun) * lf.r * 0.78;
    let buried = false;
    for (const o of L) {
      if (o === lf) continue;
      if (Math.hypot((px - o.x) / o.r, (py - o.y) / (o.r * 0.78)) < 0.95) {
        buried = true;
        break;
      }
    }
    if (buried) continue;
    brush.set('2H', col, 0.4);
    const arc = [];
    for (let k = 0; k <= 6; k++) {
      const a = towardSun - 0.5 + (1.0 * k) / 6;
      arc.push([X(lf.x + Math.cos(a) * lf.r * 1.01), Y(lf.y + Math.sin(a) * lf.r * 0.79), 0.5]);
    }
    brush.spline(arc, 0.5);
  }
  for (const seg of rp.segs) {
    if (seg.depth > 1) continue;
    const line = seg.pts.map((p) => [X(p[0] + s.sunSide * p[2] * 0.44), Y(p[1]), 0.5]);
    brush.set('2H', col, 0.7);
    brush.spline(line, 0.5);
  }
}

// --- finish ----------------------------------------------------------------------

function paintGrain(s) {
  const g = G.param('grain');
  if (g <= 0.01) return;
  const d = s.grain;
  strokeWeight(Math.max(1, 1.1 * U));
  for (const dark of [true, false]) {
    stroke(dark ? 30 : 255, dark ? 24 : 250, dark ? 18 : 240, (dark ? 26 : 30) * g);
    beginShape(POINTS);
    for (let i = 0; i < d.length; i += 3) {
      if ((d[i + 2] < 0.5) !== dark) continue;
      vertex(X(d[i]), Y(d[i + 1]));
    }
    endShape();
  }
  noStroke();
}

// Vignette: four edge bands whose alpha falls smoothly to zero inward (per-vertex
// colour), so there is no ring or step anywhere — only a gentle darkening at the margins.
function paintVignette(s) {
  const c = s.C.silhouette;
  const band = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    // (x0,y0)-(x1,y1) is the outer edge at full alpha; (x2,y2)-(x3,y3) the inner edge at zero.
    beginShape();
    fill(c[0], c[1], c[2], 46);
    vertex(X(x0), Y(y0));
    vertex(X(x1), Y(y1));
    fill(c[0], c[1], c[2], 0);
    vertex(X(x2), Y(y2));
    vertex(X(x3), Y(y3));
    endShape(CLOSE);
  };
  noStroke();
  const dx = REF_W * 0.16;
  const dy = REF_H * 0.16;
  band(0, 0, REF_W, 0, REF_W - dx, dy, dx, dy); // top
  band(REF_W, REF_H, 0, REF_H, dx, REF_H - dy, REF_W - dx, REF_H - dy); // bottom
  band(0, REF_H, 0, 0, dx, dy, dx, REF_H - dy); // left
  band(REF_W, 0, REF_W, REF_H, REF_W - dx, REF_H - dy, REF_W - dx, dy); // right
}

// Clean the field edge: everything outside the picture is the mat.
function paintMat(s) {
  const m = matColour(s);
  noStroke();
  fill(m[0], m[1], m[2]);
  rect(0, 0, width, R.y);
  rect(0, R.y + R.h, width, height - R.y - R.h);
  rect(0, 0, R.x, height);
  rect(R.x + R.w, 0, width - R.x - R.w, height);
}

function fieldRect(W, H) {
  const m = 0.045 * Math.min(W, H);
  const aw = Math.max(10, W - 2 * m);
  const ah = Math.max(10, H - 2 * m);
  let fw = aw;
  let fh = fw / FIELD_ASPECT;
  if (fh > ah) {
    fh = ah;
    fw = fh * FIELD_ASPECT;
  }
  return { x: (W - fw) / 2, y: (H - fh) / 2, w: fw, h: fh };
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('aerial-recession-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  brush.load(); // its internal buffers are sized to the canvas at load time
  if (S) {
    randomSeed(G.seed);
    noiseSeed(G.seed);
    tasks = buildTasks(S);
    taskIdx = 0;
    loop();
  }
}
