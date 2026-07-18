// Watercolor Tree — colour a line drawing with the watercolour technique.
//
// Paints watercolour washes (a leafy green canopy with flower accents, a slender
// trunk, a grass band) then overlays a black-line tree drawing on top via
// MULTIPLY, so the ink stays crisp and the colour shows through the white.
//
// Bring your own drawing: DROP a PNG/JPG onto the canvas, or save it next to this
// file as tree.png / tree.jpg and it loads automatically. The colour regions are
// tuned for an upright tree — leafy canopy up top, trunk and grass below.
//
// Keys: R new colouring · S save PNG.

let G;
let img = null;

const PALETTES = [
  { // summer
    leaves: [[92, 128, 62], [116, 148, 74], [70, 104, 54], [138, 158, 84], [98, 134, 68]],
    flowers: [[224, 132, 156], [238, 190, 96], [206, 132, 196], [236, 158, 120]],
    trunk: [112, 80, 50], grass: [96, 126, 60],
  },
  { // spring
    leaves: [[136, 176, 96], [166, 196, 116], [114, 156, 82], [190, 204, 122], [146, 182, 104]],
    flowers: [[240, 168, 190], [244, 208, 120], [200, 160, 220], [246, 186, 150]],
    trunk: [120, 88, 56], grass: [130, 168, 92],
  },
  { // autumn
    leaves: [[204, 132, 56], [180, 96, 50], [216, 168, 66], [156, 104, 52], [190, 140, 70]],
    flowers: [[226, 120, 110], [240, 196, 110], [210, 150, 90], [232, 168, 120]],
    trunk: [104, 70, 44], grass: [150, 138, 74],
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
      foliage: { value: 18,  min: 6,   max: 32,  step: 1,   label: 'foliage' },
      flowers: { value: 6,   min: 0,   max: 16,  step: 1,   label: 'flowers' },
      bleed:   { value: 1.2, min: 0.6, max: 2.2, step: 0.1, label: 'bleed' },
      pigment: { value: 13,  min: 4,   max: 22,  step: 1,   label: 'pigment' },
      trunkW:  { value: 1.0, min: 0.4, max: 2.0, step: 0.1, label: 'trunk width' },
      outline: { value: 100, min: 0,   max: 100, step: 5,   label: 'outline %' },
      grain:   { value: 0.8, min: 0.0, max: 2.0, step: 0.1, label: 'grain' },
    },
    onReset: function () { redraw(); },
  });

  // auto-load a drawing saved beside the sketch (png or jpg)
  tryLoad(['tree.png', 'tree.jpg', 'tree.jpeg'], 0);
  redraw();
}

function tryLoad(names, i) {
  if (i >= names.length) return;
  loadImage(names[i], function (im) { img = im; redraw(); }, function () { tryLoad(names, i + 1); });
}

function gotFile(file) {
  if (file && file.type === 'image') {
    loadImage(file.data, function (im) { img = im; redraw(); });
  }
}

// aspect-aware fit of the drawing into the canvas + mapping helpers
let IX = 0, IY = 0, IW = 1, IH = 1;
function computeFit() {
  const iw = img ? img.width : 650;
  const ih = img ? img.height : 841;
  const s = Math.min((width * 0.96) / iw, (height * 0.96) / ih);
  IW = iw * s; IH = ih * s;
  IX = (width - IW) / 2; IY = (height - IH) / 2;
}
function mx(nx) { return IX + nx * IW; }
function my(ny) { return IY + ny * IH; }
function msx(nr) { return nr * IW; }
function msy(nr) { return nr * IH; }
function msr(nr) { return nr * IW; } // isotropic radius (keeps blobs circular)

function clipPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
}

function domePts(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const b = 1 + 0.16 * (noise(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5) - 0.5) * 2;
    pts.push({ x: cx + Math.cos(a) * rx * b, y: cy + Math.sin(a) * ry * b });
  }
  return pts;
}

function ellipsePts(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];
  const paper = [248, 246, 240];

  Watercolor.paperTexture(paper, Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  const bleed = G.param('bleed');
  const pig = G.param('pigment');
  const grain = G.param('grain');
  const ctx = drawingContext;

  // --- grass band across the bottom ---
  const grassPoly = ellipsePts(mx(0.5), my(0.98), msx(0.55), msy(0.09), 30);
  Watercolor.paint({
    base: grassPoly, cx: mx(0.5), cy: my(0.98), r: msr(0.5),
    color: pal.grass, paper: paper, rng: rng,
    reach: 3, layers: 2, bleed: 1.1, pigment: 8, edge: 0.1, bloom: 0,
    grain: grain * 0.4, outline: false, shadow: false,
  });

  // --- slender trunk ---
  const tw = G.param('trunkW');
  const trunk = [
    { x: mx(0.485 - 0.016 * tw), y: my(0.52) },
    { x: mx(0.53 + 0.016 * tw), y: my(0.52) },
    { x: mx(0.55 + 0.02 * tw), y: my(0.9) },
    { x: mx(0.46 - 0.02 * tw), y: my(0.9) },
  ];
  ctx.save();
  clipPoly(ctx, trunk);
  Watercolor.paint({
    base: trunk, cx: mx(0.5), cy: my(0.7), r: msr(0.1),
    color: pal.trunk, paper: paper, rng: rng,
    reach: 3, layers: 3, bleed: 0.6, pigment: 13, edge: 0.3, bloom: 0.1,
    grain: grain, outline: false, shadow: false,
  });
  ctx.restore();

  // --- canopy: leafy green washes + a few flower accents, clipped to a dome ---
  const dome = domePts(mx(0.5), my(0.31), msx(0.5), msy(0.33), 46);
  ctx.save();
  clipPoly(ctx, dome);
  const nL = G.param('foliage');
  const nF = G.param('flowers');
  let placed = 0, attempts = 0;
  while (placed < nL && attempts < nL * 12) {
    attempts++;
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    if (u * u + v * v > 1) continue;
    const cx = mx(0.5) + u * msx(0.4);
    const cy = my(0.31) + v * msy(0.27);
    const ny = (cy - IY) / IH;
    const r = msr(0.09 + rng() * 0.06);
    const light = 0.86 + (1 - ny) * 0.3;
    const base = pal.leaves[Math.floor(rng() * pal.leaves.length)];
    Watercolor.paint({
      kind: 'circle', cx: cx, cy: cy, r: r,
      color: [Math.min(255, base[0] * light), Math.min(255, base[1] * light), Math.min(255, base[2] * light)],
      paper: paper, rng: rng,
      reach: 4, layers: 2, bleed: bleed, pigment: Math.max(6, pig - 2), edge: 0.28,
      bloom: 0.32, grain: grain, outline: false, shadow: false,
    });
    placed++;
  }
  // flower accents — smaller, warm dabs scattered through the canopy
  let f = 0, fa = 0;
  while (f < nF && fa < nF * 12) {
    fa++;
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    if (u * u + v * v > 1) continue;
    const cx = mx(0.5) + u * msx(0.38);
    const cy = my(0.31) + v * msy(0.26);
    const col = pal.flowers[Math.floor(rng() * pal.flowers.length)];
    Watercolor.paint({
      kind: 'circle', cx: cx, cy: cy, r: msr(0.035 + rng() * 0.03),
      color: col, paper: paper, rng: rng,
      reach: 3, layers: 2, bleed: 1.0, pigment: pig, edge: 0.25, bloom: 0.3,
      grain: grain * 0.5, outline: false, shadow: false,
    });
    f++;
  }
  ctx.restore();

  // --- overlay the line drawing (ink stays; white lets colour show) ---
  // outline % fades the ink: 100 = full black lines, lower = the watercolour
  // dominates with the drawing sitting faintly behind the wash
  if (img) {
    const a = G.param('outline') / 100;
    if (a > 0) {
      blendMode(MULTIPLY);
      ctx.globalAlpha = a;
      image(img, IX, IY, IW, IH);
      ctx.globalAlpha = 1;
      blendMode(BLEND);
    }
  } else {
    noStroke();
    fill(120, 116, 108);
    textAlign(CENTER, CENTER);
    textSize(Math.max(13, IW * 0.03));
    text('drop a tree line-drawing here (PNG/JPG)', width / 2, IY + IH * 0.5);
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
