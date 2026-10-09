// Flow Ribbons — non-overlapping curves through a noise flow field.
//
// Technique (after Tyler Hobbs' "Flow Fields" / Fidenza essays, reimplemented
// from scratch): build a vector field from Perlin noise and grow curves along
// it, using a coarse occupancy grid so a new ribbon stops before it comes within
// `spacing` of an existing one — that collision test gives the packed-but-never-
// touching look. This version adds three Fidenza-family touches:
//   • variable-scale zones — a low-frequency field sets each ribbon's width, so
//     regions of fat and thin ribbons emerge;
//   • turbulence regions — some areas inject extra high-frequency curl into the
//     field, so calm laminar zones sit beside churning ones;
//   • polygon ribbons — each curve is filled as a tapered polygon with a crisp
//     outline, rather than a round-capped thick stroke.
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
      ribbons:    { value: 300, min: 40,  max: 800,  step: 20,  label: 'ribbons' },
      scale:      { value: 1.1, min: 0.3, max: 4.0,  step: 0.1, label: 'field scale' },
      width:      { value: 13,  min: 3,   max: 40,   step: 1,   label: 'base width' },
      scaleVar:   { value: 0.6, min: 0.0, max: 1.0,  step: 0.05, label: 'scale zones' },
      turbulence: { value: 0.5, min: 0.0, max: 1.0,  step: 0.05, label: 'turbulence' },
      spacing:    { value: 4,   min: 0,   max: 20,   step: 1,   label: 'spacing' },
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
  const scaleVar = G.param('scaleVar');
  const turb = G.param('turbulence');
  const margin = G.param('spacing');

  // ---- occupancy grid ----
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

  // ---- flow field with turbulence regions ----
  function fieldAngle(x, y) {
    let a = noise(x * scl, y * scl) * TWO_PI * 2.0;
    if (turb > 0) {
      const mask = noise(x * scl * 0.5 + 40, y * scl * 0.5 + 40);
      if (mask > 0.5) {
        const amt = (mask - 0.5) * 2 * turb;
        a += (noise(x * 0.006 + 90, y * 0.006 + 90) - 0.5) * TWO_PI * 2 * amt;
      }
    }
    return a;
  }

  // width from a low-frequency "scale zone" field, so fat and thin regions form
  function zoneWidth(x, y) {
    const z = noise(x * 0.0012 + 200, y * 0.0012 + 200);
    const mul = 1 + (z - 0.5) * 2 * scaleVar * 1.6; // ~[1-1.6v, 1+1.6v]
    return baseW * Math.max(0.25, mul) * (0.7 + G.rng() * 0.7);
  }

  const stepLen = 2;
  const minPts = 22;
  const ribbons = [];
  let drawn = 0;
  let attempts = 0;
  const maxAttempts = maxCurves * 45;

  while (drawn < maxCurves && attempts < maxAttempts) {
    attempts++;
    let x = G.rng() * width;
    let y = G.rng() * height;
    const w = zoneWidth(x, y);
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

  // ---- render as filled, tapered polygons with a crisp outline ----
  strokeJoin(ROUND);
  for (const rb of ribbons) {
    const edges = ribbonPolygon(rb.path, rb.w);

    noStroke();
    fill(rb.col[0], rb.col[1], rb.col[2]);
    outlineShape(edges, false);

    noFill();
    stroke(pal.ink[0], pal.ink[1], pal.ink[2]);
    strokeWeight(1.5);
    outlineShape(edges, true);
  }
}

// Offset the centreline left/right by half-width, tapering toward both ends.
function ribbonPolygon(path, w) {
  const n = path.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty;
    const ny = tx;
    const t = n > 1 ? i / (n - 1) : 0;
    const taper = Math.min(1, Math.min(t, 1 - t) * 5.0);
    const hw = (w / 2) * (0.14 + 0.86 * taper);
    left.push([path[i].x + nx * hw, path[i].y + ny * hw]);
    right.push([path[i].x - nx * hw, path[i].y - ny * hw]);
  }
  return { left: left, right: right };
}

function outlineShape(edges, asStroke) {
  beginShape();
  for (const p of edges.left) vertex(p[0], p[1]);
  for (let i = edges.right.length - 1; i >= 0; i--) vertex(edges.right[i][0], edges.right[i][1]);
  endShape(CLOSE);
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('flow-ribbons-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
