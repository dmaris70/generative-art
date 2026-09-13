/*
 * styles/rossi.js — ROSSIAN: the analogous city.
 *
 * Typology as a grammar. Inside a court enclosed by a long colonnade on
 * plain square piers stand only archetypes: a cube (the ossuary), a
 * cylinder on a cube crowned with a cone (the tower), a gabled bar (the
 * house), a free cone. Windows are square, identical, in silent rows
 * centred on every face, and small against the wall. Each solid is
 * symmetric in itself; the whole is not. Every solid casts a hatched
 * shadow from the same sun — the first time this hand draws a shadow.
 *
 * Five tenets over the drawn scene: archetypes (each solid symmetric
 * about its own centre, windows centred on their faces), square windows
 * (all square, all one size), silent façades (windows a small share of
 * every wall), asymmetric whole (the massing off the court's centre),
 * one sun (every shadow falls the same way). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'ROSSIAN',
    header: 'ANALOGOUS CITY',
    titles: ['ROSSI DIAGRAM', 'ANALOGOUS CITY', 'TIPOLOGIA', 'SAN CATALDO', 'GALLARATESE STUDY'],
    substyles: ['CUBO', 'OSSARIO', 'TEATRO', 'GALLARATESE', 'CIMITERO'],
    types: ['MONUMENT', 'CEMETERY', 'HOUSING', 'THEATRE'],
    palettes: ['GALLARATESE', 'CATALDO', 'TEATRO'],
    sites: [['PLAZA DIST', 3], ['CITY EDGE', 2], ['PARK', 2], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE'],
    floors: [3, 6],
    legend: [
      ['CUBE', 'sq'], ['CYLINDER', 'circ'], ['CONE', 'tri'], ['GABLE', 'dome'], ['PORTICO', 'tee'],
      ['WINDOW', 'sqf'], ['PIER', 'cols'], ['TOWER', 'bar'], ['SHADOW', 'sqh'], ['COURT', 'grid'],
    ],

    size(rng, annex) {
      return { w: annex ? rng.range(12, 16) : rng.range(26, 34), d: annex ? rng.range(10, 14) : rng.range(22, 28) };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors;
      const bone = c[0], red = c[1], ochre = c[2], grey = c[3], teal = c[4];
      const dark = [50, 52, 56];
      const EDGE = { alpha: 190, weight: 0.95, wob: 0.7, passes: 1 };
      const THIN = { alpha: 150, weight: 0.75, wob: 0.6 };
      const FAINT = { alpha: 70, weight: 0.6, wob: 0.6 };
      const SUN = [0.55, 0.25]; // where shadows fall, per metre of height
      const WIN = 1.3; // the one window
      const solids = []; // { type, cx, cy, mass }
      const windows = []; // { w, h }
      const facades = []; // { area, glazed }
      const shadows = []; // { dir }

      // ---- shadow: the hull of a footprint and the footprint carried up and over ----
      const hull = (pts) => {
        const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo = [], up = [];
        for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
        for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
        return lo.slice(0, -1).concat(up.slice(0, -1));
      };
      const shadow = (foot, h, cxy) => {
        const carried = foot.map((p) => [p[0] + SUN[0] * h, p[1] + SUN[1] * h]);
        const poly = hull(foot.concat(carried)).map((p) => [p[0], p[1], 0.02]);
        S.face(poly, { fill: { color: grey, alpha: 120, mode: 'hatch', spacing: 2.4, angle: -Math.PI / 4 }, edge: null, layer: 0, depth: 1e5, tag: 'shadow' });
        const sc = G.centroid(poly);
        shadows.push({ dir: [sc[0] - cxy[0], sc[1] - cxy[1]] });
        S.count('SHADOW');
      };

      // ---- windows: square, identical, centred on the face ----
      const windowRow = (x0, y0, len, nrm, z, tag) => {
        const n = Math.max(1, Math.floor((len - 1.2) / (WIN + 1.6)));
        const start = (len - n * WIN - (n - 1) * 1.6) / 2;
        const o = 0.03;
        for (let k = 0; k < n; k++) {
          const t = start + k * (WIN + 1.6);
          const q = nrm === 'x'
            ? [[x0 + o, y0 + t, z], [x0 + o, y0 + t + WIN, z], [x0 + o, y0 + t + WIN, z + WIN], [x0 + o, y0 + t, z + WIN]]
            : [[x0 + t, y0 + o, z], [x0 + t + WIN, y0 + o, z], [x0 + t + WIN, y0 + o, z + WIN], [x0 + t, y0 + o, z + WIN]];
          S.face(q, { fill: { color: dark, alpha: 210, mode: 'flat' }, edge: null, tag: 'window', depth: D(q[0]) + 0.2 });
          windows.push({ w: WIN, h: WIN, offset: t, len: len });
          S.count('WINDOW');
        }
        return n * WIN * WIN;
      };
      const punch = (x, y, w, d, h, storeys) => {
        // rows on the two visible faces, one per storey, sill at a third
        let gx = 0, gy = 0;
        const rows = Math.max(1, storeys);
        for (let k = 0; k < rows; k++) {
          const z = (h / rows) * k + (h / rows - WIN) / 2;
          gx += windowRow(x + w, y, d, 'x', z, 'window');
          gy += windowRow(x, y + d, w, 'y', z, 'window');
        }
        facades.push({ area: h * d, glazed: gx }, { area: h * w, glazed: gy });
      };

      // ---- the court and its colonnade ----
      S.face(G.rect(P.x, P.y, 0.01, P.w, P.d), { fill: null, edge: EDGE, layer: 0, tag: 'court' });
      for (let gx = P.x + 3; gx < P.x + P.w; gx += 3) S.line([[gx, P.y, 0.01], [gx, P.y + P.d, 0.01]], FAINT, { layer: 0 });
      for (let gy = P.y + 3; gy < P.y + P.d; gy += 3) S.line([[P.x, gy, 0.01], [P.x + P.w, gy, 0.01]], FAINT, { layer: 0 });
      S.count('COURT');
      const barH = FH * Math.max(2, Math.round(N * 0.6)), pierH = FH * 1.2, barD = 3;
      const portico = (x, y, w, d) => {
        S.box(x, y, pierH, w, d, barH - pierH, { color: bone, alpha: 170, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'portico' });
        const along = w > d;
        const L = along ? w : d;
        const n = Math.max(2, Math.round(L / 2.6));
        for (let k = 0; k <= n; k++) {
          const t = (L / n) * k;
          const px = along ? x + Math.min(t, L - 0.6) : x + d / 2 - 0.3, py = along ? y + d / 2 - 0.3 : y + Math.min(t, L - 0.6);
          S.box(px, py, 0, 0.6, 0.6, pierH, { color: bone, alpha: 190, mode: 'flat', edge: EDGE, tag: 'pier' });
          S.count('PIER');
        }
        // one silent row of windows on the bar's visible faces
        const gx = windowRow(x + w, y, d, 'x', pierH + (barH - pierH) / 2 - WIN / 2, 'window');
        const gy = windowRow(x, y + d, w, 'y', pierH + (barH - pierH) / 2 - WIN / 2, 'window');
        facades.push({ area: (barH - pierH) * d, glazed: gx }, { area: (barH - pierH) * w, glazed: gy });
        shadow([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], barH, [x + w / 2, y + d / 2]);
        solids.push({ type: 'bar', cx: x + w / 2, cy: y + d / 2, mass: w * d * barH });
        S.count('PORTICO');
      };
      portico(P.x, P.y, P.w, barD);
      if (!ctx.annex && R.chance(0.7)) portico(P.x, P.y + barD, barD, P.d - barD);

      // ---- the archetypes on a 3 × 2 grid of the court ----
      const ix0 = P.x + barD + 2, iy0 = P.y + barD + 2, iw = P.w - barD - 4, id = P.d - barD - 4;
      const gc = 3, gr = 2, cw = iw / gc, cd = id / gr;
      const cellAt = (i, j) => ({ x: ix0 + i * cw, y: iy0 + j * cd });
      const order = R.shuffle([[0, 0], [2, 0], [0, 1], [2, 1]]).concat(R.shuffle([[1, 0], [1, 1]]));
      const kinds = ctx.annex ? R.shuffle(['cube', 'tower']) : R.shuffle(['cube', 'tower', 'gable', 'cone', R.pick(['cube', 'gable'])]);
      const cyl = (cx, cy, z, r, h, col, tag) => {
        const base = G.regular(cx, cy, z, r, 16), top = base.map((p) => [p[0], p[1], z + h]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(col, 0.8 + 0.24 * ((f.n[1] - f.n[0]) * 0.5 + 0.5)), alpha: 190, mode: 'flat' }, edge: null, tag: tag });
        S.line(top.concat([top[0]]), EDGE, { depth: D([cx + r, cy + r, z + h]) + 0.1, tag: tag });
        S.line([base[4], top[4]], THIN, { depth: D(base[4]) + 0.05 });
        S.line([base[12], top[12]], THIN, { depth: D(base[12]) + 0.05 });
        S.line([base[0], top[0]], EDGE, { depth: D(base[0]) + 0.05 });
        return base;
      };
      const cone = (cx, cy, z, r, h, col, tag) => {
        const base = G.regular(cx, cy, z, r, 16), apex = [cx, cy, z + h];
        for (let k = 0; k < 16; k++) {
          const a = base[k], b = base[(k + 1) % 16];
          let n = G.cross(G.sub(b, a), G.sub(apex, a));
          const mid = [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy];
          if (n[0] * mid[0] + n[1] * mid[1] < 0) n = G.mul(n, -1);
          if (n[0] + n[1] + n[2] <= 0) continue;
          const nn = G.norm(n);
          S.face([a, b, apex], { fill: { color: G.shade(col, 0.8 + 0.24 * ((nn[1] - nn[0]) * 0.5 + 0.5)), alpha: 190, mode: 'flat' }, edge: k % 4 === 0 ? THIN : null, tag: tag });
        }
        S.line(base.concat([base[0]]), EDGE, { depth: D([cx + r, cy + r, z]) + 0.1, tag: tag });
        S.count('CONE');
      };
      let k = 0;
      for (const kind of kinds) {
        const cellIdx = order[k++];
        const cell = cellAt(cellIdx[0], cellIdx[1]);
        const s = Math.min(cw, cd) * R.range(0.55, 0.75);
        const x = cell.x + (cw - s) / 2, y = cell.y + (cd - s) / 2;
        if (kind === 'cube') {
          S.box(x, y, 0, s, s, s, { color: red, alpha: 170, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'cube' });
          punch(x, y, s, s, s, Math.max(2, Math.round(s / FH)));
          shadow([[x, y], [x + s, y], [x + s, y + s], [x, y + s]], s, [x + s / 2, y + s / 2]);
          solids.push({ type: 'cube', cx: x + s / 2, cy: y + s / 2, mass: s * s * s });
          S.count('CUBE');
        } else if (kind === 'tower') {
          const bs = s * 0.9, bh = FH * 1.5;
          const bx = cell.x + (cw - bs) / 2, by = cell.y + (cd - bs) / 2;
          S.box(bx, by, 0, bs, bs, bh, { color: ochre, alpha: 170, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'cube' });
          punch(bx, by, bs, bs, bh, 1);
          const r = bs * 0.36, ch = N * FH;
          cyl(bx + bs / 2, by + bs / 2, bh, r, ch, bone, 'cylinder');
          S.count('CYLINDER');
          cone(bx + bs / 2, by + bs / 2, bh + ch, r + 0.2, r * 1.4, teal, 'cone');
          const foot = G.regular(bx + bs / 2, by + bs / 2, 0, r + 0.2, 16).map((p) => [p[0], p[1]]).concat([[bx, by], [bx + bs, by], [bx + bs, by + bs], [bx, by + bs]]);
          shadow(foot, bh + ch + r * 1.4, [bx + bs / 2, by + bs / 2]);
          solids.push({ type: 'tower', cx: bx + bs / 2, cy: by + bs / 2, mass: bs * bs * (bh + ch) });
          S.count('TOWER');
          S.count('CUBE');
        } else if (kind === 'gable') {
          const w = cw * 0.8, d = Math.min(cd * 0.5, 7), h = FH * 2;
          const gx = cell.x + (cw - w) / 2, gy = cell.y + (cd - d) / 2;
          S.box(gx, gy, 0, w, d, h, { color: bone, alpha: 170, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'gable' });
          punch(gx, gy, w, d, h, 2);
          const rh = d * 0.45, ym = gy + d / 2;
          S.face([[gx, gy + d, h], [gx + w, gy + d, h], [gx + w, ym, h + rh], [gx, ym, h + rh]], { fill: { color: G.shade(grey, 1.05), alpha: 170, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'roof' });
          S.face([[gx, gy, h], [gx + w, gy, h], [gx + w, ym, h + rh], [gx, ym, h + rh]], { fill: { color: G.shade(grey, 0.85), alpha: 150, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'roof' });
          S.face([[gx + w, gy, h], [gx + w, gy + d, h], [gx + w, ym, h + rh]], { fill: { color: bone, alpha: 170, mode: 'flat' }, edge: EDGE, tag: 'gable' });
          shadow([[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]], h + rh, [gx + w / 2, ym]);
          solids.push({ type: 'gable', cx: gx + w / 2, cy: ym, mass: w * d * h });
          S.count('GABLE');
        } else if (kind === 'cone') {
          const r = s * 0.42, h = r * 2.2;
          const cx = cell.x + cw / 2, cy = cell.y + cd / 2;
          const base = cyl(cx, cy, 0, r, FH * 0.5, grey, 'cylinder');
          cone(cx, cy, FH * 0.5, r, h, red, 'cone');
          shadow(base.map((p) => [p[0], p[1]]), FH * 0.5 + h, [cx, cy]);
          solids.push({ type: 'cone', cx: cx, cy: cy, mass: r * r * 3 * h });
          S.count('CYLINDER');
        }
      }
      // a row of cypresses along the open side
      for (let t = P.x + 2; t < P.x + P.w - 1; t += R.range(2.4, 3.2)) global.Site.tree(ctx, t, P.y + P.d + 1.6, R.range(0.5, 0.7));

      // ---- the tenets ----
      const centred = windows.every((w) => true); // rows are set out symmetric on their face by construction; verified below
      const rowSym = (() => {
        // for every face, the set of offsets must mirror about the face centre
        const byFace = new Map();
        for (const w of windows) { const key = w.len.toFixed(3); if (!byFace.has(key)) byFace.set(key, []); byFace.get(key).push(w.offset); }
        for (const [key, offs] of byFace) {
          const len = parseFloat(key);
          for (const o of offs) if (!offs.some((q) => Math.abs((len - q - WIN) - o) < 0.02)) return false;
        }
        return true;
      })();
      const archetypes = solids.every((s) => ['cube', 'tower', 'gable', 'cone', 'bar'].indexOf(s.type) >= 0) && rowSym && centred;
      const square = windows.length > 0 && windows.every((w) => Math.abs(w.w - w.h) < 0.01 && Math.abs(w.w - WIN) < 0.01);
      const silent = facades.every((f) => f.glazed / f.area <= 0.25);
      let mx = 0, my = 0, mm = 0;
      for (const s of solids) { mx += s.cx * s.mass; my += s.cy * s.mass; mm += s.mass; }
      const asym = Math.abs(mx / mm - (P.x + P.w / 2)) > P.w * 0.08 || Math.abs(my / mm - (P.y + P.d / 2)) > P.d * 0.08;
      const oneSun = shadows.length > 0 && shadows.every((s) => s.dir[0] * SUN[0] + s.dir[1] * SUN[1] > 0);
      const tenets = [
        { name: 'ARCHETYPES', ok: archetypes },
        { name: 'SQUARE WINDOWS', ok: square },
        { name: 'SILENT FACADES', ok: silent },
        { name: 'ASYMMETRIC WHOLE', ok: asym },
        { name: 'ONE SUN', ok: oneSun },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.rossi = STYLE;
})(window);
