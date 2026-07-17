// Starter sketch, wired to the GenArt harness for free seed + live params.
// Keys: R randomize · S save PNG.

let G;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  G = GenArt.create({
    title: 'Untitled',
    params: {
      // Declare parameters here — each becomes a live slider in the panel.
      // name: { value, min, max, step, label }
      density: { value: 500, min: 50, max: 3000, step: 50, label: 'density' },
    },
    onReset: reset, // called on seed change / randomize / param tweak
  });

  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  background(11, 11, 14);

  const n = G.param('density');
  for (let i = 0; i < n; i++) {
    // G.rng() → deterministic float in [0, 1). Same seed → same picture.
    const x = G.rng() * width;
    const y = G.rng() * height;
    // your art here
  }
}

function draw() {
  // per-frame animation here (optional)
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('frame-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reset();
}
