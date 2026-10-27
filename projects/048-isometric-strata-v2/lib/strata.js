/*
 * strata.js — the Isometric Strata engine facade.
 *
 *   const state = Strata.build({ seed, mode, sheet, floors, detail, density, bldgs, site, paper });
 *   Strata.paint(g, state, { wobble, ink });   // g: the window (p5 global mode) or a p5.Graphics
 *
 * build() turns a seed and a few overrides into a specification, a Scene of
 * 3-D primitives (one of twelve styles on one of six sites), the legend
 * tallied from what was placed, and the fits for the five sheets of the drawing
 * set (site plan, plans, sections, elevations, axonometric). paint() draws the
 * sheet the state names, scaled to the renderer's width. The sketch and
 * the portfolio board are both thin clients of these two calls.
 */
(function (global) {
  'use strict';

  const SW = 1500, SH = 2000; // sheet units (portrait)

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
  ZOOM: { colors: [[240, 240, 236], [246, 200, 20], [220, 40, 140], [30, 180, 210], [40, 40, 44]], water: [110, 136, 160] },
  POP: { colors: [[242, 240, 232], [236, 120, 30], [40, 100, 190], [210, 40, 50], [40, 40, 44]], water: [110, 136, 160] },
  HIGHTECH: { colors: [[214, 216, 218], [206, 36, 40], [40, 90, 170], [236, 196, 30], [50, 52, 56]], water: [110, 136, 160] },
  TRAVERTINE: { colors: [[226, 216, 196], [70, 56, 40], [168, 190, 186], [40, 44, 50], [104, 128, 140]], water: [104, 128, 140] },
  ONYX: { colors: [[220, 214, 200], [40, 42, 46], [176, 196, 200], [96, 70, 50], [96, 120, 136]], water: [96, 120, 136] },
  STEEL: { colors: [[206, 206, 200], [36, 38, 42], [160, 186, 196], [60, 62, 66], [110, 134, 150]], water: [110, 134, 150] },
  ASVESTI: { colors: [[246, 243, 234], [40, 90, 170], [160, 156, 146], [130, 96, 60], [90, 130, 160]], water: [90, 130, 160] },
  SANTORINI: { colors: [[248, 246, 240], [36, 78, 160], [92, 90, 88], [150, 100, 70], [70, 120, 160]], water: [70, 120, 160] },
  FOLEGANDROS: { colors: [[244, 240, 228], [60, 110, 170], [172, 164, 150], [120, 90, 60], [100, 140, 166]], water: [100, 140, 166] },
  GALLARATESE: { colors: [[236, 230, 218], [178, 52, 42], [214, 168, 72], [128, 130, 134], [40, 110, 100]], water: [100, 130, 150] },
  CATALDO: { colors: [[228, 220, 206], [190, 60, 48], [200, 150, 70], [110, 112, 116], [60, 96, 120]], water: [100, 130, 150] },
  TEATRO: { colors: [[240, 236, 226], [160, 50, 44], [220, 180, 80], [140, 142, 146], [30, 100, 110]], water: [100, 130, 150] },
  EARTH: { colors: [[192, 96, 58], [75, 125, 138], [210, 161, 58], [111, 154, 90], [156, 107, 74]] },
  CONCRETE: { colors: [[120, 118, 112], [156, 152, 144], [192, 96, 58], [98, 110, 118], [180, 176, 166]] },
  RUSTED: { colors: [[176, 84, 48], [140, 66, 40], [210, 161, 58], [92, 96, 100], [200, 140, 100]] },
};

  const STYLE_KEYS = ['mexican', 'decon', 'geodesic', 'brutalist', 'corbusier', 'destijl', 'metabolism', 'palladio', 'archigram', 'mies', 'cycladic', 'rossi'];

  // The drawing set: one seed is a numbered set of five sheets. A-05 is the
  // axonometric v1.0 drew; the other four are the orthographic sheets a working
  // set carries, all cut and projected from the same scene at one scale.
  const SHEETS = ['SITE PLAN', 'PLANS', 'SECTIONS', 'ELEVATIONS', 'AXONOMETRIC'];
  const SHEET_SCALE = ['1:500', '1:200', '1:200', '1:200', null];

  function build(opts) {
  opts = opts || {};
  const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
  const R = ISO.rng(seed);
  const pm = opts.mode | 0;
  const key = pm >= 1 && pm <= STYLE_KEYS.length ? STYLE_KEYS[pm - 1] : R.pick(STYLE_KEYS);
  const style = ISO.styles[key];

  const detailN = opts.detail | 0 || R.weighted([[1, 3], [2, 3], [3, 2]]);
  const densityN = opts.density | 0 || R.weighted([[1, 3], [2, 4], [3, 2]]);
  const floors = opts.floors | 0 || R.int(style.floors[0], style.floors[1]);
  const bldgs = opts.bldgs | 0 || (R.chance(0.42) ? 2 : 1);
  const paletteName = R.pick(style.palettes);
  const palette = PALETTES[paletteName];

  // which sheet of the set: 1..5 picks, 0 lets the seed choose (the axonometric
  // most often); the v1.0 `view` option still works: 1 axon, 2 plans
  const ps = opts.sheet | 0, pv = opts.view | 0;
  const drawn = R.weighted([[4, 5], [0, 1], [1, 2], [2, 2], [3, 2]]);
  const sheetIdx = ps >= 1 && ps <= 5 ? ps - 1 : pv === 1 ? 4 : pv === 2 ? 1 : drawn;
  const view = SHEETS[sheetIdx];

  const schedule = opts.schedule === undefined ? true : !!opts.schedule;

  const spec = {
    view: view, sheet: sheetIdx, sheets: SHEETS,
    schedule: schedule,
    style: style, key: key,
    title: R.pick(style.titles),
    substyle: R.pick(style.substyles),
    type: R.pick(style.types),
    shape: R.pick(style.shapes),
    site: opts.site || R.weighted(style.sites),
    detail: ['', 'MINIMAL', 'DETAILED', 'TECHNICAL'][detailN],
    detailN: detailN,
    density: ['', 'FEW', 'MODERATE', 'DENSE'][densityN],
    paper: opts.paper || R.weighted([['STANDARD', 3], ['VINTAGE', 3], ['ROUGH', 2]]),
    grid: R.weighted([['LARGE', 3], ['SMALL', 2]]),
    ink: R.weighted([['FINE', 2], ['MEDIUM', 4], ['HEAVY', 1]]),
    floors: floors,
    floorH: R.range(3.2, 3.9),
    bldgs: bldgs,
    paletteName: paletteName,
    palette: palette,
    dwg: 'IS-' + ('000000' + (ISO.hash32(String(seed)) >>> 8).toString(16)).slice(-6).toUpperCase(),
    project: '#' + (1000 + (seed % 9000)),
  };

  const scene = new ISO.Scene();
  const M = Model.create();
  const size = style.size(R, false);
  const plot = Object.assign({ x: -size.w / 2, y: -size.d / 2 }, size);
  const ctx = {
    rng: R.fork('style'), scene: scene, plot: plot, floors: floors, floorH: spec.floorH,
    palette: palette, detail: detailN, shape: spec.shape, annex: false, substyle: spec.substyle, M: M,
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

  const buildingItems = scene.items.length, buildingSolids = scene.solids.length;
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
  const axonScale = R.pick(['1:100', '1:200', '1:100', '1:250']);
  const meta = {
    title: spec.title,
    subtitle: spec.substyle + ' / ' + (R.chance(0.5) ? spec.type : floors + 'F'),
    dwg: spec.dwg, sheet: 'A-0' + (sheetIdx + 1) + ' / 05', view: view,
    detail: spec.detail, density: spec.density, site: spec.site,
    palette: palette.colors.slice(0, 5),
    header: style.header, kv: kv, legend: legend,
    project: spec.project, type: spec.type, scale: SHEET_SCALE[sheetIdx] || axonScale,
  };
  spec.plot = plot;

  // ---- fits ----
  const L = Sheet.layout({ schedule: schedule });
  const F = L.frame;

  // A-05: the building sets the scale (about half the frame wide), the site
  // runs on past it and is clipped by the frame, as on a real sheet
  const bh = floors * spec.floorH * 1.15;
  const corners = [
    [union.x, union.y, 0], [union.x + union.w, union.y, 0], [union.x, union.y + union.d, 0], [union.x + union.w, union.y + union.d, 0],
    [union.x, union.y, bh], [union.x + union.w, union.y, bh], [union.x, union.y + union.d, bh], [union.x + union.w, union.y + union.d, bh],
  ].map(ISO.proj);
  const bx0 = Math.min(...corners.map((c) => c[0])), bx1 = Math.max(...corners.map((c) => c[0]));
  const by0 = Math.min(...corners.map((c) => c[1])), by1 = Math.max(...corners.map((c) => c[1]));
  const s = Math.min((F.w * 0.56) / (bx1 - bx0), (F.h * 0.66) / (by1 - by0));
  const fcx = F.x + F.w / 2, fcy = F.y + F.h * 0.52;
  const fit = { s: s, ox: fcx - ((bx0 + bx1) / 2) * s, oy: fcy - ((by0 + by1) / 2) * s };

  // the scene's extent, for the orthographic sheets
  let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity, ez1 = 0;
  for (const it of scene.items) {
    const pts = it.pts || (it.anchor ? [it.anchor] : []);
    for (const q of pts) {
      if (q[0] < ex0) ex0 = q[0]; if (q[0] > ex1) ex1 = q[0];
      if (q[1] < ey0) ey0 = q[1]; if (q[1] > ey1) ey1 = q[1];
      if (q[2] > ez1) ez1 = q[2];
    }
  }
  // the plans, sections and elevations frame the plot plus a margin; the site
  // plan frames everything the site generator placed
  const m = Math.max(union.w, union.d) * 0.3 + 4;
  const px0 = Math.max(ex0, union.x - m), px1 = Math.min(ex1, union.x + union.w + m);
  const py0 = Math.max(ey0, union.y - m), py1 = Math.min(ey1, union.y + union.d + m);
  // cuts: the ground-floor plan a little above the building's own ground floor
  // (a style on a podium reports that datum); the upper plan at a typical floor;
  // the sections through the plot's centre lines
  const datum = extra.datum || 0;
  const lift = Math.min(1.6, spec.floorH * 0.4 + 0.3);
  const cutZ = datum + lift;
  const upper = floors > 1 ? Math.max(2, Math.ceil(floors / 2)) : null;
  const cutZ2 = upper ? datum + (upper - 1) * spec.floorH + lift : null;
  const cutY = union.y + union.d / 2, cutX = union.x + union.w / 2;
  const gapY = 40, labelH = 26, pad = 30;
  const cx = (px0 + px1) / 2, cy = (py0 + py1) / 2;

  // A-02 plans: two bands, ground floor above, the upper floor (or the roof) below
  const bandH = (F.h - gapY) / 2;
  const sp = Math.min((F.w - 2 * pad) / (px1 - px0), (bandH - 2 * pad - labelH) / (py1 - py0));
  const bandAt = (i) => ({ x: F.x, y: F.y + i * (bandH + gapY), w: F.w, h: bandH });
  const planBand = (i) => { const b = bandAt(i); b.ox = b.x + b.w / 2 - cx * sp; b.oy = b.y + labelH + (b.h - labelH) / 2 - cy * sp; return b; };
  const plans = { s: sp, cuts: [{ z: cutZ, label: 'PLAN  LEVEL 1  +' + cutZ.toFixed(2), band: planBand(0) }, upper
    ? { z: cutZ2, label: 'PLAN  LEVEL ' + upper + '  +' + cutZ2.toFixed(2), band: planBand(1) }
    : { z: Infinity, label: 'ROOF PLAN', band: planBand(1) }] };

  // the sections and elevations frame the plot plus a few metres of context and
  // the building's own height (a tall neighbour may run past the band and clip)
  const em = 4, span = Math.max(union.w, union.d) + 2 * em;
  const hgt = Math.max(floors * spec.floorH * 1.25, Math.min(ez1, floors * spec.floorH * 2)) + 2;

  // A-03 sections: A-A along x looking at +y, B-B along y looking at +x
  const ss = Math.min((F.w - 2 * pad) / span, (bandH - 2 * pad - labelH) / hgt);
  const secBand = (i, c0) => { const b = bandAt(i); b.ox = b.x + b.w / 2 - c0 * ss; b.ground = b.y + labelH + (b.h - labelH) / 2 + (hgt / 2) * ss - ss; return b; };
  // A-A looks toward -y (north) with +x on the right; B-B looks toward -x (west) with -y on the right
  const sections = { s: ss, cuts: [
    { label: 'SECTION  A-A', dir: 'y', cut: cutY, sx: (p) => p[0], band: secBand(0, cx), x0: px0, x1: px1, u0: union.x, u1: union.x + union.w },
    { label: 'SECTION  B-B', dir: 'x', cut: cutX, sx: (p) => -p[1], band: secBand(1, -cy), x0: -py1, x1: -py0, u0: -(union.y + union.d), u1: -union.y },
  ] };

  // A-04 elevations: four views at one scale, each centred on the plot. A low wide
  // building is drawn in four full-width bands; a tall one in a two-by-two grid
  const gapX = 40;
  const cellW22 = (F.w - gapX) / 2, cellH22 = (F.h - gapY) / 2, cellH41 = (F.h - 3 * gapY) / 4;
  const s22 = Math.min((cellW22 - 2 * pad) / span, (cellH22 - 2 * pad - labelH) / hgt);
  const s41 = Math.min((F.w - 2 * pad) / span, (cellH41 - 2 * pad - labelH) / hgt);
  const stacked = s41 > s22 * 1.15;
  const se = stacked ? s41 : s22;
  const cellAt = (i, c0) => {
    const b = stacked
      ? { x: F.x, y: F.y + i * (cellH41 + gapY), w: F.w, h: cellH41 }
      : { x: F.x + (i % 2) * (cellW22 + gapX), y: F.y + Math.floor(i / 2) * (cellH22 + gapY), w: cellW22, h: cellH22 };
    b.ox = b.x + b.w / 2 - c0 * se; b.ground = b.y + labelH + (b.h - labelH) / 2 + (hgt / 2) * se - se; return b;
  };
  // each from its own side: south stands at +y (right is +x), north at -y (right -x),
  // east at +x (right -y), west at -x (right +y)
  const ux0 = union.x, ux1 = union.x + union.w, uy0 = union.y, uy1 = union.y + union.d;
  const elevations = { s: se, stacked: stacked, cells: [
    { label: 'SOUTH ELEVATION', side: 'S', sx: Ortho.SIDES.S.sx, cell: cellAt(0, cx), x0: px0, x1: px1, u0: ux0, u1: ux1 },
    { label: 'NORTH ELEVATION', side: 'N', sx: Ortho.SIDES.N.sx, cell: cellAt(1, -cx), x0: -px1, x1: -px0, u0: -ux1, u1: -ux0 },
    { label: 'EAST ELEVATION', side: 'E', sx: Ortho.SIDES.E.sx, cell: cellAt(2, -cy), x0: -py1, x1: -py0, u0: -uy1, u1: -uy0 },
    { label: 'WEST ELEVATION', side: 'W', sx: Ortho.SIDES.W.sx, cell: cellAt(3, cy), x0: py0, x1: py1, u0: uy0, u1: uy1 },
  ] };

  // A-01 site plan: the block around the plot, from above, no cut — the plot
  // plus one and a quarter of its own size each way, or the site if smaller
  const sm = Math.max(union.w, union.d) * 1.25;
  const sx0 = Math.max(ex0, union.x - sm), sx1 = Math.min(ex1, union.x + union.w + sm);
  const sy0 = Math.max(ey0, union.y - sm), sy1 = Math.min(ey1, union.y + union.d + sm);
  const sst = Math.min((F.w - 2 * pad) / (sx1 - sx0), (F.h - 2 * pad - labelH) / (sy1 - sy0));
  const site = { s: sst, ox: F.x + F.w / 2 - ((sx0 + sx1) / 2) * sst, oy: F.y + labelH + (F.h - labelH) / 2 - ((sy0 + sy1) / 2) * sst };

  // the v1.0 ortho record, kept for the token layer (the plan cut it reports)
  const ortho = { s: sp, cutZ: cutZ, cutZ2: cutZ2, cutY: cutY, cutX: cutX, ext: { x0: px0, x1: px1, y0: py0, y1: py1, z1: ez1, sx0: sx0, sx1: sx1, sy0: sy0, sy1: sy1 } };
  const datumZ = extra.datum || 0;
  const levels = [];
  for (let k = 0; k <= floors; k++) levels.push({ n: k, z: datumZ + k * spec.floorH, name: k === 0 ? 'GROUND' : k === floors ? 'ROOF' : 'L' + (k + 1) });
  const set = { plans: plans, sections: sections, elevations: elevations, site: site, levels: levels, datum: datumZ, height: datumZ + floors * spec.floorH };
  return { seed: seed, spec: spec, scene: scene, meta: meta, fit: fit, ortho: ortho, set: set, model: M, tenets: extra.tenets || null, stats: { buildingSolids: buildingSolids, buildingItems: buildingItems, siteItems: scene.items.length - buildingItems, union: union } };
}

  // ---- the orthographic sheets ----
  const LBL = { color: [48, 54, 64], alpha: 215 };
  const RULE = { color: [58, 64, 74], alpha: 160, weight: 0.9, wob: 0.4 };

  function clipRect(hand, r) {
    hand.clipPath([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]);
  }

  // a section mark: the cut line across the plan, dashed, a tick and a letter at each end
  function sectionMark(hand, a0, a1, letter, side) {
    const dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * side, ny = (dx / l) * side;
    hand.line([a0, a1], { alpha: 200, weight: 1.1, wob: 0.3, dash: [16, 6] });
    for (const e of [a0, a1]) {
      hand.line([[e[0], e[1]], [e[0] + nx * 14, e[1] + ny * 14]], { alpha: 200, weight: 1.3, wob: 0.3 });
      hand.line([[e[0] + nx * 9 - ny * 5, e[1] + ny * 9 + nx * 5], [e[0] + nx * 14, e[1] + ny * 14], [e[0] + nx * 9 + ny * 5, e[1] + ny * 9 - nx * 5]], { alpha: 200, weight: 1.3, wob: 0.3 });
      hand.text(letter, e[0] - nx * 16, e[1] - ny * 16 - 5, 11, LBL, { align: 'center' });
    }
  }

  function planMarks(hand, P, O) {
    sectionMark(hand, P([O.ext.x0 - 2, O.cutY, 0]), P([O.ext.x1 + 2, O.cutY, 0]), 'A', -1);
    sectionMark(hand, P([O.cutX, O.ext.y0 - 2, 0]), P([O.cutX, O.ext.y1 + 2, 0]), 'B', 1);
  }

  function northMark(hand, x, y) {
    hand.text('N', x, y, 11, LBL);
    hand.line([[x + 6, y + 20], [x + 6, y + 2]], RULE);
    hand.line([[x + 2, y + 7], [x + 6, y + 2], [x + 10, y + 7]], RULE);
  }

  function groundLine(hand, Ps, x0, x1) {
    const g0 = Ps([x0 - 2, 0]), g1 = Ps([x1 + 2, 0]);
    hand.line([g0, g1], { alpha: 235, weight: 2.4, wob: 0.3 });
    hand.poly([[g0[0], g0[1]], [g1[0], g1[1]], [g1[0], g1[1] + 26], [g0[0], g0[1] + 26]], { color: [70, 76, 88], alpha: 110, mode: 'hatch', spacing: 4, angle: Math.PI / 4 }, null);
    return g1;
  }

  const fmt = (v) => v.toFixed(2);
  // overall dimensions of the plot on a plan, the structural grid with its bubbles
  function planFurniture(hand, state, P, S) {
    const u = state.stats.union, g = state.model.grids[0];
    const ext = { x0: u.x - 22 / S, x1: u.x + u.w + 22 / S, y0: u.y - 22 / S, y1: u.y + u.d + 22 / S };
    if (g && g.xs.length > 1 && g.ys.length > 1) {
      // bubbles on the grid lines that fall inside the plot's extent
      Ortho.gridLines(hand, g, P, ext, Ortho.labels(g.xs.length, true), Ortho.labels(g.ys.length, false));
    }
    Ortho.dim(hand, P([u.x, u.y, 0]), P([u.x + u.w, u.y, 0]), -62, fmt(u.w), 9);
    Ortho.dim(hand, P([u.x, u.y, 0]), P([u.x, u.y + u.d, 0]), 62, fmt(u.d), 9);
  }
  // level markers down the right of a section or an elevation
  function levelMarks(hand, state, b, s) {
    const L = state.set.levels, x1 = b.x + b.w - 14, x0 = x1 - 80;
    for (const l of L) {
      if (l.n === 0) continue;
      const y = b.ground - l.z * s;
      if (y < b.y + 24) continue;
      Ortho.level(hand, x0, x1, y, '+' + fmt(l.z), 'right');
    }
  }
  // the overall height beside the building
  function heightDim(hand, state, b, s, u0) {
    const H = state.set.height, x = b.ox + u0 * s;
    Ortho.dim(hand, [x, b.ground], [x, b.ground - H * s], -34, fmt(H), 9);
  }

  // A-01: everything the site generator placed, seen from above
  function paintSite(hand, state) {
    const S = state.set.site, O = state.ortho, F = Sheet.layout({ schedule: state.spec.schedule }).frame;
    const P = (p) => [S.ox + p[0] * S.s, S.oy + p[1] * S.s];
    clipRect(hand, F);
    Ortho.plan(state.scene, hand, P, Infinity);
    // the plot's boundary, dashed, and the section marks
    const u = state.stats.union;
    hand.line([P([u.x, u.y]), P([u.x + u.w, u.y]), P([u.x + u.w, u.y + u.d]), P([u.x, u.y + u.d]), P([u.x, u.y])], { alpha: 150, weight: 0.9, wob: 0.4, dash: [10, 6] });
    planMarks(hand, P, O);
    planFurniture(hand, state, P, S.s);
    hand.unclip();
    hand.text('SITE PLAN', F.x + 14, F.y + 10, 11, LBL);
    northMark(hand, F.x + F.w - 40, F.y + 10);
    return null;
  }

  // A-02: the ground floor and a typical upper floor (or the roof), one above the other
  function paintPlans(hand, state) {
    const Pl = state.set.plans, O = state.ortho, scene = state.scene;
    for (const c of Pl.cuts) {
      const b = c.band;
      const P = (p) => [b.ox + p[0] * Pl.s, b.oy + p[1] * Pl.s];
      clipRect(hand, b);
      Ortho.plan(scene, hand, P, c.z);
      planMarks(hand, P, O);
      planFurniture(hand, state, P, Pl.s);
      hand.unclip();
      hand.text(c.label, b.x + 14, b.y + 10, 11, LBL);
      northMark(hand, b.x + b.w - 40, b.y + 10);
    }
    const b1 = Pl.cuts[1].band;
    hand.line([[b1.x, b1.y - 20], [b1.x + b1.w, b1.y - 20]], RULE);
    return null;
  }

  // A-03: two sections at right angles, each looking at the far half of the scene
  function paintSections(hand, state) {
    const Se = state.set.sections, scene = state.scene;
    let first = null;
    for (const c of Se.cuts) {
      const b = c.band;
      const P = (p) => [b.ox + c.sx(p) * Se.s, b.ground - p[2] * Se.s];
      clipRect(hand, b);
      Ortho.section(scene, hand, P, c.dir, c.cut);
      const g1 = groundLine(hand, (q) => [b.ox + q[0] * Se.s, b.ground - q[1] * Se.s], c.x0, c.x1);
      heightDim(hand, state, b, Se.s, c.u0);
      levelMarks(hand, state, b, Se.s);
      hand.unclip();
      hand.text(c.label, b.x + 14, b.y + 10, 11, LBL);
      // the datum label sits at the ground line's end, kept inside the band
      hand.text('+0.00', Math.min(g1[0], b.x + b.w) - hand.textWidth('+0.00', 9) - 6, g1[1] - 12, 9, LBL);
      if (!first) first = { yBase: b.ground, step: state.spec.floorH * Se.s, n: state.spec.floors };
    }
    const b1 = Se.cuts[1].band;
    hand.line([[b1.x, b1.y - 20], [b1.x + b1.w, b1.y - 20]], RULE);
    return first;
  }

  // A-04: four elevations, nothing cut, the far things drawn first
  function paintElevations(hand, state) {
    const El = state.set.elevations, scene = state.scene;
    let first = null;
    for (const c of El.cells) {
      const b = c.cell;
      const P = (p) => [b.ox + c.sx(p) * El.s, b.ground - p[2] * El.s];
      clipRect(hand, b);
      Ortho.elevation(scene, hand, P, c.side);
      groundLine(hand, (q) => [b.ox + q[0] * El.s, b.ground - q[1] * El.s], c.x0, c.x1);
      heightDim(hand, state, b, El.s, c.u0);
      levelMarks(hand, state, b, El.s);
      hand.unclip();
      hand.text(c.label, b.x + 14, b.y + 10, 11, LBL);
      if (!first) first = { yBase: b.ground, step: state.spec.floorH * El.s, n: state.spec.floors };
    }
    if (El.stacked) {
      for (let i = 1; i < 4; i++) { const c = El.cells[i].cell; hand.line([[c.x, c.y - 20], [c.x + c.w, c.y - 20]], RULE); }
    } else {
      const c1 = El.cells[1].cell, c2 = El.cells[2].cell;
      hand.line([[c1.x - 20, c1.y], [c1.x - 20, c1.y + c1.h * 2 + 40]], RULE);
      hand.line([[c2.x, c2.y - 20], [c2.x + c2.w * 2 + 40, c2.y - 20]], RULE);
    }
    return first;
  }

  // A-05: the axonometric, clipped to its frame
  function paintAxon(hand, state) {
    const spec = state.spec, fit = state.fit, F = Sheet.layout({ schedule: spec.schedule }).frame;
    const P = (p) => {
      const q = ISO.proj(p);
      return [fit.ox + q[0] * fit.s, fit.oy + q[1] * fit.s];
    };
    clipRect(hand, F);
    Hand.render(state.scene, hand, P);
    hand.unclip();
    const g0 = P([spec.plot.x + spec.plot.w / 2, spec.plot.y + spec.plot.d / 2, 0]);
    return { yBase: g0[1], step: spec.floorH * fit.s, n: spec.floors };
  }

  const PAINTERS = [paintSite, paintPlans, paintSections, paintElevations, paintAxon];

// Paint a built sheet into any p5 renderer (the window in global mode, or a
// p5.Graphics) — the sheet scales to the renderer's width.
function paint(g, state, opts) {
  opts = opts || {};
  const spec = state.spec;
  const R = ISO.rng(state.seed ^ 0x5a5a);
  const wob = opts.wobble === undefined ? 1 : opts.wobble;
  const inkScale = (opts.ink === undefined ? 1 : opts.ink) * (spec.ink === 'FINE' ? 0.82 : spec.ink === 'HEAVY' ? 1.3 : 1);
  const hand = Hand.create(g, R.fork('hand'), { wob: wob, weightScale: inkScale });
  const L = Sheet.layout({ schedule: spec.schedule });
  const U = g.width / SW;

  // paper
  const tex = Paper.texture(g.width, g.height, spec.paper, state.seed);
  g.blendMode(g.BLEND);
  g.noTint();
  g.image(tex, 0, 0, g.width, g.height);

  g.push();
  g.scale(U);
  Paper.grid(hand, SW, SH, spec.grid === 'SMALL' ? 12.5 : 20);
  Paper.marginalia(hand, R.fork('margin'), SW, SH, L.schedule ? [L.title, L.footer, L.schedule] : [L.title, L.footer], spec.paper === 'ROUGH' ? 1.4 : 1);

  const floorInfo = PAINTERS[spec.sheet](hand, state);

  // chrome, with the floor scale keyed to the building's ground line
  Sheet.draw(hand, state.meta, floorInfo, { schedule: spec.schedule });
  if (spec.schedule && Strata.drawSchedule) Strata.drawSchedule(hand, state, L.schedule);
  g.pop();

  // pencil tooth over everything: the paper's own texture multiplied back in
  g.blendMode(g.MULTIPLY);
  g.tint(255, spec.paper === 'ROUGH' ? 50 : 70);
  g.image(tex, 0, 0, g.width, g.height);
  g.noTint();
  g.blendMode(g.BLEND);
}

  global.Strata = Object.assign(global.Strata || {}, { SW: SW, SH: SH, PALETTES: PALETTES, STYLE_KEYS: STYLE_KEYS, SHEETS: SHEETS, build: build, paint: paint });
})(window);
