// Flow Field — particles advected through a Perlin-noise vector field.
// Press R to reseed, S to save a frame.

let particles = [];
const NUM = 1400;
const SCALE = 0.0016;   // noise frequency
const SPEED = 1.4;
let seed;

function setup() {
  createCanvas(windowWidth, windowHeight);
  reseed();
}

function reseed() {
  seed = floor(random(1e9));
  noiseSeed(seed);
  randomSeed(seed);
  background(11, 11, 14);
  particles = [];
  for (let i = 0; i < NUM; i++) {
    particles.push({
      x: random(width),
      y: random(height),
      h: random(255),
    });
  }
}

function draw() {
  noStroke();
  for (const p of particles) {
    const a = noise(p.x * SCALE, p.y * SCALE, frameCount * 0.0009) * TWO_PI * 2;
    p.x += cos(a) * SPEED;
    p.y += sin(a) * SPEED;

    colorMode(HSB, 255);
    fill((p.h + frameCount * 0.1) % 255, 120, 255, 12);
    circle(p.x, p.y, 1.6);

    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      p.x = random(width);
      p.y = random(height);
    }
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') reseed();
  if (key === 's' || key === 'S') saveCanvas('flow-field-' + seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reseed();
}
