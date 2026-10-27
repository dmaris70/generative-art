/*
 * styles/constant.js — CONSTANT: New Babylon.
 *
 * Constant Nieuwenhuys, 1956 to 1974: a city for people freed from work, built as
 * sectors, huge platforms raised on slender legs at different heights, joined by
 * stairs and ramps, never touching the ground that belongs to the traffic and the
 * old city. On the platforms the nomads build camps and unbuild them. The grammar is
 * four decks at four levels, staggered round a loop of flights, a few huts on each.
 *
 * Five tenets over the drawn scene: four sectors (four decks), raised (every deck
 * five metres or more up), a storey between decks (the decks at least 3.1 metres apart), linked (every deck
 * joined to the next by a flight), no ground claim (nothing on the ground but legs and
 * stairs). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'CONSTANT',
    header: 'NEW BABYLON',
    titles: ['NEW BABYLON', 'SECTOR STUDY', 'YELLOW SECTOR', 'LABYRINTH', 'HOMO LUDENS'],
    substyles: ['YELLOW SECTOR', 'RED SECTOR', 'GYPSY CAMP', 'ORANGE SECTOR', 'SECTOR NL'],
    types: ['SECTOR', 'CITY'],
    palettes: ['BABYLON', 'YELLOW', 'NOMAD'],
    sites: [['CITY', 3], ['CITY EDGE', 2], ['WATERFRONT', 2]],
    shapes: ['SECTORS'],
    floors: [2, 4],
    legend: [['DECK', 'sqf'], ['LEG', 'dot'], ['STAIR', 'step'], ['HUT', 'sq'], ['LATTICE', 'grid']],

    size(rng, annex) {
      const w = rng.range(40, 46), d = rng.range(32, 36);
      return annex ? { w: w * 0.6, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, deckC = c[0], legC = c[1], hutC = c[2], accent = c[3];
      const nD = ctx.annex ? 3 : (N >= 3 ? 4 : 3);
      const base = Rn.range(4.4, 7.2), dz = Rn.range(2.6, 3.6), dw = 11, dd = 8.5, th = 0.5;
      const nSt = Math.round(dz / 0.18), gap = nSt * 0.34;
      const ox = P.x + (P.w - (2 * dw + gap)) / 2, oy = P.y + (P.d - (2 * dd + gap)) / 2;
      // deck positions round a loop: A, B to its east, C south of B, D west of C
      const pos = [[ox, oy], [ox + dw + gap, oy], [ox + dw + gap, oy + dd + gap], [ox, oy + dd + gap]];
      const decks = [], linked = [];
      const dirs = ['+x', '+y', '-x'];
      const stub = Rn.chance(0.12) ? Rn.int(0, 2) : -1;
      for (let i = 0; i < nD; i++) {
        const z = base + i * dz, [x, y] = pos[i];
        S.box(x, y, z, dw, dd, th, { color: deckC, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'deck' }); S.count('DECK');
        // a lattice ruled on the deck
        for (let k = 1; k < 5; k++) S.line([[x + (dw * k) / 5, y, z + th + 0.01], [x + (dw * k) / 5, y + dd, z + th + 0.01]], { alpha: 70, weight: 0.55, wob: 0.2 }, { depth: D([x + (dw * k) / 5, y + dd, z]) + 0.05 });
        for (let k = 1; k < 4; k++) S.line([[x, y + (dd * k) / 4, z + th + 0.01], [x + dw, y + (dd * k) / 4, z + th + 0.01]], { alpha: 70, weight: 0.55, wob: 0.2 }, { depth: D([x + dw, y + (dd * k) / 4, z]) + 0.05 });
        S.count('LATTICE');
        // legs
        for (const lp of [[x + 1, y + 1], [x + dw - 1, y + 1], [x + 1, y + dd - 1], [x + dw - 1, y + dd - 1], [x + dw / 2, y + dd / 2]]) {
          S.box(lp[0] - 0.25, lp[1] - 0.25, 0, 0.5, 0.5, z, { color: legC, alpha: 190, mode: 'flat', edge: K.THIN, tag: 'column' }); S.count('LEG');
        }
        // huts
        const nh = Rn.int(1, 3);
        for (let h = 0; h < nh; h++) {
          const hx = x + 1.5 + h * 3.2 + Rn.range(0, 0.6), hy = y + 1.2 + Rn.range(0, dd - 4.5), hw = Rn.range(1.8, 2.8);
          S.box(hx, hy, z + th, hw, hw * 0.9, 2.1, { color: h === 0 ? accent : hutC, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'hut' }); S.count('HUT');
          if (ctx.M) ctx.M.space({ name: 'CAMP', kind: 'unit', x: hx, y: hy, w: hw, d: hw * 0.9, z: z + th, h: 2.1, level: Math.floor((z + th) / FH) });
        }
        decks.push({ z: z });
        if (ctx.M) ctx.M.space({ name: 'SECTOR', kind: 'terrace', x: x, y: y, w: dw, d: dd, z: z, h: th, level: Math.floor(z / FH) });
      }
      // a flight from each deck up to the next
      for (let i = 0; i < nD - 1; i++) {
        if (i === stub) { linked.push(false); continue; }
        const dir = dirs[i], [x, y] = pos[i], z = base + i * dz + th;
        if (dir === '+x') K.steps(S, x + dw, y + dd / 2 - 0.8, z, 1.6, nSt, 0.18, 0.34, '+x', deckC, 'stair');
        else if (dir === '+y') K.steps(S, x + dw / 2 - 0.8, y + dd, z, 1.6, nSt, 0.18, 0.34, '+y', deckC, 'stair');
        else K.steps(S, x, y + dd / 2 - 0.8, z, 1.6, nSt, 0.18, 0.34, '-x', deckC, 'stair');
        S.count('STAIR'); linked.push(true);
        if (ctx.M) ctx.M.space({ name: 'STAIR', kind: 'service', x: x, y: y, w: 1.6, d: 1.6, z: z, h: dz, level: Math.floor(z / FH) });
      }
      const ground = Rn.chance(0.12);
      if (ground) S.box(P.x + 3, P.y + P.d - 6, 0, 3, 2.4, 2.2, { color: hutC, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'hut' });

      const tenets = [
        { name: 'FOUR SECTORS', ok: decks.length >= 4 },
        { name: 'RAISED', ok: base >= 5 },
        { name: 'A STOREY BETWEEN DECKS', ok: dz >= 3.1 },
        { name: 'LINKED', ok: linked.every((q) => q) },
        { name: 'NO GROUND CLAIM', ok: !ground },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.constant = STYLE;
})(window);
