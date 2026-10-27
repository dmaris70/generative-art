/*
 * styles/loos.js — LOOS: the Raumplan.
 *
 * Adolf Loos built the section, not the plan: a plain white cube on the outside,
 * punched with plain windows, and inside it rooms of different heights that
 * interlock, their floors at different levels, joined by short flights of stairs.
 * The grammar is a cube, four plain walls and a parapet; inside, four zones split
 * by partitions, each zone stacked with rooms of its own heights, so no two
 * floors line up. The section is the drawing: read sheet A-03.
 *
 * Five tenets over the drawn scene: plain outside (no ornament on the cube),
 * raumplan (floors at three or more different offsets within a storey), ceilings
 * vary (three or more room heights), outside is a cube (width, depth and height
 * within one to one to one and a half), the stair lands between storeys.
 * Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, K = global.Kit;
  const STYLE = {
    key: 'LOOS',
    header: 'RAUMPLAN',
    titles: ['RAUMPLAN', 'SECTION IS THE DRAWING', 'HOUSE OF CUBES', 'PLAIN OUTSIDE', 'VILLA STUDY'],
    substyles: ['MULLER', 'MOLLER', 'STEINER', 'TZARA', 'KHUNER'],
    types: ['VILLA', 'HOUSE', 'APARTMENT'],
    palettes: ['MULLER', 'STEINER', 'MOLLER'],
    sites: [['CITY EDGE', 3], ['PARK', 2], ['CITY', 2], ['HILLSIDE', 1]],
    shapes: ['RECTANGLE'],
    floors: [2, 4],
    legend: [['WALL', 'bar'], ['SLAB', 'sqf'], ['WINDOW', 'grid'], ['STAIR', 'step'], ['PARAPET', 'dash'], ['ROOM', 'sq']],

    size(rng, annex) {
      const w = rng.range(11, 15), d = rng.range(10, 13);
      return annex ? { w: w * 0.7, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, plaster = c[0], marble = c[1], stone = c[2];
      const H = N * FH, t = 0.45;
      const bx = P.x, by = P.y + 1.2, w = P.w, d = P.d - 1.2;
      const wallO = { color: plaster, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'wall' };

      // ---- the plain cube: four walls, a slab, a parapet ----
      S.box(bx, by + d - t, 0, w, t, H, wallO);
      S.box(bx, by, 0, w, t, H, wallO);
      S.box(bx, by + t, 0, t, d - 2 * t, H, wallO);
      S.box(bx + w - t, by + t, 0, t, d - 2 * t, H, wallO);
      S.count('WALL', 4);
      S.box(bx, by, H, w, d, 0.3, { color: stone, alpha: 100, mode: 'flat', edge: K.EDGE, tag: 'slab' });
      const pa = { color: plaster, alpha: 110, mode: 'flat', edge: K.THIN, tag: 'parapet' };
      S.box(bx, by + d - 0.25, H + 0.3, w, 0.25, 0.9, pa);
      S.box(bx + w - 0.25, by, H + 0.3, 0.25, d - 0.25, 0.9, pa);
      S.count('PARAPET');
      const cornice = Rn.chance(0.12);
      if (cornice) S.box(bx - 0.3, by - 0.3, H - 0.5, w + 0.6, d + 0.6, 0.35, { color: stone, alpha: 110, mode: 'flat', edge: K.EDGE, tag: 'cornice' });

      // ---- plain windows punched in the two visible faces ----
      const win = (face, at, u0, len) => {
        for (let k = 0; k < N; k++) {
          const n = Math.max(2, Math.round(len / 3.2));
          for (let i = 0; i < n; i++) {
            if (Rn.chance(0.14)) continue;
            const cu = u0 + ((i + 0.5) / n) * len + Rn.range(-0.2, 0.2), ww = Rn.range(0.5, 0.75), z0 = k * FH + 0.9, hh = Rn.range(1.3, 1.7);
            K.aperture(S, face, at, cu - ww, cu + ww, z0, z0 + hh, 'rect', K.VOID, 'window');
            S.count('WINDOW');
          }
        }
      };
      win('y1', by + d, bx + 0.8, w - 1.6);
      win('x1', bx + w, by + 0.8, d - 1.6);

      // ---- the zones, split by partitions, each stacked with rooms of its own heights ----
      const ux = bx + t + (w - 2 * t) * Rn.range(0.4, 0.6), uy = by + t + (d - 2 * t) * Rn.range(0.4, 0.6), pt = 0.3;
      const part = { color: plaster, alpha: 100, mode: 'flat', edge: K.THIN, tag: 'wall' };
      S.box(bx + t, uy - pt / 2, 0, w - 2 * t, pt, H, part);
      S.box(ux - pt / 2, by + t, 0, pt, d - 2 * t, H, part);
      S.count('WALL', 2);
      const zones = [
        [bx + t, by + t, ux - pt / 2 - (bx + t), uy - pt / 2 - (by + t)], [ux + pt / 2, by + t, bx + w - t - (ux + pt / 2), uy - pt / 2 - (by + t)],
        [bx + t, uy + pt / 2, ux - pt / 2 - (bx + t), by + d - t - (uy + pt / 2)], [ux + pt / 2, uy + pt / 2, bx + w - t - (ux + pt / 2), by + d - t - (uy + pt / 2)],
      ];
      const HEIGHTS = [0.6, 0.8, 1.0, 1.3, 1.6];
      const NAMES = ['HALL', 'LIBRARY', 'DINING ROOM', 'BOUDOIR', 'SALON', 'STUDY', 'MUSIC ROOM', 'BATH'];
      const floorsZ = [], heights = [];
      zones.forEach((zn, zi) => {
        let z = 0;
        while (z < H - 0.9) {
          let h = FH * Rn.pick(HEIGHTS);
          if (z + h > H - 0.4 || H - (z + h) < FH * 0.45) h = H - z;
          const top = z + h;
          S.box(zn[0] + 0.05, zn[1] + 0.05, top - 0.3, zn[2] - 0.1, zn[3] - 0.1, 0.3, { color: marble, alpha: 90, mode: 'flat', edge: K.THIN, tag: 'slab' });
          S.count('SLAB');
          if (z > 0) floorsZ.push(z);
          heights.push(Math.round(h * 10) / 10);
          if (ctx.M) ctx.M.space({ name: Rn.pick(NAMES), kind: 'room', x: zn[0], y: zn[1], w: zn[2], d: zn[3], z: z, h: h - 0.3, level: Math.floor(z / FH) });
          S.count('ROOM');
          z = top;
        }
      });

      // ---- the stair that joins the splits: a run of steps in the front-right zone ----
      const nSt = Rn.int(8, 16), rise = 0.18, sw = 1.1, zn = zones[3];
      K.steps(S, zn[0] + 0.3, zn[1] + 0.4, 0, sw, nSt, rise, 0.28, '+y', marble, 'stair');
      S.count('STAIR', nSt);
      const stairTop = nSt * rise;
      if (ctx.M) ctx.M.space({ name: 'STAIR', kind: 'service', x: zn[0] + 0.3, y: zn[1] + 0.4, w: sw, d: nSt * 0.28, z: 0, h: H, level: 0 });

      // ---- the tenets ----
      const frac = floorsZ.map((z) => Math.round(((z % FH) / FH) * 6) / 6);
      const raum = new Set(frac).size >= 3;
      const allowed = ['wall', 'slab', 'window', 'parapet', 'stair', 'step', 'aperture'];
      const plain = !cornice && S.items.every((it) => !it.tag || allowed.indexOf(it.tag) >= 0);
      const rh = Math.max(w, d) / Math.min(w, d), rz = H / Math.max(w, d);
      const tenets = [
        { name: 'PLAIN OUTSIDE', ok: plain },
        { name: 'RAUMPLAN', ok: raum },
        { name: 'CEILINGS VARY', ok: new Set(heights).size >= 3 },
        { name: 'OUTSIDE IS A CUBE', ok: rh <= 1.35 && rz >= 0.6 && rz <= 1.5 },
        { name: 'STAIR LANDS BETWEEN', ok: Math.abs(stairTop / FH - Math.round(stairTop / FH)) > 0.12 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.loos = STYLE;
})(window);
