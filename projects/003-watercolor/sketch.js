// Watercolor — generative watercolour shapes from simple polygons.
//
// This reimplements the algorithm of 32bitkid's `watercolorizer` (ISC licensed),
// which itself follows Tyler Hobbs' "How to Hack a Painting" talk. Rewritten from
// scratch for p5. The two moves that give the real look:
//   1. Progressive EVOLUTIONS — the master polygon keeps distorting, and each
//      batch of layers is spawned from a further-wandered master, so early layers
//      hug the base and late layers bleed far out → fingers and a soft halo.
//   2. OUTWARD-biased displacement — each edge's midpoint is pushed along the
//      edge normal, and inward pushes are cut to 1/5, so pigment bulges out past
//      the base outline instead of wobbling symmetrically.
// Rendered on a procedural paper ground, with the base outline shown and a
// pigment grain, as in the watercolorizer examples.
//
// Static. Keys: R new · S save PNG.

let G;

const PALETTES = [
  { paper: [237, 232, 221], colors: [[210, 150, 60], [120, 92, 110], [70, 118, 92], [66, 96, 140], [178, 90, 74]] },
  { paper: [239, 235, 227], colors: [[196, 120, 66], [90, 116, 128], [150, 84, 104], [96, 128, 96], [72, 84, 138]] },
  { paper: [240, 236, 228], colors: [[64, 108, 120], [206, 158, 92], [128, 72, 92], [88, 120, 100], [176, 100, 116]] },
];

const KINDS = ['triangle', 'square', 'pentagon', 'hexagon', 'circle'];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  G = GenArt.create({
    title: 'Watercolor',
    params: {
      shapes:  { value: 3,   min: 1,   max: 7,   step: 1,   label: 'shapes' },
      reach:   { value: 5,   min: 2,   max: 9,   step: 1,   label: 'bleed reach' },
      density: { value: 4,   min: 1,   max: 8,   step: 1,   label: 'layers' },
      bleed:   { value: 1.4, min: 0.3, max: 2.5, step: 0.1, label: 'bleed' },
      pigment: { value: 14,  min: 3,   max: 30,  step: 1,   label: 'pigment' },
      grain:   { value: 1.0, min: 0.0, max: 2.5, step: 0.1, label: 'grain' },
    },
    onReset: function () { redraw(); },
  });
  redraw();
}

// ---- deterministic helpers ----
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = G.rng();
  while (v === 0) v = G.rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// a small fast PRNG so the paper grain doesn't consume the shared shape stream
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- base primitives (clockwise winding in screen space) ----
function primitive(kind, cx, cy, r) {
  const pts = [];
  const push = (n, rot) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rot + (i / n) * TWO_PI;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  if (kind === 'triangle') push(3, 0);
  else if (kind === 'square') push(4, Math.PI / 4);
  else if (kind === 'pentagon') push(5, 0);
  else if (kind === 'hexagon') push(6, 0);
  else push(44, 0); // circle
  return pts;
}

// ---- one distortion pass (subdivide + outward-biased displacement) ----
function distort(pts, mag) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    // keep original vertex, lightly wiggled
    out.push({ x: a.x + gauss() * 0.8 * mag, y: a.y + gauss() * 0.8 * mag });

    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey) || 1;
    const tx = ex / len;
    const ty = ey / len;

    // split point jittered around the middle
    const t = Math.min(0.999, Math.max(0.001, 0.5 + gauss() * 0.133));
    const mx = a.x + ex * t;
    const my = a.y + ey * t;

    // direction ≈ outward normal (−90° for this CW winding) + angular jitter
    const theta = -Math.PI / 2 + gauss() * (Math.PI / 12);
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const nx = tx * ct - ty * st;
    const ny = tx * st + ty * ct;

    // magnitude ∝ edge length; inward pushes damped 5× → bulges outward
    let m = gauss() * (len / 3);
    if (m < 0) m /= 5;
    m *= mag;

    out.push({ x: mx + nx * m, y: my + ny * m });
  }
  return out;
}

// ---- progressive-evolution layer generator ----
function watercolorize(base, evolutions, layersPerEvolution, layerEvolutions, mag) {
  const layers = [];
  let prev = base;
  for (let e = 0; e < evolutions; e++) {
    for (let l = 0; l < layersPerEvolution; l++) {
      let layer = distort(prev, mag);
      for (let k = 0; k < layerEvolutions; k++) layer = distort(layer, mag);
      layers.push(layer);
    }
    prev = distort(prev, mag);
  }
  return layers;
}

function bounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function paintShape(kind, cx, cy, r, col) {
  const base = primitive(kind, cx, cy, r);
  const layers = watercolorize(
    base,
    G.param('reach'),
    G.param('density'),
    3,
    G.param('bleed')
  );
  const alpha = G.param('pigment');

  // soft cast shadow under the shape (from the base outline only)
  push();
  drawingContext.shadowColor = 'rgba(35,30,25,0.22)';
  drawingContext.shadowBlur = 20;
  drawingContext.shadowOffsetY = 7;
  noFill();
  stroke(col[0], col[1], col[2], 60);
  strokeWeight(2);
  shape(base, true);
  pop();

  // pigment layers, multiply for watercolour build-up + slight tone jitter
  blendMode(MULTIPLY);
  noStroke();
  for (const layer of layers) {
    const j = 0.82 + G.rng() * 0.3;
    fill(col[0] * j, col[1] * j, col[2] * j, alpha * (0.7 + G.rng() * 0.6));
    shape(layer, false);
  }
  blendMode(BLEND);

  // pigment granulation inside the base shape
  const grain = G.param('grain');
  if (grain > 0) {
    const bb = bounds(base);
    const count = Math.floor(grain * (bb.x1 - bb.x0) * (bb.y1 - bb.y0) * 0.004);
    noStroke();
    for (let k = 0; k < count; k++) {
      const x = bb.x0 + G.rng() * (bb.x1 - bb.x0);
      const y = bb.y0 + G.rng() * (bb.y1 - bb.y0);
      if (!pointInPoly(x, y, base)) continue;
      const dark = G.rng() < 0.55 ? 0.55 : 1.25;
      fill(col[0] * dark, col[1] * dark, col[2] * dark, 10);
      circle(x, y, 0.7 + G.rng() * 1.4);
    }
  }

  // visible base outline
  noFill();
  stroke(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55, 110);
  strokeWeight(1);
  shape(base, true);
}

function shape(poly, close) {
  beginShape();
  for (const p of poly) vertex(p.x, p.y);
  endShape(close ? CLOSE : CLOSE);
}

// procedural watercolour paper: cream + fine weave + grain
function paper(rng, col) {
  background(col[0], col[1], col[2]);
  loadPixels();
  const d = pixelDensity();
  const w = width * d;
  const h = height * d;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = 4 * (x + y * w);
      const weave = (Math.sin(x * 0.55) + Math.sin(y * 0.55)) * 2.0;
      const g = (rng() - 0.5) * 12;
      const v = weave + g;
      pixels[idx] += v;
      pixels[idx + 1] += v;
      pixels[idx + 2] += v;
    }
  }
  updatePixels();
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];

  paper(makeRng(G.seed ^ 0x9e3779b9), pal.paper);

  const n = G.param('shapes');
  const marginX = width * 0.11;
  const span = (width - 2 * marginX) / n;
  const r = Math.min(span * 0.34, height * 0.3);

  for (let i = 0; i < n; i++) {
    const cx = marginX + span * (i + 0.5);
    const cy = height * 0.5 + gauss() * height * 0.02;
    const kind = KINDS[Math.floor(G.rng() * KINDS.length)];
    const col = pal.colors[Math.floor(G.rng() * pal.colors.length)];
    paintShape(kind, cx, cy, r * (0.82 + G.rng() * 0.3), col);
  }

  drawingContext.shadowBlur = 0;
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
