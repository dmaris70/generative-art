// Watercolor — pigment blooms from deformed polygons.
//
// Technique (after Tyler Hobbs' "How to Hack a Painting" / Strange Loop talk,
// reimplemented from scratch): take a rough base polygon, then repeatedly
// subdivide every edge and nudge each new midpoint by a Gaussian amount — a
// coastline-like fractal deformation. Stack many slightly-different deformed
// copies at very low opacity in MULTIPLY mode; the overlap builds the soft,
// mottled edge and depth of watercolor pigment.
//
// Static render. Keys: R new painting · S save PNG.

let G;

const PALETTES = [
  { bg: [244, 239, 230], colors: [[176, 84, 58], [214, 156, 66], [42, 110, 120], [64, 74, 128], [178, 92, 110]] },
  { bg: [243, 241, 236], colors: [[38, 92, 130], [92, 148, 168], [206, 128, 74], [222, 196, 120], [70, 96, 88]] },
  { bg: [246, 242, 233], colors: [[120, 64, 96], [176, 96, 120], [64, 108, 106], [212, 160, 92], [48, 62, 92]] },
  { bg: [240, 238, 240], colors: [[74, 88, 156], [150, 96, 174], [206, 110, 128], [232, 176, 96], [70, 130, 140]] },
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();

  G = GenArt.create({
    title: 'Watercolor',
    params: {
      blooms:    { value: 6,    min: 1,    max: 16,   step: 1,    label: 'blooms' },
      layers:    { value: 60,   min: 10,   max: 120,  step: 5,    label: 'layers' },
      spread:    { value: 22,   min: 8,    max: 45,   step: 1,    label: 'size %' },
      roughness: { value: 0.10, min: 0.03, max: 0.25, step: 0.01, label: 'roughness' },
      bleed:     { value: 0.55, min: 0.15, max: 1.0,  step: 0.05, label: 'bleed' },
      opacity:   { value: 5,    min: 2,    max: 18,   step: 1,    label: 'pigment' },
    },
    onReset: function () { redraw(); },
  });

  redraw();
}

// Standard-normal sample via Box–Muller, driven by the deterministic PRNG.
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = G.rng();
  while (v === 0) v = G.rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A rough n-gon with jittered radii around a centre.
function polygon(cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const rr = r * (0.7 + G.rng() * 0.6);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

// Subdivide each edge `depth` times, displacing new midpoints along the edge
// normal by a Gaussian that shrinks each pass (`falloff`).
function deform(points, depth, variance, falloff) {
  let pts = points;
  let v = variance;
  for (let d = 0; d < depth; d++) {
    const out = [];
    const len = pts.length;
    for (let i = 0; i < len; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % len];
      out.push(a);
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const elen = Math.sqrt(ex * ex + ey * ey) || 1;
      const nx = -ey / elen;
      const ny = ex / elen;
      const g = gauss() * v * elen;
      out.push({ x: (a.x + b.x) / 2 + nx * g, y: (a.y + b.y) / 2 + ny * g });
    }
    pts = out;
    v *= falloff;
  }
  return pts;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);

  const pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];
  background(pal.bg[0], pal.bg[1], pal.bg[2]);

  const nB = G.param('blooms');
  const nL = G.param('layers');
  const rough = G.param('roughness');
  const bleed = G.param('bleed');
  const alpha = G.param('opacity');
  const maxR = (G.param('spread') / 100) * Math.min(width, height);

  blendMode(MULTIPLY);
  noStroke();

  for (let b = 0; b < nB; b++) {
    const cx = G.rng() * width;
    const cy = G.rng() * height;
    const rad = maxR * (0.5 + G.rng() * 0.8);
    const col = pal.colors[Math.floor(G.rng() * pal.colors.length)];

    // master silhouette: kept COARSE (long edges) so the per-layer bleed below,
    // which scales with edge length, still moves the fringe by a meaningful amount
    const base = deform(polygon(cx, cy, rad, 6 + Math.floor(G.rng() * 4)), 3, rough, 0.6);

    // each layer independently wobbles the master edge by `bleed`; where many
    // layers overlap the pigment is dense, where few reach it fades → soft fringe
    for (let l = 0; l < nL; l++) {
      const poly = deform(base, 5, bleed, 0.62);
      fill(col[0], col[1], col[2], alpha * (0.7 + G.rng() * 0.6));
      beginShape();
      for (const p of poly) vertex(p.x, p.y);
      endShape(CLOSE);
    }
  }

  blendMode(BLEND);
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
