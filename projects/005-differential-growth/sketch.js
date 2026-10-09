// Differential Growth — an organic wandering boundary.
//
// A closed loop of nodes evolves under three rules: neighbours pull toward a
// rest length (the line stays connected and smooth), nearby nodes push apart
// (the line refuses to overlap itself), and long edges sprout new nodes (the
// perimeter keeps growing). More perimeter forced into the same space has to
// buckle and fold — the coral/cortex look emerges on its own. Original
// implementation; a spatial hash keeps the repulsion O(n).
//
// Animated. Keys: R new growth · S save PNG.

let G;
let nodes = [];
let restLen, repelR, maxLen;
let pal;

const PALETTES = [
  { bg: [11, 11, 14],  line: [216, 180, 254] },
  { bg: [13, 16, 22],  line: [130, 200, 210] },
  { bg: [18, 12, 14],  line: [235, 150, 120] },
  { bg: [244, 240, 232], line: [40, 44, 60] },
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  G = GenArt.create({
    title: 'Differential Growth',
    params: {
      maxNodes: { value: 1400, min: 200,  max: 3000, step: 100,  label: 'max nodes' },
      repel:    { value: 18,   min: 8,    max: 44,   step: 1,    label: 'repel radius' },
      attract:  { value: 0.38, min: 0.1,  max: 1.0,  step: 0.02, label: 'attraction' },
      push:     { value: 1.0,  min: 0.2,  max: 2.0,  step: 0.1,  label: 'repulsion' },
      speed:    { value: 4,    min: 1,    max: 8,    step: 1,    label: 'growth/frame' },
    },
    onReset: reset,
  });
  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];

  restLen = 7;
  repelR = G.param('repel');
  maxLen = restLen * 1.5;

  // start as a small jittered ring in the centre
  nodes = [];
  const n0 = 40;
  const r0 = 55;
  const cx = width / 2;
  const cy = height / 2;
  for (let i = 0; i < n0; i++) {
    const a = (i / n0) * TWO_PI;
    const jr = r0 * (0.85 + G.rng() * 0.3);
    nodes.push({ x: cx + Math.cos(a) * jr, y: cy + Math.sin(a) * jr, vx: 0, vy: 0 });
  }
  // pre-grow so the first painted frame is already a developed form (and the
  // piece doesn't open on a plain circle); it keeps evolving live from here
  const warm = Math.min(320, Math.floor(G.param('maxNodes') / 4));
  for (let i = 0; i < warm; i++) step();

  background(pal.bg[0], pal.bg[1], pal.bg[2]);
}

function step() {
  const n = nodes.length;
  const attract = G.param('attract');
  const push = G.param('push');
  const R = repelR;

  // spatial hash of node indices by cell
  const cell = R;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const bins = new Array(cols * rows);
  for (let i = 0; i < n; i++) {
    const cxi = Math.min(cols - 1, Math.max(0, Math.floor(nodes[i].x / cell)));
    const cyi = Math.min(rows - 1, Math.max(0, Math.floor(nodes[i].y / cell)));
    const key = cxi + cyi * cols;
    (bins[key] || (bins[key] = [])).push(i);
  }

  const fx = new Float32Array(n);
  const fy = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = nodes[i];

    // attraction toward the two neighbours at rest length
    const prev = nodes[(i - 1 + n) % n];
    const next = nodes[(i + 1) % n];
    for (const adj of [prev, next]) {
      let dx = adj.x - p.x;
      let dy = adj.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - restLen) / d) * attract * 0.5;
      fx[i] += dx * f;
      fy[i] += dy * f;
    }
    // Laplacian smoothing toward the neighbours' midpoint — removes zigzag
    // spikes so the line folds in smooth, brain-like curves
    fx[i] += ((prev.x + next.x) * 0.5 - p.x) * 0.22;
    fy[i] += ((prev.y + next.y) * 0.5 - p.y) * 0.22;

    // repulsion from nearby nodes (3x3 neighbouring bins)
    const cxi = Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell)));
    const cyi = Math.min(rows - 1, Math.max(0, Math.floor(p.y / cell)));
    for (let gy = cyi - 1; gy <= cyi + 1; gy++) {
      if (gy < 0 || gy >= rows) continue;
      for (let gx = cxi - 1; gx <= cxi + 1; gx++) {
        if (gx < 0 || gx >= cols) continue;
        const b = bins[gx + gy * cols];
        if (!b) continue;
        for (const j of b) {
          if (j === i) continue;
          let dx = p.x - nodes[j].x;
          let dy = p.y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < R * R) {
            const d = Math.sqrt(d2);
            const f = (1 - d / R) * push;
            fx[i] += (dx / d) * f;
            fy[i] += (dy / d) * f;
          }
        }
      }
    }
  }

  // integrate (clamp step for stability) + tiny brownian jitter to break symmetry
  for (let i = 0; i < n; i++) {
    let mx = fx[i] + (G.rng() - 0.5) * 0.3;
    let my = fy[i] + (G.rng() - 0.5) * 0.3;
    const m = Math.sqrt(mx * mx + my * my);
    const cap = 2.2;
    if (m > cap) { mx = (mx / m) * cap; my = (my / m) * cap; }
    nodes[i].x += mx;
    nodes[i].y += my;
  }

  // growth: split every over-long edge, plus a couple of random buds so the
  // perimeter reliably outpaces the area and the line is forced to fold
  if (nodes.length < G.param('maxNodes')) {
    const grown = [];
    const len = nodes.length;
    for (let i = 0; i < len; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % len];
      grown.push(a);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > maxLen * maxLen) {
        grown.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: 0 });
      }
    }
    for (let s = 0; s < 2 && grown.length < G.param('maxNodes'); s++) {
      const k = Math.floor(G.rng() * grown.length);
      const a = grown[k];
      const b = grown[(k + 1) % grown.length];
      grown.splice(k + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: 0 });
    }
    nodes = grown;
  }
}

function draw() {
  const perFrame = G.param('speed');
  for (let s = 0; s < perFrame; s++) step();

  background(pal.bg[0], pal.bg[1], pal.bg[2]);
  noFill();
  stroke(pal.line[0], pal.line[1], pal.line[2]);
  strokeWeight(1.5);
  strokeJoin(ROUND);
  beginShape();
  for (const p of nodes) vertex(p.x, p.y);
  const first = nodes[0];
  const second = nodes[1] || first;
  vertex(first.x, first.y);
  vertex(second.x, second.y);
  endShape();
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('differential-growth-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reset();
}
