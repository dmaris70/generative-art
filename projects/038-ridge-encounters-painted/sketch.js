// 038 — Ridge, encounters — painted
//
// 028's place, body, weather and two gazes (its engine, loaded unchanged and frozen at v1.4:
// the same seed gives the same scene), painted with the oil engine of 036 and the
// watercolour toolkit of 037, in colour or in 028's own monochrome. See README.md.

let G;
let SC = null; // the scene: two sheets of buffers (bridge.js)
let COLS = null; // the colour of each sheet's pixels
let tasks = [];
let taskIdx = 0;
let R = null; // the diptych's rect on screen
let U = 1; // screen px per sheet unit
let SHEET = 0; // the sheet being painted (X() offsets by it)
let PANEL_W = 0;
let BRUSHES = false;
let brushK = 1;
let WP = null; // the watercolour settings, frozen when a painting starts
const UI = { status: 'loading the places…', stage: '' };
const PAPER = [246, 241, 230];
const ROOM = [14, 14, 16];
const GAP = 40; // sheet units between the two sheets
const FRAME_BUDGET_MS = 28;
const UNDER_ONLY = /[?&]under\b/.test(location.search);
const YIELD_AGAIN = 'again';
let JOB = 0;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  const PA = 'Painting', SN = 'Scene', WC = 'Watercolour', OI = 'Oil';
  G = GenArt.create({
    title: 'Ridge, encounters — painted',
    applyOnDemand: true,
    closedGroups: [WC, OI],
    params: {
      medium: { value: 1, options: { oil: 0, watercolour: 1 }, label: 'medium', group: PA },
      palette: { value: 0, options: { colour: 0, 'monochrome (028)': 1 }, label: 'palette', group: PA },
      warmth: { value: 1, min: 0, max: 1.5, step: 0.05, label: 'glow of the light', group: PA },
      regime: { value: 0, options: { 'by seed': 0, exposure: 1, looming: 2, whiteout: 3, passage: 4, clearing: 5 }, label: 'register', group: SN },
      event: { value: 0, options: { 'by seed': 0, none: 1, tarn: 2, hut: 3, bird: 4, moon: 5 }, label: 'rare event (as 028)', group: SN },
      smear: { value: 1, min: 0, max: 2, step: 0.05, label: 'movement of the body (painted)', group: SN },
      wetness: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'wetness', group: WC },
      load: { value: 1.15, min: 0.5, max: 1.6, step: 0.05, label: 'pigment load', group: WC },
      granulation: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'granulation', group: WC },
      backruns: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'hard edges, backruns', group: WC },
      dryBrush: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'dry brush on rock', group: WC },
      rigger: { value: 0.7, min: 0, max: 1.5, step: 0.05, label: 'rigger on the crest', group: WC },
      strokeSize: { value: 8, min: 4, max: 22, step: 0.5, label: 'stroke width', group: OI },
      coverage: { value: 1, min: 0.3, max: 2, step: 0.05, label: 'coverage', group: OI },
      bristles: { value: 9, min: 2, max: 16, step: 1, label: 'bristles', group: OI },
      oilDry: { value: 0.3, min: 0, max: 0.85, step: 0.01, label: 'dry-brush breaks', group: OI },
      impasto: { value: 1, min: 0, max: 2, step: 0.05, label: 'impasto', group: OI },
      knife: { value: 260, min: 0, max: 800, step: 10, label: 'knife lights on snow', group: OI },
    },
    onReset: reset,
  });
  noLoop();
  // p5.brush binds once the constructor has returned; the places load before the first scene
  requestAnimationFrame(() => loadDEMs().then(() => reset()));
}

function panelSpace() {
  const g = G.gui, el = g && g.domElement;
  if (!el || g._closed || g._hidden || windowWidth <= 700) return 0;
  return el.offsetWidth ? el.offsetWidth + 12 : 0;
}

function reset() {
  const job = ++JOB;
  randomSeed(G.seed);
  noiseSeed(G.seed);
  PANEL_W = panelSpace();
  UI.status = 'finding the place, the body, the weather…';
  SC = null;
  tasks = [];
  window.DONE = false;
  loop();
  // 028's engine is pure arithmetic (≈ 3 s); one frame first so the status shows
  setTimeout(() => {
    if (job !== JOB) return;
    const place = new URLSearchParams(location.search).get('place') || '';
    SC = ridgeScene(G.seed, { regime: G.param('regime'), event: G.param('event'), place });
    WP = wcParams();
    const mode = G.param('palette') === 1 ? 'mono' : 'colour';
    COLS = SC.sheets.map((B) => colourise(B, SC.light, mode, G.param('warmth')));
    tasks = buildTasks();
    taskIdx = 0;
    loop();
  }, 30);
}

function wcParams() {
  const P = (k) => G.param(k);
  return { wet: P('wetness'), load: P('load'), gran: P('granulation'), back: P('backruns'), dry: P('dryBrush'), rigger: P('rigger'), tooth: 0.8 };
}

function buildTasks() {
  const T = [];
  const oil = G.param('medium') === 0;
  const st = { smear: G.param('smear') };
  T.push(() => {
    background(...ROOM);
    for (let k = 0; k < 2; k++) {
      SHEET = k;
      noStroke();
      fill(...SC.sheets[k].mat);
      rect(X(0), Y(0), SC.sheets[k].W * U, SC.sheets[k].H * U);
    }
    // p5.brush keeps its own copy of the canvas for its pigment blending and composites it
    // back; the oil strokes are drawn natively, so in oil p5.brush is not touched at all
    if (!oil) {
      addBrushes();
      setBrushScale(Math.max(0.3, U * 1.6));
      brush.noField(); brush.noStroke(); brush.noFill(); brush.noHatch();
    }
  });
  if (oil) OP = oilParams();
  for (let k = 0; k < 2; k++) {
    const B = SC.sheets[k], C = COLS[k];
    T.push(() => { SHEET = k; UI.stage = (k ? 'right' : 'left') + ' sheet'; });
    // ?under shows the colourised frame alone (what the painters work from)
    const sub = UNDER_ONLY ? [() => drawUnder(B, C)] : oil ? oilSheetTasks(B, C, st) : wcSheetTasks(B, C, st);
    for (const f of sub) T.push(() => { SHEET = k; return f(); });
  }
  return T;
}

function drawUnder(B, C) {
  const img = createImage(B.w, B.h);
  img.loadPixels();
  for (let i = 0; i < B.w * B.h; i++) {
    img.pixels[i * 4] = C[i * 3]; img.pixels[i * 4 + 1] = C[i * 3 + 1]; img.pixels[i * 4 + 2] = C[i * 3 + 2]; img.pixels[i * 4 + 3] = 255;
  }
  img.updatePixels();
  image(img, X(B.box[0]), Y(B.box[1]), B.box[2] * U, B.box[3] * U);
}

// a rigger for the crest (037's); the rest of the watercolour is fills and washes
function addBrushes() {
  if (BRUSHES) return;
  BRUSHES = true;
  brush.add('rigger', { type: 'default', weight: 0.8, scatter: 0.12, sharpness: 0.75, grain: 20, opacity: 210, spacing: 0.18, pressure: [1.25, 0.18], rotate: 'none' });
}
function setBrushScale(k) {
  brush.scaleBrushes(k / brushK);
  brushK = k;
}

// the mat and the room are restated every frame: washes and strokes reach past the pictures
p5.registerAddon((p5, fn, lifecycles) => {
  lifecycles.postdraw = function () {
    if (!SC || !R) return;
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    noStroke();
    for (let k = 0; k < 2; k++) {
      SHEET = k;
      const B = SC.sheets[k], [bx, by, bw, bh] = B.box;
      fill(...B.mat);
      rect(X(0), Y(0), B.W * U, by * U);
      rect(X(0), Y(by + bh), B.W * U, (B.H - by - bh) * U);
      rect(X(0), Y(by), bx * U, bh * U);
      rect(X(bx + bw), Y(by), (B.W - bx - bw) * U, bh * U);
    }
    fill(...ROOM);
    rect(0, 0, width, R.y);
    rect(0, R.y + R.h, width, height - R.y - R.h);
    rect(0, 0, R.x, height);
    SHEET = 0;
    rect(X(SC.sheets[0].W), 0, GAP * U, height);
    rect(R.x + R.w, 0, width - R.x - R.w, height);
    pop();
  };
});

function draw() {
  translate(-width / 2, -height / 2);
  // everything here is 2D, in painting order: no depth test (an image and the strokes over it
  // all sit at z = 0, and the test would hide strokes behind the underpainting)
  drawingContext.disable(drawingContext.DEPTH_TEST);
  const sw = (SC ? SC.sheets[0].W : 1080) * 2 + GAP, sh = SC ? SC.sheets[0].H : 1350;
  const avail = width - PANEL_W;
  U = Math.min((avail * 0.96) / sw, (height * 0.94) / sh);
  R = { x: (avail - sw * U) / 2, y: (height - sh * U) / 2, w: sw * U, h: sh * U };
  if (!SC) return;
  const t0 = performance.now();
  while (taskIdx < tasks.length && performance.now() - t0 < FRAME_BUDGET_MS) {
    let r;
    try { r = tasks[taskIdx](); } catch (e) { console.warn('ridge-painted: pass', taskIdx, 'failed:', e && e.message); r = undefined; }
    if (r === YIELD_AGAIN) break;
    taskIdx++;
  }
  if (taskIdx >= tasks.length) {
    noLoop();
    window.DONE = true;
    UI.status = 'done · ' + SC.placeLabel + ' · ' + SC.regime + ' · ' + SC.light + ' light';
  } else UI.status = Math.round((100 * taskIdx) / tasks.length) + '% · ' + UI.stage;
}

// sheet units → canvas px for the sheet being painted
const X = (x) => R.x + (SHEET * ((SC ? SC.sheets[0].W : 1080) + GAP) + x) * U;
const Y = (y) => R.y + y * U;
const pts = (arr) => arr.map((p) => [X(p[0]), Y(p[1])]);

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('ridge-encounters-painted-' + G.seed, 'png');
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  brush.load();
  if (SC) G.reset();
}
