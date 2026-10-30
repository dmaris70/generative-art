/*
 * styles/ferriss.js — FERRISS: the metropolis of tomorrow.
 *
 * Hugh Ferriss's charcoal cities of the 1920s, drawn from the zoning law of 1916: the
 * setback that made the skyscraper a mountain. Towers rise from a massive base in tiers,
 * each set back from the one below, ruled with continuous vertical piers that carry the
 * eye to a spire; the main tower stands taller than its neighbours, the cluster pressed
 * close; light falls from one side so one face is nearly black.
 *
 * Five tenets over the drawn scene: setbacks (every tower at least three tiers, each
 * smaller than the last), central spire (the main tower at least a third taller than the
 * next), unbroken piers (the vertical piers run unbroken), no two alike (three different
 * heights), pressed close (a gap of three metres or less between towers). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'FERRISS',
    header: 'METROPOLIS OF TOMORROW',
    titles: ['METROPOLIS', 'THE ZONING ENVELOPE', 'TRINITY', 'LIGHT AND SHADOW', 'POWER IN BUILDINGS'],
    substyles: ['ENVELOPE', 'CATHEDRAL', 'TRINITY', 'CHARCOAL', 'MAYAN'],
    types: ['TOWER', 'CITY'],
    palettes: ['CHARCOAL', 'SMOKE', 'NIGHT'],
    sites: [['CITY', 3], ['PLAZA DIST', 2], ['WATERFRONT', 1]],
    shapes: ['SETBACK'],
    floors: [6, 10],
    legend: [['TIER', 'sq'], ['PIER', 'bar'], ['SPIRE', 'tri'], ['BASE', 'sqf'], ['WINDOW', 'grid']],

    size(rng, annex) {
      const w = rng.range(42, 48), d = rng.range(36, 40);
      return annex ? { w: w * 0.6, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, stone = c[0], mid = c[1], dark = c[2];
      const gap = Rn.range(1.5, 5.5);
      const mainH = N * FH, hs = [mainH, mainH * Rn.range(0.5, 0.8), mainH * Rn.range(0.4, 0.7)];
      const defs = [[14, 12], [11, 10], [10, 9]];
      const total = defs[0][0] + defs[1][0] + defs[2][0] + 2 * gap;
      let x = P.x + (P.w - total) / 2;
      const y0 = P.y + P.d / 2 - 6, towers = [];
      let piersOK = true, allSet = true;
      const sh = [1.0, 0.72, 0.5];
      const brokenPiers = Rn.chance(0.12), shortTower = Rn.chance(0.15) ? Rn.int(1, 2) : -1;
      defs.forEach((df, ti) => {
        const H = hs[ti], w = df[0], d = df[1];
        const nTiers = ti === shortTower ? 2 : 4, base = H * 0.34, rest = (H - base) / (nTiers - 1);
        let z = 0, prev = Infinity, count = 0;
        for (let k = 0; k < nTiers; k++) {
          const inset = k * 1.2, w0 = w - 2 * inset, d0 = d - 2 * inset, h = k === 0 ? base : rest;
          if (w0 < 2.4 || d0 < 2.4) break;
          if (w0 * d0 >= prev) allSet = false;
          prev = w0 * d0; count++;
          S.box(x + inset, y0 + inset, z, w0, d0, h, { color: k % 2 ? mid : stone, alpha: 170, mode: 'pencil', spacing: 2.2, angle: 'edge', edge: K.EDGE, tag: 'tier', shade: sh });
          S.count(k === 0 ? 'BASE' : 'TIER');
          // piers: continuous vertical lines on the two visible faces
          const np = Math.max(4, Math.round(w0 / 1.6)), nq = Math.max(4, Math.round(d0 / 1.6));
          const pp = { color: dark, alpha: 150, weight: 0.65, wob: 0.2 };
          for (let i = 1; i < np; i++) { const px = x + inset + (i / np) * w0; if (brokenPiers && k === 1 && i % 3 === 0) { piersOK = false; continue; } S.line([[px, y0 + inset + d0 + 0.02, z], [px, y0 + inset + d0 + 0.02, z + h]], pp, { depth: D([px, y0 + inset + d0, z + h]) + 0.05, tag: 'pier' }); S.count('PIER'); }
          for (let i = 1; i < nq; i++) { const py = y0 + inset + (i / nq) * d0; S.line([[x + inset + w0 + 0.02, py, z], [x + inset + w0 + 0.02, py, z + h]], pp, { depth: D([x + inset + w0, py, z + h]) + 0.05, tag: 'pier' }); S.count('PIER'); }
          if (ctx.M) ctx.M.space({ name: 'OFFICES', kind: 'room', x: x + inset, y: y0 + inset, w: w0, d: d0, z: z, h: h - 0.3, level: Math.floor(z / FH) });
          z += h;
        }
        const top = Math.max(3, w - 2 * 1.1 * 0.9 * (nTiers)) ;
        void top;
        if (ti === 0) {
          // the spire
          S.box(x + w / 2 - 0.5, y0 + d / 2 - 0.5, z, 1, 1, H * 0.22, { color: stone, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'tier', shade: sh });
          S.count('SPIRE');
          if (ctx.M) ctx.M.space({ name: 'CORE', kind: 'service', x: x + w / 2 - 1.5, y: y0 + d / 2 - 1.5, w: 3, d: 3, z: 0, h: z, level: 0 });
        }
        towers.push({ H: H, count: count, w: w });
        x += w + gap;
      });
      const hsort = towers.map((q) => q.H).sort((a, b) => b - a);
      const tenets = [
        { name: 'SETBACKS', ok: allSet && towers.every((q) => q.count >= 3) },
        { name: 'CENTRAL SPIRE', ok: hsort[0] >= 1.33 * hsort[1] },
        { name: 'UNBROKEN PIERS', ok: piersOK },
        { name: 'NO TWO ALIKE', ok: new Set(hs.map((v) => Math.round(v))).size === 3 },
        { name: 'PRESSED CLOSE', ok: gap <= 3 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.ferriss = STYLE;
})(window);
