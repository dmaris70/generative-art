// Study after Rolph Scarlett (1889–1984) — untitled gouache & watercolour on paper.
// A hand transcription of the composition into polygons (source space 1200 × 893),
// repainted procedurally: wet-in-wet watercolour ground (assets/watercolor.js),
// opaque gouache shapes with visible brushwork, graphite outlines, stipple dabs.
// The seed changes the HAND (wobble, brushwork, blooms), never the composition.
// Keys: R new hand · S save PNG.

let G, R, S = 1, LW = 1;
const W = 1200, H = 893;
const PAPER = [245, 241, 232];

const C = {
  maroon: [140, 44, 58], black: [38, 36, 32], chevY: [228, 208, 86],
  towerPink: [233, 186, 198], mauve: [196, 128, 150], dotFace: [208, 112, 136],
  roofGreen: [40, 176, 124], arrowGreen: [8, 164, 126], arrowGrey: [160, 186, 190],
  band: [44, 140, 100], olive: [169, 186, 58], red: [226, 74, 58], yellow: [250, 212, 56],
  ltblue: [158, 204, 214], orange: [252, 140, 72], white: [238, 230, 231],
  teal: [84, 192, 164], pink: [240, 156, 160], tealblue: [88, 160, 180],
  golden: [248, 196, 60], purple: [176, 88, 140], salmon: [238, 140, 140],
  lavender: [222, 170, 200], cyan: [96, 208, 214], ultra: [24, 84, 172],
  navy: [28, 52, 96], sky: [66, 146, 196], oband: [253, 166, 100],
  yray: [251, 212, 100], lime: [186, 213, 84], lav: [176, 190, 214],
  gb: [150, 186, 200], palePink: [226, 208, 212], backYel: [249, 204, 84],
  pyY: [254, 218, 112], pyO: [252, 134, 70], frame: [124, 40, 52],
  inGreen: [8, 122, 100], inGrey: [146, 180, 188], dot: [56, 144, 204],
  strip: [150, 176, 184], chkMar: [128, 40, 58], chkMauve: [172, 92, 118],
  graphite: [54, 46, 46],
};

function setup() {
  fit();
  pixelDensity(1);
  G = GenArt.create({
    title: 'Study after Scarlett',
    params: {
      brush: { value: 1, min: 0, max: 2, step: 0.1, label: 'brushwork' },
      wet: { value: 1, min: 0.3, max: 1.8, step: 0.1, label: 'wash strength' },
      gran: { value: 1, min: 0, max: 2, step: 0.1, label: 'granulation' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
    },
    onReset: () => redraw(),
  });
  noLoop();
}

// every paint runs inside p5's draw() so the first sheet is bit-identical to later ones
function draw() { paintAll(); }

function fit() {
  S = Math.min(windowWidth / W, windowHeight / H);
  const c = createCanvas(Math.floor(W * S), Math.floor(H * S));
  return c;
}

function windowResized() { fit(); G.reset(); }   // reset rewinds the rng: a resize must not change the sheet
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('scarlett-study-' + G.seed, 'png');
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
  const vary = o.vary != null ? o.vary : 0.1;
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
    ctx.strokeStyle = rgba(o.col || C.graphite, pass ? 0.4 : 0.78);
    ctx.lineWidth = (o.w || 1.45) * (pass ? 0.75 : 1) * rnd(0.85, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}
const outline = (poly, o = {}) => gline(poly, Object.assign({ closed: true }, o));

// shape = fill + outline
function form(poly, col, o = {}) {
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

// watercolour blob → Watercolor.paint
function wash(cx, cy, rx, ry, rot, col, pig, o = {}) {
  const n = 13, base = [], ph = rnd(100);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, r = 0.62 + noise(ph + Math.cos(t) * 0.9, ph + Math.sin(t) * 0.9) * 0.8;
    const x = Math.cos(t) * rx * r, y = Math.sin(t) * ry * r;
    base.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  Watercolor.paint(Object.assign({
    base, color: col, paper: PAPER, rng: R, reach: 4, layers: 5, detail: 2, bleed: 1.25,
    pigment: pig * G.param('wet'), edge: 0.28, bloom: 0, grain: 0.7, outline: false, shadow: false,
    weightVar: 0.75, preEvolutions: 1, smooth: 0.4,
  }, o));
}

// ───────────────────────── the painting ─────────────────────────
function paintAll() {
  R = G.rng;
  randomSeed(G.seed); noiseSeed(G.seed);
  LW = G.param('wobble');
  const ctx = drawingContext;
  resetMatrix();
  paperGround();
  scale(S);

  // everything stays inside a slightly ragged sheet margin
  ctx.save();
  trace(wob([[9, 9], [1191, 8], [1192, 884], [8, 885]], 2.2, true, 40));
  ctx.clip();

  ground();
  granulate();
  rightField();
  fan();
  checker();
  rays();
  blueBox();
  house();
  leftForms();
  pyramid();
  accents();

  ctx.restore();
  tooth();
}

// cold-press sheet: soft mottle + fine grain (no canvas weave)
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

function ground() {
  const B = [74, 162, 200], B2 = [52, 136, 188], Y = [250, 224, 150], T = [200, 224, 210], M = [222, 140, 174], M2 = [204, 104, 152];
  // pale yellow + grey-green air, upper left
  wash(330, 170, 190, 120, 0.2, Y, 8);
  wash(250, 330, 90, 150, 0.1, Y, 7);
  wash(180, 470, 110, 50, -0.3, Y, 6);
  wash(360, 60, 230, 42, 0, T, 8);
  wash(660, 40, 70, 30, 0, T, 6);
  wash(430, 560, 40, 90, 0.2, Y, 4);
  // cerulean: left edge, top right, the swirl under the box
  wash(50, 190, 40, 200, 0.02, B, 14); wash(46, 470, 42, 180, -0.03, B, 14);
  wash(36, 330, 24, 300, 0, B2, 6); wash(125, 548, 85, 40, -0.4, B, 7);
  wash(56, 640, 40, 34, 0, B, 6);
  wash(900, 58, 215, 56, 0.05, B, 14); wash(800, 150, 95, 40, -0.1, B, 11);
  wash(1165, 130, 34, 135, 0, B, 14); wash(1000, 40, 200, 24, 0, B2, 6);
  wash(745, 95, 55, 55, 0, B2, 6);
  wash(650, 688, 120, 30, -0.25, B, 12); wash(880, 668, 150, 22, 0.12, B, 12);
  wash(555, 738, 60, 24, 0.3, B, 7); wash(1015, 708, 80, 22, 0.35, B, 7);
  wash(655, 612, 44, 44, 0, B, 6); wash(40, 730, 30, 60, 0, [170, 214, 222], 6);
  // magenta floor
  wash(330, 846, 360, 40, 0, M, 12); wash(820, 852, 300, 38, 0, M, 12);
  wash(560, 870, 600, 18, 0, M2, 10); wash(140, 822, 150, 26, 0, M, 6);
  wash(770, 738, 180, 36, 0.18, M, 8); wash(690, 662, 66, 32, 0.4, M, 5);
  // ochre drift, right margin
  wash(1168, 330, 30, 80, 0, [236, 204, 70], 10);
  wash(640, 585, 40, 26, 0.5, [246, 214, 110], 7);
  soften();
}

// wet-in-wet: let the lobed wash edges diffuse a little (no-op where canvas filters are unsupported)
function soften() {
  const ctx = drawingContext;
  if (!('filter' in ctx)) return;
  const snap = get();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'blur(' + (3 * S).toFixed(1) + 'px)';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(snap.canvas, 0, 0);
  ctx.restore();
}

// pigment settles into the paper valleys wherever a wash lies
function granulate() {
  const g = G.param('gran');
  if (g <= 0) return;
  loadPixels();
  const w = width, h = height, px = pixels, s = G.seed | 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (x + y * w);
    const pig = 1 - Math.min(px[i], px[i + 1], px[i + 2]) / 245;
    if (pig < 0.04) continue;
    let hsh = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + s) | 0;   // two-round mix: no lattice
    hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
    hsh = Math.imul(hsh ^ (hsh >>> 16), 0x85ebca6b);
    hsh = ((hsh ^ (hsh >>> 13)) >>> 0) / 4294967296;
    const lo = noise(x * 0.09 / S, y * 0.09 / S);
    const v = (hsh * 0.6 + lo * 0.8 - 0.62) * 70 * g * Math.min(1, pig * 1.6);
    px[i] -= v; px[i + 1] -= v * 0.9; px[i + 2] -= v * 0.75;
  }
  updatePixels();
}

function tooth() {
  const ctx = drawingContext;
  resetMatrix();
  ctx.save();
  for (let i = 0; i < width * height / 55; i++) {
    const l = R() < 0.5;
    ctx.fillStyle = l ? 'rgba(255,252,244,0.10)' : 'rgba(60,40,30,0.06)';
    ctx.fillRect(R() * width, R() * height, 1 + R() * 1.4, 1 + R() * 1.4);
  }
  ctx.restore();
}

// the big yellow field, the yellow sail behind the fan and its green corner
function rightField() {
  gouache([[600, 402], [655, 328], [1053, 520], [1063, 580], [1182, 396], [1194, 430], [1194, 872], [1040, 872], [1068, 822], [1083, 720]],
    C.yray, { wob: 3, vary: 0.13, mottle: 1.6, mscale: 1.8, thin: 0.35, dir: 0.6 });
  // loose ochre re-wettings, bottom right
  const ctx = drawingContext;
  for (let i = 0; i < 16; i++) {
    const x = rnd(1060, 1185), y = rnd(560, 860), r = rnd(18, 46);
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, rgba([240, 196, 70], 0.16)); g.addColorStop(0.85, rgba([226, 180, 60], 0.2)); g.addColorStop(1, rgba([226, 180, 60], 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const sail = [[870, 68], [1100, 25], [1142, 352], [1011, 219], [1022, 69], [905, 108]];
  form(sail, C.backYel, { vary: 0.12, mottle: 1.4, dir: -0.2 });
  // green corner, dragged dry toward the yellow
  const green = [[1017, 120], [1050, 170], [1090, 225], [1122, 250], [1136, 290], [1142, 352], [1011, 219]];
  gouache(green, C.arrowGreen, { wob: 5, vary: 0.2, mottle: 2, alpha: 0.9 });
  dabs([[1015, 100], [1120, 120], [1135, 300], [1030, 250]], 70, [[128, 170, 196], [96, 150, 200], [150, 186, 204]], { s0: 4, s1: 8, where: (x, y) => (x < 1105 && y < 265 - (x - 1015) * 0.1 ? 0.9 : 0.15) });
  dabs([[1060, 90], [1135, 80], [1140, 260], [1090, 250]], 120, [[232, 190, 60], [244, 206, 84]], { s0: 1.5, s1: 3.5, where: (x) => (x > 1085 ? 0.8 : 0.3) });
  dabs(green, 40, [[10, 120, 96], [20, 140, 104]], { s0: 3, s1: 6, a: 0.6 });
  gouache([[1120, 212], [1136, 225], [1142, 330], [1126, 262]], C.strip, { alpha: 0.85, wob: 2 });
  gline([[1100, 25], [1142, 352]]); gline([[870, 68], [1100, 25]]); gline([[870, 68], [905, 108]]);
  gline([[1011, 219], [1142, 352]]);
}

// harlequin fan: rays from a vanishing point crossed by a second family
function fan() {
  const V = [1053, 520];
  const region = [[690, 188], [1022, 69], [1018, 140], [1010, 218], V, [660, 322]];
  const A = [[660, 322], [682, 230], [740, 172], [823, 143], [883, 122], [947, 101], [1010, 218]].map(p => [p, V]);
  const Bl = [[[690, 188], [1022, 69]], [[670, 280], [823, 143]], [[687, 337], [947, 106]], [[743, 365], [1018, 140]],
    [[800, 393], [1010, 218]], [[853, 418], [1020, 283]], [[913, 453], [1030, 352]], [[965, 478], [1040, 428]], [[1008, 499], [1047, 472]]];
  const K = C, wh = K.white;
  const grid = [
    [wh, K.ltblue, wh, K.orange, K.olive, K.red, wh, K.olive, K.mauve],
    [K.olive, K.red, K.yellow, K.palePink, wh, K.teal, K.orange, K.pink, K.mauve],
    [K.pink, K.ltblue, K.orange, K.red, K.pink, K.salmon, wh, K.lavender, K.tealblue],
    [K.yellow, K.olive, wh, K.teal, K.orange, wh, K.lavender, wh, K.palePink],
    [wh, K.red, K.tealblue, K.yellow, K.purple, wh, K.lavender, wh, K.pink],
    [null, null, null, null, K.ltblue, wh, K.mauve, K.cyan, K.cyan],
  ];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 9; r++) {
    const col = grid[c][r];
    if (!col) continue;
    const a0 = A[c], a1 = A[c + 1], b0 = Bl[r];
    const q = r < 8
      ? [isect(a0[0], a0[1], b0[0], b0[1]), isect(a1[0], a1[1], b0[0], b0[1]), isect(a1[0], a1[1], Bl[r + 1][0], Bl[r + 1][1]), isect(a0[0], a0[1], Bl[r + 1][0], Bl[r + 1][1])]
      : [isect(a0[0], a0[1], b0[0], b0[1]), isect(a1[0], a1[1], b0[0], b0[1]), V];
    gouache(q, col, { clip: region, wob: 0.5, vary: 0.09, mottle: 1.2, dir: Math.atan2(b0[1][1] - b0[0][1], b0[1][0] - b0[0][0]) });
  }
  const gold = [[947, 101], [1022, 69], [1018, 140], [967, 182]], od = [[967, 182], [1018, 140], [1010, 218], [982, 240]];
  gouache(gold, C.golden, { clip: region, vary: 0.1 });
  gouache(od, C.orange, { clip: region });
  dabs(od, 26, [[246, 176, 176], [250, 196, 190]], { s0: 2.5, s1: 4.5 });
  gouache([[946, 101], [981, 86], [949, 110]], C.purple, { wob: 0.3 });
  for (let i = 1; i < 6; i++) gline([A[i][0], V], { clip: region, w: 1.8 });
  for (let i = 1; i < 9; i++) {
    const end = i === 2 ? [947, 106] : Bl[i][1];
    gline([Bl[i][0], end], { clip: region, w: 1.8 });
  }
  gline([[967, 182], [1018, 140]]);
  outline(region, { w: 2 });
}

// black / maroon checker: an affine grid on the triangle T–Rt–tip
function checker() {
  const T = [1011, 219], Rt = [1182, 396], tip = [1062, 580], tri = [T, Rt, tip];
  const P = (u, v) => [T[0] + u * (Rt[0] - T[0]) + v * (tip[0] - T[0]), T[1] + u * (Rt[1] - T[1]) + v * (tip[1] - T[1])];
  const nu = 4, nv = 7;
  gouache(tri, C.black, { vary: 0.05 });
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
    if (u0 + v0 >= 1) continue;
    const odd = (i + j) % 2 === 1, col = i === 0 && j > 0 ? C.chkMauve : odd ? (j < 2 ? C.chkMauve : C.chkMar) : C.black;
    gouache([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], col, { clip: tri, wob: 0.5, vary: col === C.black ? 0.05 : 0.12, dir: 0.8 });
  }
  for (let j = 1; j < nv; j++) gline([P(0, j / nv), P(1 - j / nv, j / nv)], { clip: tri, w: 1.5, col: [30, 26, 28] });
  for (let i = 1; i < nu; i++) gline([P(i / nu, 0), P(i / nu, 1 - i / nu)], { clip: tri, w: 1.5, col: [30, 26, 28] });
  outline(tri, { w: 2 });
}

function rays() {
  form([[600, 398], [652, 357], [815, 483]], [246, 243, 236], { vary: 0.03, mottle: 0.4 });
  form([[658, 327], [1017, 583], [833, 460], [815, 483], [652, 357]], C.band, { vary: 0.22, mottle: 3, thin: 0.6, thinA: 1.5, mscale: 0.5 });
  dabs([[658, 327], [1017, 583], [833, 460], [815, 483], [652, 357]], 90, [[96, 196, 150], [70, 176, 134]], { s0: 2.5, s1: 6, a: 0.55 });
  form([[600, 400], [622, 382], [815, 483], [800, 505]], C.oband, { vary: 0.07 });
  form([[796, 501], [806, 499], [990, 622], [880, 562]], C.oband, { vary: 0.07 });
  form([[833, 460], [815, 485], [1017, 583]], C.sky);
  form([[800, 505], [815, 485], [838, 513], [985, 595], [960, 593]], C.sky);
  form([[815, 485], [1017, 583], [1100, 668], [985, 595], [838, 513]], C.navy, { vary: 0.16 });
  gline([[640, 425], [800, 508], [880, 567]], { w: 1.4 });
}

function blueBox() {
  // underside: magenta going to maroon, flicked with reds — its left end is lost in the wash
  const under = [[600, 690], [730, 628], [1060, 832], [1015, 846], [600, 768]];
  const ctx = drawingContext;
  ctx.save(); trace(under); ctx.clip();
  const g = ctx.createLinearGradient(620, 0, 1040, 0);
  g.addColorStop(0, rgba([196, 110, 150], 0)); g.addColorStop(0.35, rgba([190, 104, 140], 0.55)); g.addColorStop(1, rgba([150, 48, 70], 0.95));
  ctx.fillStyle = g; ctx.fillRect(590, 600, 500, 270);
  ctx.restore();
  const ramp = (x, y) => Math.max(0, Math.min(1, (x - 610) / 120)) * (y > 690 + (x - 640) * 0.1 ? 1 : 0.35);
  dabs(under, 260, [[226, 60, 50], [236, 84, 60], [150, 36, 56], [128, 30, 50]], { s0: 3, s1: 7, ang: 0.4, where: ramp });
  dabs(under, 90, [[244, 176, 186], [238, 150, 170]], { s0: 2, s1: 4.5, ang: 0.4, where: ramp });

  form([[603, 484], [738, 620], [728, 630], [606, 508]], [247, 245, 238], { vary: 0.02, mottle: 0.3, line: false });
  form([[735, 618], [1068, 822], [1062, 831], [729, 629]], C.strip, { vary: 0.08 });
  form([[600, 402], [1083, 720], [1068, 822], [735, 618], [603, 480]], C.ultra, { vary: 0.2, mottle: 2.2, dense: 1.5, len: 1.6, thin: 0.4, lw: 2 });
  gouache([[280, 708], [1015, 846], [1058, 822], [1070, 824], [1066, 838], [1018, 862], [280, 713]], C.black, { wob: 0.8, vary: 0.04 });
}

function house() {
  form([[594, 14], [717, 52], [655, 357], [600, 397]], C.towerPink, { vary: 0.12, mottle: 3, thin: 0.45, mscale: 1.4, alpha: 0.9 });
  const ctx = drawingContext, tp = [[594, 14], [717, 52], [655, 357], [600, 397]];
  ctx.save(); trace(tp); ctx.clip();
  for (let i = 0; i < 9; i++) {   // rose blooms in the wet pink
    const x = rnd(600, 700), y = rnd(40, 380), r = rnd(14, 40), g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba([196, 120, 160], 0.3)); g.addColorStop(1, rgba([196, 120, 160], 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  form([[280, 328], [445, 100], [475, 133]], C.roofGreen, { vary: 0.2, mottle: 2 });
  form([[475, 133], [495, 117], [557, 218]], C.arrowGreen, { vary: 0.15 });
  const maroon = [[280, 328], [472, 137], [557, 218], [535, 42], [594, 12], [600, 300], [603, 597], [541, 520], [548, 410], [405, 272], [306, 400]];
  form(maroon, C.maroon, { vary: 0.16, mottle: 1.8, dense: 1.3, thin: 0.3, lw: 2 });
  gline([[557, 218], [598, 222]], { w: 1.2 });

  const pent = [[405, 272], [548, 410], [541, 520], [357, 585], [306, 400]];
  gouache(pent, C.black, { vary: 0.05, wob: 0.6 });
  const chev = [
    [[357, 340], [377, 435], [477, 325], [447, 300], [395, 372], [380, 307]],
    [[300, 398], [365, 527], [575, 380], [545, 338], [367, 495], [327, 372]],
    [[296, 405], [352, 604], [575, 508], [575, 452], [362, 553], [324, 436]],
  ];
  for (const v of chev) gouache(v, C.chevY, { clip: pent, vary: 0.08, wob: 1.6, mottle: 0.8 });
  for (const v of chev) gline(v, { closed: true, clip: pent, w: 1, col: [120, 110, 70] });
  outline(pent, { w: 1.8 });

  const dotFace = [[280, 328], [306, 400], [357, 585], [283, 712], [274, 700]];
  form(dotFace, C.dotFace, { vary: 0.15, mottle: 2.5, thin: 0.6, alpha: 0.9 });
  dabs(dotFace, 300, [[226, 56, 52], [236, 72, 60]], { s0: 3, s1: 6.5, ang: 1.2, where: (x, y) => (y > 490 ? 0.95 : y > 430 ? 0.3 : 0) });
  form([[357, 585], [541, 520], [603, 597], [283, 712]], C.mauve, { vary: 0.14, mottle: 2.4, thin: 0.5, alpha: 0.92, dir: -0.35, len: 1.5 });
  form([[543, 433], [604, 478], [604, 495], [543, 448]], C.strip, { vary: 0.06 });

  // the arrow pushed into the tower
  form([[517, 252], [598, 222], [598, 292]], C.arrowGrey);
  form([[598, 222], [690, 188], [660, 322], [598, 292]], C.arrowGreen, { vary: 0.18, mottle: 2 });
}

function leftForms() {
  form([[35, 125], [60, 80], [85, 97], [74, 368], [26, 325]], C.lav, { vary: 0.12, mottle: 2.5, thin: 0.6, alpha: 0.88, dir: 1.55 });
  form([[85, 97], [150, 52], [197, 186], [120, 302], [73, 370]], C.gb, { vary: 0.12, mottle: 2.5, thin: 0.5, alpha: 0.9 });
  form([[60, 78], [112, 43], [150, 52], [93, 95]], C.lime);
  gline([[70, 110], [84, 102], [97, 88]], { col: [200, 50, 50], w: 1.6 });

  form([[250, 120], [295, 117], [223, 262], [207, 222], [221, 187]], C.gb, { vary: 0.1, mottle: 2, alpha: 0.9 });
  form([[295, 117], [272, 258], [223, 262]], [222, 208, 212], { vary: 0.06, alpha: 0.9 });

  form([[197, 190], [207, 222], [131, 387], [120, 302], [134, 283]], C.lime, { vary: 0.08 });
  form([[104, 172], [135, 198], [134, 283], [120, 302]], C.red);
  form([[135, 198], [197, 190], [134, 283]], C.frame, { vary: 0.14 });
  form([[104, 172], [197, 187], [135, 198]], C.lime);
  form([[197, 187], [221, 187], [207, 222]], [240, 190, 205]);

  form([[179, 308], [188, 413], [112, 461]], C.red, { vary: 0.08 });
  form([[188, 413], [186, 440], [112, 461]], C.gb);
}

function pyramid() {
  form([[24, 664], [275, 446], [122, 660]], C.pyY, { vary: 0.08, mottle: 1.5 });
  form([[122, 660], [275, 446], [163, 756]], C.pyO, { vary: 0.08 });
  gline([[262, 470], [158, 748]], { w: 1.1 });
  form([[22, 665], [120, 660], [162, 755], [38, 788]], C.frame, { vary: 0.14, lw: 2 });
  form([[52, 684], [108, 680], [60, 752]], C.inGreen, { vary: 0.15 });
  form([[108, 680], [132, 733], [60, 752]], C.inGrey);
}

function accents() {
  dab(1148, 698, 10.5, 10, 0, C.dot, 0.95);
  for (let i = 0; i < 9; i++) dab(rnd(255, 262), rnd(215, 250), 1.2, 1.6, 0, [30, 28, 30], 0.8);   // stray ink flecks
  dab(690, 125, 2.4, 1.4, 0.2, [30, 28, 30], 0.85); dab(682, 165, 1.8, 1.4, 0, [30, 28, 30], 0.85);
}
