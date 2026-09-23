// Ridge in cloud, RIGHT sheet — a copy, in code, of the right half of a grainy monochrome diptych
// (the ridge itself: a dark spine under cloud, striated rock, the near flank smeared by movement).
// trace.py reads the sheet into data.js: a grain-free tonal reading, a map of how streaked each
// passage is, and the measured grain law. Nothing here displays the source image; the sheet is
// REPAINTED by assets/drybrush.js — coarse loaded strokes down to a fine brush, each pulled along
// the form, then a hair-thin dry drag over the rock, then the grain re-grown from its law.
// The seed changes the HAND (stroke order, bristles, wobble, every grain), never the composition.
// The left sheet is 024; the two share one reading and one engine and meet on this sheet's left edge.
// Keys: R new hand · S save PNG (2× sheet, 2160 × 2700).

let G, SHEETCANVAS, dirty = true;
const TITLE = 'Ridge in cloud — right sheet', FILE = 'ridge-study-right';

function setup() {
  fit();
  G = GenArt.create({
    title: TITLE,
    params: {
      detail: { value: 1, min: 0.3, max: 2, step: 0.1, label: 'finish (how far the small brush goes)' },
      bite: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'bite of small forms' },
      bristle: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'dry bristle' },
      streak: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'dry drag on the rock' },
      wobble: { value: 1, min: 0, max: 3, step: 0.1, label: 'hand wobble' },
      grain: { value: 1, min: 0, max: 2, step: 0.05, label: 'grain' },
    },
    onReset: () => { dirty = true; redraw(); },
  });
  noLoop();
}

function opts(scale) {
  const o = { seed: G.seed, scale };
  for (const k of ['detail', 'bite', 'bristle', 'streak', 'wobble', 'grain']) o[k] = G.param(k);
  return o;
}
function sheetCanvas(scale) {
  const out = DryBrush.paint(SHEET, opts(scale));
  const c = document.createElement('canvas'); c.width = out.w; c.height = out.h;
  c.getContext('2d').putImageData(new ImageData(out.rgba, out.w, out.h), 0, 0);
  return c;
}

function draw() {
  if (dirty) { SHEETCANVAS = sheetCanvas(1); dirty = false; }
  background(11, 11, 14);
  drawingContext.imageSmoothingQuality = 'high';
  drawingContext.drawImage(SHEETCANVAS, 0, 0, width, height);
}

function fit() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  const s = Math.min(windowWidth / SHEET.W, windowHeight / SHEET.H);
  createCanvas(Math.floor(SHEET.W * s), Math.floor(SHEET.H * s));
}
function windowResized() { fit(); redraw(); }     // the sheet is cached: a resize never repaints it
function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') {
    const a = document.createElement('a');
    a.download = FILE + '-' + G.seed + '.png'; a.href = sheetCanvas(2).toDataURL('image/png'); a.click();
  }
}
