// Herd, recomposed — the 022 copy study taken apart and put back together differently.
// DECOMPOSE: decompose.py splits the traced sheet into its components — ten horses and
// horse-groups, the moon, the white tree, the forest band, two plants, and the ground left
// behind (each lifted passage remembers the ground pigment that closes the hole).
// MORPH: every component instance gets its own flip, stretch, shear, lean, a slow noise warp
// that bends necks and legs, and a coat shift; the ground is warped and the whole sheet is
// moved into a colour regime.  RECOMPOSE: moon, forest, tree, plants and a herd of chosen
// size are placed by rule (forest and tree take opposite sides, horses scale with depth,
// most turn toward the moon) and repainted back to front with the 022 watercolour pipeline.
// `recompose` = 0 gives the source arrangement back; 1 is the new synthesis.
// Keys: R new synthesis · S save PNG (full 2000 px sheet).

let G, R, PG, dirty = true;
const W = SRC_W, H = SRC_H;
const PAPER = [247, 243, 230];
const OFF = 8192;
const REGIMES = [
  { name: 'green night', hue: 0, sat: 1, lit: 1 },
  { name: 'blue hour', hue: 62, sat: 0.85, lit: 0.95 },
  { name: 'viridian deep', hue: 28, sat: 1.0, lit: 0.82 },
  { name: 'olive noon', hue: -30, sat: 0.8, lit: 1.06 },
  { name: 'indigo night', hue: 95, sat: 0.7, lit: 0.8 },
];

function setup() {
  fit();
  PG = createGraphics(W, H); PG.pixelDensity(1);
  G = GenArt.create({
    title: 'Herd, recomposed',
    params: {
      recompose: { value: 1, min: 0, max: 1, step: 0.05, label: 'recompose (0 = source)' },
      morph: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'morph' },
      herd: { value: 0, min: 0, max: 16, step: 1, label: 'herd size (0 = auto)' },
      regime: { value: 0, min: 0, max: REGIMES.length, step: 1, label: 'regime (0 = auto)' },
      wet: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'wetness (soft edges)' },
      pool: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'edge pooling' },
      gran: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'granulation' },
      pencil: { value: 1, min: 0, max: 2, step: 0.1, label: 'pencil' },
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
function windowResized() { fit(); redraw(); }
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') save(PG, 'herd-recomposed-' + G.seed + '.png');
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


// ───────────────────────── colour ─────────────────────────
function rgb2hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const q = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(q[0] + m) * 255, (q[1] + m) * 255, (q[2] + m) * 255];
}
// the world's greens move with the regime; everything else (coats, moon gold, blossoms) keeps its pigment
function world(col, rg, t) {
  const [h, s, l] = rgb2hsl(col), ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const w = ss(48, 78, h) * (1 - ss(188, 218, h)) * ss(0.08, 0.26, s) * t;
  return w ? hsl2rgb(h + rg.hue * w, s * (1 + (rg.sat - 1) * w), l * (1 + (rg.lit - 1) * w)) : col;
}
function coat(col, inst, t) {
  if (!inst.hue && inst.lit === 1) return col;
  const [h, s, l] = rgb2hsl(col);
  return hsl2rgb(h + inst.hue * t, s, l * (1 + (inst.lit - 1) * t));
}

// ───────────────────────── recomposition ─────────────────────────
function anchorOf(p) { const b = p.box; return p.kind === 'moon' ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [(b[0] + b[2]) / 2, b[3]]; }

function compose() {
  const insts = [], by = k => PARTS.filter(p => p.kind === k), name = n => PARTS.find(p => p.name === n);
  const mk = (part, o) => Object.assign({ part, a: anchorOf(part), x: 0, y: 0, sx: 1, sy: 1, flip: 1, rot: 0, shear: 0, hue: 0, lit: 1, amp: 15, o: rnd(1000), extra: false }, o);
  const side = R() < 0.5;                                            // forest left & tree right, or the reverse

  insts.push(mk(name('forest'), { forest: true, side, kx: rnd(0.8, 1.7), ky: rnd(0.95, 1.5), amp: 40, z: -2 }));
  insts.push(mk(name('moon'), { x: W * (side ? rnd(0.38, 0.58) : rnd(0.42, 0.62)), y: rnd(130, 300), sx: 1, rot: rnd(TAU), amp: 6, z: -1 }));
  const ms = rnd(0.65, 1.55), moon = insts[1]; moon.sx = moon.sy = ms;

  const trees = R() < 0.3 ? 2 : 1;
  for (let i = 0; i < trees; i++) {
    const s = i ? rnd(0.5, 0.7) : rnd(0.85, 1.2);
    let x = W * (i ? rnd(0.3, 0.7) : side ? rnd(0.1, 0.27) : rnd(0.73, 0.9));
    if (i && Math.abs(x - moon.x) < 380) x = moon.x + (x < moon.x ? -380 : 380);      // a second tree never stands in the moon
    insts.push(mk(name('tree'), { x, y: i ? rnd(820, 1000) : rnd(1180, 1380), sx: s * rnd(0.9, 1.1), sy: s, flip: R() < 0.5 ? -1 : 1, rot: rnd(-0.05, 0.05), amp: 34, extra: i > 0 }));
  }

  const horses = by('horse'), order = horses.map((h, i) => i).sort(() => R() - 0.5);
  const n = Math.max(G.param('herd') || Math.round(rnd(6, 12)), G.param('recompose') < 0.5 ? horses.length : 0), placed = [];
  for (let i = 0; i < n; i++) {
    const part = horses[order[i % horses.length]], d = (i + rnd(0.1, 0.9)) / n;       // stratified depth
    const s = (0.55 + 0.65 * d) * rnd(0.9, 1.1);
    let x, y = 690 + Math.pow(d, 0.85) * 740;
    for (let k = 0; k < 40; k++) {
      x = W * rnd(0.1, 0.9);
      if (placed.every(q => Math.hypot(q[0] - x, (q[1] - y) * 2.2) > 400 * s)) break;
    }
    placed.push([x, y]);
    const toMoon = Math.sign(moon.x - x) || 1;
    insts.push(mk(part, {
      x, y, sx: s * rnd(0.88, 1.15), sy: s * rnd(0.92, 1.12), flip: (R() < 0.8 ? toMoon : -toMoon) * part.face,
      rot: rnd(-0.11, 0.11), shear: rnd(-0.12, 0.12), hue: rnd(-16, 16), lit: rnd(0.88, 1.06), extra: i >= horses.length,
    }));
  }

  const ps = R() < 0.5;                                               // the two plants take opposite bottom corners
  for (const p of by('plant')) {
    const left = (p.name === 'fronds') === ps, k = R() < 0.25 ? 2 : 1;
    for (let i = 0; i < k; i++) {
      const s = rnd(0.75, 1.25) * (i ? 0.7 : 1), e = i ? rnd(0.22, 0.34) : rnd(0.03, 0.15);
      insts.push(mk(p, { x: W * (left ? e : 1 - e), y: p.name === 'fronds' ? H + rnd(0, 60) : rnd(1300, 1450), sx: s, sy: s * rnd(0.9, 1.2), flip: R() < 0.5 ? -1 : 1, rot: rnd(-0.08, 0.08), hue: rnd(-30, 30), extra: i > 0 }));
    }
  }
  const st = name('stray'), sa = anchorOf(st);                          // fragments no catchment claimed: shown only in the source arrangement
  insts.push(mk(st, { x: sa[0], y: sa[1], amp: 0, z: -3, sourceOnly: true }));
  for (const q of insts) if (q.z === undefined) q.z = q.y;               // back to front by where it stands
  return insts.sort((a, b) => a.z - b.z);
}

// source point → morphed, re-placed point for one instance
function morpher(q, t, M) {
  const f = 1 / 230, A = q.amp * M * 4 * t, [ax, ay] = q.a;
  if (q.forest) {
    const kx = 1 + (q.kx - 1) * t, ky = 1 + (q.ky - 1) * t, flip = q.side && t >= 0.5;
    return (x, y) => {
      const u = (x + (noise(x * f + q.o, y * f, 1.7) - 0.5) * A) * kx, v = (y + (noise(x * f, y * f + q.o, 8.3) - 0.5) * A * 0.4) * ky;
      return [flip ? W - u : u, v];
    };
  }
  const sx = (1 + (q.sx - 1) * t) * (t >= 0.5 ? q.flip : 1), sy = 1 + (q.sy - 1) * t, sh = q.shear * t;
  const c = Math.cos(q.rot * t), s = Math.sin(q.rot * t), px = ax + (q.x - ax) * t, py = ay + (q.y - ay) * t;
  return (x, y) => {
    let u = x - ax + (noise(x * f + q.o, y * f, 1.7) - 0.5) * A, v = y - ay + (noise(x * f, y * f + q.o, 8.3) - 0.5) * A;
    u = u * sx + v * sh; v *= sy;
    return [px + u * c - v * s, py + u * s + v * c];
  };
}
function mapFlat(f, fn) {
  const o = new Float32Array(f.length);
  for (let i = 0; i < f.length; i += 2) { const p = fn(f[i], f[i + 1]); o[i] = hx(p[0], p[1]); o[i + 1] = hy(p[0], p[1]); }
  return o;
}

// ───────────────────────── the painting ─────────────────────────
function paintAll() {
  R = G.rng;
  randomSeed(G.seed); noiseSeed(G.seed);
  AMP = 1;
  const t = G.param('recompose'), M = G.param('morph');
  let hs = Math.imul(G.seed ^ 0x9e3779b9, 0x85ebca6b); hs = Math.imul(hs ^ (hs >>> 13), 0xc2b2ae35); hs ^= hs >>> 16;
  const rg = REGIMES[(G.param('regime') || 1 + (hs >>> 0) % REGIMES.length) - 1];   // hashed: neighbouring seeds must not share a regime
  const insts = compose().filter(q => t >= 0.5 ? !q.sourceOnly : !q.extra);
  const mirror = R() < 0.5 && t >= 0.5, go = rnd(1000), GA = 150 * M * t;
  const gmap = (x, y) => {                                                // the ground: mirrored, slowly warped
    const e = Math.min(1, x / 260, (W - x) / 260) * Math.min(1, y / 260, (H - y) / 260);      // pinned at the sheet's edges
    const u = x + (noise(x / 520 + go, y / 520, 4.2) - 0.5) * GA * 2 * e, v = y + (noise(x / 520, y / 520 + go, 6.6) - 0.5) * GA * 2 * e;
    return [mirror ? W - u : u, v];
  };

  const ctx = PG.drawingContext;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowColor = 'transparent'; ctx.setLineDash([]);
  ctx.lineJoin = ctx.lineCap = 'round';

  // ground = what was left; the lifted components' holes are closed, wet and loose, with their neighbouring pigment
  const ground = GROUND.map(r => ({ area: r[0], col: world(r[1], rg, t), hard: r[2] / 9, p: mapFlat(r[3], gmap) }));
  const holes = [];
  for (const part of PARTS) for (const r of part.regions) if (r[0] > 40) holes.push({ col: world(r[4], rg, t), p: mapFlat(r[3], gmap) });
  underwash(ctx, ground, holes);
  paintGroup(ctx, ground, 1.25);

  const pencil = [];
  for (const q of insts) {
    const fn = morpher(q, t, M), k = Math.abs((1 + (q.sx - 1) * t) * (1 + (q.sy - 1) * t)) || 1;
    paintGroup(ctx, q.part.regions.map(r => ({ area: r[0] * (q.forest ? 1 : k), col: coat(world(r[1], rg, t), q, t), hard: r[2] / 9, p: mapFlat(r[3], fn) })), 1);
    for (const l of q.part.pencil) pencil.push(mapFlat(l, fn));
  }
  const tooth = surface(ctx);
  graphite(ctx, tooth, pencil);
}

// a loose wet first wash under everything, so a warped ground never opens onto bare paper
function underwash(ctx, ground, holes) {
  const big = ground.filter(s => s.area > 1500), k = 8, cv = document.createElement('canvas');
  cv.width = Math.ceil(W / k); cv.height = Math.ceil(H / k);                 // painted small, enlarged: a cheap, very wet blur
  const c = cv.getContext('2d');
  c.fillStyle = css(big[0].col); c.fillRect(0, 0, cv.width, cv.height);
  c.filter = 'blur(6px)';
  for (let i = 0; i < 260; i++) {
    const s = big[Math.floor(R() * big.length)], j = 2 * Math.floor(R() * s.p.length / 2), r = Math.min(260, Math.sqrt(s.area) * 0.8) / k;
    c.fillStyle = css(s.col, 0.8);
    c.beginPath(); c.ellipse(s.p[j] / k, s.p[j + 1] / k, r * rnd(0.8, 1.6), r * rnd(0.6, 1.1), rnd(3.14), 0, 6.2832); c.fill();
  }
  c.filter = 'blur(1.5px)';
  for (const h of holes) {                                                   // the lifted components' places, closed over
    c.fillStyle = c.strokeStyle = css(h.col); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(h.p[0] / k, h.p[1] / k);
    for (let i = 2; i < h.p.length; i += 2) c.lineTo(h.p[i] / k, h.p[i + 1] / k);
    c.closePath(); c.fill(); c.stroke();
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, 0, 0, W, H);
}

// the 022 watercolour pipeline for one group of passages, largest first
function paintGroup(ctx, shapes, wetMul) {
  const wet = G.param('wet') * wetMul, pool = G.param('pool');
  for (const s of shapes) {
    tracePath(ctx, s.p);
    ctx.fillStyle = ctx.strokeStyle = css(s.col); ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
  }
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
  if (pool <= 0) return;
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

function graphite(ctx, tooth, lines) {
  const amt = G.param('pencil');
  if (amt <= 0) return;
  ctx.globalCompositeOperation = 'multiply';
  for (const p of lines) {
    const press = rnd(0.45, 1);
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
