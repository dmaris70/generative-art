// Watercolor Tree — colour a line drawing with the watercolour technique.
//
// Paints watercolour washes (a green canopy of blobs clipped to a dome, a brown
// trunk, a ground shadow) and then overlays a black-line tree drawing on top via
// MULTIPLY, so the ink stays crisp and the colour shows through the white.
//
// Bring your own drawing: DROP a PNG/JPG onto the canvas, or save it next to this
// file as `tree.png` and it loads automatically. Without a drawing it stands on
// its own as a generative watercolour tree.
//
// Keys: R new colouring · S save PNG.

let G;
let img = null;

const PALETTES = [
  { // summer
    leaves: [[86, 120, 60], [110, 142, 72], [64, 98, 52], [132, 152, 82], [92, 128, 66]],
    trunk: [96, 68, 44], ground: [84, 74, 52],
  },
  { // autumn
    leaves: [[200, 122, 50], [176, 88, 48], [214, 162, 62], [150, 78, 44], [124, 92, 52]],
    trunk: [98, 64, 42], ground: [96, 68, 46],
  },
  { // spring
    leaves: [[132, 172, 92], [162, 192, 112], [110, 152, 80], [192, 202, 120], [142, 178, 100]],
    trunk: [102, 76, 50], ground: [94, 84, 58],
  },
];

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  c.drop(gotFile);

  G = GenArt.create({
    title: 'Watercolor Tree',
    params: {
      leaves:  { value: 13,  min: 6,   max: 26,  step: 1,   label: 'foliage' },
      bleed:   { value: 1.2, min: 0.6, max: 2.2, step: 0.1, label: 'bleed' },
      pigment: { value: 12,  min: 4,   max: 22,  step: 1,   label: 'pigment' },
      trunkW:  { value: 1.0, min: 0.5, max: 1.8, step: 0.1, label: 'trunk width' },
      grain:   { value: 0.8, min: 0.0, max: 2.0, step: 0.1, label: 'grain' },
    },
    onReset: function () { redraw(); },
  });

  // auto-load a drawing saved beside the sketch, if present
  loadImage('tree.png', function (im) { img = im; redraw(); }, function () {});
  redraw();
}

function gotFile(file) {
  if (file && file.type === 'image') {
    loadImage(file.data, function (im) { img = im; redraw(); });
  }
}

// image-square fit → canvas mapping helpers (set in draw)
let OX = 0, OY = 0, S = 1;
function mx(nx) { return OX + nx * S; }
function my(ny) { return OY + ny * S; }
function ms(nr) { return nr * S; }

function clipPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
}

function ellipsePts(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

// a softly bumpy dome (irregular so the clip edge doesn't read as a clean arc)
function domePts(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const b = 1 + 0.16 * (noise(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5) - 0.5) * 2;
    pts.push({ x: cx + Math.cos(a) * rx * b, y: cy + Math.sin(a) * ry * b });
  }
  return pts;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  // local, seed-derived RNG so draw() is idempotent (async image load redraws)
  const rng = Watercolor.makeRng(G.seed);

  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  // near-white watercolour paper
  Watercolor.paperTexture([248, 246, 240], Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });

  // fit the (square) drawing area into the canvas
  S = Math.min(width, height) * 0.94;
  OX = (width - S) / 2;
  OY = (height - S) / 2;

  const bleed = G.param('bleed');
  const pig = G.param('pigment');
  const grain = G.param('grain');
  const ctx = drawingContext;

  // --- ground shadow (a flat wash) ---
  const groundPoly = ellipsePts(mx(0.5), my(0.905), ms(0.2), ms(0.032), 26);
  Watercolor.paint({
    base: groundPoly, cx: mx(0.5), cy: my(0.905), r: ms(0.2),
    color: pal.ground, paper: [248, 246, 240], rng: rng,
    reach: 3, layers: 2, bleed: 1.0, pigment: 5, edge: 0.08, bloom: 0,
    grain: grain * 0.3, outline: false, shadow: false,
  });

  // --- trunk (clipped to a tapered, root-flared shape) ---
  const tw = G.param('trunkW');
  const trunk = [
    { x: mx(0.5 - 0.03 * tw), y: my(0.50) },
    { x: mx(0.5 + 0.03 * tw), y: my(0.50) },
    { x: mx(0.5 + 0.06 * tw), y: my(0.80) },
    { x: mx(0.5 + 0.11 * tw), y: my(0.90) },
    { x: mx(0.5 + 0.02), y: my(0.885) },
    { x: mx(0.5 - 0.13 * tw), y: my(0.905) },
    { x: mx(0.5 - 0.05 * tw), y: my(0.80) },
  ];
  ctx.save();
  clipPoly(ctx, trunk);
  Watercolor.paint({
    base: trunk, cx: mx(0.5), cy: my(0.66), r: ms(0.24),
    color: pal.trunk, paper: [248, 246, 240], rng: rng,
    reach: 3, layers: 3, bleed: 0.7, pigment: 15, edge: 0.35, bloom: 0.12,
    grain: grain, outline: false, shadow: false,
  });
  ctx.restore();

  // --- canopy: light green washes forming a dome; overlaps build the tone
  // (soft blob edges are the visible boundary; the bumpy dome only nets spill) ---
  const dome = domePts(mx(0.5), my(0.33), ms(0.52), ms(0.34), 46);
  ctx.save();
  clipPoly(ctx, dome);
  const nL = G.param('leaves');
  let placed = 0, attempts = 0;
  while (placed < nL && attempts < nL * 12) {
    attempts++;
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    if (u * u + v * v > 1) continue;
    const cx = mx(0.5) + u * ms(0.4);   // sample inward so bleed forms the edge
    const cy = my(0.33) + v * ms(0.26);
    const ny = (cy - OY) / S;
    const r = ms(0.1 + rng() * 0.06);
    const light = 0.86 + (1 - ny) * 0.32; // higher foliage catches more light
    const base = pal.leaves[Math.floor(rng() * pal.leaves.length)];
    Watercolor.paint({
      kind: 'circle', cx: cx, cy: cy, r: r,
      color: [Math.min(255, base[0] * light), Math.min(255, base[1] * light), Math.min(255, base[2] * light)],
      paper: [248, 246, 240], rng: rng,
      reach: 4, layers: 2, bleed: bleed, pigment: Math.max(5, pig - 5), edge: 0.3,
      bloom: 0.35, grain: grain, outline: false, shadow: false,
    });
    placed++;
  }
  ctx.restore();

  // --- overlay the line drawing (ink stays; white lets colour show) ---
  if (img) {
    blendMode(MULTIPLY);
    image(img, OX, OY, S, S);
    blendMode(BLEND);
  } else {
    noStroke();
    fill(120, 116, 108);
    textAlign(CENTER, CENTER);
    textSize(Math.max(13, S * 0.022));
    text('drop a tree line-drawing here (PNG)  ·  or save it as tree.png', width / 2, OY + S * 0.06);
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-tree-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
