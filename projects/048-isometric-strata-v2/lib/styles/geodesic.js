/*
 * styles/geodesic.js — GEODESIC: the expo mast.
 *
 * Clusters of tall masts, stepped in height, each crowned by a geodesic
 * hemisphere drawn strut by strut with its hubs picked out in the accent
 * colour. Rings brace the masts, hexagonal decks hang off them at several
 * levels with small shelters on top, footings tie the bases together, and
 * the ground is patterned with hatched panels. In TECHNICAL detail the
 * sheet carries dimension notes in the accent ink.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'GEODESIC',
    header: 'ISOMETRIC STRATA',
    titles: ['GEODESIC DIAGRAM', 'EXPO SPHERE', 'TENSEGRITY STUDY', 'DOME ARRAY', 'MAST SECTION'],
    substyles: ['EXPO SPHERE', 'DOPPEL', 'TRIAD', 'STEPPED MAST', 'RADOME'],
    types: ['DOPPEL', 'MAST', 'PAVILION', 'ARRAY'],
    palettes: ['DEWLINE', 'ARCTIC', 'SIGNAL', 'MONOCHROME'],
    sites: [['PLAZA DIST', 3], ['PARK', 2], ['WATERFRONT', 2], ['CITY EDGE', 1]],
    shapes: ['STEPPED', 'RECTANGLE', 'CROSS'],
    floors: [5, 9],
    legend: [
      ['LATTICE', 'diag'], ['PANELS', 'sqf'], ['DOMES', 'dome'], ['DECKS', 'hex'], ['SHELTERS', 'sq'],
      ['HUBS', 'dot'], ['RINGS', 'circ'], ['FOOTINGS', 'tee'], ['MASTS', 'bar'], ['PATTERNS', 'sqh'],
    ],

    size(rng, annex) {
      const w = annex ? rng.range(7, 10) : rng.range(14, 22), d = annex ? rng.range(7, 10) : rng.range(14, 22);
      return { w: w, d: d };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, H = ctx.floors * FH;
      const pal = ctx.palette.colors;
      const accent = ctx.palette.accent || [230, 112, 46];
      const tone = pal[1] || [120, 132, 146];
      const STRUT = { alpha: 185, weight: 0.95, wob: 0.9, passes: 1 };
      const MAST = { alpha: 175, weight: 0.9, wob: 0.8 };
      const FAINT = { alpha: 70, weight: 0.65, wob: 0.7 };
      const freq = ctx.detail >= 3 ? 3 : 2;
      const dome = G.geodesic(freq);

      const nG = ctx.annex ? 1 : R.int(2, 3);
      const heights = [];
      for (let g = 0; g < nG; g++) heights.push(H * (g === 0 ? 1 : R.range(0.45, 0.85)));
      const centres = [];
      for (let g = 0; g < nG; g++) {
        for (let t = 0; t < 20; t++) {
          const c = [P.x + R.range(3, P.w - 3), P.y + R.range(3, P.d - 3)];
          let ok = true;
          for (const o of centres) if (Math.hypot(c[0] - o[0], c[1] - o[1]) < 6) ok = false;
          if (ok || t === 19) { centres.push(c); break; }
        }
      }

      const notes = [];
      const noteAt = (p, txt) => notes.push([p, txt]);

      for (let g = 0; g < nG; g++) {
        const c = centres[g], Hg = heights[g];
        const r = R.range(2.6, 4.2) * (ctx.annex ? 0.7 : 1);
        const nM = R.int(3, 6);
        const rot = R.range(0, Math.PI * 2);
        const bases = [];

        // masts, footings, base frame
        for (let m = 0; m < nM; m++) {
          const a = rot + (m / nM) * Math.PI * 2;
          const x = c[0] + Math.cos(a) * r * 0.82, y = c[1] + Math.sin(a) * r * 0.82;
          const mh = Hg + R.range(0.2, 1.2);
          S.box(x - 0.16, y - 0.16, 0, 0.32, 0.32, mh, { color: null, edge: MAST });
          S.box(x - 0.5, y - 0.5, 0, 1, 1, 0.45, { color: tone, alpha: 70, mode: 'flat', edge: MAST });
          S.count('MASTS');
          S.count('FOOTINGS');
          bases.push([x, y, 0]);
          if (m % 2 === 0 && ctx.detail >= 2) noteAt([x + 0.6, y + 0.6, 0.2], R.pick(['0' + R.int(1, 9), 'F' + R.int(10, 99), 'A' + R.int(1, 6)]));
        }
        S.line(bases.concat([bases[0]]), { alpha: 190, weight: 1.3, wob: 0.8 }, { depth: D(c) - 8 });
        S.line(bases.map((p) => [p[0], p[1], 0.45]).concat([[bases[0][0], bases[0][1], 0.45]]), FAINT, { depth: D(c) - 7.9 });
        S.count('FOOTINGS');

        // rings up the mast cluster, with x-bracing between neighbours
        const nRings = R.int(2, 4);
        for (let k = 1; k <= nRings; k++) {
          const z = Hg * k / (nRings + 0.2);
          const ring = G.regular(c[0], c[1], z, r * 0.9, 24, 0);
          S.line(ring.concat([ring[0]]), { alpha: 140, weight: 0.8, wob: 0.8 }, { depth: D([c[0], c[1], z]) });
          S.count('RINGS');
          if (k < nRings) {
            const z2 = Hg * (k + 1) / (nRings + 0.2);
            for (let m = 0; m < nM; m++) {
              const a = bases[m], b = bases[(m + 1) % nM];
              S.line([[a[0], a[1], z], [b[0], b[1], z2]], FAINT, { depth: D([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z]) });
              S.count('LATTICE');
            }
          }
        }

        // decks: hexagonal plates, with shelters
        const nDk = R.int(1, 3);
        for (let k = 0; k < nDk; k++) {
          const z = Hg * R.range(0.25, 0.85);
          const dr = r * R.range(0.55, 1.05);
          const off = [R.range(-1.5, 1.5), R.range(-1.5, 1.5)];
          const hex = G.regular(c[0] + off[0], c[1] + off[1], z, dr, 6, R.range(0, 1));
          const hex2 = hex.map((p) => [p[0], p[1], z - 0.3]);
          const pr = G.prism(hex2, hex);
          for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: tone, alpha: 90, mode: 'flat' }, edge: MAST });
          S.face(hex, { fill: { color: pal[2] || tone, alpha: 60, mode: 'flat' }, edge: MAST });
          // deck rail
          S.line(hex.map((p) => [p[0], p[1], z + 0.9]).concat([[hex[0][0], hex[0][1], z + 0.9]]), FAINT, { depth: D([c[0], c[1], z]) + 0.05 });
          for (let i = 0; i < 6; i++) S.line([hex[i], [hex[i][0], hex[i][1], z + 0.9]], FAINT, { depth: D(hex[i]) + 0.05 });
          S.count('DECKS');
          if (R.chance(0.6)) {
            const sw = R.range(1.2, 2);
            S.box(c[0] + off[0] - sw / 2, c[1] + off[1] - sw / 2, z, sw, sw, R.range(1, 1.6), { color: tone, alpha: 80, mode: 'flat', edge: MAST });
            S.count('SHELTERS');
          }
        }

        // the dome
        const dz = Hg, dr2 = r;
        const V = dome.verts.map((v) => [c[0] + v[0] * dr2, c[1] + v[1] * dr2, dz + v[2] * dr2]);
        const up = (i) => dome.verts[i][2] > -0.02;
        for (const e of dome.edges) {
          if (!up(e[0]) || !up(e[1])) continue;
          S.line([V[e[0]], V[e[1]]], STRUT, { depth: D(G.centroid([V[e[0]], V[e[1]]])) });
          S.count('LATTICE');
        }
        for (const f of dome.faces) {
          if (!up(f[0]) || !up(f[1]) || !up(f[2])) continue;
          if (R.chance(0.14)) {
            S.face([V[f[0]], V[f[1]], V[f[2]]], { fill: { color: pal[2] || tone, alpha: 110, mode: 'flat' }, edge: null });
            S.count('PANELS');
          }
        }
        const hubEvery = ctx.detail >= 2 ? 1 : 3;
        let hubIdx = 0;
        for (let i = 0; i < V.length; i++) {
          if (!up(i)) continue;
          if (hubIdx++ % hubEvery !== 0) continue;
          const p = V[i];
          S.custom(p, function (hand, Pj) { const s = Pj(p); hand.dot(s[0], s[1], 1.6, { color: accent, alpha: 220 }); }, { bias: 0.2 });
          S.count('HUBS');
        }
        // equator ring
        const eq = G.regular(c[0], c[1], dz, dr2, 30, 0);
        S.line(eq.concat([eq[0]]), { alpha: 200, weight: 1.2, wob: 0.7 }, { depth: D([c[0], c[1], dz]) + 0.1 });
        S.count('DOMES');
        S.count('RINGS');
        if (ctx.detail >= 2) {
          noteAt([c[0] + dr2 * 0.7, c[1] - dr2 * 0.7, dz + dr2 * 0.6], String(R.int(1958, 1992)));
          noteAt([c[0] - dr2, c[1] + dr2 * 0.5, dz + 0.6], 'R' + dr2.toFixed(1));
        }
      }

      // ground patterns
      const nPat = R.int(3, 7);
      for (let i = 0; i < nPat; i++) {
        const w = R.range(2.5, 6), d = R.range(2.5, 6);
        global.Site.panel(ctx, P.x + R.range(0, P.w - w), P.y + R.range(0, P.d - d), w, d, R.pick(['hatch', 'tri', 'cross', 'grid', 'rings']));
        S.count('PATTERNS');
      }
      // scattered hex marks
      const nHex = R.int(4, 12);
      for (let i = 0; i < nHex; i++) {
        const h = G.regular(P.x + R.range(0, P.w), P.y + R.range(0, P.d), 0, R.range(0.25, 0.6), 6, R.range(0, 1));
        S.line(h.concat([h[0]]), FAINT, { layer: 0 });
      }
      S.count('PATTERNS', 1);

      if (ctx.detail >= 2) {
        noteAt([P.x + 1, P.y + P.d - 1, 0.1], R.int(120, 480) + ' FT');
        noteAt([P.x + P.w - 2, P.y + 1, 0.1], R.pick(['45', '60', '90', '30']));
      }
      for (const n of notes) {
        const p = n[0], txt = n[1];
        S.custom(p, function (hand, Pj) {
          const s = Pj(p);
          hand.line([[s[0] - 6, s[1] + 3], [s[0], s[1]]], { color: accent, alpha: 160, weight: 0.6, wob: 0.4 });
          hand.text(txt, s[0] + 1, s[1] - 9, 9, { color: accent, alpha: 210, weight: 0.8 });
        }, { bias: 1 });
      }

      return {
        kv: [['STRUCT', R.pick(['FEW', 'TENSILE', 'SPACEFRAME'])]],
      };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.geodesic = STYLE;
})(window);
