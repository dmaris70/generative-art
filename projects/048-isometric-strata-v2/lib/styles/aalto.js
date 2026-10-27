/*
 * styles/aalto.js — AALTO: the free curve.
 *
 * Alvar Aalto against the orthogonal: brick wings meeting at right angles, and
 * against them one free curve, either a fan, a lecture hall opening from a point
 * like a hand, or a serpentine, a wall that undulates to give every room a view.
 * The wings step down toward the curve, a row of funnel roof lights admits daylight
 * from above, copper roofs, timber at the entrance. Brick below, plaster above.
 *
 * Five tenets over the drawn scene: one free curve (exactly one curved element),
 * two orthogonal wings, daylight from above (four or more roof lights), stepped
 * down (each wing no higher than the one before, the curve lowest), brick base
 * (every wing's ground storey is brick). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'AALTO',
    header: 'ORGANIC MODERN',
    titles: ['FREE CURVE', 'FAN PLAN', 'BAKER HOUSE', 'LIBRARY STUDY', 'WING AND WAVE'],
    substyles: ['BAKER', 'VIIPURI', 'SAYNATSALO', 'FINLANDIA', 'SEINAJOKI'],
    types: ['LIBRARY', 'DORMITORY', 'TOWN HALL'],
    palettes: ['SAYNATSALO', 'VIIPURI', 'FINLANDIA'],
    sites: [['PARK', 3], ['WATERFRONT', 2], ['CITY EDGE', 2], ['HILLSIDE', 1]],
    shapes: ['L-PLAN'],
    floors: [2, 3],
    legend: [['WING', 'bar'], ['CURVE', 'wave'], ['ROOFLIGHT', 'dot'], ['BRICK', 'sqh'], ['TIMBER', 'sq'], ['TERRACE', 'sqf']],

    size(rng, annex) {
      const w = rng.range(26, 34), d = rng.range(18, 24);
      return annex ? { w: w * 0.62, d: d * 0.72 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, brick = c[0], plaster = c[1], copper = c[2], timber = c[3];
      const w = P.w, d = P.d, bx = P.x, by = P.y;
      const wingB = !Rn.chance(0.12), fan = Rn.chance(0.55), secondCurve = Rn.chance(0.15);
      const nA = N, nB = wingB ? Rn.int(Math.max(1, N - 1), N) : 0, nC = Rn.int(1, N);
      const names = { LIBRARY: ['READING ROOM', 'STACKS', 'LECTURE HALL'], DORMITORY: ['DORMITORY', 'COMMON ROOM', 'LECTURE HALL'], 'TOWN HALL': ['OFFICES', 'COMMITTEE ROOM', 'COUNCIL CHAMBER'] }[ctx.type || 'LIBRARY'];
      const wings = [];
      const wallO = (col, tag) => ({ color: col, alpha: 150, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: K.EDGE, tag: tag });

      // a brick-and-plaster block: brick storey, plaster storeys above (or all brick)
      const block = (x, y, bw, bd, n, plasterBase, label) => {
        const baseTag = plasterBase ? 'plaster' : 'brick';
        S.box(x, y, 0, bw, bd, FH, wallO(plasterBase ? plaster : brick, baseTag));
        if (n > 1) S.box(x, y, FH, bw, bd, (n - 1) * FH, wallO(plaster, 'plaster'));
        S.count(plasterBase ? 'TIMBER' : 'BRICK');
        S.box(x - 0.3, y - 0.3, n * FH, bw + 0.6, bd + 0.6, 0.3, { color: copper, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'roof' });
        // a band of windows on each visible face, each storey
        for (let k = 0; k < n; k++) {
          const z0 = k * FH + 1.0, z1 = (k + 1) * FH - 0.7;
          const nx = Math.max(2, Math.round(bw / 2.6)), ny = Math.max(2, Math.round(bd / 2.6));
          for (let i = 0; i < nx; i++) K.aperture(S, 'y1', y + bd, x + ((i + 0.15) / nx) * bw, x + ((i + 0.75) / nx) * bw, z0, z1, 'rect', K.VOID, 'window');
          for (let i = 0; i < ny; i++) K.aperture(S, 'x1', x + bw, y + ((i + 0.15) / ny) * bd, y + ((i + 0.75) / ny) * bd, z0, z1, 'rect', K.VOID, 'window');
        }
        wings.push({ x: x, y: y, w: bw, d: bd, n: n, brickBase: !plasterBase, label: label });
        S.count('WING');
      };
      const wA = w * 0.64, dA = d * 0.34;
      block(bx, by, wA, dA, nA, false, 'A');
      const wB = w * 0.2, dB = d * 0.9;
      if (wingB) block(bx, by + dA, wB, dB - dA, nB, Rn.chance(0.15), 'B');
      const topA = nA * FH + 0.3;

      // roof lights: funnels on wing A's roof
      const nL = Rn.int(2, 7), lights = [];
      for (let i = 0; i < nL; i++) {
        const lx = bx + 2 + ((i + 0.5) / nL) * (wA - 4), ly = by + dA / 2;
        K.cyl(S, lx, ly, topA, 0.7, 0.55, plaster, 'rooflight', 12);
        S.face(G.regular(lx, ly, topA + 0.56, 0.5, 12), { fill: { color: K.VOID, alpha: 170, mode: 'flat' }, edge: null, tag: 'rooflight', depth: D([lx, ly, topA + 0.56]) + 0.2 });
        S.count('ROOFLIGHT'); lights.push(lx);
      }

      // ---- the free curve ----
      const hC = nC * FH;
      let curved = 0;
      if (fan) {
        const cx = bx + wA, cy = by + dA * 0.5, R = Math.min(d * 0.55, w - wA - 2 + dA), a0 = -0.35, a1 = 1.95;
        const arc = [];
        for (let i = 0; i <= 14; i++) { const a = a0 + (i / 14) * (a1 - a0); arc.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
        const poly = [[cx, cy]].concat(arc);
        const base = poly.map((p) => [p[0], p[1], 0]), top = poly.map((p) => [p[0], p[1], hC]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(brick, 0.85 + 0.25 * ((f.n[1] - f.n[0]) * 0.5 + 0.5)), alpha: 160, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: K.EDGE, tag: 'curve' });
        S.face(top, { fill: { color: copper, alpha: 130, mode: 'flat' }, edge: K.EDGE, tag: 'curve' });
        for (let i = 1; i < 14; i += 2) S.line([[cx, cy, hC + 0.02], [arc[i][0], arc[i][1], hC + 0.02]], K.THIN, { depth: D([arc[i][0], arc[i][1], hC]) + 0.3, tag: 'curve' });
        S.count('CURVE'); curved++;
        if (ctx.M) {
          ctx.M.prism(poly, 0, hC, 'wall', 0.45);
          ctx.M.space({ name: names[2], kind: 'room', poly: poly, z: 0, h: hC - 0.3, level: 0 });
        }
      } else {
        // a serpentine wall: a strip whose east edge undulates
        const x0 = bx + wB * 0.4, y0 = by + dA + 0.5, L = Math.min(d - dA - 1, 14), th = 5.5, amp = Rn.range(1.1, 1.9), k = Rn.int(2, 3);
        const xe = (y) => x0 + th + amp * Math.sin(((y - y0) / L) * k * Math.PI * 2);
        const pts = []; for (let i = 0; i <= 18; i++) { const y = y0 + (i / 18) * L; pts.push([xe(y), y]); }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (b[1] - a[1] - (b[0] - a[0]) <= 0) continue;
          S.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], hC], [a[0], a[1], hC]], { fill: { color: G.shade(brick, 0.88 + 0.12 * Math.sin(i)), alpha: 160, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: K.THIN, tag: 'curve' });
        }
        const strip = [[x0, y0, hC]].concat(pts.map((p) => [p[0], p[1], hC])).concat([[x0, y0 + L, hC]]);
        S.face(strip, { fill: { color: copper, alpha: 130, mode: 'flat' }, edge: K.EDGE, tag: 'curve' });
        S.face([[x0, y0 + L, 0], [xe(y0 + L), y0 + L, 0], [xe(y0 + L), y0 + L, hC], [x0, y0 + L, hC]], { fill: { color: brick, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: K.EDGE, tag: 'curve' });
        S.count('CURVE'); curved++;
        if (ctx.M) {
          const poly = [[x0, y0]].concat(pts).concat([[x0, y0 + L]]);
          ctx.M.prism(poly, 0, hC, 'wall', 0.45);
          ctx.M.space({ name: names[2] === 'LECTURE HALL' ? 'SEMINAR ROOMS' : names[2], kind: 'room', poly: poly, z: 0, h: hC - 0.3, level: 0 });
        }
      }
      if (secondCurve) {
        // a curved garden wall as a ring segment
        const cx = bx + w * 0.82, cy = by + d * 0.82, r = 3.5, pts = [];
        for (let i = 0; i <= 9; i++) { const a = 0.2 + (i / 9) * 1.6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          S.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], 1.1], [a[0], a[1], 1.1]], { fill: { color: brick, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: K.THIN, tag: 'curve' });
        }
        S.count('CURVE'); curved++;
      }

      // timber entrance canopy and a terrace in the crook of the L
      S.box(bx + wA * 0.3, by + dA, 0, 3, 2.2, 0.15, { color: timber, alpha: 120, mode: 'flat', edge: K.THIN, tag: 'terrace' });
      S.box(bx + wA * 0.3 - 0.2, by + dA - 0.4, 2.6, 3.4, 2.6, 0.18, { color: timber, alpha: 140, mode: 'flat', edge: K.EDGE, tag: 'canopy' });
      S.count('TIMBER');
      const tx = bx + wB + 1, ty = by + dA + 0.5;
      S.box(tx, ty, 0, 6, 4, 0.3, { color: plaster, alpha: 90, mode: 'flat', edge: K.THIN, tag: 'terrace' }); S.count('TERRACE');

      if (ctx.M) {
        for (let k = 0; k < nA; k++) ctx.M.space({ name: names[0], kind: 'room', x: bx, y: by, w: wA, d: dA, z: k * FH, h: FH - 0.3, level: k });
        if (wingB) for (let k = 0; k < nB; k++) ctx.M.space({ name: names[1], kind: 'room', x: bx, y: by + dA, w: wB, d: dB - dA, z: k * FH, h: FH - 0.3, level: k });
        ctx.M.space({ name: 'TERRACE', kind: 'terrace', x: tx, y: ty, w: 6, d: 4, z: 0, h: 0.3, level: 0 });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: bx + wA * 0.3 + 3.2, y: by + 0.5, w: 2.4, d: 4.5, z: 0, h: nA * FH, level: 0 });
      }

      const tenets = [
        { name: 'ONE FREE CURVE', ok: curved === 1 },
        { name: 'TWO ORTHOGONAL WINGS', ok: wings.length >= 2 },
        { name: 'DAYLIGHT FROM ABOVE', ok: lights.length >= 4 },
        { name: 'STEPPED DOWN', ok: nA >= nB && (!wingB || nB >= nC) && nA >= nC },
        { name: 'BRICK BASE', ok: wings.every((q) => q.brickBase) },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.aalto = STYLE;
})(window);
