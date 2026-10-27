/*
 * styles/fresco.js — FRESCO: the circular city.
 *
 * Jacque Fresco's Venus Project, from the 1970s: a resource-based city laid out as
 * concentric rings, a great dome at the centre for the cybernation and the commons,
 * residential rings round it, a canal, radial paths dividing the rings into
 * sectors. The grammar is a faceted dome, two rings of curved blocks cut into segments,
 * a ring of water between them, and radial spokes, all on one centre.
 *
 * Five tenets over the drawn scene: central dome, dome dominant (higher than the rings),
 * eight spokes, a canal, radial order (the outer ring's segments in step
 * with the inner's). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'FRESCO',
    header: 'CIRCULAR CITY',
    titles: ['CIRCULAR CITY', 'VENUS PROJECT', 'CENTRAL DOME', 'RESOURCE BASED', 'CITY OF TOMORROW'],
    substyles: ['VENUS', 'CENTRAL DOME', 'RING CITY', 'SEAWAY', 'CYBERNATION'],
    types: ['CITY', 'CIVIC'],
    palettes: ['SOLAR', 'HORIZON', 'VERDANT'],
    sites: [['PARK', 3], ['WATERFRONT', 3], ['PLAZA DIST', 1]],
    shapes: ['RINGS'],
    floors: [2, 4],
    legend: [['DOME', 'dome'], ['RING', 'wave'], ['SEGMENT', 'sqh'], ['SPOKE', 'dash'], ['CANAL', 'circ']],

    size(rng, annex) {
      const w = rng.range(46, 50), d = rng.range(46, 50);
      return annex ? { w: w * 0.58, d: d * 0.62 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, wall = c[0], roof = c[1], green = c[2], domeC = c[3], water = c[4];
      const cx = P.x + P.w / 2, cy = P.y + P.d / 2, scale = ctx.annex ? 0.55 : 1;
      const r0 = 6.2 * scale, g1 = 3 * scale, w1 = 5.5 * scale, canal = 2.2 * scale, w2 = 5 * scale;
      const hasDome = !Rn.chance(0.1), hasCanal = !Rn.chance(0.15), aligned = !Rn.chance(0.2);
      const nIn = 8, nOut = 16;
      if (hasDome) {
        K.sphere(S, cx, cy, r0 * 0.5, r0, domeC, 'dome', 0.7); S.count('DOME');
        if (ctx.M) {
          const poly = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; poly.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]); }
          ctx.M.prism(poly, 0, r0 * 0.7, 'volume');
          ctx.M.space({ name: 'CENTRAL HALL', kind: 'room', poly: poly, z: 0, h: r0 * 0.6, level: 0, area: Math.PI * r0 * r0 * 0.8 });
        }
      }
      const ra = r0 + g1, rb = ra + w1;
      // the inner ring: eight segments, N storeys
      for (let i = 0; i < nIn; i++) {
        const a0 = (i / nIn) * Math.PI * 2 + 0.07, a1 = ((i + 1) / nIn) * Math.PI * 2 - 0.07;
        const poly = K.annulus(S, cx, cy, ra, rb, a0, a1, 0, N * FH * 0.8, i % 2 ? wall : roof, 'segment', 5); S.count('SEGMENT');
        if (ctx.M) {
          ctx.M.prism(poly, 0, N * FH * 0.8, 'mass', 0.5);
          for (let k = 0; k < N; k++) ctx.M.space({ name: 'HABITAT', kind: 'room', poly: poly, z: k * FH * 0.8, h: FH * 0.8 - 0.3, level: k, area: Math.PI * (rb * rb - ra * ra) / nIn * 0.8 });
        }
      }
      S.count('RING');
      // the canal between the rings
      const rc = rb + 1.6 * scale;
      if (hasCanal) { K.annulus(S, cx, cy, rc, rc + canal, 0, Math.PI * 2, 0, 0.06, water, 'pool', 30); S.count('CANAL'); if (ctx.M) ctx.M.space({ name: 'CANAL', kind: 'water', x: cx - rc - canal, y: cy - rc - canal, w: 2 * (rc + canal), d: 2 * (rc + canal), z: 0, h: 0, level: 0, area: Math.PI * ((rc + canal) ** 2 - rc ** 2) }); }
      const rd = rc + canal + 1.6 * scale, re = rd + w2;
      const off = aligned ? 0 : (Math.PI / nOut) * 0.9;
      for (let i = 0; i < nOut; i++) {
        const a0 = (i / nOut) * Math.PI * 2 + 0.05 + off, a1 = ((i + 1) / nOut) * Math.PI * 2 - 0.05 + off;
        const poly = K.annulus(S, cx, cy, rd, re, a0, a1, 0, Math.max(3.4, N * FH * 0.5), i % 2 ? roof : green, 'segment', 3); S.count('SEGMENT');
        if (ctx.M) {
          ctx.M.prism(poly, 0, Math.max(3.4, N * FH * 0.5), 'mass', 0.5);
          ctx.M.space({ name: 'WORKSHOP', kind: 'room', poly: poly, z: 0, h: Math.max(3.4, N * FH * 0.5) - 0.3, level: 0, area: Math.PI * (re * re - rd * rd) / nOut * 0.8 });
        }
      }
      S.count('RING');
      // the spokes, on the ground
      let spokes = 0;
      const nSp = Rn.chance(0.25) ? 6 : 8;
      for (let i = 0; i < nSp; i++) {
        const a = (i / nSp) * Math.PI * 2;
        S.line([[cx + Math.cos(a) * (r0 + 0.5), cy + Math.sin(a) * (r0 + 0.5), 0.08], [cx + Math.cos(a) * (re + 2.5), cy + Math.sin(a) * (re + 2.5), 0.08]], { alpha: 160, weight: 1.0, wob: 0.2 }, { depth: D([cx + Math.cos(a) * re, cy + Math.sin(a) * re, 0]) - 30, tag: 'spoke', layer: 0 }); S.count('SPOKE'); spokes++;
      }
      if (ctx.M) ctx.M.space({ name: 'STAIR', kind: 'service', x: cx + r0, y: cy - 1, w: 2, d: 2, z: 0, h: N * FH * 0.8, level: 0 });
      const tenets = [
        { name: 'CENTRAL DOME', ok: hasDome },
        { name: 'DOME DOMINANT', ok: hasDome && r0 * 1.2 >= N * FH * 0.65 },
        { name: 'EIGHT SPOKES', ok: spokes >= 8 },
        { name: 'CANAL', ok: hasCanal },
        { name: 'RADIAL ORDER', ok: aligned },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.fresco = STYLE;
})(window);
