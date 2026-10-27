/*
 * styles/constructivist.js — CONSTRUCTIVIST: the clash of primitives.
 *
 * Ivan Leonidov and Konstantin Melnikov, 1927 to 1930: a building is a collision of
 * pure forms. A sphere rests on a cylindrical drum; a tall mast stands beside it held
 * by cables in tension; a long bar is carried on two piers and runs out past them
 * into the air; three boxes cantilever from a block, each further than the last; a
 * ramp cuts across it all on the diagonal. Nothing is subordinate and nothing is aligned.
 *
 * Five tenets over the drawn scene: three primitives (a sphere, a mast and a cylinder),
 * clash (at least two overlaps in plan), cantilever (a volume projects past
 * its support by four metres or more), under tension (a mast with three or more cables),
 * diagonal (a ramp that climbs a storey and a half). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'CONSTRUCTIVIST',
    header: 'CONSTRUCTIVISM',
    titles: ['SPHERE AND MAST', 'CLASH', 'RUSAKOV CLUB', 'INSTITUTE STUDY', 'LENIN LIBRARY'],
    substyles: ['LEONIDOV', 'MELNIKOV', 'TATLIN', 'LISSITZKY', 'VESNIN'],
    types: ['INSTITUTE', 'CLUB', 'TOWER'],
    palettes: ['ROSTA', 'VKHUTEMAS', 'SUPREM'],
    sites: [['PLAZA DIST', 3], ['CITY', 2], ['CITY EDGE', 2]],
    shapes: ['COMPOSITION'],
    floors: [3, 5],
    legend: [['SPHERE', 'circ'], ['MAST', 'tee'], ['CYLINDER', 'dome'], ['CANTILEVER', 'bar'], ['CABLE', 'dash'], ['RAMP', 'ramp']],

    size(rng, annex) {
      const w = rng.range(32, 40), d = rng.range(28, 34);
      return annex ? { w: w * 0.6, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, paper = c[0], red = c[1], steel = c[2], grey = c[3];
      const H = N * FH, z0 = 0.35, cx = P.x + P.w * 0.5, cy = P.y + P.d * 0.5;
      const hasSphere = !Rn.chance(0.12), hasMast = !Rn.chance(0.12), hasCyl = !Rn.chance(0.12);
      const foot = []; // plan footprints for the clash test: circles and rects
      S.box(P.x + 1, P.y + 1, 0, P.w - 2, P.d - 2, z0, { color: grey, alpha: 90, mode: 'flat', edge: K.THIN, tag: 'plinth' });

      // the block, and three boxes cantilevered from its front, each further than the last
      const bx = P.x + 3 + Rn.range(0, 2), by = P.y + 3 + Rn.range(0, 2), bw = 10, bd = 8, bh = H * 0.8;
      S.box(bx, by, z0, bw, bd, bh, { color: paper, alpha: 130, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: K.EDGE, tag: 'block' });
      foot.push({ x0: bx, y0: by, x1: bx + bw, y1: by + bd });
      let maxProj = 0;
      for (let i = 0; i < 3; i++) {
        const proj = 2.2 + i * 2.1 + Rn.range(0, 0.8);
        S.box(bx + i * 3.35, by + bd - 3, z0 + bh - FH * 1.05, 3.1, 3 + proj, FH * 0.9, { color: i === 1 ? red : paper, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'cantilever' });
        S.count('CANTILEVER'); maxProj = Math.max(maxProj, proj);
      }

      // the drum and the sphere on it
      const dx = cx + 3 + Rn.range(-2, 2), dy = cy + 2 + Rn.range(-2, 2), dr = 4.3, dh = H * 0.4;
      const sr = Math.max(4.4, H * 0.3);
      if (hasCyl) { K.cyl(S, dx, dy, z0, dr, dh, grey, 'cylinder', 18); S.count('CYLINDER'); foot.push({ cx: dx, cy: dy, r: dr }); }
      if (hasSphere) {
        K.sphere(S, dx, dy, z0 + (hasCyl ? dh : 0) + sr * 0.85, sr, red, 'sphere'); S.count('SPHERE'); foot.push({ cx: dx, cy: dy, r: sr });
        if (ctx.M) {
          const poly = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; poly.push([dx + Math.cos(a) * sr, dy + Math.sin(a) * sr]); }
          ctx.M.prism(poly, z0 + dh, z0 + dh + 2 * sr, 'volume');
          ctx.M.space({ name: 'AUDITORIUM', kind: 'room', poly: poly, z: z0 + dh, h: 2 * sr * 0.9, level: Math.floor(dh / FH), area: Math.PI * sr * sr * 0.6 });
        }
      }

      // the bar on two piers, running out past them
      const barL = 16, barX = cx - 9 + Rn.range(-1.5, 1.5), barY = cy - 6 + Rn.range(-1.5, 1.5), barZ = z0 + H * 0.62, barD = 3.2;
      S.box(barX + 1.5, barY + 1, z0, 1.2, 1.2, H * 0.62, { color: grey, alpha: 170, mode: 'flat', edge: K.EDGE, tag: 'pier' });
      S.box(barX + 7, barY + 1, z0, 1.2, 1.2, H * 0.62, { color: grey, alpha: 170, mode: 'flat', edge: K.EDGE, tag: 'pier' });
      S.box(barX, barY, barZ, barL, barD, 1.4, { color: steel, alpha: 160, mode: 'pencil', spacing: 2.4, angle: 'edge', edge: K.EDGE, tag: 'bar' });
      foot.push({ x0: barX, y0: barY, x1: barX + barL, y1: barY + barD });
      const barOver = barL - (7 + 1.2);
      S.count('CANTILEVER'); maxProj = Math.max(maxProj, barOver);
      if (ctx.M) ctx.M.space({ name: 'READING ROOM', kind: 'room', x: barX, y: barY, w: barL, d: barD, z: barZ, h: 1.1, level: Math.floor(barZ / FH) });

      // the mast and its cables
      const mx = cx - 3 + Rn.range(-2, 2), my = cy + 6.5 + Rn.range(-1, 2), mH = 1.9 * H;
      let cables = 0;
      if (hasMast) {
        S.box(mx - 0.35, my - 0.35, z0, 0.7, 0.7, mH, { color: steel, alpha: 220, mode: 'flat', edge: K.EDGE, tag: 'mast' }); S.count('MAST');
        foot.push({ x0: mx - 0.35, y0: my - 0.35, x1: mx + 0.35, y1: my + 0.35 });
        const nc = Rn.int(2, 4), a0 = Rn.range(0, 1.5);
        for (let i = 0; i < nc; i++) {
          const a = a0 + (i / 4) * Math.PI * 2, r = Rn.range(10, 14);
          const ax = Math.max(P.x + 1.5, Math.min(P.x + P.w - 1.5, mx + Math.cos(a) * r)), ay = Math.max(P.y + 1.5, Math.min(P.y + P.d - 1.5, my + Math.sin(a) * r));
          S.line([[mx, my, z0 + mH * 0.94], [ax, ay, z0]], { alpha: 170, weight: 0.8, wob: 0.25 }, { tag: 'cable', depth: D([Math.max(mx, ax), Math.max(my, ay), z0]) + 0.1 });
          S.box(ax - 0.4, ay - 0.4, z0, 0.8, 0.8, 0.5, { color: grey, alpha: 150, mode: 'flat', edge: K.THIN, tag: 'anchor' });
          S.count('CABLE'); cables++;
        }
      }

      // the ramp across the diagonal
      const nSt = Rn.int(18, 40), rise = 0.22;
      const rx = P.x + P.w * 0.52, ry = P.y + P.d * 0.8;
      K.steps(S, rx, ry, z0, 1.6, nSt, rise, 0.42, '+x', paper, 'ramp'); S.count('RAMP');
      if (ctx.M) {
        for (let k = 0; k < N; k++) ctx.M.space({ name: 'CLUB', kind: 'room', x: bx, y: by, w: bw, d: bd, z: z0 + k * (bh / N), h: bh / N - 0.3, level: k });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: rx, y: ry, w: nSt * 0.42, d: 1.6, z: z0, h: Math.max(FH, nSt * rise), level: 0 });
      }

      // overlaps in plan
      const rects = foot.filter((f) => f.x0 !== undefined), circs = foot.filter((f) => f.cx !== undefined);
      const rr = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
      const cr = (ci, r) => { const nx = Math.max(r.x0, Math.min(ci.cx, r.x1)), ny = Math.max(r.y0, Math.min(ci.cy, r.y1)); return Math.hypot(ci.cx - nx, ci.cy - ny) < ci.r; };
      let clash = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rr(rects[i], rects[j])) clash++;
      for (const ci of circs) for (const r of rects) if (cr(ci, r)) clash++;
      for (let i = 0; i < circs.length; i++) for (let j = i + 1; j < circs.length; j++) if (Math.hypot(circs[i].cx - circs[j].cx, circs[i].cy - circs[j].cy) < circs[i].r + circs[j].r) clash++;

      const tenets = [
        { name: 'THREE PRIMITIVES', ok: hasSphere && hasMast && hasCyl },
        { name: 'CLASH', ok: clash >= 2 },
        { name: 'CANTILEVER', ok: maxProj >= 4 },
        { name: 'UNDER TENSION', ok: hasMast && cables >= 3 },
        { name: 'DIAGONAL', ok: nSt * rise >= 1.5 * FH },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: z0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.constructivist = STYLE;
})(window);
