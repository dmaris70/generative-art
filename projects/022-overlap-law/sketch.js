// Overlap Law — the parts of 021-crescent-study, taken apart, morphed and put back together.
// MECHANISM: a form has no colour of its own — pigment is assigned by what it overlaps
// (inside the plate black turns brown and a disc turns from orange to oxblood; the bright
// sector exists only where a hidden quadrilateral meets a disc; the shadow greens where its
// own circle crosses it) — so re-arranging the same twelve parts repaints them.
// morph = continuous deformation of each part · recompose = discrete re-anchoring (quarter
// turns about the plate, the scroll re-attached to another tip, mirror, palette regime) ·
// explode = pull the parts away from the plate and watch the overlap colours switch off ·
// parts = specimen sheet of the twelve components in their base colours.
// morph 0 / recompose 0 reassembles the source. Keys: R new seed · S save PNG.

let G, R, S = 1, LW = 1;
const W = 2000, H = 1429;

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

// ───────────────────────── regimes: colour by ROLE ─────────────────────────
const PAL = [
  { name: 'source', ground: [32, 91, 48], plateA: [108, 151, 184], plateB: [158, 153, 60], plateB2: [174, 169, 66],
    shadow: [80, 60, 16], shadowIn: [84, 87, 19], beak: [21, 22, 19], beakIn: [42, 36, 24], disc: [137, 32, 20],
    discOut: [180, 38, 4], sector: [212, 4, 12], sectorL: [255, 90, 60], horn: [238, 168, 3], dome: [86, 131, 163],
    white: [237, 231, 196], blade: [14, 19, 40], bladeL: [34, 58, 150], tail: [21, 22, 19] },
  { name: 'oxblood', ground: [98, 30, 28], plateA: [198, 182, 146], plateB: [72, 98, 112], plateB2: [96, 124, 136],
    shadow: [44, 52, 60], shadowIn: [28, 38, 50], beak: [20, 20, 22], beakIn: [50, 40, 34], disc: [22, 86, 82],
    discOut: [14, 60, 72], sector: [236, 172, 24], sectorL: [255, 220, 120], horn: [214, 92, 40], dome: [222, 212, 186],
    white: [236, 229, 198], blade: [16, 40, 36], bladeL: [40, 130, 110], tail: [20, 20, 22] },
  { name: 'slate', ground: [54, 68, 88], plateA: [222, 196, 122], plateB: [170, 72, 50], plateB2: [192, 98, 66],
    shadow: [72, 38, 30], shadowIn: [46, 26, 26], beak: [22, 22, 24], beakIn: [58, 44, 30], disc: [30, 36, 40],
    discOut: [84, 84, 80], sector: [236, 229, 198], sectorL: [255, 255, 240], horn: [44, 112, 82], dome: [30, 36, 40],
    white: [236, 229, 198], blade: [120, 24, 22], bladeL: [214, 60, 40], tail: [22, 22, 24] },
  { name: 'ochre', ground: [184, 138, 42], plateA: [34, 62, 112], plateB: [228, 221, 196], plateB2: [206, 198, 170],
    shadow: [92, 96, 100], shadowIn: [60, 66, 74], beak: [22, 22, 20], beakIn: [10, 22, 52], disc: [150, 34, 24],
    discOut: [96, 22, 18], sector: [24, 100, 62], sectorL: [90, 170, 120], horn: [22, 22, 20], dome: [214, 60, 30],
    white: [240, 234, 204], blade: [22, 22, 20], bladeL: [90, 90, 84], tail: [150, 34, 24] },
];

// ───────────────────────── the twelve parts ─────────────────────────
const PC = [640, 768], HW0 = 252, HH0 = 410;          // plate centre and half-size in the source
const HUB = [539, 637], BEAK_E = [893, 504];
let PARTS = null;
function parts() {
  if (PARTS) return PARTS;
  const blob = outline([BLOB[0], [830, 1171], [830, 505]]);      // underlaps the plate, so it always sits flush
  const horn = outline([HORN[0], HORN[1], [790, 690], [700, 720]]);  // base tucked under the disc
  const shadow = outline([[313, 1081], [374, 912], [410, 810], BROWN[3], [566, 1040], [446, 912]]);
  PARTS = {
    plate: { pts: outline(RECT), grp: 'plate', name: 'plate' },
    split: { pts: outline(OLIVE), grp: 'plate' },
    split2: { pts: outline(OLIVEL), grp: 'plate' },
    blob: { pts: blob, grp: 'edge', out: [1, 0], name: 'lobe' },
    tri: { pts: outline(TRI), grp: 'edge', out: [-1, 0], name: 'sail' },
    beak: { pts: outline(UPPER), grp: 'hub', name: 'beaked crescent', named: { H: HUB, E: BEAK_E, T: [560, 182] } },
    disc: { pts: ellipsePts(DISC[0], DISC[1], DISC[2], DISC[2]), grp: 'hub', name: 'great disc' },
    ell: { pts: ellipsePts(...ELL), grp: 'hub', name: 'small disc' },
    sector: { pts: outline([[392, 452], HUB, [719, 661], [674, 800], [392, 900]]), grp: 'hub', name: 'hidden quadrilateral' },
    horn: { pts: horn, grp: 'free', name: 'horn' },
    dome: { pts: ellipsePts(DOME[0], DOME[1], 112, 100), grp: 'edge', out: [0, 1], name: 'dome' },
    shadow: { pts: shadow, grp: 'free', name: 'shadow spike' },
    shadowC: { pts: ellipsePts(640, 1098, 270, 270), grp: 'shadow' },
    blade: { pts: outline(NAVY), grp: 'free', name: 'blade', named: { A: [662, 361], B: [560, 1044] } },
    tail: { pts: outline(LOWER), grp: 'tail', name: 'scroll', named: { start: [563, 1045] } },
  };
  return PARTS;
}

// ───────────────────────── p5 ─────────────────────────
function setup() {
  fit();
  G = GenArt.create({
    title: 'Overlap Law',
    params: {
      morph: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'morph' },
      recompose: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'recompose' },
      explode: { value: 0, min: 0, max: 1, step: 0.05, label: 'explode' },
      parts: { value: 0, min: 0, max: 1, step: 1, label: 'parts sheet' },
      brush: { value: 1, min: 0, max: 2, step: 0.1, label: 'brushwork' },
      weave: { value: 1, min: 0, max: 2, step: 0.1, label: 'linen weave' },
      cracks: { value: 1, min: 0, max: 2, step: 0.1, label: 'craquelure' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
    },
    onReset: () => redraw(),
  });
  noLoop();
}
function draw() { paintAll(); }   // every paint runs inside draw(): first canvas bit-identical to later ones
function fit() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  S = Math.min(windowWidth / W, windowHeight / H);
  createCanvas(Math.floor(W * S), Math.floor(H * S));
}
function windowResized() { fit(); G.reset(); }
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('overlap-law-' + G.seed, 'png');
}

// ───────────────────────── composition ─────────────────────────
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const centroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
const simil = (c, a, s, d) => { const ca = Math.cos(a) * s, sa = Math.sin(a) * s; return p => [c[0] + (p[0] - c[0]) * ca - (p[1] - c[1]) * sa + d[0], c[1] + (p[0] - c[0]) * sa + (p[1] - c[1]) * ca + d[1]]; };
const chain = fs => p => fs.reduce((q, f) => f(q), p);

// The composition has its own rng stream: surface parameters never move a form.
function compose() {
  const m = G.param('morph'), rc = G.param('recompose'), ex = G.param('explode');
  const Q = mulberry((G.seed ^ 0x51ab1e) >>> 0), q = (a, b) => a + (b - a) * Q();
  const P = parts(), out = {};
  const pal = Q() < rc * 0.8 ? PAL[1 + Math.floor(Q() * (PAL.length - 1))] : PAL[0];
  const mirror = Q() < rc * 0.5;

  // INVARIANT: the plate stays a rectangle; only its proportions move
  const sx = 1 + q(-0.3, 0.5) * m, sy = 1 + q(-0.35, 0.2) * m, hw = HW0 * sx, hh = HH0 * sy;
  const plateT = p => [PC[0] + (p[0] - PC[0]) * sx, PC[1] + (p[1] - PC[1]) * sy];
  const warp = p => [p[0] + (noise(p[0] * 0.0016, p[1] * 0.0016, 71) - 0.5) * 150 * m, p[1] + (noise(p[0] * 0.0016, p[1] * 0.0016, 83) - 0.5) * 150 * m];
  const turn = pr => (Q() < rc * pr ? 1 + Math.floor(Q() * 3) : 0);
  const quarter = k => simil(PC, k * HALF_PI, 1, [0, 0]);
  const jitter = (c, ka, ks, kd) => simil(c, q(-ka, ka) * m, 1 + q(-ks, ks * 1.2) * m, [q(-kd, kd) * m, q(-kd, kd) * m]);

  const T = {};
  // hub cluster turns and breathes as one body about the hub
  const hubT = chain([jitter(HUB, 0.5, 0.22, 60), quarter(turn(0.5)), warp]);
  const shadowT = chain([jitter(centroid(P.shadow.pts), 0.4, 0.25, 50), quarter(turn(0.5)), warp]);
  for (const k in P) {
    const c = P[k];
    if (c.grp === 'plate') T[k] = plateT;
    else if (c.grp === 'hub') T[k] = k === 'ell' ? chain([jitter(centroid(c.pts), 0, 0.3, 45), hubT]) : hubT;
    else if (c.grp === 'shadow' || k === 'shadow') T[k] = shadowT;
    else if (c.grp === 'edge') {
      // edge-attached: slides along its edge, may move to another edge, always stays flush
      const kq = turn(0.6), a = kq * HALF_PI, o = [c.out[0] * Math.cos(a) - c.out[1] * Math.sin(a), c.out[0] * Math.sin(a) + c.out[1] * Math.cos(a)];
      const half0 = c.out[0] ? HW0 : HH0, half1 = Math.abs(o[0]) > 0.5 ? hw : hh, sl = q(-0.35, 0.35) * m * (Math.abs(o[0]) > 0.5 ? hh : hw);
      const d = [o[0] * (half1 - half0) - o[1] * sl, o[1] * (half1 - half0) + o[0] * sl];
      T[k] = chain([jitter(centroid(c.pts), 0.18, 0.3, 0), quarter(kq), p => [p[0] + d[0], p[1] + d[1]], warp]);
    } else if (c.grp === 'free') T[k] = chain([jitter(centroid(c.pts), 0.5, 0.3, 70), quarter(turn(0.55)), warp]);
  }
  // the scroll is a rigid continuation of whatever tip it is tied to
  const tips = [['blade', 'B'], ['blade', 'A'], ['beak', 'T']], pick = Q() < rc * 0.7 ? 1 + Math.floor(Q() * 2) : 0;
  const tip = T[tips[pick][0]](P[tips[pick][0]].named[tips[pick][1]]), ts = 1 + q(-0.2, 0.25) * m, start = P.tail.named.start;
  if (pick === 0) { const bt = T.blade; T.tail = chain([simil(start, q(-0.3, 0.3) * m, ts, [0, 0]), bt]); }
  else {
    // leave by the direction that costs the canvas least (a landscape sheet wants a lateral escape), then farthest from the plate
    let best = null;
    const tp = P.tail.pts.filter((_, i) => i % 6 === 0), a0 = q(0, TAU), tr = ts * q(0.62, 0.9) / ts;
    for (let i = 0; i < 12; i++) {
      const f = simil(start, a0 + i * TAU / 12, ts * tr, [tip[0] - start[0], tip[1] - start[1]]);
      let x0 = PC[0] - hw - 200, x1 = PC[0] + hw + 330, y0 = PC[1] - hh - 60, y1 = PC[1] + hh + 60, far = 0;
      for (const p of tp) { const z = f(p); x0 = Math.min(x0, z[0]); x1 = Math.max(x1, z[0]); y0 = Math.min(y0, z[1]); y1 = Math.max(y1, z[1]); far += Math.hypot(z[0] - PC[0], z[1] - PC[1]); }
      const sc = Math.min((W - 260) / (x1 - x0), (H - 230) / (y1 - y0)) + far / tp.length / 6000;
      if (!best || sc > best.sc) best = { sc, f };
    }
    T.tail = chain([best.f, warp]);
  }

  for (const k in P) {
    const c = P[k], f = T[k];
    out[k] = { pts: c.pts.map(f), name: c.name, named: {} };
    for (const n in c.named || {}) out[k].named[n] = f(c.named[n]);
  }
  // explode: every part retreats from the plate along its own radius
  if (ex > 0) for (const k in out) {
    if (P[k].grp === 'plate') continue;
    const src = k === 'shadowC' ? out.shadow : out[k], c = centroid(src.pts), d = [(c[0] - PC[0]) * ex * 1.1, (c[1] - PC[1]) * ex * 1.1];
    const mv = p => [p[0] + d[0], p[1] + d[1]];
    out[k].pts = out[k].pts.map(mv); for (const n in out[k].named) out[k].named[n] = mv(out[k].named[n]);
  }
  // fit the whole synthesis back onto the canvas, then mirror
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const k in out) if (k !== 'sector' && k !== 'shadowC') for (const p of out[k].pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const free = m + rc + ex > 0, ks = free ? Math.min(1.15, (W - 260) / (x1 - x0), (H - 230) / (y1 - y0)) : 1;
  const fitT = p => { const x = free ? W / 2 + (p[0] - (x0 + x1) / 2) * ks : p[0], y = free ? H / 2 + (p[1] - (y0 + y1) / 2) * ks : p[1]; return [mirror ? W - x : x, y]; };
  for (const k in out) { out[k].pts = out[k].pts.map(fitT); for (const n in out[k].named) out[k].named[n] = fitT(out[k].named[n]); }
  return { c: out, pal, mirror };
}

// ───────────────────────── painting ─────────────────────────
function bladeStrokes(pts, pal) {
  const ctx = drawingContext, fl = flowAlong(pts), nb = bounds(pts);
  ctx.save(); trace(pts); ctx.clip(); ctx.lineCap = 'round';
  for (let i = 0; i < 1500 * G.param('brush'); i++) {
    let x = nb.x + rnd(nb.w), y = nb.y + rnd(nb.h);
    ctx.strokeStyle = rgba(mixc(pal.bladeL, pal.blade, rnd(0.6)), rnd(0.15, 0.5)); ctx.lineWidth = rnd(0.7, 2.6);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { const a = fl(x, y) + rnd(-0.1, 0.1); x += Math.cos(a) * 12; y += Math.sin(a) * 12; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
const isWhite = c => c[0] + c[1] + c[2] > 640;
function form(pts, col, o = {}) {                       // whites always crack
  const hp = oil(pts, col, Object.assign({ dense: true }, o));
  if (isWhite(col)) { const ctx = drawingContext; ctx.save(); for (const c of o.clips || []) { traceAll(c.polys); ctx.clip(c.rule || 'nonzero'); } craquelure(hp); ctx.restore(); }
  return hp;
}

function paintAll() {
  R = G.rng;
  randomSeed(G.seed); noiseSeed(G.seed);
  LW = G.param('wobble');
  const ctx = drawingContext;
  resetMatrix(); scale(S);
  const { c, pal, mirror } = compose();
  ground(pal.ground);
  if (G.param('parts') >= 1) { partsSheet(c, pal); finish(); return; }

  const h = {}; for (const k in c) h[k] = hand(c[k].pts);           // the same hand for fills and for the clips that cut them
  halo([h.blob, h.tail, h.beak, h.plate, h.tri], pal.ground);
  const inPlate = { polys: [h.plate] }, outPlate = { polys: [[[-9e3, -9e3], [9e3, -9e3], [9e3, 9e3], [-9e3, 9e3]], h.plate], rule: 'evenodd' };
  const H1 = c.beak.named.H, E1 = c.beak.named.E, dx = E1[0] - H1[0], dy = E1[1] - H1[1], L = Math.hypot(dx, dy) || 1, sgn = mirror ? -1 : 1;

  form(c.blob.pts, pal.white, { dir: 0.3, vary: 0.05, rim: 0.2, grow: 1.5 });
  form(c.plate.pts, pal.plateA, { dir: HALF_PI, vary: 0.12 });
  form(c.split.pts, pal.plateB, { dir: HALF_PI, vary: 0.08, clips: [inPlate] });
  form(c.split2.pts, pal.plateB2, { dir: HALF_PI * 0.8, vary: 0.07, rim: 0.18, clips: [inPlate] });
  form(c.tri.pts, pal.white, { dir: 0.8, vary: 0.05, rim: 0.2 });

  form(c.beak.pts, pal.beak, { flow: flowAlong(h.beak), vary: 0.12, rim: 0 });
  form(c.beak.pts, pal.beakIn, { flow: flowAlong(h.beak), vary: 0.14, rim: 0.25, clips: [inPlate] });
  form(c.horn.pts, pal.horn, { dir: HALF_PI, vary: 0.06, rim: 0.22 });
  form(c.dome.pts, pal.dome, { dir: 0, vary: 0.1, clips: [inPlate] });
  form(c.shadow.pts, pal.shadow, { dir: -0.9, vary: 0.13 });
  form(c.shadowC.pts, pal.shadowIn, { dir: 0.2, vary: 0.12, clips: [{ polys: [h.shadow] }] });

  // the great disc lives only inside the plate and on the far side of the beak's lower edge
  const n = [-dy / L * sgn, dx / L * sgn], far = 6000, a = [H1[0] - dx / L * far, H1[1] - dy / L * far], b = [E1[0] + dx / L * far, E1[1] + dy / L * far];
  const half = { polys: [[a, b, [b[0] + n[0] * far, b[1] + n[1] * far], [a[0] + n[0] * far, a[1] + n[1] * far]]] };
  form(c.disc.pts, pal.disc, { dir: 0.4, vary: 0.1, clips: [inPlate, half] });
  form(c.ell.pts, pal.discOut, { dir: HALF_PI, vary: 0.08, rim: 0.1 });
  form(c.ell.pts, pal.disc, { dir: 0.4, vary: 0.1, clips: [inPlate] });
  form(c.sector.pts, pal.sector, { dir: 0.15, vary: 0.07, light: pal.sectorL, rim: 0.35, clips: [{ polys: [h.disc, h.ell] }, inPlate] });

  form(c.tail.pts, pal.tail, { grow: 1.5, flow: flowAlong(h.tail), vary: 0.14, light: [120, 120, 110], rim: 0 });
  form(c.blade.pts, pal.blade, { flow: flowAlong(h.blade), vary: 0.1, rim: 0.1 });
  bladeStrokes(h.blade, pal);
  finish();
}

function finish() {
  const ctx = drawingContext, vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(12,16,12,0)'); vg.addColorStop(1, 'rgba(12,16,12,0.3)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  linen();
}

// specimen sheet: each part alone, in the colour it has when it overlaps nothing
function partsSheet(c, pal) {
  const ctx = drawingContext, keys = Object.keys(c).filter(k => c[k].name), cols = 4, rows = Math.ceil(keys.length / cols);
  const cw = (W - 160) / cols, ch = (H - 140) / rows;
  const base = { plate: pal.plateA, blob: pal.white, tri: pal.white, beak: pal.beak, disc: pal.disc, ell: pal.discOut, sector: pal.sector,
    horn: pal.horn, dome: pal.dome, shadow: pal.shadow, blade: pal.blade, tail: pal.tail };
  keys.forEach((k, i) => {
    const bb = bounds(c[k].pts), s = Math.min(1, cw * 0.78 / bb.w, (ch - 60) * 0.85 / bb.h);
    const cx = 80 + cw * (i % cols + 0.5), cy = 60 + ch * (Math.floor(i / cols) + 0.5) - 14;
    const pts = c[k].pts.map(p => [cx + (p[0] - bb.x - bb.w / 2) * s, cy + (p[1] - bb.y - bb.h / 2) * s]);
    const hp = form(pts, base[k], { vary: 0.1, flow: k === 'tail' || k === 'blade' || k === 'beak' ? flowAlong(pts) : undefined });
    if (k === 'blade') bladeStrokes(hp, pal);
    ctx.fillStyle = rgba(mixc(pal.ground, [255, 250, 225], 0.7), 0.85); ctx.font = '22px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(c[k].name + (s < 1 ? '  ×' + s.toFixed(2) : ''), cx, 60 + ch * (Math.floor(i / cols) + 1) - 18);
  });
}
