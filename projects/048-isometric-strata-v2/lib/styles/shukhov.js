/*
 * styles/shukhov.js — SHUKHOV: the hyperboloid.
 *
 * Vladimir Shukhov's lattice towers, Moscow, 1896 to 1922: a hyperboloid of one sheet is
 * ruled, so a tower of it needs nothing but straight steel bars, each running from a
 * ring at the bottom to a ring at the top, turned a few steps round, a second family
 * turned the other way, the two crossing in a waist. A radio tower is a stack of such
 * sections, each narrower than the last, on a ring of footings, a water tank at the top.
 *
 * Five tenets over the drawn scene: double family (both turns of bar present), stacked
 * sections (five or more), rings at every joint, taper (each section narrower than
 * the last), crowned (a tank or lantern at the top). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'SHUKHOV',
    header: 'HYPERBOLOID',
    titles: ['SHABOLOVKA TOWER', 'HYPERBOLOID', 'LATTICE SHELL', 'WATER TOWER', 'RADIO MAST'],
    substyles: ['SHABOLOVKA', 'NIZHNY', 'ADZHIGOL', 'POLIBINO', 'OKA'],
    types: ['TOWER', 'LIGHTHOUSE', 'WATER TOWER'],
    palettes: ['STEELWORK', 'RIVET', 'LATTICE'],
    sites: [['WATERFRONT', 3], ['CITY EDGE', 2], ['HILLSIDE', 2]],
    shapes: ['HYPERBOLOID'],
    floors: [4, 8],
    legend: [['SECTION', 'x'], ['BAR', 'dash'], ['RING', 'circ'], ['FOOTING', 'sqf'], ['TANK', 'dome']],

    size(rng, annex) {
      const w = rng.range(30, 36);
      return annex ? { w: w * 0.6, d: w * 0.6 } : { w: w, d: w };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, steel = c[0], ringC = c[1], tankC = c[2], dark = c[3] || c[0];
      const cx = P.x + P.w / 2, cy = P.y + P.d / 2;
      const ns = Rn.int(3, 6), H = N * FH * 1.7 * (ctx.annex ? 0.7 : 1), hs = H / ns, nb = 24, m = Rn.int(2, 4);
      const R0 = Math.min(P.w / 2 - 3, Rn.range(5.2, 7.2) * (ctx.annex ? 0.7 : 1));
      const oneFamily = Rn.chance(0.12), missingRing = Rn.chance(0.1) ? Rn.int(1, ns - 1) : -1, wide = Rn.chance(0.1) ? Rn.int(1, ns - 1) : -1;
      let rb = R0, taperOK = true, prevR = Infinity;
      const barA = { color: steel, alpha: 150, weight: 0.6, wob: 0.15 }, barB = { color: steel, alpha: 120, weight: 0.55, wob: 0.15 }, ringP = { color: ringC, alpha: 190, weight: 0.95, wob: 0.15 };
      const alpha = (Math.PI * 2 * m) / nb;
      const pt = (r, a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
      const rings = [];
      for (let s = 0; s < ns; s++) {
        const z0 = s * hs, z1 = (s + 1) * hs;
        let rt = rb * (s === wide ? 1.12 : Rn.range(0.82, 0.9));
        if (rt >= rb) taperOK = false;
        if (rb >= prevR) taperOK = false;
        prevR = rb;
        for (let k = 0; k < nb; k++) {
          const a = (k / nb) * Math.PI * 2;
          S.line([pt(rb, a, z0), pt(rt, a + alpha, z1)], barA, { depth: D(pt(Math.max(rb, rt), a, z1)) + 0.02, tag: 'bar' });
          if (!oneFamily) S.line([pt(rb, a, z0), pt(rt, a - alpha, z1)], barB, { depth: D(pt(Math.max(rb, rt), a, z1)) + 0.02, tag: 'bar' });
        }
        S.count('BAR', nb * (oneFamily ? 1 : 2)); S.count('SECTION');
        // a ring at the bottom of each section
        if (s !== missingRing) {
          const rp = []; for (let k = 0; k <= nb; k++) rp.push(pt(rb, (k / nb) * Math.PI * 2, z0));
          S.line(rp, ringP, { depth: D([cx + rb, cy + rb, z0]) + 0.05, tag: 'ring' }); S.count('RING'); rings.push(s);
        }
        rb = rt;
      }
      const top = pt(rb, 0, H);
      const rp = []; for (let k = 0; k <= nb; k++) rp.push(pt(rb, (k / nb) * Math.PI * 2, H));
      S.line(rp, ringP, { depth: D([cx + rb, cy + rb, H]) + 0.05, tag: 'ring' }); S.count('RING');
      // footings on the base ring
      for (let k = 0; k < nb; k += 4) { const q = pt(R0, (k / nb) * Math.PI * 2, 0); S.box(q[0] - 0.5, q[1] - 0.5, 0, 1, 1, 0.5, { color: dark, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'pier' }); S.count('FOOTING'); }
      // the crown: a water tank, a lantern, or nothing; a mast either way
      const crown = !Rn.chance(0.25);
      if (crown) { K.cyl(S, cx, cy, H, Math.max(2.2, rb * 1.25), 3.2, tankC, 'tank', 16); S.count('TANK'); }
      S.line([[cx, cy, H + (crown ? 3.2 : 0)], [cx, cy, H + (crown ? 3.2 : 0) + 6]], { alpha: 190, weight: 0.9, wob: 0.1 }, { depth: D([cx, cy, H + 9]) + 0.1, tag: 'mast' });
      if (ctx.M) {
        const poly = []; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; poly.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]); }
        ctx.M.prism(poly, 0, H, 'volume');
        ctx.M.space({ name: 'STAIR', kind: 'service', x: cx - 1, y: cy - 1, w: 2, d: 2, z: 0, h: H, level: 0 });
        if (crown) ctx.M.space({ name: 'WATER TANK', kind: 'service', x: cx - 2, y: cy - 2, w: 4, d: 4, z: H, h: 3.2, level: Math.floor(H / FH) });
      }
      const tenets = [
        { name: 'DOUBLE FAMILY', ok: !oneFamily },
        { name: 'STACKED SECTIONS', ok: ns >= 5 },
        { name: 'RINGS AT EVERY JOINT', ok: missingRing < 0 },
        { name: 'TAPER', ok: taperOK },
        { name: 'CROWNED', ok: crown },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.shukhov = STYLE;
})(window);
