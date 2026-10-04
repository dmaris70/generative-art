// Tyng Helix — after Anne Griswold Tyng, "Spiral Extension of Helix" (1969).
// MECHANISM: one complex multiplication, z -> (i/q)·z, applied to a single vector gives the
// whirling squares (each square spans two consecutive spiral corners as its diagonal); every
// square is raised into a box whose height shrinks by a second ratio, and the quarter-arc
// through each box, lifted from its bottom corner to its opposite top corner, is the helix.
// Seed picks the proportional series, turns, solid, handedness, lift profile and the oblique
// view; the seed of the work id ("035-tyng-helix") reproduces the reading of the 1969 plate.
// v2 — CHAIN: the exit of one structure (its apex) is the entry of the next. Every further
// structure draws its own law from the seed (series, turns, solid, hand, rotation, lift, growth,
// scale) and climbs or hangs from the joint; `structures` sets how many (1–1000).
// v3 — ROTATION: the chain is built once in 3-D, then turned each frame before the oblique
// projection — horizontal (about the vertical axis), vertical (tumbling about the horizontal
// axis), or both (the tumble runs at 1/φ of the turn, so the motion never closes on itself).
// v4 — VIEW: 1 shows the helix alone; 2 rides it — a perspective camera travels along the
// curve looking ahead, at a constant number of turns per second, so the ride is scale-
// invariant: each shrinking turn takes the same time, and the tower never runs out of detail.
// Keys: R new seed · S save PNG · V save SVG · Space pause rotation / ride.

let G, S = 1;
const W = 1100, H = 1460;                     // logical sheet, portrait like the plate
const WORK_ID = '035-tyng-helix';
const PHI = (1 + Math.sqrt(5)) / 2;
const PEN = { ink: '#1a1a1a', sepia: '#8a6a3d' };
const PAPER = '#efe9dc';
const SOURCE_SEED = GenArt._hashStr(WORK_ID);

// Proportional series. Only q² = q + 1 (PHI) tiles the rectangle exactly; the others overlap
// (q < PHI) or open gaps (q > PHI) — the plan shows how far a series is from the golden law.
const SERIES = [
  { name: 'PHI', q: PHI, w: 6 },
  { name: 'PHI SQ', q: PHI * PHI, w: 1.2 },
  { name: 'ROOT PHI', q: Math.sqrt(PHI), w: 1.6 },
  { name: 'PLASTIC', q: 1.3247179572, w: 1 },
  { name: 'ROOT 2', q: Math.SQRT2, w: 1 },
  { name: 'SILVER', q: 1 + Math.SQRT2, w: 0.8 },
];
const SOLID_NAMES = ['TETRAHEDRON', 'CUBE', 'OCTAHEDRON', 'DODECAHEDRON', 'ICOSAHEDRON'];

// The pre-1969 reading of the plate: golden ratio in all three dimensions, six cubes,
// steep oblique view, the curve easing between turns.
const SOURCE = { q: PHI, qv: PHI, series: 'PHI', turns: 6, mirror: false, rot: 0, theta: 68, recede: 0.4,
  solid: 1, lift: 0.5, grow: false, extend: 0 };

// URL without a seed opens on the source reading (seed = hash of the work id).
(function () {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('seed')) { u.searchParams.set('seed', String(SOURCE_SEED)); history.replaceState(null, '', u.toString()); }
  } catch (e) { /* file:// without history — falls back to a random seed */ }
})();

function setup() {
  fit();
  G = GenArt.create({
    title: 'Tyng Helix',
    params: {
      // what you watch — first, so the animation controls are always in reach
      view: { value: 0, options: { sheet: 0, 'ride the helix': 2 }, label: 'view' },
      show: { value: 0, options: { all: 0, 'helix only': 1, 'plans + helix': 2 }, label: 'show' },
      rotate: { value: 0, options: { off: 0, horizontal: 1, vertical: 2, both: 3 }, label: 'rotate' },
      speed: { value: 18, min: 1, max: 120, step: 1, label: 'rotate °/s' },
      rideSpeed: { value: 0.3, min: 0.02, max: 2, step: 0.01, label: 'ride turns/s' },
      ridePos: { value: 0, min: 0, max: 1, step: 0.001, label: 'ride start' },
      fov: { value: 72, min: 30, max: 120, step: 1, label: 'ride fov °' },
      // the chain
      structures: { value: 2, min: 1, max: 1000, step: 1, label: 'structures n' },
      chain: { value: 1, options: { 'all rise': 0, 'rise or hang': 1 }, label: 'chain' },
      // the law of each structure (sentinel = left to the seed)
      source: { value: 0, options: { off: 0, on: 1 }, label: '1969 reading' },
      ratio: { value: 1, min: 1, max: 3, step: 0.001, label: 'ratio q (1=seed)' },
      vratio: { value: 1, min: 1, max: 3, step: 0.001, label: 'v-ratio (1=seed)' },
      turns: { value: 0, min: 0, max: 16, step: 1, label: 'turns (0=seed)' },
      solid: { value: -1, options: { seed: -1, tetrahedron: 0, cube: 1, octahedron: 2, dodecahedron: 3, icosahedron: 4, 'all five': 5 }, label: 'solid' },
      lift: { value: -1, min: -1, max: 1, step: 0.05, label: 'S-lift (<0=seed)' },
      grow: { value: -1, options: { seed: -1, decrease: 0, increase: 1 }, label: 'upward' },
      extend: { value: -1, options: { seed: -1, 0: 0, 1: 1, 2: 2, 3: 3 }, label: 'outer turns' },
      oblique: { value: 0, min: 0, max: 80, step: 1, label: 'oblique ° (0=seed)' },
      recede: { value: 0, min: 0, max: 1, step: 0.01, label: 'recede (0=seed)' },
      // the sheet
      passes: { value: 0, options: { 'random per helix': 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 }, label: 'helix passes' },
      plan: { value: 2, options: { none: 0, first: 1, all: 2 }, label: 'plans' },
      labels: { value: 1, options: { off: 0, on: 1 }, label: 'letters + ratios' },
    },
    onReset: () => { dirty = true; paused = false; syncLoop(); redraw(); },   // any change from the panel resumes motion
  });
  if (G.params.view === 1) {                   // links from before `show` existed: view 1 meant helix only
    G.params.view = 0; G.params.show = 1;
    if (G.gui) G.gui.controllersRecursive().forEach(ct => ct.updateDisplay());
    G.reset();                                 // rewrites the URL in the new form
  }
  if (window.Plotter) Plotter.attach(G, { byColor: true, render: () => paintAll() });
  syncLoop();
}
let SCENE = null, dirty = true, spinT = 0, lastMs = 0, paused = false;
function syncLoop() {                         // animate only while a rotation mode is on
  lastMs = millis();
  if (G && (G.param('rotate') > 0 || G.param('view') === 2) && !paused) loop(); else noLoop();
}
function draw() { paintAll(); }
function fit() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  S = Math.min(windowWidth / W, windowHeight / H);
  if (!fit.done) { createCanvas(Math.floor(W * S), Math.floor(H * S)); fit.done = true; }
  else resizeCanvas(Math.floor(W * S), Math.floor(H * S));
}
function windowResized() { fit(); G.reset(); }
function keyPressed() {
  const el = document.activeElement;           // typing in the panel (seed field, numbers) is not a shortcut
  if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('tyng-helix-' + G.seed, 'png');
  if (key === ' ') { paused = !paused; syncLoop(); return false; }
}

// ───────────────────────── complex plane (plan) ─────────────────────────
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cscl = (a, s) => [a[0] * s, a[1] * s];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = a => Math.hypot(a[0], a[1]);
const cexp = t => [Math.cos(t), Math.sin(t)];
const I = [0, 1];

// ───────────────────────── choices: seed or source, then slider overrides ─────────────────────────
function choose(R, isSource) {
  const pick = (arr) => { let t = R() * arr.reduce((s, a) => s + a.w, 0); for (const a of arr) { if ((t -= a.w) <= 0) return a; } return arr[arr.length - 1]; };
  let c;
  if (isSource) {
    c = { ...SOURCE };
  } else {
    const ser = pick(SERIES);
    const q = ser.q;
    // vertical turns: same ratio (a constant-pitch helix) or another member of the PHI family
    let qv = q;
    if (R() < 0.3) { const alt = [PHI, PHI * PHI, Math.sqrt(PHI), Math.sqrt(q), q * q].filter(v => Math.abs(v - q) > 0.01 && v < 3); qv = alt[Math.floor(R() * alt.length)]; }
    const conv = Math.log(1 / (0.035 + R() * 0.05)) / Math.log(Math.min(q, qv));   // turns until the tower is ~5% of its base
    c = {
      q, qv, series: ser.name,
      turns: Math.max(3, Math.min(14, Math.round(conv))),
      mirror: R() < 0.5,
      rot: R() < 0.6 ? 0 : (R() * 90) * Math.PI / 180,
      theta: 28 + R() * 46,
      recede: 0.32 + R() * 0.4,
      solid: R() < 0.12 ? 5 : pick([{ v: 1, w: 4.5 }, { v: 0, w: 1.2 }, { v: 2, w: 1.2 }, { v: 3, w: 1 }, { v: 4, w: 1 }]).v,
      lift: [0, 0, 1, 0.5, R()][Math.floor(R() * 5)],
      grow: R() < 0.16,
      extend: [0, 0, 1, 1, 2][Math.floor(R() * 5)],
    };
  }
  return c;
}
function overrides(c) {
  const p = k => G.param(k);
  if (p('ratio') > 1.0005) { c.q = p('ratio'); c.series = 'Q'; if (p('vratio') <= 1.0005) c.qv = c.q; }
  if (p('vratio') > 1.0005) c.qv = p('vratio');
  if (p('turns') > 0) c.turns = p('turns');
  if (p('solid') >= 0) c.solid = p('solid');
  if (p('lift') >= 0) c.lift = p('lift');
  if (p('oblique') > 0) c.theta = p('oblique');
  if (p('recede') > 0) c.recede = p('recede');
  if (p('grow') >= 0) c.grow = p('grow') === 1;
  if (p('extend') >= 0) c.extend = p('extend');
  return c;
}

// ───────────────────────── platonic solids, normalised to the box [-1,1]³ ─────────────────────────
function solid(idx) {
  const f = PHI, g = 1 / PHI;
  let V;
  if (idx === 0) V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  else if (idx === 1) { V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]); }
  else if (idx === 2) V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  else if (idx === 3) {                       // dodecahedron: the cube plus twelve golden points
    V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) V.push([0, a * g, b * f], [a * g, b * f, 0], [b * f, 0, a * g]);
  } else {                                    // icosahedron: three orthogonal golden rectangles
    V = []; for (const a of [-1, 1]) for (const b of [-1, 1]) V.push([0, a, b * f], [a, b * f, 0], [b * f, 0, a]);
  }
  const m = Math.max(...V.map(v => Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]))));
  V = V.map(v => v.map(x => x / m));
  let dmin = Infinity;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) dmin = Math.min(dmin, d(V[i], V[j]));
  const E = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (d(V[i], V[j]) < dmin * 1.01) E.push([i, j]);
  return { V, E };
}

// ───────────────────────── construction ─────────────────────────
function build(c, withPlan, withLabels) {      // → local 3-D polylines, entry and exit points
  const spin = [0, 1 / c.q];                                   // i/q: a quarter turn and a 1/q shrink
  const d0 = cscl(cexp(3 * Math.PI / 4 + c.rot), Math.SQRT2);  // first square: unit side, diagonal at 135°
  const v = cdiv(d0, csub(spin, [1, 0]));                       // so that P1 − P0 = d0
  const kLo = -c.extend;
  const planN = c.turns + 4;
  const P = {};                                                 // spiral corners P_k = spin^k · v
  let z = v; P[0] = v;
  for (let k = 1; k <= planN + 1; k++) { z = cmul(z, spin); P[k] = z; }
  z = v; for (let k = -1; k >= kLo; k--) { z = cdiv(z, spin); P[k] = z; }

  const sq = k => {                                             // square k has P_k, P_{k+1} as diagonal
    const a = P[k], b = P[k + 1];
    const M = cscl(cadd(a, b), 0.5), h = cscl(csub(b, a), 0.5), ih = cmul(I, h);
    const c1 = cadd(M, ih), c2 = csub(M, ih);
    const ctr = cabs(c1) < cabs(c2) ? c1 : c2;                   // the arc pivots on the corner nearer the pole
    const U = cscl(cadd(h, ih), 0.5), Vv = cscl(csub(h, ih), 0.5);
    return { a, b, M, U, V: Vv, ctr, s: cabs(h) * Math.SQRT2, corners: [cadd(M, h), cadd(M, ih), csub(M, h), csub(M, ih)] };
  };
  const arc = (k, n) => {                                       // quarter circle from P_k to P_{k+1}
    const Q = sq(k), r = cabs(csub(Q.a, Q.ctr));
    const a0 = Math.atan2(Q.a[1] - Q.ctr[1], Q.a[0] - Q.ctr[0]);
    let da = Math.atan2(Q.b[1] - Q.ctr[1], Q.b[0] - Q.ctr[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n; out.push([Q.ctr[0] + r * Math.cos(a0 + da * t), Q.ctr[1] + r * Math.sin(a0 + da * t), t]); }
    return out;
  };

  // heights: h_k = qv^-k (box 0 is a cube); stacked shrinking upward, or reversed (growing upward)
  const N = c.turns, hk = [], Zk = [];
  for (let k = 0; k < N; k++) hk.push(Math.pow(c.qv, -k));
  if (!c.grow) { let acc = 0; for (let k = 0; k < N; k++) { Zk.push(acc); acc += hk[k]; } }
  else { for (let k = 0; k < N; k++) { let acc = 0; for (let j = k + 1; j < N; j++) acc += hk[j]; Zk.push(acc); } }

  // local 3-D point; handedness is a true reflection of the plan (projection happens per sheet)
  const mx = c.mirror ? -1 : 1;
  const proj = (x, y, zz) => [mx * x, y, zz];

  const ops = [], labels = [];
  let kind = 'plan';                           // what a polyline belongs to: plan, solid, or helix — `show` filters on it
  const poly = (pen, pts, w) => ops.push({ pen, pts, w: w || 1, kind });

  // ground plan
  if (withPlan) {
    for (let k = kLo; k <= planN; k++) {
      const Q = sq(k);
      if (Q.s < 0.004) break;
      poly('sepia', [...Q.corners, Q.corners[0]].map(p => proj(p[0], p[1], 0)));
      poly('ink', arc(k, 40).map(p => proj(p[0], p[1], 0)), 2);
    }
    // the two pole diagonals: P_k, P_{k+2} are collinear with O (spin² = −1/q²)
    for (const k of [kLo, kLo + 1]) {
      const a = P[k], b = cscl(P[k + 2], 1.0);
      poly('sepia', [proj(a[0], a[1], 0), proj(b[0], b[1], 0)]);
    }
    const t = 0.03;
    poly('sepia', [proj(-t, 0, 0), proj(t, 0, 0)]); poly('sepia', [proj(0, -t, 0), proj(0, t, 0)]);
  }

  // tower: boxes, solids, helix
  kind = 'solid';
  const solidCache = {};
  const helix = [];
  for (let k = 0; k < N; k++) {
    const Q = sq(k), z0 = Zk[k], h = hk[k];
    const map = (a, b, cz) => { const pp = cadd(Q.M, cadd(cscl(Q.U, a), cscl(Q.V, b))); return proj(pp[0], pp[1], z0 + (cz + 1) * 0.5 * h); };
    const sid = c.solid === 5 ? [1, 0, 2, 3, 4][k % 5] : c.solid;
    if (sid !== 1) {                         // the cube stays as the governing frame, in sepia
      const cb = solidCache[1] || (solidCache[1] = solid(1));
      for (const [i, j] of cb.E) poly('sepia', [map(...cb.V[i]), map(...cb.V[j])]);
    }
    const so = solidCache[sid] || (solidCache[sid] = solid(sid));
    for (const [i, j] of so.E) poly('ink', [map(...so.V[i]), map(...so.V[j])]);

    // helix: plan follows the quarter arc; height rises bottom corner → opposite top corner
    const pts = arc(k, 64);
    for (const [x, y, t] of pts) {
      const S_ = (k % 2 === 0) ? Math.sin(t * Math.PI / 2) : 1 - Math.cos(t * Math.PI / 2);
      let f = (1 - c.lift) * t + c.lift * S_;
      if (c.grow) f = 1 - f;
      helix.push(proj(x, y, z0 + h * f));
    }
    if (withLabels && k < 3) {                            // X, Y, Z on the vertical edge at the arc's pivot
      const e = proj(Q.ctr[0], Q.ctr[1], z0 + h * 0.62);
      labels.push({ at: e, text: 'XYZ'[k], dx: -1 });
    }
  }
  ops.push({ pen: 'ink', pts: helix, w: 'helix', kind: 'helix' });
  // entry = the low end of the helix, exit = the high end (growing towers run the other way)
  const entry = c.grow ? helix[helix.length - 1] : helix[0];
  const exit = c.grow ? helix[0] : helix[helix.length - 1];

  if (withPlan && withLabels) {
    'ABCD'.split('').forEach((L, i) => {
      const p = P[i], r = cabs(p), off = cscl(p, 1 + 0.07 / r);
      labels.push({ at: proj(off[0], off[1], 0), text: L, dx: 0 });
    });
    labels.push({ at: proj(0.02, -0.06, 0), text: 'O', dx: 0 });
  }
  return { ops, labels, entry, exit };
}

// ───────────────────────── paint ─────────────────────────
function buildScene() {                      // world-space chain: rebuilt only when seed or params change
  const p = k => G.param(k);
  const n = Math.max(1, Math.round(p('structures')));
  const ops = [], labels = [], laws = [];
  let joint = [0, 0, 0], c0 = null;
  for (let j = 0; j < n; j++) {
    // structure 0 keeps the sheet's own stream (so seeds read as in v1); later ones are hashed apart
    const R = GenArt._mulberry32(j === 0 ? G.seed : GenArt._hashStr(G.seed + ':' + j));
    const c = overrides(choose(R, j === 0 && (G.seed === SOURCE_SEED || p('source') === 1)));
    const scale = j === 0 ? 1 : 0.4 + R() * 0.75;                 // a new size for every structure
    const dir = j === 0 || p('chain') === 0 ? 1 : (R() < 0.5 ? -1 : 1);   // climb from the joint, or hang from it
    if (j === 0) c0 = c;
    laws.push(c);
    const b = build(c, p('plan') === 2 || (p('plan') === 1 && j === 0), j === 0);
    const e = b.entry;
    const W3 = q => [joint[0] + scale * (q[0] - e[0]), joint[1] + scale * (q[1] - e[1]), joint[2] + scale * dir * (q[2] - e[2])];
    // each helix gets its own pen weight: 1–6 passes, each laid down at its own small offset
    // (drawn after every other choice, so the structures themselves are unchanged by it)
    const isSrc = j === 0 && (G.seed === SOURCE_SEED || p('source') === 1);
    const PW = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
    const nPass = p('passes') > 0 ? p('passes') : isSrc ? 3 : PW[Math.floor(R() * PW.length)];
    const spread = 0.8 + R() * 1.6;                                 // logical units: from a tight bundle to a visibly doubled line
    const offs = isSrc ? [[0, 0], [0.7, 0.35], [-0.45, 0.7], [0.35, -0.75], [-0.6, -0.3], [0.9, -0.2]]
      : [[0, 0]].concat(Array.from({ length: 5 }, () => { const a = R() * 2 * Math.PI, r = spread * (0.4 + R() * 0.6); return [r * Math.cos(a), r * Math.sin(a)]; }));
    for (const o of b.ops) ops.push({ ...o, pts: o.pts.map(W3), ...(o.w === 'helix' ? { passes: nPass, offs } : {}) });
    for (const L of b.labels) labels.push({ ...L, at: W3(L.at) });
    joint = W3(b.exit);
  }
  // pivot for rotation: the centre of the chain's 3-D bounding box
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of ops) for (const q of o.pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  const centre = [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
  const path = [].concat(...ops.filter(o => o.w === 'helix').map(o => o.pts));   // the whole chain's helix, in order
  return { ops, labels, laws, c0, n, centre, path, fits: {} };
}

// turn a world point about the pivot: yaw about the vertical axis, then pitch about the x axis
function rotator(centre, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return q => {
    let x = q[0] - centre[0], y = q[1] - centre[1], z = q[2] - centre[2];
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
    return [x1 + centre[0], y2 + centre[1], z2 + centre[2]];
  };
}

// ───────────────────────── riding the helix ─────────────────────────
// Eye on the curve (raised a little off the rail), looking at a point a few samples ahead;
// the world's vertical stays up. Everything is measured in units of the local turn, so the
// near plane, the rail height and the speed all shrink with the tower.
const PER_TURN = 65;                          // samples per quarter-turn arc (0..64)
// `show`: 0 everything · 1 the helix alone · 2 the ground plans and the helix (solids and boxes hidden)
function visible() {
  const sh = G.param('show');
  const ops = sh === 1 ? SCENE.ops.filter(o => o.kind === 'helix') : sh === 2 ? SCENE.ops.filter(o => o.kind !== 'solid') : SCENE.ops;
  const labels = sh === 1 ? [] : sh === 2 ? SCENE.labels.filter(L => !'XYZ'.includes(L.text)) : SCENE.labels;   // X Y Z sit on box edges
  return { ops, labels };
}
function rideView(aw, ah, M, yaw, pitch) {
  const P = SCENE.path, N = P.length;
  const at = i => P[Math.max(0, Math.min(N - 1, i))];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  let idx = G.param('ridePos') * (N - 1) + spinT * G.param('rideSpeed') * PER_TURN;
  idx = ((idx % (N - 1)) + (N - 1)) % (N - 1);
  const i0 = Math.floor(idx), fr = idx - i0;
  const base = mix(at(i0), at(i0 + 1), fr);
  const size = Math.max(len(sub(at(i0 + 32), at(i0))), len(sub(at(i0), at(i0 - 32))), 1e-12);   // ~ a quarter turn's chord
  let fwd = sub(mix(at(i0 + 8), at(i0 + 9), fr), base);
  if (len(fwd) < size * 1e-3) fwd = sub(at(i0), at(i0 - 8));
  let f = nrm(fwd);
  let r = crs(f, [0, 0, 1]);
  if (len(r) < 1e-6) r = crs(f, [0, 1, 0]);
  r = nrm(r);
  let u = crs(r, f);
  const eye = [base[0] + u[0] * size * 0.09, base[1] + u[1] * size * 0.09, base[2] + u[2] * size * 0.09];
  if (yaw || pitch) {                         // look around from the rail: pan about the world vertical, then tilt about the camera's right
    const cz = Math.cos(yaw), sz = Math.sin(yaw);
    const rz = v => [v[0] * cz - v[1] * sz, v[0] * sz + v[1] * cz, v[2]];
    f = rz(f); r = rz(r); u = rz(u);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f2 = [f[0] * cp + u[0] * sp, f[1] * cp + u[1] * sp, f[2] * cp + u[2] * sp];
    u = [u[0] * cp - f[0] * sp, u[1] * cp - f[1] * sp, u[2] * cp - f[2] * sp];
    f = f2;
  }
  const near = size * 0.004;
  const foc = (aw / 2) / Math.tan(G.param('fov') * Math.PI / 360);
  const cx = M + aw / 2, cy = M + ah / 2;
  const cam = q => { const d = sub(q, eye); return [dot(d, r), dot(d, u), dot(d, f)]; };
  const scr = v => [cx + foc * v[0] / v[2], cy - foc * v[1] / v[2]];

  const ops = [];
  const vis = visible();
  for (const o of vis.ops) {                  // project, splitting each polyline where it crosses the near plane
    let run = [], prev = null;
    for (const q of o.pts) {
      const v = cam(q);
      if (prev) {
        const inP = prev[2] > near, inV = v[2] > near;
        if (inP !== inV) {
          const t = (near - prev[2]) / (v[2] - prev[2]);
          const x = [prev[0] + (v[0] - prev[0]) * t, prev[1] + (v[1] - prev[1]) * t, near];
          run.push(scr(x));
          if (!inV) { if (run.length > 1) ops.push({ ...o, pts: run }); run = []; }
        }
      }
      if (v[2] > near) run.push(scr(v));
      prev = v;
    }
    if (run.length > 1) ops.push({ ...o, pts: run });
  }
  const labels = [];
  for (const L of vis.labels) { const v = cam(L.at); if (v[2] > near * 20) { const p = scr(v); if (p[0] > M + 20 && p[0] < M + aw - 20 && p[1] > M + 20 && p[1] < M + ah - 20) labels.push({ ...L, at: p }); } }
  return { ops, labels, turn: Math.floor(idx / PER_TURN) + 1, turns: Math.round(N / PER_TURN) };
}

function paintAll() {
  if (dirty || !SCENE) { SCENE = buildScene(); dirty = false; }
  const { laws, c0, n, centre } = SCENE;
  const view = G.param('view');
  const spin = G.param('rotate');               // in the ride, rotation turns the camera's gaze instead of the world
  const mode = view === 2 ? 0 : spin;
  const now = millis();
  if (!paused && isLooping()) spinT += (now - lastMs) / 1000;
  lastMs = now;
  const a = spin > 0 ? spinT * G.param('speed') * Math.PI / 180 : 0;
  const yaw = (spin === 1 || spin === 3) ? a : 0, pitch = spin === 2 ? a : spin === 3 ? a / PHI : 0;

  // one oblique view for the whole sheet: depth recedes at θ, foreshortened by `recede`
  const th = c0.theta * Math.PI / 180, rc = c0.recede;
  const proj = q => [q[0] + rc * Math.cos(th) * q[1], -(q[2] + rc * Math.sin(th) * q[1])];
  const rot = mode > 0 ? rotator(centre, yaw, pitch) : (q => q);
  const vis = visible();
  let ops = vis.ops.map(o => ({ ...o, pts: o.pts.map(q => proj(rot(q))) }));
  let labels = vis.labels.map(L => ({ ...L, at: proj(rot(L.at)) }));
  const c = c0;
  let ride = null;
  background(PAPER);
  noFill();

  const M = 92, bottomBand = G.param('labels') === 1 ? 215 : 100;
  const aw = W - 2 * M, ah = H - M - bottomBand;
  const bbox = list => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of list) for (const p of o.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  };
  let sc, ox, oy;
  if (view === 2) {                           // camera on the helix: already in sheet units
    ride = rideView(aw, ah, M, yaw, pitch);
    ops = ride.ops; labels = ride.labels;
    sc = 1; ox = 0; oy = 0;
  } else if (mode === 0) {                           // still sheet: fit the drawing exactly, as in v1/v2
    const [x0, y0, x1, y1] = bbox(ops);
    sc = Math.min(aw / (x1 - x0), ah / (y1 - y0));
    ox = M + (aw - (x1 - x0) * sc) / 2 - x0 * sc; oy = M + (ah - (y1 - y0) * sc) / 2 - y0 * sc;
  } else {                                    // turning: one fixed scale for the whole cycle, pivot held at the centre
    const fk = mode + ':' + G.param('show');
    if (!SCENE.fits[fk]) {
      const sample = vis.ops.map(o => ({ pts: o.pts.filter((_, i) => i % 6 === 0) }));
      let hx = 0, hy = 0;
      const pc = proj(centre);
      for (let k = 0; k < 24; k++) {
        const t = k / 24 * 2 * Math.PI * (mode === 3 ? PHI : 1);
        const r = rotator(centre, mode === 2 ? 0 : t, mode === 1 ? 0 : mode === 2 ? t : t / PHI);
        const [x0, y0, x1, y1] = bbox(sample.map(o => ({ pts: o.pts.map(q => proj(r(q))) })));
        hx = Math.max(hx, pc[0] - x0, x1 - pc[0]); hy = Math.max(hy, pc[1] - y0, y1 - pc[1]);
      }
      SCENE.fits[fk] = { hx: hx * 1.04, hy: hy * 1.04, pc };
    }
    const f = SCENE.fits[fk];
    sc = Math.min(aw / (2 * f.hx), ah / (2 * f.hy));
    ox = M + aw / 2 - f.pc[0] * sc; oy = M + ah / 2 - f.pc[1] * sc;
  }
  const T = p => [(p[0] * sc + ox) * S, (p[1] * sc + oy) * S];

  strokeWeight(Math.max(0.6, 1.15 * S));
  const line_ = (pts, dx, dy) => { beginShape(); for (const p of pts) { const q = T(p); vertex(q[0] + dx * S, q[1] + dy * S); } endShape(); };
  // sepia first (the construction), then ink (the forms) — two pens, two passes of the plotter
  if (ride) {                                 // the window: ride lines stop at its edge
    stroke(PEN.sepia); rect(M * S, M * S, aw * S, ah * S);
    drawingContext.save(); drawingContext.beginPath(); drawingContext.rect(M * S, M * S, aw * S, ah * S); drawingContext.clip();
  }
  for (const pen of ['sepia', 'ink']) {
    stroke(PEN[pen]);
    for (const o of ops) {
      if (o.pen !== pen) continue;
      if (o.w === 'helix') {
        for (let i = 0; i < o.passes; i++) line_(o.pts, o.offs[i][0], o.offs[i][1]);
      } else if (o.w === 2) { line_(o.pts, 0, 0); line_(o.pts, 0.5, 0.4); }
      else line_(o.pts, 0, 0);
    }
  }
  if (ride) drawingContext.restore();

  const type = (str, x, y, size, pen) => {
    stroke(PEN[pen || 'ink']);
    for (const pl of StrokeFont.text(str, x, y, size)) { beginShape(); for (const p of pl) vertex(p.x * S, p.y * S); endShape(); }
  };
  if (G.param('labels') === 1) {
    for (const L of labels) {
      const p = T(L.at), sz = 13, w = StrokeFont.width(L.text, sz);
      const lx = p[0] / S + (L.dx < 0 ? -w - 9 : -w / 2), ly = p[1] / S - sz / 2;
      type(L.text, lx, ly, sz);
    }
    const f = v => v.toFixed(3);
    const rows = [
      ['VERTICAL TURNS', 'X/Y = Y/Z = ' + f(c.qv)],
      ['HORIZONTAL TURNS', 'AB/BC = BC/CD = ' + f(c.q)],
      ['RADIUS OF TURNS', 'OA/OB = OB/OC = ' + f(c.q)],
    ];
    rows.forEach((r, i) => { type(r[0], M, H - 170 + i * 22, 11, 'sepia'); type(r[1], M + 190, H - 170 + i * 22, 11); });
    const err = Math.abs(c.q * c.q - c.q - 1) < 5e-4 ? 0 : c.q * c.q - c.q - 1;
    type('TILE ERROR Q2-Q-1 = ' + (err >= 0 ? '+' : '') + f(err), M + 560, H - 170, 11, 'sepia');
    type((c.grow ? 'INCREASE' : 'DECREASE') + (c.mirror ? ' / LEFT' : ' / RIGHT') + ' HAND', M + 560, H - 148, 11, 'sepia');
    type(c.solid === 5 ? 'FIVE SOLIDS IN TURN' : SOLID_NAMES[c.solid], M + 560, H - 126, 11, 'sepia');
    if (n > 1) {
      const qs = laws.slice(1, 6).map(l => l.q.toFixed(3)).join(' ') + (n > 6 ? ' ...' : '');
      type('CHAIN OF ' + n + ' - NEXT Q ' + qs, M, H - 104, 11, 'sepia');
    }
  }
  // catalogue line + corner frame
  const solidTag = c.solid === 5 ? 'CYCLE' : SOLID_NAMES[c.solid].slice(0, 4);
  type('035 - TYNG HELIX - 1969/2026 - ' + c.series + ' ' + c.q.toFixed(3) + ' - N' + c.turns + ' - ' + solidTag + (n > 1 ? ' - X' + n : '') + ' - ' + G.seed + (ride ? ' - RIDE TURN ' + ride.turn + '/' + ride.turns : ''), M, H - 62, 11);
  stroke(PEN.ink);
  const m = 46, t = 26;
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    beginShape(); vertex((cx + sx * t) * S, cy * S); vertex(cx * S, cy * S); vertex(cx * S, (cy + sy * t) * S); endShape();
  }
}
