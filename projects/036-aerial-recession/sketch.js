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
// Keys: R new scene · P new paint seed (same scene, new hand) · S save PNG.

const REF_W = 1500;
const REF_H = 1000;
const FIELD_ASPECT = REF_W / REF_H;
const FRAME_BUDGET_MS = 28;
// ?profile records per-pass timings in window.PROFILE (index, ms) for tuning.
const PROFILE = /[?&]profile\b/.test(location.search) ? (window.PROFILE = []) : null;
// ?stop=N halts the painting after pass N, to inspect any intermediate state.
const YIELD = 'yield';
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
let SURF = null; // sampler over the oil surface as it stood before the tree went on
let WET = null; // sampler over the wet block-in, for later strokes to pick paint up from
// the warm earth under-layer that sgraffito scratches back to (sienna-like)
const IMPRIMATURA = [150, 94, 54];
let UNDER = null; // cached underpainting {key, W, H, px, img} for oil repaints
const SCENE_PARAMS = ['mood', 'sun', 'haze', 'ranges', 'mist', 'clouds', 'meander', 'trees', 'frame'];
const UI = { status: '' };
let PANEL_W = 0; // space kept clear for the control panel, fixed at each reset

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));

  const SC = 'Scene';
  const ST = 'Oil · strokes';
  const BR = 'Oil · bristles';
  const DI = 'Oil · direction';
  const IM = 'Oil · impasto & light';
  const CO = 'Oil · colour & texture';
  const TR = 'Trees · brushwork';
  const MT = 'Oil · methods';
  G = GenArt.create({
    title: 'Aerial Recession',
    resetOnFinish: true, // a full repaint is heavy: sliders apply on release
    closedGroups: [BR, DI, IM, CO, MT, TR],
    params: {
      medium: { value: 1, options: { watercolour: 0, oil: 1 }, label: 'medium', group: SC },
      wcTrees: { value: 0, options: { 'wash (clean)': 0, 'drawn (charcoal + hatch)': 1 }, label: 'watercolour trees', group: SC },
      mood: { value: 0, options: { 'golden hour': 0, 'after the storm': 1, 'dawn mist': 2 }, label: 'mood', group: SC },
      sun: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'sun height', group: SC },
      haze: { value: 0.72, min: 0.3, max: 2.2, step: 0.05, label: 'atmosphere', group: SC },
      ranges: { value: 5, min: 3, max: 7, step: 1, label: 'mountain ranges', group: SC },
      mist: { value: 0.45, min: 0, max: 1, step: 0.05, label: 'mist', group: SC },
      clouds: { value: 0.55, min: 0, max: 1, step: 0.05, label: 'clouds', group: SC },
      meander: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'river meander', group: SC },
      trees: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'trees', group: SC },
      frame: { value: 1.0, min: 0, max: 1, step: 0.05, label: 'repoussoir', group: SC },
      grain: { value: 0.5, min: 0, max: 1.2, step: 0.05, label: 'paper / canvas grain', group: SC },

      paintSeed: { value: 0, step: 1, label: 'paint seed (0 = scene)', group: 'Seeds' },

      strokeSize: { value: 18, min: 5, max: 34, step: 0.5, label: 'stroke width', group: ST },
      strokeLength: { value: 3.1, min: 1.2, max: 7, step: 0.1, label: 'length ÷ width', group: ST },
      coverage: { value: 1, min: 0.3, max: 2.5, step: 0.05, label: 'coverage', group: ST },
      layers: { value: 3, min: 1, max: 3, step: 1, label: 'layers (coarse → edges)', group: ST },
      edgeThreshold: { value: 16, min: 4, max: 48, step: 1, label: 'edge threshold', group: ST },
      bend: { value: 0.2, min: 0, max: 0.6, step: 0.01, label: 'curvature', group: ST },
      angleJitter: { value: 0.1, min: 0, max: 0.6, step: 0.01, label: 'angle jitter', group: ST },
      colourJitter: { value: 0.05, min: 0, max: 0.25, step: 0.005, label: 'value jitter', group: ST },
      bodyOpacity: { value: 0.95, min: 0.3, max: 1, step: 0.01, label: 'body opacity', group: ST },

      bristles: { value: 9, min: 2, max: 16, step: 1, label: 'max bristles', group: BR },
      bristleOpacity: { value: 1, min: 0, max: 1.5, step: 0.05, label: 'bristle opacity', group: BR },
      dryBrush: { value: 0.3, min: 0, max: 0.85, step: 0.01, label: 'dry-brush breaks', group: BR },
      wetBlend: { value: 1, min: 0, max: 1, step: 0.05, label: 'two-colour load', group: BR },

      vortex: { value: 1, min: 0, max: 1, step: 0.05, label: 'sun vortex', group: DI },
      vortexStretch: { value: 1.6, min: 1, max: 2.5, step: 0.05, label: 'vortex stretch', group: DI },
      fieldSweep: { value: 2.2, min: 0.8, max: 5, step: 0.1, label: 'field sweep', group: DI },
      facetSize: { value: 1.1, min: 0.4, max: 2, step: 0.05, label: 'mountain facet size', group: DI },
      facetMix: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'facets on fall line', group: DI },

      impasto: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'impasto', group: IM },
      lightAngle: { value: -123, min: -180, max: 180, step: 1, label: 'room light angle°', group: IM },
      sunImpasto: { value: 1, min: 0, max: 2, step: 0.05, label: 'sun impasto', group: IM },
      haloRings: { value: 5, min: 2, max: 8, step: 1, label: 'halo tonal rings', group: IM },
      silhouette: { value: 0.5, min: 0, max: 0.9, step: 0.05, label: 'silhouette darkness', group: IM },
      grass: { value: 1, min: 0, max: 2.5, step: 0.05, label: 'grass density (oil)', group: IM },

      barkBrush: { value: 0, options: { charcoal: 0, 'coloured pencil': 1, '2B': 2, crayon: 3, pastel: 4 }, label: 'bark brush (watercolour)', group: TR },
      barkAge: { value: 0.4, min: 0, max: 1, step: 0.05, label: 'bark age (darker = older)', group: TR },
      barkGrooves: { value: 1, min: 0.3, max: 2.5, step: 0.05, label: 'bark grooves', group: TR },
      taperedDarks: { value: 1, min: 0, max: 2.5, step: 0.05, label: 'tapered darks / crevices', group: TR },
      knots: { value: 1, min: 0, max: 3, step: 0.1, label: 'knots', group: TR },
      canopyOpacity: { value: 200, min: 40, max: 230, step: 5, label: 'canopy wash opacity', group: TR },
      hatchSpacing: { value: 7, min: 3, max: 16, step: 0.5, label: 'leaf hatch spacing', group: TR },
      hatchAngle: { value: 55, min: 0, max: 180, step: 1, label: 'leaf hatch angle°', group: TR },
      midTrees: { value: 1, options: { off: 0, on: 1 }, label: 'midground trees too', group: TR },

      brokenColour: { value: 2000, min: 0, max: 8000, step: 100, label: 'broken-colour strokes', group: CO },
      accentStrength: { value: 0.38, min: 0, max: 0.8, step: 0.01, label: 'accent strength', group: CO },
      scumble: { value: 2300, min: 0, max: 5000, step: 100, label: 'scumble strokes', group: CO },
      lostEdges: { value: 0.9, min: 0, max: 2, step: 0.05, label: 'lost-edge band', group: CO },

      economy: { value: 0.7, min: 0, max: 1, step: 0.05, label: 'economy (leave the block-in)', group: MT },
      blockIn: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'block-in simplification', group: MT },
      fatOverLean: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'fat over lean', group: MT },
      wetPickup: { value: 0.5, min: 0, max: 0.8, step: 0.05, label: 'wet-into-wet pickup', group: MT },
      knife: { value: 200, min: 0, max: 600, step: 10, label: 'palette-knife lights', group: MT },
      sgraffito: { value: 90, min: 0, max: 400, step: 10, label: 'sgraffito scratches', group: MT },
      glaze: { value: 0.65, min: 0, max: 1, step: 0.05, label: 'final glazes', group: MT },
    },
    onReset: reset,
  });
  buildControls();

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
  OP = null;
  // Keep the painting clear of the panel (measured once per painting, so collapsing the
  // panel mid-painting can't shift strokes already laid).
  const el = G.gui && G.gui.domElement;
  PANEL_W = el && el.offsetWidth && windowWidth > 700 ? el.offsetWidth + 12 : 0;
  // Only stroke settings changed (same scene, same canvas)? Repaint over the cached
  // underpainting instead of painting it again.
  const cached = G.param('medium') === 1 && UNDER && UNDER.key === sceneKey();
  tasks = cached ? buildRepaintTasks(S) : buildTasks(S);
  taskIdx = 0;
  window.DONE = false;
  loop();
}

// Keep the mat clean while the painting forms. Passes deliberately reach past the field
// edge (washes, oil strokes, the bank) so no edge shows inside it, and the final mat pass
// covers the spill; but until then the spill showed on the mat around the forming image.
// Repainting the mat (four flat rects) at the end of every frame hides it. It has to run
// after p5.brush composites its layer, which also happens at postdraw, so it is a
// postdraw hook registered after p5.brush's.
p5.registerAddon((p5, fn, lifecycles) => {
  lifecycles.postdraw = function () {
    if (!S || !R) return;
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    paintMat(S);
    pop();
  };
});

function draw() {
  if (!S) return;
  translate(-width / 2, -height / 2);
  R = fieldRect(width - PANEL_W, height);
  U = R.w / REF_W;
  const t0 = performance.now();
  // Passes may append passes (the oil engine queues its strokes once it has read the
  // underpainting), so the end is re-read every iteration. A pass returning YIELD ends
  // the frame early, so p5.brush flushes to the canvas before the next pass reads it.
  const last = () => Math.min(tasks.length, STOP);
  while (taskIdx < last() && performance.now() - t0 < FRAME_BUDGET_MS) {
    const ts = performance.now();
    try {
      if (tasks[taskIdx++]() === YIELD) break;
      if (PROFILE) PROFILE.push([taskIdx - 1, Math.round(performance.now() - ts)]);
    } catch (e) {
      // One bad mark must not stop the painting; report it and carry on.
      console.warn('aerial-recession: pass', taskIdx - 1, 'failed:', e && e.message);
    }
  }
  if (taskIdx >= last()) {
    noLoop();
    window.DONE = true;
    UI.status = 'done';
  } else {
    UI.status = Math.round((100 * taskIdx) / tasks.length) + '% · ' + (OP && UNDER ? 'oil strokes' : 'underpainting');
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
    const grow = (x, y, ang, len, w, depth, parent = -1) => {
      const p = [[x, y, w]];
      let cx = x;
      let cy = y;
      let a = ang;
      const steps = 7;
      let pruned = false;
      // a limb's gesture: long straight runs broken by an elbow or two where it changes
      // direction, alternating left and right (Etherington: main movement, direction
      // change; Ran: the elbowed olive and dead-wood branches) — not a steady wobble
      // (the trunk itself stays a straight cylinder, Ran)
      const elbowAt = new Set(depth > 0 ? [Math.floor(rnd(2, steps - 1))] : []);
      if (depth > 0 && depth <= 2 && rnd(0, 1) < 0.45) elbowAt.add(Math.floor(rnd(2, steps)));
      let esign = rnd(0, 1) < 0.5 ? -1 : 1;
      const stubs = [];
      for (let k = 1; k <= steps; k++) {
        a += rnd(-0.06, 0.06);
        if (elbowAt.has(k)) {
          // bend the alternate way, unless that heads into the keep-clear zone
          const e = rnd(0.2, 0.4);
          const ahead = (aa) => clear(cx + Math.cos(aa) * len * 0.5, cy + Math.sin(aa) * len * 0.5);
          if (ahead(a + esign * e) && !ahead(a - esign * e)) esign = -esign;
          a += esign * e;
          esign = -esign;
        }
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
        // a broken-off side branch: a short blunt stub (the knuckles along old limbs)
        if (depth <= 2 && w > 6 && k < steps && rnd(0, 1) < 0.16) {
          stubs.push([p.length - 1, a + (rnd(0, 1) < 0.5 ? -1 : 1) * rnd(0.6, 1.1), rnd(0.18, 0.28), rnd(2.5, 4.5)]);
        }
      }
      if (p.length < 3) return; // a limb stopped at birth is simply not grown
      if (pruned) {
        // Taper the last stretch to a point so a stopped limb never ends as a sawn stub.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.38 + (0.62 * q) / m;
      }
      const me = segs.length;
      segs.push({ pts: p, depth, parent });
      for (const [idx, sa, fw, fl] of stubs) {
        if (Math.sin(sa) > -0.1) continue; // stubs point up or sideways, not into the ground
        // sized from the limb as finally drawn (after any end taper), so a stub is never
        // thicker than the wood it grows from
        const [sx, sy, lw] = p[Math.min(idx, p.length - 1)];
        const sw = lw * fw;
        if (sw < 1.2) continue;
        const l = sw * fl;
        const q = [[sx, sy, sw]];
        for (let j = 1; j <= 3; j++) q.push([sx + (Math.cos(sa) * l * j) / 3, sy + (Math.sin(sa) * l * j) / 3, sw * (1 - 0.15 * j)]);
        if (!clear(q[3][0], q[3][1])) segs.push({ pts: q, depth: depth + 2, stub: true, parent: me });
      }
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
        grow(cx, cy, na, len * rnd(0.64, 0.84), w * rnd(0.52, 0.68), depth + 1, me);
      }
      if (segs.length === before) {
        // Every child was stopped by the keep-clear zone: this limb becomes a tip, tapered.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.38 + (0.62 * q) / m;
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

// Everything that shapes the underpainting, plus the canvas it was read from.
function sceneKey() {
  const p = SCENE_PARAMS.map((k) => G.param(k));
  return JSON.stringify([G.seed, p, width, height, pixelDensity(), PANEL_W]);
}

// Oil repaint over the cached underpainting: restore it, then the oil passes.
function buildRepaintTasks(s) {
  OP = null;
  return [
    () => {
      background(...matColour(s));
      setBrushScale(Math.max(0.3, U * 1.7));
      brush.noField();
      if (!UNDER.img) {
        UNDER.img = createImage(UNDER.W, UNDER.H);
        UNDER.img.loadPixels();
        UNDER.img.pixels.set(UNDER.px);
        UNDER.img.updatePixels();
      }
      image(UNDER.img, 0, 0, width, height);
    },
    () => oilBegin(s),
    () => paintCanvasWeave(s),
    () => paintVignette(s),
    () => paintMat(s),
  ];
}

// Panel extras: progress, seed stepping for scene and paint, presets.
function buildControls() {
  const gui = G.gui;
  if (!gui) return; // contact-sheet tiles have no panel
  const st = gui.add(UI, 'status').name('painting').listen().disable();
  // sit the readout just under the seed controls rather than at the foot of the panel
  const kids = gui.$children;
  kids.insertBefore(st.domElement, kids.children[2] || null);
  const seeds = gui.folders.find((f) => f._title === 'Seeds') || gui.addFolder('Seeds');
  const paint = () => G.param('paintSeed');
  const act = {
    scenePrev: () => G.setSeed(Math.max(0, G.seed - 1)),
    sceneNext: () => G.setSeed(G.seed + 1),
    sceneRandom: () => G.randomize(),
    paintPrev: () => G.setParams({ paintSeed: Math.max(1, (paint() || 2) - 1) }),
    paintNext: () => G.setParams({ paintSeed: (paint() || 0) + 1 }),
    paintRandom: () => G.setParams({ paintSeed: 1 + Math.floor(Math.random() * 999999) }),
    save: () => {
      const blob = new Blob([JSON.stringify({ piece: '036-aerial-recession', seed: G.seed, params: G.params }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'aerial-recession-' + G.seed + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    load: () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        f.text().then((t) => {
          try {
            const j = JSON.parse(t);
            if (j.params) G.setParams(j.params);
            if (j.seed !== undefined) G.setSeed(Number(j.seed) >>> 0);
          } catch (e) {
            console.warn('aerial-recession: preset not readable', e && e.message);
          }
        });
      };
      inp.click();
    },
    // the tuned painting (README, "Tuned defaults"): seed 4 with every setting at its default
    tuned: () => {
      G.setSeed(4);
      G.setParams(G.defaults());
    },
    resetStrokes: () => {
      const d = G.defaults();
      const out = {};
      for (const k in d) if (SCENE_PARAMS.indexOf(k) < 0 && k !== 'medium' && k !== 'grain' && k !== 'paintSeed') out[k] = d[k];
      G.setParams(out);
    },
  };
  seeds.add(act, 'scenePrev').name('◀ scene seed');
  seeds.add(act, 'sceneNext').name('▶ scene seed');
  seeds.add(act, 'sceneRandom').name('🎲 new scene');
  seeds.add(act, 'paintPrev').name('◀ paint seed');
  seeds.add(act, 'paintNext').name('▶ paint seed');
  seeds.add(act, 'paintRandom').name('🎲 new hand (P)');
  const presets = gui.addFolder('Presets');
  presets.add(act, 'tuned').name('★ Tuned painting (seed 4)');
  presets.add(act, 'save').name('Save preset (.json)');
  presets.add(act, 'load').name('Load preset…');
  presets.add(act, 'resetStrokes').name('Reset stroke settings');
  presets.close();
  window.AR_ACTIONS = act; // keyboard + inspection
}

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
      // In oil the underpainting carries only the trees' cast shadows: the oil field
      // strokes are long sweeps, and any that started on a watercolour crown dragged its
      // green out across the meadow as a pale ghost round every tree. The crowns are
      // painted on top by oilMidTree, from the scene's palette.
      if (G.param('medium') === 0) chunk.forEach((tr) => paintTree(s, tr));
    });
  }
  // watercolour: the larger midground trees get the charcoal / hatch language in place,
  // before the foreground goes on (in oil they are restated after the oil passes)
  // watercolour, drawn style: the larger midground trees get the charcoal / hatch language
  // (the default wash style leaves them as the layered washes above)
  const drawn = G.param('medium') === 0 && G.param('wcTrees') === 1;
  if (drawn) T.push(() => paintMidTreesBrush(s));
  T.push(() => paintLightVeil(s));
  T.push(() => paintBank(s));
  T.push(() => paintGrass(s, 0));
  T.push(() => paintGrass(s, 1));
  if (s.repoussoir.segs.length) {
    // in oil the underpainting has no framing tree at all: the oil passes paint clean sky
    // behind it, and the tree goes on last, painted (a tree in the underpainting would be
    // sampled into the sky strokes as dark ghosts beside the oil tree)
    if (drawn) {
      for (const t of treeBrushTasks(s)) T.push(t);
      T.push(() => paintCanopyBrush(s));
      T.push(() => paintRim(s));
    } else if (G.param('medium') === 0) {
      // wash style: the tree is laid in the way the sky and ranges are, as transparent
      // washes over one dark silhouette tone, plus a warm rim where it faces the sun
      T.push(() => paintTrunk(s));
      for (const t of washCanopyTasks(s)) T.push(t);
      T.push(() => paintRim(s));
    }
  }
  if (G.param('medium') === 1) {
    // Oil: everything above becomes the underpainting; the oil engine reads it back and
    // repaints the whole surface in directional strokes, then the canvas weave goes on.
    T.push(() => YIELD);
    T.push(() => oilBegin(s));
    T.push(() => paintCanvasWeave(s));
  } else {
    T.push(() => paintGrain(s));
  }
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
  // The crown by Ran Art Blog's guide, in watercolour (light base, then darker glazes
  // layered where it is dark — in watercolour more layers = darker, as more marks are in
  // pen). Basic shapes: sub-clumps (a column of them for a tall tree); each has its
  // shadow glaze offset away from the light (circular transition), stronger lower down
  // (linear transition); far trees get one or two clumps and nothing more.
  const k = 1 - air;
  const lx = Math.sign(s.sunX - x) || s.sunSide;
  const clumps = [];
  if (tr.tall) {
    const m = 3 + Math.round(h / 16);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      const r = w * (0.34 + 0.24 * Math.sqrt(t)) * random(0.9, 1.08);
      clumps.push({ x: x + random(-0.1, 0.1) * w, y: cy - h * 0.5 + r * 0.6 + t * (h * 0.95 - r * 0.6), r, t });
    }
  } else if (w < 5) {
    clumps.push({ x, y: cy, r: w * 0.5, t: 0.5 });
  } else {
    const m = Math.min(6, 3 + Math.round(w / 14));
    for (let i = 0; i < m; i++) {
      const a = random(TWO_PI), d = Math.sqrt(random()) * 0.4;
      const cyy = cy + Math.sin(a) * d * h * 0.85;
      clumps.push({ x: x + Math.cos(a) * d * w, y: cyy, r: w * random(0.28, 0.38), t: clamp01((cyy - (cy - h * 0.5)) / h) });
    }
  }
  clumps.sort((p, q) => p.y - q.y);
  brush.noStroke();
  // the mass: clumps in one base colour, warmer toward the lit top, so they merge
  for (const c of clumps) {
    brush.wash(toHex(mixRGB(body, lit, (0.35 - 0.3 * c.t) * k)), 255);
    bpoly(treeBlob(c.x, c.y, c.r, c.r * 0.9, tr.ph + c.x * 0.05, 14));
  }
  if (w >= 2.5) {
    // circular + linear transition across the whole crown, not per clump: stacked
    // transparent glazes, each smaller, lower and further from the light
    const rx = w * 0.5, ry = h * 0.48;
    for (let g = 0; g < (big ? 3 : 2); g++) {
      const f = 0.85 - g * 0.18;
      brush.wash(toHex(dark), (60 + 25 * g) * (0.4 + 0.6 * k));
      bpoly(treeBlob(x - lx * rx * (0.12 + 0.1 * g), cy + ry * (0.12 + 0.12 * g), rx * f, ry * f, tr.ph + 3 + g, 16));
    }
    if (big) {
      // a few abstract dark dabs low on the shadow side, a few lit ones high on the lit side
      for (let q = 0; q < 6; q++) {
        const rr = w * random(0.05, 0.1);
        brush.wash(toHex(mixRGB(dark, body, random(0, 0.3))), 190);
        bpoly(treeBlob(x - lx * rx * random(0, 0.7), cy + ry * random(0, 0.7), rr, rr * 0.7, tr.ph + 5 + q, 8));
      }
      for (let q = 0; q < 4; q++) {
        const rr = w * random(0.04, 0.08);
        brush.wash(toHex(mixRGB(lit, body, random(0, 0.3))), 200 * k);
        bpoly(treeBlob(x + lx * rx * random(0.1, 0.6), cy - ry * random(0.2, 0.7), rr, rr * 0.7, tr.ph + 9 + q, 8));
      }
    }
  }
  brush.noWash();
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
        // a knobbly, wavering contour (the guide: every trunk has its own personality)
        const hw = Math.max(0.6, p[2] * 0.5) * (1 + 0.14 * (noise(seg.pts[0][0] * 0.1 + k * 0.6, 3) - 0.5));
        left.push([p[0] - (dy / d) * hw, p[1] + (dx / d) * hw]);
        right.push([p[0] + (dy / d) * hw, p[1] - (dx / d) * hw]);
      }
      brush.noStroke();
      brush.wash(toHex(dark), 255);
      bpoly(left.concat(right.slice().reverse()));
      // the darkest accent in the crotch, under the branch where it leaves its parent
      if (seg.depth > 0 && seg.pts.length > 2) {
        const p0 = seg.pts[0], p1 = seg.pts[1];
        const r = p0[2] * 0.55;
        brush.wash(toHex(mixRGB(dark, [0, 0, 0], 0.35)), 230);
        bpoly(treeBlob((p0[0] * 2 + p1[0]) / 3, (p0[1] * 2 + p1[1]) / 3 + r * 0.3, r, r * 0.7, seg.pts[0][0] * 0.1, 10));
      }
      brush.noWash();
      if (seg.pts[0][2] > 6) {
        // a cylinder, not a flat cut-out (the guide: a cylinder's value turns from dark to
        // light): a lighter glaze down the side toward the sun, so the limb rounds
        const sunSide = -s.repoussoir.side;
        const strip = [];
        const back = [];
        for (let k = 0; k < seg.pts.length; k++) {
          const p = seg.pts[k];
          const q = seg.pts[Math.min(k + 1, seg.pts.length - 1)];
          const o = seg.pts[Math.max(k - 1, 0)];
          const dx = q[0] - o[0], dy = q[1] - o[1], d = Math.hypot(dx, dy) || 1;
          let nx = -dy / d, ny = dx / d;
          if (nx * sunSide < 0) { nx = -nx; ny = -ny; }
          const hw = p[2] * 0.5;
          strip.push([p[0] + nx * hw * 0.85, p[1] + ny * hw * 0.85]);
          back.push([p[0] + nx * hw * 0.3, p[1] + ny * hw * 0.3]);
        }
        brush.wash(toHex(mixRGB(dark, mixRGB(C.light, BARK, 0.6), 0.32)), 150);
        bpoly(strip.concat(back.slice().reverse()));
        brush.noWash();
        // bark: short, broken marks along the limb, denser on the shadow side (more marks
        // for darker values), never a long ruled line
        const L = seg.pts.length;
        const nd = Math.round(seg.pts[0][2] * 0.9);
        for (let k = 0; k < nd; k++) {
          const t = random(0, 1);
          const i = Math.min(L - 2, Math.floor(t * (L - 1)));
          const p = seg.pts[i], q = seg.pts[i + 1];
          const f = t * (L - 1) - i;
          const px = p[0] + (q[0] - p[0]) * f, py = p[1] + (q[1] - p[1]) * f;
          const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
          const u = random() < 0.65 ? random(-0.45, 0.05) : random(0.05, 0.4);
          const off = u * p[2] * sunSide;
          const cx = px + (-dy / d) * off, cy = py + (dx / d) * off;
          const l = p[2] * random(0.3, 0.9);
          const lit = u > 0.1 && random() < 0.5;
          brush.set('2B', toHex(lit ? mixRGB(dark, C.light, 0.25) : mixRGB(dark, [0, 0, 0], 0.3)), random(0.5, 0.9));
          brush.line(X(cx - (dx / d) * l * 0.5), Y(cy - (dy / d) * l * 0.5), X(cx + (dx / d) * l * 0.5), Y(cy + (dy / d) * l * 0.5));
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

// The framing tree's canopy in watercolour, by Ran Art Blog's tree guide. Watercolour
// darkens by layering transparent glazes, so the pen's rule ("more marks = darker")
// carries over directly: every clump gets a light-to-mid base wash, then glazes and dabs
// are layered on where it should be dark.
//  - basic shapes: the crown is its tip clumps, painted top to bottom so each lower one
//    overlaps the dark underside of the one above
//  - circular transition: a dark glaze offset away from the light, on every clump;
//    linear transition: the glaze gets stronger toward the bottom of the crown
//  - abstract dabs, irregular and of every size, densest where it is dark; a few lit dabs
//    on the side toward the light
//  - cool in the shadow, warm in the light, all a little desaturated
//  - leaf shape told only at the outer edge: small pointed leaves, rooted in the clump
function washCanopyTasks(s) {
  const C = s.C;
  const rp = s.repoussoir;
  if (!rp.leaves.length) return [];
  // basic shapes: the tip clumps plus sub-clumps filling each cluster's organic outline,
  // so the crown is one mass with holes, not a string of beads
  const L0 = rp.leaves.slice();
  for (const c of canopyClusters(rp.leaves)) {
    const m = Math.round(((c.r * c.r * 0.72) / (14 * 14)) * 1.1);
    for (let k = 0; k < m; k++) {
      const a = random(TWO_PI), d = Math.sqrt(random()) * 0.92;
      const rr = 0.78 + 0.42 * noise(c.ph + Math.cos(a) * 1.1, c.ph + Math.sin(a) * 1.1);
      if (d > rr * 0.95) continue;
      const x = c.x + Math.cos(a) * d * c.r, y = c.y + Math.sin(a) * d * c.r * 0.72;
      if (Math.hypot(x - s.sunX, y - s.sunY) < 150) continue;
      L0.push({ x, y, r: random(10, 18), ph: random(100) });
    }
  }
  const desat = (c, k) => {
    const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k];
  };
  const dark = desat(mixRGB(mixRGB(C.silhouette, [0, 0, 0], 0.1), C.shadow, 0.14), 0.15);
  const mid = desat(mixRGB(C.silhouette, C.foliage, 0.5), 0.15);
  const lit = desat(mixRGB(mid, mixRGB(mixRGB(C.foliage, C.foliageLit, 0.55), C.light, 0.3 * s.warmth), 0.6), 0.15);
  let top = Infinity, bot = -Infinity;
  for (const lf of L0) { top = Math.min(top, lf.y - lf.r); bot = Math.max(bot, lf.y + lf.r); }
  const span = Math.max(1, bot - top);
  // light toward the sun's side and up
  const lx = Math.sign(s.sunX - (rp.side > 0 ? REF_W * 0.85 : REF_W * 0.15)) || -rp.side;
  const Lx = lx * 0.7, Ly = -0.7;
  const clumps = L0.slice().sort((a, b) => a.y - b.y);
  const clusters = canopyClusters(rp.leaves);
  // the shading is read off the cluster each clump belongs to, treated as one sphere —
  // shading every small clump as its own ball turns the crown into a string of beads
  const owner = (x, y) => {
    let best = clusters[0], bd = Infinity;
    for (const c of clusters) {
      const d = Math.hypot((x - c.x) / c.r, (y - c.y) / (c.r * 0.72));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const shadeAt = (x, y) => {
    const c = owner(x, y);
    const u = Math.max(-1, Math.min(1, (x - c.x) / c.r)), v = Math.max(-1, Math.min(1, (y - c.y) / (c.r * 0.72)));
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u + v * v)));
    const lam = Math.max(0, u * Lx * 0.8 + v * Ly * 0.8 + nz * 0.45);
    return clamp01(Math.pow(lam, 0.8) * (1 - 0.4 * clamp01((y - top) / span)));
  };
  const tasks = [];
  // 1. the mass: three overlapping irregular blobs per clump, light-to-mid by position
  for (let i = 0; i < clumps.length; i += 20) {
    const chunk = clumps.slice(i, i + 20);
    tasks.push(() => {
      brush.noStroke();
      for (const lf of chunk) {
        const t = shadeAt(lf.x, lf.y);
        brush.wash(toHex(mixRGB(mid, lit, 0.45 * t)), 235);
        for (let q = 0; q < 3; q++) {
          const a = random(TWO_PI), d = random(0.15, 0.35);
          bpoly(treeBlob(lf.x + Math.cos(a) * d * lf.r, lf.y + Math.sin(a) * d * lf.r * 0.8, lf.r * random(0.6, 0.8), lf.r * random(0.5, 0.75), lf.ph + q * 5, 12));
        }
      }
      brush.noWash();
    });
  }
  // 2. circular + linear transition: a dark glaze on every clump, kept inside its base
  // blobs (never on the sky), its strength read off the cluster's sphere — so the value
  // turns smoothly across the whole mass instead of every clump becoming its own ball
  for (let i = 0; i < clumps.length; i += 30) {
    const chunk = clumps.slice(i, i + 30);
    tasks.push(() => {
      brush.noStroke();
      for (const lf of chunk) {
        const t = shadeAt(lf.x, lf.y);
        if (t > 0.75) continue;
        brush.wash(toHex(dark), 170 * (1 - t / 0.75));
        bpoly(treeBlob(lf.x, lf.y, lf.r * 0.55, lf.r * 0.48, lf.ph + 3, 12));
      }
      brush.noWash();
    });
  }
  // 3. abstract dabs, densest where dark; lit dabs where light; edge leaves
  for (let i = 0; i < clumps.length; i += 20) {
    const chunk = clumps.slice(i, i + 20);
    tasks.push(() => {
      brush.noStroke();
      for (const lf of chunk) {
        const rx = lf.r, ry = lf.r * 0.8;
        const n = 4 + Math.round(lf.r * 0.3);
        for (let k = 0; k < n; k++) {
          const a = random(TWO_PI), d = Math.sqrt(random()) * 0.9;
          const x = lf.x + Math.cos(a) * d * rx, y = lf.y + Math.sin(a) * d * ry;
          const t = shadeAt(x, y);
          const r = lf.r * Math.exp(random(-2.3, -1.3));
          if (random() < t) {
            if (t < 0.45 || random() > 0.5) continue;
            brush.wash(toHex(mixRGB(lit, mid, random(0, 0.35))), 200);
          } else {
            brush.wash(toHex(mixRGB(dark, mid, random(0, 0.35))), 190);
          }
          bpoly(treeBlob(x, y, r, r * random(0.5, 0.9), lf.ph + 7 + k, 8));
        }
        for (let k = 0; k < 9; k++) {
          const a = random(TWO_PI);
          const ex = lf.x + Math.cos(a) * rx * 0.8, ey = lf.y + Math.sin(a) * ry * 0.8;
          if (L0.some((o) => o !== lf && Math.hypot((ex - o.x) / o.r, (ey - o.y) / (o.r * 0.8)) < 0.95)) continue;
          const la = a + random(-0.5, 0.5) + 0.3, len = random(4, 7);
          const c = shadeAt(ex, ey) > 0.5 && random() < 0.6 ? lit : mixRGB(dark, mid, random(0, 0.4));
          const tip = [ex + Math.cos(la) * len, ey + Math.sin(la) * len];
          const nx = -Math.sin(la) * len * 0.22, ny = Math.cos(la) * len * 0.22;
          brush.wash(toHex(c), 220);
          bpoly([[ex, ey], [ex + Math.cos(la) * len * 0.5 + nx, ey + Math.sin(la) * len * 0.5 + ny], tip, [ex + Math.cos(la) * len * 0.5 - nx, ey + Math.sin(la) * len * 0.5 - ny]]);
        }
      }
      brush.noWash();
    });
  }
  return tasks;
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

// --- tree brushwork (p5.brush) ----------------------------------------------------
//
// The framing tree, drawn the way a draughtsman builds one in charcoal:
//   trunk & limbs  never one line: several slightly wandering strands laid side by side
//                  across each limb's width, overlapping so dry pigment accumulates in
//                  the overlaps — bark striations and mass in one gesture. A few light
//                  strands on the sunward flank.
//   branches       the recursion's own segments, each drawn with a weight that tapers
//                  with the limb (charcoal near the trunk, 2B in the outer twigs).
//   foliage        abstract clouds rather than leaves: the tip clumps are gathered into
//                  canopy masses, each a bleeding watercolour fill on a curved organic
//                  outline (beginShape with curvature), a lighter fill toward the sun,
//                  then ink hatching laid over the mass for leaf texture.
// p5.brush mixes spectrally, so overlapping dark strokes deepen like real charcoal.

const BARK = [74, 53, 37]; // #4a3525
// p5.brush 2.2.3 ships no 'hatch_brush' (its README still lists one); rotring is the
// clean technical-pen line closest to it.
const HATCH_BRUSH = 'rotring';

// Weight argument giving a mark `w` REF units wide with built-in brush `name`. The
// constants are measured, not the library's nominal weights: drawn at brush scale 1, a
// unit of weight lays down this many pixels of visible mark (grain and scatter
// included) — charcoal 3.1 px, crayon 3.2, 2B 1.4, cpencil 1.2, pastel 8.9.
const BRUSH_PX = { charcoal: 3.1, crayon: 3.2, '2B': 1.4, cpencil: 1.2, pastel: 8.9 };
function brushW(w, name = 'charcoal') {
  return Math.max(0.2, (w * U) / ((BRUSH_PX[name] || 1.5) * brushK));
}

function barkBrush() {
  return ['charcoal', 'cpencil', '2B', 'crayon', 'pastel'][G.param('barkBrush')] || 'charcoal';
}

// Normal of a polyline at index k.
function polyNormal(P, k) {
  const a = P[Math.max(0, k - 1)];
  const b = P[Math.min(P.length - 1, k + 1)];
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const d = Math.hypot(tx, ty) || 1;
  return [-ty / d, tx / d];
}

// The front tree in watercolour, one pass per limb (thin → thick, so the trunk sits on
// the branches it throws). Small limbs keep only their essential marks.
function treeBrushTasks(s) {
  const rp = s.repoussoir;
  if (!rp.segs.length) return [];
  const T = trunkTones(s);
  const segs = rp.segs.slice().sort((a, b) => a.pts[0][2] - b.pts[0][2]);
  const out = [
    () => {
      brush.noField();
      brush.noFill();
      brush.noHatch();
    },
  ];
  // twigs together in one pass: weight tapers with the limb
  out.push(() => {
    for (const seg of segs) {
      const P = seg.pts;
      const w0 = P[0][2];
      if (w0 >= 2.5) continue;
      const line = P.map((p) => [X(p[0]), Y(p[1]), Math.max(0.25, p[2] / w0)]);
      const twig = seg.depth <= 3 ? 'charcoal' : '2B';
      brush.set(twig, toHex(T.dark), brushW(Math.max(0.7, w0 * 0.9), twig));
      brush.spline(line, 0.5);
    }
  });
  for (const seg of segs) {
    if (seg.pts[0][2] < 2.5) continue;
    out.push(() => {
      const { marks, pts } = trunkMarks(s, jointed(seg, s.repoussoir.segs), { flare: seg.depth === 0 ? 0.55 : 0 });
      const small = seg.pts[0][2] * U < 10;
      // the body: a crisp fill on the limb's outline in the mid tone, then the marks
      noStroke();
      fill(T.mid[0], T.mid[1], T.mid[2]);
      beginShape(TRIANGLE_STRIP);
      pts.forEach((p, k) => {
        const [nx, ny] = polyNormal(pts, k);
        const hw = Math.max(0.6, p[2] * 0.5);
        vertex(X(p[0] + nx * hw), Y(p[1] + ny * hw));
        vertex(X(p[0] - nx * hw), Y(p[1] - ny * hw));
      });
      endShape();
      for (const m of marks) {
        if (small && m.kind !== 'band' && m.kind !== 'edge' && m.kind !== 'rim') continue;
        drawMarkBrush(m);
      }
    });
  }
  return out;
}

// Gather the tip clumps into canopy masses (greedy proximity clustering).
function canopyClusters(leaves) {
  const out = [];
  const used = new Array(leaves.length).fill(false);
  for (let i = 0; i < leaves.length; i++) {
    if (used[i]) continue;
    const members = [];
    for (let j = i; j < leaves.length; j++) {
      if (!used[j] && Math.hypot(leaves[j].x - leaves[i].x, leaves[j].y - leaves[i].y) < 70) {
        used[j] = true;
        members.push(leaves[j]);
      }
    }
    let cx = 0, cy = 0;
    for (const m of members) { cx += m.x; cy += m.y; }
    cx /= members.length;
    cy /= members.length;
    let r = 0;
    for (const m of members) r = Math.max(r, Math.hypot(m.x - cx, m.y - cy) + m.r);
    out.push({ x: cx, y: cy, r: Math.max(14, r), members, ph: random(100) });
  }
  return out;
}

function organicOutline(cx, cy, rx, ry, ph, n = 9) {
  const P = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TWO_PI;
    const rr = 0.78 + 0.42 * noise(ph + Math.cos(a) * 1.1, ph + Math.sin(a) * 1.1);
    P.push([X(cx + Math.cos(a) * rx * rr), Y(cy + Math.sin(a) * ry * rr)]);
  }
  return P;
}

function paintCanopyBrush(s) {
  const C = s.C;
  const rp = s.repoussoir;
  if (!rp.leaves.length) return;
  const op = G.param('canopyOpacity');
  const spacing = G.param('hatchSpacing');
  const hAng = (G.param('hatchAngle') * Math.PI) / 180;
  const base = mixRGB(C.silhouette, C.foliage, 0.32);
  const core = mixRGB(C.silhouette, [0, 0, 0], 0.15);
  const litC = mixRGB(mixRGB(C.foliage, C.foliageLit, 0.6), C.light, 0.25 * s.warmth);
  const hatchC = mixRGB(C.silhouette, [0, 0, 0], 0.2);
  const clusters = canopyClusters(rp.leaves);
  brush.noStroke();
  for (const c of clusters) {
    // the mass: a bleeding watercolour fill on a curved organic outline
    brush.noHatch();
    brush.fill(toHex(base), op);
    brush.fillBleed(0.12, 'out');
    brush.fillTexture(0.5, 0.35);
    brush.beginShape(0.5);
    for (const [x, y] of organicOutline(c.x, c.y, c.r, c.r * 0.72, c.ph)) brush.vertex(x, y);
    brush.endShape(true);
    // a denser core, offset away from the sun: the shadowed heart of the mass
    brush.fill(toHex(core), op * 0.8);
    brush.fillBleed(0.1, 'out');
    brush.fillTexture(0.55, 0.3);
    brush.beginShape(0.5);
    for (const [x, y] of organicOutline(c.x - s.sunSide * c.r * 0.15, c.y + c.r * 0.1, c.r * 0.6, c.r * 0.45, c.ph + 4, 8)) brush.vertex(x, y);
    brush.endShape(true);
    // the light reaching into the mass from the sun's side
    const lx = c.x + s.sunSide * c.r * 0.28;
    const ly = c.y - c.r * 0.18;
    brush.fill(toHex(litC), op * 0.45);
    brush.fillBleed(0.15, 'out');
    brush.fillTexture(0.6, 0.2);
    brush.beginShape(0.5);
    for (const [x, y] of organicOutline(lx, ly, c.r * 0.55, c.r * 0.4, c.ph + 9, 8)) brush.vertex(x, y);
    brush.endShape(true);
    brush.noFill();
    // hatching over the mass: leaf texture, denser in the core
    const a0 = hAng + random(-0.35, 0.35);
    brush.hatch(spacing * U, a0, { rand: 0.45, gradient: 0.3 });
    brush.hatchStyle(HATCH_BRUSH, toHex(hatchC), 1.2);
    brush.circle(X(c.x), Y(c.y), c.r * 0.72 * U, 0.8);
    // cross-hatching in the shadowed core only
    brush.hatch(spacing * 0.8 * U, a0 + 1.15, { rand: 0.45 });
    brush.circle(X(c.x - s.sunSide * c.r * 0.18), Y(c.y + c.r * 0.12), c.r * 0.42 * U, 0.8);
    brush.noHatch();
  }
  // the edge: the individual clumps as small dark dabs, so the silhouette stays broken
  for (const lf of rp.leaves) {
    brush.fill(toHex(shadeRGB(base, random(0.6, 0.95))), Math.min(255, op + 50));
    brush.fillBleed(0.05, 'out');
    brush.fillTexture(0.4, 0.5);
    brush.beginShape(0.5);
    for (const [x, y] of organicOutline(lf.x, lf.y, lf.r * 0.8, lf.r * 0.62, lf.ph, 7)) brush.vertex(x, y);
    brush.endShape(true);
  }
  brush.noFill();
}

// The larger midground trees get the same language, lightly: two charcoal strands for
// the trunk and a hatched canopy core. Far trees are left as painted.
function paintMidTreesBrush(s, trunks = true) {
  if (G.param('midTrees') < 0.5) return;
  // trunks: the trunk model, two-tone (watercolour; oil paints them in oil)
  if (trunks) for (const m of midTrunkMarks(s)) drawMarkBrush(m);
  const C = s.C;
  const spacing = G.param('hatchSpacing') * 0.7;
  const hAng = (G.param('hatchAngle') * Math.PI) / 180;
  for (const tr of s.trees) {
    const x = s.gx(tr.wx, tr.z);
    if (x < -40 || x > REF_W + 40) continue;
    const y = s.gy(tr.z);
    const sc = s.F / tr.z;
    const w = tr.hW * sc * (tr.tall ? 0.5 : 1);
    const h = tr.hW * sc * (tr.tall ? 2.3 : 1.15);
    if (w < 14) continue;
    const air = s.aerial(tr.z);
    const cy = y - h * 0.18 - h * 0.5;
    brush.noFill();
    brush.noHatch();
    const hc = s.seen(mixRGB(C.foliage, C.silhouette, 0.4), tr.z, x, y);
    brush.noStroke();
    brush.hatch(spacing * U, hAng + random(-0.3, 0.3), { rand: 0.3 });
    brush.hatchStyle(HATCH_BRUSH, toHex(hc), 1 - 0.5 * air);
    brush.circle(X(x - s.sunSide * w * 0.08), Y(cy + h * 0.05), w * 0.32 * U, 0.7);
    brush.noHatch();
  }
}

// --- trunk model (after pendrawings.me, "How to draw tree trunks") -------------------
//
// The tutorial, stripped to what it actually prescribes:
//   1. a trunk drawing has two jobs: show its ROUNDNESS and show its BARK TEXTURE;
//   2. bark = slightly wandering lines along the trunk's length (the grooves) — only as
//      many as convey the feel;
//   3. roundness = three tones across the width: the third away from the light darkest,
//      the middle third (facing the viewer) mid, the third toward the light lightest;
//      darker overall reads older;
//   4. finish with TAPERED DARKS — crevices and edge roughness — and ground the base;
//   5. character = shape, size and placement of the tapered darks; long flowing bark lines
//      become crevices; knots;
//   6. small / far trunks: two tones only, the dark side zagged;
//   7. close-up trunks: individual bark pieces, each textured on its own.
//
// Decomposed into code: every limb is a cylinder parameterised by s (along its length)
// and u ∈ [−1, 1] (across it, −1 = away from the light, +1 = toward it). The rules above
// become marks laid on that cylinder — tone bands with wandering boundaries, grooves,
// tapered darks, a zagged dark edge, broken highlights on the lit third, knots, and (on
// close-up limbs) bark pieces cut between the grooves. The level of detail is chosen
// from the limb's width on screen (rule 6 vs 3 vs 7). The same marks are rendered as
// oil strokes (impasto on the lit third) or with p5.brush in the watercolour medium.

// Resample a [x, y, w] polyline to roughly even arc-length steps.
function resampleLimb(P, step) {
  const out = [P[0].slice()];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1];
    const b = P[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= L) {
      const f = t / L;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      t += step;
    }
    carry = L - (t - step);
  }
  const last = P[P.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last.slice());
  return out;
}

// The tutorial's three tones assume light from the side. This sun stands in the picture,
// so we see the tree's shaded face: the three bands keep their order but are compressed
// into a low key (how low follows the silhouette-darkness setting), and the real light
// is carried by the narrow warm rim on the sunward edge — glow against gloom.
function trunkTones(s) {
  const C = s.C;
  const age = G.param('barkAge');
  const key = G.param('silhouette'); // 0.4 by default
  const warm = mixRGB(C.light, C.glow, 0.4);
  const dark = mixRGB(mixRGB(C.silhouette, [0, 0, 0], 0.2 + 0.6 * key), [0, 0, 0], 0.25 * age);
  const mid = mixRGB(mixRGB(C.silhouette, BARK, 0.6 - 0.5 * key), C.silhouette, 0.3 * age);
  const light = mixRGB(mixRGB(BARK, warm, 0.2 + 0.2 * s.warmth), C.silhouette, 0.15 + 0.5 * key + 0.2 * age);
  return { dark, mid, light, warm, crevice: mixRGB(dark, [0, 0, 0], 0.45) };
}

// A child limb starts exactly where its parent ends, and both taper there, which leaves
// a notch at every fork. Extending the child back into its parent by half its width
// lets the two bodies overlap into one joint.
// A limb grows out of its parent instead of butting onto it (Ran's olive and Etherington's
// branch drawings: the wood flows round the fork, no seam). The child's path is extended
// back along the parent's last stretch — far for the dominant (thickest) child, which
// continues the parent's run, a little for the others — and its base swells into a
// collar, never wider than the parent there.
function jointed(seg, segs) {
  const P = seg.pts;
  if (seg.depth === 0 || P.length < 2) return P;
  const [x0, y0, w0] = P[0];
  const par = segs && seg.parent >= 0 ? segs[seg.parent] : null;
  if (!par) {
    const dx = P[1][0] - x0, dy = P[1][1] - y0, d = Math.hypot(dx, dy) || 1;
    return [[x0 - (dx / d) * w0 * 0.45, y0 - (dy / d) * w0 * 0.45, w0 * 0.6]].concat(P);
  }
  const sibs = segs.filter((o) => o.parent === seg.parent && !o.stub);
  const dominant = sibs.every((o) => o.pts[0][2] <= w0);
  const pw = par.pts[par.pts.length - 1][2];
  const back = dominant ? 3 : 1;
  const tail = par.pts.slice(Math.max(0, par.pts.length - 1 - back), par.pts.length - 1).map((q) => [q[0], q[1], Math.min(q[2], dominant ? q[2] : w0 * 0.8)]);
  const out = tail.concat(P.map((q) => q.slice()));
  const start = tail.length, nC = Math.max(2, Math.round((P.length - 1) * 0.3));
  for (let i = 0; i < nC; i++) {
    const t = i / nC;
    out[start + i][2] = Math.min(pw * 0.95, out[start + i][2] * (1 + 0.32 * (1 - t) * (1 - t)));
  }
  return out;
}

// Marks for one limb. P: [[x, y, w], …] in REF units. opts: {flare, lod}.
function trunkMarks(s, P, opts = {}) {
  const T = trunkTones(s);
  const W0 = Math.max(...P.map((p) => p[2]));
  const grooveK = G.param('barkGrooves');
  const darkK = G.param('taperedDarks');
  const knotK = G.param('knots');
  // level of detail from the limb's width on screen (rule 6 / 3 / 7)
  const px = W0 * U;
  const lod = opts.lod || (px < 6 ? 'two' : W0 < 26 ? 'three' : 'close');
  const pts = resampleLimb(P, Math.max(2.5, W0 * 0.22));
  const n = pts.length;
  if (n < 3) return [];
  // root flare: the base of the trunk widens into the ground
  let total = 0;
  const arc = [0];
  for (let i = 1; i < n; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    arc.push(total);
  }
  if (opts.breathe) {
    // the width breathes along the length: no limb is a perfect taper
    const bp = random(1000);
    // plus a knobbly, irregular contour (Ran: outlines drawn as broken, wavering lines —
    // every trunk has its own "personality", never a ruled tube)
    for (let i = 0; i < n; i++) pts[i][2] *= (1 + 0.26 * (noise(bp + arc[i] * 0.025) - 0.5)) * (1 + 0.16 * (noise(bp + 50 + arc[i] * 0.16) - 0.5));
  }
  if (opts.flare) {
    for (let i = 0; i < n; i++) {
      const t = arc[i] / total;
      if (t < 0.16) pts[i][2] *= 1 + opts.flare * Math.pow(1 - t / 0.16, 2);
    }
  }
  // which normal faces the light (the sun's side)
  const mid = pts[n >> 1];
  const nm = polyNormal(pts, n >> 1);
  const sig = nm[0] * (s.sunX - mid[0]) + nm[1] * (s.sunY - mid[1]) >= 0 ? 1 : -1;
  const at = (i, u) => {
    const k = Math.max(0, Math.min(n - 1, Math.round(i)));
    const [nx, ny] = polyNormal(pts, k);
    const hw = pts[k][2] * 0.5;
    return [pts[k][0] + nx * sig * u * hw, pts[k][1] + ny * sig * u * hw];
  };
  const wAt = (i) => pts[Math.max(0, Math.min(n - 1, Math.round(i)))][2];
  const ph = random(1000);
  const marks = [];
  // bunching: on a bend the bark lines crowd to the inside and spread on the outside
  // (Etherington). bend[k] is the inside of the curve in u units (−1…1, signed), scaled
  // by how sharply the limb turns there.
  const bend = new Float32Array(n);
  for (let k = 1; k < n - 1; k++) {
    const [nx, ny] = polyNormal(pts, k);
    const mx = (pts[k - 1][0] + pts[k + 1][0]) / 2 - pts[k][0];
    const my = (pts[k - 1][1] + pts[k + 1][1]) / 2 - pts[k][1];
    const seg = Math.hypot(pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]) || 1;
    bend[k] = Math.max(-1, Math.min(1, ((mx * nx + my * ny) * sig * 8) / seg));
  }
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k < n - 1; k++) bend[k] = (bend[k - 1] + 2 * bend[k] + bend[k + 1]) / 4;
  const path = (i0, i1, u, wander, phase, bunch = 0) => {
    const out = [];
    const steps = Math.max(2, Math.min(8, Math.round(i1 - i0)));
    for (let k = 0; k <= steps; k++) {
      const i = i0 + ((i1 - i0) * k) / steps;
      let uu = u + (noise(phase + i * 0.35) - 0.5) * 2 * wander;
      if (bunch) uu += bunch * bend[Math.max(0, Math.min(n - 1, Math.round(i)))] * (1 - uu * uu) * 0.6;
      out.push(at(i, Math.max(-1.05, Math.min(1.05, uu))));
    }
    return out;
  };
  // bark marks change tone with the side they are on (Etherington: "invert the bark tone
  // from light to dark" — black lines in the light, light lines in the shadow)
  const barkCol = (u) => {
    if (u < -1 / 3) return random() < 0.45 ? mixRGB(T.mid, T.light, 0.25) : T.crevice;
    return u < 1 / 3 ? mixRGB(T.dark, T.mid, 0.25) : mixRGB(T.mid, T.dark, 0.45);
  };
  const stepI = (len) => Math.max(1, len / (total / (n - 1)));

  // 1+3 — the body: tone bands along the length, boundaries wandering (rule 3; rule 6
  // drops the middle tone)
  const bands = lod === 'two'
    ? [{ u: -0.5, f: 0.55, col: T.dark, rel: 0 }, { u: 0.5, f: 0.55, col: mixRGB(T.mid, T.light, 0.6), rel: 0.15 }]
    : [{ u: -0.48, f: 0.38, col: T.dark, rel: 0 }, { u: 0.12, f: 0.38, col: T.mid, rel: 0 }, { u: 0.66, f: 0.38, col: T.light, rel: 0.25 }];
  const chunk = stepI(Math.max(8, Math.min(70, W0 * 1.4)));
  for (const b of bands) {
    for (let i = 0; i < n - 1; i += chunk * 0.8) {
      const i1 = Math.min(n - 1, i + chunk);
      const w = wAt((i + i1) / 2) * b.f;
      marks.push({ kind: 'band', path: path(i, i1, b.u, 0.08, ph + b.u * 50), w, col: b.col, col2: shadeRGB(b.col, random(0.85, 1.1)), rel: b.rel });
    }
  }

  // the band boundaries, worked wet into wet: short strokes loaded with both tones
  if (lod !== 'two') {
    for (const [ub, ca, cb] of [[-0.1, T.dark, T.mid], [0.4, T.mid, T.light]]) {
      for (let i = random(0, 2); i < n - 1; i += stepI(W0 * random(0.35, 0.8))) {
        const len = stepI(W0 * random(0.5, 1.2));
        const col = mixRGB(ca, cb, random(0.35, 0.65));
        marks.push({ kind: 'band', path: path(i, Math.min(n - 1, i + len), ub + random(-0.08, 0.08), 0.06, ph + ub * 90 + i), w: wAt(i) * random(0.1, 0.18), col, col2: random() < 0.5 ? ca : cb, rel: 0 });
      }
    }
  }

  // 2 — grooves: wandering lines along the length, denser on the dark side
  const K = Math.max(2, Math.min(18, Math.round((W0 / 3.4) * grooveK)));
  for (let k = 0; k < K; k++) {
    const u = -0.92 + (1.84 * (k + random(0.2, 0.8))) / K;
    const keep = u < -1 / 3 ? 0.95 : u < 1 / 3 ? 0.8 : 0.45;
    let i = random(0, stepI(W0 * 0.6));
    while (i < n - 1) {
      // short and broken, never a long ruled streak (the guide: abstract marks with the
      // bark's direction, varied, not uniform)
      const len = stepI(W0 * random(0.35, 1.3));
      const i1 = Math.min(n - 1, i + len);
      if (random() < keep) {
        const col = barkCol(u);
        marks.push({ kind: 'groove', path: path(i, i1, u, 0.07, ph + k * 7.7, 1), w: Math.max(0.7, wAt(i) * random(0.04, 0.085)), col, col2: mixRGB(col, T.dark, 0.4), rel: 0.05 });
      }
      i = i1 + stepI(W0 * random(0.2, 0.8));
    }
  }

  // secondary dashes between the primary grooves (Etherington: "broad, primary strokes
  // with smaller secondary dashes"), more of them where the value is darker (Ran: more
  // marks for darker values), following the same flow and bunching on bends
  if (lod !== 'two') {
    const nd2 = Math.round((total / W0) * 7 * grooveK);
    for (let j = 0; j < nd2; j++) {
      const u = -0.95 + Math.pow(random(), 1.6) * 1.75; // crowded toward the shadow side
      const len = stepI(W0 * random(0.12, 0.4));
      const i = random(0, Math.max(0, n - 1 - len));
      const col = barkCol(u);
      marks.push({ kind: 'groove', path: path(i, i + len, u, 0.04, ph + 500 + j * 1.3, 1), w: Math.max(0.6, wAt(i) * random(0.025, 0.05)), col, col2: col, rel: 0.03 });
    }
  }

  // reflected light: the shadow does not run to the edge — a dim strip of light bounced
  // from sky and ground turns the far side of the cylinder (Etherington's highlight /
  // midtone / shadow / highlight; "shadow shows in the third quarter")
  if (lod !== 'two') {
    // kept inside the edge and close to the dark, so the limb is not outlined on both sides
    const refl = mixRGB(mixRGB(T.dark, T.mid, 0.35), s.C.shadow, 0.15);
    for (let i = random(0, 2); i < n - 1; i += stepI(W0 * random(0.5, 1.2))) {
      if (random() < 0.6) continue;
      const len = stepI(W0 * random(0.6, 1.8));
      marks.push({ kind: 'light', path: path(i, Math.min(n - 1, i + len), -0.7, 0.04, ph + 700 + i), w: Math.max(0.6, wAt(i) * random(0.06, 0.1)), col: refl, col2: mixRGB(refl, T.dark, 0.3), rel: 0 });
    }
  }

  // cross-contours: bark wraps around the cylinder (Etherington), and the rings are
  // ellipses whose visible front bows down below eye level and up above it, rounder the
  // further from the horizon (Ran: the cylinders against the horizon line). Only on
  // near-upright limbs, broken into pieces, heaviest on the shadow side.
  if (lod !== 'two' && W0 > 12) {
    for (let i = random(1, 3); i < n - 1; i += stepI(W0 * random(0.7, 1.4))) {
      const k = Math.round(i);
      const ny = polyNormal(pts, k)[1];
      if (Math.abs(ny) > 0.7) continue; // normal near vertical = limb near horizontal
      const y = pts[k][1];
      const r = Math.max(0.06, Math.min(0.35, Math.abs(y - s.HY) / 520));
      const dir = y > s.HY ? 1 : -1; // screen y: below the horizon the front bows down
      const hw = wAt(i) * 0.5;
      let u = -0.98;
      while (u < 0.55) {
        const du = random(0.18, 0.45);
        const u1 = Math.min(0.6, u + du);
        const seg = [];
        for (let q = 0; q <= 4; q++) {
          const uu = u + ((u1 - u) * q) / 4;
          const p0 = at(i, uu);
          seg.push([p0[0], p0[1] + dir * r * hw * (1 - uu * uu)]);
        }
        if (random() < 0.75) marks.push({ kind: 'break', path: seg, w: Math.max(0.6, wAt(i) * random(0.025, 0.045)), col: barkCol((u + u1) / 2), col2: T.dark, rel: 0.03 });
        u = u1 + random(0.06, 0.2);
      }
    }
  }

  // 4+5 — tapered darks: spindles clustered at the dark/mid boundary; the long ones are
  // crevices
  const nd = Math.round((total / W0) * 2.4 * darkK * (lod === 'two' ? 0.4 : 1));
  for (let j = 0; j < nd; j++) {
    const u = -0.78 + Math.pow(random(), 1.4) * 0.95;
    const crev = random() < 0.22;
    const len = stepI(W0 * (crev ? random(1.4, 3) : random(0.3, 1.0)));
    const i = random(0, Math.max(0, n - 1 - len));
    marks.push({ kind: 'dark', path: path(i, i + len, u, 0.05, ph + j * 3.1), w: Math.max(0.7, wAt(i) * (crev ? random(0.05, 0.09) : random(0.07, 0.16))), col: T.crevice, col2: T.dark, rel: 0.02 });
  }

  // 6 / 4 — edge roughness: the dark edge zagged (short diagonal darks biting inward)
  const zagStep = stepI(W0 * 0.32);
  let flip = 1;
  for (let i = 0; i < n - 1; i += zagStep * random(0.7, 1.3)) {
    const a = at(i, -1.03);
    const b = at(i + zagStep * 0.6 * flip, -0.72 + random(-0.08, 0.08));
    flip = -flip;
    marks.push({ kind: 'edge', path: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], w: Math.max(0.6, wAt(i) * random(0.05, 0.09)), col: T.crevice, col2: T.dark, rel: 0.02 });
  }

  // 3 — the light third: broken highlights, and a lit rim on the light edge
  if (lod !== 'two' || px > 3) {
    // fewer when the trunk is small on screen: a highlight can't be thinner than a pixel,
    // so at gallery size each one weighs more
    const sparse = Math.max(1, 40 / Math.max(1, px));
    for (let i = random(0, 2); i < n - 1; i += stepI(W0 * random(0.25, 0.8) * sparse)) {
      const len = stepI(W0 * random(0.4, 1.3));
      const u = random(0.45, 0.9);
      const hc = mixRGB(T.light, T.warm, random(0.1, 0.35));
      marks.push({ kind: 'light', path: path(i, Math.min(n - 1, i + len), u, 0.05, ph + i), w: Math.max(0.7, wAt(i) * random(0.07, 0.15)), col: hc, col2: mixRGB(hc, T.light, 0.4), rel: 0.35 });
    }
    for (let i = 0; i < n - 1; i += stepI(W0 * random(0.6, 1.8))) {
      const len = stepI(W0 * random(0.6, 1.6));
      if (random() < 0.6) continue; // the rim breaks: a found edge here and there, not an outline
      marks.push({ kind: 'rim', path: path(i, Math.min(n - 1, i + len), 0.95, 0.02, ph + 300 + i), w: Math.max(0.5, wAt(i) * 0.045), col: T.warm, col2: T.light, rel: 0.3 });
    }
  }

  // 5 — knots: a dark ring round a mid core, on trunks big enough to carry them
  if (W0 > 14) {
    const nk = Math.round((total / (W0 * 6)) * knotK);
    for (let j = 0; j < nk; j++) {
      const i = random(n * 0.25, n * 0.9);
      const u = random(-0.35, 0.35);
      const c = at(i, u);
      const w = wAt(i);
      const rx = w * random(0.08, 0.13);
      const ry = rx * random(1.3, 1.8);
      const [nx, ny] = polyNormal(pts, Math.round(i));
      const ang = Math.atan2(nx, -ny); // along the limb
      const ring = [];
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * TWO_PI;
        const lx = Math.cos(a) * rx;
        const ly = Math.sin(a) * ry;
        ring.push([c[0] + lx * Math.cos(ang) - ly * Math.sin(ang), c[1] + lx * Math.sin(ang) + ly * Math.cos(ang)]);
      }
      for (let k = 0; k < 8; k += 2) marks.push({ kind: 'knot', path: ring.slice(k, k + 3), w: Math.max(0.6, rx * 0.5), col: T.crevice, col2: T.dark, rel: 0.1 });
      marks.push({ kind: 'knotcore', path: [[c[0], c[1] - ry * 0.3], [c[0], c[1]], [c[0], c[1] + ry * 0.3]], w: rx * 0.9, col: T.mid, col2: T.dark, rel: 0.3 });
    }
  }

  // Ran's "basic details" before texture: a hollow / old scar on the main trunk — a dark
  // elongated opening, its lower lip catching the light, the bark marks crowding round it
  if (opts.hollow && W0 > 18 && random() < 0.7) {
    const i = random(n * 0.3, n * 0.7);
    const u = random(-0.35, 0.15);
    const c = at(i, u);
    const w = wAt(i);
    const [nx, ny] = polyNormal(pts, Math.round(i));
    const ang = Math.atan2(nx, -ny);
    const rx = w * random(0.07, 0.11), ry = rx * random(2, 3.2);
    const ring = (sc) => {
      const R = [];
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * TWO_PI;
        const lx = Math.cos(a) * rx * sc, ly = Math.sin(a) * ry * sc;
        R.push([c[0] + lx * Math.cos(ang) - ly * Math.sin(ang), c[1] + lx * Math.sin(ang) + ly * Math.cos(ang)]);
      }
      return R;
    };
    marks.push({ kind: 'knotcore', path: [ring(1)[7], [c[0], c[1]], ring(1)[2]], w: rx * 1.7, col: T.crevice, col2: T.crevice, rel: 0 });
    // the lower lip only a little lighter than the bark: an opening, not a bright hook
    const lip = ring(1.1).slice(1, 4);
    marks.push({ kind: 'band', path: lip, w: Math.max(0.6, rx * 0.25), col: mixRGB(T.dark, T.mid, 0.6), col2: T.dark, rel: 0 });
    for (const sc of [1.5, 1.9, 2.4]) {
      const R = ring(sc);
      for (let k = 0; k < 10; k += 3) if (random() < 0.7) marks.push({ kind: 'groove', path: R.slice(k, k + 3), w: Math.max(0.6, rx * 0.25), col: barkCol(u - 0.2), col2: T.dark, rel: 0.03 });
    }
  }

  // 7 — close-up: bark pieces, cut by short transverse breaks between neighbouring grooves
  if (lod !== 'two') {
    const rows = Math.round((total / W0) * 3 * grooveK);
    for (let j = 0; j < rows; j++) {
      const i = random(0, n - 1);
      const u0 = random(-0.9, 0.7);
      const du = random(0.12, 0.3);
      const a = at(i, u0);
      const b = at(i + stepI(W0 * random(-0.15, 0.15)), u0 + du);
      const col = u0 < -1 / 3 ? T.crevice : u0 < 1 / 3 ? T.dark : mixRGB(T.mid, T.dark, 0.5);
      marks.push({ kind: 'break', path: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], w: Math.max(0.6, wAt(i) * random(0.025, 0.045)), col, col2: col, rel: 0.05 });
    }
  }
  return { marks, pts, sig, at, wAt, n, stepI, W0 };
}

// A mark as an oil stroke: the path is fitted by a cubic through its quarter points.
function markToOil(m) {
  const P = m.path;
  const q = (t) => P[Math.min(P.length - 1, Math.round(t * (P.length - 1)))];
  const p0 = P[0], p3 = P[P.length - 1];
  const a = q(1 / 3), b = q(2 / 3);
  const pr = m.kind === 'dark' || m.kind === 'edge' || m.kind === 'break' ? [0.35, 1.1, 1, 0.3] : [0.9, 1.05, 1, 0.85];
  return {
    P: [[p0[0], p0[1], pr[0]], [a[0], a[1], pr[1]], [b[0], b[1], pr[2]], [p3[0], p3[1], pr[3]]],
    w: m.w,
    body: m.col,
    far: m.col2 || m.col,
    relief: m.rel * G.param('impasto'),
    angular: false,
    soft: false,
    scumble: false,
    crisp: m.kind !== 'band',
  };
}

// A mark in p5.brush: bands as watercolour washes, grooves in the bark brush, tapered
// darks and edges in 2B with pointed pressure, light in coloured pencil.
function drawMarkBrush(m) {
  const P = m.path;
  if (m.kind === 'band') {
    // tone bands as plain fills: hundreds of bleeding watercolour polygons per tree are
    // far too slow, and the grain comes from the brush marks laid over them
    noStroke();
    fill(m.col[0], m.col[1], m.col[2], 215);
    beginShape(TRIANGLE_STRIP);
    P.forEach((p, k) => {
      const [nx, ny] = polyNormal(P, k);
      vertex(X(p[0] + nx * m.w * 0.5), Y(p[1] + ny * m.w * 0.5));
      vertex(X(p[0] - nx * m.w * 0.5), Y(p[1] - ny * m.w * 0.5));
    });
    endShape();
    return;
  }
  const name = m.kind === 'groove' ? barkBrush() : m.kind === 'light' || m.kind === 'rim' ? 'cpencil' : '2B';
  const taper = m.kind === 'dark' || m.kind === 'edge' || m.kind === 'break';
  const pts = P.map((p, k) => {
    const t = k / (P.length - 1);
    return [X(p[0]), Y(p[1]), taper ? 0.25 + Math.sin(Math.PI * t) : 1];
  });
  brush.set(name, toHex(m.col), brushW(m.w, name));
  brush.spline(pts, 0.5);
}

// Midground trunks, two-tone (rule 6), stopping at the canopy's underside.
function midTrunkMarks(s) {
  const out = [];
  for (const tr of s.trees) {
    const x = s.gx(tr.wx, tr.z);
    if (x < -40 || x > REF_W + 40) continue;
    const y = s.gy(tr.z);
    const sc = s.F / tr.z;
    const w = tr.hW * sc * (tr.tall ? 0.5 : 1);
    const h = tr.hW * sc * (tr.tall ? 2.3 : 1.15);
    if (w < 9) continue;
    // the trunk ends just inside the crown's lower edge (it is painted after the crown,
    // so any further and it would show through the foliage)
    const top = y - h * 0.18 - h * (tr.tall ? 0.02 : 0.12);
    const tw = Math.max(1.2, w * 0.09);
    const P = [[x, y + 1, tw * 1.15], [x + random(-0.4, 0.4), (y + top) / 2, tw], [x + random(-0.6, 0.6), top, tw * 0.75]];
    const air = s.aerial(tr.z);
    const { marks } = trunkMarks(s, P, { lod: 'two' });
    for (const m of marks) {
      m.col = s.seen(m.col, tr.z, x, y);
      m.col2 = s.seen(m.col2, tr.z, x, y);
      m.rel *= 1 - air;
      out.push(m);
    }
  }
  return out;
}

// --- the tree, painted (oil) -----------------------------------------------------------
//
// Vector geometry reads as illustration however good the marks inside it are. A painter
// never has an outline: the limb is the edge of its own strokes, and the edge is then
// corrected by cutting the surrounding paint back in. So, in oil:
//   - limb paths are smoothed (Chaikin) and their width breathes along the length;
//   - the body is overlapping bristle strokes, not a filled shape;
//   - after each limb, short strokes of the paint around it — sampled from the oil surface
//     as it stood before the tree went on — are dragged along both edges, overlapping them
//     here and there (negative painting), so the silhouette is hard but broken;
//   - the canopy is clustered leaf dabs: a dark core, mid dabs, warm dabs toward the sun,
//     the outline broken by dabs that overshoot it, and sky holes painted back in.

// Read the oil surface before the tree goes on: the colour the cut-ins and sky holes
// need is the paint around and behind the tree, not the underpainting.
function captureSurface() {
  SURF = surfaceSampler();
}

// A sampler over the canvas as it stands now (REF coordinates in, RGB out).
function surfaceSampler() {
  loadPixels();
  const d = pixelDensity();
  const W = Math.round(width * d);
  const H = Math.round(height * d);
  const px = new Uint8ClampedArray(pixels);
  return (x, y) => {
    x = Math.max(4, Math.min(REF_W - 4, x));
    y = Math.max(4, Math.min(REF_H - 4, y));
    const cx = Math.min(W - 1, Math.max(0, Math.round(X(x) * d)));
    const cy = Math.min(H - 1, Math.max(0, Math.round(Y(y) * d)));
    const k = (cy * W + cx) * 4;
    return [px[k], px[k + 1], px[k + 2]];
  };
}

// Chaikin corner-cutting, twice: the recursion's straight segments become a grown curve.
function smoothLimb(P) {
  let Q = P;
  for (let it = 0; it < 2; it++) {
    const R = [Q[0]];
    for (let i = 0; i < Q.length - 1; i++) {
      const a = Q[i];
      const b = Q[i + 1];
      R.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      R.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    R.push(Q[Q.length - 1]);
    Q = R;
  }
  return Q;
}

// A limb as paint: body strokes, the trunk-model marks, then the cut-ins.
function oilLimbPainterly(s, seg) {
  const T = trunkTones(s);
  const { marks, at, wAt, n, stepI, W0 } = trunkMarks(s, smoothLimb(jointed(seg, s.repoussoir.segs)), { flare: seg.depth === 0 ? 0.55 : 0, breathe: true, hollow: seg.depth === 0 });
  // body: overlapping full-width strokes in the mid tone — the limb is the edge of these
  const len = stepI(W0 * 1.5);
  for (let i = 0; i < n - 1; i += len * 0.55) {
    const i1 = Math.min(n - 1, i + len);
    const k = 6;
    const path = [];
    for (let j = 0; j <= k; j++) path.push(at(i + ((i1 - i) * j) / k, random(-0.04, 0.04)));
    const col = shadeRGB(mixRGB(T.mid, T.dark, random(0, 0.35)), random(0.92, 1.06));
    oilStroke(markToOil({ kind: 'body', path, w: wAt((i + i1) / 2) * random(0.98, 1.06), col, col2: mixRGB(col, T.dark, 0.4), rel: 0 }));
  }
  for (const m of marks) if (m.kind !== 'band' || m.w < W0 * 0.3) oilStroke(markToOil(m));
  // the darkest accents go in the crotch, under a branch where it leaves its parent
  // (Ran's branch steps: light layer, midtones, then the darkest accents on the shadow
  // side and under the junctions)
  if (seg.depth > 0 && !seg.stub && W0 * U > 2) {
    const T2 = trunkTones(s);
    const p0 = at(1, 0), p1 = at(Math.min(n - 1, stepI(W0 * 1.6)), 0);
    const down = at(stepI(W0 * 0.8), 1)[1] > at(stepI(W0 * 0.8), -1)[1] ? 1 : -1; // the underside
    const path = [at(0.5, down * 0.85), at(stepI(W0 * 0.7), down * 0.75), at(Math.min(n - 1, stepI(W0 * 1.5)), down * 0.6)];
    if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1) oilStroke(markToOil({ kind: 'dark', path, w: W0 * 0.32, col: T2.crevice, col2: T2.dark, rel: 0 }));
  }
  // cut-ins: the surrounding paint dragged back over the edge, here and there
  if (SURF && W0 * U > 3) {
    for (const side of [-1, 1]) {
      // not near the base of a branch: there the surroundings are the parent limb, and
      // cutting sky back in would open a pale sliver in the crotch
      const i0 = seg.depth > 0 ? Math.round(n * 0.3) : 0;
      for (let i = i0 + random(0, 2); i < n - 1; i += stepI(W0 * random(0.5, 1.4))) {
        if (random() > 0.5) continue;
        const l = stepI(W0 * random(0.5, 1.6));
        const i1 = Math.min(n - 1, i + l);
        const out = at((i + i1) / 2, side * 1.6);
        const cut = at((i + i1) / 2, side * 1.05);
        // never cut sky back in over another limb (a branch running alongside its parent)
        if (s.repoussoir.segs.some((o) => o !== seg && o.pts.some((q) => Math.hypot(q[0] - cut[0], q[1] - cut[1]) < q[2] * 0.6 + 2))) continue;
        const col = shadeRGB(SURF(out[0], out[1]), random(0.96, 1.04));
        const u0 = side * random(0.95, 1.15);
        const path = [at(i, side * 1.2), at((i + i1) / 2, u0), at(i1, side * 1.25)];
        oilStroke(markToOil({ kind: 'cut', path, w: wAt(i) * random(0.12, 0.28), col, col2: col, rel: 0 }));
      }
    }
  }
}

// The canopy as oil, after Ran Art Blog's tree guide:
//  - basic shapes first: the crown is many small clumps (the tip clumps), each treated as
//    a sphere — the guide's "circular transition" — lit on the side toward the sun and on
//    top, dark underneath and away from it, with a "linear transition" darker toward the
//    bottom of the whole crown; clumps are painted top to bottom, so each lower clump's lit
//    top overlaps the dark underside of the one above (overlapping = depth)
//  - dark values first, then light; value comes from mark density as much as colour:
//    more marks where it is dark, fewer and less defined where it is light
//  - abstract marks, never a pattern: no single direction, no repeated round loops —
//    squiggles, irregular blobs and ticks mixed, every one a different size and angle
//  - temperature transitions too: cool in the shadow, warm in the light; natural colour is
//    less saturated than tube colour
//  - leaf type is told only at the edge: individual pointed leaves stand out against the
//    sky round the crown, the inside stays messy
//  - the branches show through the gaps in the crown
const desat = (c, k) => {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k];
};
function oilCanopy(s) {
  const C = s.C;
  const rp = s.repoussoir;
  if (!rp.leaves.length) return;
  // the crown's basic shape: the tip clumps, plus sub-clumps filling each cluster inside
  // its organic outline, so the crown is a dense mass with holes, not a scatter
  const clusters = canopyClusters(rp.leaves);
  const clumpsAll = rp.leaves.slice();
  for (const c of clusters) {
    const m = Math.round((c.r * c.r * 0.72) / (14 * 14) * 1.1);
    for (let k = 0; k < m; k++) {
      const a = random(TWO_PI);
      const d = Math.sqrt(random()) * 0.92;
      const rr = 0.78 + 0.42 * noise(c.ph + Math.cos(a) * 1.1, c.ph + Math.sin(a) * 1.1);
      if (d > rr * 0.95) continue;
      const x = c.x + Math.cos(a) * d * c.r, y = c.y + Math.sin(a) * d * c.r * 0.72;
      if (Math.hypot(x - s.sunX, y - s.sunY) < 150) continue;
      clumpsAll.push({ x, y, r: random(10, 18), ph: random(100) });
    }
  }
  const core = desat(mixRGB(mixRGB(C.silhouette, [0, 0, 0], 0.15), C.shadow, 0.12), 0.15);
  const mid = desat(mixRGB(C.silhouette, C.foliage, 0.45), 0.15);
  const lit = desat(mixRGB(mid, mixRGB(mixRGB(C.foliage, C.foliageLit, 0.55), C.light, 0.3 * s.warmth), 0.62), 0.15);
  let top = Infinity, bot = -Infinity;
  for (const lf of clumpsAll) { top = Math.min(top, lf.y - lf.r); bot = Math.max(bot, lf.y + lf.r); }
  const span = Math.max(1, bot - top);
  // the light: toward the sun in the picture plane, tilted up, and partly toward us
  const lx0 = s.sunX - (rp.side > 0 ? REF_W * 0.8 : REF_W * 0.2), ly0 = s.sunY - REF_H * 0.3;
  const ll = Math.hypot(lx0, ly0) || 1;
  const L = [(lx0 / ll) * 0.75, (ly0 / ll) * 0.75 - 0.35, 0.55];
  const Ln = Math.hypot(...L);
  L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
  const shadeAt = (u, v, y) => {
    // sphere normal from the position inside the clump, then Lambert, then the crown's
    // own linear transition (darker toward its bottom)
    const d2 = Math.min(1, u * u + v * v);
    const nz = Math.sqrt(1 - d2);
    const lam = Math.max(0, u * L[0] + v * L[1] + nz * L[2]);
    const down = clamp01((y - top) / span);
    return clamp01(Math.pow(lam, 0.8) * (1 - 0.4 * down) + 0.06);
  };
  const colourAt = (t) => {
    // value and temperature together: cool dark → mid → warm light
    if (t < 0.45) return mixRGB(core, mid, t / 0.45);
    return mixRGB(mid, lit, (t - 0.45) / 0.55);
  };
  // an abstract mark: a squiggle, a blob or a tick — never the same twice
  const mark = (x, y, size, col, crisp) => {
    const kind = random();
    const a0 = random(TWO_PI);
    let path;
    if (kind < 0.45) {
      path = [[x, y]];
      let a = a0, px = x, py = y;
      const n = 2 + Math.floor(random(0, 3));
      for (let k = 0; k < n; k++) {
        a += random(-2.2, 2.2);
        px += Math.cos(a) * size * random(0.35, 0.7);
        py += Math.sin(a) * size * random(0.35, 0.7);
        path.push([px, py]);
      }
      oilStroke(markToOil({ kind: crisp ? 'leaf' : 'band', path, w: size * random(0.22, 0.4), col, col2: shadeRGB(col, random(0.85, 1.1)), rel: 0 }));
    } else if (kind < 0.85) {
      const l = size * random(0.5, 1.1);
      path = [[x - Math.cos(a0) * l * 0.5, y - Math.sin(a0) * l * 0.5], [x + random(-0.15, 0.15) * l, y + random(-0.15, 0.15) * l], [x + Math.cos(a0) * l * 0.5, y + Math.sin(a0) * l * 0.5]];
      oilStroke(markToOil({ kind: crisp ? 'leaf' : 'band', path, w: l * random(0.45, 0.8), col, col2: shadeRGB(col, random(0.85, 1.1)), rel: 0 }));
    } else {
      const l = size * random(0.4, 0.8);
      path = [[x, y], [x + Math.cos(a0) * l * 0.5, y + Math.sin(a0) * l * 0.5], [x + Math.cos(a0) * l, y + Math.sin(a0) * l]];
      oilStroke(markToOil({ kind: 'dark', path, w: size * random(0.15, 0.25), col, col2: col, rel: 0 }));
    }
  };

  // 1. the masses, darkest first: each tip clump laid in as a dark, broken underlayer
  // (built from the clumps themselves, so the crown's silhouette is their sum, not an
  // ellipse per cluster)
  for (const lf of clumpsAll) {
    for (let i = 0; i < 3; i++) {
      const a = random(TWO_PI);
      const d = random(0, 0.35) * lf.r;
      const x = lf.x + Math.cos(a) * d, y = lf.y + Math.sin(a) * d * 0.8;
      const Lm = lf.r * random(0.6, 1.0);
      const ang = random(-0.6, 0.6);
      const col = shadeRGB(core, random(0.78, 0.9)); // a touch deeper than the marks that go on it
      oilStroke(markToOil({ kind: 'leaf', path: [[x - Math.cos(ang) * Lm * 0.5, y - Math.sin(ang) * Lm * 0.5], [x, y + random(-0.1, 0.1) * Lm], [x + Math.cos(ang) * Lm * 0.5, y + Math.sin(ang) * Lm * 0.5]], w: lf.r * random(0.38, 0.55), col, col2: shadeRGB(col, 0.85), rel: 0 }));
    }
  }
  // leaf-mark size: big leaves, big marks; this tree is near, so its marks are large
  const leafSize = 3.4;
  // 2. the clumps as spheres, top to bottom (lower clumps overlap the undersides above)
  const clumps = clumpsAll.slice().sort((a, b) => a.y - b.y);
  for (const lf of clumps) {
    const rx = lf.r * 1.05, ry = lf.r * 0.85;
    const area = rx * ry;
    const n = Math.max(10, Math.min(110, Math.round(area / 4.5)));
    // dark values first, then light: two sweeps over the same clump
    for (const pass of [0, 1]) {
      for (let i = 0; i < n * (pass === 0 ? 2 : 1); i++) {
        const a = random(TWO_PI);
        const d = Math.sqrt(random());
        const rr = 0.8 + 0.35 * noise(lf.ph + Math.cos(a), lf.ph + Math.sin(a));
        if (d > rr) continue;
        const u = Math.cos(a) * d, v = Math.sin(a) * d;
        const x = lf.x + u * rx, y = lf.y + v * ry;
        const t = shadeAt(u, v, y);
        if (pass === 0 ? t > 0.45 : t <= 0.45) continue;
        // In pen, value is mark density on white paper (more marks = darker). In oil the
        // paper is the dark underlayer, so the translation runs the other way: the dark
        // sweep covers its zone fully, and light marks thicken toward the lit pole.
        if (pass === 1 && random() > 0.45 + 0.55 * t) continue;
        // the darks are dense marks, not a flat fill: they vary enough to read as texture
        const col = colourAt(Math.max(0, Math.min(1, t + random(pass === 0 ? -0.04 : -0.08, pass === 0 ? 0.32 : 0.08))));
        const size = leafSize * Math.exp(random(-0.5, 0.45));
        // light marks are made "swiftly at an angle": less defined, so they read lighter
        mark(x, y, size, col, pass === 0 || random() < 0.4);
      }
    }
  }
  // 3. the edge: individual leaves against the sky tell the leaf type and size; grown
  // from the outer edge of the clumps actually painted, never floating off them
  for (const lf of clumpsAll) {
    const steps = Math.max(3, Math.round(lf.r * 0.5));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * TWO_PI + random(-0.2, 0.2);
      const ex = lf.x + Math.cos(a) * lf.r * 0.85;
      const ey = lf.y + Math.sin(a) * lf.r * 0.7;
      // an outer edge only: not inside any other clump
      if (clumpsAll.some((o) => o !== lf && Math.hypot((ex - o.x) / o.r, (ey - o.y) / (o.r * 0.8)) < 0.95)) continue;
      if (random() < 0.4) continue;
      const nl = 1 + Math.floor(random(0, 2.5));
      for (let q = 0; q < nl; q++) {
        const la = a + random(-0.7, 0.7) + 0.3; // outward, and drooping
        const len = leafSize * random(1.2, 2.1);
        const bx = ex - Math.cos(a) * len * 0.3, by = ey - Math.sin(a) * len * 0.3; // rooted inside the clump
        const sunward = Math.cos(a) * L[0] + Math.sin(a) * L[1] > 0.2;
        const col = sunward && random() < 0.5 ? mixRGB(lit, mid, random(0, 0.35)) : mixRGB(core, mid, random(0.1, 0.5));
        oilStroke(markToOil({ kind: 'dark', path: [[bx, by], [bx + Math.cos(la) * len * 0.5, by + Math.sin(la) * len * 0.5], [bx + Math.cos(la) * len, by + Math.sin(la) * len]], w: len * random(0.35, 0.5), col, col2: col, rel: 0 }));
      }
    }
  }
  // 4. sky holes, painted back with the paint that was behind the canopy: small,
  // irregular, inside the clumps but toward their thinner edges; some of them show a
  // branch crossing the gap (Ran's olive: the limbs seen through the foliage)
  if (SURF) {
    const T = trunkTones(s);
    const inClump = (x, y) => clumpsAll.some((o) => Math.hypot((x - o.x) / o.r, (y - o.y) / (o.r * 0.8)) < 0.8);
    for (const lf of clumpsAll) {
      if (random() > 0.3) continue;
      const a = random(TWO_PI);
      const d = random(0.4, 0.75);
      const x = lf.x + Math.cos(a) * d * lf.r;
      const y = lf.y + Math.sin(a) * d * lf.r * 0.8;
      if (!inClump(x, y)) continue;
      const col = mixRGB(SURF(x, y), mid, 0.12);
      const sz = lf.r * random(0.12, 0.26);
      // an irregular gap: two or three overlapping small blobs, not one ellipse
      const k = 2 + Math.floor(random(0, 2));
      for (let q = 0; q < k; q++) {
        const hx = x + random(-0.5, 0.5) * sz, hy = y + random(-0.5, 0.5) * sz;
        const ang = random(TWO_PI), l = sz * random(0.4, 0.8);
        oilStroke(markToOil({ kind: 'leaf', path: [[hx - Math.cos(ang) * l * 0.5, hy - Math.sin(ang) * l * 0.5], [hx, hy], [hx + Math.cos(ang) * l * 0.5, hy + Math.sin(ang) * l * 0.5]], w: l * random(0.4, 0.75), col, col2: col, rel: 0 }));
      }
      if (random() < 0.4) {
        const ba = random(-1.2, 1.2) - Math.PI / 2;
        const bl = sz * random(1.4, 2.2);
        oilStroke(markToOil({ kind: 'dark', path: [[x - Math.cos(ba) * bl * 0.5, y - Math.sin(ba) * bl * 0.5], [x, y], [x + Math.cos(ba) * bl * 0.5, y + Math.sin(ba) * bl * 0.5]], w: Math.max(0.8, sz * 0.16), col: T.dark, col2: T.crevice, rel: 0 }));
      }
    }
  }
}

// --- oil -------------------------------------------------------------------------
//
// The oil medium paints the same scene twice, the way a tonalist works: the watercolour
// pipeline above is the underpainting (values, colours, every object in place); the oil
// engine reads it back and repaints the surface in opaque, bristle-streaked strokes.
// p5.brush paints the underpainting; the oil strokes are native (see oilStroke for why).
//
// Directional rhythm — stroke direction is read from the scene, never random:
//   sky        a vortex: every stroke runs along a (slightly flattened) circle centred
//              exactly on the sun, lengthening outward, so the eye is wound inward
//   mountains  near ranges in short, straight, square-ended facets in three directions
//              (fall line, a crossing facet, the crest) — craggy geology; far ranges in
//              soft level strokes, melted into the sky wet-on-wet
//   field      long, sweeping, nearly level strokes — the stable base under the sky
//   river      short level strokes; glints of loaded paint under the sun
//   bank/tree  grass rising from the lip; strokes along each limb; foliage in dabs
//
// Textural hierarchy — every stroke carries a relief value, rendered as the ridge of
// paint catching a fixed room light from the upper left (a shadow on the far side, a
// specular edge on the near side). Relief is greatest in the sun's core, steps down
// through its halo, is high on the foreground tree and grasses, and low elsewhere.
//
// Edges — far ridges are lost (a wet-on-wet blend band); the foreground tree is found:
// redrawn last as a razor-hard silhouette that sits on top of everything.
//
// Broken colour and scumbling — sparse micro-strokes of violet, ochre and dull orange
// laid unblended into the field and mountains; dry-brush scumbles (bristles only, lighter
// paint, broken) dragged over the plain, distant foliage and the halo.
//
// Values — the sun's core goes to near-white and its halo steps down in discrete tonal
// rings; the silhouette is pushed toward black so the meadow reads luminous against it.

const bankAt = (rp, x) => rp.bank[Math.max(0, Math.min(rp.bank.length - 1, Math.round((x + 20) / 6)))][1];

// The oil engine's settings, frozen from the panel when a painting starts (oilParams),
// so a slider moved mid-painting can't change strokes already queued.
let OP = null;

function oilParams() {
  const P = (k) => G.param(k);
  const la = (P('lightAngle') * Math.PI) / 180;
  return {
    w: P('strokeSize'), // coarse stroke width, REF units
    l: P('strokeLength'), // stroke length ÷ width
    coverage: P('coverage'),
    layers: P('layers'),
    edge: P('edgeThreshold'),
    bend: P('bend'),
    jitterA: P('angleJitter'),
    jitterC: P('colourJitter'),
    body: P('bodyOpacity'),
    bristles: P('bristles'),
    bristleA: P('bristleOpacity'),
    dry: P('dryBrush'),
    wet: P('wetBlend'),
    vortex: P('vortex'),
    stretch: P('vortexStretch'),
    sweep: P('fieldSweep'),
    facet: P('facetSize'),
    facetMix: P('facetMix'),
    light: [Math.cos(la), Math.sin(la)], // the light in the room the canvas hangs in
    sunImpasto: P('sunImpasto'),
    rings: P('haloRings'),
    silhouette: P('silhouette'),
    broken: P('brokenColour'),
    accent: P('accentStrength'),
    scumble: P('scumble'),
    lost: P('lostEdges'),
    blockIn: P('blockIn'),
    economy: P('economy'),
    fol: P('fatOverLean'),
    pickup: P('wetPickup'),
    knife: P('knife'),
    sgraffito: P('sgraffito'),
    glaze: P('glaze'),
  };
}
const ACCENTS = {
  violet: [118, 92, 150],
  ochre: [196, 156, 74],
  orange: [196, 120, 70],
  olive: [120, 128, 64],
};

// Read the finished underpainting back into memory and queue the oil passes.
function oilBegin(s) {
  OP = oilParams();
  // The paint seed: the same scene, a different hand. 0 derives it from the scene seed.
  const ps = G.param('paintSeed');
  randomSeed(ps > 0 ? ps : (G.seed ^ 0x5bd1e995) >>> 0);
  const d = pixelDensity();
  const W = Math.round(width * d);
  const H = Math.round(height * d);
  // The underpainting is read once per scene and kept: changing only stroke settings
  // repaints over the cached copy instead of re-running the whole watercolour pipeline.
  if (!UNDER || UNDER.key !== sceneKey()) {
    loadPixels();
    UNDER = { key: sceneKey(), W, H, px: new Uint8ClampedArray(pixels) };
  }
  const px = UNDER.px;
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  // 3×3 box sample at a REF point, so one stray pencil grain doesn't set a stroke's colour.
  const under = (x, y) => {
    // Strokes reach past the picture edge; their colour must still come from inside it.
    x = Math.max(4, Math.min(REF_W - 4, x));
    y = Math.max(4, Math.min(REF_H - 4, y));
    const cx = Math.round(X(x) * d);
    const cy = Math.round(Y(y) * d);
    let r = 0, g = 0, b = 0, n = 0;
    const st = Math.max(1, Math.round(d));
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const xx = Math.min(W - 1, Math.max(0, cx + i * st));
        const yy = Math.min(H - 1, Math.max(0, cy + j * st));
        const k = (yy * W + xx) * 4;
        r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  };
  // the block-in brush: a big brush averages what it covers, so masses come out simple
  const underWide = (x, y, r) => {
    let R0 = 0, G0 = 0, B0 = 0;
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const c = under(x + (i * r) / 2, y + (j * r) / 2);
        R0 += c[0]; G0 += c[1]; B0 += c[2];
      }
    }
    return [R0 / 25, G0 / 25, B0 / 25];
  };
  const O = { under, underWide, lum, field: buildOilField(s) };
  WET = null;
  if (PROFILE) window.OIL = O; // inspection hook for ?profile runs

  const groups = [
    [], // the block-in (lean)
    [], // the later body layers (fatter; they pick up the wet block-in)
    [], // lost edges, broken colour, scumbles
    [], // objects
    [], // the sun and its halo
  ];
  oilLayer(s, O, groups[0], 1.0, 1.2 * OP.coverage, false, 0);
  if (OP.layers >= 2) oilLayer(s, O, groups[1], 0.55, 0.8 * OP.coverage, false, 1);
  if (OP.layers >= 3) oilLayer(s, O, groups[1], 0.24, 1.0 * OP.coverage, true, 2);
  oilLostEdges(s, O, groups[2]);
  oilBrokenColour(s, O, groups[2]);
  oilScumble(s, O, groups[2]);
  oilObjects(s, O, groups[3]);
  oilSun(s, O, groups[4]);

  const queue = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.length; i += 70) {
      const chunk = g.slice(i, i + 70);
      queue.push(() => chunk.forEach(oilStroke));
    }
    if (gi === 0) {
      // the block-in is down and wet: what the next strokes will drag through
      queue.push(() => YIELD);
      queue.push(() => {
        WET = surfaceSampler();
      });
    }
  });
  // the grass on the bank: turf, then clumps back to front, painted blade by blade
  const blades = oilGrass(s, O);
  // generated after the grass, so their counts don't reshuffle it
  const knives = oilKnife(s, O);
  const scratches = oilSgraffito(s, O);
  for (let i = 0; i < knives.length; i += 60) {
    const chunk = knives.slice(i, i + 60);
    queue.push(() => chunk.forEach(oilKnifeMark));
  }
  for (let i = 0; i < blades.length; i += 220) {
    const chunk = blades.slice(i, i + 220);
    queue.push(() => {
      noStroke();
      chunk.forEach(oilBlade);
    });
  }
  // sgraffito: scratched into the wet grass and bank with the brush handle, back to the ground
  queue.push(() => oilScratches(scratches));
  // The found edge: the foreground tree, hard, on top of everything.
  // the trees, built on the trunk model and painted in oil: midground trunks two-tone,
  // then the front tree limb by limb; then its canopy and the midground canopies in
  // p5.brush (watercolour mass + ink hatching)
  queue.push(() => YIELD);
  queue.push(() => captureSurface());
  const mid = midTrunkMarks(s);
  for (let i = 0; i < mid.length; i += 80) {
    const chunk = mid.slice(i, i + 80);
    queue.push(() => chunk.forEach((m) => oilStroke(markToOil(m))));
  }
  // the front tree limb by limb, thick → thin, then its canopy: each branch, extended back
  // into its parent, is painted over the parent's end, so the fork has no seam
  const segs = s.repoussoir.segs.slice().sort((a, b) => b.pts[0][2] - a.pts[0][2]);
  for (const seg of segs) if (seg.pts[0][2] >= 2.5) queue.push(() => oilLimbPainterly(s, seg));
  // twigs last, so the cut-ins of the limbs they grow from never clip their bases
  queue.push(() => {
    const T = trunkTones(s);
    for (const seg of segs) {
      if (seg.pts[0][2] >= 2.5) continue;
      oilStroke(markToOil({ kind: 'dark', path: smoothLimb(jointed(seg, s.repoussoir.segs)).map((p) => [p[0], p[1]]), w: Math.max(0.8, seg.pts[0][2] * 0.9), col: T.dark, col2: T.crevice, rel: 0 }));
    }
  });
  queue.push(() => oilCanopy(s));
  // the last, transparent layer over the dry painting
  queue.push(() => oilGlazes(s));
  tasks.splice(taskIdx, 0, ...queue);
}

// The direction/scale field, from scene geometry. Returns {a, k, kind, ...} — stroke
// angle, size multiplier and what is being painted — for a REF point.
function buildOilField(s) {
  const rp = s.repoussoir;
  const limbSegs = [];
  for (const seg of rp.segs) {
    for (let i = 1; i < seg.pts.length; i++) {
      const a = seg.pts[i - 1];
      const b = seg.pts[i];
      limbSegs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], w: Math.max(a[2], b[2]) });
    }
  }
  const ridgeAt = (L, x) => {
    const i = Math.max(0, Math.min(L.ridge.length - 1, Math.round((x + 30) / 4)));
    return L.ridge[i][1];
  };
  const yGround = s.gy(s.zGround);
  return (x, y) => {
    // the framing tree
    for (const g of limbSegs) {
      const vx = g.bx - g.ax, vy = g.by - g.ay;
      const t = clamp01(((x - g.ax) * vx + (y - g.ay) * vy) / (vx * vx + vy * vy || 1));
      const dx = x - (g.ax + vx * t), dy = y - (g.ay + vy * t);
      if (dx * dx + dy * dy < Math.pow(Math.max(2.5, g.w * 0.55), 2)) {
        return { a: Math.atan2(vy, vx), k: Math.max(0.18, Math.min(0.9, g.w / 30)), kind: 'limb' };
      }
    }
    for (const lf of rp.leaves) {
      if (Math.hypot((x - lf.x) / lf.r, (y - lf.y) / (lf.r * 0.78)) < 1.05) {
        return { a: noise(x * 0.05, y * 0.05) * TWO_PI, k: 0.32, kind: 'leaf' };
      }
    }
    // the bank and its grass
    const by = bankAt(rp, x);
    if (y > by - 3) {
      if (y < by + 45) return { a: -Math.PI / 2 + (noise(x * 0.02) - 0.5) * 0.9, k: 0.45, kind: 'grass' };
      const slope = (bankAt(rp, x + 12) - bankAt(rp, x - 12)) / 24;
      // the bank in shadow is grown ground: short upward strokes leaning with the grass,
      // not long strokes along the slope (whose ridge highlights read as grey streaks)
      const lean = Math.atan(slope) * 0.4;
      return { a: -Math.PI / 2 + lean + (noise(x * 0.03, y * 0.03, 5) - 0.5) * 0.9, k: 0.6, kind: 'bank' };
    }
    // the ground plane: long sweeping level strokes, receding
    if (y > yGround) {
      const z = s.F / Math.max(0.5, y - s.HY);
      const wx = ((x - s.CX) * z) / s.F;
      const k = Math.max(0.13, Math.min(1.1, 1.2 / Math.sqrt(z)));
      const rc = s.river.center(Math.min(z, s.river.zN));
      if (Math.abs(wx - rc) < s.river.halfW(z)) return { a: (noise(x * 0.03, y * 0.1) - 0.5) * 0.1, k: k * 0.7, kind: 'water' };
      return { a: (noise(x * 0.003, y * 0.02) - 0.5) * 0.12, k, kind: 'ground', z };
    }
    // mountain ranges, nearest first
    for (let i = s.ranges.length - 1; i >= 0; i--) {
      const L = s.ranges[i];
      const ry = ridgeAt(L, x);
      if (y >= ry) {
        const slope = (ridgeAt(L, x + 10) - ridgeAt(L, x - 10)) / 20;
        if (L.air > 0.55) {
          // far: soft, level, small — it should melt, not be carved
          return { a: (noise(x * 0.01, y * 0.01) - 0.5) * 0.25, k: 0.32 + 0.3 * (1 - L.air), kind: 'far' };
        }
        const k = (0.22 + 0.4 * (1 - L.air)) * OP.facet; // small facets: crags, not boulders
        const dir = slope >= 0 ? 1 : -1;
        const fall = Math.atan2(Math.abs(slope) * 1.15 + 0.25, dir);
        const crest = Math.atan(slope);
        // craggy facets: the fall line, a crossing facet, or the crest — chosen per stroke
        const pick = noise(x * 0.09, y * 0.09, i * 3.3);
        const a = pick < OP.facetMix ? fall : pick < OP.facetMix + (1 - OP.facetMix) * 0.56 ? Math.PI - fall + 0.25 * dir : crest;
        return { a, k, kind: 'range' };
      }
    }
    // sky: the vortex around the sun
    const ra = OP.stretch; // horizontal stretch of the vortex
    const dx = (x - s.sunX) / ra, dy = y - s.sunY;
    const r = Math.hypot(dx, dy);
    const th = Math.atan2(dy, dx);
    // tangent of the vortex, blended toward level by (1 − vortex); strokes are undirected,
    // so the level vector takes the tangent's own left/right sense
    let tx = -ra * Math.sin(th), ty = Math.cos(th);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const lx = tx >= 0 ? 1 : -1;
    const a = Math.atan2(ty * OP.vortex, tx * OP.vortex + lx * (1 - OP.vortex));
    const kSky = 0.42 + 0.85 * clamp01(r / 650);
    for (const c of s.clouds) {
      if (Math.abs(x - c.cx) < c.w * 0.5 && y > c.cy - c.h * 1.2 && y < c.cy + c.h * 0.4) {
        return { a, k: Math.max(0.35, Math.min(kSky, c.w / 500)), kind: 'cloud', r };
      }
    }
    return { a, k: kSky, kind: 'sky', r };
  };
}

// Relief (impasto height, 0..1) by what is being painted.
function oilRelief(f) {
  switch (f.kind) {
    case 'sky': return f.r < 320 ? 0.15 + 0.55 * (1 - f.r / 320) : 0.12;
    case 'cloud': return 0.2;
    case 'range': return 0.22;
    case 'far': return 0;
    case 'ground': return 0.14;
    case 'water': return 0.1;
    case 'grass': return 0.55;
    case 'bank': return 0.03; // matte: a shadowed bank catches no room light on its ridges
    case 'limb': case 'leaf': return 0.5;
    default: return 0.1;
  }
}

// One layer of strokes. Seeds sit on a jittered grid; each seed emits as many strokes as
// its local stroke size needs to cover the area (density ∝ 1/size²), so receding ground
// gets proportionally more, smaller strokes. With `edges`, strokes are only placed where
// the underpainting has an edge, and laid along it — except on the far ranges, whose
// edges are meant to be lost.
function oilLayer(s, O, out, scale, cover, edges, layer) {
  // fat over lean: the block-in is thin paint (flatter, a little transparent, so the
  // underpainting glows through); each later layer is fuller-bodied and stands higher
  const leanRel = [1 - 0.6 * OP.fol, 1 - 0.25 * OP.fol, 1][layer];
  const leanBody = layer === 0 ? 1 - 0.1 * OP.fol : 1;
  const blockR = OP.w * 1.4;
  const sample = layer === 0 && OP.blockIn > 0 ? (x, y) => mixRGB(O.under(x, y), O.underWide(x, y, blockR), OP.blockIn) : null;
  const w0 = OP.w * scale;
  const g = w0 * 0.8;
  for (let gy = -g; gy < REF_H + g; gy += g) {
    for (let gx = -g; gx < REF_W + g; gx += g) {
      const x = gx + random(-0.5, 0.5) * g;
      const y = gy + random(-0.5, 0.5) * g;
      const f = O.field(x, y);
      let a = f.a;
      if (edges) {
        if (f.kind === 'far' || f.kind === 'sky') continue;
        const h = 4;
        const gxv = O.lum(O.under(x + h, y)) - O.lum(O.under(x - h, y));
        const gyv = O.lum(O.under(x, y + h)) - O.lum(O.under(x, y - h));
        if (Math.hypot(gxv, gyv) < OP.edge) continue; // no edge here: leave the coarser passes
        a = Math.atan2(gyv, gxv) + Math.PI / 2; // along the edge
      }
      if (layer === 1 && OP.economy > 0 && f.kind !== 'limb' && f.kind !== 'leaf' && f.kind !== 'grass') {
        // economy: the second layer goes only where something is happening — an edge or
        // a value change in the underpainting, or the sun. Elsewhere the block-in stands.
        const h = 5;
        const gxv = O.lum(O.under(x + h, y)) - O.lum(O.under(x - h, y));
        const gyv = O.lum(O.under(x, y + h)) - O.lum(O.under(x, y - h));
        const busy = clamp01(Math.hypot(gxv, gyv) / 14);
        const focal = Math.exp(-Math.pow(Math.hypot(x - s.sunX, y - s.sunY) / 260, 2));
        if (random() < OP.economy * (1 - busy) * (1 - focal)) continue;
      }
      const w = w0 * f.k;
      const ratio = f.kind === 'ground' ? OP.l * OP.sweep : f.kind === 'leaf' || f.kind === 'bank' ? OP.l * 0.5 : f.kind === 'range' ? OP.l * 0.75 : f.kind === 'water' ? OP.l * 1.3 : OP.l;
      const len = w * ratio;
      const p = (cover * g * g) / (w * len);
      const n = Math.floor(p) + (random() < p - Math.floor(p) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const sx = x + (i ? random(-0.5, 0.5) * g : 0);
        const sy = y + (i ? random(-0.5, 0.5) * g : 0);
        const jitterA = random(-1, 1) * OP.jitterA * (f.kind === 'range' ? 0.6 : 1);
        out.push(makeOilStroke(O, sx, sy, a + jitterA, len * random(0.75, 1.2), w * random(0.85, 1.1), {
          relief: oilRelief(f) * leanRel,
          lean: leanBody,
          sample,
          pickup: layer > 0,
          angular: f.kind === 'range',
          soft: f.kind === 'far',
          // on the dark bank the bristles carry the stroke's own colour, so no pale
          // underpainting from further along is dragged across it
          color2: f.kind === 'bank' ? shadeRGB(O.under(sx, sy), random(0.85, 1.05)) : undefined,
        }));
      }
    }
  }
}

// A stroke: body colour from the underpainting at its middle, a second colour from its
// far end for the bristle streaks (wet-into-wet), both with a little broken-colour jitter.
function makeOilStroke(O, x, y, a, len, w, opts) {
  opts = opts || {};
  const ca = Math.cos(a), sa = Math.sin(a);
  const x0 = x - (ca * len) / 2, y0 = y - (sa * len) / 2;
  const bend = opts.angular ? 0 : random(-1, 1) * OP.bend * len;
  const P = [];
  const pr = opts.angular ? [1, 1, 1, 0.95] : [0.85, 1.1, 1.0, 0.7];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3;
    const bo = bend * Math.sin(Math.PI * t);
    P.push([x0 + ca * len * t - sa * bo, y0 + sa * len * t + ca * bo, pr[k]]);
  }
  const jitter = (c, amt) => {
    const v = 1 + random(-amt, amt);
    return [c[0] * v * (1 + random(-0.03, 0.03)), c[1] * v * (1 + random(-0.03, 0.03)), c[2] * v * (1 + random(-0.03, 0.03))];
  };
  const samp = opts.sample || O.under;
  const body = opts.color || jitter(samp(x, y), OP.jitterC);
  const far = opts.color2 || jitter(samp(x + ca * len * 0.5, y + sa * len * 0.5), OP.jitterC * 1.8);
  return {
    P, w, body, far,
    relief: (opts.relief || 0) * G.param('impasto'),
    angular: !!opts.angular,
    soft: !!opts.soft,
    scumble: !!opts.scumble,
    crisp: !!opts.crisp,
    lean: opts.lean || 1,
    pickup: !!opts.pickup,
  };
}

// An oil stroke, drawn natively with ordinary "over" blending: oil body paint is opaque,
// whereas p5.brush mixes spectrally (Kubelka–Munk), the right optics for watercolour
// glazes but one that darkens with every overlap. The stroke is a tapered body along a
// cubic path, then a comb of bristle streaks, each its own mix of the two loaded colours,
// starting late, breaking where the brush runs dry, and lifting early. Relief adds the
// ridge of paint under the room light: a shadow strip on the far side and a specular edge
// on the near side. A scumble is bristles only — dry paint dragged over what is there.
function oilStroke(st) {
  const [p0, p1, p2, p3] = st.P;
  if (st.pickup && WET && OP && OP.pickup > 0) {
    // wet into wet: the brush lands in wet paint and drags it along — the bristles carry
    // the colour already on the canvas where the stroke starts, the body a trace of it
    const w0 = WET(p0[0], p0[1]);
    st.far = mixRGB(st.far, w0, OP.pickup);
    st.body = mixRGB(st.body, w0, OP.pickup * 0.15);
  }
  const N = 9;
  const C = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const seg = Math.min(2, Math.floor(t * 3));
    const pr = st.P[seg][2] + (st.P[seg + 1][2] - st.P[seg][2]) * (t * 3 - seg);
    // angular strokes end square (a flat brush laid and lifted); others taper
    const taper = st.angular ? (t < 0.04 || t > 0.96 ? 0.85 : 1) : Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.4);
    C.push([x, y, st.w * 0.5 * pr * taper]);
  }
  const normals = C.map((_, i) => {
    const a = C[Math.max(0, i - 1)];
    const b = C[Math.min(N - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    return [-ty / d, tx / d];
  });
  const strip = (dx, dy, col, alpha, wk) => {
    fill(col[0], col[1], col[2], alpha);
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i < N; i++) {
      const [x, y, hw] = C[i];
      const [nx, ny] = normals[i];
      vertex(X(x + dx + nx * hw * wk), Y(y + dy + ny * hw * wk));
      vertex(X(x + dx - nx * hw * wk), Y(y + dy - ny * hw * wk));
    }
    endShape();
  };
  noStroke();
  const rel = st.relief;
  if (rel > 0.02 && !st.scumble) {
    // the ridge's shadow, cast away from the room light
    const off = st.w * 0.16 * rel;
    strip(-OP.light[0] * off, -OP.light[1] * off, shadeRGB(st.body, 0.5), 60 + 120 * Math.min(1, rel), 1);
  }
  if (!st.scumble) strip(0, 0, st.body, st.crisp ? 255 : 255 * OP.body * (st.soft ? 0.85 : 1) * (st.lean || 1), 1);

  // bristles
  const wpx = st.w * U;
  const nb = Math.max(2, Math.min(OP.bristles, Math.round(wpx / 1.6)));
  const dry = st.scumble ? Math.min(0.9, OP.dry + 0.25) : OP.dry;
  const aLo = (st.scumble ? 70 : st.soft ? 40 : 120) * OP.bristleA;
  const aHi = Math.min(255, (st.scumble ? 160 : st.soft ? 90 : 215) * OP.bristleA);
  strokeWeight(Math.max(0.5, (wpx / nb) * (st.scumble ? 0.55 : 0.7)));
  beginShape(LINES);
  for (let b = 0; b < nb; b++) {
    const off = -0.42 + (0.84 * b) / Math.max(1, nb - 1);
    const m = random(0.15, 1) * OP.wet;
    const v = 1 + random(-0.1, 0.1);
    const col = mixRGB(st.body, st.far, m);
    stroke(col[0] * v, col[1] * v, col[2] * v, random(aLo, aHi));
    const t0 = random(0, 0.3);
    const t1 = random(0.6, 1);
    const ph = random(100);
    for (let i = 0; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < t0 || t > t1 || noise(ph + i * 0.7) < dry) continue; // dry-brush breaks
      const a = C[i], c = C[i + 1];
      const na = normals[i], nc = normals[i + 1];
      vertex(X(a[0] + na[0] * a[2] * off * 2), Y(a[1] + na[1] * a[2] * off * 2));
      vertex(X(c[0] + nc[0] * c[2] * off * 2), Y(c[1] + nc[1] * c[2] * off * 2));
    }
  }
  // specular: the lit flank of the ridge, on whichever side faces the room light
  // (no specular on strokes under 4 px: a ridge that small can't catch a visible light,
  // and a 1 px highlight on a 3 px dab reads as a white dot)
  if (rel > 0.05 && !st.scumble && wpx >= 4) {
    const spec = mixRGB(st.body, [255, 252, 244], 0.35 + 0.35 * Math.min(1, rel));
    stroke(spec[0], spec[1], spec[2], 90 + 150 * Math.min(1, rel));
    strokeWeight(Math.max(0.5, wpx * 0.09));
    for (let i = 1; i < N - 2; i++) {
      const facing = normals[i][0] * OP.light[0] + normals[i][1] * OP.light[1] > 0 ? 1 : -1;
      const a = C[i], c = C[i + 1];
      const na = normals[i], nc = normals[i + 1];
      vertex(X(a[0] + na[0] * a[2] * 0.72 * facing), Y(a[1] + na[1] * a[2] * 0.72 * facing));
      vertex(X(c[0] + nc[0] * c[2] * 0.72 * facing), Y(c[1] + nc[1] * c[2] * 0.72 * facing));
    }
  }
  endShape();
  noStroke();
}

// Lost edges: far ridges melted into the sky, wet-on-wet — soft strokes straddling the
// crest, each loaded with the sky above and the mountain below.
function oilLostEdges(s, O, out) {
  for (const L of s.ranges) {
    if (L.air <= 0.55) continue;
    if (OP.lost <= 0.01) return;
    const step = Math.max(1, Math.round(3 / OP.lost));
    for (let q = 2; q < L.ridge.length - 2; q += step) {
      const [x, y] = L.ridge[q];
      const slope = (L.ridge[q + 2][1] - L.ridge[q - 2][1]) / 16;
      const above = O.under(x, y - 10);
      const below = O.under(x, y + 10);
      // lost and found: the focal summit keeps a found edge. Near it the crest is restated
      // with crisp strokes in the mountain's own colour, laid along the ridge on its sky
      // side; everywhere else it melts into the sky.
      const summit = Math.exp(-Math.pow((x - s.focalX) / 110, 2)) * (y < s.peakTop + 120 ? 1 : 0);
      if (summit > 0.35) {
        const fw = random(2.5, 4.5);
        out.push(makeOilStroke(O, x, y + fw * 0.35, Math.atan(slope) + random(-0.05, 0.05), fw * random(3, 5), fw, {
          color: shadeRGB(below, random(0.96, 1.02)),
          color2: mixRGB(below, above, 0.15),
          angular: true,
        }));
        continue;
      }
      const w = random(7, 12) * (0.7 + 0.6 * L.air);
      out.push(makeOilStroke(O, x, y + random(-3, 3), Math.atan(slope) + random(-0.15, 0.15), w * random(2.5, 4), w, {
        color: mixRGB(above, below, random(0.35, 0.65)),
        color2: mixRGB(above, below, random(0.2, 0.8)),
        soft: true,
      }));
    }
  }
}

// Broken colour: sparse micro-strokes of unblended accent hues laid into the field and
// the mountains — violet in the shadows, ochre and dull orange in the lights, olive in
// between — each only half-mixed with what is beneath, so it vibrates rather than shouts.
function oilBrokenColour(s, O, out) {
  for (let i = 0; i < OP.broken; i++) {
    const x = random(0, REF_W);
    const y = random(s.HY - 260, REF_H);
    const f = O.field(x, y);
    if (f.kind !== 'ground' && f.kind !== 'range') continue; // the bank's colour goes into its turf
    const base = O.under(x, y);
    const l = O.lum(base);
    const acc = l < 70 ? ACCENTS.violet : l < 110 ? (random() < 0.5 ? ACCENTS.violet : ACCENTS.olive) : random() < 0.55 ? ACCENTS.ochre : ACCENTS.orange;
    const col = mixRGB(base, acc, clamp01(OP.accent + random(-0.1, 0.1)));
    const w = OP.w * 0.17 * f.k * random(0.8, 1.3);
    const ratio = f.kind === 'ground' ? 3.2 : 2.2;
    out.push(makeOilStroke(O, x, y, f.a + random(-0.12, 0.12), w * ratio, w, { color: col, color2: mixRGB(col, base, 0.3), relief: 0.12, angular: f.kind === 'range' }));
  }
}

// Scumbling: dry, opaque, lighter paint dragged over the plain, distant foliage and the
// sun's halo — bristles only, broken often, leaving the darker layer showing through.
function oilScumble(s, O, out) {
  const C = s.C;
  for (let i = 0; i < OP.scumble; i++) {
    const x = random(0, REF_W);
    const y = random(0, REF_H);
    const f = O.field(x, y);
    let lift = 0;
    if (f.kind === 'ground') lift = 0.14 + 0.1 * clamp01((f.z - 2) / 8); // more scumble toward the distance
    else if ((f.kind === 'sky' || f.kind === 'cloud') && f.r < 360) lift = 0.22 * (1 - f.r / 360);
    else continue;
    if (random() > (f.kind === 'ground' ? 0.8 : 0.9)) continue;
    const base = O.under(x, y);
    const col = mixRGB(shadeRGB(base, 1.1), C.glow, lift);
    const w = OP.w * 0.45 * f.k * random(0.8, 1.3);
    out.push(makeOilStroke(O, x, y, f.a + random(-0.08, 0.08), w * OP.l * 1.6, w, { color: col, color2: mixRGB(col, C.glow, 0.25), scumble: true }));
  }
}

// Objects restated over the field: midground trees as dabs (dark mass, then lit dabs),
// and glints on the water (grass and the framing tree are painted on their own, later).
function oilObjects(s, O, out) {
  const C = s.C;
  const rp = s.repoussoir;

  // midground trees, far → near (Ran Art Blog's guide, at a distance — see oilMidTree)
  for (const tr of s.trees) oilMidTree(s, O, tr, out);

  // glints on the water: loaded paint, brightest under the sun
  const r = s.river;
  for (let i = 0; i < 240; i++) {
    const z = Math.exp(random(Math.log(0.9), Math.log(r.zN)));
    const wx = r.center(z) + random(-0.8, 0.8) * r.halfW(z);
    const x = s.gx(wx, z);
    const y = s.gy(z);
    const near = Math.exp(-Math.pow((x - s.sunX) / 220, 2));
    if (random() > 0.18 + 0.82 * near) continue;
    if (y > bankAt(rp, x) - 4) continue; // the bank hides the near water
    const len = Math.max(3, (random(0.06, 0.2) * s.F) / z);
    // the glint is the water's own colour lifted toward the sun, not a white chip
    const col = mixRGB(O.under(x, y), mixRGB(C.glow, C.sun, near), 0.35 + 0.4 * near);
    out.push(makeOilStroke(O, x, y, random(-0.06, 0.06), len * 0.8, Math.max(0.8, Math.min(2.8, 4.5 / Math.sqrt(z))), { color: col, color2: mixRGB(col, O.under(x, y), 0.4), relief: 0.12 + 0.25 * near }));
  }
}

// Grass, as a painter builds it rather than as a row of stalks:
//  1. turf — the bank is covered in short upright flicks, densest at the lip and thinning
//     toward the viewer, each a few percent off the local value and temperature, so the
//     bank reads as a grown surface, not a flat dark with dots on it;
//  2. clumps — tufts at irregular intervals with bare gaps between them (noise decides
//     where grass grows), rooted at different depths below the lip, so they overlap in
//     depth instead of standing on one line. Each tuft is a dark base mass first, then
//     blades fanned from one root: tapered from base to point, curving progressively
//     with the wind, of log-normal length (a few long, most short);
//  3. contre-jour — almost every blade is a dark silhouette against the bright field; a
//     few toward the sun are lit through (translucent yellow-green), and sunward edges
//     carry a thin warm rim;
//  4. seed heads on a minority of stems only, as small grains along a nodding tip —
//     never a cap on every stalk.
// Returns blade records for oilBlade(): {P: spine [[x,y]..], w0, col, a, rim, rimCol}.
function oilGrass(s, O) {
  const C = s.C;
  const rp = s.repoussoir;
  const dens = G.param('grass');
  const out = [];
  if (dens <= 0) return out;
  const dark = mixRGB(C.silhouette, [0, 0, 0], OP.silhouette * 0.5);
  const cool = mixRGB(dark, C.shadow, 0.35);
  const warmDark = mixRGB(dark, ACCENTS.olive, 0.22);
  const lit = mixRGB(mixRGB(C.foliageLit, C.glow, 0.35), C.light, 0.2 * s.warmth);
  const straw = mixRGB(ACCENTS.ochre, C.light, 0.3);
  const rimCol = mixRGB(C.light, C.glow, 0.45);
  const wind = (x, y) => -Math.PI / 2 + 0.38 * (noise(x * 0.004, y * 0.004, 9) - 0.5) * 2 - 0.12 * s.sunSide;
  const sunward = (x) => clamp01(1 - Math.abs(x - s.sunX) / (REF_W * 0.75));
  // a blade's spine: the angle turns steadily from root to tip (curl), so the blade arcs
  const spine = (x, y, a, len, curl) => {
    const P = [[x, y]];
    const n = len * U > 30 ? 8 : 5;
    let px = x, py = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const th = a + curl * t * t;
      px += (Math.cos(th) * len) / n;
      py += (Math.sin(th) * len) / n;
      P.push([px, py]);
    }
    return P;
  };
  const vary = (c, amt) => {
    const v = 1 + random(-amt, amt);
    return [c[0] * v, c[1] * v * (1 + random(-0.04, 0.04)), c[2] * v * (1 + random(-0.06, 0.06))];
  };
  const left = rp.bank[0][0];
  const right = rp.bank[rp.bank.length - 1][0];

  // 1. turf
  const nTurf = Math.round(3600 * dens);
  for (let i = 0; i < nTurf; i++) {
    const x = random(left, right);
    const lip = bankAt(rp, x);
    const depth = -Math.log(1 - random() * 0.985) * 70; // exponential: crowded at the lip
    const y = lip + 2 + depth;
    if (y > REF_H + 10) continue;
    const near = 1 + depth / 90; // lower on the bank = nearer = bigger
    const base = O.under(x, Math.min(REF_H - 4, y + 4));
    const t = random();
    const tint = t < 0.4 ? cool : t < 0.75 ? warmDark : dark;
    const col = vary(mixRGB(base, tint, random(0.3, 0.7)), 0.12);
    const len = random(4, 13) * near;
    out.push({ P: spine(x, y, wind(x, y) + random(-0.45, 0.45), len, random(-0.5, 0.5)), w0: random(0.9, 1.8) * near, col, a: random(170, 235) });
    // a few turf tips at the lip catch the low sun
    if (depth < 12 && random() < 0.08 + 0.18 * sunward(x)) {
      out.push({ P: spine(x + 0.6, y - len * 0.45, wind(x, y), len * 0.45, 0.2 * s.sunSide), w0: 0.7, col: vary(mixRGB(base, lit, 0.3), 0.08), a: 140 });
    }
  }

  // 2–4. clumps: walk the lip with irregular steps; noise decides tuft vs bare ground
  const clumps = [];
  for (let x = left + random(0, 10); x < right; x += random(5, 22) / Math.max(0.35, dens)) {
    const grow = noise(x * 0.011, 3.3);
    if (grow < 0.36) continue; // bare stretch of lip
    // most tufts root just under the lip; some lower and nearer, which stand taller
    const depth = random() < 0.78 ? random(1, 9) : random(10, 55);
    clumps.push({ x: x + random(-3, 3), y: bankAt(rp, x) + depth, depth, grow });
  }
  clumps.sort((a, b) => a.y - b.y); // back to front
  for (const c of clumps) {
    const near = 1 + c.depth / 70;
    const H = Math.exp(random(Math.log(14), Math.log(46))) * (0.45 + 1.25 * (c.grow - 0.36)) * near;
    const lean = wind(c.x, c.y);
    const n = Math.max(3, Math.round(random(4, 13) * (0.6 + c.grow)));
    const base = O.under(c.x, Math.min(REF_H - 4, c.y + 6));
    const tint = random() < 0.5 ? cool : warmDark;
    const body = mixRGB(mixRGB(base, tint, 0.5), dark, 0.45);
    const sw = sunward(c.x);
    // base mass: short wide strokes, so the root is a mass and not a bundle of lines
    for (let k = 0; k < 3; k++) {
      out.push({ P: spine(c.x + random(-2, 2) * near, c.y + 2, lean + random(-0.6, 0.6), H * random(0.18, 0.3), random(-0.3, 0.3)), w0: random(3.5, 6) * near, col: vary(body, 0.06), a: 235 });
    }
    const seeding = random() < 0.3;
    let heads = seeding ? 1 + Math.floor(random(0, 3)) : 0;
    for (let i = 0; i < n; i++) {
      const fan = (i / Math.max(1, n - 1) - 0.5) * random(0.7, 1.3);
      const a = lean + fan + random(-0.12, 0.12);
      const centre = 1 - Math.abs(fan) * 0.8; // the middle blades stand tallest
      const len = H * centre * Math.exp(random(-0.55, 0.15));
      // blades bend over toward the side they lean to, and more the longer they are
      const curl = (a + Math.PI / 2) * random(0.6, 1.6) + random(-0.12, 0.12);
      const P = spine(c.x + random(-1.5, 1.5) * near, c.y + random(0, 2), a, len, curl);
      const throughLit = random() < 0.08 + 0.22 * sw; // the sun shining through a blade
      const col = throughLit ? vary(mixRGB(lit, body, random(0.15, 0.45)), 0.08) : vary(body, 0.1);
      const rim = !throughLit && random() < 0.15 + 0.45 * sw;
      out.push({ P, w0: random(1.3, 2.8) * near, col, a: 245, rim, rimCol, side: s.sunSide });
      // a seed head: a thin stem past the leaves and grains along its nodding tip
      if (heads > 0 && centre > 0.5 && random() < 0.5) {
        heads--;
        const sl = len * random(1.1, 1.5);
        const sp = spine(c.x, c.y, a * 0.9 + lean * 0.1, sl, curl * 1.4 + 0.25 * Math.sign(curl || 1));
        out.push({ P: sp, w0: 0.75 * near, col: vary(mixRGB(body, straw, 0.25), 0.06), a: 235 });
        const tip = sp[sp.length - 1];
        const prev = sp[sp.length - 2];
        const ta = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
        const g = 3 + Math.floor(random(0, 5));
        for (let k = 0; k < g; k++) {
          const t = k / g;
          const gx = tip[0] - Math.cos(ta) * sl * 0.16 * t;
          const gy = tip[1] - Math.sin(ta) * sl * 0.16 * t;
          const ga = ta + (k % 2 ? 0.6 : -0.6) + random(-0.2, 0.2);
          // grains stay close to the stem's value; only a few toward the sun catch the light
          const gcol = random() < 0.12 + 0.25 * sw ? mixRGB(mixRGB(straw, body, 0.3), rimCol, random(0, 0.25)) : mixRGB(straw, body, random(0.55, 0.8));
          out.push({ P: spine(gx, gy, ga, random(1.4, 2.6) * near, 0), w0: random(0.9, 1.4) * near, col: vary(gcol, 0.08), a: 220 });
        }
      }
    }
  }
  // a few wild single stalks break the top line of the grass
  for (let i = 0; i < Math.round(26 * dens); i++) {
    const x = random(left, right);
    const y = bankAt(rp, x) + random(2, 14);
    const a = wind(x, y) + random(-0.15, 0.15);
    const len = random(40, 85);
    out.push({ P: spine(x, y, a, len, (a + Math.PI / 2) * 1.5 + random(-0.2, 0.2)), w0: random(0.7, 1.1), col: vary(dark, 0.08), a: 230, rim: random() < 0.5, rimCol, side: s.sunSide });
  }
  return out;
}

// One blade: a filled ribbon tapering from its root width to a point, with a darker
// shadow-side half (the blade's fold) and, if lit from behind, a thin warm rim on the
// side facing the sun. Drawn natively, as the oil strokes are.
function oilBlade(b) {
  const P = b.P;
  const n = P.length;
  const nrm = P.map((_, i) => {
    const p = P[Math.max(0, i - 1)], q = P[Math.min(n - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const d = Math.hypot(dx, dy) || 1;
    return [-dy / d, dx / d];
  });
  const hw = (i) => b.w0 * 0.5 * Math.pow(1 - i / (n - 1), 0.85) + 0.12 / U;
  const ribbon = (col, alpha, lo, hi) => {
    fill(col[0], col[1], col[2], alpha);
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      const [nx, ny] = nrm[i];
      const h = hw(i);
      vertex(X(x + nx * h * lo), Y(y + ny * h * lo));
      vertex(X(x + nx * h * hi), Y(y + ny * h * hi));
    }
    endShape();
  };
  ribbon(b.col, b.a, -1, 1);
  if (b.w0 * U >= 2.2) ribbon(shadeRGB(b.col, 0.78), b.a * 0.55, -1, -0.1); // the fold
  if (b.rim) {
    // the rim on the edge facing the sun: + normal side if that points sunward
    const f = nrm[Math.floor(n / 2)][0] * b.side > 0 ? 1 : -1;
    fill(b.rimCol[0], b.rimCol[1], b.rimCol[2], 175);
    beginShape(TRIANGLE_STRIP);
    for (let i = Math.floor(n * 0.3); i < n; i++) {
      const [x, y] = P[i];
      const [nx, ny] = nrm[i];
      const h = hw(i);
      const r = Math.max(0.28 / U, h * 0.35);
      vertex(X(x + nx * h * f), Y(y + ny * h * f));
      vertex(X(x + nx * (h - r) * f), Y(y + ny * (h - r) * f));
    }
    endShape();
  }
}

// Palette-knife lights. The thickest lights are laid with a knife, not a brush: a flat
// plane of paint with straight sides, a raised lip along the side that faces the room
// light, a thin shadow under the opposite edge, and a ragged trailing end where the knife
// lifted. They go only where the underpainting is brightest (above its ~88th percentile
// of value, measured per painting so every mood gets its own top lights), and lie along
// the local stroke direction — around the sun, across the water, along the facets.
function oilKnife(s, O) {
  const out = [];
  const n = Math.round(OP.knife);
  if (n <= 0) return out;
  const pool = [];
  for (let i = 0; i < 900; i++) pool.push(O.lum(O.under(random(0, REF_W), random(0, REF_H))));
  pool.sort((a, b) => a - b);
  const Lhi = pool[Math.floor(pool.length * 0.88)];
  const Lmax = pool[pool.length - 1];
  for (let t = 0; t < n * 14 && out.length < n; t++) {
    const x = random(0, REF_W);
    const y = random(0, REF_H);
    const f = O.field(x, y);
    if (f.kind === 'far' || f.kind === 'limb' || f.kind === 'leaf' || f.kind === 'bank' || f.kind === 'grass') continue;
    const base = O.under(x, y);
    const l = O.lum(base);
    if (l < Lhi) continue;
    const bright = clamp01((l - Lhi) / Math.max(1, Lmax - Lhi));
    if (random() > 0.35 + 0.65 * bright) continue;
    const len = OP.w * f.k * random(1.1, 2.1) * (f.kind === 'water' ? 0.7 : 1);
    const wid = len * random(0.32, 0.5);
    const col = mixRGB(base, [255, 249, 236], 0.1 + 0.2 * bright);
    const tail = [];
    for (let i = 0; i <= 5; i++) tail.push(random(0, random(0.15, 0.35)));
    const drags = [0, 1, 2].map(() => [random(-0.7, 0.7), random(0.6, 1), random(0.2, 0.7), random(0.9, 1.06)]);
    out.push({ x, y, a: f.a + random(-0.15, 0.15), len, wid, col, tail, drags });
  }
  return out;
}

function oilKnifeMark(k) {
  const ca = Math.cos(k.a), sa = Math.sin(k.a);
  const ux = ca, uy = sa, vx = -sa, vy = ca;
  const hl = k.len / 2, hw = k.wid / 2;
  // outline: a straight leading edge, straight sides, a ragged trailing edge
  const P = [];
  P.push([-hl, -hw], [-hl, hw]);
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = hw - (2 * hw * i) / steps;
    P.push([hl - k.tail[i] * k.len, v]);
  }
  const at = (p, dx, dy) => [k.x + ux * p[0] + vx * p[1] + dx, k.y + uy * p[0] + vy * p[1] + dy];
  const poly = (col, alpha, dx, dy) => {
    fill(col[0], col[1], col[2], alpha);
    beginShape();
    for (const p of P) {
      const q = at(p, dx, dy);
      vertex(X(q[0]), Y(q[1]));
    }
    endShape(CLOSE);
  };
  noStroke();
  const off = k.wid * 0.12;
  poly(shadeRGB(k.col, 0.55), 70, -OP.light[0] * off, -OP.light[1] * off); // shadow under the far edge
  poly(k.col, 255, 0, 0);
  // the lip along the long side that faces the light, the drop along the other
  const facing = vx * OP.light[0] + vy * OP.light[1] > 0 ? 1 : -1;
  const lit = mixRGB(k.col, [255, 253, 246], 0.5);
  strokeWeight(Math.max(0.6, k.wid * U * 0.07));
  beginShape(LINES);
  stroke(lit[0], lit[1], lit[2], 190);
  let a0 = at([-hl, hw * 0.92 * facing], 0, 0), a1 = at([hl * 0.7, hw * 0.92 * facing], 0, 0);
  vertex(X(a0[0]), Y(a0[1]));
  vertex(X(a1[0]), Y(a1[1]));
  const dk = shadeRGB(k.col, 0.7);
  stroke(dk[0], dk[1], dk[2], 110);
  a0 = at([-hl, -hw * 0.95 * facing], 0, 0);
  a1 = at([hl * 0.75, -hw * 0.95 * facing], 0, 0);
  vertex(X(a0[0]), Y(a0[1]));
  vertex(X(a1[0]), Y(a1[1]));
  // a few faint drag lines: the knife's own scratches in the flat
  strokeWeight(Math.max(0.5, U * 0.5));
  for (const [dv, d0, d1, sh] of k.drags) {
    const v = dv * hw;
    const c = shadeRGB(k.col, sh);
    stroke(c[0], c[1], c[2], 90);
    a0 = at([-hl * d0, v], 0, 0);
    a1 = at([hl * d1, v], 0, 0);
    vertex(X(a0[0]), Y(a0[1]));
    vertex(X(a1[0]), Y(a1[1]));
  }
  endShape();
  noStroke();
}

// Sgraffito: lines scratched through the wet paint with the brush handle, back to what
// lies beneath — here a warm earth under-layer. In the grass at the bank's lip they read as
// lit stems; they arc upward, are short and sparse, and are commoner toward the sun.
function oilSgraffito(s, O) {
  const out = [];
  const rp = s.repoussoir;
  const n = Math.round(OP.sgraffito);
  for (let t = 0; t < n * 4 && out.length < n; t++) {
    const x = random(rp.bank[0][0], rp.bank[rp.bank.length - 1][0]);
    const sunward = clamp01(1 - Math.abs(x - s.sunX) / (REF_W * 0.75));
    if (random() > 0.3 + 0.7 * sunward) continue;
    const y = bankAt(rp, x) + random(-2, 26);
    const len = random(7, 24);
    const a = -Math.PI / 2 + (noise(x * 0.004, 9) - 0.5) * 0.76 - 0.12 * s.sunSide + random(-0.2, 0.2);
    const curl = random(-0.5, 0.5);
    const P = [];
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      const th = a + curl * u * u;
      const last = P.length ? P[P.length - 1] : [x, y];
      P.push(i === 0 ? [x, y] : [last[0] + (Math.cos(th) * len) / 5, last[1] + (Math.sin(th) * len) / 5]);
    }
    const col = mixRGB(IMPRIMATURA, O.under(x, y - len * 0.5), 0.3);
    out.push({ P, col: mixRGB(col, s.C.light, 0.25 * sunward), w: random(0.5, 0.9) });
  }
  return out;
}

function oilScratches(list) {
  beginShape(LINES);
  for (const sc of list) {
    stroke(sc.col[0], sc.col[1], sc.col[2], 200);
    strokeWeight(Math.max(0.6, sc.w * U));
    for (let i = 0; i < sc.P.length - 1; i++) {
      vertex(X(sc.P[i][0]), Y(sc.P[i][1]));
      vertex(X(sc.P[i + 1][0]), Y(sc.P[i + 1][1]));
    }
  }
  endShape();
  noStroke();
}

// Glazes: thin transparent colour over the dry painting, the old masters' last layer. A
// glaze filters the light coming back off the paint, so it is drawn as MULTIPLY: it can
// shift hue and deepen, never lighten. Two glazes: transparent gold radiating from the
// sun (zero at the core, so the white stays white; strongest in the halo and fading
// out across the sky and plain), and a cool transparent blue deepening the shadowed
// foreground toward the bottom edge.
function oilGlazes(s) {
  const k = OP.glaze;
  if (k <= 0) return;
  const C = s.C;
  const white = [255, 255, 255];
  const gold = mixRGB([255, 206, 140], C.glow, 0.3);
  const cool = mixRGB([176, 190, 228], C.shadow, 0.15);
  blendMode(MULTIPLY);
  noStroke();
  const rings = [0, 90, 240, 480, 820, 1300];
  const amt = [0, 0.18, 0.38, 0.28, 0.12, 0];
  const seg = 48;
  for (let r = 0; r < rings.length - 1; r++) {
    const c0 = mixRGB(white, gold, amt[r] * k);
    const c1 = mixRGB(white, gold, amt[r + 1] * k);
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * TWO_PI;
      const cx = Math.cos(th), cy = Math.sin(th);
      fill(c0[0], c0[1], c0[2]);
      vertex(X(s.sunX + cx * rings[r]), Y(s.sunY + cy * rings[r] * 0.8));
      fill(c1[0], c1[1], c1[2]);
      vertex(X(s.sunX + cx * rings[r + 1]), Y(s.sunY + cy * rings[r + 1] * 0.8));
    }
    endShape();
  }
  const rp = s.repoussoir;
  const deep = mixRGB(white, cool, 0.55 * k);
  beginShape(TRIANGLE_STRIP);
  for (const [x, y] of rp.bank) {
    fill(255, 255, 255);
    vertex(X(x), Y(y - 4));
    fill(deep[0], deep[1], deep[2]);
    vertex(X(x), Y(REF_H + 40));
  }
  endShape();
  blendMode(BLEND);
}

// A midground tree in oil, by the same guide as the framing tree, scaled to its distance:
//  - basic shape first: a round crown is 3–7 overlapping sub-clumps inside its outline; a
//    tall tree is a column narrowing to the top (the guide's pine: draw the form, fill it
//    with random marks, then more marks on the shadow side and at the bottom)
//  - each sub-clump is a sphere (circular transition), the crown darker toward its bottom
//    (linear transition); light from the sun's side and from above
//  - dark values first, then light; light marks soft, darks crisp
//  - abstract marks at every angle, never a direction pattern; mark size set by distance
//    ("big leaves, big marks" — a far tree gets small marks, a near one larger)
//  - cool in the shadow, warm in the light, all a little desaturated — and, being in the
//    middle distance, everything taken from the underpainting, which already carries the
//    aerial perspective (less contrast, bluer, lighter with distance)
//  - edge leaves only where the tree is big enough on screen to show them
// Far trees (under 5 REF wide) get one or two clumps: distance removes detail.
function oilMidTree(s, O, tr, out) {
  const C = s.C;
  const x = s.gx(tr.wx, tr.z);
  if (x < -40 || x > REF_W + 40) return;
  const y = s.gy(tr.z);
  const sc = s.F / tr.z;
  const w = tr.hW * sc * (tr.tall ? 0.5 : 1);
  const h = tr.hW * sc * (tr.tall ? 2.3 : 1.15);
  if (w < 1.4) return;
  const air = s.aerial(tr.z);
  const cy = y - h * 0.18 - h * 0.5;
  // the crown's colour from the scene, as the watercolour pass would have mixed it (the
  // underpainting no longer carries the crowns), through the same atmosphere
  const base = s.seen(mixRGB(C.foliage, C.foliageLit, 0.12), tr.z, x, cy);
  const desat = (c, k) => {
    const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k];
  };
  const k = 1 - air; // contrast falls with distance
  const dark = desat(mixRGB(shadeRGB(base, 1 - 0.32 * k), C.shadow, 0.12 * k), 0.15);
  const lit = desat(mixRGB(base, mixRGB(C.foliageLit, C.light, 0.45 * s.warmth), (0.55 * s.warmth + 0.15) * k), 0.15);
  const colourAt = (t) => (t < 0.45 ? mixRGB(dark, base, t / 0.45) : mixRGB(base, lit, (t - 0.45) / 0.55));
  // light: from the sun's side and above, a little toward the viewer
  const lx = Math.sign(s.sunX - x) || s.sunSide;
  const L = [lx * 0.62, -0.62, 0.48];
  const top = cy - h * 0.5, span = h;
  const shade = (u, v, yy) => {
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u + v * v)));
    const lam = Math.max(0, u * L[0] + v * L[1] + nz * L[2]);
    return clamp01(Math.pow(lam, 0.8) * (1 - 0.4 * clamp01((yy - top) / span)) + 0.05);
  };
  // sub-clumps: the basic shapes
  const clumps = [];
  if (tr.tall) {
    // a column narrowing to a rounded (not needle-thin) top: overlapping clumps, closely
    // spaced so no gap of meadow shows between them
    const m = 4 + Math.round(h / 12);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m; // 0 at the top
      const r = w * (0.34 + 0.24 * Math.sqrt(t)) * random(0.9, 1.08);
      clumps.push({ x: x + random(-0.1, 0.1) * w, y: top + r * 0.6 + t * (h * 0.95 - r * 0.6), r });
    }
  } else if (w < 5) {
    // far away: one or two clumps, no more detail than the distance allows
    clumps.push({ x, y: cy, r: w * 0.5 });
    if (w > 3) clumps.push({ x: x + random(-0.2, 0.2) * w, y: cy - h * 0.12, r: w * 0.38 });
  } else {
    const m = Math.min(7, 3 + Math.round(w / 12));
    for (let i = 0; i < m; i++) {
      const a = random(TWO_PI), d = Math.sqrt(random()) * 0.42;
      clumps.push({ x: x + Math.cos(a) * d * w, y: cy + Math.sin(a) * d * h * 0.85, r: w * random(0.26, 0.38) });
    }
  }
  clumps.sort((p, q) => p.y - q.y); // top to bottom: lower clumps overlap the ones above
  // the trunk under the crown, for trees too small for the trunk model (midTrunkMarks
  // takes over from 9 REF wide): one dark tapered stroke, the crown painted over its top
  if (w >= 2.5 && w < 9) {
    const tw = Math.max(0.7, w * 0.1);
    const tc = s.seen(mixRGB(C.silhouette, C.shadow, 0.2), tr.z, x, y);
    const ty = cy + h * 0.15;
    out.push(makeOilStroke(O, x, (y + 1 + ty) / 2, -Math.PI / 2, y + 1 - ty, tw, { color: tc, color2: tc, relief: 0, crisp: true, angular: true }));
  }
  const sz0 = Math.max(1.1, Math.min(3.2, w * 0.075)); // mark size by distance
  const nPer = (r) => Math.min(120, Math.round((r * r) / (sz0 * sz0) * 1.6) + 6);
  const markAt = (cx, cyy, sz, col, crisp) => {
    const a = random(TWO_PI); // abstract: every angle
    const tick = random() < 0.25;
    out.push(makeOilStroke(O, cx, cyy, a, sz * (tick ? random(1.1, 1.6) : random(0.6, 1.2)), sz * (tick ? random(0.25, 0.4) : random(0.5, 0.85)), {
      color: col, color2: shadeRGB(col, random(0.88, 1.08)), relief: crisp ? 0.12 * k : 0, crisp, soft: !crisp,
    }));
  };
  // the mass blocked in first, dark and broken, so no underpainting edge shows round it
  for (const c of clumps) {
    for (let i = 0; i < 3; i++) {
      const a = random(TWO_PI), d = random(0, 0.3) * c.r;
      out.push(makeOilStroke(O, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.9, random(-0.6, 0.6) + (tr.tall ? -Math.PI / 2 : 0), c.r * random(1.1, 1.5), c.r * random(0.9, 1.2), {
        color: shadeRGB(dark, random(0.9, 1)), color2: dark, relief: 0, soft: true,
      }));
    }
  }
  for (const pass of [0, 1]) {
    for (const c of clumps) {
      const n = nPer(c.r) * (pass === 0 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const a = random(TWO_PI), d = Math.sqrt(random());
        if (d > 0.8 + 0.3 * noise(tr.ph + c.x * 0.1 + Math.cos(a), Math.sin(a))) continue;
        const u = Math.cos(a) * d, v = Math.sin(a) * d;
        const mx = c.x + u * c.r, my = c.y + v * c.r * 0.9;
        const t = shade(u, v, my);
        if (pass === 0 ? t > 0.45 : t <= 0.45) continue;
        if (pass === 1 && random() > 0.45 + 0.55 * t) continue;
        const col = colourAt(clamp01(t + random(pass === 0 ? -0.04 : -0.08, pass === 0 ? 0.3 : 0.08)));
        markAt(mx, my, sz0 * Math.exp(random(-0.45, 0.4)), col, pass === 0 || random() < 0.4);
      }
    }
  }
  // edge leaves, only where the tree is big enough on screen to show them
  if (w > 14) {
    for (const c of clumps) {
      const steps = Math.round(c.r * 0.4);
      for (let q = 0; q < steps; q++) {
        if (random() < 0.5) continue;
        const a = (q / steps) * TWO_PI + random(-0.2, 0.2);
        const ex = c.x + Math.cos(a) * c.r * 0.92, ey = c.y + Math.sin(a) * c.r * 0.82;
        if (clumps.some((o) => o !== c && Math.hypot((ex - o.x) / o.r, (ey - o.y) / (o.r * 0.9)) < 0.95)) continue;
        const sunward = Math.cos(a) * L[0] + Math.sin(a) * L[1] > 0.2;
        const col = sunward && random() < 0.5 ? mixRGB(lit, base, random(0, 0.3)) : mixRGB(dark, base, random(0.1, 0.5));
        const la = a + random(-0.6, 0.6) + 0.3;
        const len = sz0 * random(1.2, 1.9);
        out.push(makeOilStroke(O, ex + Math.cos(la) * len * 0.3, ey + Math.sin(la) * len * 0.3, la, len, len * 0.4, { color: col, color2: col, relief: 0, crisp: true }));
      }
    }
  }
}

// The sun: the thickest paint in the picture. A near-white core built up in loaded,
// circling strokes, then the halo in discrete tonal rings stepping down to the sky —
// each ring thinner paint than the one inside it.
function oilSun(s, O, out) {
  const C = s.C;
  const white = [255, 252, 245];
  const sky = O.under(s.sunX + 260, s.sunY - 60);
  // N discrete tonal rings from the near-white core out to the sky: each ring a step down
  // in value and in paint thickness. Radii grow as (k/N)^1.6, so the steps are tight near
  // the core and wide at the rim.
  const chain = [white, mixRGB(white, C.sun, 0.5), mixRGB(C.sun, C.glow, 0.5), mixRGB(C.glow, sky, 0.3), mixRGB(C.glow, sky, 0.6)];
  const along = (t) => {
    const u = t * (chain.length - 1);
    const i = Math.min(chain.length - 2, Math.floor(u));
    return mixRGB(chain[i], chain[i + 1], u - i);
  };
  const N = OP.rings;
  const rings = [];
  for (let k = 0; k < N; k++) {
    const t = N === 1 ? 0 : k / (N - 1);
    rings.push({
      r0: 170 * Math.pow(k / N, 1.6),
      r1: 170 * Math.pow((k + 1) / N, 1.6),
      col: along(t),
      rel: (1 - 0.78 * t) * OP.sunImpasto,
      w: k === 0 ? [6, 9] : [5 + t, 8 + 2 * t],
      n: Math.round((26 + 64 * t) * (5 / N) * 1.0),
    });
  }
  // outer rings first, so each brighter ring sits on top of the one outside it
  for (let k = rings.length - 1; k >= 0; k--) {
    const g = rings[k];
    for (let i = 0; i < g.n; i++) {
      const a = random(TWO_PI);
      const rr = g.r0 + random() * (g.r1 - g.r0);
      const x = s.sunX + Math.cos(a) * rr * 1.1;
      const y = s.sunY + Math.sin(a) * rr;
      // the halo is air: where a ridge stands in front of it, the ridge wins
      const kind = O.field(x, y).kind;
      if (k > 0 && kind !== 'sky' && kind !== 'cloud') continue;
      const w = random(g.w[0], g.w[1]);
      const len = k === 0 ? w * random(1.4, 2.2) : Math.max(w * 2, rr * random(0.35, 0.6));
      const col = mixRGB(g.col, O.under(x, y), k === 0 ? 0 : 0.18);
      out.push(makeOilStroke(O, x, y, a + Math.PI / 2, len, w, { color: col, color2: mixRGB(col, white, 0.3), relief: g.rel }));
    }
  }
}

// Canvas: a fine twill of light and dark threads over everything.
function paintCanvasWeave(s) {
  const g = G.param('grain');
  if (g <= 0.01) return;
  const step = 2.6;
  strokeWeight(Math.max(1, 0.8 * U));
  beginShape(LINES);
  for (let y = 0; y < REF_H; y += step) {
    const a = (6 + 6 * noise(y * 0.3)) * g;
    stroke(255, 250, 240, a);
    vertex(X(0), Y(y));
    vertex(X(REF_W), Y(y + 0.4));
  }
  for (let x = 0; x < REF_W; x += step) {
    const a = (6 + 6 * noise(x * 0.3, 5)) * g;
    stroke(20, 16, 10, a);
    vertex(X(x), Y(0));
    vertex(X(x + 0.4), Y(REF_H));
  }
  endShape();
  noStroke();
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
  if ((key === 'p' || key === 'P') && window.AR_ACTIONS) window.AR_ACTIONS.paintRandom();
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
