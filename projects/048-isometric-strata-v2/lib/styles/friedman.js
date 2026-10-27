/*
 * styles/friedman.js — FRIEDMAN: the spatial city.
 *
 * Yona Friedman's Ville Spatiale, 1958: a space frame raised on a few slender legs
 * over the existing city, which it leaves untouched, and inside the frame the
 * inhabitants place and move their own units where they like. The grammar is a lattice
 * of struts in two or three layers on pilotis a long way apart, a scatter of floor
 * plates and small cubes in a minority of its cells, and a stair or two. The frame is
 * the only thing that is designed; the filling is up to the people.
 *
 * Five tenets over the drawn scene: raised (six metres or more clear below), three
 * layers (three levels of lattice), free infill (no more than 30 per cent of the cells
 * filled), on a module (every pilotis on the frame's grid), mobile units (twenty-two
 * or more cubes). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'FRIEDMAN',
    header: 'SPATIAL CITY',
    titles: ['VILLE SPATIALE', 'SPACE FRAME', 'MOBILE ARCHITECTURE', 'FREE INFILL', 'PARIS SPATIAL'],
    substyles: ['PARIS', 'TOKYO', 'MONACO', 'MOBILE', 'PRIVATE'],
    types: ['CITY', 'HOUSING', 'CIVIC'],
    palettes: ['LATTICE', 'SKYFRAME', 'PRIMARY'],
    sites: [['CITY', 3], ['CITY EDGE', 2], ['WATERFRONT', 2], ['PLAZA DIST', 1]],
    shapes: ['FRAME'],
    floors: [2, 3],
    legend: [['PILOTIS', 'cols'], ['STRUT', 'dash'], ['PLATE', 'sqf'], ['UNIT', 'sq'], ['STAIR', 'step'], ['BRACE', 'x']],

    size(rng, annex) {
      const w = rng.range(40, 46), d = rng.range(32, 36);
      return annex ? { w: w * 0.55, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, steel = c[0], plateC = c[1], unitC = c[2], unitC2 = c[3];
      const cs = ctx.annex ? 4.2 : 4.8, nx = Math.max(4, Math.floor((P.w - 2) / cs)), ny = Math.max(3, Math.floor((P.d - 2) / cs));
      const clear = Rn.range(5.2, 8.5), layers = N, lz = (k) => clear + k * 3.2;
      const x0 = P.x + (P.w - nx * cs) / 2, y0 = P.y + (P.d - ny * cs) / 2;
      const strut = { color: steel, alpha: 190, weight: 0.85, wob: 0.3 }, brace = { color: steel, alpha: 120, weight: 0.6, wob: 0.3 };
      const xs = [], ys = [];
      for (let i = 0; i <= nx; i++) xs.push(x0 + i * cs);
      for (let j = 0; j <= ny; j++) ys.push(y0 + j * cs);

      // the pilotis: every second node, one pushed off the grid on some seeds
      const odd = Rn.chance(0.12);
      let nPil = 0, onGrid = true;
      for (let i = 0; i <= nx; i += 2) for (let j = 0; j <= ny; j += 2) {
        let x = xs[i], y = ys[j];
        if (odd && i === 2 && j === 2) { x += 1.1; onGrid = false; }
        S.box(x - 0.35, y - 0.35, 0, 0.7, 0.7, clear, { color: steel, alpha: 200, mode: 'flat', edge: K.EDGE, tag: 'pilotis' }); nPil++;
      }
      S.count('PILOTIS', nPil);
      // the lattice: horizontal grids at each level, verticals at every node, braces in some cells
      const dp = (x, y, z) => D([x, y, z]) + 0.02;
      for (let k = 0; k <= layers; k++) {
        const z = lz(k);
        for (let i = 0; i <= nx; i++) S.line([[xs[i], ys[0], z], [xs[i], ys[ny], z]], strut, { depth: dp(xs[i], ys[ny], z), tag: 'strut' });
        for (let j = 0; j <= ny; j++) S.line([[xs[0], ys[j], z], [xs[nx], ys[j], z]], strut, { depth: dp(xs[nx], ys[j], z), tag: 'strut' });
        S.count('STRUT', nx + ny + 2);
        if (k < layers) for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
          S.line([[xs[i], ys[j], z], [xs[i], ys[j], z + 3.2]], strut, { depth: dp(xs[i], ys[j], z + 3.2), tag: 'strut' });
          if (i < nx && j < ny && Rn.chance(0.18)) { S.line([[xs[i], ys[j], z], [xs[i + 1], ys[j], z + 3.2]], brace, { depth: dp(xs[i + 1], ys[j], z + 3.2), tag: 'brace' }); S.count('BRACE'); }
        }
      }
      // floor plates and cubes in a minority of the cells
      let cells = 0, filled = 0, units = 0, plateArea = 0;
      for (let k = 0; k < layers; k++) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        cells++;
        if (!Rn.chance(0.3)) continue;
        filled++;
        const z = lz(k);
        S.box(xs[i] + 0.1, ys[j] + 0.1, z, cs - 0.2, cs - 0.2, 0.2, { color: plateC, alpha: 90, mode: 'flat', edge: K.THIN, tag: 'slab' }); S.count('PLATE'); plateArea += cs * cs;
        if (Rn.chance(0.6)) {
          const u = cs * 0.72, o = (cs - u) / 2 + Rn.range(-0.3, 0.3);
          S.box(xs[i] + o, ys[j] + o, z + 0.2, u, u, 2.7, { color: Rn.chance(0.5) ? unitC : unitC2, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'unit' });
          S.count('UNIT'); units++;
          if (ctx.M) ctx.M.space({ name: 'UNIT', kind: 'unit', x: xs[i] + o, y: ys[j] + o, w: u, d: u, z: z + 0.2, h: 2.7, level: k });
        }
      }
      // a stair at one end, up through the layers
      const nSt = Math.round(lz(layers) / 0.18);
      K.steps(S, xs[nx] + 0.6, ys[1], 0, 1.4, Math.min(nSt, 60), 0.18, 0.3, '-x', plateC, 'stair'); S.count('STAIR');
      if (ctx.M) {
        ctx.M.grid(xs, ys);
        ctx.M.space({ name: 'FRAME LEVEL', kind: 'terrace', x: xs[0], y: ys[0], w: nx * cs, d: ny * cs, z: lz(0), h: 0.2, level: 0, area: Math.max(1, plateArea) });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: xs[nx] + 0.6, y: ys[1], w: 1.4, d: 4, z: 0, h: lz(layers), level: 0 });
      }

      const tenets = [
        { name: 'RAISED', ok: clear >= 6 },
        { name: 'THREE LAYERS', ok: layers >= 3 },
        { name: 'FREE INFILL', ok: filled <= 0.3 * cells },
        { name: 'ON A MODULE', ok: onGrid },
        { name: 'MOBILE UNITS', ok: units >= 22 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.friedman = STYLE;
})(window);
