// Watercolor Painter — turn ANY uploaded image into a watercolour painting.
//
// Same method as the tree colorizer, generalised: segment the image into flat
// regions (colour-quantise + connected components), sample each region's own
// average colour, trace its contour, and paint it with the Watercolor module
// (unclipped bleed). Largest regions first, so it reads back-to-front like a wash
// with objects on top. Works on photos, illustrations, and line art.
//
// Drop a PNG/JPG on the canvas, or save one beside this file as source.(png|jpg).
// Keys: R re-seed the bleed · S save PNG.

let G;
let img = null;

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  c.drop(gotFile);
  G = GenArt.create({
    title: 'Watercolor Painter',
    params: {
      detail:  { value: 5,   min: 1,   max: 12,  step: 1,    label: 'detail' },
      smooth:  { value: 1.6, min: 0.0, max: 5.0, step: 0.2,  label: 'smooth' },
      pigment: { value: 15,  min: 4,   max: 26,  step: 1,    label: 'pigment' },
      edge:    { value: 0.5, min: 0.0, max: 1.2, step: 0.05, label: 'edge pool' },
      bloom:   { value: 0.3, min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 0.7, min: 0.0, max: 2.0, step: 0.1,  label: 'grain' },
      bleed:   { value: 0.4, min: 0.0, max: 3.0, step: 0.1,  label: 'soften' },
      ink:     { value: 90,  min: 0,   max: 100, step: 5,    label: 'ink %' },
      handdrawn:{ value: 0,  min: 0,   max: 4.0, step: 0.2,  label: 'hand-drawn' },
      filledges:{ value: 0,  min: 0,   max: 1,   step: 1,    label: 'fill edges' },
    },
    onReset: function () { redraw(); },
  });
  tryLoad(['source.png', 'source.jpg', 'source.jpeg'], 0);
  redraw();
}

function tryLoad(names, i) {
  if (i >= names.length) return;
  loadImage(names[i], function (im) { img = im; redraw(); }, function () { tryLoad(names, i + 1); });
}
function gotFile(file) { if (file && file.type === 'image') loadImage(file.data, function (im) { img = im; redraw(); }); }

let IX = 0, IY = 0, IW = 1, IH = 1;
function computeFit() {
  const iw = img ? img.width : 4, ih = img ? img.height : 3;
  const s = Math.min((width * 0.96) / iw, (height * 0.96) / ih);
  IW = iw * s; IH = ih * s; IX = (width - IW) / 2; IY = (height - IH) / 2;
}
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function hash2(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function jitter(c, rng, amt) { const f = 1 + (rng() * 2 - 1) * amt; return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]; }

// a harmonious palette for colouring line art (cells with no source colour)
const LINE_PAL = [
  [120, 156, 88], [86, 138, 156], [206, 128, 84], [214, 176, 92], [166, 108, 158],
  [206, 116, 138], [96, 128, 178], [138, 166, 112], [224, 156, 116], [150, 126, 96],
  [92, 150, 138], [190, 140, 180],
];
// re-render the ink with a wobbly noise displacement → hand-drawn outlines
function handDrawnInk(mw, mh, amount) {
  const eg = createGraphics(mw, mh); eg.pixelDensity(1); eg.image(img, 0, 0, mw, mh); eg.loadPixels();
  const sp = eg.pixels, out = createImage(mw, mh); out.loadPixels();
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const dx = (Math.sin(x * 0.09 + y * 0.045) + Math.sin(y * 0.13 + 2)) * amount * 0.5;
    const dy = (Math.sin(y * 0.09 + x * 0.04 + 1) + Math.sin(x * 0.12)) * amount * 0.5;
    let sx = Math.round(x + dx), sy = Math.round(y + dy);
    sx = sx < 0 ? 0 : sx >= mw ? mw - 1 : sx; sy = sy < 0 ? 0 : sy >= mh ? mh - 1 : sy;
    const si = sx + sy * mw, o = 4 * (x + y * mw);
    const dark = (sp[4 * si] + sp[4 * si + 1] + sp[4 * si + 2]) / 3;
    out.pixels[o] = 26; out.pixels[o + 1] = 24; out.pixels[o + 2] = 30;
    out.pixels[o + 3] = dark < 165 ? Math.min(255, (165 - dark) * 2.4) : 0;
  }
  out.updatePixels(); eg.remove(); return out;
}
// detect a line drawing: mostly white, low colour saturation
function isLineArt(px, N) {
  let white = 0, sat = 0, n = 0;
  for (let i = 0; i < N; i += 7) { const r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2];
    sat += Math.max(r, g, b) - Math.min(r, g, b); if (Math.max(r, g, b) > 225) white++; n++; }
  return (sat / n) < 22 && (white / n) > 0.5;
}

// separable box blur on a Float32 channel
function boxBlur(a, w, h, r) {
  if (r < 1) return;
  const t = new Float32Array(w * h), n = 1 / (2 * r + 1), cl = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[cl(x, 0, w - 1) + y * w];
    for (let x = 0; x < w; x++) { t[x + y * w] = s * n; s += a[cl(x + r + 1, 0, w - 1) + y * w] - a[cl(x - r, 0, w - 1) + y * w]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[x + cl(y, 0, h - 1) * w];
    for (let y = 0; y < h; y++) { a[x + y * w] = s * n; s += t[x + cl(y + r + 1, 0, h - 1) * w] - t[x + cl(y - r, 0, h - 1) * w]; } }
}

function draw() {
  randomSeed(G.seed); noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  Watercolor.paperTexture([248, 246, 240], Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  if (!img) {
    noStroke(); fill(120, 116, 108); textAlign(CENTER, CENTER); textSize(18);
    text('drop any image here (PNG/JPG) to watercolour it', width / 2, height / 2); return;
  }

  const mw = 540, mh = Math.max(1, Math.round((mw * img.height) / img.width)), N = mw * mh;
  const g = createGraphics(mw, mh); g.pixelDensity(1); g.image(img, 0, 0, mw, mh); g.loadPixels();
  const px = g.pixels;
  const lineart = isLineArt(px, N);
  const label = new Int32Array(N); const info = [null]; let comp = 0; const stack = [];

  if (lineart) {
    // LINE ART: ink = dark; background = non-ink reachable from the border; each
    // enclosed cell → a palette colour (the drawing's own line-art coloring book)
    const ink = new Uint8Array(N), bg = new Uint8Array(N);
    for (let i = 0; i < N; i++) ink[i] = (px[4 * i] + px[4 * i + 1] + px[4 * i + 2]) < 384 ? 1 : 0;
    // 'fill edges' off → the border-connected white is background (left blank);
    // on → skip it, so cut-off cells at the margins get coloured too
    if (G.param('filledges') <= 0) {
      const seed = function (i) { if (!ink[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
      for (let x = 0; x < mw; x++) { seed(x); seed(x + (mh - 1) * mw); }
      for (let y = 0; y < mh; y++) { seed(y * mw); seed(mw - 1 + y * mw); }
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0; if (x > 0) seed(i - 1); if (x < mw - 1) seed(i + 1); if (y > 0) seed(i - mw); if (y < mh - 1) seed(i + mw); }
    }
    for (let s = 0; s < N; s++) {
      if (ink[s] || bg[s] || label[s]) continue; comp++;
      let area = 0; stack.length = 0; stack.push(s); label[s] = comp;
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0; area++;
        if (x > 0 && !ink[i - 1] && !bg[i - 1] && !label[i - 1]) { label[i - 1] = comp; stack.push(i - 1); }
        if (x < mw - 1 && !ink[i + 1] && !bg[i + 1] && !label[i + 1]) { label[i + 1] = comp; stack.push(i + 1); }
        if (y > 0 && !ink[i - mw] && !bg[i - mw] && !label[i - mw]) { label[i - mw] = comp; stack.push(i - mw); }
        if (y < mh - 1 && !ink[i + mw] && !bg[i + mw] && !label[i + mw]) { label[i + mw] = comp; stack.push(i + mw); }
      }
      info[comp] = { c: comp, area: area, col: jitter(LINE_PAL[Math.floor(rng() * LINE_PAL.length)], rng, 0.12) };
    }
  } else {
    // PHOTO / COLOURED: smooth → colour-quantise → connected components; sample avg
    const R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);
    for (let i = 0; i < N; i++) { R[i] = px[4 * i]; Gc[i] = px[4 * i + 1]; B[i] = px[4 * i + 2]; }
    const sm = Math.round(G.param('smooth')); boxBlur(R, mw, mh, sm); boxBlur(Gc, mw, mh, sm); boxBlur(B, mw, mh, sm);
    const levels = 2 + G.param('detail'), q = 255 / (levels - 1), key = new Int32Array(N);
    for (let i = 0; i < N; i++) key[i] = (Math.round(R[i] / q) << 16) | (Math.round(Gc[i] / q) << 8) | Math.round(B[i] / q);
    for (let s = 0; s < N; s++) {
      if (label[s]) continue; comp++; const k = key[s];
      let area = 0, sr = 0, sg = 0, sb = 0; stack.length = 0; stack.push(s); label[s] = comp;
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0;
        area++; sr += px[4 * i]; sg += px[4 * i + 1]; sb += px[4 * i + 2];
        if (x > 0 && !label[i - 1] && key[i - 1] === k) { label[i - 1] = comp; stack.push(i - 1); }
        if (x < mw - 1 && !label[i + 1] && key[i + 1] === k) { label[i + 1] = comp; stack.push(i + 1); }
        if (y > 0 && !label[i - mw] && key[i - mw] === k) { label[i - mw] = comp; stack.push(i - mw); }
        if (y < mh - 1 && !label[i + mw] && key[i + mw] === k) { label[i + mw] = comp; stack.push(i + mw); }
      }
      info[comp] = { c: comp, area: area, col: [sr / area, sg / area, sb / area] };
    }
  }

  g.remove();

  // distance to the nearest region boundary → drives edge pooling / centre bloom
  const bcx = [], edge = G.param('edge'), bloom = G.param('bloom'), grainA = G.param('grain') * 0.35;
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = i % mw, y = (i / mw) | 0; let b = false;
    if (x > 0 && label[i - 1] !== label[i]) b = true; else if (x < mw - 1 && label[i + 1] !== label[i]) b = true;
    else if (y > 0 && label[i - mw] !== label[i]) b = true; else if (y < mh - 1 && label[i + mw] !== label[i]) b = true;
    dist[i] = b ? 0 : 1e9; }
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = x + y * mw; if (dist[i] === 0) continue; let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) d = Math.min(d, dist[i - mw] + 1);
    if (x > 0 && y > 0) d = Math.min(d, dist[i - mw - 1] + 1.414); if (x < mw - 1 && y > 0) d = Math.min(d, dist[i - mw + 1] + 1.414); dist[i] = d; }
  for (let y = mh - 1; y >= 0; y--) for (let x = mw - 1; x >= 0; x--) { const i = x + y * mw; if (dist[i] === 0) continue; let d = dist[i];
    if (x < mw - 1) d = Math.min(d, dist[i + 1] + 1); if (y < mh - 1) d = Math.min(d, dist[i + mw] + 1);
    if (x < mw - 1 && y < mh - 1) d = Math.min(d, dist[i + mw + 1] + 1.414); if (x > 0 && y < mh - 1) d = Math.min(d, dist[i + mw - 1] + 1.414); dist[i] = d; }

  // one shaded region-colour image → correct colours, no cross-region multiply
  const out = createImage(mw, mh); out.loadPixels();
  const pig = G.param('pigment'), alpha = Math.round(150 + pig * 5), ewb = 2 + edge * 8;
  for (let i = 0; i < N; i++) {
    const o = 4 * i, lb = label[i];
    if (!lb) { out.pixels[o + 3] = 0; continue; } // ink / background → paper
    const c = info[lb].col;
    // wobble the edge width with noise so the pooled rim reads organic, not clean
    const ew = ewb * (0.6 + 0.8 * ((Math.sin((i % mw) * 0.7) + Math.sin(((i / mw) | 0) * 0.7)) * 0.25 + 0.5));
    const d = dist[i], et = Math.min(1, d / ew), dk = 1 - edge * 0.45 * (1 - et);
    const bt = Math.min(1, Math.max(0, (d - ew * 1.4) / (ew * 5)));
    const gn = 1 + (hash2(i % mw, (i / mw) | 0) - 0.5) * grainA;
    let r = c[0] * dk * gn, gg = c[1] * dk * gn, b = c[2] * dk * gn;
    r += (248 - r) * bloom * bt; gg += (246 - gg) * bloom * bt; b += (240 - b) * bloom * bt;
    out.pixels[o] = clamp255(r); out.pixels[o + 1] = clamp255(gg); out.pixels[o + 2] = clamp255(b); out.pixels[o + 3] = alpha;
  }
  out.updatePixels();
  const soft = G.param('bleed');
  blendMode(MULTIPLY);
  if (soft > 0.05) { const gg2 = createGraphics(mw, mh); gg2.pixelDensity(1); gg2.image(out, 0, 0); gg2.filter(BLUR, soft); image(gg2, IX, IY, IW, IH); gg2.remove(); }
  else image(out, IX, IY, IW, IH);
  blendMode(BLEND);

  // ink overlay — 'ink %' opacity; 'hand-drawn' wobbles the lines
  const ee = G.param('ink') / 100, hd = G.param('handdrawn');
  if (ee > 0) {
    if (lineart) {
      const inkImg = hd > 0 ? handDrawnInk(mw, mh, hd) : img;
      blendMode(MULTIPLY); drawingContext.globalAlpha = ee; image(inkImg, IX, IY, IW, IH); drawingContext.globalAlpha = 1; blendMode(BLEND);
    } else if (ee > 0) {
      const eg = createGraphics(mw, mh); eg.pixelDensity(1); eg.image(img, 0, 0, mw, mh); eg.loadPixels();
      const ep = eg.pixels; const eo = createImage(mw, mh); eo.loadPixels();
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = x + y * mw, o = 4 * i;
        if (x === 0 || y === 0 || x === mw - 1 || y === mh - 1) { eo.pixels[o + 3] = 0; continue; }
        const gx = (ep[4 * (i + 1)] - ep[4 * (i - 1)]), gy = (ep[4 * (i + mw)] - ep[4 * (i - mw)]);
        const m = Math.min(255, Math.abs(gx) + Math.abs(gy));
        eo.pixels[o] = 30; eo.pixels[o + 1] = 28; eo.pixels[o + 2] = 34; eo.pixels[o + 3] = m > 40 ? m : 0;
      }
      eo.updatePixels(); eg.remove();
      blendMode(MULTIPLY); drawingContext.globalAlpha = ee; image(eo, IX, IY, IW, IH); drawingContext.globalAlpha = 1; blendMode(BLEND);
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-painting-' + G.seed, 'png');
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); redraw(); }
