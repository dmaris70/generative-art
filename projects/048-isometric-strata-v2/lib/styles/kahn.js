/*
 * styles/kahn.js — KAHN: served and servant.
 *
 * Louis Kahn's distinction as a grammar: the building is a grid of served rooms,
 * each a quiet single volume under its own roof light, and between and around
 * them the servant spaces, drawn as hollow piers: thick brick shells, open to the
 * sky at the top, carrying stairs, ducts and the structure itself. Room walls are
 * plain brick, pierced only by one large geometric opening each: a circle, an arch,
 * a triangle, a square. No column stands inside a room.
 *
 * Five tenets over the drawn scene: served and servant (every room has hollow piers
 * at its corners), hollow servants (every pier a shell), one room one light (a roof
 * light over each room), geometric apertures (every large opening a circle, arch,
 * triangle or square), clear span (no column inside a room). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, K = global.Kit;
  const STYLE = {
    key: 'KAHN',
    header: 'SERVED AND SERVANT',
    titles: ['SERVED AND SERVANT', 'ROOM STUDY', 'HOLLOW PIERS', 'PLAN OF ROOMS', 'ASSEMBLY'],
    substyles: ['KIMBELL', 'SALK', 'DHAKA', 'EXETER', 'ROCHESTER'],
    types: ['GALLERY', 'LIBRARY', 'ASSEMBLY', 'LABORATORY'],
    palettes: ['BRICK', 'KIMBELL', 'DHAKA'],
    sites: [['PARK', 3], ['PLAZA DIST', 2], ['CITY EDGE', 2], ['HILLSIDE', 1]],
    shapes: ['RECTANGLE'],
    floors: [1, 3],
    legend: [['PIER', 'sqh'], ['WALL', 'bar'], ['APERTURE', 'circ'], ['ROOFLIGHT', 'dot'], ['ROOM', 'sq'], ['SLAB', 'sqf']],

    size(rng, annex) {
      const R = rng.range(7.5, 10), ps = rng.range(2.2, 2.8);
      const nx = annex ? 1 : rng.int(2, 3), ny = annex ? 1 : rng.int(1, 2);
      return { w: nx * R + (nx + 1) * ps, d: ny * R + (ny + 1) * ps, R: R, ps: ps, nx: nx, ny: ny };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, brick = c[0], trav = c[1], dark = c[3];
      const { R, ps, nx, ny } = P;
      const H = N * FH, Hp = H + 0.9, t = 0.55, tw = 0.5;
      const xs = [], ys = [];
      for (let i = 0; i <= nx; i++) xs.push(P.x + ps / 2 + i * (R + ps));
      for (let j = 0; j <= ny; j++) ys.push(P.y + ps / 2 + j * (R + ps));
      const piers = [], rooms = [], apertures = [], lights = [];

      // servant piers: shells open at the top
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x0 = xs[i] - ps / 2, y0 = ys[j] - ps / 2, hollow = !Rn.chance(0.1);
        const o = { color: brick, alpha: 175, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'shaft' };
        if (hollow) {
          S.box(x0, y0, 0, ps, t, Hp, o);
          S.box(x0, y0 + ps - t, 0, ps, t, Hp, o);
          S.box(x0, y0 + t, 0, t, ps - 2 * t, Hp, o);
          S.box(x0 + ps - t, y0 + t, 0, t, ps - 2 * t, Hp, o);
          S.face(G.rect(x0 + t, y0 + t, Hp * 0.55, ps - 2 * t, ps - 2 * t), { fill: { color: K.VOID, alpha: 120, mode: 'flat' }, edge: null, tag: 'void', layer: 1, depth: -1e5 });
        } else S.box(x0, y0, 0, ps, ps, Hp, Object.assign({}, o, { tag: 'mass' }));
        S.count('PIER');
        piers.push({ x: xs[i], y: ys[j], hollow: hollow });
        if (ctx.M) ctx.M.space({ name: 'STAIR', kind: 'service', x: x0 + t, y: y0 + t, w: ps - 2 * t, d: ps - 2 * t, z: 0, h: Hp, level: 0 });
      }

      // walls between piers, each with one geometric opening on its visible face
      const SHAPES = ['circle', 'circle', 'arch', 'tri', 'rect'];
      const opening = (face, at, u0, u1) => {
        const slot = Rn.chance(0.1), shape = slot ? 'slot' : Rn.pick(SHAPES);
        const len = u1 - u0, cu = (u0 + u1) / 2, r = (slot ? 0.07 : Rn.range(0.2, 0.3)) * len;
        const zc = H * 0.56;
        if (slot) K.aperture(S, face, at, cu - r, cu + r, H * 0.15, H * 0.9, 'rect', K.VOID, 'slot');
        else K.aperture(S, face, at, cu - r, cu + r, zc - r, zc + r * (shape === 'arch' ? 1 : 1), shape, K.VOID, 'aperture');
        S.count('APERTURE');
        apertures.push(slot ? 'slot' : shape);
      };
      const wallOpt = { color: brick, alpha: 160, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: K.EDGE, tag: 'wall' };
      for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
        if (j > 0 && j < ny && Rn.chance(0.2)) continue; // an open side between rooms
        const x0 = xs[i] + ps / 2, y = ys[j] - tw / 2;
        S.box(x0, y, 0, R, tw, H, wallOpt); S.count('WALL');
        opening('y1', y + tw, x0, x0 + R);
      }
      for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) {
        if (i > 0 && i < nx && Rn.chance(0.2)) continue;
        const y0 = ys[j] + ps / 2, x = xs[i] - tw / 2;
        S.box(x, y0, 0, tw, R, H, wallOpt); S.count('WALL');
        opening('x1', x + tw, y0, y0 + R);
      }

      // roofs, each with its light
      const names = { GALLERY: ['GALLERY', 'READING ROOM', 'STUDIO'], LIBRARY: ['READING ROOM', 'STACKS', 'STUDY'], ASSEMBLY: ['ASSEMBLY ROOM', 'COMMON ROOM', 'GALLERY'], LABORATORY: ['LABORATORY', 'STUDIO', 'COMMON ROOM'] }[ctx.type || 'GALLERY'] || ['GALLERY'];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x0 = xs[i] + ps / 2, y0 = ys[j] + ps / 2;
        S.box(x0, y0, H, R, R, 0.4, { color: trav, alpha: 110, mode: 'flat', edge: K.EDGE, tag: 'slab' }); S.count('SLAB');
        const lit = !Rn.chance(0.12);
        if (lit) {
          const cx = x0 + R / 2, cy = y0 + R / 2, rr = R * 0.17, pts = [];
          for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, H + 0.41]); }
          S.face(pts, { fill: { color: K.VOID, alpha: 170, mode: 'flat' }, edge: K.THIN, tag: 'rooflight', depth: -1e5 + 1, layer: 2 });
          S.count('ROOFLIGHT');
        }
        S.count('ROOM');
        rooms.push({ lit: lit });
        if (ctx.M) ctx.M.space({ name: Rn.pick(names), kind: 'room', x: x0, y: y0, w: R, d: R, z: 0, h: H, level: 0 });
      }
      if (ctx.M) ctx.M.grid(xs, ys);

      const tenets = [
        { name: 'SERVED AND SERVANT', ok: piers.length >= 4 && rooms.length >= 1 },
        { name: 'HOLLOW SERVANTS', ok: piers.every((p) => p.hollow) },
        { name: 'ONE ROOM ONE LIGHT', ok: rooms.every((r) => r.lit) },
        { name: 'GEOMETRIC APERTURES', ok: apertures.every((a) => a !== 'slot') },
        { name: 'CLEAR SPAN', ok: S.items.every((it) => it.tag !== 'column') },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.kahn = STYLE;
})(window);
