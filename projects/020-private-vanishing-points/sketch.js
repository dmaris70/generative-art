// Private Vanishing Points — a generative system reverse-engineered from a 1940s
// non-objective gouache (see README.md for the analysis).
// RULE: transparent wash is space, opaque gouache is object; every object is a solid
// extruded toward a vanishing point of its own; one of those points is promoted to a
// SUN, and the corridor between the sun and the central PORTAL is filled by two
// opposed sheaves — a patterned fan opening from the sun, blades closing toward it.
// A THEME is a regime of that rule (paper, ground behaviour, colour roles, densities,
// line), not a recolouring. The seed decides the sheet within the regime.
// Keys: 1–6 theme · T next theme · R new seed · S save PNG.

let G, R, S = 1, LW = 1, T, PAPER;
const W = 1200, H = 893;

const THEMES = [
  { name: 'Non-Objective', paper: [245, 241, 232], ground: 'wet', washK: 1,
    g: { edge: [74, 162, 200], edge2: [52, 136, 188], halo: [250, 224, 150], air: [200, 224, 210], floor: [222, 140, 174], floor2: [204, 104, 152], drift: [236, 204, 70] },
    dark1: [140, 44, 58], dark2: [38, 36, 32], window: [228, 208, 86], accent: [8, 164, 126], accent2: [40, 176, 124],
    brights: [[226, 74, 58], [252, 140, 72], [250, 212, 56], [169, 186, 58], [84, 192, 164], [88, 160, 180], [240, 156, 160], [176, 88, 140]],
    tints: [[233, 186, 198], [208, 112, 136], [196, 128, 150], [150, 186, 200], [176, 190, 214], [158, 204, 214]],
    white: [238, 230, 231], field: [251, 212, 100], sail: [249, 204, 84], beam: [24, 84, 172],
    blades: [[253, 166, 100], [66, 146, 196], [28, 52, 96]], band: [44, 140, 100], stipple: [[226, 60, 50], [236, 84, 60]],
    cap: [186, 213, 84], line: [54, 46, 46], bar: [38, 36, 32], lw: 1.45, wob: 1, varyK: 1,
    nA: 5, nB: 8, whiteRate: 0.33, fanRule: 'harlequin', sats: [3, 5], satR: [26, 52], nBlades: 4, chev: 3, windowKind: 'chevron',
    stip: 1, dots: 1, scale: [160, 185], gran: 1 },
  { name: 'Nocturne', paper: [30, 36, 62], ground: 'scumble', washK: 1,
    g: { edge: [70, 100, 170], edge2: [118, 96, 176], halo: [236, 226, 170], air: [90, 124, 156], floor: [84, 66, 140], floor2: [150, 84, 146], drift: [240, 200, 120] },
    dark1: [74, 44, 108], dark2: [10, 10, 18], window: [244, 226, 150], accent: [40, 190, 190], accent2: [90, 210, 200],
    brights: [[250, 150, 60], [244, 226, 150], [40, 190, 190], [236, 236, 228], [120, 150, 230], [230, 90, 110]],
    tints: [[92, 108, 160], [120, 100, 150], [170, 120, 150], [80, 120, 140], [140, 150, 190], [100, 130, 180]],
    white: [214, 216, 226], field: [22, 70, 90], sail: [44, 64, 124], beam: [244, 226, 150],
    blades: [[250, 150, 60], [120, 150, 230], [236, 236, 228]], band: [30, 110, 110], stipple: [[250, 150, 60], [244, 226, 150]],
    cap: [244, 226, 150], line: [226, 222, 208], bar: [226, 222, 208], lw: 1.1, wob: 0.9, varyK: 1.1,
    nA: 4, nB: 7, whiteRate: 0.2, fanRule: 'harlequin', sats: [4, 6], satR: [18, 38], nBlades: 3, chev: 4, windowKind: 'chevron',
    stip: 1.3, dots: 7, scale: [150, 175], gran: 0.7 },
  { name: 'Fresco', paper: [234, 220, 194], ground: 'wet', washK: 1.1,
    g: { edge: [120, 152, 150], edge2: [96, 122, 112], halo: [232, 190, 120], air: [214, 200, 170], floor: [196, 116, 84], floor2: [164, 84, 62], drift: [210, 170, 80] },
    dark1: [120, 50, 40], dark2: [60, 44, 36], window: [226, 190, 110], accent: [60, 150, 150], accent2: [110, 140, 90],
    brights: [[200, 96, 60], [222, 170, 80], [60, 150, 150], [236, 224, 200], [150, 80, 60], [130, 150, 100]],
    tints: [[224, 190, 160], [200, 150, 130], [190, 170, 140], [170, 180, 160], [210, 200, 180], [180, 160, 150]],
    white: [238, 228, 208], field: [226, 196, 130], sail: [214, 170, 96], beam: [60, 110, 130],
    blades: [[200, 96, 60], [222, 170, 80], [60, 44, 36]], band: [96, 120, 90], stipple: [[200, 96, 60], [236, 224, 200]],
    cap: [170, 170, 90], line: [80, 56, 40], bar: [60, 44, 36], lw: 1.6, wob: 1.5, varyK: 1.6,
    nA: 4, nB: 5, whiteRate: 0.3, fanRule: 'harlequin', sats: [2, 3], satR: [40, 70], nBlades: 3, chev: 2, windowKind: 'nested',
    stip: 0.8, dots: 1, scale: [185, 212], gran: 1.7 },
  { name: 'Glacier', paper: [246, 247, 246], ground: 'wet', washK: 0.7,
    g: { edge: [170, 196, 212], edge2: [150, 176, 200], halo: [226, 234, 238], air: [214, 226, 230], floor: [190, 204, 216], floor2: [160, 180, 200], drift: [220, 226, 230] },
    dark1: [60, 72, 92], dark2: [34, 38, 46], window: [236, 240, 242], accent: [214, 52, 44], accent2: [150, 190, 210],
    brights: [[150, 190, 210], [196, 214, 224], [110, 150, 180], [176, 200, 196], [200, 196, 214], [214, 52, 44]],
    tints: [[222, 228, 232], [204, 214, 222], [214, 210, 224], [206, 222, 216], [190, 204, 216], [228, 230, 226]],
    white: [243, 245, 245], field: [232, 238, 240], sail: [214, 224, 230], beam: [60, 72, 92],
    blades: [[150, 190, 210], [214, 52, 44], [34, 38, 46]], band: [150, 176, 190], stipple: [[110, 150, 180], [214, 52, 44]],
    cap: [196, 214, 224], line: [70, 76, 86], bar: [34, 38, 46], lw: 1.0, wob: 0.6, varyK: 0.7,
    nA: 4, nB: 6, whiteRate: 0.6, fanRule: 'harlequin', sats: [2, 3], satR: [30, 60], nBlades: 3, chev: 2, windowKind: 'stripes',
    stip: 0.4, dots: 1, scale: [140, 165], gran: 1.2 },
  { name: 'Carnival', paper: [248, 240, 230], ground: 'wet', washK: 1.15,
    g: { edge: [170, 110, 200], edge2: [120, 90, 190], halo: [255, 200, 210], air: [190, 236, 214], floor: [250, 120, 160], floor2: [230, 70, 130], drift: [255, 190, 90] },
    dark1: [90, 30, 110], dark2: [30, 24, 40], window: [255, 210, 60], accent: [0, 170, 120], accent2: [250, 90, 150],
    brights: [[250, 70, 140], [0, 170, 120], [140, 80, 200], [255, 140, 50], [255, 220, 70], [40, 190, 210], [240, 60, 60], [150, 210, 70]],
    tints: [[250, 190, 215], [200, 170, 235], [170, 230, 210], [255, 214, 170], [190, 215, 245], [235, 160, 200]],
    white: [250, 238, 240], field: [255, 200, 90], sail: [250, 120, 160], beam: [110, 50, 180],
    blades: [[255, 140, 50], [40, 190, 210], [90, 30, 110]], band: [0, 140, 110], stipple: [[250, 70, 140], [255, 220, 70], [240, 60, 60]],
    cap: [150, 210, 70], line: [40, 30, 50], bar: [30, 24, 40], lw: 1.6, wob: 1.3, varyK: 1.1,
    nA: 6, nB: 10, whiteRate: 0.15, fanRule: 'harlequin', sats: [6, 8], satR: [20, 44], nBlades: 5, chev: 4, windowKind: 'chevron',
    stip: 1.8, dots: 3, scale: [150, 178], gran: 0.9 },
  { name: 'Constructor', paper: [232, 226, 210], ground: 'dry', washK: 1,
    g: { edge: [190, 186, 176], edge2: [160, 156, 150], halo: [226, 210, 180], air: [214, 210, 200], floor: [200, 60, 48], floor2: [60, 56, 54], drift: [226, 200, 120] },
    dark1: [200, 44, 36], dark2: [28, 26, 26], window: [236, 228, 206], accent: [28, 26, 26], accent2: [120, 118, 114],
    brights: [[200, 44, 36], [28, 26, 26], [230, 190, 60], [120, 118, 114]],
    tints: [[196, 192, 182], [160, 156, 150], [214, 208, 192], [180, 176, 170], [226, 220, 204], [140, 138, 134]],
    white: [236, 228, 206], field: [214, 208, 192], sail: [230, 190, 60], beam: [28, 26, 26],
    blades: [[200, 44, 36], [120, 118, 114], [28, 26, 26]], band: [120, 118, 114], stipple: [[28, 26, 26], [200, 44, 36]],
    cap: [230, 190, 60], line: [20, 18, 18], bar: [28, 26, 26], lw: 1.9, wob: 0.25, varyK: 0.5,
    nA: 4, nB: 6, whiteRate: 0.5, fanRule: 'checker', sats: [3, 4], satR: [28, 56], nBlades: 4, chev: 3, windowKind: 'stripes',
    stip: 0.5, dots: 1, scale: [160, 190], gran: 0.5 },
];

function setup() {
  fit();
  pixelDensity(1);
  G = GenArt.create({
    title: 'Private Vanishing Points',
    params: {
      theme: { value: 0, min: 0, max: THEMES.length - 1, step: 1, label: 'theme (1–6)' },
      brush: { value: 1, min: 0, max: 2, step: 0.1, label: 'brushwork' },
      wet: { value: 1, min: 0.3, max: 1.8, step: 0.1, label: 'wash strength' },
      gran: { value: 1, min: 0, max: 2, step: 0.1, label: 'granulation' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
      crowd: { value: 1, min: 0, max: 2, step: 0.1, label: 'satellites' },
    },
    onReset: () => redraw(),
  });
  noLoop();
}

// every paint runs inside p5's draw() so the first sheet is bit-identical to later ones
function draw() { paintAll(); }

function fit() {
  S = Math.min(windowWidth / W, windowHeight / H);
  createCanvas(Math.floor(W * S), Math.floor(H * S));
}
function windowResized() { fit(); G.reset(); }   // reset rewinds the rng: a resize must not change the sheet

function setTheme(i) {
  G.params.theme = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  if (G.gui) G.gui.controllersRecursive().forEach(c => c.updateDisplay());
  G.reset();
}
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('pvp-' + T.name.toLowerCase() + '-' + G.seed, 'png');
  if (key === 't' || key === 'T') setTheme(G.param('theme') + 1);
  if (key >= '1' && key <= String(THEMES.length)) setTheme(Number(key) - 1);
}

// ───────────────────────── helpers ─────────────────────────
const rnd = (a = 1, b) => (b === undefined ? R() * a : a + R() * (b - a));
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function isect(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
  return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
}

function bounds(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// hand-wobbled version of a polyline / polygon: corners stay put, edges breathe
function wob(poly, amp, closed = true, seg = 26) {
  const out = [], n = poly.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, k = Math.max(1, Math.round(L / seg)), ph = rnd(500);
    for (let j = 0; j < k; j++) {
      const t = j / k, env = Math.sin(Math.PI * t);
      const o = (noise(ph + t * L * 0.03, i * 3.7) - 0.5) * 2.4 * amp * env;
      out.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]);
    }
  }
  if (!closed) out.push(poly[n - 1]);
  return out;
}

function trace(pts, closed = true) {
  const ctx = drawingContext;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

// opaque gouache: flat body colour, then streaky brushwork, pooled mottles,
// a slightly darker dried rim and specks of paper tooth — all clipped to the shape
function gouache(poly, col, o = {}) {
  const ctx = drawingContext, bw = G.param('brush');
  const pts = wob(poly, (o.wob != null ? o.wob : 1) * LW);
  ctx.save();
  if (o.clip) { trace(o.clip); ctx.clip(); }
  trace(pts);
  ctx.fillStyle = rgba(col, o.alpha != null ? o.alpha : 0.97);
  ctx.fill();
  ctx.clip();

  const bb = bounds(poly), area = bb.w * bb.h;
  let ang = o.dir;
  if (ang === undefined) {
    let best = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
  }
  const vary = (o.vary != null ? o.vary : 0.1) * T.varyK;
  const n = Math.min(1400, Math.floor((area / 90) * bw * (o.dense || 1)));
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h);
    const len = rnd(14, 64) * (o.len || 1), a2 = ang + rnd(-0.2, 0.2);
    const k = (rnd() - 0.5) * 2 * vary;
    const c = k > 0 ? mixc(col, [255, 250, 238], k * 1.5) : col.map(v => v * (1 + k));
    ctx.strokeStyle = rgba(c, rnd(0.08, 0.26));
    ctx.lineWidth = rnd(1.5, 6.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a2) * len * 0.5 + rnd(-3, 3), y + Math.sin(a2) * len * 0.5 + rnd(-3, 3),
      x + Math.cos(a2) * len, y + Math.sin(a2) * len);
    ctx.stroke();
  }
  // pooled / thinned patches
  const m = Math.floor((area / 2200) * (o.mottle != null ? o.mottle : 1) * bw) + 1;
  for (let i = 0; i < m; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h), r = rnd(8, 34) * (o.mscale || 1);
    const light = rnd() < (o.thin != null ? o.thin : 0.5);
    const c = light ? mixc(col, PAPER, 0.75) : col.map(v => v * 0.72);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = rnd(0.1, 0.24) * (light ? (o.thinA || 1) : 1);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(0.6, rgba(c, a * 0.5)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dried rim
  trace(pts);
  ctx.strokeStyle = rgba(col.map(v => v * 0.7), 0.32);
  ctx.lineWidth = 3.2;
  ctx.stroke();
  // paper tooth catching through the paint film
  const sp = Math.floor(area / 260 * bw);
  for (let i = 0; i < sp; i++) {
    ctx.fillStyle = rgba(PAPER, rnd(0.12, 0.45));
    ctx.fillRect(bb.x + rnd(bb.w), bb.y + rnd(bb.h), rnd(0.5, 1.5), rnd(0.5, 1.5));
  }
  ctx.restore();
}

// graphite / ink line: two wandering passes of uneven pressure
function gline(pts, o = {}) {
  const ctx = drawingContext, amp = G.param('wobble') * (o.amp != null ? o.amp : 0.8);
  ctx.save();
  if (o.clip) { trace(o.clip); ctx.clip(); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    trace(wob(pts, amp, !!o.closed, 22), !!o.closed);
    ctx.strokeStyle = rgba(o.col || T.line, pass ? 0.4 : 0.78);
    ctx.lineWidth = (o.w || T.lw) * (pass ? 0.75 : 1) * rnd(0.85, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}
const outline = (poly, o = {}) => gline(poly, Object.assign({ closed: true }, o));

// shape = fill + outline
function form(poly, col, o = {}) {
  if (!poly || poly.length < 3) return;
  gouache(poly, col, o);
  if (o.line !== false) outline(poly, { clip: o.clip, w: o.lw });
}

// a loaded-brush dab
function dab(x, y, w, h, ang, col, a = 0.92) {
  const ctx = drawingContext, n = 9, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, r = 0.75 + rnd(0.5);
    pts.push([Math.cos(t) * w * r, Math.sin(t) * h * r]);
  }
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (!i) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  ctx.fillStyle = rgba(col, a); ctx.fill();
  ctx.strokeStyle = rgba(col.map(v => v * 0.75), 0.35); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
}

function dabs(poly, n, cols, o = {}) {
  const ctx = drawingContext, bb = bounds(poly);
  ctx.save(); trace(poly); ctx.clip();
  for (let i = 0; i < n; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h);
    if (o.where && R() > o.where(x, y)) continue;
    const s = rnd(o.s0 || 3, o.s1 || 6.5);
    dab(x, y, s * rnd(1, 1.7), s * rnd(0.6, 1), (o.ang || 0) + rnd(-0.7, 0.7), cols[Math.floor(rnd(cols.length))], o.a || 0.9);
  }
  ctx.restore();
}


// ───────────────────────── small geometry ─────────────────────────
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const jit = (p, a) => [p[0] + rnd(-a, a), p[1] + rnd(-a, a)];
const pick = a => a[Math.floor(rnd(a.length))];
const norm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
function pathAt(path, f) {
  let tot = 0; const L = [];
  for (let i = 0; i < path.length - 1; i++) { L.push(Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])); tot += L[i]; }
  let d = Math.max(0, Math.min(1, f)) * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) return lerpP(path[i], path[i + 1], L[i] ? d / L[i] : 0); d -= L[i]; }
}
const centroid = poly => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);

// ───────────────────────── ground ─────────────────────────
function blob(cx, cy, rx, ry, rot) {
  const n = 13, base = [], ph = rnd(100);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, r = 0.62 + noise(ph + Math.cos(t) * 0.9, ph + Math.sin(t) * 0.9) * 0.8;
    const x = Math.cos(t) * rx * r, y = Math.sin(t) * ry * r;
    base.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return base;
}

// one cloud of ground colour. wet = transparent MULTIPLY wash; scumble = pale opaque
// paint dragged over a dark sheet; dry = a flat translucent plane
function wash(cx, cy, rx, ry, rot, col, pig) {
  cx += rnd(-28, 28); cy += rnd(-22, 22); rx *= rnd(0.8, 1.25); ry *= rnd(0.8, 1.25);
  pig *= G.param('wet') * T.washK;
  const o = { base: blob(cx, cy, rx, ry, rot), color: col, paper: PAPER, rng: R, reach: 4, layers: 5, detail: 2, bleed: 1.25,
    pigment: pig, edge: 0.28, bloom: 0, grain: 0.7, outline: false, shadow: false, weightVar: 0.75, preEvolutions: 1, smooth: 0.4 };
  if (T.ground === 'wet') return Watercolor.paint(o);
  const ctx = drawingContext;
  if (T.ground === 'dry') {
    const a = rot + rnd(-0.3, 0.3), ux = Math.cos(a), uy = Math.sin(a), L = rx * 1.6, Wd = ry * 0.9;
    gouache([[cx - ux * L - uy * Wd, cy - uy * L + ux * Wd], [cx + ux * L - uy * Wd, cy + uy * L + ux * Wd],
      [cx + ux * L + uy * Wd, cy + uy * L - ux * Wd], [cx - ux * L + uy * Wd, cy - uy * L - ux * Wd]], col, { alpha: Math.min(0.5, pig * 0.03), vary: 0.05, mottle: 0.4, wob: 0.4 });
    return;
  }
  for (const layer of Watercolor.watercolorize(o.base, o)) {
    ctx.beginPath();
    for (let i = 0; i <= layer.length; i++) {
      const p = layer[i % layer.length], q = layer[(i + 1) % layer.length], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      if (!i) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p.x, p.y, mx, my);
    }
    ctx.fillStyle = rgba(col, pig * 0.0045 * rnd(0.6, 1.4));
    ctx.fill();
  }
}

function paperGround() {
  background(PAPER[0], PAPER[1], PAPER[2]);
  loadPixels();
  const w = width, h = height, px = pixels, pr = Watercolor.makeRng(G.seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (x + y * w);
    const v = (noise(x * 0.012, y * 0.012) - 0.5) * 9 + (noise(x * 0.35, y * 0.35) - 0.5) * 10 + (pr() - 0.5) * 7;
    px[i] += v; px[i + 1] += v; px[i + 2] += v * 1.1;
  }
  updatePixels();
}

function soften() {
  const ctx = drawingContext;
  if (!('filter' in ctx) || T.ground === 'dry') return;
  const snap = get();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'blur(' + (3 * S).toFixed(1) + 'px)';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(snap.canvas, 0, 0);
  ctx.restore();
}

// pigment settles in the paper valleys wherever the ground departs from bare paper
function granulate() {
  const g = G.param('gran') * T.gran;
  if (g <= 0) return;
  loadPixels();
  const w = width, h = height, px = pixels, s = G.seed | 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (x + y * w);
    const d = (Math.abs(px[i] - PAPER[0]) + Math.abs(px[i + 1] - PAPER[1]) + Math.abs(px[i + 2] - PAPER[2])) / 200;
    if (d < 0.05) continue;
    let hsh = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + s) | 0;   // two-round mix: no lattice
    hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
    hsh = Math.imul(hsh ^ (hsh >>> 16), 0x85ebca6b);
    hsh = ((hsh ^ (hsh >>> 13)) >>> 0) / 4294967296;
    const v = (hsh * 0.6 + noise(x * 0.09 / S, y * 0.09 / S) * 0.8 - 0.62) * 70 * g * Math.min(1, d * 1.6);
    px[i] -= v; px[i + 1] -= v * 0.9; px[i + 2] -= v * 0.75;
  }
  updatePixels();
}

function tooth() {
  const ctx = drawingContext;
  resetMatrix();
  for (let i = 0; i < width * height / 55; i++) {
    ctx.fillStyle = R() < 0.5 ? 'rgba(255,252,244,0.10)' : 'rgba(60,40,30,0.06)';
    ctx.fillRect(R() * width, R() * height, 1 + R() * 1.4, 1 + R() * 1.4);
  }
}

// ───────────────────────── solids ─────────────────────────
// a cap polygon extruded toward its own vanishing point; only faces turned to that point show
function prism(cap, vp, t, capCol, faceCols, o = {}) {
  const n = cap.length, far = cap.map(p => lerpP(p, vp, t)), c = centroid(cap);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = cap[i], b = cap[(i + 1) % n], m = lerpP(a, b, 0.5);
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    if (nx * (m[0] - c[0]) + ny * (m[1] - c[1]) < 0) { nx = -nx; ny = -ny; }
    if (nx * (vp[0] - m[0]) + ny * (vp[1] - m[1]) <= 0) continue;
    const face = t > 0.97 ? [a, b, vp] : [a, b, far[(i + 1) % n], far[i]];
    form(face, faceCols[k++ % faceCols.length], Object.assign({ vary: 0.12, mottle: 2, thin: 0.55, alpha: 0.92 }, o.face));
  }
  form(cap, capCol, o.cap || {});
}

function regular(cx, cy, r, n, rot, squash = 1) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; out.push([cx + Math.cos(a) * r * rnd(0.8, 1.15), cy + Math.sin(a) * r * squash * rnd(0.8, 1.15)]); }
  return out;
}

// ───────────────────────── the sheet ─────────────────────────
function paintAll() {
  R = G.rng;
  T = THEMES[Math.round(G.param('theme'))] || THEMES[0];
  PAPER = T.paper;
  randomSeed(G.seed); noiseSeed(G.seed);
  LW = G.param('wobble') * T.wob;
  const cap = document.getElementById('cap');
  if (cap) cap.textContent = T.name + ' · seed ' + G.seed;

  const ctx = drawingContext;
  resetMatrix();
  paperGround();
  scale(S);
  ctx.save();
  trace(wob([[9, 9], [1191, 8], [1192, 884], [8, 885]], 2.2, true, 40));
  ctx.clip();
  if (rnd() < 0.5) { ctx.translate(W, 0); ctx.scale(-1, 1); }   // the sheet may be read from either side

  const L = layout();
  [ground, soften, granulate, fieldAndSail, fan, checker, blades, beam, portal, satellites, accents].forEach(f => f(L));
  ctx.restore();
  tooth();
}

// every shared point of the composition, in the canonical (portal left, sun right) frame
function layout() {
  const c = [rnd(395, 470), rnd(395, 455)], s = rnd(T.scale[0], T.scale[1]), rot = rnd(-0.07, 0.07), tk = rnd(0.65, 1.15);
  const cr = Math.cos(rot), sr = Math.sin(rot), ja = s * 0.05;
  const P = (u, v, j = ja) => jit([c[0] + s * (u * cr - v * sr), c[1] + s * (u * sr + v * cr)], j);
  const L = { c, s, P };
  L.win = [P(-0.15, -0.93), P(0.69, -0.12), P(0.65, 0.53), P(-0.43, 0.91), P(-0.73, -0.18)];
  L.roofL = P(-0.88, -0.6); L.peak = P(0.25, -1.72); L.notch = P(0.75, -1.25);
  L.towTL = P(0.62, -1.25 - 1.03 * tk); L.towTR = P(0.96, -1.25 - 1.21 * tk);
  L.rb = P(1.02, 0.98); L.foot = P(-0.86, 1.66); L.foot2 = add(L.foot, [-9, -12]);
  L.towFace = [L.towTR, P(1.69, -1.25 - 0.97 * tk), P(1.32, -0.43), P(1.0, -0.19)];
  L.aTip = P(0.51, -1.05); L.aTop = P(1.53, -1.42); L.aBot = P(1.35, -0.64);
  L.V = [rnd(1000, 1085), rnd(465, 565)];
  L.P1 = [L.V[0] + rnd(-70, -10), rnd(52, 100)];
  L.K = [L.V[0] - 43 + rnd(-12, 12), L.P1[1] + (L.V[1] - L.P1[1]) * rnd(0.28, 0.38)];
  L.Rt = add(L.K, [rnd(150, 185), rnd(160, 190)]); L.tip = add(L.V, [rnd(0, 18), rnd(45, 75)]);
  L.nearT = P(1.0, -0.165, 2); L.nearB = P(1.02, 0.29, 2);
  L.farT = add(L.V, [rnd(-10, 60), rnd(175, 245)]); L.farB = add(L.farT, [rnd(-25, -5), rnd(85, 115)]);
  L.farB[1] = Math.min(L.farB[1], 850);
  return L;
}

function ground(L) {
  const g = T.g, x0 = L.c[0] - L.s;
  wash(x0 * 0.85, 170, 190, 120, 0.2, g.halo, 8); wash(x0 * 0.6, 330, 90, 150, 0.1, g.halo, 7); wash(x0 * 0.45, 470, 110, 50, -0.3, g.halo, 6);
  wash(360, 60, 230, 42, 0, g.air, 8); wash(660, 40, 70, 30, 0, g.air, 6);
  wash(50, 190, 40, 200, 0.02, g.edge, 14); wash(46, 470, 42, 180, -0.03, g.edge, 14); wash(36, 330, 24, 300, 0, g.edge2, 6);
  wash(125, 548, 85, 40, -0.4, g.edge, 7);
  wash(900, 58, 215, 56, 0.05, g.edge, 14); wash(800, 150, 95, 40, -0.1, g.edge, 11); wash(1165, 130, 34, 135, 0, g.edge, 14);
  wash(1000, 40, 200, 24, 0, g.edge2, 6);
  const m = lerpP(L.nearB, L.farB, 0.3), m2 = lerpP(L.nearB, L.farB, 0.62);
  wash(m[0] - 40, m[1] + 95, 120, 30, -0.25, g.edge, 12); wash(m2[0] - 30, m2[1] + 20, 150, 22, 0.12, g.edge, 12);
  wash(L.foot[0] + 270, L.foot[1] + 30, 60, 24, 0.3, g.edge, 7);
  wash(330, 846, 360, 40, 0, g.floor, 12); wash(820, 852, 300, 38, 0, g.floor, 12); wash(560, 870, 600, 18, 0, g.floor2, 10);
  wash(140, 822, 150, 26, 0, g.floor, 6); wash(m2[0] - 90, m2[1] + 70, 180, 36, 0.18, g.floor, 8);
  wash(1168, 330, 30, 80, 0, g.drift, 10);
}

function fieldAndSail(L) {
  const ctx = drawingContext;
  gouache([L.nearT, L.aBot, L.V, L.tip, L.Rt, [1194, L.Rt[1] + 34], [1194, 872], [L.farB[0] - 28, 872], L.farB, L.farT],
    T.field, { wob: 3, vary: 0.13, mottle: 1.6, mscale: 1.8, thin: 0.35, dir: 0.6 });
  for (let i = 0; i < 14; i++) {
    const x = rnd(L.farT[0], 1185), y = rnd(L.tip[1], 860), r = rnd(18, 46), c = T.field.map(v => v * 0.9);
    const gr = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    gr.addColorStop(0, rgba(c, 0.14)); gr.addColorStop(0.85, rgba(c, 0.2)); gr.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const Rs = add(L.Rt, [-40, -44]), top = add(L.P1, [rnd(60, 95), rnd(-50, -30)]), left = add(L.P1, [rnd(-175, -130), rnd(-10, 12)]);
  form([left, top, Rs, L.K, L.P1, lerpP(left, L.P1, 0.25)], T.sail, { vary: 0.12, mottle: 1.4, dir: -0.2 });
  const g0 = lerpP(L.K, L.P1, 0.65), mid = add(lerpP(L.K, Rs, 0.55), [22, -58]);
  const corner = [g0, add(g0, [32, 52]), mid, add(Rs, [-8, -62]), Rs, L.K];
  gouache(corner, T.accent, { wob: 5, vary: 0.2, mottle: 2, alpha: 0.9 });
  const zone = [L.P1, top, Rs, L.K];
  dabs(zone, Math.floor(70 * T.stip), [mixc(T.beam, T.white, 0.55), mixc(T.beam, T.white, 0.35)], { s0: 4, s1: 8, where: (x, y) => (y < mid[1] + 10 ? 0.8 : 0.15) });
  dabs(zone, Math.floor(110 * T.stip), [T.field.map(v => v * 0.92), T.field], { s0: 1.5, s1: 3.5, where: x => (x > (L.P1[0] + top[0]) / 2 ? 0.8 : 0.3) });
  gline([top, Rs]); gline([left, top]); gline([L.K, L.Rt]);
}

// harlequin fan: rays from the sun × transversals, both spaced along the fan's own edges
function fan(L) {
  const V = L.V, region = [L.aTop, L.P1, L.K, V, L.aBot];
  const aPath = [L.aBot, L.aTop, L.P1], sPath = [L.aTop, L.aBot, V], ePath = [L.aTop, L.P1, L.K, V];
  const A = [[L.aBot, V]];
  for (let i = 1; i <= T.nA; i++) A.push([pathAt(aPath, Math.pow(i / (T.nA + 1), 0.85) * 0.98 + rnd(-0.015, 0.015)), V]);
  A.push([L.K, V]);
  const B = [[L.aTop, L.P1]];
  for (let k = 0; k < T.nB; k++) {
    const f = k / (T.nB - 1);
    B.push([pathAt(sPath, 0.16 + 0.76 * f + rnd(-0.012, 0.012)), pathAt(ePath, 0.17 + 0.77 * f + rnd(-0.012, 0.012))]);
  }
  gouache(region, T.sail, { wob: 0.4, vary: 0.1 });
  const cols = A.length - 1, rows = B.length, used = [];
  for (let c = 0; c < cols; c++) { used.push([]); for (let r = 0; r < rows; r++) {
    const a0 = A[c], a1 = A[c + 1], b0 = B[r];
    const q = r < rows - 1
      ? [isect(a0[0], a0[1], b0[0], b0[1]), isect(a1[0], a1[1], b0[0], b0[1]), isect(a1[0], a1[1], B[r + 1][0], B[r + 1][1]), isect(a0[0], a0[1], B[r + 1][0], B[r + 1][1])]
      : [isect(a0[0], a0[1], b0[0], b0[1]), isect(a1[0], a1[1], b0[0], b0[1]), V];
    if (q.some(p => !isFinite(p[0]) || Math.abs(p[0]) > 3000 || Math.abs(p[1]) > 3000)) { used[c].push(null); continue; }
    let col;
    if (T.fanRule === 'checker') col = (c + r) % 2 ? T.white : (r % 3 === 1 ? T.dark2 : T.dark1);
    else {
      const near = r / rows, pool = near > 0.75 ? T.tints.concat([T.white]) : T.brights;
      for (let tries = 0; tries < 8; tries++) {
        col = rnd() < T.whiteRate ? T.white : pick(pool);
        if (col !== (c ? used[c - 1][r] : 0) && col !== (r ? used[c][r - 1] : 0)) break;
      }
    }
    used[c].push(col);
    gouache(q, col, { clip: region, wob: 0.5, vary: 0.09, mottle: 1.2, dir: Math.atan2(b0[1][1] - b0[0][1], b0[1][0] - b0[0][0]) });
    if (T.fanRule !== 'checker' && rnd() < 0.06 * T.stip) dabs(q, 22, [mixc(col, T.white, 0.6)], { s0: 2.5, s1: 4.5 });
  } }
  for (let i = 1; i < A.length - 1; i++) gline([A[i][0], V], { clip: region, w: T.lw * 1.2 });
  for (let i = 1; i < B.length; i++) gline(B[i], { clip: region, w: T.lw * 1.2 });
  outline(region, { w: T.lw * 1.35 });
}

// two-tone checker on the triangle K–Rt–tip (an affine grid: no vanishing point at all)
function checker(L) {
  const A0 = L.K, Rt = L.Rt, tip = L.tip, tri = [A0, Rt, tip];
  const Pq = (u, v) => [A0[0] + u * (Rt[0] - A0[0]) + v * (tip[0] - A0[0]), A0[1] + u * (Rt[1] - A0[1]) + v * (tip[1] - A0[1])];
  const nu = Math.round(rnd(3, 4.4)), nv = Math.round(rnd(5, 8)), soft = mixc(T.dark1, T.white, 0.35);
  gouache(tri, T.dark2, { vary: 0.05 });
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
    if (u0 + v0 >= 1) continue;
    const odd = (i + j) % 2 === 1, col = i === 0 && j > 0 ? soft : odd ? (j < 2 ? soft : T.dark1) : T.dark2;
    gouache([Pq(u0, v0), Pq(u1, v0), Pq(u1, v1), Pq(u0, v1)], col, { clip: tri, wob: 0.5, vary: col === T.dark2 ? 0.05 : 0.12, dir: 0.8 });
  }
  const lc = T.ground === 'scumble' ? T.line : T.dark2.map(v => v * 0.8);
  for (let j = 1; j < nv; j++) gline([Pq(0, j / nv), Pq(1 - j / nv, j / nv)], { clip: tri, w: T.lw, col: lc });
  for (let i = 1; i < nu; i++) gline([Pq(i / nu, 0), Pq(i / nu, 1 - i / nu)], { clip: tri, w: T.lw, col: lc });
  outline(tri, { w: T.lw * 1.35 });
}

// the counter-sheaf: broad on the portal's flank, closing to points gathered under the sun
function blades(L) {
  const f1 = L.towFace[2], f2 = L.towFace[3], flank = [L.aBot, f1, f2, L.nearT], n = T.nBlades;
  const tipAt = i => add(L.V, [-40 + 34 * i + rnd(-12, 12), 58 + 27 * i + rnd(-8, 8)]);
  const kinds = ['band', 'paper', 'flat', 'flat', 'flat'].slice(0, n - 1).concat(['trident']);
  if (n === 3) kinds[1] = 'flat';
  let last = null;
  for (let i = 0; i < n - 1; i++) {
    const b0 = pathAt(flank, i / (n - 1)), b1 = pathAt(flank, (i + 1) / (n - 1)), tp = tipAt(i), kind = kinds[i];
    if (kind === 'band') {
      const poly = [b0, tp, b1];
      form(poly, T.band, { vary: 0.22, mottle: 3, thin: 0.6, thinA: 1.5, mscale: 0.5 });
      dabs(poly, Math.floor(90 * T.stip), [mixc(T.band, T.white, 0.35), mixc(T.band, T.white, 0.2)], { s0: 2.5, s1: 6, a: 0.55 });
    } else if (kind === 'paper') {
      form([b0, lerpP(b0, tp, 0.5), b1], mixc(PAPER, [255, 255, 255], 0.2), { vary: 0.03, mottle: 0.4 });
    } else {
      const cut = rnd(0.45, 0.62), e0 = lerpP(b0, tp, cut), e1 = lerpP(b1, tp, cut), col = T.blades[i % T.blades.length];
      form([b0, e0, e1, b1], col, { vary: 0.07 });
      form([lerpP(e0, e1, 0.55), e1, add(tp, [rnd(10, 40), rnd(10, 30)])], col, { vary: 0.07 });
      last = { e0, e1 };
    }
  }
  // trident: three slivers leaving the last band's cut end
  if (!last) { const b = pathAt(flank, 0.8); last = { e0: lerpP(b, L.V, 0.4), e1: add(lerpP(b, L.V, 0.4), [-14, 22]) }; }
  const o = lerpP(last.e0, last.e1, 0.45), up = add(last.e0, [18, -24]), t0 = tipAt(0), t2 = tipAt(n);
  const sky = T.blades[1], deep = T.blades[2];
  form([up, o, t0], sky);
  form([last.e1, o, add(o, [22, 28]), lerpP(o, t2, 0.78), lerpP(last.e1, t2, 0.7)], sky);
  form([o, t0, t2, lerpP(o, t2, 0.78), add(o, [22, 28])], deep, { vary: 0.16 });
}

// the great beam: a plane leaving the portal's flank, with its edge strip, a stippled
// underside that is lost in the wash, and the bar that ties its far end to the portal's foot
function beam(L) {
  const ctx = drawingContext, nT = L.nearT, nB = L.nearB, fT = L.farT, fB = L.farB;
  const barEnd = add(fB, [-50, 40]), u1 = add(lerpP(nB, fB, 0.28), [-6, 10]), u2 = add(fB, [-8, 10]);
  const midBar = lerpP(L.foot, barEnd, 0.43), under = [add(midBar, [0, -78]), u1, u2, add(barEnd, [-3, -14]), midBar];
  const deepC = mixc(T.dark1, T.g.floor2, 0.3);
  ctx.save(); trace(under); ctx.clip();
  const gr = ctx.createLinearGradient(midBar[0], 0, u2[0], 0);
  gr.addColorStop(0, rgba(T.g.floor, 0)); gr.addColorStop(0.35, rgba(T.g.floor2, 0.55)); gr.addColorStop(1, rgba(deepC, 0.95));
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const ramp = x => Math.max(0, Math.min(1, (x - midBar[0]) / 120));
  dabs(under, Math.floor(260 * T.stip), T.stipple.concat([T.dark1.map(v => v * 0.9)]), { s0: 3, s1: 7, ang: 0.4, where: ramp });
  dabs(under, Math.floor(90 * T.stip), [mixc(T.g.floor, T.white, 0.5)], { s0: 2, s1: 4.5, ang: 0.4, where: ramp });

  form([add(nB, [0, 4]), add(lerpP(nB, fB, 0.28), [2, 2]), u1, add(nB, [3, 28])], mixc(PAPER, [255, 255, 255], 0.3), { vary: 0.02, mottle: 0.3, line: false });
  form([lerpP(nB, fB, 0.28), fB, add(fB, [-6, 9]), u1], T.tints[3], { vary: 0.08 });
  form([nT, fT, fB, lerpP(nB, fB, 0.28), nB], T.beam, { vary: 0.2, mottle: 2.2, dense: 1.5, len: 1.6, thin: 0.4, lw: T.lw * 1.35 });
  gouache([L.foot, add(barEnd, [-3, -16]), add(fB, [-10, 0]), add(fB, [2, 2]), add(fB, [-2, 16]), barEnd, add(L.foot, [0, 5])], T.bar, { wob: 0.8, vary: 0.04 });
}

function portal(L) {
  const ctx = drawingContext, w = L.win;
  form(L.towFace, T.tints[0], { vary: 0.12, mottle: 3, thin: 0.45, mscale: 1.4, alpha: 0.9 });
  ctx.save(); trace(L.towFace); ctx.clip();
  const bb = bounds(L.towFace), bl = mixc(T.tints[0], T.dark1, 0.35);
  for (let i = 0; i < 9; i++) {
    const x = bb.x + rnd(bb.w), y = bb.y + rnd(bb.h), r = rnd(14, 40), g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(bl, 0.3)); g.addColorStop(1, rgba(bl, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  const pk2 = add(L.peak, [rnd(14, 26), rnd(-22, -10)]);
  form([L.roofL, add(L.peak, [rnd(-38, -18), rnd(-46, -28)]), L.peak], T.accent2, { vary: 0.2, mottle: 2 });
  form([L.peak, pk2, L.notch], T.accent, { vary: 0.15 });
  form([L.roofL, L.peak, L.notch, L.towTL, L.towTR, L.rb, w[2], w[1], w[0], w[4]], T.dark1, { vary: 0.16, mottle: 1.8, dense: 1.3, thin: 0.3, lw: T.lw * 1.35 });

  gouache(w, T.dark2, { vary: 0.05, wob: 0.6 });
  windowPattern(L);
  outline(w, { w: T.lw * 1.25 });

  const dotFace = [L.roofL, w[4], w[3], L.foot, L.foot2];
  form(dotFace, T.tints[1], { vary: 0.15, mottle: 2.5, thin: 0.6, alpha: 0.9 });
  const yCut = w[4][1] + (L.foot[1] - w[4][1]) * rnd(0.2, 0.45);
  dabs(dotFace, Math.floor(300 * T.stip), T.stipple, { s0: 3, s1: 6.5, ang: 1.2, where: (x, y) => (y > yCut ? 0.95 : y > yCut - 60 ? 0.3 : 0) });
  form([w[3], w[2], L.rb, L.foot], T.tints[2], { vary: 0.14, mottle: 2.4, thin: 0.5, alpha: 0.92, dir: -0.35, len: 1.5 });
  const s0 = lerpP(w[1], w[2], 0.2), s1 = lerpP(L.nearT, L.nearB, 0.97);
  form([s0, s1, add(s1, [0, 16]), add(s0, [0, 15])], T.tints[3], { vary: 0.06 });

  // the arrow driven into the tower — its back edge is the fan's near edge
  const e = lerpP(L.towFace[0], L.towFace[3], 0.5)[0], fr = Math.max(0.2, Math.min(0.75, (e - L.aTip[0]) / (L.aTop[0] - L.aTip[0])));
  const m0 = lerpP(L.aTip, L.aTop, fr), m1 = lerpP(L.aTip, L.aBot, fr);
  form([L.aTip, m0, m1], T.tints[3]);
  form([m0, L.aTop, L.aBot, m1], T.accent, { vary: 0.18, mottle: 2 });
}

function windowPattern(L) {
  const w = L.win, cen = centroid(w);
  if (T.windowKind === 'nested') {
    const cols = [T.window, T.dark1, T.accent, T.window];
    for (let k = 1; k <= T.chev + 1; k++) {
      const f = 1 - k / (T.chev + 2.2), p = w.map(q => jit(lerpP(cen, q, f), 2));
      gouache(p, cols[(k - 1) % cols.length], { clip: w, vary: 0.08, wob: 1.4 });
      gline(p, { closed: true, clip: w, w: T.lw * 0.7 });
    }
    return;
  }
  const a0 = lerpP(w[0], cen, 0.6), a1 = lerpP(cen, w[3], 1.25), ax = norm([a1[0] - a0[0], a1[1] - a0[1]]);
  const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), per = len / T.chev, Lr = L.s * 2.4;
  const dl = T.windowKind === 'stripes' ? [-ax[1], ax[0]] : norm([w[4][0] - w[3][0], w[4][1] - w[3][1]]);
  const dr = T.windowKind === 'stripes' ? [ax[1], -ax[0]] : norm([w[1][0] - w[3][0] - 30, w[1][1] - w[3][1] + 40]);
  for (let k = 0; k < T.chev + 1; k++) {
    const d0 = k * per + rnd(-6, 6) - (T.windowKind === 'stripes' ? per * 0.4 : 0), th = per * rnd(0.42, 0.56);
    const ai = [a0[0] + ax[0] * d0, a0[1] + ax[1] * d0], ao = [ai[0] + ax[0] * th, ai[1] + ax[1] * th];
    const poly = [[ao[0] + dl[0] * Lr, ao[1] + dl[1] * Lr], ao, [ao[0] + dr[0] * Lr, ao[1] + dr[1] * Lr],
      [ai[0] + dr[0] * Lr, ai[1] + dr[1] * Lr], ai, [ai[0] + dl[0] * Lr, ai[1] + dl[1] * Lr]];
    gouache(poly, T.window, { clip: w, vary: 0.08, wob: 1.6, mottle: 0.8 });
    gline(poly, { closed: true, clip: w, w: T.lw * 0.7, col: mixc(T.window, T.dark2, 0.55) });
  }
}

// small solids adrift in the wash on the side away from the sun, each with a private
// vanishing point; plus the long pyramid aimed from the corner at the portal
function satellites(L) {
  const xMax = L.roofL[0] - 30, placed = [], want = Math.round(rnd(T.sats[0], T.sats[1] + 0.99) * G.param('crowd'));
  for (let tries = 0; tries < 400 && placed.length < want; tries++) {
    const r = rnd(T.satR[0], T.satR[1]), x = rnd(30 + r, Math.max(60 + r, xMax - r)), y = rnd(45 + r, 560);
    if (x + y * 0.75 > xMax + 330) continue;                         // keep the corridor to the pyramid free
    if (placed.some(p => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 1.7)) continue;
    placed.push({ x, y, r });
  }
  placed.forEach((p, i) => {
    const kind = i % 3, ang = rnd(TAU), vp = [p.x + Math.cos(ang) * p.r * rnd(3, 6), p.y + Math.abs(Math.sin(ang)) * p.r * rnd(3, 6) + p.r];
    if (kind === 0) prism(regular(p.x, p.y - p.r, p.r * 0.8, 4, rnd(TAU), 0.45), vp, rnd(0.55, 0.85), T.cap, [T.tints[4], T.tints[3]]);
    else if (kind === 1) prism(regular(p.x, p.y, p.r * 0.9, 3, rnd(TAU)), vp, rnd(0.6, 1), T.cap, [pick(T.brights), T.dark1.map(v => v * 0.92), T.cap], { face: { alpha: 0.97, thin: 0.3 } });
    else {
      const a = [p.x, p.y - p.r * 1.6], b = [p.x + p.r * rnd(0.1, 0.4), p.y + p.r * 0.7], c = [p.x - p.r * 1.3, p.y + p.r * 1.6];
      form([a, b, c], pick(T.brights), { vary: 0.08 });
      form([b, add(b, [-2, p.r * 0.5]), c], T.tints[3]);
    }
  });

  const q = [rnd(18, 40), rnd(640, 690)], sz = rnd(95, 135);
  const cap = [q, add(q, [sz, rnd(-10, 0)]), add(q, [sz * 1.42, sz * 0.95]), add(q, [sz * 0.17, sz * 1.25])];
  const apex = lerpP(L.roofL, L.foot2, rnd(0.2, 0.4));
  form([cap[0], apex, cap[1]], mixc(T.field, T.white, 0.25), { vary: 0.08, mottle: 1.5 });
  form([cap[1], apex, cap[2]], T.blades[0], { vary: 0.08 });
  gline([lerpP(apex, cap[1], 0.1), lerpP(cap[2], cap[1], 0.05)], { w: T.lw * 0.75 });
  form(cap, T.dark1.map(v => v * 0.9), { vary: 0.14, lw: T.lw * 1.35 });
  const cc = centroid(cap), inner = cap.map(p => lerpP(cc, p, 0.52));
  form([inner[0], inner[1], inner[3]], T.accent.map(v => v * 0.8), { vary: 0.15 });
  form([inner[1], inner[2], inner[3]], T.tints[3]);
}

function accents(L) {
  for (let i = 0; i < T.dots; i++) {
    const p = i ? [rnd(L.farT[0] - 40, 1180), rnd(L.tip[1] - 300, 850)] : add(L.V, [rnd(70, 120), rnd(150, 200)]);
    dab(p[0], p[1], i ? rnd(3, 7) : 10.5, i ? rnd(3, 7) : 10, 0, i ? pick(T.brights) : mixc(T.beam, T.white, 0.2), 0.95);
  }
  const fx = rnd(60, 300), fy = rnd(120, 300), ink = T.ground === 'scumble' ? T.line : [30, 28, 30];
  for (let i = 0; i < 8; i++) dab(fx + rnd(-5, 5), fy + rnd(-18, 18), 1.2, 1.6, 0, ink, 0.8);
}
