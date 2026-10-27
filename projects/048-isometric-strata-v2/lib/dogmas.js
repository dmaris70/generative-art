/*
 * dogmas.js — tenets a style is held to that only the model can check.
 *
 * Each style's own tenets are predicates over the drawn scene (a part budget, a plinth, a
 * module). These are predicates over the measured model: how the building is carried, how its
 * volume is distributed, how its programme and circulation are arranged. They run after
 * Model.derive and are appended to the style's tenets, so they appear in the schedule, the
 * tally and the metadata like any other, and every one is explainable from a figure the
 * sheet already prints.
 *
 *   Dogmas.for(styleKey, q, M)  →  [{ name, ok, why }]
 *
 * `why` states the test in the sheet's own units, for the metadata and the audit.
 */
(function (global) {
  'use strict';

  const rooms = (M) => M.spaces.filter((s) => s.kind === 'room');
  const carried = (q, a) => a.indexOf(q.structure) >= 0;
  const t = (name, ok, why) => ({ name: name, ok: !!ok, why: why });
  const lastLevel = (q) => (q.levelArea && q.levelArea.length ? q.levelArea[q.levelArea.length - 1] : 0);

  // the proportions Palladio's Quattro Libri gives for rooms, as long : short
  const PALLADIAN = [1, 1.2, 4 / 3, 1.414, 1.5, 5 / 3, 2];
  const palladian = (sp) => {
    const w = sp.bb.x1 - sp.bb.x0, d = sp.bb.y1 - sp.bb.y0, r = Math.max(w, d) / Math.max(0.01, Math.min(w, d));
    return PALLADIAN.some((p) => Math.abs(r - p) / p < 0.05);
  };

  const DOGMAS = {
    mexican: (q) => [
      t('PATIO AS ROOM', q.open >= 0.2 * q.gfa, 'open space at least a fifth of floor area'),
      t('SEQUENCE OF COURTS', q.circ.depth >= 7, 'a route at least seven steps deep from the entry'),
    ],
    decon: (q) => [
      t('TOP HEAVY', q.levelArea.length > 1 && lastLevel(q) >= 0.9 * q.levelArea[0], 'top level at least nine tenths of the ground level'),
      t('NO REGULAR BAY', q.bayCV === null || q.bayCV > 0.6, 'column spacing varies by more than 60 per cent'),
    ],
    geodesic: (q) => [
      t('STRUCTURE AS SKIN', q.density < 0.012, 'solid volume under 1.2 per cent of the envelope'),
      t('LIFTED', q.groundOpen !== null && q.groundOpen >= 0.85, 'at least 85 per cent of the ground open'),
    ],
    brutalist: (q) => [
      t('HONEST MASS', q.density >= 0.08, 'solid volume at least 8 per cent of the envelope'),
      t('SERVED', q.circ.verticals.length >= 2, 'at least two vertical cores or stairs'),
    ],
    corbusier: (q) => [
      t('FREE GROUND', q.groundOpen !== null && q.groundOpen >= 0.96, 'at least 96 per cent of the ground open'),
      t('TRUE GRID', q.bayCV !== null && q.bayCV < 0.02, 'column spacing varies by under 2 per cent'),
      t('PROMENADE', q.circ.verticals.length >= 1 && q.circ.depth >= 3, 'a vertical connector and a route at least three steps deep'),
    ],
    destijl: (q) => [
      t('SLIDING PLANES', q.fill < 0.75, 'plan fills under 75 per cent of its envelope'),
      t('FLOATING PLANES', q.density < 0.065, 'solid volume under 6.5 per cent of the envelope'),
    ],
    metabolism: (q, M) => [
      t('TWIN CORES', q.circ.verticals.length >= 2, 'at least two shafts'),
      t('REPLACEABLE UNITS', M.spaces.filter((s) => s.kind === 'unit').length >= 30, 'at least thirty capsules'),
    ],
    palladio: (q, M) => {
      const rs = rooms(M).filter((s) => /CAMERE|SALA|SALONE/.test(s.name)), good = rs.filter(palladian).length;
      const big = rs.slice().sort((a, b) => b.area - a.area)[0], b = M.bodies.length ? M.bodies : [];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of rooms(M)) { x0 = Math.min(x0, s.bb.x0); x1 = Math.max(x1, s.bb.x1); y0 = Math.min(y0, s.bb.y0); y1 = Math.max(y1, s.bb.y1); }
      const heart = big && b && Math.abs((big.bb.x0 + big.bb.x1) / 2 - (x0 + x1) / 2) < 0.15 * (x1 - x0) && Math.abs((big.bb.y0 + big.bb.y1) / 2 - (y0 + y1) / 2) < 0.15 * (y1 - y0);
      return [
        t('ROOM RATIOS', rs.length > 0 && good >= 0.6 * rs.length, 'at least 60 per cent of rooms in a Palladian ratio (' + good + ' of ' + rs.length + ')'),
        t('HALL AT THE HEART', heart, 'the largest room sits within 15 per cent of the plan centre'),
        t('SHORT ROUTE', q.circ.depth <= 4, 'no room more than four steps from the entry'),
      ];
    },
    archigram: (q, M) => [
      t('PLUG-IN', M.spaces.filter((s) => s.kind === 'unit').length >= 8, 'at least eight pods'),
      t('MEGASTRUCTURE', carried(q, ['FRAME', 'CORE']) && q.slenderness >= 1.2, 'a frame or core at least 1.2 as tall as the root of its footprint'),
    ],
    mies: (q, M) => {
      const rs = rooms(M), tot = rs.reduce((s, r) => s + r.area, 0), big = rs.reduce((m, r) => Math.max(m, r.area), 0);
      return [
        t('UNIVERSAL SPACE', rs.length > 0 && rs.length <= 4 && big >= 0.6 * tot, 'at most four rooms, the largest at least 60 per cent of the room area'),
        t('REGULAR BAY', q.bayCV !== null && q.bayCV < 0.12, 'column spacing varies by under 12 per cent'),
      ];
    },
    cycladic: (q, M) => [
      t('COURTS BETWEEN', M.spaces.filter((s) => s.kind === 'court').length >= 3, 'at least three courts among the houses'),
      t('OPEN BEATS ROOMED', q.open >= 0.85 * q.gfa, 'open space at least 85 per cent of floor area'),
      t('COMPACT', q.fill >= 0.6, 'plan fills at least 60 per cent of its envelope'),
    ],
    kahn: (q) => [
      t('THICK SERVANTS', q.density >= 0.15, 'solid volume at least 15 per cent of the envelope'),
      t('A SEQUENCE OF ROOMS', q.rooms >= 4, 'at least four served rooms'),
    ],
    loos: (q) => [
      t('ROOMS BY HEIGHT', q.rooms >= 16, 'at least sixteen rooms in the cube'),
      t('ONE STAIR', q.circ.verticals.length <= 1, 'a single stair joins every level'),
    ],
    terragni: (q) => [
      t('OPEN GROUND', q.groundOpen !== null && q.groundOpen >= 0.9, 'at least 90 per cent of the ground open'),
      t('REGULAR BAY', q.bayCV !== null && q.bayCV < 0.1, 'column spacing varies by under 10 per cent'),
    ],
    aalto: (q) => [
      t('BRICK MASS', q.density >= 0.33, 'solid volume at least a third of the envelope'),
      t('ARTICULATED PLAN', q.fill < 0.62, 'plan fills under 62 per cent of its envelope'),
    ],
    wright: (q) => [
      t('SPREADING PLAN', q.fill <= 0.25, 'plan fills a quarter or less of its envelope'),
      t('MANY ROOMS', q.rooms >= 8, 'at least eight rooms'),
    ],
    bawa: (q) => [
      t('OPEN HOUSE', q.density <= 0.04, 'solid volume at most 4 per cent of the envelope'),
      t('COURT AND VERANDA', q.open >= 0.35 * q.gfa, 'open space at least 35 per cent of floor area'),
    ],
    ando: (q) => [
      t('ONE ROOM', q.rooms <= 1, 'a single room'),
      t('OPEN BEYOND', q.open >= 1.5 * q.gfa, 'open space at least one and a half times the floor area'),
    ],
    constructivist: (q) => [
      t('TALL COMPOSITION', q.slenderness >= 1.6, 'at least 1.6 as tall as the root of its footprint'),
      t('ISLAND ON A PLAZA', q.groundOpen !== null && q.groundOpen >= 0.6, 'at least 60 per cent of the ground open'),
    ],
    scarpa: (q) => [
      t('MUCH WALL', q.wallLen >= 100, 'at least 100 metres of wall'),
      t('OPEN COURT', q.groundOpen !== null && q.groundOpen >= 0.69, 'at least 69 per cent of the ground open'),
    ],
    superstudio: (q) => [
      t('SOLID MONUMENT', q.density >= 0.4, 'solid volume at least 40 per cent of the envelope'),
      t('LOW AND LONG', q.slenderness <= 0.68, 'no taller than two thirds the root of its footprint'),
    ],
    friedman: (q) => [
      t('OPEN BELOW', q.groundOpen !== null && q.groundOpen >= 0.975, 'at least 97.5 per cent of the ground open'),
      t('MANY UNITS', q.rooms >= 24, 'at least twenty-four units'),
    ],
    constant: (q) => [
      t('WIDE SECTORS', q.open >= 374, 'at least 374 square metres of deck'),
      t('DEEP ROUTE', q.circ.depth >= 4, 'a route at least four steps deep'),
    ],
    soleri: (q) => [
      t('DENSE', q.density >= 0.39, 'solid volume at least 39 per cent of the envelope'),
      t('COMPACT PLAN', q.fill >= 0.78, 'plan fills at least 78 per cent of its envelope'),
    ],
    santelia: (q) => [
      t('TALL', q.slenderness >= 1.24, 'at least 1.24 as tall as the root of its footprint'),
      t('FOUR LIFTS', q.circ.verticals.length >= 4, 'at least four lift shafts'),
    ],
    otto: (q) => [
      t('WIDE HALL', q.gfa >= 516, 'at least 516 square metres under the skin'),
      t('MANY MASTS', q.columns >= 3, 'at least three masts'),
    ],
    price: (q) => [
      t('OPEN BELOW', q.groundOpen !== null && q.groundOpen >= 0.85, 'at least 85 per cent of the ground open'),
      t('DEEP FRAME', q.circ.depth >= 5, 'a route at least five steps deep'),
    ],
    boullee: (q) => [
      t('ONE HALL', q.rooms <= 1, 'a single hall'),
      t('RISING FORM', q.slenderness >= 1.03, 'at least as tall as the root of its footprint'),
    ],
    ferriss: (q) => [
      t('DENSE CLUSTER', q.density >= 0.26, 'solid volume at least 26 per cent of the envelope'),
      t('VERTICAL', q.slenderness >= 1.67, 'at least 1.67 as tall as the root of its footprint'),
    ],
    antfarm: (q) => [
      t('LARGE AIR', q.gfa >= 199, 'at least 199 square metres of air hall'),
      t('LONG PASSAGES', q.circ.routeLen >= 28, 'at least 28 metres of passage and route'),
    ],
    fresco: (q) => [
      t('MANY SEGMENTS', q.rooms >= 49, 'at least forty-nine segments'),
      t('LONG ROUTE', q.circ.depth >= 16, 'a route at least sixteen steps deep'),
    ],
    shukhov: (q) => [
      t('TALL AS A TOWER', q.slenderness >= 3.3, 'at least 3.3 as tall as the root of its footprint'),
      t('ONE TOWER', q.columns <= 6, 'a single ring of footings'),
    ],
    rossi: (q) => [
      t('MONUMENT', q.density >= 0.15, 'solid volume at least 15 per cent of the envelope'),
      t('LOW AND LONG', q.slenderness < 0.68, 'no taller than 0.68 of the root of its footprint'),
    ],
  };

  global.Dogmas = { for: function (key, q, M) { return DOGMAS[key] ? DOGMAS[key](q, M) : []; }, KEYS: Object.keys(DOGMAS) };
})(window);
