/*
 * styles/mexican.js — MEXICAN MODERN: the patio mat.
 *
 * A grid of cells, each a room, a patio or a pool. Walls stand on the cell
 * edges as tall coloured planes — some run on past the plan as freestanding
 * screens — pierced by openings (vano) and slit by light (luz). Thin slabs
 * with a roof mesh cap the rooms; one cell rises as a tower; stairs, stone
 * plinths, a lattice screen and solid masses finish the vocabulary.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan;

  const STYLE = {
    key: 'MEXICAN MODERN',
    header: 'ISOMETRIC STRATA',
    titles: ['EMOTIONAL ARCHITECTURE', 'PATIO DIAGRAM', 'MURO Y LUZ', 'CASA ESTUDIO', 'CUADRA SECTION'],
    substyles: ['PATIO MAT', 'CUADRA', 'CAPILLA', 'JARDIN', 'CASA PATIO'],
    types: ['PATIO', 'CASA', 'CUADRA', 'CAPILLA'],
    palettes: ['TLALPAN', 'ROSA', 'CAL', 'AZUL'],
    sites: [['CITY', 3], ['PLAZA DIST', 2], ['HILLSIDE', 2], ['PARK', 1], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE', 'RECTANGLE', 'LSHAPE', 'COURT', 'CORNER'],
    floors: [3, 6],
    legend: [
      ['MURO', 'sq'], ['PATIO', 'sqf'], ['AGUA', 'wave'], ['CELOSIA', 'grid'], ['LUZ', 'bar'],
      ['TORRE', 'tee'], ['MASA', 'sqh'], ['GRADA', 'step'], ['PIEDRA', 'diag'], ['VANO', 'sq'],
    ],

    size(rng, annex) {
      const cell = rng.range(4, 5);
      const nx = annex ? rng.int(2, 3) : rng.int(4, 6), ny = annex ? rng.int(2, 3) : rng.int(4, 6);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const cell = P.cell, nx = P.nx, ny = P.ny;
      const FH = ctx.floorH;
      const floors = ctx.floors;
      const pal = ctx.palette.colors;
      const paper = [238, 232, 218];
      const mask = plan.mask(nx, ny, ctx.shape, R);

      const wallColor = () => R.weighted(pal.map((c, i) => [c, i === 0 ? 4 : i === 1 ? 2 : 1]));
      const EDGE = { alpha: 165, weight: 0.95, wob: 1, passes: 2 };
      const LIGHT = { alpha: 80, weight: 0.7, wob: 0.7 };

      // cell roles and levels
      const role = [], lev = [];
      for (let i = 0; i < nx; i++) {
        role.push([]); lev.push([]);
        for (let j = 0; j < ny; j++) {
          if (!mask[i][j]) { role[i].push(null); lev[i].push(0); continue; }
          const r = R.weighted([['ROOM', 6], ['PATIO', 3], ['AGUA', ctx.annex ? 0 : 1]]);
          role[i].push(r);
          const maxL = Math.max(1, floors - 2);
          lev[i].push(r === 'ROOM' ? Math.min(maxL, R.weighted([[1, 4], [2, 3], [3, 2], [4, 1]])) : 0);
        }
      }
      const roleAt = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? role[i][j] : null);
      const levAt = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? lev[i][j] : 0);

      // ---- walls on cell edges ----
      const T = 0.35;
      function wall(x, y, along, len, h, color) {
        // along 'x': the wall runs in x (thin in y); 'y': runs in y (thin in x)
        const w = along === 'x' ? len : T, d = along === 'x' ? T : len;
        const bx = along === 'x' ? x : x - T / 2, by = along === 'x' ? y - T / 2 : y;
        S.box(bx, by, 0, w, d, h, { color: color, alpha: 120, mode: 'pencil', edge: EDGE, spacing: 2.4 });
        S.count('MURO');
        // openings and light slits on the visible face
        if (h >= FH * 0.9) {
          const nOpen = R.int(0, 2);
          for (let k = 0; k < nOpen; k++) {
            const t = R.range(0.1, 0.65), ow = len * R.range(0.15, 0.3);
            const lvl = R.int(0, Math.max(0, Math.floor(h / FH) - 1));
            const z0 = lvl * FH + R.range(0.6, 1.2), oh = Math.min(h - z0 - 0.4, R.range(1.2, 2.2));
            if (oh < 0.6) continue;
            let f;
            if (along === 'x') f = [[x + len * t, by + d + 0.02, z0], [x + len * t + ow, by + d + 0.02, z0], [x + len * t + ow, by + d + 0.02, z0 + oh], [x + len * t, by + d + 0.02, z0 + oh]];
            else f = [[bx + w + 0.02, y + len * t, z0], [bx + w + 0.02, y + len * t + ow, z0], [bx + w + 0.02, y + len * t + ow, z0 + oh], [bx + w + 0.02, y + len * t, z0 + oh]];
            S.face(f, { fill: { color: paper, alpha: 200, mode: 'flat' }, edge: { alpha: 150, weight: 0.8, wob: 0.6 }, depth: global.ISO.depth(f[0]) + 0.3 });
            S.count('VANO');
          }
          if (R.chance(0.35)) {
            const t = R.range(0.1, 0.85), sw = 0.22;
            let f;
            if (along === 'x') f = [[x + len * t, by + d + 0.03, 0.3], [x + len * t + sw, by + d + 0.03, 0.3], [x + len * t + sw, by + d + 0.03, h + 0.01], [x + len * t, by + d + 0.03, h + 0.01]];
            else f = [[bx + w + 0.03, y + len * t, 0.3], [bx + w + 0.03, y + len * t + sw, 0.3], [bx + w + 0.03, y + len * t + sw, h + 0.01], [bx + w + 0.03, y + len * t, h + 0.01]];
            S.face(f, { fill: { color: [250, 246, 236], alpha: 235, mode: 'flat' }, edge: { alpha: 90, weight: 0.6, wob: 0.4 }, depth: global.ISO.depth(f[0]) + 0.31 });
            S.count('LUZ');
          }
        }
      }

      // edges running in y (thin in x) at x = P.x + i*cell
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j < ny; j++) {
          const a = roleAt(i - 1, j), b = roleAt(i, j);
          if (!a && !b) continue;
          const la = levAt(i - 1, j), lb = levAt(i, j);
          const L = Math.max(la, lb);
          let h = L * FH;
          if (L === 0) { if (!R.chance(0.4)) continue; h = R.range(1.8, 2.6); } // garden wall
          else if (!R.chance(0.82)) continue;
          let y0 = P.y + j * cell, len = cell;
          if ((!a || !b) && R.chance(0.34)) { // freestanding: run past the plan
            const ext = cell * R.range(0.6, 2.2);
            if (R.chance(0.5)) y0 -= ext; len += ext; h *= R.range(1.05, 1.3);
          }
          wall(P.x + i * cell, y0, 'y', len, h, wallColor());
        }
      }
      // edges running in x (thin in y) at y = P.y + j*cell
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
          const a = roleAt(i, j - 1), b = roleAt(i, j);
          if (!a && !b) continue;
          const la = levAt(i, j - 1), lb = levAt(i, j);
          const L = Math.max(la, lb);
          let h = L * FH;
          if (L === 0) { if (!R.chance(0.4)) continue; h = R.range(1.8, 2.6); }
          else if (!R.chance(0.82)) continue;
          let x0 = P.x + i * cell, len = cell;
          if ((!a || !b) && R.chance(0.34)) {
            const ext = cell * R.range(0.6, 2.2);
            if (R.chance(0.5)) x0 -= ext; len += ext; h *= R.range(1.05, 1.3);
          }
          wall(x0, P.y + j * cell, 'x', len, h, wallColor());
        }
      }

      // ---- slabs with roof mesh, patios, water ----
      const rooms = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const r = role[i][j];
          if (!r) continue;
          const x = P.x + i * cell, y = P.y + j * cell;
          if (r === 'ROOM') {
            rooms.push([i, j]);
            for (let k = 1; k <= lev[i][j]; k++) {
              const z = k * FH;
              S.box(x + 0.1, y + 0.1, z - 0.22, cell - 0.2, cell - 0.2, 0.22, { color: paper, alpha: 120, mode: 'flat', edge: { alpha: 120, weight: 0.8, wob: 0.8 } });
              if (k === lev[i][j]) {
                const st = R.range(0.7, 1.0);
                for (let gx = x + st; gx < x + cell - 0.05; gx += st) S.line([[gx, y + 0.1, z + 0.01], [gx, y + cell - 0.1, z + 0.01]], LIGHT, { depth: global.ISO.depth([gx, y + cell, z]) + 0.02 });
                for (let gy = y + st; gy < y + cell - 0.05; gy += st) S.line([[x + 0.1, gy, z + 0.01], [x + cell - 0.1, gy, z + 0.01]], LIGHT, { depth: global.ISO.depth([x + cell, gy, z]) + 0.02 });
              }
            }
          } else if (r === 'PATIO') {
            const st = R.range(0.6, 1.1);
            for (let gx = x + st; gx < x + cell - 0.05; gx += st) S.line([[gx, y, 0.01], [gx, y + cell, 0.01]], LIGHT, { layer: 0 });
            for (let gy = y + st; gy < y + cell - 0.05; gy += st) S.line([[x, gy, 0.01], [x + cell, gy, 0.01]], LIGHT, { layer: 0 });
            S.count('PATIO');
            if (R.chance(0.3)) global.Site.tree(ctx, x + cell / 2 + R.range(-1, 1), y + cell / 2 + R.range(-1, 1), R.range(0.9, 1.4));
          } else if (r === 'AGUA') {
            const inset = 0.5;
            S.face(G.rect(x + inset, y + inset, 0.03, cell - inset * 2, cell - inset * 2), { fill: { color: ctx.palette.water || [108, 128, 150], alpha: 110, mode: 'pencil', spacing: 2, angle: 'edge' }, edge: { alpha: 150, weight: 0.8, wob: 0.6 }, layer: 0 });
            for (let k = 1; k <= 3; k++) {
              const yy = y + inset + (cell - inset * 2) * k / 4;
              S.line([[x + inset + 0.4, yy, 0.04], [x + cell - inset - 0.4, yy + R.range(-0.2, 0.2), 0.04]], { alpha: 90, weight: 0.6, wob: 1.2 }, { layer: 0 });
            }
            S.count('AGUA');
          }
        }
      }

      // ---- tower ----
      const nT = ctx.annex ? (R.chance(0.4) ? 1 : 0) : R.chance(0.35) ? 2 : 1;
      const used = new Set();
      for (let t = 0; t < nT && rooms.length; t++) {
        const c = R.pick(rooms);
        if (used.has(c.join())) continue;
        used.add(c.join());
        const x = P.x + c[0] * cell + 0.3, y = P.y + c[1] * cell + 0.3, s = cell - 0.6;
        const h = floors * FH * (t === 0 ? 1 : R.range(0.7, 0.9));
        const col = wallColor();
        S.box(x, y, 0, s, s, h, { color: col, alpha: 115, mode: 'pencil', edge: EDGE, spacing: 2.4 });
        // a lighter inner shaft, the roof mesh and a slit
        S.box(x + s * 0.3, y + s * 0.3, 0, s * 0.4, s * 0.4, h + 0.3, { color: null, edge: { alpha: 90, weight: 0.7, wob: 0.8 } });
        const st = 0.6;
        for (let gx = x + st; gx < x + s; gx += st) S.line([[gx, y, h + 0.01], [gx, y + s, h + 0.01]], LIGHT, { depth: global.ISO.depth([gx, y + s, h]) + 0.02 });
        for (let gy = y + st; gy < y + s; gy += st) S.line([[x, gy, h + 0.01], [x + s, gy, h + 0.01]], LIGHT, { depth: global.ISO.depth([x + s, gy, h]) + 0.02 });
        const f = [[x + s + 0.03, y + s * 0.45, 0.4], [x + s + 0.03, y + s * 0.45 + 0.25, 0.4], [x + s + 0.03, y + s * 0.45 + 0.25, h - 0.4], [x + s + 0.03, y + s * 0.45, h - 0.4]];
        S.face(f, { fill: { color: [250, 246, 236], alpha: 235, mode: 'flat' }, edge: { alpha: 90, weight: 0.6, wob: 0.4 }, depth: global.ISO.depth(f[0]) + 0.3 });
        S.count('LUZ');
        S.count('TORRE');
      }

      // ---- masses, stone, lattice, stairs ----
      const nM = R.int(1, ctx.annex ? 1 : 3);
      for (let k = 0; k < nM && rooms.length; k++) {
        const c = R.pick(rooms);
        const w = cell * R.range(0.4, 0.75), d = cell * R.range(0.4, 0.75);
        const x = P.x + c[0] * cell + R.range(0.2, cell - w - 0.2), y = P.y + c[1] * cell + R.range(0.2, cell - d - 0.2);
        S.box(x, y, 0, w, d, FH * R.range(0.8, 1.6), { color: wallColor(), alpha: 200, mode: 'pencil', edge: EDGE, spacing: 2.2 });
        S.count('MASA');
      }
      const nP = R.int(1, 2);
      for (let k = 0; k < nP; k++) {
        const side = R.int(0, 3);
        const w = R.range(1.5, 3.5), d = R.range(1.5, 3.5);
        const x = side === 0 ? P.x - w - 0.5 : side === 1 ? P.x + P.w + 0.5 : P.x + R.range(0, P.w - w);
        const y = side === 2 ? P.y - d - 0.5 : side === 3 ? P.y + P.d + 0.5 : P.y + R.range(0, P.d - d);
        S.box(x, y, 0, w, d, R.range(0.6, 1.6), { color: [118, 116, 110], alpha: 170, mode: 'hatch', spacing: 2.6, angle: 'edge', edge: EDGE });
        S.count('PIEDRA');
      }
      const nC = R.int(1, 2);
      for (let k = 0; k < nC && rooms.length; k++) {
        const c = R.pick(rooms);
        const x = P.x + c[0] * cell, y = P.y + c[1] * cell;
        const h = Math.max(1, lev[c[0]][c[1]]) * FH;
        const along = R.chance(0.5);
        const st = R.range(0.35, 0.55);
        const yy = y + cell + 0.06, xx = x + cell + 0.06;
        for (let t = 0.3; t < cell - 0.2; t += st) {
          if (along) S.line([[x + t, yy, 0.2], [x + t, yy, h - 0.2]], { alpha: 130, weight: 0.7, wob: 0.5 }, { depth: global.ISO.depth([x + t, yy, h]) + 0.05 });
          else S.line([[xx, y + t, 0.2], [xx, y + t, h - 0.2]], { alpha: 130, weight: 0.7, wob: 0.5 }, { depth: global.ISO.depth([xx, y + t, h]) + 0.05 });
        }
        for (let z = 0.2 + st; z < h - 0.2; z += st) {
          if (along) S.line([[x + 0.3, yy, z], [x + cell - 0.2, yy, z]], { alpha: 130, weight: 0.7, wob: 0.5 }, { depth: global.ISO.depth([x + cell, yy, z]) + 0.05 });
          else S.line([[xx, y + 0.3, z], [xx, y + cell - 0.2, z]], { alpha: 130, weight: 0.7, wob: 0.5 }, { depth: global.ISO.depth([xx, y + cell, z]) + 0.05 });
        }
        S.count('CELOSIA');
      }
      const nG = R.int(1, 3);
      for (let k = 0; k < nG && rooms.length; k++) {
        const c = R.pick(rooms);
        const steps = R.int(5, 9);
        const rise = FH / steps, run = R.range(0.28, 0.36), wS = cell * R.range(0.28, 0.4);
        const x = P.x + c[0] * cell + R.range(0.2, cell - wS - 0.2), y = P.y + c[1] * cell + 0.2;
        const along = R.chance(0.5);
        for (let s = 0; s < steps; s++) {
          if (along) S.box(x, y + s * run, 0, wS, run, (s + 1) * rise, { color: [150, 146, 136], alpha: 80, mode: 'flat', edge: { alpha: 140, weight: 0.7, wob: 0.6 } });
          else S.box(x + s * run, y, 0, run, wS, (s + 1) * rise, { color: [150, 146, 136], alpha: 80, mode: 'flat', edge: { alpha: 140, weight: 0.7, wob: 0.6 } });
        }
        S.count('GRADA');
      }

      return {
        kv: [['STRUCT', R.pick(['MODERATE', 'MASSIVE', 'LIGHT'])]],
      };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.mexican = STYLE;
})(window);
