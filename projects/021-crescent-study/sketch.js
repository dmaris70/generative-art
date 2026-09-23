// Crescent study — a copy, in code, of an abstract oil on linen (green ground, black
// crescent with a scroll tail, discs, cream forms). Hand transcription of the
// composition into splines and polygons (source space 2000 × 1429), repainted
// procedurally as OIL ON LINEN: scumbled ground, opaque flat passages with visible
// brushwork, soft hand edges, craquelure in the lead-white forms, a woven-canvas
// relief pass and a faint varnish vignette.
// The seed changes the HAND (wobble, brushwork, cracks), never the composition.
// Keys: R new hand · S save PNG.

let G, R, S = 1, LW = 1;
const W = 2000, H = 1429;

const C = {
  green: [32, 91, 48], greenD: [20, 72, 36], greenL: [48, 118, 62],
  blue: [108, 151, 184], dome: [86, 131, 163],
  olive: [158, 153, 60], oliveL: [174, 169, 66], dkolive: [84, 87, 19],
  brown: [80, 60, 16], wedge: [42, 36, 24], black: [21, 22, 19],
  dkred: [137, 32, 20], red: [212, 4, 12], orange: [180, 38, 4],
  yellow: [238, 168, 3], white: [237, 231, 196], navy: [14, 19, 40], navyL: [34, 58, 150],
  crack: [74, 58, 36],
};

// ───────────────────────── composition (source px) ─────────────────────────
const RECT = [[395, 358], [897, 360], [890, 1173], [382, 1183]];
const K = c => ({ c });                       // a smooth run through these points

const UPPER = [K([[560, 182], [620, 189], [680, 213], [740, 249], [800, 300], [848, 360], [878, 420], [893, 504]]),
  [539, 637], [757, 430], K([[737, 360], [722, 330], [680, 276], [620, 216], [560, 182]])];

// LOWER, BLOB and HORN are traced from the source by contour extraction, then splined; LOWER includes the scroll and its ball
const LOWER = [K([[1680, 557], [1667, 537], [1645, 519], [1617, 505], [1586, 499], [1556, 500], [1522, 510], [1463, 551], [1430, 587], [1389, 649], [1278, 869], [1214, 975], [1163, 1040], [1125, 1079], [1082, 1115], [1026, 1147], [970, 1166], [921, 1175], [847, 1176], [786, 1166], [698, 1137], [621, 1092], [576, 1054], [592, 1099], [629, 1151], [676, 1199], [732, 1240], [800, 1274], [878, 1297], [894, 1295], [916, 1303], [964, 1306], [1032, 1300], [1078, 1289], [1124, 1272], [1161, 1252], [1216, 1209], [1249, 1174], [1286, 1119], [1337, 1005], [1368, 901], [1415, 713], [1448, 623], [1471, 584], [1509, 545], [1542, 525], [1572, 517], [1607, 519], [1635, 530], [1651, 544], [1619, 561], [1608, 576], [1607, 605], [1630, 629], [1648, 632], [1668, 626], [1685, 605], [1687, 578], [1680, 557]])];

const NAVY = [K([[662, 361], [584, 414], [536, 474], [488, 534], [452, 594], [428, 660], [413, 720], [410, 780],
  [416, 840], [434, 900], [464, 960], [512, 1008], [560, 1044]]),
K([[560, 1044], [536, 990], [518, 930], [506, 870], [499, 810], [494, 750], [494, 690], [500, 630], [512, 582],
  [536, 522], [572, 462], [620, 402], [662, 361]])];

const BLOB = [K([[898, 505], [943, 490], [991, 483], [1065, 483], [1112, 493], [1133, 501], [1166, 520], [1204, 560], [1215, 579], [1238, 640], [1244, 705], [1238, 740], [1227, 768], [1209, 794], [1164, 833], [1131, 844], [1100, 848], [974, 842], [932, 856], [916, 873], [904, 900], [906, 941], [928, 965], [992, 993], [1013, 1011], [1026, 1041], [1025, 1083], [1009, 1122], [980, 1150], [937, 1167], [893, 1171]])];

const TRI = [[230, 753], [425, 685], [500, 800], [560, 1044], [626, 1149], [614, 1164]];
const BROWN = [[313, 1081], [374, 912], [410, 810], K([[500, 741], [590, 771], [674, 780]]),
  K([[656, 828], [620, 829], [560, 840], [500, 864]]), [446, 912], [413, 951]];
const DKOLIVE = [K([[500, 864], [560, 840], [620, 829], [656, 828]]), [566, 1040], [500, 900]];
const OLIVE = [[750, 358], [897, 360], [890, 1173], [700, 1182], [600, 1090], [566, 1040], [674, 780], [760, 430]];
const OLIVEL = [[674, 782], [566, 1040], [600, 1090], [700, 1182], [770, 1182], K([[767, 1083], [761, 990], [740, 900], [710, 828], [680, 781]])];
const HORN = [K([[686, 784], [717, 834], [750, 909], [771, 1005], [773, 1058]]),
  K([[773, 1058], [801, 976], [814, 901], [819, 830], [818, 777], [807, 742]]), K([[807, 742], [752, 771], [710, 782], [686, 784]])];
const REDQ = [[392, 452], [539, 637], [719, 661], K([[674, 785], [640, 786], [600, 781], [560, 769], [520, 749], [500, 736], [440, 700], [405, 665], [392, 640]])];
const DISC = [650, 538, 248], DISCCLIP = [[539, 637], [893, 504], [893, 800], [495, 800], [495, 650]];
const ELL = [472, 534, 117, 131];
const DOME = [765, 1185, 118, 100];

// ───────────────────────── p5 ─────────────────────────
function setup() {
  fit();
  G = GenArt.create({
    title: 'Crescent study',
    params: {
      brush: { value: 1, min: 0, max: 2, step: 0.1, label: 'brushwork' },
      weave: { value: 1, min: 0, max: 2, step: 0.1, label: 'linen weave' },
      cracks: { value: 1, min: 0, max: 2, step: 0.1, label: 'craquelure' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
    },
    onReset: () => redraw(),
  });
  noLoop();
}

// every paint runs inside p5's draw() so the first canvas is bit-identical to later ones
function draw() { paintAll(); }

function fit() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  S = Math.min(windowWidth / W, windowHeight / H);
  createCanvas(Math.floor(W * S), Math.floor(H * S));
}
function windowResized() { fit(); G.reset(); }   // reset rewinds the rng: a resize must not change the painting
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('crescent-study-' + G.seed, 'png');
}

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
    ctx.strokeStyle = rgba(C.crack, rnd(0.3, 0.6)); ctx.lineWidth = w; ctx.stroke();
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
    ctx.fillStyle = rgba(rnd() < 0.5 ? C.crack : [190, 170, 110], rnd(0.08, 0.3));
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
function ground() {
  const ctx = drawingContext, bw = G.param('brush');
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
function halo(list) {
  const ctx = drawingContext;
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

// ───────────────────────── painting ─────────────────────────
function paintAll() {
  R = G.rng;
  randomSeed(G.seed); noiseSeed(G.seed);
  LW = G.param('wobble');
  const ctx = drawingContext;
  resetMatrix();
  scale(S);

  ground();
  const BLOBS = outline(BLOB), LOWERS = outline(LOWER), HORNS = outline(HORN);
  const blobP = hand(BLOBS), lowP = hand(LOWERS), upP = hand(outline(UPPER)), rectP = hand(outline(RECT));
  halo([blobP, lowP, upP, rectP, hand(outline(TRI))]);

  oil(RECT, C.blue, { dir: HALF_PI, vary: 0.12 });
  oil(OLIVE, C.olive, { dir: HALF_PI, vary: 0.08 });
  oil(OLIVEL, C.oliveL, { dir: HALF_PI * 0.8, vary: 0.07, rim: 0.18 });

  const triP = oil(TRI, C.white, { dir: 0.8, vary: 0.05, rim: 0.2 });
  craquelure(triP);
  oil(BLOBS, C.white, { dense: true, grow: 1.5, dir: 0.3, vary: 0.05, rim: 0.2 });
  craquelure(blobP);

  // upper crescent; inside the rectangle the black is a warmer, thinner brown-black
  oil(UPPER, C.black, { flow: flowAlong(upP), vary: 0.12, rim: 0 });
  ctx.save(); trace(rectP); ctx.clip();
  oil(UPPER, C.wedge, { flow: flowAlong(upP), vary: 0.14, rim: 0.25 });
  ctx.restore();

  oil(HORNS, C.yellow, { dense: true, grow: 3, dir: HALF_PI, vary: 0.06, rim: 0.22 });
  oil(ellipsePts(...DOME), C.dome, { dense: true, dir: 0, vary: 0.1, clip: rectP });
  oil(BROWN, C.brown, { dir: -0.9, vary: 0.13 });
  oil(DKOLIVE, C.dkolive, { dir: 0.2, vary: 0.12 });

  oil(ellipsePts(DISC[0], DISC[1], DISC[2], DISC[2]), C.dkred, { dense: true, dir: 0.4, vary: 0.1, clip: hand(outline(DISCCLIP)) });
  const ell = ellipsePts(...ELL);
  oil(ell, C.dkred, { dense: true, dir: 0.4, vary: 0.1 });
  oil(ell, C.orange, { dense: true, dir: HALF_PI, vary: 0.08, rim: 0.1, clip: [[300, 380], [RECT[0][0] - 2, 380], [RECT[3][0] + 6, 700], [300, 700]] });
  oil(REDQ, C.red, { dir: 0.15, vary: 0.07, light: [255, 90, 60], rim: 0.35 });

  oil(LOWERS, C.black, { dense: true, grow: 1.5, flow: flowAlong(lowP), vary: 0.14, light: [120, 120, 110], rim: 0 });

  // navy crescent: near-black body with ultramarine dragged along its length
  const navP = hand(outline(NAVY));
  oil(NAVY, C.navy, { flow: flowAlong(navP), vary: 0.1, rim: 0.1 });
  ctx.save(); trace(navP); ctx.clip(); ctx.lineCap = 'round';
  const fl = flowAlong(navP), nb = bounds(navP);
  for (let i = 0; i < 1500 * G.param('brush'); i++) {
    let x = nb.x + rnd(nb.w), y = nb.y + rnd(nb.h);
    ctx.strokeStyle = rgba(mixc(C.navyL, [10, 12, 30], rnd(0.6)), rnd(0.15, 0.5)); ctx.lineWidth = rnd(0.7, 2.6);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { const a = fl(x, y) + rnd(-0.1, 0.1); x += Math.cos(a) * 12; y += Math.sin(a) * 12; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();

  // varnish: edges of the canvas sit a little darker
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(10,30,15,0)'); vg.addColorStop(1, 'rgba(10,30,15,0.3)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  linen();

}
