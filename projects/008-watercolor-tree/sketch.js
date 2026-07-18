// Watercolor Tree — recognise whole SURFACES, then paint each fully.
//
//   1. binarise the ink;
//   2. flood-fill from the borders → BACKGROUND (paper + sky gaps) — left white;
//   3. classify ink: BOUNDARY ink touches the background (a shape's outer outline)
//      vs INTERNAL ink (veins / decoration inside a shape). Only boundary ink
//      separates surfaces — internal lines are passable, so a whole leaf (interior
//      + its veins) is ONE surface, and the whole trunk is one;
//   4. label those surfaces, colour each by zone/size/shape, and fill every pixel
//      — watercolour comes from a per-surface distance field (edge pool + centre
//      bloom + grain) so coverage is complete. Ink overlaid on top.
//
// Drop a PNG/JPG on the canvas, or save it beside this file as tree.png/tree.jpg.
// Keys: R new colouring · S save PNG.

let G;
let img = null;

// interactive click-to-merge state
let LB = null, MW = 0, MH = 0;   // last segmentation label buffer + dims
let mergePairs = [];             // user-merged label pairs
let pendingLabel = -1;           // first-clicked area, awaiting a second

const PAPER = [248, 246, 240];
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
  c.mousePressed(onClick);

  G = GenArt.create({
    title: 'Watercolor Tree',
    params: {
      pigment: { value: 13,  min: 4,   max: 22,  step: 1,    label: 'pigment' },
      edge:    { value: 0.55, min: 0.0, max: 1.2, step: 0.05, label: 'edge pool' },
      bloom:   { value: 0.35, min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 0.6, min: 0.0, max: 2.0, step: 0.1,  label: 'grain' },
      bleed:   { value: 1.4, min: 0.0, max: 5.0, step: 0.2,  label: 'bleed' },
      merge:   { value: 1,   min: 0,   max: 3,   step: 1,    label: 'merge veins' },
      flowers: { value: 55,  min: 0,   max: 100, step: 5,    label: 'flowers %' },
      outline: { value: 100, min: 0,   max: 100, step: 5,    label: 'outline %' },
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
function hash2(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function buildColoring(rng, pal) {
  const mw = 520;
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

  // background = non-ink reachable from the border
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

  // BOUNDARY ink = ink within `merge` px of the background (a shape's outline).
  // Internal ink (veins, deep inside) stays passable so a whole leaf merges.
  const T = G.param('merge'); // 0 keeps every cell separate; higher merges more
  const bnd = new Uint8Array(N);
  if (T <= 0) {
    for (let i = 0; i < N; i++) bnd[i] = ink[i];
  } else {
    // distance from background, propagated through ink up to T
    for (let i = 0; i < N; i++) if (ink[i]) {
      const x = i % mw, y = (i / mw) | 0;
      if ((x > 0 && bg[i - 1]) || (x < mw - 1 && bg[i + 1]) || (y > 0 && bg[i - mw]) || (y < mh - 1 && bg[i + mw])) bnd[i] = 1;
    }
    for (let t = 1; t < T; t++) {
      const add = [];
      for (let i = 0; i < N; i++) if (ink[i] && !bnd[i]) {
        const x = i % mw, y = (i / mw) | 0;
        if ((x > 0 && bnd[i - 1]) || (x < mw - 1 && bnd[i + 1]) || (y > 0 && bnd[i - mw]) || (y < mh - 1 && bnd[i + mw])) add.push(i);
      }
      for (const i of add) bnd[i] = 1;
    }
  }

  // surface pixels = not background, not boundary ink → label connected surfaces
  const label = new Int32Array(N);
  const info = [null];
  let comp = 0;
  const q = [];
  const isSurf = function (i) { return !bg[i] && !bnd[i]; };
  for (let s = 0; s < N; s++) {
    if (!isSurf(s) || label[s]) continue;
    comp++;
    let area = 0, sx = 0, sy = 0, minx = mw, maxx = 0, miny = mh, maxy = 0;
    q.length = 0; q.push(s); label[s] = comp;
    while (q.length) {
      const i = q.pop(), x = i % mw, y = (i / mw) | 0;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && isSurf(i - 1) && !label[i - 1]) { label[i - 1] = comp; q.push(i - 1); }
      if (x < mw - 1 && isSurf(i + 1) && !label[i + 1]) { label[i + 1] = comp; q.push(i + 1); }
      if (y > 0 && isSurf(i - mw) && !label[i - mw]) { label[i - mw] = comp; q.push(i - mw); }
      if (y < mh - 1 && isSurf(i + mw) && !label[i + mw]) { label[i + mw] = comp; q.push(i + mw); }
    }
    info[comp] = { area: area, cx: sx / area, cy: sy / area, w: maxx - minx + 1, h: maxy - miny + 1 };
  }
  LB = label; MW = mw; MH = mh; // expose for click-to-merge

  // colour each surface
  const minArea = Math.max(8, N * 0.00002);
  const flowerP = G.param('flowers') / 100;
  const col = new Array(comp + 1).fill(null);
  let woodyId = 0, woodyArea = 0;
  for (let c = 1; c <= comp; c++) {
    const it = info[c];
    if (it.area < minArea) continue;
    const ny = it.cy / mh, nx = it.cx / mw;
    const roundv = Math.min(it.w, it.h) / Math.max(it.w, it.h);
    // the tall, large surface that runs from the grass up into the canopy is the
    // woody structure (trunk + branches) → all brown
    if (it.h > mh * 0.42 && it.area > N * 0.012) {
      col[c] = jitter(pal.trunk, rng, 0.08);
      if (it.area > woodyArea) { woodyArea = it.area; woodyId = c; }
    }
    else if (ny > 0.85) col[c] = jitter(pal.grass, rng, 0.12);
    else if (it.area < N * 0.0022 && roundv > 0.5 && rng() < flowerP) col[c] = pal.flowers[Math.floor(rng() * pal.flowers.length)];
    else {
      const b = pal.leaves[Math.floor(rng() * pal.leaves.length)];
      const light = 0.9 + (1 - ny) * 0.22;
      col[c] = jitter([b[0] * light, b[1] * light, b[2] * light], rng, 0.07);
    }
  }

  // carve negative space out of the woody surface: the real wood is one body that
  // reaches the ground; enclosed non-ink pockets that never reach the base are the
  // sky-gaps between branches → leave them white
  const hole = new Uint8Array(N);
  if (woodyId) {
    const lab2 = new Int32Array(N);
    const q2 = [];
    for (let s = 0; s < N; s++) {
      if (label[s] !== woodyId || ink[s] || lab2[s]) continue;
      q2.length = 0; q2.push(s); lab2[s] = 1;
      let maxy = 0, area = 0;
      const idx = [];
      while (q2.length) {
        const i = q2.pop(), x = i % mw, y = (i / mw) | 0;
        area++; idx.push(i); if (y > maxy) maxy = y;
        if (x > 0 && label[i - 1] === woodyId && !ink[i - 1] && !lab2[i - 1]) { lab2[i - 1] = 1; q2.push(i - 1); }
        if (x < mw - 1 && label[i + 1] === woodyId && !ink[i + 1] && !lab2[i + 1]) { lab2[i + 1] = 1; q2.push(i + 1); }
        if (y > 0 && label[i - mw] === woodyId && !ink[i - mw] && !lab2[i - mw]) { lab2[i - mw] = 1; q2.push(i - mw); }
        if (y < mh - 1 && label[i + mw] === woodyId && !ink[i + mw] && !lab2[i + mw]) { lab2[i + mw] = 1; q2.push(i + mw); }
      }
      if (maxy < mh * 0.9 && area > N * 0.0006) for (const i of idx) hole[i] = 1;
    }
  }

  // distance to each surface's edge (boundary ink or background) → watercolour shading
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = (label[i] && col[label[i]] && !hole[i]) ? 1e9 : 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = x + y * mw; if (dist[i] === 0) continue;
    let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + 1);
    if (y > 0) d = Math.min(d, dist[i - mw] + 1);
    if (x > 0 && y > 0) d = Math.min(d, dist[i - mw - 1] + 1.414);
    if (x < mw - 1 && y > 0) d = Math.min(d, dist[i - mw + 1] + 1.414);
    dist[i] = d;
  }
  for (let y = mh - 1; y >= 0; y--) for (let x = mw - 1; x >= 0; x--) {
    const i = x + y * mw; if (dist[i] === 0) continue;
    let d = dist[i];
    if (x < mw - 1) d = Math.min(d, dist[i + 1] + 1);
    if (y < mh - 1) d = Math.min(d, dist[i + mw] + 1);
    if (x < mw - 1 && y < mh - 1) d = Math.min(d, dist[i + mw + 1] + 1.414);
    if (x > 0 && y < mh - 1) d = Math.min(d, dist[i + mw - 1] + 1.414);
    dist[i] = d;
  }

  // apply user click-merges: unify each merged group onto one colour
  const parent = new Int32Array(comp + 1);
  for (let c = 0; c <= comp; c++) parent[c] = c;
  const root = function (a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const m of mergePairs) {
    if (m[0] > 0 && m[1] > 0 && m[0] <= comp && m[1] <= comp) parent[root(m[1])] = root(m[0]);
  }

  const out = createImage(mw, mh);
  out.loadPixels();
  const edge = G.param('edge'), bloom = G.param('bloom'), grainA = G.param('grain') * 0.35;
  const alpha = Math.round(140 + G.param('pigment') * 5);
  const ew = 2 + edge * 7;
  for (let i = 0; i < N; i++) {
    const lb = label[i];
    const rl = lb ? root(lb) : 0;
    const c = (rl && !hole[i]) ? (col[rl] || col[lb]) : null;
    const o = 4 * i;
    if (!c) { out.pixels[o + 3] = 0; continue; }
    const d = dist[i];
    const et = Math.min(1, d / ew);
    const dark = 1 - edge * 0.5 * (1 - et);
    const bt = Math.min(1, Math.max(0, (d - ew * 1.5) / (ew * 3)));
    const gn = 1 + (hash2(i % mw, (i / mw) | 0) - 0.5) * grainA;
    let r = c[0] * dark * gn, gg = c[1] * dark * gn, b = c[2] * dark * gn;
    r += (PAPER[0] - r) * bloom * bt; gg += (PAPER[1] - gg) * bloom * bt; b += (PAPER[2] - b) * bloom * bt;
    out.pixels[o] = clamp255(r); out.pixels[o + 1] = clamp255(gg); out.pixels[o + 2] = clamp255(b); out.pixels[o + 3] = alpha;
  }
  out.updatePixels();
  return out;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  Watercolor.paperTexture(PAPER, Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  if (img) {
    const colImg = buildColoring(rng, pal);
    const bleed = G.param('bleed');
    blendMode(MULTIPLY);
    if (bleed > 0) {
      const gg = createGraphics(colImg.width, colImg.height);
      gg.pixelDensity(1);
      gg.image(colImg, 0, 0);
      gg.filter(BLUR, bleed);
      image(gg, IX, IY, IW, IH);
      gg.remove();
    } else image(colImg, IX, IY, IW, IH);
    blendMode(BLEND);

    const a = G.param('outline') / 100;
    if (a > 0) {
      blendMode(MULTIPLY);
      drawingContext.globalAlpha = a;
      image(img, IX, IY, IW, IH);
      drawingContext.globalAlpha = 1;
      blendMode(BLEND);
    }

    // highlight the first-clicked area while awaiting the second
    if (pendingLabel > 0 && LB) {
      const hl = createImage(MW, MH);
      hl.loadPixels();
      for (let i = 0; i < MW * MH; i++) {
        if (LB[i] === pendingLabel) { hl.pixels[4 * i] = 255; hl.pixels[4 * i + 1] = 232; hl.pixels[4 * i + 2] = 40; hl.pixels[4 * i + 3] = 120; }
        else hl.pixels[4 * i + 3] = 0;
      }
      hl.updatePixels();
      image(hl, IX, IY, IW, IH);
    }

    noStroke();
    fill(150, 146, 138);
    textAlign(LEFT, BOTTOM);
    textSize(13);
    text('click two areas to merge them · press C to clear merges', IX + 4, height - 8);
  } else {
    noStroke();
    fill(120, 116, 108);
    textAlign(CENTER, CENTER);
    textSize(Math.max(13, IW * 0.03));
    text('drop a tree line-drawing here (PNG/JPG)', width / 2, height / 2);
  }
}

// click one area then another to merge them into a single coloured surface
function onClick() {
  if (!img || !LB) return false;
  const bx = Math.floor(((mouseX - IX) / IW) * MW);
  const by = Math.floor(((mouseY - IY) / IH) * MH);
  if (bx < 0 || bx >= MW || by < 0 || by >= MH) return false;
  const L = LB[bx + by * MW];
  if (L <= 0) { pendingLabel = -1; redraw(); return false; } // background / ink
  if (pendingLabel < 0) pendingLabel = L;
  else { if (L !== pendingLabel) mergePairs.push([pendingLabel, L]); pendingLabel = -1; }
  redraw();
  return false;
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-tree-' + G.seed, 'png');
  if (key === 'c' || key === 'C') { mergePairs = []; pendingLabel = -1; redraw(); }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
