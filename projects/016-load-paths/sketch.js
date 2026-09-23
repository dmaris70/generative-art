// Load Paths — cover drawing for "Beyond the Founder: Purpose, Governance and Renewal"
//
// The essay's own image, taken literally: "visible form is not what enables a
// structure to endure. Strength lies largely in systems that remain unseen: how
// weight is distributed, how elements depend on one another."
//
// So the drawing is a load-transfer diagram and nothing else. A uniform load
// enters along the top edge — the organisation's work, arriving evenly, the way it
// actually does. It has to reach the ground. On the left there is one support, and
// its catchment is enormous: every path bends toward the same point until the ink
// piles up and the convergence goes solid black. That black is not drawn. It is
// accumulated — dependence, rendered as density.
//
// Moving right, supports multiply. Each carries less, so each path deviates less,
// and the same quantity of load descends as an open, even grey. No footing may grow
// past a fixed maximum, however much it answers for, so the compression at the foot
// IS the concentration of authority.
//
// What is left over is the void: on the left, two large empty triangles either side
// of the single column, because nothing else reaches the ground there. On the right
// there is no void at all. The emptiness is the cost of the concentration.
//
// Stroke-only, black on white, no fills and no grey values — every tone in the
// picture is line density. Press V for plotter-ready SVG, S for a 2400×1600 PNG.
// Keys: R randomize · S save PNG · V save SVG.

let G;

const PAPER = [255, 255, 255];
const INK = [12, 12, 14];

// The field is a fixed-aspect plate; the window only decides how large it prints.
const FIELD_ASPECT = 1.6;
const EXPORT_W = 2400;
const EXPORT_H = 1600;

// A footing may never exceed FOOT_MAX, however much load it answers for. A support
// that has to gather a quarter of the field therefore compresses its paths some
// twenty times over; one gathering a narrow strip keeps almost its full width and
// the load descends nearly plumb. That single asymmetry is the whole picture.
const FOOT_MAX = 0.017;

let bands = []; // { x0, x1, cx, w } — one catchment per support, widest at the left
let paths = []; // [{ x, y }…] in field coordinates, 0…1 across and 0…1 down

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(2);

  G = GenArt.create({
    title: 'Load Paths',
    params: {
      supports: { value: 10, min: 2, max: 24, step: 1, label: 'supports' },
      concentration: { value: 1.15, min: 0.3, max: 2.6, step: 0.05, label: 'concentration' },
      paths: { value: 1000, min: 160, max: 1800, step: 20, label: 'load paths' },
      spread: { value: 0.28, min: 0.12, max: 1.6, step: 0.01, label: 'spread angle' },
      descent: { value: 1, min: 0.6, max: 2.4, step: 0.05, label: 'routing depth' },
      drift: { value: 0.26, min: 0, max: 1, step: 0.02, label: 'irregularity' },
      ink: { value: 0.32, min: 0.06, max: 1, step: 0.02, label: 'ink' },
      openness: { value: 0.86, min: 0.2, max: 1, step: 0.02, label: 'footing width' },
    },
    onReset: reset,
  });

  if (window.Plotter) Plotter.attach(G, { filename: 'load-paths' });

  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  build();
  drawArt(window, width, height);
}

function draw() {} // static — the structure is finished the moment it is resolved

// ---------------------------------------------------------------- utilities

const rnd = (a, b) => a + G.rng() * (b - a);

// Load spreads through a structure at an angle, not instantly. A path that has to
// travel a long way sideways needs a long vertical run to do it in and must commit
// high up; one whose support is almost directly beneath it stays plumb until the
// last moment. `run` is that vertical reach, and it is the only thing that decides
// where a path begins to bend — so the geometry, not a style choice, is what makes
// the left of the field a deep funnel and the right of it a plumb curtain.
function ease(t, tb, run) {
  const s = constrain((t - tb) / Math.max(run, 1e-4), 0, 1);
  // Near-linear on purpose: a load path under a constant spread is a straight
  // strut, and a fan of straight struts is structure. Curves would be decoration.
  return Math.pow(s, G.param('descent'));
}

// -------------------------------------------------------------------- build

function build() {
  bands = [];
  paths = [];

  buildSupports();
  buildPaths();
}

// Catchments follow a power law, not a geometric series. A geometric series is
// self-similar — every support looks like a smaller copy of the one before it, and
// the picture comes out a graded pattern. A power law does what the essay
// describes: one catchment far larger than any other, then a rapid collapse into
// many supports of roughly equal, modest weight.
function buildSupports() {
  const n = Math.max(2, Math.round(G.param('supports')));
  const k = G.param('concentration');

  const w = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const wi = Math.pow(i + 1, -k) * (1 + rnd(-0.07, 0.07));
    w.push(wi);
    sum += wi;
  }

  let acc = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] / sum;
    const foot = Math.min(wi * G.param('openness'), FOOT_MAX);
    bands.push({ x0: acc, x1: acc + wi, cx: acc + wi / 2, w: wi, foot: foot });
    acc += wi;
  }
}

function bandAt(x) {
  for (let i = 0; i < bands.length; i++) if (x < bands[i].x1) return bands[i];
  return bands[bands.length - 1];
}

// Catchments are not crisp. A path near a boundary may just as well report to the
// next support along, and the width of that indecision scales with the catchment
// it sits in. Without this the boundaries come out as razor-sharp chevrons; with
// it they feather, and a few paths cross — the exceptions any real structure has.
function assign(x) {
  const b = bandAt(x);
  const soft = x + rnd(-1, 1) * 0.16 * b.w;
  return bandAt(constrain(soft, 0.0001, 0.9999));
}

function buildPaths() {
  const N = Math.round(G.param('paths'));
  const drift = G.param('drift');
  const slope = G.param('spread');
  const steps = 150;

  for (let j = 0; j < N; j++) {
    // Stratified across the top edge: the load arrives evenly, not at random.
    const x0 = constrain((j + 0.5 + rnd(-0.42, 0.42)) / N, 0.0006, 0.9994);
    const b = assign(x0);

    // The band is mapped onto its footing in order, so paths inside a bundle never
    // cross; the bundle simply narrows by the ratio footing ÷ catchment.
    const xt = b.cx + ((x0 - b.cx) / b.w) * b.foot;

    // How far this path has to travel sideways, and therefore how much height it
    // needs to get there. Field width is FIELD_ASPECT times its height, so the
    // lateral distance is converted before it is compared against the run.
    const d = Math.abs(xt - x0);
    const run = Math.min(0.94, (d * FIELD_ASPECT) / slope);
    const tb = 1 - run;

    // A slightly ragged head — a real load does not begin on a ruled line.
    const yTop = Math.pow(G.rng(), 2.1) * 0.016;
    const ns = j * 0.21;
    const pts = [];

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = yTop + (1 - yTop) * t;
      const e = ease(t, tb, run);
      let x = x0 + (xt - x0) * e;

      // Wander is largest where nothing is resolved yet and dies out at the foot.
      const amp = 0.012 * drift * Math.pow(1 - t, 1.3);
      x += (noise(ns, y * 1.7 + 13.7) - 0.5) * 2 * amp;

      pts.push({ x: x, y: y });
    }
    pts[pts.length - 1].y = 1; // every path lands on the ground line
    paths.push(pts);
  }
}

// ------------------------------------------------------------------- render

// `g` is either `window` (the live canvas, and what plotSvg records) or a
// p5.Graphics for the high-resolution export. Both answer the same calls.
function drawArt(g, W, H) {
  const R = fieldRect(W, H);
  const U = R.w / 1600; // one unit at the reference width, so tone survives scale

  g.background(PAPER[0], PAPER[1], PAPER[2]);
  g.noFill();
  g.strokeJoin(ROUND);
  g.strokeCap(ROUND);

  const X = (x) => R.x + x * R.w;
  const Y = (y) => R.y + y * R.h;

  // The load paths. Nothing here is shaded; the darkness is arrival.
  g.stroke(INK[0], INK[1], INK[2], constrain(G.param('ink') * 210, 8, 255));
  g.strokeWeight(Math.max(0.6, 1.15 * U));
  for (const pts of paths) {
    g.beginShape();
    for (const p of pts) g.vertex(X(p.x), Y(p.y));
    g.endShape();
  }

  // The ground, and under each support a tick as long as the load it answers for.
  g.stroke(INK[0], INK[1], INK[2]);
  g.strokeWeight(Math.max(0.9, 1.6 * U));
  g.line(X(0), Y(1), X(1), Y(1));
  for (const b of bands) {
    const len = 0.014 + b.w * 0.115;
    g.line(X(b.cx), Y(1), X(b.cx), Y(1) + len * R.h);
  }
}

function fieldRect(W, H) {
  const m = 0.062 * Math.min(W, H);
  const aw = Math.max(10, W - 2 * m);
  const ah = Math.max(10, H - 2 * m);
  let fw = aw;
  let fh = fw / FIELD_ASPECT;
  if (fh > ah) {
    fh = ah;
    fw = fh * FIELD_ASPECT;
  }
  return { x: (W - fw) / 2, y: (H - fh) / 2, w: fw, h: fh };
}

// ---------------------------------------------------------------- interface

function savePlate() {
  const g = createGraphics(EXPORT_W, EXPORT_H);
  g.pixelDensity(1);
  drawArt(g, EXPORT_W, EXPORT_H);
  saveCanvas(g, 'load-paths-' + G.seed, 'png');
  setTimeout(() => g.remove(), 1500);
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') savePlate();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  drawArt(window, width, height);
}
