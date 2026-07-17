// Grid Collapse — structure dissolving into randomness.
//
// After Tyler Hobbs' "structure from randomness": begin with pure order — a
// clean grid of tiles — then let a disorder field rise across the canvas. Where
// the field is low the tiles stay aligned and read as coherent colour blocks;
// where it climbs they rotate, drift and shrink until the grid breaks apart.
// The wavy collapse front comes from warping the disorder gradient with noise.
// Original implementation. Static. Keys: R new · S save PNG.

let G;

const PALETTES = [
  { bg: [236, 231, 219], ink: [30, 28, 34],  colors: [[196, 76, 52], [232, 168, 66], [46, 104, 116], [58, 70, 120], [214, 202, 168]] },
  { bg: [24, 26, 33],    ink: [10, 10, 14],  colors: [[224, 122, 95], [242, 201, 125], [129, 178, 154], [110, 132, 210], [236, 232, 224]] },
  { bg: [240, 238, 233], ink: [40, 40, 48],  colors: [[38, 88, 128], [96, 152, 170], [200, 116, 70], [222, 196, 120], [70, 96, 90]] },
  { bg: [244, 241, 236], ink: [44, 36, 40],  colors: [[120, 64, 96], [206, 110, 128], [64, 108, 106], [212, 160, 92], [48, 62, 92]] },
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();
  G = GenArt.create({
    title: 'Grid Collapse',
    params: {
      cols:      { value: 26,  min: 8,   max: 60,  step: 1,   label: 'grid' },
      intensity: { value: 1.0, min: 0.2, max: 1.0, step: 0.05, label: 'collapse' },
      rotation:  { value: 115, min: 0,   max: 180, step: 5,   label: 'max spin°' },
      scatter:   { value: 0.7, min: 0,   max: 1.4, step: 0.1, label: 'scatter' },
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
  background(pal.bg[0], pal.bg[1], pal.bg[2]);

  const cols = G.param('cols');
  const cell = width / cols;
  const rows = Math.ceil(height / cell) + 1;
  const intensity = G.param('intensity');
  const maxRot = radians(G.param('rotation'));
  const scatter = G.param('scatter');

  // seeded collapse direction (which corner/edge order flows from)
  const dir = G.rng() * TWO_PI;
  const dx = Math.cos(dir);
  const dy = Math.sin(dir);
  const diag = Math.abs(width * dx) + Math.abs(height * dy) || 1;
  const off = Math.min(0, width * dx) + Math.min(0, height * dy); // keep g >= 0

  // low-frequency colour field → coherent colour regions in the ordered zone
  const cFreq = 0.9 / cols;

  rectMode(CENTER);
  strokeWeight(1);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = gx * cell + cell / 2;
      const cy = gy * cell + cell / 2;

      // disorder 0..1 with a noise-warped gradient front. The grid stays fully
      // ordered until ~a third of the way across, then collapse ramps up — so
      // the clean grid and the scatter both read clearly.
      let g = ((cx * dx + cy * dy) - off) / diag;
      g += (noise(cx * 0.0018, cy * 0.0018) - 0.5) * 0.35;
      const d = constrain((g - 0.32) / 0.6, 0, 1) * intensity;

      // colour from a coarse field, quantised to the palette
      const cn = noise(gx * cFreq, gy * cFreq, 10.0);
      const col = pal.colors[Math.min(pal.colors.length - 1, Math.floor(cn * pal.colors.length))];

      push();
      translate(
        cx + gauss() * d * cell * scatter,
        cy + gauss() * d * cell * scatter
      );
      rotate(gauss() * d * maxRot);
      const s = cell * (0.96 - d * (0.15 + Math.abs(gauss()) * 0.35));

      fill(col[0], col[1], col[2]);
      stroke(pal.ink[0], pal.ink[1], pal.ink[2], 90);
      square(0, 0, Math.max(1, s));
      pop();
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('grid-collapse-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
