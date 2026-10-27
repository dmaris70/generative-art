/*
 * styles/boullee.js — BOULLEE: pure form at the scale of the sublime.
 *
 * Étienne-Louis Boullée's visionary projects of the 1780s, the cenotaph for Newton the
 * best known: a geometry reduced to a single enormous solid, here a sphere, a pyramid
 * or a cone, set on a circular base, ringed with trees, approached by one stair on the
 * axis, carrying not one ornament. Architecture as the art of shadow and scale.
 *
 * Five tenets over the drawn scene: pure geometry (one primary form), monumental scale
 * (the form at least twice as high as the storeys), concentric (two or more rings of
 * trees), no ornament (nothing but form, base, trees and stair), axial stair (a flight
 * on the axis). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'BOULLEE',
    header: 'ENLIGHTENMENT',
    titles: ['CENOTAPH', 'PURE FORM', 'NEWTON', 'PYRAMID STUDY', 'THE SUBLIME'],
    substyles: ['NEWTON', 'PYRAMID', 'CONE', 'ROTUNDA', 'METROPOLIS'],
    types: ['CENOTAPH', 'LIBRARY', 'CITY GATE'],
    palettes: ['ETCHING', 'SEPIA', 'GRAPHITE'],
    sites: [['PARK', 3], ['PLAZA DIST', 2], ['WATERFRONT', 1]],
    shapes: ['ROTUNDA'],
    floors: [3, 5],
    legend: [['FORM', 'circ'], ['BASE', 'sqf'], ['TREE', 'dot'], ['STAIR', 'step'], ['RING', 'wave']],

    size(rng, annex) {
      const w = rng.range(44, 50), d = rng.range(40, 44);
      return annex ? { w: w * 0.6, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, form = c[0], baseC = c[1], treeC = c[2] || c[0];
      const cx = P.x + P.w / 2, cy = P.y + P.d / 2 - 3, H0 = N * FH;
      const kind = Rn.weighted([['sphere', 6], ['pyramid', 2], ['cone', 2]]);
      const r = Math.min(P.w, P.d) * (ctx.annex ? 0.17 : 0.2) * Rn.range(0.85, 1.1);
      const R1 = r * 1.15 + 1.5;
      // the circular base: two low steps
      K.annulus(S, cx, cy, 0, R1 + 2.5, 0, Math.PI * 2, 0, 0.5, baseC, 'base', 30); S.count('BASE');
      K.annulus(S, cx, cy, 0, R1, 0, Math.PI * 2, 0.5, 1.0, baseC, 'base', 30);
      const zb = 1.0;
      let fh = 0, forms = 1;
      const mk = (kd, fx, fy, fr) => {
        if (kd === 'sphere') { K.sphere(S, fx, fy, zb + fr * 0.96, fr, form, 'form'); fh = 2 * fr; }
        else if (kd === 'pyramid') {
          const b = [[fx - fr, fy - fr, zb], [fx + fr, fy - fr, zb], [fx + fr, fy + fr, zb], [fx - fr, fy + fr, zb]], ap = [fx, fy, zb + fr * 1.7];
          const pr = G.prism(b, b.map(() => ap));
          for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(form, 0.82 + 0.3 * ((f.n[1] - f.n[0]) * 0.5 + 0.5)), alpha: 175, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: K.EDGE, tag: 'form' });
          fh = fr * 1.7;
        } else {
          const base = G.regular(fx, fy, zb, fr, 20), ap = [fx, fy, zb + fr * 1.8];
          for (let k = 0; k < 20; k++) {
            const a = base[k], b = base[(k + 1) % 20];
            let n = G.cross(G.sub(b, a), G.sub(ap, a));
            const mid = [(a[0] + b[0]) / 2 - fx, (a[1] + b[1]) / 2 - fy];
            if (n[0] * mid[0] + n[1] * mid[1] < 0) n = G.mul(n, -1);
            if (n[0] + n[1] + n[2] <= 0) continue;
            const nn = G.norm(n);
            S.face([a, b, ap], { fill: { color: G.shade(form, 0.8 + 0.25 * ((nn[1] - nn[0]) * 0.5 + 0.5)), alpha: 175, mode: 'flat' }, edge: k % 5 === 0 ? K.THIN : null, tag: 'form' });
          }
          fh = fr * 1.8;
        }
        S.count('FORM');
      };
      mk(kind, cx, cy, r);
      if (Rn.chance(0.12)) { mk('pyramid', cx + R1 * 1.5, cy + R1 * 0.5, r * 0.3); forms = 2; }
      if (ctx.M) {
        const poly = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; poly.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        ctx.M.prism(poly, zb, zb + fh, 'volume');
        ctx.M.space({ name: ctx.type === 'LIBRARY' ? 'READING ROOM' : 'CENOTAPH HALL', kind: 'room', poly: poly, z: zb, h: fh * 0.9, level: 0, area: Math.PI * r * r * 0.6 });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: cx - 1.2, y: cy + R1 + 0.5, w: 2.4, d: 2, z: 0, h: 1.0, level: 0 });
      }
      // two rings of trees
      let rings = 0;
      for (const [rr, n] of [[R1 + 4.5, 26], [R1 + 7.5, 34]]) {
        if (rr + 1 > Math.min(P.w, P.d) / 2) continue;
        if (Rn.chance(0.12)) continue;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; K.cyl(S, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0, 0.35, 2.6, treeC, 'tree', 6); S.count('TREE'); }
        rings++;
      }
      const stair = !Rn.chance(0.12), ornament = Rn.chance(0.1);
      if (stair) { K.steps(S, cx - 1.8, cy + R1 + 2.5, 0, 3.6, 5, 0.2, 0.5, '+y', baseC, 'step'); S.count('STAIR', 5); }
      if (ornament) S.box(cx + R1 * 0.5, cy + R1 + 3, 0, 1, 1, 2.6, { color: baseC, alpha: 150, mode: 'flat', edge: K.EDGE, tag: 'urn' });

      const tenets = [
        { name: 'PURE GEOMETRY', ok: forms === 1 },
        { name: 'MONUMENTAL SCALE', ok: fh >= 2 * FH * 2 },
        { name: 'CONCENTRIC', ok: rings >= 2 },
        { name: 'NO ORNAMENT', ok: !ornament },
        { name: 'AXIAL STAIR', ok: stair },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 1.0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.boullee = STYLE;
})(window);
