// Flow Field — particles advected through a Perlin-noise vector field.
// Params are live (top-right panel); the seed makes it fully reproducible.
// Keys: R randomize · S save PNG.

let G;
let particles = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 255);

  G = GenArt.create({
    title: 'Flow Field',
    params: {
      count: { value: 1400, min: 200, max: 4000, step: 100, label: 'particles' },
      scale: { value: 1.6, min: 0.4, max: 6.0, step: 0.1, label: 'noise scale' },
      speed: { value: 1.4, min: 0.2, max: 4.0, step: 0.1, label: 'speed' },
      trail: { value: 12, min: 2, max: 45, step: 1, label: 'ink density' },
    },
    onReset: reset,
  });

  reset();
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  background(11, 11, 14);
  particles = [];
  const n = G.param('count');
  for (let i = 0; i < n; i++) {
    particles.push({ x: G.rng() * width, y: G.rng() * height, h: G.rng() * 255 });
  }
}

function draw() {
  const scl = G.param('scale') * 0.001;
  const spd = G.param('speed');
  const ink = G.param('trail');
  noStroke();
  for (const p of particles) {
    const a = noise(p.x * scl, p.y * scl, frameCount * 0.0009) * TWO_PI * 2;
    p.x += cos(a) * spd;
    p.y += sin(a) * spd;

    fill((p.h + frameCount * 0.1) % 255, 120, 255, ink);
    circle(p.x, p.y, 1.6);

    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      p.x = G.rng() * width;
      p.y = G.rng() * height;
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('flow-field-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reset();
}
