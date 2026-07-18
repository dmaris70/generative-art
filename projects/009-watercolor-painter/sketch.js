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
      palette: { value: 0,   min: 0,   max: 5,   step: 1,    label: 'palette 0-5' },
      detail:  { value: 5,   min: 1,   max: 12,  step: 1,    label: 'detail' },
      smooth:  { value: 1.6, min: 0.0, max: 5.0, step: 0.2,  label: 'smooth' },
      reach:   { value: 3,   min: 2,   max: 6,   step: 1,    label: 'bleed reach' },
      layers:  { value: 3,   min: 1,   max: 4,   step: 1,    label: 'layers' },
      bleed:   { value: 1.6, min: 0.4, max: 2.4, step: 0.1,  label: 'bleed' },
      pigment: { value: 17,  min: 4,   max: 26,  step: 1,    label: 'pigment' },
      edge:    { value: 0.55,min: 0.0, max: 1.2, step: 0.05, label: 'edge pool' },
      bloom:   { value: 0.15,min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 0.4, min: 0.0, max: 2.0, step: 0.1,  label: 'grain' },
      outline: { value: 1,   min: 0,   max: 1,   step: 1,    label: 'shape outline' },
      texture: { value: 60,  min: 0,   max: 140, step: 10,   label: 'texture (regions)' },
      seal:    { value: 1,   min: 0,   max: 4,   step: 1,    label: 'seal gaps' },
      linesense:{ value: 2,  min: 0,   max: 6,   step: 1,    label: 'line sense' },
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
// integer hash → white-noise grain. A sin-based hash beats into a visible moiré
// grid on large flat regions (the square); this stays organic at any size.
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + G.seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function jitter(c, rng, amt) { const f = 1 + (rng() * 2 - 1) * amt; return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]; }

// default palette for colouring line art; index 0 in PALETTES ('Auto')
const LINE_PAL = [
  [120, 156, 88], [86, 138, 156], [206, 128, 84], [214, 176, 92], [166, 108, 158],
  [206, 116, 138], [96, 128, 178], [138, 166, 112], [224, 156, 116], [150, 126, 96],
  [92, 150, 138], [190, 140, 180],
];
// named palettes: bg = paper/canvas, ink = line colour, colors = cell colours
const PALETTES = [
  { name: 'Auto', bg: [248, 246, 240], ink: [26, 24, 30], colors: LINE_PAL },
  { name: 'Cyber-Noir', bg: [11, 12, 16], ink: [197, 198, 199], colors: [[31, 40, 51], [197, 198, 199], [102, 252, 241], [69, 162, 158]] },
  { name: 'Desert Flow', bg: [234, 231, 220], ink: [70, 62, 56], colors: [[216, 195, 165], [142, 141, 138], [233, 128, 116], [232, 90, 79]] },
  { name: 'Vaporwave', bg: [58, 0, 120], ink: [240, 240, 255], colors: [[181, 123, 255], [255, 102, 178], [152, 255, 237], [255, 244, 163]] },
  { name: 'Mid-Century', bg: [244, 241, 234], ink: [30, 45, 59], colors: [[230, 197, 100], [122, 139, 123], [200, 107, 75], [30, 45, 59]] },
  { name: 'Acid', bg: [8, 8, 8], ink: [235, 235, 235], colors: [[204, 255, 0], [255, 0, 127], [0, 240, 255], [255, 95, 31]] },
];
function nearestPal(c, colors) {
  let best = colors[0], bd = 1e18;
  for (const p of colors) { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
// re-render the ink in inkColor, optionally wobbled by a noise field (hand-drawn)
function buildInk(mw, mh, amount, inkColor) {
  const eg = createGraphics(mw, mh); eg.pixelDensity(1); eg.image(img, 0, 0, mw, mh); eg.loadPixels();
  const sp = eg.pixels, out = createImage(mw, mh); out.loadPixels();
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let sx = x, sy = y;
    if (amount > 0) {
      sx = Math.round(x + (Math.sin(x * 0.09 + y * 0.045) + Math.sin(y * 0.13 + 2)) * amount * 0.5);
      sy = Math.round(y + (Math.sin(y * 0.09 + x * 0.04 + 1) + Math.sin(x * 0.12)) * amount * 0.5);
    }
    sx = sx < 0 ? 0 : sx >= mw ? mw - 1 : sx; sy = sy < 0 ? 0 : sy >= mh ? mh - 1 : sy;
    const si = sx + sy * mw, o = 4 * (x + y * mw);
    const dark = (sp[4 * si] + sp[4 * si + 1] + sp[4 * si + 2]) / 3;
    out.pixels[o] = inkColor[0]; out.pixels[o + 1] = inkColor[1]; out.pixels[o + 2] = inkColor[2];
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

// grow a binary mask outward by r (4-neighbour chebyshev-ish). Used to bridge
// broken hand-drawn lines so the background flood can't leak through a 1px gap.
function dilateMask(mask, mw, mh, r) {
  let cur = mask;
  for (let t = 0; t < r; t++) {
    const nxt = new Uint8Array(cur);
    for (let i = 0; i < cur.length; i++) {
      if (cur[i]) continue;
      const x = i % mw, y = (i / mw) | 0;
      if ((x > 0 && cur[i - 1]) || (x < mw - 1 && cur[i + 1]) || (y > 0 && cur[i - mw]) || (y < mh - 1 && cur[i + mw])) nxt[i] = 1;
    }
    cur = nxt;
  }
  return cur;
}

// Moore-neighbour boundary tracing → a region's actual contour (handles
// concave/pointed shapes). Ported from the tree colorizer.
const MDX = [1, 1, 0, -1, -1, -1, 0, 1];
const MDY = [0, 1, 1, 1, 0, -1, -1, -1];
function traceContour(label, comp, mw, mh, start) {
  let cx = start % mw, cy = (start / mw) | 0, back = 4;
  const sx0 = cx, sy0 = cy, out = [], maxSteps = 8 * (mw + mh) + 64;
  let steps = 0;
  do {
    out.push([cx, cy]);
    let found = -1;
    for (let k = 1; k <= 8; k++) { const d = (back + k) % 8, nx = cx + MDX[d], ny = cy + MDY[d];
      if (nx >= 0 && nx < mw && ny >= 0 && ny < mh && label[nx + ny * mw] === comp) { found = d; break; } }
    if (found < 0) break;
    cx += MDX[found]; cy += MDY[found]; back = (found + 4) % 8; steps++;
  } while (!(cx === sx0 && cy === sy0) && steps < maxSteps);
  return out;
}
// region → canvas polygon: trace its contour, decimate, wind CW so bleed goes out.
// `target` (from the detail param) sets how many points to keep → shape fidelity.
function regionPoly(label, c, s0, mw, mh, target) {
  const raw = traceContour(label, c, mw, mh, s0);
  if (!raw || raw.length < 8) return null;
  const stride = Math.max(1, Math.floor(raw.length / target));
  const sx = IW / mw, sy = IH / mh, pts = [];
  for (let i = 0; i < raw.length; i += stride) pts.push({ x: IX + raw[i][0] * sx, y: IY + raw[i][1] * sy });
  if (pts.length < 6) return null;
  let a2 = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p.x * q.y - q.x * p.y; }
  if (a2 > 0) pts.reverse();
  return pts;
}

// dark-ground texture: build pigment as GLOW (ADD blend) instead of the module's
// MULTIPLY, so bright colours accumulate out of the dark paper. Overlapping inner
// layers → bright core; sparse outer fingers → dim halo that fades into the black.
function paintGlow(poly, color, o) {
  const layers = Watercolor.watercolorize(poly, { reach: o.reach, layers: o.layers, detail: 3, bleed: o.bleed, smooth: o.smooth, rng: o.rng });
  // scale the per-layer add so full overlap converges to roughly the region
  // colour, not white — bright pastel hues (cyan, cream) blow out otherwise.
  const n = layers.length, a = Math.min(255, (o.pigment * 4) / Math.max(1, n));
  blendMode(ADD); noStroke();
  for (let i = 0; i < n; i++) {
    const L = layers[i], j = 0.6 + o.rng() * 0.35;
    fill(color[0] * j, color[1] * j, color[2] * j, a);
    beginShape(); for (const p of L) vertex(p.x, p.y); endShape(CLOSE);
  }
  blendMode(BLEND);
}

function draw() {
  randomSeed(G.seed); noiseSeed(G.seed);
  const rng = Watercolor.makeRng(G.seed);
  const pal = PALETTES[Math.max(0, Math.min(PALETTES.length - 1, Math.round(G.param('palette'))))];
  const paperColor = pal.bg, darkBg = paperColor[0] + paperColor[1] + paperColor[2] < 330;
  Watercolor.paperTexture(paperColor, Watercolor.makeRng(G.seed ^ 0x9e3779b9), { grain: 7 });
  computeFit();

  if (!img) {
    noStroke(); fill(120, 116, 108); textAlign(CENTER, CENTER); textSize(18);
    text('drop any image here (PNG/JPG) to watercolour it', width / 2, height / 2); return;
  }

  let mw = 540, mh = Math.max(1, Math.round((mw * img.height) / img.width)), N = mw * mh;
  let g = createGraphics(mw, mh); g.pixelDensity(1); g.image(img, 0, 0, mw, mh); g.loadPixels();
  let px = g.pixels;
  const lineart = isLineArt(px, N);
  // line art: re-sample at a higher working resolution so thin outlines survive.
  // at 540px a 1-2px line breaks into disconnected dots and the background flood
  // leaks through, leaving the shape blank — the root cause of unpainted surfaces.
  if (lineart) {
    const mw2 = Math.min(1024, Math.max(540, img.width | 0));
    if (mw2 !== mw) {
      g.remove();
      mw = mw2; mh = Math.max(1, Math.round((mw * img.height) / img.width)); N = mw * mh;
      g = createGraphics(mw, mh); g.pixelDensity(1); g.image(img, 0, 0, mw, mh); g.loadPixels(); px = g.pixels;
    }
  }
  const label = new Int32Array(N); const info = [null]; let comp = 0; const stack = [];

  if (lineart) {
    // LINE ART: ink = dark; background = non-ink reachable from the border; each
    // enclosed cell → a palette colour (the drawing's own line-art coloring book)
    // 'line sense': how dark a pixel must be to count as ink. Thin outlines fade
    // to light grey when the image is downscaled, so a higher threshold recovers
    // them as a continuous barrier instead of a broken dotted line.
    const inkThresh = 384 + Math.round(G.param('linesense')) * 48;
    const ink = new Uint8Array(N), bg = new Uint8Array(N);
    for (let i = 0; i < N; i++) ink[i] = (px[4 * i] + px[4 * i + 1] + px[4 * i + 2]) < inkThresh ? 1 : 0;
    // 'fill edges' off → the border-connected white is background (left blank);
    // on → skip it, so cut-off cells at the margins get coloured too
    if (G.param('filledges') <= 0) {
      // 'seal gaps': dilate the ink into a WALL so the border flood can't leak
      // through breaks in wobbly hand-drawn lines. Flood over !wall, then grow the
      // background back by the same radius (clamped to non-ink) so the outer margin
      // still hugs the real outlines while sealed interior pockets become surfaces.
      const seal = Math.round(G.param('seal'));
      const wall = seal > 0 ? dilateMask(ink, mw, mh, seal) : ink;
      const bgD = new Uint8Array(N);
      const seed = function (i) { if (!wall[i] && !bgD[i]) { bgD[i] = 1; stack.push(i); } };
      for (let x = 0; x < mw; x++) { seed(x); seed(x + (mh - 1) * mw); }
      for (let y = 0; y < mh; y++) { seed(y * mw); seed(mw - 1 + y * mw); }
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0; if (x > 0) seed(i - 1); if (x < mw - 1) seed(i + 1); if (y > 0) seed(i - mw); if (y < mh - 1) seed(i + mw); }
      if (seal > 0) { const bgG = dilateMask(bgD, mw, mh, seal); for (let i = 0; i < N; i++) bg[i] = (bgG[i] && !ink[i]) ? 1 : 0; }
      else bg.set(bgD);
    }
    for (let s = 0; s < N; s++) {
      if (ink[s] || bg[s] || label[s]) continue; comp++;
      let area = 0, sx = 0, sy = 0; stack.length = 0; stack.push(s); label[s] = comp;
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0; area++; sx += x; sy += y;
        if (x > 0 && !ink[i - 1] && !bg[i - 1] && !label[i - 1]) { label[i - 1] = comp; stack.push(i - 1); }
        if (x < mw - 1 && !ink[i + 1] && !bg[i + 1] && !label[i + 1]) { label[i + 1] = comp; stack.push(i + 1); }
        if (y > 0 && !ink[i - mw] && !bg[i - mw] && !label[i - mw]) { label[i - mw] = comp; stack.push(i - mw); }
        if (y < mh - 1 && !ink[i + mw] && !bg[i + mw] && !label[i + mw]) { label[i + mw] = comp; stack.push(i + mw); }
      }
      info[comp] = { c: comp, area: area, s0: s, cx: sx / area, cy: sy / area, col: jitter(pal.colors[Math.floor(rng() * pal.colors.length)], rng, 0.1) };
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
      let area = 0, sr = 0, sg = 0, sb = 0, sx = 0, sy = 0; stack.length = 0; stack.push(s); label[s] = comp;
      while (stack.length) { const i = stack.pop(), x = i % mw, y = (i / mw) | 0;
        area++; sr += px[4 * i]; sg += px[4 * i + 1]; sb += px[4 * i + 2]; sx += x; sy += y;
        if (x > 0 && !label[i - 1] && key[i - 1] === k) { label[i - 1] = comp; stack.push(i - 1); }
        if (x < mw - 1 && !label[i + 1] && key[i + 1] === k) { label[i + 1] = comp; stack.push(i + 1); }
        if (y > 0 && !label[i - mw] && key[i - mw] === k) { label[i - mw] = comp; stack.push(i - mw); }
        if (y < mh - 1 && !label[i + mw] && key[i + mw] === k) { label[i + mw] = comp; stack.push(i + mw); }
      }
      const sampled = [sr / area, sg / area, sb / area];
      info[comp] = { c: comp, area: area, s0: s, cx: sx / area, cy: sy / area, col: pal.name === 'Auto' ? sampled : nearestPal(sampled, pal.colors) };
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

  // one shaded region-colour image → correct colours, no cross-region multiply.
  // on dark grounds WITH glow texture, keep the base dim (a faint ground) so the
  // ADD glow builds the bright cores instead of the base blowing out to white.
  const nTexEarly = Math.round(G.param('texture'));
  const out = createImage(mw, mh); out.loadPixels();
  const pig = G.param('pigment');
  const alpha = (darkBg && nTexEarly > 0) ? Math.round(60 + pig * 2) : Math.round(150 + pig * 5);
  const ewb = 2 + edge * 8;
  for (let i = 0; i < N; i++) {
    const o = 4 * i, lb = label[i];
    if (!lb) { out.pixels[o + 3] = 0; continue; } // ink / background → paper
    const c = info[lb].col;
    // wobble the edge width with smooth Perlin noise so the pooled rim reads
    // organic — a sin(x)+sin(y) wobble beats into a diamond grid on flat regions
    const ew = ewb * (0.6 + 0.8 * noise((i % mw) * 0.05, ((i / mw) | 0) * 0.05));
    const d = dist[i], et = Math.min(1, d / ew), dk = 1 - edge * 0.45 * (1 - et);
    const bt = Math.min(1, Math.max(0, (d - ew * 1.4) / (ew * 5)));
    const gn = 1 + (hash2(i % mw, (i / mw) | 0) - 0.5) * grainA;
    // bloom pulls toward a lighter tint of the paper (works on dark palettes too)
    const bl = darkBg ? [Math.min(255, c[0] * 1.4 + 40), Math.min(255, c[1] * 1.4 + 40), Math.min(255, c[2] * 1.4 + 40)] : paperColor;
    let r = c[0] * dk * gn, gg = c[1] * dk * gn, b = c[2] * dk * gn;
    r += (bl[0] - r) * bloom * bt; gg += (bl[1] - gg) * bloom * bt; b += (bl[2] - b) * bloom * bt;
    out.pixels[o] = clamp255(r); out.pixels[o + 1] = clamp255(gg); out.pixels[o + 2] = clamp255(b); out.pixels[o + 3] = alpha;
  }
  out.updatePixels();
  // flat underpainting: full coverage + correct colours for every region (no gaps).
  // dark backgrounds draw normally (MULTIPLY would just crush the bright hues).
  blendMode(darkBg ? BLEND : MULTIPLY);
  image(out, IX, IY, IW, IH);
  blendMode(BLEND);

  // REAL watercolour texture — paint the largest regions over the flat base:
  // progressive evolution bleed, lobed fingered rims, granulation, drawn as crisp
  // vector polygons at canvas resolution (not the 540px upscale). Largest first →
  // back-to-front, small objects on top. Light grounds use the module's MULTIPLY
  // build-up; dark grounds use ADD glow so bright hues rise out of the black.
  const nTex = Math.round(G.param('texture'));
  if (nTex > 0) {
    const reach = G.param('reach'), lyr = G.param('layers'), bmag = G.param('bleed');
    // detail → contour point budget (shape fidelity); smooth → module edge
    // rounding. Both now bite on line art too, not just the photo segmentation.
    const cpts = 18 + Math.round(G.param('detail')) * 6;
    const smoothK = Math.min(0.49, 0.16 + G.param('smooth') * 0.06);
    const sxs = IW / mw, sys = IH / mh, list = [];
    for (let c = 1; c <= comp; c++) { const it = info[c]; if (it && it.col && it.area > N * 0.00004) list.push(c); }
    list.sort(function (a, b) { return info[b].area - info[a].area; });
    const lim = Math.min(nTex, list.length);
    // weightVar/preEvolutions → the bleed pools unevenly on a few sides (mixed
    // wet/dry edges: bold soft lobes on some sides, crisper on others). Safe to
    // push weightVar up now that distort() clamps the outward jut to ~edge length.
    const commonOpts = {
      paper: paperColor, reach: reach, layers: lyr, detail: 3, bleed: bmag, smooth: smoothK,
      pigment: pig, edge: edge, bloom: bloom, grain: G.param('grain'),
      weightVar: 0.85, preEvolutions: 1, outline: G.param('outline') > 0, shadow: false,
    };
    const batch = [];
    for (let k = 0; k < lim; k++) {
      const c = list[k], it = info[c], poly = regionPoly(label, c, it.s0, mw, mh, cpts);
      if (!poly) continue;
      if (darkBg) {
        paintGlow(poly, it.col, { reach: reach, layers: lyr, bleed: bmag, smooth: smoothK, pigment: pig, rng: rng });
      } else {
        // each region gets its own seeded rng so the interleaved draw order below
        // doesn't scramble any single region's appearance (order-independent)
        batch.push({
          base: poly, color: it.col, cx: IX + it.cx * sxs, cy: IY + it.cy * sys,
          r: Math.sqrt(it.area / Math.PI) * sxs, rng: Watercolor.makeRng((G.seed ^ (c * 0x9e3779b1)) >>> 0),
        });
      }
    }
    // INTERLEAVED painting (Tyler Hobbs): draw layer-1 of every region, then
    // layer-2 of every region, … so adjacent regions' bleed fringes intermix at
    // the boundaries instead of one finished region's halo sitting hard on another.
    if (batch.length) Watercolor.paintBatch(batch, commonOpts);
  }

  // ink overlay — 'ink %' opacity; 'hand-drawn' wobbles the lines; colour = palette ink
  const ee = G.param('ink') / 100, hd = G.param('handdrawn');
  if (ee > 0 && lineart) {
    const inkImg = buildInk(mw, mh, hd, pal.ink);
    blendMode(BLEND); drawingContext.globalAlpha = ee; image(inkImg, IX, IY, IW, IH); drawingContext.globalAlpha = 1;
  } else if (ee > 0) {
    const eg = createGraphics(mw, mh); eg.pixelDensity(1); eg.image(img, 0, 0, mw, mh); eg.loadPixels();
    const ep = eg.pixels; const eo = createImage(mw, mh); eo.loadPixels();
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const i = x + y * mw, o = 4 * i;
      if (x === 0 || y === 0 || x === mw - 1 || y === mh - 1) { eo.pixels[o + 3] = 0; continue; }
      const gx = (ep[4 * (i + 1)] - ep[4 * (i - 1)]), gy = (ep[4 * (i + mw)] - ep[4 * (i - mw)]);
      const m = Math.min(255, Math.abs(gx) + Math.abs(gy));
      eo.pixels[o] = pal.ink[0]; eo.pixels[o + 1] = pal.ink[1]; eo.pixels[o + 2] = pal.ink[2]; eo.pixels[o + 3] = m > 40 ? m : 0;
    }
    eo.updatePixels(); eg.remove();
    blendMode(BLEND); drawingContext.globalAlpha = ee; image(eo, IX, IY, IW, IH); drawingContext.globalAlpha = 1;
  }

  // palette name label
  noStroke(); fill(darkBg ? 220 : 120, darkBg ? 220 : 116, darkBg ? 220 : 108);
  textAlign(LEFT, BOTTOM); textSize(13);
  text('palette ' + Math.round(G.param('palette')) + ': ' + pal.name, IX + 4, height - 8);
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-painting-' + G.seed, 'png');
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); redraw(); }
