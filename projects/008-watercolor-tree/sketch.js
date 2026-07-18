// Watercolor Tree — identify each area, then paint each with the real module.
//
//   1. binarise the ink;
//   2. flood-fill from the borders → BACKGROUND (paper + sky gaps) — left white;
//   3. label the enclosed pixels into connected components — each leaf, flower,
//      shape, the trunk, each grass blade is its own region;
//   4. trace each region to a polygon and run it through Watercolor.paint(),
//      clipped to the cell, so every area gets true layered watercolour bleed
//      with the full control set (reach, layers, bleed, edge, bloom, grain,
//      unevenness). Ink overlaid on top.
//
// Drop a PNG/JPG on the canvas, or save it beside this file as tree.png/tree.jpg.
// Keys: R new colouring · S save PNG.

let G;
let img = null;

const PAPER = [248, 246, 240];
const MAX_CELLS = 360; // cap paints for performance (largest regions first)
const PALETTES = [
  { leaves: [[96, 132, 64], [120, 152, 78], [74, 108, 56], [142, 162, 86], [102, 138, 70]],
    flowers: [[226, 120, 150], [240, 188, 92], [206, 128, 194], [236, 150, 116], [222, 96, 110]],
    trunk: [120, 84, 52], grass: [98, 130, 62] },
  { leaves: [[140, 178, 98], [168, 198, 118], [116, 158, 84], [192, 206, 124], [148, 184, 106]],
    flowers: [[242, 160, 188], [246, 206, 118], [198, 158, 220], [246, 184, 148], [236, 126, 150]],
    trunk: [126, 92, 58], grass: [134, 172, 94] },
  { leaves: [[196, 128, 54], [176, 94, 48], [214, 166, 64], [156, 104, 52], [186, 138, 68]],
    flowers: [[226, 110, 96], [240, 194, 108], [214, 148, 88], [232, 166, 118], [206, 84, 78]],
    trunk: [108, 72, 44], grass: [156, 142, 76] },
];

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  c.drop(gotFile);

  G = GenArt.create({
    title: 'Watercolor Tree',
    params: {
      pigment: { value: 12,   min: 4,   max: 22,  step: 1,    label: 'pigment' },
      reach:   { value: 3,    min: 2,   max: 6,   step: 1,    label: 'bleed reach' },
      layers:  { value: 2,    min: 1,   max: 4,   step: 1,    label: 'layers' },
      bleed:   { value: 1.3,  min: 0.4, max: 2.6, step: 0.1,  label: 'bleed' },
      edge:    { value: 0.5,  min: 0.0, max: 1.2, step: 0.05, label: 'edge pool' },
      bloom:   { value: 0.4,  min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 0.7,  min: 0.0, max: 2.0, step: 0.1,  label: 'grain' },
      uneven:  { value: 0.15, min: 0.0, max: 1.0, step: 0.05, label: 'unevenness' },
      flowers: { value: 55,   min: 0,   max: 100, step: 5,    label: 'flowers %' },
      outline: { value: 100,  min: 0,   max: 100, step: 5,    label: 'outline %' },
    },
    onReset: function () { redraw(); },
  });

  tryLoad(['tree.png', 'tree.jpg', 'tree.jpeg'], 0);
  redraw();
}

function tryLoad(names, i) {
  if (i >= names.length) return;
  loadImage(names[i], function (im) { img = im; redraw(); }, function () { tryLoad(names, i + 1); });
}
function gotFile(file) {
  if (file && file.type === 'image') loadImage(file.data, function (im) { img = im; redraw(); });
}

let IX = 0, IY = 0, IW = 1, IH = 1;
function computeFit() {
  const iw = img ? img.width : 650;
  const ih = img ? img.height : 841;
  const s = Math.min((width * 0.96) / iw, (height * 0.96) / ih);
  IW = iw * s; IH = ih * s;
  IX = (width - IW) / 2; IY = (height - IH) / 2;
}

function jitter(c, rng, amt) {
  const f = 1 + (rng() * 2 - 1) * amt;
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

// find enclosed regions → list of cells with a traced polygon + colour
function findCells(rng, pal) {
  const mw = 460;
  const mh = Math.max(1, Math.round((mw * img.height) / img.width));
  const N = mw * mh;

  const g = createGraphics(mw, mh);
  g.pixelDensity(1);
  g.image(img, 0, 0, mw, mh);
  g.loadPixels();
  const px = g.pixels;
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) ink[i] = (px[4 * i] + px[4 * i + 1] + px[4 * i + 2]) < 384 ? 1 : 0;
  g.remove();

  const bg = new Uint8Array(N);
  const st = [];
  const seed = function (i) { if (!ink[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < mw; x++) { seed(x); seed(x + (mh - 1) * mw); }
  for (let y = 0; y < mh; y++) { seed(y * mw); seed(mw - 1 + y * mw); }
  while (st.length) {
    const i = st.pop(), x = i % mw, y = (i / mw) | 0;
    if (x > 0) seed(i - 1);
    if (x < mw - 1) seed(i + 1);
    if (y > 0) seed(i - mw);
    if (y < mh - 1) seed(i + mw);
  }

  const label = new Int32Array(N);
  const info = [null];
  let comp = 0;
  const q = [];
  for (let s = 0; s < N; s++) {
    if (ink[s] || bg[s] || label[s]) continue;
    comp++;
    let area = 0, sx = 0, sy = 0, minx = mw, maxx = 0, miny = mh, maxy = 0;
    q.length = 0; q.push(s); label[s] = comp;
    while (q.length) {
      const i = q.pop(), x = i % mw, y = (i / mw) | 0;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && !ink[i - 1] && !bg[i - 1] && !label[i - 1]) { label[i - 1] = comp; q.push(i - 1); }
      if (x < mw - 1 && !ink[i + 1] && !bg[i + 1] && !label[i + 1]) { label[i + 1] = comp; q.push(i + 1); }
      if (y > 0 && !ink[i - mw] && !bg[i - mw] && !label[i - mw]) { label[i - mw] = comp; q.push(i - mw); }
      if (y < mh - 1 && !ink[i + mw] && !bg[i + mw] && !label[i + mw]) { label[i + mw] = comp; q.push(i + mw); }
    }
    info[comp] = { c: comp, area: area, cx: sx / area, cy: sy / area, w: maxx - minx + 1, h: maxy - miny + 1 };
  }

  // keep the largest regions, colour + trace each
  const minArea = Math.max(10, N * 0.00004);
  const kept = [];
  for (let c = 1; c <= comp; c++) if (info[c].area >= minArea) kept.push(info[c]);
  kept.sort(function (a, b) { return b.area - a.area; });
  if (kept.length > MAX_CELLS) kept.length = MAX_CELLS;

  const sX = IW / mw, sY = IH / mh;
  const flowerP = G.param('flowers') / 100;
  const cells = [];
  for (const it of kept) {
    const ny = it.cy / mh, nx = it.cx / mw;
    const roundv = Math.min(it.w, it.h) / Math.max(it.w, it.h);
    let color;
    if (ny > 0.85) color = jitter(pal.grass, rng, 0.12);
    else if (ny > 0.62 && Math.abs(nx - 0.5) < 0.16) color = jitter(pal.trunk, rng, 0.1);
    else if (it.area < N * 0.0018 && roundv > 0.5 && rng() < flowerP) color = pal.flowers[Math.floor(rng() * pal.flowers.length)];
    else {
      const b = pal.leaves[Math.floor(rng() * pal.leaves.length)];
      const light = 0.9 + (1 - ny) * 0.22;
      color = jitter([b[0] * light, b[1] * light, b[2] * light], rng, 0.07);
    }

    // trace the region by casting rays from its centroid (star-convex approx)
    const maxR = 0.5 * Math.max(it.w, it.h) + 3;
    const nRays = it.area > 2500 ? 22 : it.area > 700 ? 16 : 12;
    const poly = [];
    let ok = false;
    for (let k = 0; k < nRays; k++) {
      const a = (k / nRays) * TWO_PI, dx = Math.cos(a), dy = Math.sin(a);
      let lr = 0;
      for (let r = 1; r <= maxR; r++) {
        const bx = Math.round(it.cx + dx * r), by = Math.round(it.cy + dy * r);
        if (bx < 0 || bx >= mw || by < 0 || by >= mh || label[bx + by * mw] !== it.c) break;
        lr = r;
      }
      if (lr > 1) ok = true;
      poly.push({ x: IX + (it.cx + dx * lr) * sX, y: IY + (it.cy + dy * lr) * sY });
    }
    if (!ok) continue;
    cells.push({
      poly: poly,
      cx: IX + it.cx * sX,
      cy: IY + it.cy * sY,
      r: Math.sqrt(it.area / Math.PI) * sX,
      color: color,
    });
  }
  return cells;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  Watercolor.paperTexture(PAPER, Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  if (img) {
    const cells = findCells(rng, pal);
    const ctx = drawingContext;
    const reach = G.param('reach'), layers = G.param('layers'), bleed = G.param('bleed');
    const edge = G.param('edge'), bloom = G.param('bloom'), grain = G.param('grain');
    const uneven = G.param('uneven'), pig = G.param('pigment');

    for (const cell of cells) {
      // clip to a slightly enlarged cell so the outward bleed stays (mostly) in
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < cell.poly.length; i++) {
        const x = cell.cx + (cell.poly[i].x - cell.cx) * 1.12;
        const y = cell.cy + (cell.poly[i].y - cell.cy) * 1.12;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.clip();
      Watercolor.paint({
        base: cell.poly, cx: cell.cx, cy: cell.cy, r: cell.r,
        color: cell.color, paper: PAPER, rng: rng,
        reach: reach, layers: layers, detail: 3, bleed: bleed,
        pigment: pig, edge: edge, bloom: bloom, grain: grain,
        weightVar: uneven, outline: false, shadow: false,
      });
      ctx.restore();
    }

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
    text('drop a tree line-drawing here (PNG/JPG)', width / 2, height / 2);
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
