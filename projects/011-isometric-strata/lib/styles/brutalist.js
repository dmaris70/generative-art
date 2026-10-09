/*
 * styles/brutalist.js — BRUTALIST: the mosaic block.
 *
 * A plinth, then a stack of floor slabs following the plan's outline, each
 * in a different earth tone with parapets, dark reveals and rows of
 * brise-soleil fins; braced cores run the full height; walkways bridge to a
 * field of tightly packed pilotis, and above it a mosaic of hundreds of
 * small unit cubes stacked to a noise field. Structure is drawn as coloured
 * outline, the way an engineer's felt-tip marks a section.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan, D = global.ISO.depth;

  const STYLE = {
    key: 'BRUTALIST',
    header: 'BRUTALIST',
    titles: ['BRUTALIST DIAGRAM', 'BETON STUDY', 'MEGASTRUCTURE', 'HABITAT SECTION', 'UNIT STACK'],
    substyles: ['MOSAIC', 'TERRACE', 'CORE', 'STACK', 'GALLERY'],
    types: ['BLOCK', 'TERRACE', 'HABITAT', 'SLAB'],
    palettes: ['EARTH', 'CONCRETE', 'RUSTED', 'SEPIA'],
    sites: [['HILLSIDE', 3], ['CITY EDGE', 2], ['PARK', 2], ['CITY', 1]],
    shapes: ['CORNER', 'LSHAPE', 'RECTANGLE', 'TSHAPE', 'BAR'],
    floors: [3, 7],
    legend: [
      ['GRID', 'grid'], ['PILOTIS', 'cols'], ['BRISE', 'bar'], ['PARAPET', 'dash'], ['WALKS', 'tee'],
      ['SLABS', 'sqf'], ['CORES', 'x'], ['REVEALS', 'sqh'], ['UNITS', 'sq'], ['FLOORS', 'step'],
    ],

    size(rng, annex) {
      const cell = rng.range(3, 3.6);
      const nx = annex ? rng.int(2, 3) : rng.int(4, 6), ny = annex ? rng.int(2, 3) : rng.int(4, 6);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors, cell = P.cell;
      const pal = ctx.palette.colors;
      const pick = () => R.pick(pal);
      const EDGE = { alpha: 180, weight: 0.95, wob: 0.9, passes: 2 };
      const colPen = (c) => ({ color: c, alpha: 190, weight: 0.9, wob: 0.8 });
      const FAINT = { alpha: 70, weight: 0.65, wob: 0.7 };

      // plinth
      S.box(P.x - 0.6, P.y - 0.6, 0, P.w + 1.2, P.d + 1.2, 0.5, { color: pick(), alpha: 80, mode: 'pencil', edge: EDGE, spacing: 2.6 });
      S.count('SLABS');
      // column-axis grid, dashed on the ground
      for (let i = 0; i <= P.nx; i++) S.line([[P.x + i * cell, P.y - 2, 0.02], [P.x + i * cell, P.y + P.d + 2, 0.02]], { alpha: 70, weight: 0.6, wob: 0.4, dash: [5, 4] }, { layer: 0 });
      for (let j = 0; j <= P.ny; j++) S.line([[P.x - 2, P.y + j * cell, 0.02], [P.x + P.w + 2, P.y + j * cell, 0.02]], { alpha: 70, weight: 0.6, wob: 0.4, dash: [5, 4] }, { layer: 0 });
      S.count('GRID');

      // split: frame region (slabs) on the -x side, pilotis field on the +x side
      const split = Math.max(1, Math.min(P.nx - 1, Math.round(P.nx * R.range(0.45, 0.65))));
      const mask = plan.mask(split, P.ny, ctx.shape, R);
      const loops = plan.outline(mask);
      const frameLoop = loops[0];

      // ---- slabs following the outline, with parapets, reveals and brise ----
      for (let k = 1; k <= N; k++) {
        const z = k * FH;
        const col = pal[(k - 1) % pal.length];
        const base = plan.toWorld(frameLoop, P.x, P.y, cell, z - 0.45);
        const top = base.map((p) => [p[0], p[1], z]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(col, 0.9), alpha: 120, mode: 'pencil', spacing: 2.4, angle: 'edge' }, edge: EDGE });
        S.face(top, { fill: { color: col, alpha: 70, mode: 'pencil', spacing: 3, angle: 'edge' }, edge: EDGE });
        S.count('SLABS');
        S.count('FLOORS');
        // parapets on the visible edges
        for (const f of pr.sides) {
          if (!f.visible || !R.chance(0.55)) continue;
          const a = f.pts[3], b = f.pts[2];
          const along = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'x' : 'y';
          const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
          const len = along === 'x' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
          const ins = R.range(0.5, 1.5);
          if (along === 'x') S.box(x0 + ins, a[1] - 0.25, z, len - ins * 2, 0.25, R.range(0.7, 1.1), { color: null, edge: colPen(pick()) });
          else S.box(a[0] - 0.25, y0 + ins, z, 0.25, len - ins * 2, R.range(0.7, 1.1), { color: null, edge: colPen(pick()) });
          S.count('PARAPET');
        }
        // reveals: dark rectangles on slab faces
        for (const f of pr.sides) {
          if (!f.visible) continue;
          const n = R.int(0, 3);
          for (let i = 0; i < n; i++) {
            const t = R.range(0.1, 0.8), w = R.range(0.05, 0.12);
            const p0 = G.add(G.mul(f.pts[0], 1 - t), G.mul(f.pts[1], t));
            const p1 = G.add(G.mul(f.pts[0], 1 - t - w), G.mul(f.pts[1], t + w));
            const off = [f.n[0] * 0.03, f.n[1] * 0.03, 0];
            const q = [G.add(p0, off), G.add(p1, off), G.add([p1[0], p1[1], z - 0.05], off), G.add([p0[0], p0[1], z - 0.05], off)];
            S.face(q, { fill: { color: [60, 62, 66], alpha: 200, mode: 'grain', angle: 'side' }, edge: null, depth: D(q[0]) + 0.2 });
            S.count('REVEALS');
          }
        }
        // brise-soleil: a row of fins on one visible face of this floor
        if (k < N && R.chance(0.5)) {
          const vis = pr.sides.filter((f) => f.visible);
          if (vis.length) {
            const f = R.pick(vis);
            const a = f.pts[3], b = f.pts[2];
            const L = G.len(G.sub(b, a));
            const nF = Math.floor(L / R.range(0.5, 0.8));
            const off = [f.n[0] * 0.15, f.n[1] * 0.15, 0];
            for (let i = 1; i < nF; i++) {
              const t = i / nF;
              const p = G.add(G.add(G.mul(a, 1 - t), G.mul(b, t)), off);
              const q = [p, [p[0], p[1], p[2] + FH - 0.6]];
              S.line(q, colPen(pal[(k) % pal.length]), { depth: D(p) + 0.15 });
            }
            S.count('BRISE');
          }
        }
      }

      // ---- cores: braced shafts, full height ----
      const cellsF = plan.cells(mask);
      const nCores = R.int(1, 2);
      for (let i = 0; i < nCores && cellsF.length; i++) {
        const c = R.pick(cellsF);
        const x = P.x + c[0] * cell + cell * 0.2, y = P.y + c[1] * cell + cell * 0.2, s = cell * 0.6;
        const h = (N + R.range(0.3, 1.2)) * FH;
        const col = pick();
        S.box(x, y, 0, s, s, h, { color: col, alpha: 45, mode: 'flat', edge: colPen(col) });
        for (let k = 0; k < Math.ceil(h / FH); k++) {
          const z0 = k * FH, z1 = Math.min(h, (k + 1) * FH);
          S.line([[x + s, y, z0], [x + s, y + s, z1]], colPen(col), { depth: D([x + s, y + s, z0]) + 0.1 });
          S.line([[x + s, y + s, z0], [x + s, y, z1]], colPen(col), { depth: D([x + s, y + s, z0]) + 0.1 });
          S.line([[x, y + s, z0], [x + s, y + s, z1]], colPen(col), { depth: D([x + s, y + s, z0]) + 0.1 });
          S.line([[x + s, y + s, z0], [x, y + s, z1]], colPen(col), { depth: D([x + s, y + s, z0]) + 0.1 });
        }
        S.count('CORES');
      }

      // ---- pilotis field ----
      const fx0 = P.x + split * cell + 0.4, fw = P.w - split * cell - 0.8;
      const sp = R.range(0.95, 1.3);
      const noise = global.Paper.makeNoise(R.int(0, 1e9));
      let nPil = 0;
      for (let x = fx0; x < fx0 + fw - 0.3; x += sp) {
        for (let y = P.y + 0.4; y < P.y + P.d - 0.6; y += sp) {
          if (R.chance(0.18)) continue;
          const t = noise(x * 0.25, y * 0.25, 2);
          const hF = Math.max(1, Math.min(N, Math.round(1 + t * (N - 0.5) + R.range(-0.4, 0.6))));
          const col = pick();
          S.box(x + R.range(-0.1, 0.1), y + R.range(-0.1, 0.1), 0.5, 0.5, 0.5, hF * FH - 0.5, { color: R.chance(0.15) ? col : null, alpha: 60, mode: 'flat', edge: colPen(col) });
          nPil++;
        }
      }
      S.count('PILOTIS', nPil);

      // ---- unit mosaic above the field ----
      const uz = Math.max(1, Math.round(N * R.range(0.4, 0.7))) * FH;
      const us = R.range(0.8, 1.1), gap = 0.28;
      const ux0 = fx0 + R.range(0, 1), uw = fw - R.range(0, 1);
      let nU = 0;
      const noise2 = global.Paper.makeNoise(R.int(0, 1e9));
      for (let x = ux0; x < ux0 + uw - us; x += us + gap) {
        for (let y = P.y + 0.6; y < P.y + P.d - us - 0.4; y += us + gap) {
          const t = noise2(x * 0.3 + 7, y * 0.3, 2);
          const n = Math.round(t * 4.5);
          for (let k = 0; k < n; k++) {
            const col = pick();
            S.box(x, y, uz + k * (us + gap * 0.5), us, us, us, { color: R.chance(0.12) ? col : null, alpha: 70, mode: 'flat', edge: colPen(col) });
            nU++;
          }
        }
      }
      S.count('UNITS', nU);

      // ---- walkways: beams bridging frame and field ----
      const nW = R.int(3, 8);
      for (let i = 0; i < nW; i++) {
        const k = R.int(1, N);
        const z = k * FH - 0.1;
        const y = P.y + R.range(0.5, P.d - 1.2);
        const x0 = P.x + split * cell - R.range(0.5, 2), x1 = fx0 + fw * R.range(0.4, 1.05);
        const col = pick();
        if (R.chance(0.7)) {
          S.box(x0, y, z, x1 - x0, 0.7, 0.4, { color: col, alpha: 60, mode: 'flat', edge: colPen(col) });
        } else {
          // a diagonal member
          const c = [(x0 + x1) / 2, y, z - FH * 0.5];
          const u = G.norm([x1 - x0, 0, FH * R.sign()]);
          const v = [0, 1, 0], w = G.norm(G.cross(u, v));
          S.faces(G.obox(c, u, v, w, G.len([x1 - x0, 0, FH]) / 2, 0.3, 0.2), { color: null, edge: colPen(col) });
        }
        S.count('WALKS');
      }
      // roof-level long beam and a mast
      if (!ctx.annex && R.chance(0.7)) {
        const col = pick();
        const z = N * FH + 0.3;
        S.box(P.x + 0.5, P.y + R.range(0, P.d - 1), z, P.w * R.range(0.5, 0.9), 0.8, 0.8, { color: col, alpha: 50, mode: 'flat', edge: colPen(col) });
        S.count('WALKS');
        const mx = P.x + R.range(1, 3), my = P.y + R.range(1, 3);
        S.box(mx, my, N * FH, 0.5, 0.5, FH * R.range(1.2, 2.2), { color: null, edge: colPen(pick()) });
        // a framed panel with a cross, the way a sign or water tank is drawn
        const px = mx + 1.5, ph = FH * 1.3, pw = 2.4;
        const q = [[px, my + 0.25, N * FH + 0.4], [px + pw, my + 0.25, N * FH + 0.4], [px + pw, my + 0.25, N * FH + 0.4 + ph], [px, my + 0.25, N * FH + 0.4 + ph]];
        S.face(q, { fill: { color: pal[1] || col, alpha: 45, mode: 'flat' }, edge: colPen(pick()) });
        S.line([q[0], q[2]], FAINT, { depth: D(q[0]) + 0.05 });
        S.line([q[1], q[3]], FAINT, { depth: D(q[0]) + 0.05 });
        S.count('PARAPET');
      }

      return {
        kv: [['CIRC', R.pick(['COMPLEX', 'LINEAR', 'GALLERY', 'STREET-IN-AIR'])]],
      };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.brutalist = STYLE;
})(window);
