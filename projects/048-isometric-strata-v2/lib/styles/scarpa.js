/*
 * styles/scarpa.js — SCARPA: the joint.
 *
 * Carlo Scarpa drew every junction, so the grammar draws them too. Walls of
 * concrete rise in stepped layers, each narrower than the one below; none touches the
 * ground, each floats on a shadow gap with a dark steel joint under it; a ribbon of
 * coloured tile runs along one; a narrow channel of water crosses the court with a
 * stepped stone edge and a slab bridge; in a free wall two circles interlock as one
 * opening. Two walls and a thin roof make the room.
 *
 * Five tenets over the drawn scene: shadow gap (every wall lifted off the slab),
 * stepped reveal (every wall of three layers), water channel, three materials meet
 * (concrete, a tile band and a steel joint), interlocked circles. Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, K = global.Kit;
  const STYLE = {
    key: 'SCARPA',
    header: 'THE JOINT',
    titles: ['BRION TOMB', 'THE JOINT', 'CASTELVECCHIO', 'WATER AND STONE', 'DETAIL STUDY'],
    substyles: ['BRION', 'CASTELVECCHIO', 'OLIVETTI', 'QUERINI', 'GIPSOTECA'],
    types: ['TOMB', 'GALLERY', 'SHOWROOM'],
    palettes: ['BRION', 'VERONA', 'VENICE'],
    sites: [['PARK', 3], ['WATERFRONT', 2], ['CITY EDGE', 2]],
    shapes: ['PLANES'],
    floors: [1, 2],
    legend: [['PLANE', 'bar'], ['REVEAL', 'dash'], ['CHANNEL', 'wave'], ['RING', 'circ'], ['TILE', 'sqh'], ['STEP', 'step']],

    size(rng, annex) {
      const w = rng.range(30, 38), d = rng.range(26, 30);
      return annex ? { w: w * 0.6, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, conc = c[0], stone = c[1], tileA = c[2], steel = c[3], water = c[4];
      const z0 = 0.3, cx = P.x + P.w / 2, cy = P.y + P.d / 2, h = Math.max(3.4, N * FH);
      S.box(P.x + 1, P.y + 1, 0, P.w - 2, P.d - 2, z0, { color: stone, alpha: 100, mode: 'flat', edge: K.EDGE, tag: 'plinth' });
      const walls = [];
      const wallO = (col) => ({ color: col, alpha: 150, mode: 'pencil', spacing: 3, angle: 'edge', edge: K.EDGE, tag: 'wall' });

      // a wall of stepped layers, lifted on a shadow gap; along x or along y
      const wall = (x, y, len, th, wh, alongX) => {
        const gap = Rn.chance(0.12) ? 0 : 0.16, stepped = !Rn.chance(0.1);
        const layers = stepped ? [[0, 0.5], [0.5, 0.3], [1.0, 0.2]] : [[0, 1]];
        let z = z0 + gap;
        if (gap > 0) {
          if (alongX) S.box(x + 0.4, y + 0.05, z0, len - 0.8, th - 0.1, gap, { color: steel, alpha: 200, mode: 'flat', edge: null, tag: 'joint' });
          else S.box(x + 0.05, y + 0.4, z0, th - 0.1, len - 0.8, gap, { color: steel, alpha: 200, mode: 'flat', edge: null, tag: 'joint' });
        }
        for (const [inset, f] of layers) {
          const lh = wh * f;
          if (alongX) S.box(x + inset, y, z, len - 2 * inset, th, lh, wallO(conc));
          else S.box(x, y + inset, z, th, len - 2 * inset, lh, wallO(conc));
          z += lh;
        }
        S.count('PLANE'); if (gap > 0) S.count('REVEAL');
        walls.push({ gap: gap, stepped: stepped, x: x, y: y, len: len, th: th, alongX: alongX, top: z });
        return z;
      };

      // the room: two walls and a thin roof, with a tile ribbon on the front wall
      const rx = cx + 1, rl = 10, ry0 = cy - 4.2, ry1 = cy + 3.7, th = 0.5;
      wall(rx, ry0, rl, th, h, true);
      const topB = wall(rx, ry1, rl, th, h, true);
      S.box(rx - 0.5, ry0 - 0.3, topB + 0.02, rl + 1, ry1 - ry0 + th + 0.6, 0.3, { color: conc, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'slab' });
      const tile = !Rn.chance(0.12);
      if (tile) {
        const nT = 18;
        for (let i = 0; i < nT; i++) {
          K.aperture(S, 'y1', ry1 + th, rx + 0.4 + ((i + 0.05) / nT) * (rl - 0.8), rx + 0.4 + ((i + 0.9) / nT) * (rl - 0.8), z0 + 0.16 + h * 0.5 - 0.7, z0 + 0.16 + h * 0.5 - 0.2, 'rect', [tileA, steel, [236, 232, 222], tileA][i % 4], 'tile');
        }
        S.count('TILE', nT);
      }

      // a free wall with two interlocking circles in it
      const fw = cx + 13, fy = cy - 7, fl = 9;
      wall(fw, fy, fl, th, h * 1.05, false);
      const ring = !Rn.chance(0.12);
      if (ring) {
        const zc = z0 + 0.16 + h * 0.6, u = fy + fl / 2, r = 1.25;
        K.aperture(S, 'x1', fw + th, u - 0.55 - r, u - 0.55 + r, zc - r, zc + r, 'circle', K.VOID, 'ring');
        K.aperture(S, 'x1', fw + th, u + 0.55 - r, u + 0.55 + r, zc - r, zc + r, 'circle', K.VOID, 'ring');
        S.count('RING', 2);
      }

      // the water channel, a stepped stone edge, a slab bridge, steps down
      const channel = !Rn.chance(0.1), chx = cx - 3, chw = 0.9;
      if (channel) {
        const y0 = P.y + 3, y1 = P.y + P.d - 3;
        S.face(G.rect(chx, y0, z0 + 0.02, chw, y1 - y0), { fill: { color: water, alpha: 110, mode: 'flat' }, edge: K.THIN, tag: 'pool' });
        S.box(chx - 0.3, y0, z0, 0.3, y1 - y0, 0.14, { color: stone, alpha: 110, mode: 'flat', edge: K.THIN, tag: 'edge' });
        S.box(chx + chw, y0, z0, 0.3, y1 - y0, 0.14, { color: stone, alpha: 110, mode: 'flat', edge: K.THIN, tag: 'edge' });
        S.box(chx - 0.5, cy + 1, z0, chw + 1, 1.8, 0.22, { color: conc, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'slab' });
        S.count('CHANNEL');
        if (ctx.M) ctx.M.space({ name: 'CHANNEL', kind: 'water', x: chx, y: y0, w: chw, d: y1 - y0, z: z0, h: 0, level: 0 });
      }
      K.steps(S, rx + 2, ry1 + 2.2, z0, 2.6, 3, 0.15, 0.4, '+y', stone, 'step'); S.count('STEP', 3);

      if (ctx.M) {
        const nm = { TOMB: ['CHAPEL', 'ARCOSOLIUM'], GALLERY: ['GALLERY', 'COURT ROOM'], SHOWROOM: ['SHOWROOM', 'OFFICE'] }[ctx.type || 'TOMB'];
        ctx.M.space({ name: nm[0], kind: 'room', x: rx, y: ry0 + th, w: rl, d: ry1 - ry0 - th, z: z0, h: h, level: 0 });
        ctx.M.space({ name: 'COURT', kind: 'court', x: P.x + 2, y: P.y + 2, w: P.w - 4, d: P.d - 4, z: z0, h: 0, level: 0, area: (P.w - 4) * (P.d - 4) * 0.55 });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: rx + 2, y: ry1 + 2.2, w: 2.6, d: 1.2, z: 0, h: 0.5, level: 0 });
      }

      const tenets = [
        { name: 'SHADOW GAP', ok: walls.every((q) => q.gap > 0) },
        { name: 'STEPPED REVEAL', ok: walls.every((q) => q.stepped) },
        { name: 'WATER CHANNEL', ok: channel },
        { name: 'THREE MATERIALS MEET', ok: tile && walls.some((q) => q.gap > 0) },
        { name: 'INTERLOCKED CIRCLES', ok: ring },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: z0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.scarpa = STYLE;
})(window);
