// Horses under a crescent moon — a copy, in code, of a watercolour and pencil sheet
// (a herd of pale and dark horses in a green night wood, eclipse-like moon, white tree).
// The composition is a transcription: trace.py reads the source into ~4 800 colour
// passages (data.js: outline, pigment, how hard each edge dried) and the graphite
// underdrawing. Nothing here displays the source image; the sheet is REPAINTED as
// watercolour: flat first wash → every passage laid again wet, its edge as soft or as
// crisp as it dried → pooled pigment rims on the wet-on-dry shapes → drifting wash
// density, granulation in the paper's tooth, dry sparkle → pencil catching on the tooth.
// The seed changes the HAND (edge wobble, pooling, grain, pencil pressure), never the composition.
// Keys: R new hand · S save PNG (full 2000 px sheet).

let G, R, PG, dirty = true;
const W = SRC_W, H = SRC_H;
const PAPER = [247, 243, 230];
const OFF = 8192;                               // shadows are cast from off-sheet: only the blurred wash lands

function setup() {
  fit();
  PG = createGraphics(W, H); PG.pixelDensity(1);
  G = GenArt.create({
    title: 'Horses under a crescent moon',
    params: {
      wet: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'wetness (soft edges)' },
      pool: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'edge pooling' },
      gran: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'granulation' },
      pencil: { value: 1, min: 0, max: 2, step: 0.1, label: 'pencil' },
      wobble: { value: 1, min: 0, max: 3, step: 0.1, label: 'hand wobble' },
    },
    onReset: () => { dirty = true; redraw(); },
  });
  noLoop();
}

function draw() {
  if (dirty) { paintAll(); dirty = false; }
  background(11, 11, 14);
  image(PG, 0, 0, width, height);
}

function fit() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  const s = Math.min(windowWidth / W, windowHeight / H);
  createCanvas(Math.floor(W * s), Math.floor(H * s));
}
function windowResized() { fit(); redraw(); }     // the sheet is cached: a resize never repaints it
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') save(PG, 'horses-study-' + G.seed + '.png');
}

// ───────────────────────── helpers ─────────────────────────
const rnd = (a = 1, b) => (b === undefined ? R() * a : a + R() * (b - a));
const css = (c, a = 1) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the hand: a position-keyed drift, so an edge shared by two passages moves as one and never gaps
let AMP = 1;
function hx(x, y) { return x + (noise(x * 0.017, y * 0.017, 3.1) - 0.5) * AMP * 4 + (noise(x * 0.09, y * 0.09, 9.7) - 0.5) * AMP * 0.8; }
function hy(x, y) { return y + (noise(x * 0.017, y * 0.017, 17.3) - 0.5) * AMP * 4 + (noise(x * 0.09, y * 0.09, 23.9) - 0.5) * AMP * 0.8; }
function handFlat(f) {
  const o = new Float32Array(f.length);
  for (let i = 0; i < f.length; i += 2) { o[i] = hx(f[i], f[i + 1]); o[i + 1] = hy(f[i], f[i + 1]); }
  return o;
}

// closed brush-rounded path: quadratic through the edge midpoints
function tracePath(ctx, p) {
  const n = p.length;
  ctx.beginPath();
  ctx.moveTo((p[n - 2] + p[0]) / 2, (p[n - 1] + p[1]) / 2);
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[j]) / 2, (p[i + 1] + p[j + 1]) / 2);
  }
  ctx.closePath();
}

// smooth value noise field, w×h, feature size `cell`, values −1…1
function field(w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell, y0 = fy | 0; let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell, x0 = fx | 0; let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
      const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
      o[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return o;
}

// ───────────────────────── the painting ─────────────────────────
function paintAll() {
  R = G.rng;
  randomSeed(G.seed); noiseSeed(G.seed);
  AMP = G.param('wobble');
  const wet = G.param('wet'), pool = G.param('pool');
  const ctx = PG.drawingContext;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowColor = 'transparent'; ctx.setLineDash([]);
  ctx.fillStyle = css(PAPER); ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = ctx.lineCap = 'round';

  const shapes = REGIONS.map(r => ({ area: r[0], col: r[1], hard: r[2] / 9, p: handFlat(r[3]) }));

  // 1 · first wash: every passage flat, a hair over its outline so no paper leaks at the seams
  for (const s of shapes) {
    tracePath(ctx, s.p);
    ctx.fillStyle = ctx.strokeStyle = css(s.col); ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
  }

  // 2 · the same passages laid wet, largest first: the softer the edge dried, the further it bleeds
  ctx.save();
  ctx.translate(-OFF, 0); ctx.shadowOffsetX = OFF;
  for (const s of shapes) {
    const soft = Math.pow(1 - s.hard, 2);
    const b = Math.min((0.25 + 10 * soft) * wet, 0.22 * Math.sqrt(s.area));
    if (b < 0.4) continue;
    tracePath(ctx, s.p);
    ctx.shadowColor = css(s.col); ctx.shadowBlur = b * 2; ctx.fillStyle = '#000';
    ctx.fill();
  }
  ctx.restore();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;

  // 3 · wet-on-dry shapes: pigment carried to the rim as the puddle dried — a darker, broken inner line
  if (pool > 0) {
    ctx.globalCompositeOperation = 'multiply';
    for (const s of shapes) {
      if (s.hard < 0.45 || s.area < 300 || s.area > 60000) continue;
      const a = Math.min(1, (0.10 + 0.22 * s.hard) * pool * rnd(0.6, 1.3));
      ctx.save();
      tracePath(ctx, s.p); ctx.clip();
      ctx.strokeStyle = css(mixc(s.col, [255, 255, 255], 0.45), a * 0.6);
      ctx.lineWidth = rnd(5, 9); ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = css(mixc(s.col, [255, 255, 255], 0.3), a);
      ctx.lineWidth = rnd(1.6, 3.2);
      ctx.setLineDash([rnd(30, 140), rnd(8, 60), rnd(15, 90), rnd(20, 120)]); ctx.lineDashOffset = rnd(300);
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 4 · paper: drifting wash density, pigment settling in the tooth, dry sparkle on the peaks
  const tooth = surface(ctx);

  // 5 · graphite underdrawing, showing through the washes and skipping over the tooth
  graphite(ctx, tooth);
}

function surface(ctx) {
  const gran = G.param('gran');
  const fine = field(W, H, 1.7), mid = field(W, H, 4.5), drift = field(W, H, 120), cockle = field(W, H, 420);
  const tooth = new Float32Array(W * H);
  const im = ctx.getImageData(0, 0, W, H), d = im.data;
  let h = (G.seed | 0) ^ 0x9e3779b9;
  for (let i = 0, k = 0; i < W * H; i++, k += 4) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + i | 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    const white = ((h >>> 0) / 4294967296) * 2 - 1;
    const t = tooth[i] = fine[i] * 0.6 + mid[i] * 0.3 + white * 0.3;
    const load = 1 - Math.min(d[k], d[k + 1], d[k + 2]) / 255;          // how much pigment sits here
    let e = 1 + gran * (t * (0.035 + 0.12 * load) + drift[i] * 0.07 + cockle[i] * 0.04);
    const spark = t < -0.7 ? gran * (-0.7 - t) * 0.8 * load : 0;      // peaks the brush skipped
    for (let c = 0; c < 3; c++) {
      let v = 255 * Math.pow(d[k + c] / 255, e);
      v += (PAPER[c] - v) * Math.min(0.5, spark);
      d[k + c] = v * (1 + white * 0.006 * gran);
    }
  }
  ctx.putImageData(im, 0, 0);
  return tooth;
}

function graphite(ctx, tooth) {
  const amt = G.param('pencil');
  if (amt <= 0) return;
  ctx.globalCompositeOperation = 'multiply';
  for (const l of PENCIL) {
    const p = handFlat(l), press = rnd(0.45, 1);
    for (let pass = 0; pass < 2; pass++) {
      const ox = rnd(-0.5, 0.5), oy = rnd(-0.5, 0.5);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x0 = p[i] + ox, y0 = p[i + 1] + oy, x1 = p[i + 2] + ox, y1 = p[i + 3] + oy;
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.6));
        for (let j = 0; j < n; j++) {
          const ax = x0 + (x1 - x0) * j / n, ay = y0 + (y1 - y0) * j / n;
          const bx = x0 + (x1 - x0) * (j + 1) / n, by = y0 + (y1 - y0) * (j + 1) / n;
          const t = tooth[Math.min(H - 1, Math.max(0, ay | 0)) * W + Math.min(W - 1, Math.max(0, ax | 0))];
          const a = Math.max(0, 0.34 + t * 0.6) * press * amt * (pass ? 0.35 : 0.6);
          if (a < 0.03) continue;
          ctx.strokeStyle = css([96, 98, 108], Math.min(1, a)); ctx.lineWidth = rnd(0.7, 1.2);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
