/* oil.js — oil-on-linen surface for 2D-canvas p5 sketches (extracted from projects/021-crescent-study).
 *
 * Contract: the sketch declares these globals before painting —
 *   G (GenArt instance with params brush / weave / cracks), R (rng function), S (canvas scale),
 *   LW (hand-wobble amount), W, H (source-space size).
 * oil(poly, col, o)      opaque passage; o.dense = poly is already a dense polyline; o.clips = [{polys, rule}]
 * craquelure(pts)        age cracks, stains, grime in a white passage
 * ground(col) / halo(list, col) / linen()
 * p5 name traps: never call helpers box, line, shape, smooth.
 */
const CRACK = [74, 58, 36];

// ───────────────────────── helpers ─────────────────────────
const rnd = (a = 1, b) => (b === undefined ? R() * a : a + R() * (b - a));
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// open Catmull-Rom through pts, sampled every ~6 px
function crom(pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const k = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
        (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[n - 1]);
  return out;
}

// parts → dense closed polyline; straight edges are subdivided so the hand can move them
function outline(parts) {
  let raw = [];
  for (const p of parts) raw = raw.concat(p.c ? crom(p.c) : [p]);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[(i + 1) % raw.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(L / 9));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}
const ellipsePts = (cx, cy, rx, ry) => {
  const o = [];
  for (let i = 0; i < 120; i++) o.push([cx + Math.cos(i / 120 * TAU) * rx, cy + Math.sin(i / 120 * TAU) * ry]);
  return o;
};

// the hand: a position-keyed drift, so edges shared by two shapes move together and never gap
function hand(pts, amp = 1) {
  const a = amp * LW * 2.6;
  return pts.map(p => [p[0] + (noise(p[0] * 0.021, p[1] * 0.021, 3.1) - 0.5) * a + (noise(p[0] * 0.11, p[1] * 0.11, 9.7) - 0.5) * a * 0.45,
    p[1] + (noise(p[0] * 0.021, p[1] * 0.021, 17.3) - 0.5) * a + (noise(p[0] * 0.11, p[1] * 0.11, 23.9) - 0.5) * a * 0.45]);
}

function trace(pts) {
  const ctx = drawingContext;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
// several closed subpaths in one path (union under 'nonzero', difference under 'evenodd')
function traceAll(polys) {
  const ctx = drawingContext;
  ctx.beginPath();
  for (const pts of polys) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
}
function bounds(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// opaque oil passage: flat body colour, loaded-brush strokes that follow `flow`, thin dragged
// ridges, slow tonal drift, and a soft slightly darker edge where the brush turned round the form
function oil(parts, col, o = {}) {
  const ctx = drawingContext, bw = G.param('brush');
  const pts = hand(Array.isArray(parts[0]) && !parts.some(p => p.c) && o.dense ? parts : outline(parts), o.wob);
  ctx.save();
  if (o.clip) { trace(o.clip); ctx.clip(); }
  for (const c of o.clips || []) { traceAll(c.polys); ctx.clip(c.rule || 'nonzero'); }
  trace(pts);
  ctx.fillStyle = rgba(col, 1);
  ctx.fill();
  if (o.grow) { ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = o.grow * 2; ctx.lineJoin = 'round'; ctx.stroke(); }
  ctx.clip();

  const bb = bounds(pts), area = bb.w * bb.h, vary = (o.vary != null ? o.vary : 0.09) * 1.35;
  const flow = o.flow || ((x, y) => (o.dir || 0) + (noise(x * 0.006, y * 0.006, 41) - 0.5) * 1.6);
  // slow tonal drift (uneven film thickness)
  const m = Math.floor(area / 9000 * bw) + 2;
  for (let i = 0; i < m; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h), r = rnd(40, 130);
    const c = rnd() < 0.5 ? mixc(col, [255, 250, 235], 0.35) : col.map(v => v * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), a = rnd(0.05, 0.14);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // scumble: small soft blotches where the brush deposited more or less paint
  const sc = Math.floor(area / 260 * bw);
  for (let i = 0; i < sc; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h), r = rnd(3, 13);
    const c = rnd() < 0.5 ? mixc(col, o.light || [255, 248, 230], 0.5) : col.map(v => v * 0.6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), a = rnd(0.04, 0.13) * (o.scum || 1);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // brush strokes
  const n = Math.min(2600, Math.floor(area / 140 * bw * (o.dense2 || 1)));
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h);
    const k = (rnd() - 0.5) * 2 * vary;
    const c = k > 0 ? mixc(col, o.light || [255, 248, 230], k * 1.3) : col.map(v => v * (1 + k * 1.2));
    const ridge = rnd() < 0.3;
    ctx.strokeStyle = rgba(c, ridge ? rnd(0.12, 0.3) : rnd(0.06, 0.2));
    ctx.lineWidth = ridge ? rnd(0.6, 1.6) : rnd(3, 11);
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rnd(4)), sl = rnd(8, 20) * (o.len || 1);
    for (let s = 0; s < steps; s++) {
      const a = flow(x, y) + rnd(-0.16, 0.16);
      x += Math.cos(a) * sl; y += Math.sin(a) * sl;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // edge: the darker underdrawing / turned brush along the contour
  trace(pts);
  ctx.strokeStyle = rgba(col.map(v => v * 0.55), o.rim != null ? o.rim : 0.3);
  ctx.lineWidth = 3.4; ctx.stroke();
  ctx.restore();
  return pts;
}

// craquelure: branching age cracks inside a lead-white passage, plus grime specks and a dotted dark edge
function craquelure(pts, o = {}) {
  const ctx = drawingContext, k = G.param('cracks'), bb = bounds(pts);
  ctx.save();
  if (o.clip) { trace(o.clip); ctx.clip('evenodd'); }
  trace(pts); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const crack = (x, y, a, len, w, depth) => {
    ctx.beginPath(); ctx.moveTo(x, y);
    let run = 0;
    const kids = [];
    while (run < len) {
      const sl = rnd(7, 18);
      a += rnd(-0.34, 0.34) + (rnd() < 0.16 ? rnd(-1.2, 1.2) : 0);
      x += Math.cos(a) * sl; y += Math.sin(a) * sl; run += sl;
      ctx.lineTo(x, y);
      if (depth < 2 && rnd() < 0.09) kids.push([x, y, a + (rnd() < 0.5 ? 1 : -1) * rnd(1.2, 1.9)]);
    }
    ctx.strokeStyle = rgba(CRACK, rnd(0.3, 0.6)); ctx.lineWidth = w; ctx.stroke();
    for (const c of kids) crack(c[0], c[1], c[2], len * rnd(0.3, 0.65), w * 0.8, depth + 1);
  };
  const n = Math.floor(bb.w * bb.h / 11000 * k) + 1;
  for (let i = 0; i < n; i++) crack(bb.x + rnd(bb.w), bb.y + rnd(bb.h), rnd(TAU), rnd(90, 300), rnd(0.7, 1.25), 0);
  // warm stains: yellowed oil in the lead white
  for (let i = 0; i < bb.w * bb.h / 5000; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h), r = rnd(20, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), a = rnd(0.05, 0.16);
    g.addColorStop(0, rgba([214, 196, 120], a)); g.addColorStop(1, rgba([214, 196, 120], 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grime in the tooth
  const sp = Math.floor(bb.w * bb.h / 60 * Math.min(1.5, k + 0.3));
  for (let i = 0; i < sp; i++) {
    ctx.fillStyle = rgba(rnd() < 0.5 ? CRACK : [190, 170, 110], rnd(0.08, 0.3));
    ctx.fillRect(bb.x + rnd(bb.w), bb.y + rnd(bb.h), rnd(0.7, 1.9), rnd(0.7, 1.9));
  }
  // broken dark contour
  for (let i = 0; i < pts.length; i++) {
    if (rnd() < 0.55) continue;
    ctx.fillStyle = rgba([40, 40, 25], rnd(0.25, 0.6));
    ctx.fillRect(pts[i][0] + rnd(-1.6, 1.6), pts[i][1] + rnd(-1.6, 1.6), rnd(1, 2.4), rnd(1, 2.4));
  }
  ctx.restore();
}

// scumbled green ground: thin paint dragged mostly vertically over the primed linen
function ground(col) {
  const ctx = drawingContext, bw = G.param('brush');
  const C = { green: col, greenD: col.map(v => v * 0.72), greenL: mixc(col, [255, 255, 235], 0.13).map((v, i) => v + (col[i] > 80 ? 12 : 4)) };
  ctx.fillStyle = rgba(C.green, 1); ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    const x = rnd(W), y = rnd(H), r = rnd(120, 420), c = rnd() < 0.5 ? C.greenL : C.greenD;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r), a = rnd(0.05, 0.16);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineCap = 'round';
  const n = Math.floor(5200 * bw);
  for (let i = 0; i < n; i++) {
    const vert = rnd() < 0.72, x = rnd(W), y = rnd(H), len = rnd(40, 260);
    const c = rnd() < 0.5 ? mixc(C.green, C.greenL, rnd()) : mixc(C.green, C.greenD, rnd());
    ctx.strokeStyle = rgba(c, rnd(0.05, 0.2)); ctx.lineWidth = rnd() < 0.3 ? rnd(0.8, 2) : rnd(4, 16);
    ctx.beginPath(); ctx.moveTo(x, y);
    if (vert) ctx.quadraticCurveTo(x + rnd(-5, 5), y + len / 2, x + rnd(-6, 6), y + len);
    else ctx.quadraticCurveTo(x + len / 2, y + rnd(-5, 5), x + len, y + rnd(-6, 6));
    ctx.stroke();
  }
}

// the ground was cut in around the forms: a slightly fresher green hugs the big contours
function halo(list, col) {
  const ctx = drawingContext, C = { greenL: mixc(col, [255, 255, 235], 0.13).map((v, i) => v + (col[i] > 80 ? 12 : 4)) };
  ctx.save();
  ctx.filter = 'blur(' + (9 * S).toFixed(1) + 'px)';
  ctx.strokeStyle = rgba(C.greenL, 0.3); ctx.lineWidth = 34; ctx.lineJoin = 'round';
  for (const p of list) { trace(p); ctx.stroke(); }
  ctx.restore();
}

// tangent-following flow for the long curved forms
const flowAlong = pts => (x, y) => {
  let best = 1e9, bi = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  const a = pts[bi], b = pts[(bi + 3) % pts.length];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};

// woven linen relief + grain, straight on the pixels (after all paint)
function linen() {
  const amt = G.param('weave');
  if (amt <= 0 || !width || !height) return;
  const d = pixelDensity(), k = S * d, pw = width * d, ph = height * d;
  const p = Math.max(3.3, 2.4 / k);                       // thread pitch in source px; never below ~2.7 device px
  const hsh = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const sd = G.seed | 0;
  // per-thread profiles (warp = columns, weft = rows): slubbed, irregular, never a checker
  const prof = (n, salt) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / k, t = Math.floor(u / p), sl = 0.35 + 1.3 * hsh(t, sd + salt) * (0.4 + hsh(t >> 2, sd + salt + 1));
      o[i] = (Math.pow(Math.abs(Math.sin(Math.PI * u / p)), 1.4) - 0.5) * sl;
    }
    return o;
  };
  const warp = prof(pw, 5), weft = prof(ph, 11);
  loadPixels();
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const thin = r + g + b > 560 ? 0.6 : 1;                         // the whites are fatter paint: less canvas shows
      const patch = 0.55 + 0.9 * noise(x / k * 0.012, y / k * 0.012);   // threads catch unevenly across the canvas
      const grain = (hsh(x + sd, y) - 0.5) * 0.085;
      const f = 1 + (warp[x] * 0.6 + weft[y] * 0.5) * 0.17 * thin * amt * patch + grain;
      // in the blacks the thread tops wear through as pale specks
      const wear = r + g + b < 130 && warp[x] + weft[y] > 0.35 && hsh(y + sd, x) > 0.86 ? 26 * amt : 0;
      pixels[i] = r * f + wear; pixels[i + 1] = g * f + wear; pixels[i + 2] = b * f + wear * 0.85;
    }
  }
  updatePixels();
}
