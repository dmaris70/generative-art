// Watercolor Tree — colour a line drawing by identifying its areas, then filling.
//
// Proper coloring-book logic: find the regions the ink encloses, then fill each.
//   1. binarise the ink;
//   2. flood-fill from the borders → the BACKGROUND (paper + sky gaps) — leave it;
//   3. every other pixel is inside a cell → label connected components (each leaf,
//      flower, shape is one region);
//   4. give each region a colour by zone/size/shape (green leaves, warm flowers,
//      brown trunk, green grass) and fill it, softened for a watercolour wash.
// The line drawing is then overlaid on top via MULTIPLY.
//
// Drop a PNG/JPG on the canvas, or save it beside this file as tree.png/tree.jpg.
// Keys: R new colouring · S save PNG.

let G;
let img = null;

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
      pigment: { value: 13,  min: 4,   max: 22,  step: 1,   label: 'pigment' },
      flowers: { value: 55,  min: 0,   max: 100, step: 5,   label: 'flowers %' },
      soften:  { value: 1.4, min: 0.0, max: 4.0, step: 0.2, label: 'soften' },
      outline: { value: 100, min: 0,   max: 100, step: 5,   label: 'outline %' },
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

// aspect-aware fit
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

// identify enclosed regions and fill each with a zone/shape-appropriate colour
function buildColoring(rng, pal) {
  const mw = 480;
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

  // 2) background = non-ink pixels reachable from the border
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

  // 3) label connected components of the enclosed pixels
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
    info[comp] = { area: area, cx: sx / area, cy: sy / area, w: maxx - minx + 1, h: maxy - miny + 1 };
  }

  // 4) choose a colour per region
  const minArea = Math.max(6, N * 0.00002);
  const flowerP = G.param('flowers') / 100;
  const col = new Array(comp + 1).fill(null);
  for (let c = 1; c <= comp; c++) {
    const it = info[c];
    if (it.area < minArea) continue;
    const ny = it.cy / mh, nx = it.cx / mw;
    const round = Math.min(it.w, it.h) / Math.max(it.w, it.h);
    if (ny > 0.85) col[c] = jitter(pal.grass, rng, 0.12);
    else if (ny > 0.62 && Math.abs(nx - 0.5) < 0.16) col[c] = jitter(pal.trunk, rng, 0.1);
    else if (it.area < N * 0.0018 && round > 0.5 && rng() < flowerP) col[c] = pal.flowers[Math.floor(rng() * pal.flowers.length)];
    else {
      const b = pal.leaves[Math.floor(rng() * pal.leaves.length)];
      const light = 0.9 + (1 - ny) * 0.22;
      col[c] = jitter([b[0] * light, b[1] * light, b[2] * light], rng, 0.07);
    }
  }

  // 5) paint each region into a colour image
  const out = createImage(mw, mh);
  out.loadPixels();
  const alpha = Math.round(140 + G.param('pigment') * 5);
  for (let i = 0; i < N; i++) {
    const c = label[i], rgb = c ? col[c] : null, o = 4 * i;
    if (rgb) { out.pixels[o] = rgb[0]; out.pixels[o + 1] = rgb[1]; out.pixels[o + 2] = rgb[2]; out.pixels[o + 3] = alpha; }
    else out.pixels[o + 3] = 0;
  }
  out.updatePixels();
  return out;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  Watercolor.paperTexture([248, 246, 240], Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  if (img) {
    const colImg = buildColoring(rng, pal);
    // draw the colour under the ink, softened so region edges read as a wash
    const soft = G.param('soften');
    blendMode(MULTIPLY);
    if (soft > 0) {
      const gg = createGraphics(colImg.width, colImg.height);
      gg.pixelDensity(1);
      gg.image(colImg, 0, 0);
      gg.filter(BLUR, soft);
      image(gg, IX, IY, IW, IH);
      gg.remove();
    } else {
      image(colImg, IX, IY, IW, IH);
    }
    blendMode(BLEND);

    const a = G.param('outline') / 100;
    if (a > 0) {
      blendMode(MULTIPLY);
      drawingContext.globalAlpha = a;
      image(img, IX, IY, IW, IH);
      drawingContext.globalAlpha = 1;
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
