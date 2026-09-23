// Readout Plaid — a hidden plaid of column and row faults is read out as
// pixel-sort smears along the fault direction; block clusters are where the
// readout stalls, and the scribbles are the reading head drifting free of the grid.
//
// Layers, back to front:
//   0 paper      mottled off-white ground, faint grey patches
//   1 tiles      translucent grey squares
//   2 v-smears   vertical run-length strips gathered into columns
//   3 h-smears   horizontal dash rows gathered into bands
//   4 slabs      a few solid colour rectangles on the columns
//   5 clusters   black block-noise grown by random walk (+ dot-matrix variant)
//   6 speckle    gaussian clouds of 1–2 px dots, one pen each
//   7 dashes     long dashed rulings
//   8 scribbles  noise-driven pen lines with loop episodes
//   9 confetti   small grey/black/white squares with a 1 px shadow
//
// Keys: R randomize · S save full-res PNG (2160×3000).
// Inspect: append ?zoom=x,y,w to view a region of the sheet at magnification.

let G, pg;
const W = 1080, H = 1500;

const PEN = {
  orange: [217, 113, 28],
  teal:   [38, 149, 165],
  lime:   [168, 197, 35],
  black:  [20, 20, 20],
  white:  [252, 252, 250],
  g1:     [70, 70, 70],
  g2:     [128, 128, 128],
  g3:     [176, 176, 176],
  g4:     [214, 212, 208],
};
const PAPER = [234, 232, 227];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  G = GenArt.create({
    title: 'Readout Plaid',
    params: {
      columns:    { value: 34,   min: 4,   max: 80,   step: 1,    label: 'columns' },
      bands:      { value: 5,    min: 1,   max: 14,   step: 1,    label: 'bands' },
      vSmear:     { value: 1.0,  min: 0.1, max: 2.5,  step: 0.05, label: 'v-smear density' },
      hSmear:     { value: 1.0,  min: 0.1, max: 2.5,  step: 0.05, label: 'h-smear density' },
      clusters:   { value: 7,    min: 0,   max: 20,   step: 1,    label: 'block clusters' },
      scribbles:  { value: 210,  min: 0,   max: 600,  step: 10,   label: 'scribbles' },
      confetti:   { value: 520,  min: 0,   max: 2000, step: 20,   label: 'confetti' },
      speckle:    { value: 44,   min: 0,   max: 120,  step: 2,    label: 'speckle clouds' },
      warmth:     { value: 0.5,  min: 0,   max: 1,    step: 0.05, label: 'orange ↔ teal' },
    },
    onReset: reset,
  });
  reset();
}

// ---------- helpers ----------
const R = () => G.rng();
const rr = (a, b) => a + (b - a) * R();
const ri = (a, b) => Math.floor(rr(a, b + 1));
function gauss() { // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = R();
  while (v === 0) v = R();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function logn(median, sigma) { return median * Math.exp(sigma * gauss()); }
function pick(weights) { // {key: w}
  let s = 0; for (const k in weights) s += weights[k];
  let t = R() * s;
  for (const k in weights) { t -= weights[k]; if (t <= 0) return k; }
  return Object.keys(weights)[0];
}
function fillPen(name, a = 255) { const c = PEN[name]; pg.fill(c[0], c[1], c[2], a); }
function strokePen(name, a = 255) { const c = PEN[name]; pg.stroke(c[0], c[1], c[2], a); }

// bumps: sum of gaussians → a "fault" profile along one axis
function makeProfile(n, len, wMin, wMax) {
  const bumps = [];
  for (let i = 0; i < n; i++) bumps.push({ c: R() * len, w: rr(wMin, wMax), a: rr(0.4, 1.6) });
  return (t) => {
    let s = 0;
    for (const b of bumps) { const d = (t - b.c) / b.w; s += b.a * Math.exp(-d * d); }
    return s;
  };
}
// sample a coordinate by rejection against profile+base
function sampleAlong(profile, len, base, maxV) {
  for (let k = 0; k < 40; k++) {
    const t = R() * len;
    if (R() * maxV < base + profile(t)) return t;
  }
  return R() * len;
}

// colour field: which pen dominates a region
let warmth;
function penAt(x, y, allowBlack = true) {
  const n = noise(x * 0.0035, y * 0.0035);
  const m = noise(x * 0.011 + 40, y * 0.011 + 40);
  const w = {
    orange: 1 + 3 * Math.max(0, warmth - n) * 3,
    teal:   1 + 3 * Math.max(0, n - warmth) * 3,
    lime:   0.6 + 2.2 * Math.max(0, m - 0.5) * 2,
    black:  allowBlack ? 0.35 : 0,
  };
  return pick(w);
}

// ---------- layers ----------
function paper() {
  pg.background(PAPER[0], PAPER[1], PAPER[2]);
  pg.noStroke();
  const cell = 6;
  for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
    const n = noise(x * 0.008, y * 0.008) * 0.7 + noise(x * 0.05, y * 0.05) * 0.3;
    const a = (n - 0.5) * 60;
    if (a > 4) { pg.fill(120, 120, 120, a); pg.rect(x, y, cell, cell); }
  }
  for (let i = 0; i < 36; i++) {
    const s = rr(30, 130);
    pg.fill(110, 110, 110, rr(8, 22));
    pg.rect(R() * W, R() * H, s, s * rr(0.4, 1.4));
  }
}

function tiles(vProf, vMax) {
  pg.noStroke();
  for (let i = 0; i < 260; i++) {
    const x = R() < 0.5 ? sampleAlong(vProf, W, 0.3, vMax) : R() * W;
    const s = rr(6, 30);
    fillPen(pick({ g2: 3, g3: 4, g4: 2, g1: 1 }), rr(90, 220));
    pg.rect(x, R() * H, s, s);
  }
}

// a run-length strip: total length split into runs with gaps
function strip(x, y, len, w, vertical, pen, a = 255) {
  fillPen(pen, a);
  let t = 0;
  while (t < len) {
    const run = Math.min(len - t, logn(len * 0.25, 0.8));
    if (vertical) pg.rect(Math.round(x), Math.round(y + t), w, run); else pg.rect(Math.round(x + t), Math.round(y), run, w);
    t += run + (R() < 0.35 ? rr(1, 8) : 0);
  }
}

function vSmears(vProf, vMax) {
  pg.noStroke();
  const dens = G.param('vSmear');
  // 1) loose field, everywhere, biased toward columns
  const n = Math.floor(3000 * dens);
  for (let i = 0; i < n; i++) {
    const x = sampleAlong(vProf, W, 0.2, vMax);
    const y = R() * H;
    const len = logn(30, 0.9);
    const w = R() < 0.5 ? 1 : (R() < 0.7 ? 2 : 3);
    strip(x, y, len, w, true, penAt(x, y), rr(225, 255));
  }
  // 2) dense columns: several pens interleaved within a narrow x window
  const cols = G.param('columns');
  for (let c = 0; c < cols; c++) {
    const cx = sampleAlong(vProf, W, 0.15, vMax);
    const hw = R() < 0.3 ? rr(60, 170) : rr(8, 50); // a few wide curtains, mostly tight columns
    const y0 = R() * H, span = rr(150, 1000);
    const count = Math.floor(rr(400, 1600) * dens * (hw > 60 ? 1.8 : 1));
    const pens = { orange: R() * 3, teal: R() * 3, lime: R() * 2, black: R() * 0.7 };
    for (let i = 0; i < count; i++) {
      const x = cx + gauss() * hw * 0.5;
      const y = y0 + R() * span;
      const len = logn(hw > 60 ? 60 : 40, 0.9);
      const w = R() < 0.55 ? 1 : (R() < 0.75 ? 2 : 3);
      strip(x, y, len, w, true, pick(pens), 255);
    }
  }
}

function hSmears(hProf, hMax) {
  pg.noStroke();
  const dens = G.param('hSmear');
  // 1) loose horizontal field
  const n = Math.floor(1500 * dens);
  for (let i = 0; i < n; i++) {
    const y = sampleAlong(hProf, H, 0.25, hMax);
    const x = R() * W;
    const len = logn(30, 0.9);
    strip(x, y, len, R() < 0.75 ? 1 : 2, false, penAt(x, y), rr(200, 255));
  }
  // 2) bands: dash rows stacked every 1–2 px, density fading at the edges
  const bands = G.param('bands');
  for (let b = 0; b < bands; b++) {
    const cy = sampleAlong(hProf, H, 0.1, hMax);
    const hh = rr(22, 70);
    const strength = b < 2 ? 1 : rr(0.3, 0.75); // two bands are slabs, the rest are echoes
    const x0 = R() * W * 0.5, x1 = W - R() * W * 0.5;
    const main = pick({ orange: 3, teal: 2, lime: 0.8, black: 0.5 });
    const pens = { black: 0.6, orange: 0.4, teal: 0.4, lime: 0.3, white: 0.4 };
    pens[main] = 12; // one pen owns the band (set after, so the literal cannot overwrite it)
    for (let y = cy - hh * 1.4; y < cy + hh * 1.4; y += (b < 2 || R() < 0.6) ? 1 : 2) {
      const d = (y - cy) / hh;
      const p = Math.min(1, Math.exp(-d * d * 1.2) * dens * 1.2 * strength);
      let x = x0 + rr(-60, 60);
      while (x < x1) {
        const len = logn(200, 1.0);
        if (R() < p) strip(x, y, len, R() < 0.5 ? 1 : (R() < 0.7 ? 2 : 3), false, pick(pens), 255);
        x += len + rr(2, 30);
      }
    }
  }
}

function slabs(vProf, vMax) {
  pg.noStroke();
  for (let i = 0; i < 34; i++) {
    const x = sampleAlong(vProf, W, 0.1, vMax), y = R() * H;
    const w = rr(10, 50), h = rr(14, 70);
    fillPen(penAt(x, y), 255);
    pg.rect(x, y, w, h);
  }
}

function clusters() {
  pg.noStroke();
  const n = G.param('clusters');
  for (let c = 0; c < n; c++) {
    const big = c === 0; // one dominant mass, low and central
    const cx = big ? rr(W * 0.35, W * 0.7) : rr(60, W - 60);
    const cy = big ? rr(H * 0.55, H * 0.8) : rr(80, H - 80);
    const rx = big ? rr(140, 190) : rr(30, 110);
    const ry = big ? rr(250, 330) : rr(30, 140);
    const dotMatrix = !big && R() < 0.35;
    const count = big ? 5200 : Math.floor(rr(250, 1100));
    let x = cx, y = cy;
    const pens = { black: 10, teal: 1.4, orange: 1.0, white: 0.6, lime: 0.3, g2: 0.4 };
    for (let i = 0; i < count; i++) {
      // random walk, pulled back toward the centre so the mass stays elliptical
      x += gauss() * 14 - (x - cx) * 0.05;
      y += gauss() * 14 - (y - cy) * 0.05;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1 && R() < 0.6) { x = cx + gauss() * rx * 0.5; y = cy + gauss() * ry * 0.5; }
      const pen = pick(pens);
      fillPen(pen, 255);
      if (dotMatrix) {
        pg.rect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, rr(1, 3), rr(1, 3));
      } else {
        const g = 3; // blocks sit on a coarse grid, as corruption does
        const w = Math.max(g, Math.round(logn(13, 0.6) / g) * g), h = Math.max(g, Math.round(logn(13, 0.6) / g) * g);
        pg.rect(Math.round(x / g) * g, Math.round(y / g) * g, R() < 0.12 ? w * 3 : w, R() < 0.12 ? h * 3 : h);
      }
    }
  }
}

function speckle() {
  pg.noStroke();
  const n = G.param('speckle');
  for (let c = 0; c < n; c++) {
    const cx = R() * W, cy = R() * H;
    const sx = rr(15, 120), sy = sx * (R() < 0.4 ? rr(0.15, 0.5) : rr(0.6, 1.2));
    const pen = pick({ orange: 2, lime: 2, teal: 1.5, black: 2, white: 0.6 });
    const count = Math.floor(rr(150, 1200));
    for (let i = 0; i < count; i++) {
      fillPen(pen, rr(160, 255));
      const s = R() < 0.8 ? 1 : 2;
      pg.rect(cx + gauss() * sx, cy + gauss() * sy, s, s);
    }
  }
}

function dashes() {
  pg.noStroke();
  for (let i = 0; i < 9; i++) {
    const vertical = R() < 0.3;
    const pen = pick({ black: 4, orange: 1, teal: 1 });
    const len = rr(250, 950);
    const x0 = R() * (W - (vertical ? 0 : len)), y0 = R() * (H - (vertical ? len : 0));
    let t = 0;
    fillPen(pen, 255);
    while (t < len) {
      const d = rr(3, 14), g = rr(2, 7);
      if (vertical) pg.rect(x0, y0 + t, rr(1, 2), d); else pg.rect(x0 + t, y0, d, rr(1, 2));
      t += d + g;
    }
  }
}

function scribbles() {
  pg.noFill();
  const n = G.param('scribbles');
  for (let i = 0; i < n; i++) {
    const pen = pick({ black: 3.5, orange: 2.5, teal: 1.8, lime: 1.2, white: 1.0, g3: 0.6 });
    const long = R() < 0.25;
    const steps = Math.floor(long ? rr(500, 1600) : rr(60, 400));
    const step = rr(3.0, 4.5);
    let x = R() * W, y = R() * H;
    let a = R() * TWO_PI;
    const turn = rr(0.05, 0.22);
    const nz = rr(0.004, 0.02);
    let loopBias = 0, loopLeft = 0;
    pg.strokeWeight(rr(0.45, 0.9));
    strokePen(pen, pen === 'g3' ? 200 : 255);
    pg.beginShape();
    for (let s = 0; s < steps; s++) {
      if (loopLeft <= 0 && R() < 0.004) { loopLeft = ri(30, 80); loopBias = (R() < 0.5 ? -1 : 1) * rr(0.05, 0.13); }
      if (loopLeft > 0) loopLeft--; else loopBias *= 0.9;
      a += (noise(x * nz, y * nz, i * 0.37) - 0.5) * 2 * turn + loopBias;
      if (R() < 0.008) a += rr(-1.3, 1.3); // a kink: the pen changes its mind
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      if (x < 2 || x > W - 2) { a = PI - a; x = constrain(x, 2, W - 2); }
      if (y < 2 || y > H - 2) { a = -a; y = constrain(y, 2, H - 2); }
      pg.vertex(x, y);
    }
    pg.endShape();
  }
}

function confetti() {
  pg.noStroke();
  const n = G.param('confetti');
  for (let i = 0; i < n; i++) {
    const s = rr(4, 14);
    const x = Math.round(R() * W), y = Math.round(R() * H);
    const pen = pick({ black: 3, white: 2.2, g1: 1.2, g2: 1.8, g3: 1.8, teal: 0.5, orange: 0.4 });
    pg.fill(40, 40, 40, 90); pg.rect(x + 1, y + 1, s, s); // 1 px paper-cut shadow
    fillPen(pen, 255); pg.rect(x, y, s, s);
  }
}

// ---------- compose ----------
function reset() {
  randomSeed(G.seed); noiseSeed(G.seed);
  warmth = G.param('warmth');
  if (!pg) { pg = createGraphics(W, H); pg.pixelDensity(2); }
  pg.push();

  const vProf = makeProfile(10, W, 15, 120);
  const hProf = makeProfile(7, H, 20, 110);
  let vMax = 0, hMax = 0;
  for (let t = 0; t < W; t += 2) vMax = Math.max(vMax, vProf(t));
  for (let t = 0; t < H; t += 2) hMax = Math.max(hMax, hProf(t));
  vMax += 0.4; hMax += 0.3;

  paper();
  tiles(vProf, vMax);
  vSmears(vProf, vMax);
  hSmears(hProf, hMax);
  slabs(vProf, vMax);
  clusters();
  speckle();
  dashes();
  scribbles();
  confetti();

  pg.pop();
  redraw();
}

function draw() {
  background(11, 11, 14);
  const z = zoomRegion();
  if (z) { // inspection: ?zoom=x,y,w → that region of the sheet fills the window
    const zh = z.w * height / width;
    image(pg, 0, 0, width, height, z.x, z.y, z.w, zh);
  } else {
    const s = Math.min(width / W, height / H) * 0.96;
    const dw = W * s, dh = H * s;
    image(pg, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }
  noLoop();
}
function zoomRegion() {
  try {
    const v = new URL(location.href).searchParams.get('zoom');
    if (!v) return null;
    const [x, y, w] = v.split(',').map(Number);
    return { x, y, w: w || 400 };
  } catch (e) { return null; }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') save(pg, 'readout-plaid-' + G.seed + '.png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
