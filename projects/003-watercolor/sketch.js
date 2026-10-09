// Watercolor — generative watercolour shapes on paper.
//
// The technique lives in the reusable ../../assets/watercolor.js module; this
// sketch is just a thin caller: pick a palette + a few base shapes, then hand
// each to Watercolor.paint(). Reuse the module in any future painting the same
// way — build a polygon (or pass kind/cx/cy/r), give it a colour and G.rng.
//
// Static. Keys: R new · S save PNG.

let G;

const PALETTES = [
  { paper: [237, 232, 221], colors: [[210, 150, 60], [120, 92, 110], [70, 118, 92], [66, 96, 140], [178, 90, 74]] },
  { paper: [239, 235, 227], colors: [[196, 120, 66], [90, 116, 128], [150, 84, 104], [96, 128, 96], [72, 84, 138]] },
  { paper: [240, 236, 228], colors: [[64, 108, 120], [206, 158, 92], [128, 72, 92], [88, 120, 100], [176, 100, 116]] },
];

const KINDS = ['triangle', 'square', 'pentagon', 'hexagon', 'circle'];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  G = GenArt.create({
    title: 'Watercolor',
    params: {
      shapes:  { value: 3,    min: 1,   max: 7,   step: 1,    label: 'shapes' },
      reach:   { value: 5,    min: 2,   max: 9,   step: 1,    label: 'bleed reach' },
      density: { value: 4,    min: 1,   max: 8,   step: 1,    label: 'layers' },
      bleed:   { value: 1.7,  min: 0.3, max: 2.8, step: 0.1,  label: 'bleed' },
      uneven:  { value: 0.0,  min: 0.0, max: 1.0, step: 0.05, label: 'unevenness' },
      warp:    { value: 0,    min: 0,   max: 5,   step: 1,    label: 'base warp' },
      pigment: { value: 14,   min: 3,   max: 30,  step: 1,    label: 'pigment' },
      edge:    { value: 0.4,  min: 0.0, max: 1.2, step: 0.05, label: 'edge pool' },
      bloom:   { value: 0.45, min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 1.0,  min: 0.0, max: 2.5, step: 0.1,  label: 'grain' },
    },
    onReset: function () { redraw(); },
  });
  redraw();
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = G.rng();
  while (v === 0) v = G.rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];

  // paper ground (its own PRNG so grain doesn't perturb the shape stream)
  Watercolor.paperTexture(pal.paper, Watercolor.makeRng(G.seed ^ 0x9e3779b9));

  const n = G.param('shapes');
  const marginX = width * 0.11;
  const span = (width - 2 * marginX) / n;
  const r = Math.min(span * 0.34, height * 0.3);

  for (let i = 0; i < n; i++) {
    const cx = marginX + span * (i + 0.5);
    const cy = height * 0.5 + gauss() * height * 0.02;
    const kind = KINDS[Math.floor(G.rng() * KINDS.length)];
    const col = pal.colors[Math.floor(G.rng() * pal.colors.length)];

    Watercolor.paint({
      kind: kind,
      cx: cx,
      cy: cy,
      r: r * (0.82 + G.rng() * 0.3),
      color: col,
      paper: pal.paper,
      rng: G.rng,
      reach: G.param('reach'),
      layers: G.param('density'),
      bleed: G.param('bleed'),
      weightVar: G.param('uneven'),
      preEvolutions: G.param('warp'),
      pigment: G.param('pigment'),
      edge: G.param('edge'),
      bloom: G.param('bloom'),
      grain: G.param('grain'),
    });
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
