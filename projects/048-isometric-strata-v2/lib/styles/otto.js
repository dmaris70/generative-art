/*
 * styles/otto.js — OTTO: the tensile roof.
 *
 * Frei Otto's lightweight structures, Montreal to Munich: a roof that is only a skin
 * in tension, held at its peaks by masts and at its edges by cables, its form not drawn
 * but found, the shape a soap film takes. The grammar is a cluster of tents, each a
 * peak on a mast with four low corners, the membrane sagging between them, the
 * boundary cables arching, every corner tied down to an anchor. Nothing else carries
 * a load, and nothing closes the sides.
 *
 * Five tenets over the drawn scene: in tension (every boundary cable arches or sags),
 * three masts, light (no solid wall), cluster (tents sharing corners), anchored
 * (every corner tied down). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'OTTO',
    header: 'TENSILE',
    titles: ['TENT STUDY', 'MINIMAL SURFACE', 'MUNICH ROOF', 'CABLE NET', 'LIGHTWEIGHT'],
    substyles: ['MONTREAL', 'MUNICH', 'MANNHEIM', 'JEDDAH', 'TUWAIQ'],
    types: ['PAVILION', 'STADIUM', 'CANOPY'],
    palettes: ['MEMBRANE', 'NETWORK', 'CANVAS'],
    sites: [['PARK', 3], ['WATERFRONT', 2], ['HILLSIDE', 2]],
    shapes: ['TENTS'],
    floors: [1, 2],
    legend: [['TENT', 'tri'], ['MAST', 'tee'], ['CABLE', 'dash'], ['ANCHOR', 'dot'], ['EDGE', 'wave']],

    size(rng, annex) {
      const w = rng.range(44, 50), d = rng.range(30, 36);
      return annex ? { w: w * 0.55, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, skin = c[0], mastC = c[1], cable = c[2];
      const nM = ctx.annex ? 2 : Rn.int(2, 4);
      const rx = Math.min(Rn.range(8, 11), (P.w - 4) / (2 * nM)), ry = Math.min(Rn.range(7, 9.5), (P.d - 6) / 2);
      const x0 = P.x + (P.w - 2 * rx * nM) / 2, cy = P.y + P.d / 2, mh = N * FH * 3 + Rn.range(8, 12), zc = 2.2;
      const shared = new Set(), anchors = [];
      let edgesOK = true, anchored = true, tents = 0;
      const wallC = Rn.chance(0.12);
      const cableP = { color: cable, alpha: 170, weight: 0.75, wob: 0.2 };
      for (let m = 0; m < nM; m++) {
        const mx = x0 + rx + m * 2 * rx, my = cy + (Rn.chance(0.2) ? Rn.range(-1.5, 1.5) : 0);
        const corners = [[mx - rx, my - ry], [mx + rx, my - ry], [mx + rx, my + ry], [mx - rx, my + ry]];
        for (const q of corners) { const k = q[0].toFixed(1) + ',' + q[1].toFixed(1); if (shared.has(k)) shared.add(k + '*'); shared.add(k); }
        // the boundary: each edge a cable arching up at its midpoint, or flat on a bad day
        const flat = Rn.chance(0.12), rise = flat ? 0.3 : Rn.range(2, 3.4);
        if (flat) edgesOK = false;
        const edge = (a, b) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, zc + Math.sin(Math.PI * t) * rise]); } return pts; };
        const edges = [edge(corners[0], corners[1]), edge(corners[1], corners[2]), edge(corners[2], corners[3]), edge(corners[3], corners[0])];
        const peak = [mx, my, mh];
        for (const e of edges) {
          for (let i = 0; i < e.length - 1; i++) {
            const a = e[i], b = e[i + 1], cen = [(a[0] + b[0] + peak[0]) / 3 - mx, (a[1] + b[1] + peak[1]) / 3 - my];
            let n = G.cross(G.sub(b, a), G.sub(peak, a));
            if (n[0] * cen[0] + n[1] * cen[1] < 0) n = G.mul(n, -1);
            if (n[0] + n[1] + n[2] <= 0) continue;
            const nn = G.norm(n);
            S.face([a, b, peak], { fill: { color: G.shade(skin, 0.78 + 0.3 * Math.max(0, Math.min(1, (nn[2] + 0.2 * (nn[1] - nn[0]) + 0.6) / 1.2))), alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: null, tag: 'tent' });
          }
          S.line(e, cableP, { depth: D([e[4][0], e[4][1], e[4][2]]) + 0.2, tag: 'cable' });
        }
        S.count('TENT'); S.count('EDGE', 4); tents++;
        for (const q of corners) S.line([[peak[0], peak[1], peak[2] * 0.97], [q[0], q[1], zc]], { color: cable, alpha: 120, weight: 0.6, wob: 0.2 }, { depth: D([q[0], q[1], zc]) + 0.2, tag: 'cable' });
        S.count('CABLE', 4);
        S.box(mx - 0.3, my - 0.3, 0, 0.6, 0.6, mh, { color: mastC, alpha: 220, mode: 'flat', edge: K.EDGE, tag: 'mast' }); S.count('MAST');
        for (const q of corners) {
          if (Rn.chance(0.04)) { anchored = false; continue; }
          const k = q[0].toFixed(1) + ',' + q[1].toFixed(1);
          if (anchors.indexOf(k) >= 0) continue;
          anchors.push(k);
          S.box(q[0] - 0.4, q[1] - 0.4, 0, 0.8, 0.8, zc * 0.4, { color: mastC, alpha: 170, mode: 'flat', edge: K.THIN, tag: 'anchor' }); S.count('ANCHOR');
          S.line([[q[0], q[1], zc * 0.4], [q[0], q[1], zc]], cableP, { depth: D([q[0], q[1], zc]), tag: 'cable' });
        }
        if (ctx.M) {
          const poly = corners.map((q) => [q[0], q[1]]);
          ctx.M.prism(poly, 0, mh, 'volume');
          ctx.M.space({ name: 'TENT HALL', kind: 'room', poly: poly, z: 0, h: mh * 0.5, level: 0, area: 4 * rx * ry * 0.7 });
        }
      }
      if (wallC) S.box(x0, cy + ry, 0, 2 * rx * nM, 0.4, 3.2, { color: skin, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'wall' });
      const nShared = [...shared].filter((k) => k.endsWith('*')).length;
      const tenets = [
        { name: 'IN TENSION', ok: edgesOK },
        { name: 'THREE MASTS', ok: nM >= 3 },
        { name: 'LIGHT', ok: !wallC },
        { name: 'CLUSTER', ok: nShared >= 2 },
        { name: 'ANCHORED', ok: anchored },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.otto = STYLE;
})(window);
