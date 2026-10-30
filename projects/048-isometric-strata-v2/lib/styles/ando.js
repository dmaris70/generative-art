/*
 * styles/ando.js — ANDO: concrete and one slot of light.
 *
 * Tadao Ando's economy: a box of smooth concrete poured in 2.4 by 1.2 metre sheets,
 * the tie holes left in a regular grid, a free-standing wall plane cutting through
 * it, a basin of still water, a flight of steps, and in one wall a single slot of
 * light, here a cross. Everything is one material; the light is the ornament.
 *
 * Five tenets over the drawn scene: one slot of light (exactly one), concrete only
 * (no second material), on the 2.4 metre module (every set-out dimension a multiple
 * of 1.2), plane and volume (a free wall at least three modules long), water and
 * step (a basin and a flight of three or more). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const M2 = 2.4;
  const STYLE = {
    key: 'ANDO',
    header: 'CONCRETE AND LIGHT',
    titles: ['CHURCH OF LIGHT', 'ONE SLOT', 'CONCRETE PLANES', 'WATER TEMPLE', 'TIE HOLES'],
    substyles: ['CHURCH OF LIGHT', 'AZUMA', 'KOSHINO', 'WATER TEMPLE', 'MEDITATION'],
    types: ['CHAPEL', 'HOUSE', 'MUSEUM'],
    palettes: ['SMOOTH', 'SHUTTER', 'SLIT'],
    sites: [['PARK', 3], ['HILLSIDE', 2], ['WATERFRONT', 2], ['CITY EDGE', 1]],
    shapes: ['BOX'],
    floors: [1, 2],
    legend: [['VOLUME', 'sq'], ['PLANE', 'bar'], ['SLOT', 'dash'], ['TIE', 'dot'], ['BASIN', 'wave'], ['STEP', 'step']],

    size(rng, annex) {
      const w = M2 * rng.int(13, 15), d = M2 * rng.int(9, 11);
      return annex ? { w: M2 * 8, d: M2 * 6 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, conc = c[0], conc2 = c[1], light = c[2], timber = [120, 92, 66], water = c[4];
      const setout = [];
      const on = (v) => { setout.push(v); return v; };
      const vx = P.x + on(M2 * 2) , vy = P.y + on(M2);
      const bw = on(M2 * Rn.int(5, 6)), bd = on(M2 * Rn.int(3, 4)), hV = on(M2 * (N === 1 ? 2 : 3)) + 0.0, t = 0.4;
      const wallO = { color: conc, alpha: 140, mode: 'pencil', spacing: 3.2, angle: 'edge', edge: K.EDGE, tag: 'wall' };
      // the volume: four walls and a roof slab
      S.box(vx, vy + bd - t, 0, bw, t, hV, wallO);
      S.box(vx, vy, 0, bw, t, hV, wallO);
      S.box(vx, vy + t, 0, t, bd - 2 * t, hV, wallO);
      S.box(vx + bw - t, vy + t, 0, t, bd - 2 * t, hV, wallO);
      S.box(vx - 0.1, vy - 0.1, hV, bw + 0.2, bd + 0.2, 0.35, { color: conc, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'roof' });
      S.count('VOLUME');
      // tie holes on the two visible faces, on the 2.4 by 1.2 sheet grid
      let ties = 0;
      const tie = (x, y, z) => { S.custom([x, y, z], (hand, Pj, it) => { const p = Pj(it.anchor); hand.dot(p[0], p[1], 0.75, { color: [60, 62, 68], alpha: 150 }); }, { bias: 0.5, tag: 'tie' }); ties++; };
      for (let i = 1; i < bw / M2 * 2; i++) for (let j = 1; j < hV / 1.2; j++) tie(vx + i * 1.2, vy + bd + 0.02, j * 1.2);
      for (let i = 1; i < bd / M2 * 2; i++) for (let j = 1; j < hV / 1.2; j++) tie(vx + bw + 0.02, vy + i * 1.2, j * 1.2);
      S.count('TIE', ties);

      // the slot of light: a cross in the end wall (+x face), or none, or two
      const nSlots = Rn.chance(0.12) ? 2 : 1;
      for (let s = 0; s < nSlots; s++) {
        const yc = vy + bd * (nSlots === 2 ? (s ? 0.75 : 0.25) : 0.5), zc = hV * 0.58, lc = [250, 248, 236];
        K.aperture(S, 'x1', vx + bw + 0.03, yc - 0.2, yc + 0.2, zc - hV * 0.34, zc + hV * 0.36, 'rect', lc, 'light');
        K.aperture(S, 'x1', vx + bw + 0.03, yc - 1.4, yc + 1.4, zc + hV * 0.1, zc + hV * 0.1 + 0.4, 'rect', lc, 'light');
        S.count('SLOT');
      }

      // the free plane, cutting through the volume's front corner
      const pl = M2 * Rn.int(2, 5), px = vx + on(M2 * 3), py = vy + bd;
      S.box(px, py, 0, 0.4, pl, hV + 0.6, { color: conc2, alpha: 140, mode: 'pencil', spacing: 3.2, angle: 'edge', edge: K.EDGE, tag: 'plane' });
      S.count('PLANE');
      for (let i = 1; i < pl / 1.2; i += 2) for (let j = 1; j < (hV + 0.6) / 1.2; j++) tie(px + 0.42, py + i * 1.2, j * 1.2);

      // steps up to the entrance, a basin in the forecourt
      const nSt = Rn.int(2, 5), sy = py + pl + 0.4;
      K.steps(S, vx + on(M2), sy, 0, M2, nSt, 0.17, 0.4, '+y', conc2, 'step');
      S.count('STEP', nSt);
      const basin = !Rn.chance(0.2);
      const bx = vx + bw + M2, by = vy + M2, bwid = M2 * 3, bdep = M2 * 2;
      if (basin && bx + bwid <= P.x + P.w && by + bdep <= P.y + P.d) {
        S.box(bx - 0.3, by - 0.3, 0, bwid + 0.6, bdep + 0.6, 0.3, { color: conc, alpha: 110, mode: 'flat', edge: K.EDGE, tag: 'plinth' });
        S.face(G.rect(bx, by, 0.32, bwid, bdep), { fill: { color: water, alpha: 100, mode: 'flat' }, edge: K.THIN, tag: 'pool' });
        S.count('BASIN');
        if (ctx.M) ctx.M.space({ name: 'BASIN', kind: 'water', x: bx, y: by, w: bwid, d: bdep, z: 0.3, h: 0, level: 0 });
      }
      // a timber door, which breaks the rule of one material
      const door = Rn.chance(0.15);
      if (door) S.box(vx + bw * 0.2, vy + bd - t - 0.02, 0, 1.6, 0.06, 2.4, { color: timber, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'door' });

      if (ctx.M) {
        for (let k = 0; k < N; k++) {
          const nm = { CHAPEL: 'CHAPEL', HOUSE: 'LIVING ROOM', MUSEUM: 'GALLERY' }[ctx.type || 'CHAPEL'];
          ctx.M.space({ name: nm, kind: 'room', x: vx + t, y: vy + t, w: bw - 2 * t, d: bd - 2 * t, z: 0, h: hV, level: 0 });
          if (N > 1) break;
        }
        ctx.M.space({ name: 'FORECOURT', kind: 'court', x: vx, y: vy + bd, w: bw, d: Math.min(pl + 2, P.y + P.d - (vy + bd)), z: 0, h: 0, level: 0 });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: vx + M2, y: sy, w: M2, d: nSt * 0.4, z: 0, h: nSt * 0.17, level: 0 });
      }

      const tenets = [
        { name: 'ONE SLOT OF LIGHT', ok: nSlots === 1 },
        { name: 'CONCRETE ONLY', ok: !door },
        { name: 'ON THE 2.4 M MODULE', ok: setout.every((v) => Math.abs(v / 1.2 - Math.round(v / 1.2)) < 0.01) },
        { name: 'PLANE AND VOLUME', ok: pl >= M2 * 3 },
        { name: 'WATER AND STEP', ok: basin && nSt >= 3 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.ando = STYLE;
})(window);
