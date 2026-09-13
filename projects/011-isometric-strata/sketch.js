// Isometric Strata — generative architectural drawing sheets.
//
// Every seed is a complete working drawing: a title block, a north arrow, the
// palette's swatches, a framed axonometric of a building on its site with the
// floor levels scaled up the margin, and a footer with a legend whose counts
// are tallied from the geometry actually drawn, a scale bar, and the sheet's
// specification. The building is one of four styles — the Mexican-modern
// patio mat, the deconstructivist crystalline tower, the geodesic expo mast,
// the brutalist mosaic block, the Five Points villa, the De Stijl house, the
// Metabolist capsule tower, the Palladian villa — each a vocabulary of
// parts recombined by the seed, standing on one of six site types.
//
// Pipeline: seed → spec (style, site, paper, palette, detail…) → Scene of 3-D
// primitives (styles/*.js + site.js) → depth sort → hand-drawn render
// (render.js) onto textured paper (paper.js) inside the chrome (sheet.js).
//
// Keys: R randomize · S save PNG.

let G;
const SW = 1500, SH = 2000; // sheet units (portrait)
let U = 1; // canvas px per sheet unit
let spec = null, scene = null, meta = null, fit = null;

const PALETTES = {
  TLALPAN: { colors: [[218, 164, 62], [226, 196, 92], [222, 112, 74], [232, 168, 154], [110, 124, 140]], water: [108, 128, 150] },
  ROSA: { colors: [[232, 130, 120], [222, 112, 74], [218, 164, 62], [120, 132, 146], [236, 210, 150]], water: [120, 140, 160] },
  CAL: { colors: [[236, 224, 196], [218, 164, 62], [140, 148, 156], [222, 112, 74], [176, 182, 190]], water: [120, 140, 160] },
  AZUL: { colors: [[96, 120, 156], [218, 164, 62], [236, 224, 196], [222, 112, 74], [150, 170, 196]], water: [96, 124, 160] },
  MONOCHROME: { colors: [[90, 95, 102], [120, 126, 134], [156, 160, 166], [72, 76, 82]] },
  GRAPHITE: { colors: [[74, 78, 86], [110, 114, 122], [150, 154, 160], [60, 62, 68]] },
  CARBON: { colors: [[52, 56, 62], [96, 100, 106], [140, 144, 150], [180, 182, 186]] },
  SEPIA: { colors: [[104, 84, 64], [150, 124, 92], [190, 170, 136], [80, 66, 50]] },
  DEWLINE: { colors: [[104, 118, 132], [140, 156, 172], [186, 196, 206], [150, 166, 180]], accent: [230, 112, 46] },
  ARCTIC: { colors: [[120, 136, 152], [170, 184, 196], [204, 212, 220], [130, 150, 170]], accent: [210, 70, 50] },
  SIGNAL: { colors: [[96, 104, 112], [150, 156, 164], [200, 204, 210], [120, 128, 136]], accent: [232, 132, 30] },
  PURIST: { colors: [[238, 234, 224], [214, 208, 192], [124, 152, 176], [214, 160, 60], [60, 62, 66]], water: [110, 136, 160] },
  SAVOYE: { colors: [[240, 237, 228], [222, 216, 200], [130, 156, 178], [90, 116, 92], [220, 150, 140]], water: [110, 136, 160] },
  POLYCHROMIE: { colors: [[236, 232, 222], [206, 198, 180], [140, 164, 186], [196, 96, 64], [86, 132, 170]], water: [110, 136, 160] },
  RIETVELD: { colors: [[240, 238, 232], [200, 40, 40], [40, 70, 160], [236, 196, 30], [40, 42, 46], [150, 152, 156]], water: [110, 136, 160] },
  MONDRIAN: { colors: [[244, 242, 238], [214, 34, 32], [24, 60, 140], [246, 208, 42], [30, 30, 34], [200, 200, 198]], water: [110, 136, 160] },
  DOESBURG: { colors: [[236, 234, 228], [190, 60, 50], [60, 90, 150], [220, 180, 60], [50, 52, 56], [128, 132, 138]], water: [110, 136, 160] },
  NAKAGIN: { colors: [[150, 148, 142], [234, 232, 226], [226, 108, 40], [58, 60, 64], [120, 140, 160]], water: [110, 136, 160] },
  EXPO70: { colors: [[196, 196, 192], [240, 240, 236], [206, 36, 40], [40, 40, 44], [60, 100, 170]], water: [110, 136, 160] },
  KIKUTAKE: { colors: [[140, 142, 140], [228, 226, 218], [60, 140, 150], [70, 72, 74], [214, 160, 60]], water: [110, 136, 160] },
  INTONACO: { colors: [[236, 226, 206], [190, 110, 80], [200, 196, 186], [120, 100, 80], [130, 150, 170]], water: [110, 136, 160] },
  PIETRA: { colors: [[224, 220, 210], [150, 120, 100], [184, 180, 170], [90, 88, 84], [140, 160, 176]], water: [110, 136, 160] },
  VENETO: { colors: [[240, 232, 214], [180, 90, 70], [206, 200, 184], [110, 90, 70], [110, 140, 160]], water: [110, 136, 160] },
  EARTH: { colors: [[192, 96, 58], [75, 125, 138], [210, 161, 58], [111, 154, 90], [156, 107, 74]] },
  CONCRETE: { colors: [[120, 118, 112], [156, 152, 144], [192, 96, 58], [98, 110, 118], [180, 176, 166]] },
  RUSTED: { colors: [[176, 84, 48], [140, 66, 40], [210, 161, 58], [92, 96, 100], [200, 140, 100]] },
};

const STYLE_KEYS = ['mexican', 'decon', 'geodesic', 'brutalist', 'corbusier', 'destijl', 'metabolism', 'palladio'];

function setup() {
  fitCanvas();
  pixelDensity(min(2, displayDensity()));
  G = GenArt.create({
    title: 'Isometric Strata',
    params: {
      mode: { value: 0, min: 0, max: 8, step: 1, label: 'style (0 auto, 1 mex, 2 decon, 3 geo, 4 brut, 5 corb, 6 stijl, 7 metab, 8 pall)' },
      floors: { value: 0, min: 0, max: 10, step: 1, label: 'floors (0 auto)' },
      detail: { value: 0, min: 0, max: 3, step: 1, label: 'detail (0 auto)' },
      density: { value: 0, min: 0, max: 3, step: 1, label: 'site density (0 auto)' },
      bldgs: { value: 0, min: 0, max: 2, step: 1, label: 'buildings (0 auto)' },
      wobble: { value: 1, min: 0, max: 2.5, step: 0.1, label: 'hand wobble' },
      ink: { value: 1, min: 0.5, max: 1.8, step: 0.05, label: 'ink weight' },
    },
    onReset: reset,
  });
  reset();
}

function fitCanvas() {
  // a host page may reserve a strip (window.STRATA_INSET px) for its own bar
  const inset = window.STRATA_INSET || 0;
  const w = Math.min(windowWidth, (windowHeight - inset) * (SW / SH));
  const h = w * (SH / SW);
  if (!window._c) window._c = createCanvas(w, h);
  else resizeCanvas(w, h);
  U = w / SW;
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  build();
  render();
}

function draw() {}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if (key === 's' || key === 'S') saveCanvas('isometric-strata-' + G.seed, 'png');
}

function windowResized() {
  fitCanvas();
  render();
}

// ---------------------------------------------------------------- spec

function build() {
  const R = ISO.rng(G.seed);
  const pm = G.param('mode') | 0;
  const key = pm >= 1 && pm <= STYLE_KEYS.length ? STYLE_KEYS[pm - 1] : R.pick(STYLE_KEYS);
  const style = ISO.styles[key];

  const detailN = G.param('detail') | 0 || R.weighted([[1, 3], [2, 3], [3, 2]]);
  const densityN = G.param('density') | 0 || R.weighted([[1, 3], [2, 4], [3, 2]]);
  const floors = G.param('floors') | 0 || R.int(style.floors[0], style.floors[1]);
  const bldgs = G.param('bldgs') | 0 || (R.chance(0.42) ? 2 : 1);
  const paletteName = R.pick(style.palettes);
  const palette = PALETTES[paletteName];

  spec = {
    style: style, key: key,
    title: R.pick(style.titles),
    substyle: R.pick(style.substyles),
    type: R.pick(style.types),
    shape: R.pick(style.shapes),
    site: R.weighted(style.sites),
    detail: ['', 'MINIMAL', 'DETAILED', 'TECHNICAL'][detailN],
    detailN: detailN,
    density: ['', 'FEW', 'MODERATE', 'DENSE'][densityN],
    paper: R.weighted([['STANDARD', 3], ['VINTAGE', 3], ['ROUGH', 2]]),
    grid: R.weighted([['LARGE', 3], ['SMALL', 2]]),
    ink: R.weighted([['FINE', 2], ['MEDIUM', 4], ['HEAVY', 1]]),
    floors: floors,
    floorH: R.range(3.2, 3.9),
    bldgs: bldgs,
    paletteName: paletteName,
    palette: palette,
    dwg: 'IS-' + ('000000' + (ISO.hash32(String(G.seed)) >>> 8).toString(16)).slice(-6).toUpperCase(),
    project: '#' + (1000 + (G.seed % 9000)),
  };

  scene = new ISO.Scene();
  const size = style.size(R, false);
  const plot = Object.assign({ x: -size.w / 2, y: -size.d / 2 }, size);
  const ctx = {
    rng: R.fork('style'), scene: scene, plot: plot, floors: floors, floorH: spec.floorH,
    palette: palette, detail: detailN, shape: spec.shape, annex: false, substyle: spec.substyle,
  };
  const extra = style.build(ctx) || {};

  let union = { x: plot.x, y: plot.y, w: plot.w, d: plot.d };
  if (bldgs === 2) {
    const s2 = style.size(R, true);
    const onX = R.chance(0.5);
    const gap = R.range(3, 6);
    const p2 = Object.assign({
      x: onX ? plot.x + plot.w + gap : plot.x + R.range(0, Math.max(0, plot.w - s2.w)),
      y: onX ? plot.y + R.range(0, Math.max(0, plot.d - s2.d)) : plot.y + plot.d + gap,
    }, s2);
    const ctx2 = Object.assign({}, ctx, {
      rng: R.fork('annex'), plot: p2, annex: true,
      floors: Math.max(2, Math.round(floors * R.range(0.45, 0.7))), shape: 'RECTANGLE',
    });
    style.build(ctx2);
    const x0 = Math.min(union.x, p2.x), y0 = Math.min(union.y, p2.y);
    const x1 = Math.max(union.x + union.w, p2.x + p2.w), y1 = Math.max(union.y + union.d, p2.y + p2.d);
    union = { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
  }

  Site.build({
    rng: R.fork('site'), scene: scene, plot: union, site: spec.site, density: spec.density,
    detail: detailN, floorH: spec.floorH, buildingH: floors * spec.floorH, water: palette.water, palette: palette,
  });

  // legend from the tallies the generators kept
  const legend = style.legend.map((l) => ({ name: l[0], sym: l[1], count: scene.counts[l[0]] || 0 }));
  const kv = [
    ['STYLE', spec.substyle], ['FLOORS', floors],
    ['SHAPE', spec.shape], ['GRID', spec.grid],
    ['PALETTE', paletteName], ['INK', spec.ink],
    ['PAPER', spec.paper], (extra.kv && extra.kv[0]) || ['STRUCT', 'MODERATE'],
    ['BLDGS', bldgs], ['MODE', style.key],
  ];
  meta = {
    title: spec.title,
    subtitle: spec.substyle + ' / ' + (R.chance(0.5) ? spec.type : floors + 'F'),
    dwg: spec.dwg, sheet: '1/1', view: 'AXONOMETRIC',
    detail: spec.detail, density: spec.density, site: spec.site,
    palette: palette.colors.slice(0, 5),
    header: style.header, kv: kv, legend: legend,
    project: spec.project, type: spec.type, scale: R.pick(['1:100', '1:200', '1:100', '1:250']),
  };
  spec.plot = plot;

  // fit: the building sets the scale (about half the frame wide), the site
  // runs on past it and is clipped by the frame, as on a real sheet
  const L = Sheet.layout();
  const bh = floors * spec.floorH * 1.15;
  const corners = [
    [union.x, union.y, 0], [union.x + union.w, union.y, 0], [union.x, union.y + union.d, 0], [union.x + union.w, union.y + union.d, 0],
    [union.x, union.y, bh], [union.x + union.w, union.y, bh], [union.x, union.y + union.d, bh], [union.x + union.w, union.y + union.d, bh],
  ].map(ISO.proj);
  const bx0 = Math.min(...corners.map((c) => c[0])), bx1 = Math.max(...corners.map((c) => c[0]));
  const by0 = Math.min(...corners.map((c) => c[1])), by1 = Math.max(...corners.map((c) => c[1]));
  const s = Math.min((L.frame.w * 0.56) / (bx1 - bx0), (L.frame.h * 0.66) / (by1 - by0));
  const fcx = L.frame.x + L.frame.w / 2, fcy = L.frame.y + L.frame.h * 0.52;
  fit = { s: s, ox: fcx - ((bx0 + bx1) / 2) * s, oy: fcy - ((by0 + by1) / 2) * s };
  window.__strata = { spec: spec, scene: scene, meta: meta, fit: fit, G: G, tenets: extra.tenets || null };
}

// ---------------------------------------------------------------- render

function render() {
  if (!scene) return;
  const R = ISO.rng(G.seed ^ 0x5a5a);
  const wob = G.param('wobble');
  const inkScale = G.param('ink') * (spec.ink === 'FINE' ? 0.82 : spec.ink === 'HEAVY' ? 1.3 : 1);
  const hand = Hand.create(window, R.fork('hand'), { wob: wob, weightScale: inkScale });
  const L = Sheet.layout();

  // paper
  const tex = Paper.texture(width, height, spec.paper, G.seed);
  blendMode(BLEND);
  noTint();
  image(tex, 0, 0, width, height);

  push();
  scale(U);
  Paper.grid(hand, SW, SH, spec.grid === 'SMALL' ? 12.5 : 20);
  Paper.marginalia(hand, R.fork('margin'), SW, SH, [L.title, L.footer], spec.paper === 'ROUGH' ? 1.4 : 1);

  // the drawing, clipped to its frame
  const P = (p) => {
    const q = ISO.proj(p);
    return [fit.ox + q[0] * fit.s, fit.oy + q[1] * fit.s];
  };
  hand.clipPath([[L.frame.x, L.frame.y], [L.frame.x + L.frame.w, L.frame.y], [L.frame.x + L.frame.w, L.frame.y + L.frame.h], [L.frame.x, L.frame.y + L.frame.h]]);
  Hand.render(scene, hand, P);
  hand.unclip();

  // chrome, with the floor scale keyed to the building's ground line
  const g0 = P([spec.plot.x + spec.plot.w / 2, spec.plot.y + spec.plot.d / 2, 0]);
  Sheet.draw(hand, meta, { yBase: g0[1], step: spec.floorH * fit.s, n: spec.floors });
  pop();

  // pencil tooth over everything: the paper's own texture multiplied back in
  blendMode(MULTIPLY);
  tint(255, spec.paper === 'ROUGH' ? 50 : 70);
  image(tex, 0, 0, width, height);
  noTint();
  blendMode(BLEND);
}
