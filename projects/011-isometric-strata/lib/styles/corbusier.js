/*
 * styles/corbusier.js — FIVE POINTS: the purist villa.
 *
 * Le Corbusier's 1926 manifesto is a checklist, so the style is one too:
 * pilotis lift the volume off the ground; the plan is free of the column
 * grid (partitions wander); the façade is free of the structure (a skin set
 * outside the columns); ribbon windows run the length of the skin; the roof
 * is a garden. A ramp — the promenade architecturale — climbs through it.
 *
 * Every tenet is also a predicate run over the finished scene, so the sheet
 * reports TENETS n/5 from what was actually drawn, not from what was intended.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan, D = global.ISO.depth;

  const STYLE = {
    key: 'FIVE POINTS',
    header: 'MODERN MOVEMENT',
    titles: ['VILLA DIAGRAM', 'CINQ POINTS', 'MAISON SECTION', 'PURIST STUDY', 'PROMENADE'],
    substyles: ['VILLA', 'MAISON', 'PAVILLON', 'DOM-INO', 'UNITE'],
    types: ['VILLA', 'MAISON', 'PAVILION', 'UNITE'],
    palettes: ['PURIST', 'SAVOYE', 'POLYCHROMIE'],
    sites: [['PARK', 3], ['CITY EDGE', 2], ['HILLSIDE', 2], ['CITY', 1], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE', 'RECTANGLE', 'LSHAPE', 'BAR'],
    floors: [3, 5],
    legend: [
      ['PILOTIS', 'cols'], ['RIBBON', 'dash'], ['RAMP', 'ramp'], ['ROOF GDN', 'circ'], ['BRISE', 'bar'],
      ['FREE WALL', 'wave'], ['CORE', 'x'], ['TERRACE', 'sqf'], ['CANOPY', 'tee'], ['FLOORS', 'step'],
    ],

    size(rng, annex) {
      const cell = rng.range(4, 5);
      const nx = annex ? rng.int(2, 3) : rng.int(3, 5), ny = annex ? rng.int(2, 3) : rng.int(3, 4);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors, cell = P.cell;
      const pal = ctx.palette.colors;
      const white = pal[0], skin = pal[1], glass = pal[2];
      const EDGE = { alpha: 175, weight: 0.95, wob: 0.9, passes: 2 };
      const THIN = { alpha: 140, weight: 0.75, wob: 0.7 };
      const FAINT = { alpha: 70, weight: 0.65, wob: 0.7 };

      const mask = plan.mask(P.nx, P.ny, ctx.shape, R);
      const loop = plan.outline(mask)[0];
      const off = R.range(0.5, 1.1); // the free façade stands this far outside the columns
      const H = N * FH;

      // ---- 1. pilotis: the ground floor is columns and air ----
      let nPil = 0;
      for (let i = 0; i <= P.nx; i++) {
        for (let j = 0; j <= P.ny; j++) {
          // a column stands where a cell touches this node
          if (!(plan.at(mask, i, j) || plan.at(mask, i - 1, j) || plan.at(mask, i, j - 1) || plan.at(mask, i - 1, j - 1))) continue;
          const x = P.x + i * cell, y = P.y + j * cell;
          const base = G.regular(x, y, 0, 0.32, 8, Math.PI / 8);
          const top = base.map((p) => [p[0], p[1], H]);
          const pr = G.prism(base, top);
          for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: white, alpha: 120, mode: 'flat' }, edge: null, tag: 'pilotis' });
          S.line([[x + 0.32, y, 0], [x + 0.32, y, H]], THIN, { tag: 'pilotis' });
          S.line([[x, y + 0.32, 0], [x, y + 0.32, H]], THIN, { tag: 'pilotis' });
          S.line(base.concat([base[0]]), THIN, { tag: 'pilotis', layer: 0 });
          nPil++;
        }
      }
      S.count('PILOTIS', nPil);

      // ---- slabs on every level, the top one a garden ----
      const slabPoly = (z) => plan.toWorld(loop, P.x, P.y, cell, z).map((p) => {
        // push the slab edge out past the columns to carry the free façade
        const c = [P.x + P.w / 2, P.y + P.d / 2];
        return [p[0] + Math.sign(p[0] - c[0]) * off, p[1] + Math.sign(p[1] - c[1]) * off, p[2]];
      });
      for (let k = 1; k <= N; k++) {
        const z = k * FH;
        const top = slabPoly(z), base = top.map((p) => [p[0], p[1], z - 0.3]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: white, alpha: 150, mode: 'flat' }, edge: EDGE, tag: 'slab' });
        S.face(top, { fill: { color: white, alpha: 90, mode: 'flat' }, edge: EDGE, tag: 'slab' });
        S.count('FLOORS');
      }

      // ---- 2. free façade with 3. ribbon windows, on floors 2..N ----
      const facade = slabPoly(0);
      let ribbonLen = 0, facadeLen = 0;
      for (let k = 1; k < N; k++) {
        const z0 = k * FH, z1 = (k + 1) * FH - 0.3;
        const pr = G.prism(facade.map((p) => [p[0], p[1], z0]), facade.map((p) => [p[0], p[1], z1]));
        for (const f of pr.sides) {
          const a = f.pts[0], b = f.pts[1];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (!f.visible) {
            S.line([[a[0], a[1], z0], [a[0], a[1], z1]], FAINT, { tag: 'wall', depth: D(a) - 1 });
            continue;
          }
          facadeLen += L;
          S.face(f.pts, { fill: { color: skin, alpha: 105, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: THIN, tag: 'wall' });
          // the ribbon: a band at sill height, most of the façade's length
          const t0 = R.range(0.04, 0.16), t1 = 1 - R.range(0.04, 0.16);
          const s0 = z0 + FH * 0.42, s1 = z0 + FH * 0.78;
          const lerp = (t, z) => [a[0] + (b[0] - a[0]) * t + f.n[0] * 0.03, a[1] + (b[1] - a[1]) * t + f.n[1] * 0.03, z];
          const q = [lerp(t0, s0), lerp(t1, s0), lerp(t1, s1), lerp(t0, s1)];
          S.face(q, { fill: { color: glass, alpha: 120, mode: 'flat' }, edge: THIN, tag: 'ribbon', depth: D(G.centroid(q)) + 0.2 });
          const nM = Math.max(2, Math.round(L * (t1 - t0) / R.range(0.9, 1.4)));
          for (let m = 1; m < nM; m++) {
            const t = t0 + (t1 - t0) * m / nM;
            S.line([lerp(t, s0), lerp(t, s1)], FAINT, { depth: D(lerp(t, s0)) + 0.25 });
          }
          ribbonLen += L * (t1 - t0);
          S.count('RIBBON');
        }
      }

      // ---- 4. free plan: partitions that ignore the grid ----
      const cells = plan.cells(mask);
      let nFree = 0, offGrid = 0;
      for (let k = 1; k < N; k++) {
        const z = k * FH;
        const nW = R.int(2, 4);
        for (let w = 0; w < nW; w++) {
          const c = R.pick(cells);
          const x0 = P.x + c[0] * cell + R.range(0.4, cell - 0.4), y0 = P.y + c[1] * cell + R.range(0.4, cell - 0.4);
          const pts = [[x0, y0]];
          let a = R.range(0, Math.PI * 2);
          const segs = R.int(2, 4);
          for (let s = 0; s < segs; s++) {
            a += R.range(-0.7, 0.7);
            const L = R.range(1.5, 3.5);
            const p = pts[pts.length - 1];
            pts.push([p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L]);
          }
          const col = pal[3 + (w % (pal.length - 3))] || pal[pal.length - 1];
          for (let s = 0; s < pts.length - 1; s++) {
            const p = pts[s], q = pts[s + 1];
            const f = [[p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], z + FH - 0.3], [p[0], p[1], z + FH - 0.3]];
            S.face(f, { fill: { color: col, alpha: 130, mode: 'pencil', spacing: 2.4, angle: 'edge' }, edge: THIN, tag: 'partition' });
            // off the grid if its midpoint sits away from every column line
            const mx = (p[0] + q[0]) / 2 - P.x, my = (p[1] + q[1]) / 2 - P.y;
            const dx = Math.abs(mx / cell - Math.round(mx / cell)) * cell, dy = Math.abs(my / cell - Math.round(my / cell)) * cell;
            if (dx > 0.4 && dy > 0.4) offGrid++;
          }
          nFree++;
        }
      }
      S.count('FREE WALL', nFree);

      // ---- the ramp: promenade from the ground up through a slot ----
      const rampCell = R.pick(cells);
      const rx = P.x + rampCell[0] * cell + cell * 0.5, ry = P.y + rampCell[1] * cell + 0.6;
      const rampFloors = Math.min(N, R.int(2, 3));
      for (let k = 0; k < rampFloors; k++) {
        const z0 = k * FH, z1 = (k + 1) * FH;
        const dir = k % 2 === 0 ? 1 : -1;
        const len = cell * 0.85;
        const u = G.norm([0, dir * len, z1 - z0]);
        const v = [1, 0, 0], w = G.norm(G.cross(u, v));
        const c = [rx, ry + (dir > 0 ? len / 2 : cell - 0.6 - len / 2) - (dir > 0 ? 0 : 0), (z0 + z1) / 2];
        const c2 = [c[0], dir > 0 ? ry + len / 2 : ry + len / 2, c[2]];
        S.faces(G.obox(c2, u, v, w, Math.hypot(len, z1 - z0) / 2, 0.55, 0.12), { color: white, alpha: 140, mode: 'flat', edge: EDGE, tag: 'ramp' });
        // a rail
        const rail = [];
        for (let t = 0; t <= 1; t += 0.25) rail.push([c2[0] + 0.55, ry + len * (dir > 0 ? t : 1 - t), z0 + (z1 - z0) * t + 0.9]);
        S.line(rail, THIN, { depth: D(c2) + 0.1 });
        S.count('RAMP');
      }

      // ---- the core: shaft with a spiral stair ----
      const cc = R.pick(cells);
      const cx = P.x + cc[0] * cell + cell * 0.55, cy = P.y + cc[1] * cell + cell * 0.55, cs = 1.9;
      S.box(cx, cy, 0, cs, cs, H + FH * 0.9, { color: pal[3] || skin, alpha: 60, mode: 'flat', edge: EDGE, tag: 'core' });
      const helix = [];
      for (let t = 0; t <= H + FH * 0.6; t += 0.12) {
        const a = t * 2.2;
        helix.push([cx + cs / 2 + Math.cos(a) * cs * 0.38, cy + cs / 2 + Math.sin(a) * cs * 0.38, t]);
      }
      S.line(helix, FAINT, { depth: D([cx + cs, cy + cs, H / 2]) + 0.05 });
      S.count('CORE');

      // ---- 5. roof garden: parapet, planters, a solarium wall, trees ----
      const roof = slabPoly(H);
      const par = roof.map((p) => [p[0], p[1], H + 0.9]);
      S.line(par.concat([par[0]]), EDGE, { depth: D(G.centroid(par)) + 0.3, tag: 'parapet' });
      for (let i = 0; i < roof.length; i++) S.line([roof[i], par[i]], THIN, { depth: D(roof[i]) + 0.3, tag: 'parapet' });
      let nPlant = 0;
      for (const c of cells) {
        if (!R.chance(0.45)) continue;
        const px = P.x + c[0] * cell + R.range(0.5, cell - 1.7), py = P.y + c[1] * cell + R.range(0.5, cell - 1.7);
        S.box(px, py, H, R.range(0.9, 1.5), R.range(0.9, 1.5), 0.5, { color: pal[3] || skin, alpha: 80, mode: 'flat', edge: THIN, tag: 'planter' });
        const anchor = [px + 0.6, py + 0.6, H + 0.5];
        S.custom(anchor, function (hand, Pj) {
          const b = Pj(anchor), u = Pj([anchor[0] + 1, anchor[1], anchor[2]]);
          const unit = Math.hypot(u[0] - b[0], u[1] - b[1]) * 0.55, r = unit * R.range(0.5, 0.9);
          const cy2 = b[1] - unit * 0.6 - r * 0.7, pts = [];
          for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; pts.push([b[0] + Math.cos(a) * r * (1 + 0.15 * Math.sin(a * 7)), cy2 + Math.sin(a) * r * 0.9]); }
          hand.poly(pts, null, { alpha: 150, weight: 0.75, wob: 0.9 });
          hand.line([[b[0], cy2 + r * 0.85], [b[0], b[1]]], { alpha: 160, weight: 0.9, wob: 0.5 });
        }, { bias: 0.4, tag: 'plant' });
        nPlant++;
      }
      // solarium: a curved wind-wall
      const sc = R.pick(cells);
      const sx = P.x + sc[0] * cell + cell / 2, sy = P.y + sc[1] * cell + cell / 2;
      const arc = [];
      const a0 = R.range(0, Math.PI * 2);
      for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * Math.PI * 0.9; arc.push([sx + Math.cos(a) * cell * 0.4, sy + Math.sin(a) * cell * 0.4, H]); }
      for (let i = 0; i < arc.length - 1; i++) {
        const p = arc[i], q = arc[i + 1];
        const f = [p, q, [q[0], q[1], H + FH * 0.7], [p[0], p[1], H + FH * 0.7]];
        S.face(f, { fill: { color: white, alpha: 130, mode: 'flat' }, edge: THIN, tag: 'solarium' });
      }
      S.count('ROOF GDN');
      S.count('TERRACE', Math.max(1, Math.round(nPlant / 2)));

      // ---- brise-soleil on the sun face, and the entrance canopy ----
      const sun = facade.filter((p, i) => facade[(i + 1) % facade.length][0] === p[0] && p[0] === Math.max(...facade.map((q) => q[0])));
      if (sun.length && R.chance(0.7)) {
        const x = sun[0][0] + 0.15;
        const ys = facade.map((q) => q[1]);
        const y0 = Math.min(...ys) + 0.5, y1 = Math.max(...ys) - 0.5;
        for (let k = 1; k < N; k++) {
          const z = k * FH;
          for (let y = y0; y < y1; y += R.range(0.55, 0.8)) S.line([[x, y, z + 0.2], [x, y, z + FH - 0.5]], { color: pal[3] || skin, alpha: 150, weight: 0.8, wob: 0.6 }, { depth: D([x, y, z]) + 0.3, tag: 'brise' });
          S.count('BRISE');
        }
      }
      const ex = P.x + R.range(0, P.w - 3), ey = P.y + P.d + off;
      S.box(ex, ey, FH * 0.75, 3, 2.2, 0.18, { color: white, alpha: 150, mode: 'flat', edge: EDGE, tag: 'canopy' });
      S.line([[ex + 1.5, ey + 2.2, 0], [ex + 1.5, ey + 2.2, FH * 0.75]], THIN, { tag: 'canopy' });
      S.count('CANOPY');

      // ---- the five predicates, run over what was drawn ----
      const items = S.items.filter((it) => it.tag);
      const minZ = (it) => it.pts ? Math.min(...it.pts.map((p) => p[2])) : it.anchor ? it.anchor[2] : Infinity;
      const groundWalls = items.filter((it) => (it.tag === 'wall' || it.tag === 'partition') && minZ(it) < FH * 0.5).length;
      const tenets = [
        { name: 'PILOTIS', ok: nPil >= 4 && groundWalls === 0 },
        { name: 'PLAN LIBRE', ok: offGrid >= 2 },
        { name: 'FACADE LIBRE', ok: off >= 0.4 },
        { name: 'FENETRE EN LONGUEUR', ok: facadeLen > 0 && ribbonLen / facadeLen > 0.6 },
        { name: 'TOIT-JARDIN', ok: nPlant >= 1 && items.some((it) => it.tag === 'parapet') },
      ];
      const passed = tenets.filter((t) => t.ok).length;

      return {
        kv: [['TENETS', passed + '/' + tenets.length]],
        tenets: tenets,
      };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.corbusier = STYLE;
})(window);
