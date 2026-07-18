// Watercolor Tree — colour a line drawing with the watercolour technique.
//
// Instead of simulating a generic tree, this reads the SHAPE out of the uploaded
// drawing: it downscales the ink, blurs it into a "density field" (dense scribble
// areas — the leafy canopy, the grass — light up; empty sky stays dark), then
// seeds watercolour blobs by rejection-sampling weighted by that density. So the
// paint follows the drawing's real canopy, trunk and grass. Colour is chosen by
// vertical zone (green leaves up top, brown trunk, green grass below, flower
// dabs mixed in). The line drawing is overlaid on top via MULTIPLY.
//
// Drop a PNG/JPG on the canvas, or save it beside this file as tree.png/tree.jpg.
// Keys: R new colouring · S save PNG.

let G;
let img = null;

// density field derived from the drawing
let DENS = null, DW = 0, DH = 0, densForImg = null;

const PALETTES = [
  { leaves: [[92, 128, 62], [116, 148, 74], [70, 104, 54], [138, 158, 84], [98, 134, 68]],
    flowers: [[224, 132, 156], [238, 190, 96], [206, 132, 196], [236, 158, 120]],
    trunk: [112, 80, 50], grass: [96, 126, 60] },
  { leaves: [[136, 176, 96], [166, 196, 116], [114, 156, 82], [190, 204, 122], [146, 182, 104]],
    flowers: [[240, 168, 190], [244, 208, 120], [200, 160, 220], [246, 186, 150]],
    trunk: [120, 88, 56], grass: [130, 168, 92] },
  { leaves: [[204, 132, 56], [180, 96, 50], [216, 168, 66], [156, 104, 52], [190, 140, 70]],
    flowers: [[226, 120, 110], [240, 196, 110], [210, 150, 90], [232, 168, 120]],
    trunk: [104, 70, 44], grass: [150, 138, 74] },
];

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  c.drop(gotFile);

  G = GenArt.create({
    title: 'Watercolor Tree',
    params: {
      density: { value: 90,  min: 15,  max: 200, step: 5,   label: 'paint density' },
      flowers: { value: 8,   min: 0,   max: 24,  step: 1,   label: 'flowers' },
      bleed:   { value: 1.1, min: 0.6, max: 2.0, step: 0.1, label: 'bleed' },
      pigment: { value: 13,  min: 4,   max: 22,  step: 1,   label: 'pigment' },
      outline: { value: 100, min: 0,   max: 100, step: 5,   label: 'outline %' },
      grain:   { value: 0.8, min: 0.0, max: 2.0, step: 0.1, label: 'grain' },
    },
    onReset: function () { redraw(); },
  });

  tryLoad(['tree.png', 'tree.jpg', 'tree.jpeg'], 0);
  redraw();
}

function tryLoad(names, i) {
  if (i >= names.length) return;
  loadImage(names[i], function (im) { img = im; densForImg = null; redraw(); }, function () { tryLoad(names, i + 1); });
}
function gotFile(file) {
  if (file && file.type === 'image') {
    loadImage(file.data, function (im) { img = im; densForImg = null; redraw(); });
  }
}

// aspect-aware fit + mapping
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
function msr(nr) { return nr * IW; }

// ---- density field from the drawing's ink ----
function clampi(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[clampi(x, 0, w - 1) + y * w];
    for (let x = 0; x < w; x++) {
      tmp[x + y * w] = sum * norm;
      sum += a[clampi(x + r + 1, 0, w - 1) + y * w] - a[clampi(x - r, 0, w - 1) + y * w];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[x + clampi(y, 0, h - 1) * w];
    for (let y = 0; y < h; y++) {
      a[x + y * w] = sum * norm;
      sum += tmp[x + clampi(y + r + 1, 0, h - 1) * w] - tmp[x + clampi(y - r, 0, h - 1) * w];
    }
  }
}

function buildDensity() {
  if (densForImg === img && DENS) return;
  const mw = 300;
  const mh = Math.max(1, Math.round((mw * img.height) / img.width));
  const g = createGraphics(mw, mh);
  g.pixelDensity(1);
  g.image(img, 0, 0, mw, mh);
  g.loadPixels();
  const px = g.pixels;
  const d = new Float32Array(mw * mh);
  for (let i = 0; i < mw * mh; i++) {
    d[i] = 1 - (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765; // darkness
  }
  const r = Math.max(2, Math.round(mw * 0.02));
  boxBlur(d, mw, mh, r);
  boxBlur(d, mw, mh, r);
  let mxv = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > mxv) mxv = d[i];
  if (mxv > 0) for (let i = 0; i < d.length; i++) d[i] /= mxv;
  DENS = d; DW = mw; DH = mh; densForImg = img;
  g.remove();
}

// rejection-sample a point (in normalised image coords) within a vertical band,
// weighted by ink density so blobs land where the drawing has content
function sampleDense(y0, y1, thr, rng) {
  for (let t = 0; t < 60; t++) {
    const gx = Math.floor(rng() * DW);
    const gy = clampi(Math.floor((y0 + rng() * (y1 - y0)) * DH), 0, DH - 1);
    const v = DENS[gx + gy * DW];
    if (v > thr && rng() < v) return { nx: gx / DW, ny: gy / DH, v: v };
  }
  return null;
}

function blob(nx, ny, r, col, rng, pig) {
  Watercolor.paint({
    kind: 'circle', cx: mx(nx), cy: my(ny), r: r,
    color: col, paper: [248, 246, 240], rng: rng,
    reach: 4, layers: 2, bleed: G.param('bleed'), pigment: pig,
    edge: 0.28, bloom: 0.32, grain: G.param('grain'), outline: false, shadow: false,
  });
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  Watercolor.paperTexture([248, 246, 240], Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  const pig = G.param('pigment');

  if (img) {
    buildDensity();
    const n = G.param('density');

    // grass band (green) — bottom, follows the drawn grass
    for (let i = 0; i < Math.round(n * 0.35); i++) {
      const p = sampleDense(0.82, 1.0, 0.12, rng);
      if (p) blob(p.nx, p.ny, msr(0.04 + rng() * 0.03), pal.grass, rng, pig - 2);
    }
    // trunk (brown) — below the canopy, follows the drawn trunk lines
    for (let i = 0; i < Math.round(n * 0.18); i++) {
      const p = sampleDense(0.63, 0.9, 0.06, rng);
      if (p) blob(p.nx, p.ny, msr(0.03 + rng() * 0.025), pal.trunk, rng, pig);
    }
    // canopy (green) — upper region, follows the drawn foliage silhouette
    for (let i = 0; i < n; i++) {
      const p = sampleDense(0.0, 0.62, 0.17, rng);
      if (!p) continue;
      const light = 0.86 + (1 - p.ny) * 0.28;
      const base = pal.leaves[Math.floor(rng() * pal.leaves.length)];
      blob(p.nx, p.ny, msr(0.05 + rng() * 0.05),
        [Math.min(255, base[0] * light), Math.min(255, base[1] * light), Math.min(255, base[2] * light)],
        rng, Math.max(6, pig - 2));
    }
    // flower accents — warm dabs at dense spots in the canopy
    for (let i = 0; i < G.param('flowers'); i++) {
      const p = sampleDense(0.05, 0.6, 0.22, rng);
      if (p) blob(p.nx, p.ny, msr(0.025 + rng() * 0.025), pal.flowers[Math.floor(rng() * pal.flowers.length)], rng, pig);
    }
  } else {
    // no drawing yet — prompt
    noStroke();
    fill(120, 116, 108);
    textAlign(CENTER, CENTER);
    textSize(Math.max(13, IW * 0.03));
    text('drop a tree line-drawing here (PNG/JPG)', width / 2, height / 2);
  }

  // overlay the drawing (outline % fades the ink)
  if (img) {
    const a = G.param('outline') / 100;
    if (a > 0) {
      blendMode(MULTIPLY);
      drawingContext.globalAlpha = a;
      image(img, IX, IY, IW, IH);
      drawingContext.globalAlpha = 1;
      blendMode(BLEND);
    }
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
