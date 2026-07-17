// Watercolor Landscape — a loose painting built entirely with Watercolor.paint().
//
// Demonstrates the reusable ../../assets/watercolor.js module on a NON-geometric
// composition: a soft sun, layered hills whose ridges are custom noise polygons
// (passed as `base`), and a scatter of trees. Everything is watercolour-bled and
// fully reproducible from the seed.
//
// Static. Keys: R new · S save PNG.

let G;

const PALETTES = [
  { // warm dusk — cool dusty blues/purples receding under a peach sky
    paper: [240, 234, 223], sky: [236, 206, 184], sun: [232, 138, 74],
    hills: [[176, 160, 188], [144, 134, 178], [108, 106, 156], [76, 82, 126]],
    tree: [64, 84, 74], trunk: [88, 62, 46],
  },
  { // cool morning — greens and teals into a pale blue sky
    paper: [236, 238, 233], sky: [200, 220, 224], sun: [238, 206, 128],
    hills: [[176, 194, 176], [130, 168, 156], [92, 138, 128], [64, 108, 100]],
    tree: [72, 108, 82], trunk: [80, 66, 54],
  },
  { // muted autumn — ochre, olive and umber
    paper: [242, 235, 224], sky: [230, 208, 180], sun: [216, 108, 66],
    hills: [[196, 168, 118], [170, 134, 88], [136, 104, 70], [100, 78, 56]],
    tree: [138, 104, 54], trunk: [92, 64, 44],
  },
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  G = GenArt.create({
    title: 'Watercolor Landscape',
    params: {
      hills:   { value: 3,    min: 2,   max: 5,   step: 1,    label: 'hills' },
      trees:   { value: 7,    min: 0,   max: 16,  step: 1,    label: 'trees' },
      bleed:   { value: 1.1,  min: 0.4, max: 2.4, step: 0.1,  label: 'bleed' },
      reach:   { value: 4,    min: 2,   max: 8,   step: 1,    label: 'bleed reach' },
      layers:  { value: 3,    min: 1,   max: 6,   step: 1,    label: 'layers' },
      pigment: { value: 12,   min: 4,   max: 24,  step: 1,    label: 'pigment' },
      bloom:   { value: 0.35, min: 0.0, max: 1.0, step: 0.05, label: 'centre bloom' },
      grain:   { value: 0.8,  min: 0.0, max: 2.0, step: 0.1,  label: 'grain' },
    },
    onReset: function () { redraw(); },
  });
  redraw();
}

// a hill polygon: undulating noise ridge across the top, corners far off-canvas
// (so only the ridge bleeds into view; the huge bottom/side edges bleed offscreen)
function ridgePoly(baseY, amp, off) {
  const pts = [];
  const step = 24;
  for (let x = -60; x <= width + 60; x += step) {
    const y = baseY - amp * (noise(x * 0.0016 + off, off * 0.7) - 0.5) * 2 - amp * 0.3;
    pts.push({ x: x, y: y });
  }
  pts.push({ x: width + 60, y: height + 300 });
  pts.push({ x: -60, y: height + 300 });
  return pts;
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  const pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];

  // paper ground
  Watercolor.paperTexture(pal.paper, Watercolor.makeRng(G.seed ^ 0x9e3779b9));

  // soft sky gradient down to the horizon
  const horizon = height * 0.46;
  const ctx = drawingContext;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, 'rgba(' + pal.sky[0] + ',' + pal.sky[1] + ',' + pal.sky[2] + ',0.75)');
  sky.addColorStop(1, 'rgba(' + pal.paper[0] + ',' + pal.paper[1] + ',' + pal.paper[2] + ',0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  // shared watercolour controls (applied across sun, hills and trees)
  const bleed = G.param('bleed');
  const reach = G.param('reach');
  const layers = G.param('layers');
  const pig = G.param('pigment');
  const bloom = G.param('bloom');
  const grain = G.param('grain');

  // sun — a glowing watercolour disc
  const sunX = width * (0.24 + G.rng() * 0.52);
  const sunY = horizon * (0.42 + G.rng() * 0.3);
  const sunR = Math.min(width, height) * (0.07 + G.rng() * 0.05);
  Watercolor.paint({
    kind: 'circle', cx: sunX, cy: sunY, r: sunR,
    color: pal.sun, paper: pal.paper, rng: G.rng,
    reach: reach, layers: layers, bleed: bleed * 0.85,
    pigment: Math.max(6, pig * 0.7), edge: 0.3, bloom: Math.min(1, bloom + 0.25),
    grain: grain * 0.5, outline: true, shadow: false,
  });

  // layered hills, back (light, high) to front (dark, low)
  const nH = G.param('hills');
  let frontY = horizon;
  for (let i = 0; i < nH; i++) {
    const t = i / Math.max(1, nH - 1);
    const baseY = horizon + t * (height * 0.34);
    const amp = height * (0.05 + G.rng() * 0.05) * (1 - t * 0.3);
    const poly = ridgePoly(baseY, amp, 20 + i * 13.7);
    const col = pal.hills[Math.min(pal.hills.length - 1, i)];
    Watercolor.paint({
      base: poly, color: col, paper: pal.paper, rng: G.rng,
      reach: Math.max(2, reach - 1), layers: layers, detail: 2, bleed: bleed * 0.9,
      pigment: pig, edge: 0.12, bloom: 0, grain: grain * 0.5, outline: false, shadow: false,
    });
    if (i === nH - 1) frontY = baseY;
  }

  // trees along the front hill — rendered with the SHAPES technique: geometric
  // base (conifer triangle or round crown) with a visible outline, edge pooling
  // and centre bloom, like the 003 watercolour shapes
  const nT = G.param('trees');
  const treeKinds = ['conifer', 'conifer', 'conifer', 'round', 'round'];
  const tSpan = width * 0.9;
  for (let i = 0; i < nT; i++) {
    // evenly spaced across the treeline with a little jitter (avoids clumping)
    const x = width * 0.05 + tSpan * ((i + 0.5) / nT) + (G.rng() - 0.5) * (tSpan / nT) * 0.6;
    const groundY = frontY - height * 0.03 + G.rng() * height * 0.06;
    const h = height * (0.06 + G.rng() * 0.07);
    const cR = h * (0.45 + G.rng() * 0.3);
    const canopyY = groundY - h;
    const kind = treeKinds[Math.floor(G.rng() * treeKinds.length)];
    const jitter = 0.85 + G.rng() * 0.35;
    const col = [pal.tree[0] * jitter, pal.tree[1] * jitter, pal.tree[2] * jitter];

    // geometric base shape + where the trunk meets it
    let base, trunkTop;
    if (kind === 'conifer') {
      const topY = canopyY - cR * 1.3;
      const baseY = canopyY + cR * 0.8;
      const halfW = cR * 0.9;
      base = [{ x: x, y: topY }, { x: x + halfW, y: baseY }, { x: x - halfW, y: baseY }];
      trunkTop = baseY - cR * 0.1;
    } else {
      base = Watercolor.primitive('circle', x, canopyY, cR);
      trunkTop = canopyY + cR * 0.6;
    }

    // trunk
    push();
    stroke(pal.trunk[0], pal.trunk[1], pal.trunk[2], 150);
    strokeWeight(Math.max(1.5, h * 0.03));
    line(x, groundY, x, trunkTop);
    pop();

    Watercolor.paint({
      base: base, cx: x, cy: canopyY, r: cR,
      color: col, paper: pal.paper, rng: G.rng,
      reach: reach, layers: layers, bleed: bleed,
      pigment: pig + 1, edge: 0.45, bloom: bloom, grain: grain,
      outline: true, shadow: false,
    });
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('watercolor-landscape-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
