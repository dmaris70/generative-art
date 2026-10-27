/*
 * styles/antfarm.js — ANT FARM: the pneumatic city.
 *
 * Ant Farm and Haus-Rucker-Co, San Francisco and Vienna, around 1970: architecture as
 * air. A hall is a skin held up by the breath of a fan, built in an afternoon, carried
 * in a van, gone by night. The grammar is a cluster of domes and flattened cushions of
 * different sizes, joined by inflated tubes you walk through, pegged to the ground by
 * guy lines, a fan humming beside the largest. Nothing has an edge.
 *
 * Five tenets over the drawn scene: pneumatic (three or more inflated volumes), connected
 * (every volume joined by a tube), anchored (six or more guy lines), no hard edge (no
 * wall or slab), varied sizes (radii differing by a quarter or more). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'ANTFARM',
    header: 'PNEUMATIC',
    titles: ['INFLATOCOOKBOOK', 'AIR HALL', 'CLOUD STUDY', 'PNEUMATIC', 'INSTANT CITY'],
    substyles: ['INFLATOCOOKBOOK', 'CLOUD', 'PILLOW', 'HAUS-RUCKER', 'MEDIA VAN'],
    types: ['AIR HALL', 'CITY', 'PAVILION'],
    palettes: ['INFLATABLE', 'POPPLE', 'TRANSLUCENT'],
    sites: [['PARK', 3], ['WATERFRONT', 2], ['CITY EDGE', 2], ['PLAZA DIST', 1]],
    shapes: ['CLUSTER'],
    floors: [1, 2],
    legend: [['DOME', 'dome'], ['CUSHION', 'circ'], ['TUBE', 'bar'], ['GUY', 'dash'], ['FAN', 'dot']],

    size(rng, annex) {
      const w = rng.range(42, 48), d = rng.range(34, 40);
      return annex ? { w: w * 0.55, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, skin = c[0], skin2 = c[1], tubeC = c[2], rope = c[3] || [80, 84, 92];
      const n = ctx.annex ? 3 : Rn.int(3, 5);
      const vols = [];
      // a chain of volumes, each placed along x or y from the last inside the plot, a tube between them
      const guy = { color: rope, alpha: 150, weight: 0.65, wob: 0.2 };
      let linked = true;
      const fits = (x, y, r) => x - r >= P.x + 1 && x + r <= P.x + P.w - 1 && y - r >= P.y + 1 && y + r <= P.y + P.d - 1 && vols.every((v) => Math.hypot(v.x - x, v.y - y) >= v.r + r + 2.2);
      for (let i = 0; i < n; i++) {
        const r = Rn.range(3.4, 6.6), cushion = Rn.chance(0.35), zs = cushion ? 0.42 : 0.82;
        let px, py, from = null;
        if (i === 0) { px = P.x + P.w * 0.5 + Rn.range(-4, 4); py = P.y + P.d * 0.5 + Rn.range(-3, 3); }
        else {
          const prev = vols[i - 1], dist = prev.r + r + Rn.range(2.6, 4);
          const dirs = Rn.shuffle([[1, 0], [0, 1], [-1, 0], [0, -1]]);
          for (const d of dirs) { const x = prev.x + d[0] * dist, y = prev.y + d[1] * dist; if (fits(x, y, r)) { px = x; py = y; from = d; break; } }
          if (px === undefined) break;
          if (Rn.chance(0.08)) linked = false;
          else {
            const tr = 1.05, z = Math.min(prev.r, r) * 0.55 + 0.2, alongX = from[0] !== 0;
            const a0 = (alongX ? prev.x : prev.y) + (alongX ? from[0] : from[1]) * prev.r * 0.7, b0 = (alongX ? px : py) - (alongX ? from[0] : from[1]) * r * 0.7;
            const lo = Math.min(a0, b0), len = Math.abs(b0 - a0);
            if (len > 0.5) {
              if (alongX) K.tube(S, lo, prev.y, z, len, tr, 'x', tubeC, 'tube', 12); else K.tube(S, prev.x, lo, z, len, tr, 'y', tubeC, 'tube', 12);
              S.count('TUBE');
              if (ctx.M) ctx.M.space({ name: 'PASSAGE', kind: 'circulation', x: alongX ? lo : prev.x - tr, y: alongX ? prev.y - tr : lo, w: alongX ? len : 2 * tr, d: alongX ? 2 * tr : len, z: 0.2, h: 2 * tr, level: 0 });
            } else linked = false;
          }
        }
        K.sphere(S, px, py, r * (cushion ? 0.42 : 0.78), r, i % 2 ? skin2 : skin, cushion ? 'cushion' : 'dome', zs); S.count(cushion ? 'CUSHION' : 'DOME');
        vols.push({ x: px, y: py, r: r, h: r * zs * 2 });
        if (ctx.M) {
          const poly = []; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; poly.push([px + Math.cos(a) * r, py + Math.sin(a) * r]); }
          ctx.M.prism(poly, 0, r * zs, 'volume');
          ctx.M.space({ name: 'AIR HALL', kind: 'room', poly: poly, z: 0, h: r * zs * 0.9, level: 0, area: Math.PI * r * r * 0.8 });
        }
      }
      // guy lines to pegs on the ground
      let guys = 0;
      for (const v of vols) {
        const top = [v.x, v.y, v.h * 0.95];
        const ng = Rn.int(2, 3), a0 = Rn.range(0, 6);
        for (let k = 0; k < ng; k++) {
          const a = a0 + (k / ng) * Math.PI * 2, rr = v.r * 1.7, gx = Math.max(P.x + 0.5, Math.min(P.x + P.w - 0.5, v.x + Math.cos(a) * rr)), gy = Math.max(P.y + 0.5, Math.min(P.y + P.d - 0.5, v.y + Math.sin(a) * rr));
          S.line([top, [gx, gy, 0.1]], guy, { depth: D([Math.max(top[0], gx), Math.max(top[1], gy), 0]) + 0.1, tag: 'guy' }); S.count('GUY'); guys++;
          S.box(gx - 0.2, gy - 0.2, 0, 0.4, 0.4, 0.3, { color: rope, alpha: 170, mode: 'flat', edge: K.THIN, tag: 'anchor' });
        }
      }
      // a fan beside the largest
      const big = vols.slice().sort((a, b) => b.r - a.r)[0];
      S.box(big.x + big.r + 0.6, big.y - 0.6, 0, 1.2, 1.2, 0.9, { color: tubeC, alpha: 180, mode: 'flat', edge: K.EDGE, tag: 'fan' }); S.count('FAN');
      const hard = Rn.chance(0.12);
      if (hard) S.box(P.x + 2, P.y + P.d - 5, 0, 8, 0.4, 2.6, { color: skin, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'wall' });
      const rs = vols.map((v) => v.r), spread = (Math.max(...rs) - Math.min(...rs)) / Math.max(...rs);
      const tenets = [
        { name: 'PNEUMATIC', ok: vols.length >= 3 },
        { name: 'CONNECTED', ok: linked },
        { name: 'ANCHORED', ok: guys >= 6 },
        { name: 'NO HARD EDGE', ok: !hard },
        { name: 'VARIED SIZES', ok: spread >= 0.25 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.antfarm = STYLE;
})(window);
