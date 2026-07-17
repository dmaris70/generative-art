// Flow Ribbons — non-overlapping curves through a noise flow field.
//
// Technique (after Tyler Hobbs' "Flow Fields" / Fidenza essays, reimplemented
// from scratch): build a vector field from Perlin noise, then grow curves that
// step along it. A coarse occupancy grid records where ribbons already sit; a
// new ribbon stops as soon as it would come within `spacing` of an existing one.
// That collision test is what produces the signature packed-but-never-touching
// composition. Ribbons are drawn thick, with a dark outline under the fill.
//
// Static render. Keys: R new composition · S save PNG.

let G;

const PALETTES = [
  { bg: [236, 231, 219], ink: [34, 32, 40],  colors: [[196, 76, 52], [232, 168, 66], [46, 104, 116], [58, 70, 120], [206, 128, 150], [78, 120, 92]] },
  { bg: [30, 32, 40],    ink: [12, 12, 16],  colors: [[224, 122, 95], [242, 201, 125], [129, 178, 154], [110, 132, 210], [214, 138, 175], [236, 232, 224]] },
  { bg: [239, 235, 228], ink: [40, 46, 58],  colors: [[38, 88, 128], [96, 152, 170], [214, 202, 168], [200, 116, 70], [70, 96, 90], [150, 84, 110]] },
  { bg: [244, 240, 232], ink: [50, 40, 44],  colors: [[210, 88, 96], [240, 176, 92], [92, 108, 168], [64, 140, 132], [166, 108, 156]] },
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noLoop();

  G = GenArt.create({
    title: 'Flow Ribbons',
    params: {
      ribbons: { value: 260, min: 40,  max: 700,  step: 20,  label: 'ribbons' },
      scale:   { value: 1.1, min: 0.3, max: 4.0,  step: 0.1, label: 'field scale' },
      width:   { value: 14,  min: 3,   max: 40,   step: 1,   label: 'width' },
      spacing: { value: 4,   min: 0,   max: 20,   step: 1,   label: 'spacing' },
    },
    onReset: function () { redraw(); },
  });

  redraw();
}

function draw() {
  randomSeed(G.seed);
  noiseSeed(G.seed);

  const pal = PALETTES[Math.floor(G.rng() * PALETTES.length)];
  background(pal.bg[0], pal.bg[1], pal.bg[2]);

  const maxCurves = G.param('ribbons');
  const scl = G.param('scale') * 0.001;
  const baseW = G.param('width');
  const margin = G.param('spacing');

  // occupancy grid
  const cell = 5;
  const gcols = Math.ceil(width / cell) + 1;
  const grows = Math.ceil(height / cell) + 1;
  const occ = new Uint8Array(gcols * grows);

  function occupiedNear(x, y, r) {
    const rc = Math.ceil(r / cell);
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let j = -rc; j <= rc; j++) {
      const yy = gy + j;
      if (yy < 0 || yy >= grows) continue;
      for (let i = -rc; i <= rc; i++) {
        const xx = gx + i;
        if (xx < 0 || xx >= gcols) continue;
        if (occ[xx + yy * gcols]) return true;
      }
    }
    return false;
  }

  function stamp(path, r) {
    const rc = Math.ceil(r / cell);
    for (const p of path) {
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      for (let j = -rc; j <= rc; j++) {
        const yy = gy + j;
        if (yy < 0 || yy >= grows) continue;
        for (let i = -rc; i <= rc; i++) {
          const xx = gx + i;
          if (xx < 0 || xx >= gcols) continue;
          occ[xx + yy * gcols] = 1;
        }
      }
    }
  }

  const fieldAngle = function (x, y) {
    return noise(x * scl, y * scl) * TWO_PI * 2.0;
  };

  const stepLen = 2;
  const minPts = 22;
  const ribbons = [];
  let drawn = 0;
  let attempts = 0;
  const maxAttempts = maxCurves * 40;

  while (drawn < maxCurves && attempts < maxAttempts) {
    attempts++;
    let x = G.rng() * width;
    let y = G.rng() * height;
    const w = baseW * (0.4 + G.rng() * 1.7);
    const reach = w / 2 + margin;
    if (occupiedNear(x, y, reach)) continue;

    const path = [{ x: x, y: y }];
    const steps = 60 + Math.floor(G.rng() * 260);
    for (let s = 0; s < steps; s++) {
      const a = fieldAngle(x, y);
      x += Math.cos(a) * stepLen;
      y += Math.sin(a) * stepLen;
      if (x < 0 || x >= width || y < 0 || y >= height) break;
      if (occupiedNear(x, y, reach)) break;
      path.push({ x: x, y: y });
    }

    if (path.length < minPts) continue;
    stamp(path, reach);
    ribbons.push({ path: path, w: w, col: pal.colors[Math.floor(G.rng() * pal.colors.length)] });
    drawn++;
  }

  // render: dark outline first, colour fill on top
  strokeJoin(ROUND);
  strokeCap(ROUND);
  noFill();
  for (const rb of ribbons) {
    stroke(pal.ink[0], pal.ink[1], pal.ink[2]);
    strokeWeight(rb.w + 2.5);
    drawPath(rb.path);
    stroke(rb.col[0], rb.col[1], rb.col[2]);
    strokeWeight(rb.w);
    drawPath(rb.path);
  }
}

function drawPath(path) {
  beginShape();
  for (const p of path) curveVertex(p.x, p.y);
  endShape();
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('flow-ribbons-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
