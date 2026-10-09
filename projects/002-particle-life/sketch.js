// Particle Life — emergent life-like behaviour from simple attraction rules.
//
// Every particle has a species (a colour). A seeded species×species matrix says
// how strongly each species is attracted to (+) or repelled by (-) each other.
// Short range is always repulsive (particles don't overlap); the matrix governs
// the mid range. Space wraps toroidally. Original implementation.
//
// The whole system is a pure function of the seed — same seed → same universe.
// Keys: R randomize (new universe) · S save PNG.

let G;
let parts = [];
let matrix = [];
let K = 5; // number of species

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 255, 255, 255, 255);

  G = GenArt.create({
    title: 'Particle Life',
    params: {
      count:    { value: 800,  min: 200, max: 2200, step: 50,  label: 'particles' },
      species:  { value: 5,    min: 2,   max: 8,    step: 1,   label: 'species' },
      rMax:     { value: 115,  min: 40,  max: 260,  step: 5,   label: 'interaction radius' },
      force:    { value: 1.1,  min: 0.1, max: 3.0,  step: 0.1, label: 'force' },
      friction: { value: 0.86, min: 0.5, max: 0.97, step: 0.01, label: 'friction' },
      repel:    { value: 0.30, min: 0.1, max: 0.5,  step: 0.02, label: 'repel zone' },
    },
    onReset: reset,
  });

  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  K = G.param('species');

  // Seeded attraction matrix in [-1, 1]. matrix[a][b] = how a feels about b.
  matrix = [];
  for (let i = 0; i < K; i++) {
    matrix[i] = [];
    for (let j = 0; j < K; j++) matrix[i][j] = G.rng() * 2 - 1;
  }

  const n = G.param('count');
  parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      x: G.rng() * width,
      y: G.rng() * height,
      vx: 0,
      vy: 0,
      t: Math.floor(G.rng() * K),
    });
  }
  background(11, 11, 14);
}

// Piecewise force curve: hard repulsion inside `beta`, then a triangular
// attraction/repulsion lobe scaled by the matrix value `a`.
function forceCurve(r, a, beta) {
  if (r < beta) return r / beta - 1;            // core repulsion → [-1, 0]
  if (r < 1) return a * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta));
  return 0;
}

function draw() {
  // Low-alpha wash instead of a hard clear → soft motion trails.
  noStroke();
  fill(11, 11, 14, 45);
  rect(0, 0, width, height);

  const rMax = G.param('rMax');
  const rMax2 = rMax * rMax;
  const force = G.param('force');
  const friction = G.param('friction');
  const beta = G.param('repel');
  const halfW = width / 2;
  const halfH = height / 2;

  // Accumulate forces (naive O(n^2) — fine for a couple thousand particles).
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    let fx = 0;
    let fy = 0;
    for (let j = 0; j < parts.length; j++) {
      if (i === j) continue;
      const b = parts[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      // shortest vector on a torus
      if (dx > halfW) dx -= width; else if (dx < -halfW) dx += width;
      if (dy > halfH) dy -= height; else if (dy < -halfH) dy += height;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < rMax2) {
        const d = Math.sqrt(d2);
        const f = forceCurve(d / rMax, matrix[a.t][b.t], beta);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
    }
    // integrate
    a.vx = a.vx * friction + fx * force * 0.5;
    a.vy = a.vy * friction + fy * force * 0.5;
  }

  // Move + render.
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.x += p.vx;
    p.y += p.vy;
    // wrap
    if (p.x < 0) p.x += width; else if (p.x >= width) p.x -= width;
    if (p.y < 0) p.y += height; else if (p.y >= height) p.y -= height;

    fill((p.t / K) * 255, 180, 255, 220);
    circle(p.x, p.y, 3.2);
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('particle-life-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reset();
}
