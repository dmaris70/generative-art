// Pressed Light — botanical contact print
//
// A study, in code, of a supplied photograph of pressed wildflowers exposed onto
// paper (an anthotype/cyanotype-family photogram). Not an original composition and
// not a collection entry — a transcription made to learn how to get that medium's
// particular softness out of p5.js. The source's photographer and title were not
// supplied and are not asserted here.
//
// The composition is traced, not invented: a Python/OpenCV pass (see trace-data.js)
// reads the source photograph at twelve brightness thresholds, blurring the image
// more heavily before each lighter threshold — so a shape's own softness in the
// trace is a direct record of how faint it was in the print, not a filter added
// afterward. Every polygon here is a real isoline of that photograph.
//
// What is generated is only the *hand*: each contour is redrawn as several
// jittered, slightly grown passes of ink (repetition standing in for tone, the way
// a plotter has no stroke-weight), plus a hand-inked p5.brush edge on the readable
// mid-to-dark levels, plus paper grain and a soft contact-print vignette. The seed
// reseeds that hand — the wobble, the grain, the edge — and never touches the
// composition, which is fixed by the trace.
//
// Keys: R randomize the hand · S save PNG. ?seed=… pins a hand.

let G;
let TRACE;
let renderLevels = [];
let grain = [];

const REF_W = 900;
const REF_H = 1350;
const FIELD_ASPECT = REF_W / REF_H;
const BRUSH_LEVELS = 6; // darkest N levels get a hand-inked p5.brush contour

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  TRACE = window.TRACE_DATA;

  G = GenArt.create({
    title: 'Pressed Light',
    params: {
      exposure: { value: 1.0, min: 0.6, max: 1.5, step: 0.05, label: 'exposure' },
      bleed: { value: 1.0, min: 0.3, max: 2.2, step: 0.05, label: 'edge bleed' },
      passes: { value: 4, min: 2, max: 7, step: 1, label: 'ink passes' },
      grain: { value: 0.5, min: 0, max: 1.4, step: 0.05, label: 'paper grain' },
    },
    onReset: reset,
  });

  noLoop();
  // p5.brush resolves the active WEBGL sketch off window.p5.instance the first time
  // it draws; that reference isn't assigned until the p5 constructor returns, so the
  // first (brush-dependent) render waits one frame.
  requestAnimationFrame(() => reset());
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  renderLevels = buildRenderLevels();
  grain = buildGrain();
  redraw();
}

function draw() {
  const R = fieldRect(width, height);
  const SX = (x) => R.x + (x / REF_W) * R.w - width / 2;
  const SY = (y) => R.y + (y / REF_H) * R.h - height / 2;

  background(16, 14, 13);
  drawSheet(SX, SY);
  drawLevels(R, SX, SY);
  drawGrain(R, SX, SY);
  drawVignette(R, SX, SY);
}

// ---------------------------------------------------------------- build (hand)

function buildRenderLevels() {
  const levels = TRACE.levels;
  const loG = levels[0].gray;
  const hiG = levels[levels.length - 1].gray;
  const bleed = G.param('bleed');
  const K = Math.round(G.param('passes'));

  return levels.map((lvl, li) => {
    const t = (lvl.gray - loG) / (hiG - loG); // 0 core (sharp, dark) .. 1 halo (soft, faint)
    const baseAlpha = (1 - t) * 0.82 + 0.09;
    const jitterAmt = (0.55 + t * 5.5) * bleed;
    const growAmt = 0.012 + t * 0.07;

    const polys = lvl.polygons.map((pts) => {
      const passes = [];
      for (let k = 0; k < K; k++) {
        const kt = K > 1 ? k / (K - 1) : 0;
        const jp = growPoly(
          jitterPoly(pts, jitterAmt * (0.35 + kt * 0.85), G.rng),
          growAmt * bleed * kt
        );
        const a = (baseAlpha * Math.pow(1 - kt, 1.3) * 2.0) / K;
        passes.push({ pts: jp, alpha: Math.min(0.92, a) });
      }
      return { pts, passes };
    });

    return { t, gray: lvl.gray, useBrush: li < BRUSH_LEVELS, polys };
  });
}

function jitterPoly(pts, amt, rng) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const r = rng() * 2 - 1;
    out[i] = [pts[i][0] + perpX * r * amt, pts[i][1] + perpY * r * amt];
  }
  return out;
}

function growPoly(pts, amt) {
  if (amt <= 0) return pts;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map((p) => [cx + (p[0] - cx) * (1 + amt), cy + (p[1] - cy) * (1 + amt)]);
}

function buildGrain() {
  const n = 4200;
  const pts = new Array(n);
  for (let i = 0; i < n; i++) {
    pts[i] = {
      x: G.rng() * REF_W,
      y: G.rng() * REF_H,
      r: 0.3 + G.rng() * 1.0,
      dark: G.rng() < 0.55,
      a: 0.08 + G.rng() * 0.2,
    };
  }
  return pts;
}

// -------------------------------------------------------------------- render

function drawSheet(SX, SY) {
  noStroke();
  const p = TRACE.paper;
  fill(p[0], p[1], p[2]);
  beginShape();
  vertex(SX(0), SY(0));
  vertex(SX(REF_W), SY(0));
  vertex(SX(REF_W), SY(REF_H));
  vertex(SX(0), SY(REF_H));
  endShape(CLOSE);
}

function drawLevels(R, SX, SY) {
  const ink = TRACE.ink;
  const exposure = G.param('exposure');
  const U = R.w / REF_W;

  noStroke();
  for (let li = renderLevels.length - 1; li >= 0; li--) {
    const lvl = renderLevels[li];
    for (const poly of lvl.polys) {
      for (const pass of poly.passes) {
        const a = constrain(pass.alpha * exposure, 0, 0.95) * 255;
        fill(ink[0], ink[1], ink[2], a);
        beginShape();
        for (const pt of pass.pts) vertex(SX(pt[0]), SY(pt[1]));
        endShape(CLOSE);
      }
    }
  }

  // A hand-inked contour on the levels that read as drawing, not haze — p5.brush's
  // graphite line stands in for the grain of a real emulsion edge.
  const inkHex = rgbToHex(ink);
  brush.scaleBrushes(Math.max(0.35, U));
  brush.noFill();
  for (let li = 0; li < renderLevels.length; li++) {
    const lvl = renderLevels[li];
    if (!lvl.useBrush) continue;
    const w = lerp(1.05, 0.4, lvl.t) * exposure;
    const repeats = li < 2 ? 2 : 1;
    brush.set('HB', inkHex, w);
    for (const poly of lvl.polys) {
      if (poly.pts.length < 3) continue;
      for (let r = 0; r < repeats; r++) {
        brush.beginShape(0);
        for (let i = 0; i < poly.pts.length; i++) {
          const pt = poly.pts[i];
          const pressure = 0.45 + 0.35 * noise(pt[0] * 0.012 + r * 11, pt[1] * 0.012 + li * 7);
          brush.vertex(SX(pt[0]), SY(pt[1]), pressure);
        }
        brush.endShape(true);
      }
    }
  }
}

function drawGrain(R, SX, SY) {
  const gAmt = G.param('grain');
  if (gAmt <= 0.001) return;
  const ink = TRACE.ink;
  const paper = TRACE.paper;
  const U = R.w / REF_W;
  noStroke();
  for (const p of grain) {
    const c = p.dark ? ink : paper;
    const a = p.a * gAmt * (p.dark ? 130 : 190);
    fill(c[0], c[1], c[2], a);
    circle(SX(p.x), SY(p.y), Math.max(0.55, p.r * U * 1.5));
  }
}

function drawVignette(R, SX, SY) {
  const ink = TRACE.ink;
  const rings = 16;
  const U = R.w / REF_W;
  noFill();
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const inset = t * 0.15;
    const x0 = REF_W * inset;
    const y0 = REF_H * inset;
    const x1 = REF_W * (1 - inset);
    const y1 = REF_H * (1 - inset);
    stroke(ink[0], ink[1], ink[2], 3.2);
    strokeWeight(Math.max(1, 5 * U));
    beginShape();
    vertex(SX(x0), SY(y0));
    vertex(SX(x1), SY(y0));
    vertex(SX(x1), SY(y1));
    vertex(SX(x0), SY(y1));
    endShape(CLOSE);
  }
}

function rgbToHex(rgb) {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

function fieldRect(W, H) {
  const m = 0.05 * Math.min(W, H);
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

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('pressed-light-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  brush.load(); // its internal buffers are sized to the canvas at load time
  redraw();
}
