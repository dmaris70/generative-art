/*
 * styles/soleri.js — SOLERI: the arcology.
 *
 * Paolo Soleri's fusion of architecture and ecology, from the desert at Arcosanti: a
 * hyper-dense building shaped as a terraced half-bowl, an apse, its open face to the
 * south for the winter sun, its steps planted, with great barrel vaults and a bell at
 * the foot. The grammar is a stack of semicircular tiers, each smaller and higher than
 * the one below, its flat face to the south; two vaults; a bell; planters on every terrace.
 *
 * Five tenets over the drawn scene: half bowl (five or more tiers), terraced (every
 * tier smaller than the one below), faces the sun (the open face to the south), vaults
 * (two or more), green terraces (fifteen or more planters). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'SOLERI',
    header: 'ARCOLOGY',
    titles: ['ARCOLOGY', 'APSE STUDY', 'ARCOSANTI', 'HYPERBUILDING', 'BELL AND VAULT'],
    substyles: ['ARCOSANTI', 'ARCOLOGY', 'MESA CITY', 'NOVANOAH', 'ASTRALOGY'],
    types: ['CITY', 'CIVIC'],
    palettes: ['SILT', 'ADOBE', 'MESA'],
    sites: [['HILLSIDE', 3], ['PARK', 2], ['CITY EDGE', 1]],
    shapes: ['APSE'],
    floors: [3, 5],
    legend: [['TIER', 'sqh'], ['VAULT', 'dome'], ['BELL', 'circ'], ['PLANTER', 'dot'], ['APSE', 'wave']],

    size(rng, annex) {
      const w = rng.range(42, 48), d = rng.range(34, 40);
      return annex ? { w: w * 0.6, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, silt = c[0], adobe = c[1], green = c[2], dark = c[3];
      const cx = P.x + P.w / 2, cy = P.y + P.d / 2 - 4;
      const R = Math.min(P.w / 2 - 6, 15 + (ctx.annex ? -4 : 2)), nT = Rn.int(Math.max(3, N), N + 2), step = Math.max(2.6, FH * 0.85);
      const facing = Rn.chance(0.82) ? 'S' : 'N';
      const a0 = facing === 'S' ? Math.PI : 0; // semicircle bulging north (angles pi..2pi) has its flat face on +y
      const radii = [];
      let planters = 0, terraced = true;
      for (let k = 0; k < nT; k++) {
        const r = R * (1 - k * (0.8 / nT)) * (Rn.chance(0.08) && k > 0 ? 1.25 : 1);
        if (k > 0 && r >= radii[k - 1]) terraced = false;
        radii.push(r);
        const poly = K.annulus(S, cx, cy, 0, r, a0, a0 + Math.PI, k * step, (k + 1) * step, k % 2 ? silt : adobe, 'tier', 22);
        S.count('TIER');
        if (ctx.M) {
          ctx.M.prism(poly, k * step, (k + 1) * step, 'mass');
          ctx.M.space({ name: ['HABITAT', 'WORKSHOP', 'HABITAT', 'APSE HALL'][k % 4], kind: 'room', poly: poly, z: k * step, h: step - 0.4, level: k, area: Math.PI * r * r * 0.5 * 0.55 });
        }
        // planters along the front edge of each terrace
        const nPl = Rn.int(2, 4);
        for (let i = 0; i < nPl; i++) {
          const a = a0 + ((i + 0.6) / nPl) * Math.PI, rr = r * 0.88;
          K.cyl(S, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (k + 1) * step, 0.5, 0.9, green, 'planter', 8); S.count('PLANTER'); planters++;
        }
      }
      // two barrel vaults at the foot, a bell on the top
      const vx = [cx - R * 0.75, cx + R * 0.75];
      let vaults = 0;
      for (const x of vx) {
        if (Rn.chance(0.1)) continue;
        K.tube(S, x, cy + 0.5, 3.2, 8, 3.2, 'y', dark, 'vault', 12); S.count('VAULT'); vaults++;
        if (ctx.M) ctx.M.space({ name: 'WORKSHOP', kind: 'room', x: x - 3.2, y: cy + 0.5, w: 6.4, d: 8, z: 0, h: 5, level: 0 });
      }
      K.cyl(S, cx, cy - R * 0.2, nT * step, 1.2, 2.6, dark, 'bell', 12); S.count('BELL'); S.count('APSE');
      if (ctx.M) ctx.M.space({ name: 'STAIR', kind: 'service', x: cx - 1, y: cy - 2, w: 2, d: 2, z: 0, h: nT * step, level: 0 });

      const tenets = [
        { name: 'HALF BOWL', ok: nT >= 5 },
        { name: 'TERRACED', ok: terraced },
        { name: 'FACES THE SUN', ok: facing === 'S' },
        { name: 'VAULTS', ok: vaults >= 2 },
        { name: 'GREEN TERRACES', ok: planters >= 15 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.soleri = STYLE;
})(window);
