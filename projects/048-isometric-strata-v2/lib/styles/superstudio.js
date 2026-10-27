/*
 * styles/superstudio.js — SUPERSTUDIO: the continuous monument.
 *
 * Superstudio, Florence, 1969: one architecture for the whole planet, a single white
 * block ruled with a square grid, running across landscape and city without a window,
 * a door or a change of surface. The grammar is a long bar and a second bar crossing
 * it, both white, every face ruled on one module, the bar notched once and stepped
 * down at its end. There is nothing to read but the grid.
 *
 * Five tenets over the drawn scene: one grid (every line on one module), continuous
 * (the bar at least three times as long as it is high), edge to edge (it spans nine
 * tenths of the plot), unbroken (no opening in any face), white (no second colour).
 * Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'SUPERSTUDIO',
    header: 'CONTINUOUS MONUMENT',
    titles: ['CONTINUOUS MONUMENT', 'TWELVE IDEAL CITIES', 'THE GRID', 'SUPERSURFACE', 'NO OBJECT'],
    substyles: ['MONUMENT', 'SUPERSURFACE', 'HISTOGRAMS', 'SALVATION', 'ACTS'],
    types: ['MONUMENT', 'CITY', 'WALL'],
    palettes: ['WHITE', 'GRIDDER', 'BLACKBOARD'],
    sites: [['PARK', 3], ['WATERFRONT', 2], ['HILLSIDE', 2], ['CITY EDGE', 1]],
    shapes: ['SLAB'],
    floors: [3, 6],
    legend: [['MONUMENT', 'sq'], ['GRIDLINE', 'grid'], ['CROSSING', 'bar'], ['CUT', 'dash'], ['STEP', 'step']],

    size(rng, annex) {
      const w = rng.range(42, 52), d = rng.range(30, 36);
      return annex ? { w: w * 0.55, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, white = c[0], line = c[1], accent = c[2];
      const m = 2.4, H = Math.max(7.2, Math.round((N * FH * 0.9) / m) * m);
      const Lmax = Math.floor((P.w - 4) / m) * m;
      const L = Rn.chance(0.18) ? Math.floor((Lmax * 0.7) / m) * m : Lmax;
      const wd = m * Rn.int(4, 5);
      const bx = P.x + (P.w - L) / 2, by = P.y + (P.d - wd) / 2 - 2;
      const lineP = { alpha: 105, weight: 0.65, wob: 0.25 };
      let lines = 0, modules = new Set();
      const grid = (x, y, z, w, d, h, mod) => {
        // top face
        for (let i = 1; i < w / mod - 0.01; i++) { S.line([[x + i * mod, y, z + h + 0.01], [x + i * mod, y + d, z + h + 0.01]], lineP, { depth: D([x + i * mod, y + d, z + h]) + 0.05 }); lines++; }
        for (let j = 1; j < d / mod - 0.01; j++) { S.line([[x, y + j * mod, z + h + 0.01], [x + w, y + j * mod, z + h + 0.01]], lineP, { depth: D([x + w, y + j * mod, z + h]) + 0.05 }); lines++; }
        // front (+y) face
        for (let i = 1; i < w / mod - 0.01; i++) { S.line([[x + i * mod, y + d + 0.01, z], [x + i * mod, y + d + 0.01, z + h]], lineP, { depth: D([x + i * mod, y + d, z + h]) + 0.05 }); lines++; }
        for (let k = 1; k < h / mod - 0.01; k++) { S.line([[x, y + d + 0.01, z + k * mod], [x + w, y + d + 0.01, z + k * mod]], lineP, { depth: D([x + w, y + d, z + k * mod]) + 0.05 }); lines++; }
        // end (+x) face
        for (let j = 1; j < d / mod - 0.01; j++) { S.line([[x + w + 0.01, y + j * mod, z], [x + w + 0.01, y + j * mod, z + h]], lineP, { depth: D([x + w, y + j * mod, z + h]) + 0.05 }); lines++; }
        for (let k = 1; k < h / mod - 0.01; k++) { S.line([[x + w + 0.01, y, z + k * mod], [x + w + 0.01, y + d, z + k * mod]], lineP, { depth: D([x + w, y + d, z + k * mod]) + 0.05 }); lines++; }
        modules.add(mod);
      };
      const bar = (x, y, z, w, d, h, mod, col, tag) => { S.box(x, y, z, w, d, h, { color: col || white, alpha: 105, mode: 'flat', edge: K.EDGE, tag: tag || 'monument' }); grid(x, y, z, w, d, h, mod); S.count('MONUMENT'); };

      // the long bar, notched once, and stepped down at its end
      const cut = m * 2, cutAt = bx + m * Math.round((L * Rn.range(0.4, 0.6)) / m);
      const stepL = m * 4, stepH = Math.round((H * 0.5) / m) * m;
      bar(bx, by, 0, cutAt - bx, wd, H, m);
      bar(cutAt + cut, by, 0, bx + L - stepL - (cutAt + cut), wd, H, m);
      bar(bx + L - stepL, by, 0, stepL, wd, stepH, m);
      S.count('CUT'); S.count('STEP');
      // the crossing bar, lower, at right angles
      const cw = m * 4, cl = Math.min(P.d - 4, m * Rn.int(8, 11)), cxx = bx + m * Math.round((L * 0.2) / m);
      const crossMod = Rn.chance(0.12) ? 1.8 : m;
      bar(cxx, by + wd, 0, cw, cl - wd > 0 ? Math.min(cl, P.y + P.d - 1 - (by + wd)) : cw, Math.round((H * 0.6) / m) * m, crossMod);
      S.count('CROSSING');
      const punched = Rn.chance(0.15), tinted = Rn.chance(0.12);
      if (punched) K.aperture(S, 'y1', by + wd, bx + L * 0.7, bx + L * 0.7 + 1.6, H * 0.4, H * 0.4 + 2, 'rect', K.VOID, 'window');
      if (tinted) S.box(bx + L * 0.3, by + wd, H, m * 2, m, m, { color: accent, alpha: 170, mode: 'flat', edge: K.EDGE, tag: 'monument' });

      if (ctx.M) ctx.M.grid([bx, bx + L], [by, by + wd]);
      const tenets = [
        { name: 'ONE GRID', ok: modules.size === 1 },
        { name: 'CONTINUOUS', ok: L >= 3 * H },
        { name: 'EDGE TO EDGE', ok: L >= 0.9 * P.w - 4 },
        { name: 'UNBROKEN', ok: !punched },
        { name: 'WHITE', ok: !tinted },
      ];
      void line; void lines;
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.superstudio = STYLE;
})(window);
