// Plotter Interrupt — a drawing that behaves like a plot, including its failure.
//
// A command menu is set in single-stroke type down the left edge — a real HP-GL
// program, every number in it measured off the drawing beside it: the scaling points
// and clip window are the field's own corners in plotter units, LT1's pattern length
// is the actual dot spacing, PT is the nib in millimetres, and the PU/PD pairs are an
// excerpt of the real marks. The field to its right is ruled by
// families of irregular dotted lines, vertical and diagonal, over which heavy
// fragmented horizontal bars are scattered along a diagonal axis: the focal points,
// drawn dark the way a plotter actually gets dark — the same stroke laid down
// several times.
//
// Then something goes wrong. A void opens where the pen never came down, lines stop
// at its edge, and those that resume on the far side come back misregistered. The
// interruption is generated, not painted: it is the composition's largest gesture.
//
// Stroke-only and plotter-ready — press V for SVG. See docs/plotter-guide.md.
// Keys: R randomize · S save PNG · V save SVG.

let G;

const PAPER = [240, 237, 228];
const INK = [24, 24, 26];

let ink = []; // every mark in the piece: { pts: [{x,y}…], passes }
let U = 1; // scale unit, so the composition holds at any window size
let field; // { x0, y0, x1, y1 } — the drawable area right of the menu
let hole; // { cx, cy, r, verts } or null

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  G = GenArt.create({
    title: 'Plotter Interrupt',
    params: {
      density: { value: 90, min: 20, max: 200, step: 5, label: 'ruling density' },
      dots: { value: 5.5, min: 2, max: 16, step: 0.5, label: 'dot spacing' },
      angle: { value: 38, min: 10, max: 80, step: 1, label: 'diagonal angle' },
      bars: { value: 12, min: 0, max: 30, step: 1, label: 'heavy bars' },
      gap: { value: 0.42, min: 0, max: 1, step: 0.02, label: 'void' },
      drift: { value: 0.45, min: 0, max: 1, step: 0.02, label: 'irregularity' },
    },
    onReset: reset,
  });

  if (window.Plotter) Plotter.attach(G, { filename: 'plotter-interrupt' });

  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  build();
  render();
}

function draw() {} // static — the plot is finished the moment it is composed

// ---------------------------------------------------------------- utilities

const rnd = (a, b) => a + G.rng() * (b - a);
const pick = (arr) => arr[Math.floor(G.rng() * arr.length) % arr.length];
const chance = (p) => G.rng() < p;

// A mark. `passes` > 1 lays the same stroke down repeatedly, offset by a fraction
// of a nib — the only way a pen has of drawing a heavier line.
function addStroke(pts, passes) {
  if (pts.length < 2) return;
  const n = passes || 1;
  if (n === 1) {
    ink.push({ pts: pts });
    return;
  }
  const a = pts[0], b = pts[pts.length - 1];
  const d = dist(a.x, a.y, b.x, b.y) || 1;
  const px = -(b.y - a.y) / d, py = (b.x - a.x) / d;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.55 * U;
    ink.push({ pts: pts.map((p) => ({ x: p.x + px * o, y: p.y + py * o })) });
  }
}

function inField(x, y) {
  return x >= field.x0 && x <= field.x1 && y >= field.y0 && y <= field.y1;
}

// Ray-cast point-in-polygon — the void is an irregular closed shape.
function inHole(x, y) {
  if (!hole) return false;
  // cheap reject first: the bounding circle
  const dx = x - hole.cx, dy = y - hole.cy;
  if (dx * dx + dy * dy > hole.rmax * hole.rmax) return false;
  const v = hole.verts;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    if ((v[i].y > y) !== (v[j].y > y) &&
        x < ((v[j].x - v[i].x) * (y - v[i].y)) / (v[j].y - v[i].y) + v[i].x) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------- composition

function build() {
  ink = [];
  // clamped: a hidden/zero-size canvas would otherwise give a zero step below
  U = max(min(width, height), 320) / 900;

  const m = min(width, height) * 0.055;
  const menuW = constrain(width * 0.2, min(110, width * 0.26), 320);
  field = { x0: m + menuW + 26 * U, y0: m, x1: width - m, y1: height - m };
  if (field.x1 - field.x0 < 80) field.x0 = m; // very narrow window: menu overlays

  buildHole();
  buildRuling();
  buildBars();
  buildArtifacts();
  buildMenu(m, menuW);
  buildMarks();
}

// The void: an irregular blob the pen never entered.
function buildHole() {
  const amount = G.param('gap');
  if (amount < 0.04) {
    hole = null;
    return;
  }
  const fw = field.x1 - field.x0, fh = field.y1 - field.y0;
  const r = amount * min(fw, fh) * 0.36;
  const cx = field.x0 + rnd(0.25, 0.78) * fw;
  const cy = field.y0 + rnd(0.2, 0.8) * fh;
  const squash = rnd(0.55, 1.5); // some voids are bands, some are patches
  const wob = rnd(0.18, 0.5); // how ragged the edge is
  const verts = [];
  let rmax = 0;
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = (TWO_PI * i) / N;
    const n = noise(cos(a) * 1.4 + 40, sin(a) * 1.4 + 40);
    const rr = r * (1 - wob + 2 * wob * n);
    const px = cx + cos(a) * rr * squash;
    const py = cy + sin(a) * rr;
    verts.push({ x: px, y: py });
    rmax = max(rmax, dist(cx, cy, px, py));
  }
  hole = { cx, cy, r, rmax, verts };
}

// The two ruling families: verticals and diagonals, both dotted, both irregular.
function buildRuling() {
  const n = G.param('density');
  const a = radians(G.param('angle'));
  const twoWay = chance(0.55); // sometimes the diagonals mirror

  const nVert = Math.round(n * rnd(0.4, 0.6));
  const nDiag = n - nVert;

  // --- verticals: walked left to right with clustered, irregular spacing
  const span = field.x1 - field.x0;
  let x = field.x0 + rnd(0, 0.03) * span;
  const base = span / max(nVert, 1);
  for (let i = 0; i < nVert && x < field.x1; i++) {
    const tilt = radians(rnd(-3.5, 3.5)); // never quite plumb
    dottedRay(x, field.y0 - 10, HALF_PI + tilt, i);
    x += base * (0.3 + 2.0 * pow(G.rng(), 1.7));
  }

  // --- diagonals: spaced along the perpendicular of each family's direction
  const fams = twoWay ? [a, PI - a] : [a];
  const per = Math.max(1, Math.round(nDiag / fams.length));
  for (let f = 0; f < fams.length; f++) {
    const ang = fams[f];
    const nx = -sin(ang), ny = cos(ang);
    const cx = (field.x0 + field.x1) / 2, cy = (field.y0 + field.y1) / 2;
    const reach = (abs(field.x1 - field.x0) * abs(nx) + abs(field.y1 - field.y0) * abs(ny)) / 2;
    let o = -reach;
    const stepBase = (2 * reach) / per;
    for (let i = 0; i < per * 2 && o < reach; i++) {
      dottedRay(cx + nx * o, cy + ny * o, ang, 500 + f * 97 + i);
      o += stepBase * (0.3 + 2.0 * pow(G.rng(), 1.7));
    }
  }
}

// Walk a line across the field, laying down dashes with irregular gaps, skipping
// the void — and jumping registration once the pen has crossed it.
function dottedRay(px, py, ang, seedOff) {
  const dx = cos(ang), dy = sin(ang);
  const nx = -dy, ny = dx;
  const drift = G.param('drift');
  const spacing = G.param('dots') * U;

  const reach = dist(field.x0, field.y0, field.x1, field.y1);
  const step = 1.6 * U;
  const wanderAmp = drift * 9 * U * (0.3 + G.rng());
  const wanderScale = 0.0016 / (0.4 + drift);
  const jump = chance(0.45) ? rnd(-3.2, 3.2) * U * (0.4 + drift) : 0;

  // Each ruling is set differently: most are fine dotting, a few are near-solid
  // dashed lines and a few are sparse and open. That spread is what keeps the
  // field from reading as one flat texture.
  const kind = G.rng();
  const gapMul = kind < 0.16 ? rnd(0.25, 0.55) : kind < 0.82 ? rnd(0.8, 1.3) : rnd(1.8, 3.6);
  const dashMul = kind < 0.16 ? rnd(2.5, 6) : rnd(0.8, 1.4);
  const passes = kind < 0.08 ? 2 : 1; // a handful get re-inked
  const dashLen = () => rnd(0.4, 2.6) * U * dashMul;

  let down = chance(0.5);
  let need = down ? dashLen() : spacing * gapMul * rnd(0.5, 1.6);
  let acc = 0;
  let crossed = false;
  let run = [];

  const flush = () => {
    if (run.length > 1) addStroke(run, passes);
    else if (run.length === 1) addStroke([run[0], { x: run[0].x + dx * 0.6 * U, y: run[0].y + dy * 0.6 * U }], passes);
    run = [];
  };

  for (let t = -reach; t < reach; t += step) {
    const w = (noise((t + seedOff * 130) * wanderScale, seedOff * 0.37) - 0.5) * 2 * wanderAmp;
    const off = w + (crossed ? jump : 0);
    const x = px + dx * t + nx * off;
    const y = py + dy * t + ny * off;

    acc += step;
    if (acc >= need) {
      acc = 0;
      if (down) {
        flush();
        // an occasional long gap: the ruling breathes rather than ticking evenly
        need = spacing * gapMul * (chance(0.07) ? rnd(4, 14) : rnd(0.5, 1.7));
        down = false;
      } else {
        need = dashLen() * (chance(0.06) ? rnd(3, 9) : 1); // occasional long dash
        down = true;
      }
    }

    if (!inField(x, y)) {
      flush();
      continue;
    }
    if (inHole(x, y)) {
      crossed = true;
      flush();
      continue;
    }
    if (down) run.push({ x, y });
    else flush();
  }
  flush();
}

// Heavy fragmented horizontal bars, scattered along a diagonal axis.
function buildBars() {
  const n = G.param('bars');
  if (n <= 0) return;

  const fw = field.x1 - field.x0, fh = field.y1 - field.y0;
  const down = chance(0.5); // which way the axis of scatter runs
  const ax0 = field.x0 + rnd(0, 0.2) * fw;
  const ay0 = field.y0 + (down ? rnd(0, 0.2) : rnd(0.8, 1)) * fh;
  const ax1 = field.x1 - rnd(0, 0.2) * fw;
  const ay1 = field.y0 + (down ? rnd(0.8, 1) : rnd(0, 0.2)) * fh;

  for (let i = 0; i < n; i++) {
    const t = (i + rnd(-0.35, 0.35)) / max(n - 1, 1);
    const spread = rnd(-0.16, 0.16);
    let cx = lerp(ax0, ax1, t) + spread * fw * 0.5;
    let cy = lerp(ay0, ay1, t) + spread * fh * 0.5;
    if (!inField(cx, cy)) continue;

    // a few are stubby ticks, most are long bars — the weight range is the point
    const len = (chance(0.25) ? rnd(0.02, 0.06) : rnd(0.08, 0.26)) * fw;
    const passes = Math.round(rnd(3, 11));
    const frags = 1 + Math.floor(rnd(0, 4.5));
    const end = cx + len / 2;
    let x = cx - len / 2;

    // cut the bar into fragments with short gaps — the pen skipping mid-stroke
    const cuts = [];
    let remain = len;
    for (let f = 0; f < frags; f++) {
      const share = f === frags - 1 ? remain : remain * rnd(0.28, 0.62);
      cuts.push(share);
      remain -= share;
    }

    for (let f = 0; f < cuts.length && x < end; f++) {
      const x2 = min(x + cuts[f], end);
      // thickness is repetition, not stroke weight — how a pen actually gets dark
      for (let p = 0; p < passes; p++) {
        const yy = cy + (p - (passes - 1) / 2) * 0.7 * U;
        const a = { x: x, y: yy }, b = { x: x2, y: yy };
        if (inHole(a.x, a.y) || inHole(b.x, b.y)) continue;
        if (!inField(a.x, a.y) || !inField(b.x, b.y)) continue;
        addStroke([a, b], 1);
      }
      x = x2 + len * rnd(0.04, 0.2); // the gap is a fraction of the bar, not the page
    }
  }
}

// Traces of the fault itself: a pen dragged across the sheet while recovering.
function buildArtifacts() {
  if (!hole || !chance(0.6)) return;
  const n = 1 + Math.floor(rnd(0, 2.2));
  for (let i = 0; i < n; i++) {
    const ang = rnd(-0.16, 0.16) + (chance(0.5) ? 0 : PI); // a shallow drag, not a slash
    const y = field.y0 + rnd(0.1, 0.9) * (field.y1 - field.y0);
    const x0 = hole.cx + cos(ang) * hole.rmax * rnd(0.3, 1.1);
    const pts = [];
    const len = rnd(0.2, 0.75) * (field.x1 - field.x0);
    for (let t = 0; t <= len; t += 3 * U) {
      const px = x0 + cos(ang) * t;
      const py = y + sin(ang) * t + (noise(t * 0.004, i * 12) - 0.5) * 3 * U;
      if (!inField(px, py)) break;
      pts.push({ x: px, y: py });
    }
    addStroke(pts, 1);
  }
}

// ---------------------------------------------------------------- the menu

/*
 * The menu is a real HP-GL program, and every number in it is measured off the
 * drawing beside it — not decoration. Commands with no counterpart in this picture
 * (arcs, wedges, fills, symbol mode) are simply not in the vocabulary.
 *
 * Two exceptions, kept deliberately: PN and CN are not HP-GL — pen selection is SP
 * and there is no coordinate register. They are the piece's title anchors, carried
 * over from the drawing it answers to, and they are the only fiction on the sheet.
 *
 * The sheet is treated as A4 landscape at the HP standard 40 plotter units/mm, and
 * HP-GL's y axis points up, so it is flipped against the canvas.
 */
const MM_W = 297, MM_H = 210, UNITS_PER_MM = 40;

function hp(x, y) {
  return [
    Math.round((x / width) * MM_W * UNITS_PER_MM),
    Math.round(((height - y) / height) * MM_H * UNITS_PER_MM),
  ];
}
const hpStr = (x, y) => hp(x, y).join(',');
const mmPerPx = () => MM_W / width;

// The rows the piece is named for. Kept whatever else has to be dropped.
const ANCHORS = ['LT1', 'PN1', 'CN5'];
const isAnchor = (row) => ANCHORS.some((a) => row.indexOf(a) === 0);

// The program: setup measured off this drawing, an excerpt of the marks it made,
// then the tail. Every value is read from the composition, never invented.
function program(maxRows, maxCols) {
  const diag = dist(field.x0, field.y0, field.x1, field.y1);
  const dotPct = ((G.param('dots') * U) / diag) * 100; // LT pattern length is a % of P1–P2
  const nib = 1.15 * U * mmPerPx(); // the stroke weight, in mm
  const tickPct = ((4 * U) / (field.y1 - field.y0)) * 100;

  // A narrow column can't hold the four-coordinate rows; rather than shrink the type
  // into illegibility, the program itself gets terser. Anchors always survive.
  const fits = (r) => isAnchor(r) || r.length <= maxCols;

  const head = [
    'IN;',
    'IP' + hpStr(field.x0, field.y1) + ',' + hpStr(field.x1, field.y0) + ';',
    'SC0,' + Math.round(width) + ',0,' + Math.round(height) + ';',
    'PN1;', // not HP-GL — the piece's anchor
    'SP1;',
    'LT1,' + dotPct.toFixed(2) + ';',
    'PT' + nib.toFixed(2) + ';',
    'WU0;',
    'RO0;',
    'DI1,0;',
    'IW' + hpStr(field.x0, field.y1) + ',' + hpStr(field.x1, field.y0) + ';',
    'CN5;', // not HP-GL — the piece's anchor
  ].filter(fits);
  const tail = ['TL0,' + tickPct.toFixed(2) + ';', 'YT;', 'EA0000,0000;', 'PU;', 'SP0;'].filter(fits);

  // …and between them, real marks: an excerpt sampled across the plot, each dash a
  // pen-up move to its start and a pen-down move to its end. This is what the
  // machine was actually told to do.
  const budget = Math.max(0, maxRows - head.length - tail.length);
  const pairs = Math.max(0, Math.floor(budget / 2));
  const body = [];
  if (pairs > 0 && ink.length > 1) {
    const stride = Math.max(1, Math.floor(ink.length / (pairs + 1)));
    for (let i = 0; i < pairs; i++) {
      const s = ink[Math.min((i + 1) * stride, ink.length - 1)];
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      const up = 'PU' + hpStr(a.x, a.y) + ';';
      const down = 'PD' + hpStr(b.x, b.y) + ';';
      if (!fits(up) || !fits(down)) break;
      body.push(up, down);
    }
  }
  return head.concat(body, tail);
}

function buildMenu(m, menuW) {
  const x = m;

  // Compose the rows first, then set the type to fit the column — a thumbnail and a
  // full window get the same menu, not a clipped one.
  const fsBase = constrain(menuW * 0.088, 6, 15);
  const leadBase = fsBase * 1.95;
  const maxRows = Math.max(6, Math.floor((height - m * 2 - leadBase * 4) / leadBase));

  // The widest row the column can hold at a legible size — the program is written to
  // that width, then the type is fitted to the rows it actually emitted.
  const usable = menuW * 0.9 - fsBase * 1.4;
  const maxCols = Math.max(8, Math.floor(((usable * 6) / 6.5 + 1.4) / StrokeFont.ADVANCE));

  let rows = program(maxRows, maxCols);

  const fitFor = (rs) => {
    let longest = 5; // '*MENU'
    for (const s of rs) longest = Math.max(longest, s.length);
    return (usable * 6) / Math.max(longest * StrokeFont.ADVANCE - (StrokeFont.ADVANCE - 4), 1);
  };
  const fs = Math.max(3.5, Math.min(fsBase, fitFor(rows)));
  const lead = fs * 1.95;

  // and drop rows that no longer fit the sheet — from the middle, so the program keeps
  // its head (the setup) and its tail, and PU/PD go together rather than orphaning
  const room = Math.max(4, Math.floor((height - m * 2 - lead * 3.4) / lead));

  // The setup block holds the widest row, so the type size is already settled — re-emit
  // the program against the real leading and the excerpt grows to fill the column.
  // (program() reads the composition and never touches the RNG, so this is free.)
  if (rows.length < room) rows = program(room, maxCols);

  while (rows.length > room) {
    const i = Math.floor(rows.length / 2);
    const pair = rows[i].indexOf('PU') === 0 && rows[i + 1] && rows[i + 1].indexOf('PD') === 0;
    rows.splice(i, pair && rows.length > room + 1 ? 2 : 1);
  }

  let y = m + fs * 1.2;
  const put = (s, xx, yy, size) => {
    const lines = StrokeFont.text(s, xx, yy, size === undefined ? fs : size);
    for (const l of lines) addStroke(l, 1);
  };

  // header + rule
  put('*MENU', x, y, fs);
  y += lead * 0.75;
  addStroke([{ x: x, y: y }, { x: x + menuW * 0.82, y: y }], 2);
  y += lead * 0.8;

  // The boxed entry is the EA row, and EA is edge-rectangle-absolute: the command
  // reports the corner of the very box drawn around it. Patch in its real corner.
  const boxed = rows.findIndex((r) => r.indexOf('EA') === 0);
  if (boxed >= 0) {
    const by = y + boxed * lead;
    const bw = StrokeFont.width(rows[boxed], fs);
    rows[boxed] = 'EA' + hpStr(x + fs * 1.4 + bw, by + fs * 1.42) + ';';
  }

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    put(s, x + fs * 0.9, y, fs);
    if (i === boxed) {
      const w = StrokeFont.width(s, fs);
      addStroke([
        { x: x + fs * 0.4, y: y - fs * 0.42 },
        { x: x + fs * 1.4 + w, y: y - fs * 0.42 },
        { x: x + fs * 1.4 + w, y: y + fs * 1.42 },
        { x: x + fs * 0.4, y: y + fs * 1.42 },
        { x: x + fs * 0.4, y: y - fs * 0.42 },
      ], 1);
    } else if (chance(0.22)) {
      addStroke([{ x: x, y: y + fs * 0.5 }, { x: x + fs * 0.45, y: y + fs * 0.5 }], 1);
    }
    y += lead;
  }

  // the rule dividing menu from field, with a tick per menu row
  const rx = field.x0 - 14 * U;
  addStroke([{ x: rx, y: m }, { x: rx, y: height - m }], 2);
  for (let ty = m + lead; ty < height - m; ty += lead) {
    addStroke([{ x: rx - 4 * U, y: ty }, { x: rx, y: ty }], 1);
  }

  // seed, set at the foot of the sheet — the recipe travels with the print
  put('SEED ' + G.seed, x, height - m - fs, fs * 0.85);
}

// Corner registration marks around the field.
function buildMarks() {
  const L = 16 * U;
  const c = [
    [field.x0, field.y0, 1, 1],
    [field.x1, field.y0, -1, 1],
    [field.x0, field.y1, 1, -1],
    [field.x1, field.y1, -1, -1],
  ];
  for (const [x, y, sx, sy] of c) {
    addStroke([{ x: x, y: y }, { x: x + L * sx, y: y }], 1);
    addStroke([{ x: x, y: y }, { x: x, y: y + L * sy }], 1);
  }
}

// ---------------------------------------------------------------- render

function render() {
  background(PAPER[0], PAPER[1], PAPER[2]);
  noFill();
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(max(1, 1.15 * U));
  strokeJoin(ROUND);
  strokeCap(ROUND);

  for (const s of ink) {
    const pts = s.pts;
    if (pts.length === 2) {
      line(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    } else {
      beginShape();
      for (const p of pts) vertex(p.x, p.y);
      endShape();
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('plotter-interrupt-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reset();
}
