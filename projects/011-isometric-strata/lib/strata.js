/*
 * strata.js — the Isometric Strata engine facade.
 *
 *   const state = Strata.build({ seed, mode, view, floors, detail, density, bldgs, site, paper });
 *   Strata.paint(g, state, { wobble, ink });   // g: the window (p5 global mode) or a p5.Graphics
 *
 * build() turns a seed and a few overrides into a specification, a Scene of
 * 3-D primitives (one of twelve styles on one of six sites), the legend
 * tallied from what was placed, and the fits for both sheet types. paint()
 * draws that state as a sheet scaled to the renderer's width. The sketch and
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

  const pv = opts.view | 0;
  const view = pv === 1 ? 'AXONOMETRIC' : pv === 2 ? 'PLAN + SECTION' : R.chance(0.3) ? 'PLAN + SECTION' : 'AXONOMETRIC';

  const spec = {
    view: view,
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
  const meta = {
    title: spec.title,
    subtitle: spec.substyle + ' / ' + (R.chance(0.5) ? spec.type : floors + 'F'),
    dwg: spec.dwg, sheet: '1/1', view: view,
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
  const fit = { s: s, ox: fcx - ((bx0 + bx1) / 2) * s, oy: fcy - ((by0 + by1) / 2) * s };

  // the orthographic sheet: plan above, section below, one scale for both
  // the plan is cut a little above the building's own ground floor — a style
  // on a podium or a plinth reports that datum
  const cutZ = (extra.datum || 0) + Math.min(1.6, spec.floorH * 0.4 + 0.3);
  const cutY = union.y + union.d / 2;
  let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity, ez1 = 0;
  for (const it of scene.items) {
    const pts = it.pts || (it.anchor ? [it.anchor] : []);
    for (const q of pts) {
      if (q[0] < ex0) ex0 = q[0]; if (q[0] > ex1) ex1 = q[0];
      if (q[1] < ey0) ey0 = q[1]; if (q[1] > ey1) ey1 = q[1];
      if (q[2] > ez1) ez1 = q[2];
    }
  }
  // the site runs far past the building; frame the plan on the plot plus a margin
  const m = Math.max(union.w, union.d) * 0.3 + 4;
  const px0 = Math.max(ex0, union.x - m), px1 = Math.min(ex1, union.x + union.w + m);
  const py0 = Math.max(ey0, union.y - m), py1 = Math.min(ey1, union.y + union.d + m);
  const gapY = 40, labelH = 26, pad = 30;
  const planH = (L.frame.h - gapY) * 0.56, secH = L.frame.h - gapY - planH;
  const so = Math.min((L.frame.w - 2 * pad) / (px1 - px0), (planH - 2 * pad - labelH) / (py1 - py0), (secH - 2 * pad - labelH) / (ez1 + 2));
  const ortho = {
    s: so, cutZ: cutZ, cutY: cutY,
    plan: { x: L.frame.x, y: L.frame.y, w: L.frame.w, h: planH, ox: L.frame.x + L.frame.w / 2 - ((px0 + px1) / 2) * so, oy: L.frame.y + labelH + (planH - labelH) / 2 - ((py0 + py1) / 2) * so },
    sec: { x: L.frame.x, y: L.frame.y + planH + gapY, w: L.frame.w, h: secH },
    ext: { x0: px0, x1: px1, y0: py0, y1: py1, z1: ez1 },
  };
  ortho.sec.ox = ortho.plan.ox;
  ortho.sec.ground = ortho.sec.y + labelH + (secH - labelH) / 2 + ((ez1 + 2) / 2) * so - so;
  return { seed: seed, spec: spec, scene: scene, meta: meta, fit: fit, ortho: ortho, tenets: extra.tenets || null };
}

  // Plan above, section below: the same scene cut by two half-spaces. The plan
// is cut just above the ground floor and looks down; the section is cut at
// the plot's centre line and looks at the far half. Cut edges are drawn heavy.
function paintPlanSection(hand, state) {
  const O = state.ortho, scene = state.scene, spec = state.spec, s = O.s;
  const LBL = { color: [48, 54, 64], alpha: 215 };
  const rule = { color: [58, 64, 74], alpha: 160, weight: 0.9, wob: 0.4 };

  // ---- plan ----
  const Pp = (p) => [O.plan.ox + p[0] * s, O.plan.oy + p[1] * s];
  hand.clipPath([[O.plan.x, O.plan.y], [O.plan.x + O.plan.w, O.plan.y], [O.plan.x + O.plan.w, O.plan.y + O.plan.h], [O.plan.x, O.plan.y + O.plan.h]]);
  Hand.renderView(scene, hand, Pp, { axis: 2, max: O.cutZ, view: 'plan', depth: (c) => c[2] });
  // the section line A-A across the plan
  const a0 = Pp([O.ext.x0 - 2, O.cutY, 0]), a1 = Pp([O.ext.x1 + 2, O.cutY, 0]);
  hand.line([a0, a1], { alpha: 200, weight: 1.1, wob: 0.3, dash: [16, 6] });
  for (const e of [a0, a1]) {
    hand.line([[e[0], e[1]], [e[0], e[1] + 14]], { alpha: 200, weight: 1.3, wob: 0.3 });
    hand.line([[e[0] - 5, e[1] + 9], [e[0], e[1] + 14], [e[0] + 5, e[1] + 9]], { alpha: 200, weight: 1.3, wob: 0.3 });
    hand.text('A', e[0], e[1] - 16, 11, LBL, { align: 'center' });
  }
  hand.unclip();
  hand.text('PLAN  +' + O.cutZ.toFixed(2), O.plan.x + 14, O.plan.y + 10, 11, LBL);
  hand.text('N', O.plan.x + O.plan.w - 40, O.plan.y + 10, 11, LBL);
  hand.line([[O.plan.x + O.plan.w - 34, O.plan.y + 30], [O.plan.x + O.plan.w - 34, O.plan.y + 12]], rule);
  hand.line([[O.plan.x + O.plan.w - 38, O.plan.y + 17], [O.plan.x + O.plan.w - 34, O.plan.y + 12], [O.plan.x + O.plan.w - 30, O.plan.y + 17]], rule);

  // ---- section ----
  hand.line([[O.sec.x, O.sec.y - 20], [O.sec.x + O.sec.w, O.sec.y - 20]], rule);
  const Ps = (p) => [O.sec.ox + p[0] * s, O.sec.ground - p[2] * s];
  hand.clipPath([[O.sec.x, O.sec.y], [O.sec.x + O.sec.w, O.sec.y], [O.sec.x + O.sec.w, O.sec.y + O.sec.h], [O.sec.x, O.sec.y + O.sec.h]]);
  Hand.renderView(scene, hand, Ps, { axis: 1, max: O.cutY, view: 'section', depth: (c) => c[1] });
  // the ground line, heavy, and the hatched earth below it
  const g0 = Ps([O.ext.x0 - 2, 0, 0]), g1 = Ps([O.ext.x1 + 2, 0, 0]);
  hand.line([g0, g1], { alpha: 235, weight: 2.4, wob: 0.3 });
  hand.poly([[g0[0], g0[1]], [g1[0], g1[1]], [g1[0], g1[1] + 26], [g0[0], g0[1] + 26]], { color: [70, 76, 88], alpha: 110, mode: 'hatch', spacing: 4, angle: Math.PI / 4 }, null);
  hand.unclip();
  hand.text('SECTION  A-A', O.sec.x + 14, O.sec.y + 10, 11, LBL);
  hand.text('+0.00', g1[0] - hand.textWidth('+0.00', 9) - 6, g1[1] - 12, 9, LBL);

  return { yBase: O.sec.ground, step: spec.floorH * s, n: spec.floors };
}

// Paint a built sheet into any p5 renderer (the window in global mode, or a
// p5.Graphics) — the sheet scales to the renderer's width.
function paint(g, state, opts) {
  opts = opts || {};
  const spec = state.spec, scene = state.scene, fit = state.fit;
  const R = ISO.rng(state.seed ^ 0x5a5a);
  const wob = opts.wobble === undefined ? 1 : opts.wobble;
  const inkScale = (opts.ink === undefined ? 1 : opts.ink) * (spec.ink === 'FINE' ? 0.82 : spec.ink === 'HEAVY' ? 1.3 : 1);
  const hand = Hand.create(g, R.fork('hand'), { wob: wob, weightScale: inkScale });
  const L = Sheet.layout();
  const U = g.width / SW;

  // paper
  const tex = Paper.texture(g.width, g.height, spec.paper, state.seed);
  g.blendMode(g.BLEND);
  g.noTint();
  g.image(tex, 0, 0, g.width, g.height);

  g.push();
  g.scale(U);
  Paper.grid(hand, SW, SH, spec.grid === 'SMALL' ? 12.5 : 20);
  Paper.marginalia(hand, R.fork('margin'), SW, SH, [L.title, L.footer], spec.paper === 'ROUGH' ? 1.4 : 1);

  let floorInfo;
  if (spec.view === 'AXONOMETRIC') {
    // the drawing, clipped to its frame
    const P = (p) => {
      const q = ISO.proj(p);
      return [fit.ox + q[0] * fit.s, fit.oy + q[1] * fit.s];
    };
    hand.clipPath([[L.frame.x, L.frame.y], [L.frame.x + L.frame.w, L.frame.y], [L.frame.x + L.frame.w, L.frame.y + L.frame.h], [L.frame.x, L.frame.y + L.frame.h]]);
    Hand.render(scene, hand, P);
    hand.unclip();
    const g0 = P([spec.plot.x + spec.plot.w / 2, spec.plot.y + spec.plot.d / 2, 0]);
    floorInfo = { yBase: g0[1], step: spec.floorH * fit.s, n: spec.floors };
  } else {
    floorInfo = paintPlanSection(hand, state);
  }

  // chrome, with the floor scale keyed to the building's ground line
  Sheet.draw(hand, state.meta, floorInfo);
  g.pop();

  // pencil tooth over everything: the paper's own texture multiplied back in
  g.blendMode(g.MULTIPLY);
  g.tint(255, spec.paper === 'ROUGH' ? 50 : 70);
  g.image(tex, 0, 0, g.width, g.height);
  g.noTint();
  g.blendMode(g.BLEND);
}

  global.Strata = { SW: SW, SH: SH, PALETTES: PALETTES, STYLE_KEYS: STYLE_KEYS, build: build, paint: paint };
})(window);
