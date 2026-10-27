/*
 * styles/decon.js — DECONSTRUCTIVIST: the crystalline tower.
 *
 * A sheared prism — its top plan rotated, scaled and slid off its base — with
 * every visible face ruled in dense hatching that follows the shear. Around it
 * a bundle of thin columns, a spine of floating tilted planes and screens,
 * ramps, cantilevered beams, open frames with x-bracing, and one or two
 * leaning shards. Monochrome: tone is line density, never colour.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan, D = global.ISO.depth;

  const STYLE = {
    key: 'DECON',
    header: 'DECONSTRUCTIVIST',
    titles: ['DECON DIAGRAM', 'FRACTURE STUDY', 'SHARD SECTION', 'TILT ASSEMBLY', 'SPLINTER TOWER'],
    substyles: ['CRYSTALLINE', 'FRACTURED', 'TILTED', 'SPLINTER', 'FOLDED'],
    types: ['TOWER', 'PAVILION', 'SLAB', 'GALLERY'],
    palettes: ['MONOCHROME', 'GRAPHITE', 'CARBON', 'SEPIA'],
    sites: [['CITY EDGE', 3], ['CITY', 3], ['PLAZA DIST', 1], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE', 'TSHAPE', 'LSHAPE', 'STEPPED', 'BAR'],
    floors: [5, 10],
    legend: [
      ['GRID', 'grid'], ['SHARDS', 'tri'], ['PLANES', 'diag'], ['RAMPS', 'ramp'], ['FRAMES', 'sq'],
      ['VOLUMES', 'sqh'], ['CANTLVR', 'tee'], ['BRACING', 'x'], ['SCREENS', 'grid'], ['FLOORS', 'dash'],
    ],

    size(rng, annex) {
      const cell = rng.range(3, 4);
      const nx = annex ? rng.int(2, 3) : rng.int(3, 4), ny = annex ? rng.int(2, 3) : rng.int(3, 4);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, H = ctx.floors * FH;
      const ink = ctx.palette.colors[0];
      const tone = ctx.palette.colors[1];
      const EDGE = { alpha: 190, weight: 1.0, wob: 1, passes: 2 };
      const THIN = { alpha: 150, weight: 0.8, wob: 0.8 };
      const FAINT = { alpha: 60, weight: 0.7, wob: 0.8 };
      const dens = ctx.detail;

      const mask = plan.mask(P.nx, P.ny, ctx.shape, R);
      const loops = plan.outline(mask);
      const base = plan.toWorld(loops[0], P.x, P.y, P.cell, 0);
      const cx = P.x + P.w / 2, cy = P.y + P.d / 2;

      // ---- the volume: sheared prism ----
      function volume(basePoly, z0, h, strength, alpha) {
        const ang = R.range(-0.22, 0.22) * strength, sx = R.range(0.8, 1.2), sy = R.range(0.8, 1.2);
        const tx = R.range(-0.28, 0.28) * P.w * strength, ty = R.range(-0.28, 0.28) * P.d * strength;
        const c = G.centroid(basePoly);
        const top = basePoly.map((p) => {
          const q = G.rotZ([(p[0] - c[0]) * sx + c[0], (p[1] - c[1]) * sy + c[1], 0], ang, c[0], c[1]);
          return [q[0] + tx, q[1] + ty, z0 + h];
        });
        const bz = basePoly.map((p) => [p[0], p[1], z0]);
        const pr = G.prism(bz, top);
        const sp = R.range(2.4, 3.4);
        for (const f of pr.sides) {
          if (!f.visible) {
            S.line([f.pts[0], f.pts[3]], FAINT, { depth: D(f.pts[0]) - 0.5 });
            S.line([f.pts[0], f.pts[1]], FAINT, { depth: D(f.pts[0]) - 0.5 });
            continue;
          }
          const k = f.n[0] > f.n[1] ? 1 : 0.85;
          S.face(f.pts, { fill: { color: G.shade(tone, k), alpha: alpha, mode: 'hatch', spacing: sp * (f.n[0] > f.n[1] ? 1 : 1.35), angle: 'side' }, edge: EDGE });
        }
        S.face(top, { fill: R.chance(0.6) ? { color: tone, alpha: alpha * 0.5, mode: 'hatch', spacing: sp * 1.6, angle: 'edge' } : null, edge: EDGE });
        S.count('VOLUMES');
        // floor plates: the section between base and top, dashed
        const n = Math.round(h / FH);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const sec = bz.map((p, i) => [p[0] + (top[i][0] - p[0]) * t, p[1] + (top[i][1] - p[1]) * t, z0 + h * t]);
          S.line(sec.concat([sec[0]]), { alpha: 70, weight: 0.7, wob: 0.7, dash: [7, 5] }, { depth: D(G.centroid(sec)) + 0.4 });
          S.count('FLOORS');
        }
        return { top: top, base: bz, sides: pr.sides };
      }

      const main = volume(base, 0, H, 1, 150);
      if (!ctx.annex && R.chance(0.45)) {
        const w = P.w * R.range(0.3, 0.5), d = P.d * R.range(0.3, 0.5);
        const b2 = G.rect(P.x + R.range(-w * 0.5, P.w - w * 0.5), P.y + R.range(-d * 0.5, P.d - d * 0.5), 0, w, d);
        volume(b2, 0, H * R.range(0.35, 0.7), 1.4, 90);
      }

      // ---- column bundle (the grid) and the spine ----
      const side = R.pick([[-1, 0], [0, -1], [-1, -1]]);
      const bx = P.x + (side[0] < 0 ? -R.range(1, 3) : P.w * R.range(0.2, 0.6));
      const by = P.y + (side[1] < 0 ? -R.range(1, 3) : P.d * R.range(0.2, 0.6));
      const nCol = R.int(8, 16);
      const tops = [];
      for (let i = 0; i < nCol; i++) {
        const x = bx + R.gauss() * 1.2, y = by + R.gauss() * 1.2;
        const h = H * R.range(0.55, 1.25);
        S.box(x, y, 0, 0.28, 0.28, h, { color: null, edge: THIN });
        tops.push([x + 0.14, y + 0.14, h]);
      }
      // bracing between column tops
      for (let i = 0; i + 1 < tops.length; i += 2) {
        S.line([tops[i], tops[i + 1]], FAINT, { depth: D(tops[i]) });
        S.count('BRACING');
      }
      S.count('GRID');
      const spine = [bx + R.range(-1, 1), by + R.range(-1, 1)];
      const spineH = H * R.range(1.05, 1.25);
      S.line([[spine[0], spine[1], 0], [spine[0], spine[1], spineH]], { alpha: 210, weight: 1.4, wob: 0.6 }, { depth: D([spine[0], spine[1], spineH * 0.5]) });

      // ---- planes and screens hung on the spine ----
      const nPl = Math.round(R.int(5, 11) * (ctx.annex ? 0.5 : 1));
      for (let i = 0; i < nPl; i++) {
        const c = [spine[0] + R.range(-3, 3), spine[1] + R.range(-3, 3), spineH * R.range(0.12, 1.0)];
        const n = G.norm([R.gauss(), R.gauss(), R.gauss() * 0.7]);
        let u = G.cross(n, [0, 0, 1]);
        if (G.len(u) < 1e-3) u = [1, 0, 0];
        u = G.norm(u);
        const v = G.norm(G.cross(n, u));
        const q = G.quad(c, u, v, R.range(1.4, 4), R.range(1, 3));
        const screen = R.chance(0.3);
        S.face(q, { fill: screen ? null : R.chance(0.5) ? { color: tone, alpha: 60, mode: 'flat' } : { color: tone, alpha: 110, mode: 'hatch', spacing: 3.2, angle: 'edge' }, edge: EDGE });
        if (screen) {
          const nu = R.int(4, 8), nv = R.int(3, 6);
          for (let k = 1; k < nu; k++) { const t = k / nu; S.line([G.add(q[0], G.mul(G.sub(q[1], q[0]), t)), G.add(q[3], G.mul(G.sub(q[2], q[3]), t))], FAINT, { depth: D(c) + 0.05 }); }
          for (let k = 1; k < nv; k++) { const t = k / nv; S.line([G.add(q[0], G.mul(G.sub(q[3], q[0]), t)), G.add(q[1], G.mul(G.sub(q[2], q[1]), t))], FAINT, { depth: D(c) + 0.05 }); }
          S.count('SCREENS');
        } else S.count('PLANES');
        // a tie back to the spine
        S.line([c, [spine[0], spine[1], c[2] + R.range(-0.5, 0.5)]], FAINT, { depth: D(c) });
      }

      // ---- ramps: long thin tilted slabs ----
      const nR = Math.round(R.int(4, 12) * (dens >= 2 ? 1.4 : 1) * (ctx.annex ? 0.4 : 1));
      for (let i = 0; i < nR; i++) {
        const a = R.range(0, Math.PI * 2), slope = R.range(-0.35, 0.35);
        const u = G.norm([Math.cos(a), Math.sin(a), slope]);
        const v = G.norm(G.cross([0, 0, 1], u));
        const w = G.norm(G.cross(u, v));
        const c = [cx + R.range(-P.w * 0.7, P.w * 0.7), cy + R.range(-P.d * 0.7, P.d * 0.7), H * R.range(0.05, 0.95)];
        const faces = G.obox(c, u, v, w, R.range(3, 8), R.range(0.5, 0.9), 0.12);
        S.faces(faces, { color: tone, alpha: 70, mode: 'flat', edge: THIN });
        S.count('RAMPS');
      }

      // ---- cantilevers: beams out of the volume's faces ----
      const nC = Math.round(R.int(4, 12) * (ctx.annex ? 0.4 : 1));
      const vis = main.sides.filter((f) => f.visible);
      for (let i = 0; i < nC && vis.length; i++) {
        const f = R.pick(vis);
        const t = R.range(0.1, 0.9), zt = R.range(0.15, 0.95);
        const p0 = G.add(G.mul(f.pts[0], 1 - t), G.mul(f.pts[1], t));
        const p1 = G.add(G.mul(f.pts[3], 1 - t), G.mul(f.pts[2], t));
        const start = G.add(G.mul(p0, 1 - zt), G.mul(p1, zt));
        const L = R.range(2.5, 6.5);
        const u = [f.n[0], f.n[1], R.range(-0.15, 0.15)];
        const un = G.norm(u);
        const c = G.add(start, G.mul(un, L / 2 - 0.4));
        const v = G.norm(G.cross([0, 0, 1], un)), w = G.norm(G.cross(un, v));
        const faces = G.obox(c, un, v, w, L / 2, R.range(0.15, 0.3), R.range(0.2, 0.45));
        S.faces(faces, { color: tone, alpha: 90, mode: 'flat', edge: THIN });
        S.count('CANTLVR');
      }

      // ---- frames with bracing ----
      const nF = R.int(2, 4);
      for (let i = 0; i < nF; i++) {
        const c = [cx + R.range(-P.w, P.w), cy + R.range(-P.d, P.d), H * R.range(0.1, 0.8)];
        const n = G.norm([R.gauss(), R.gauss(), R.gauss() * 0.5]);
        let u = G.cross(n, [0, 0, 1]); if (G.len(u) < 1e-3) u = [1, 0, 0]; u = G.norm(u);
        const v = G.norm(G.cross(n, u));
        const hu = R.range(1.5, 4), hv = R.range(1.5, 3.5);
        const q = G.quad(c, u, v, hu, hv);
        // four members as thin oriented boxes
        for (let k = 0; k < 4; k++) {
          const a = q[k], b = q[(k + 1) % 4];
          const m = G.mul(G.add(a, b), 0.5);
          const e = G.norm(G.sub(b, a));
          const faces = G.obox(m, e, n, G.norm(G.cross(e, n)), G.len(G.sub(b, a)) / 2, 0.08, 0.14);
          S.faces(faces, { color: null, edge: THIN });
        }
        S.count('FRAMES');
        if (R.chance(0.7)) {
          S.line([q[0], q[2]], THIN, { depth: D(c) + 0.02 });
          S.line([q[1], q[3]], THIN, { depth: D(c) + 0.02 });
          S.count('BRACING');
        }
      }

      // ---- shards: leaning triangular prisms ----
      const nS = R.int(1, 3);
      for (let i = 0; i < nS; i++) {
        const ox = cx + R.range(-P.w * 0.9, P.w * 0.9), oy = cy + R.range(-P.d * 0.9, P.d * 0.9);
        const r = R.range(1, 2.6);
        const b = G.regular(ox, oy, 0, r, 3, R.range(0, 3));
        const hz = H * R.range(0.35, 0.95);
        const lean = [R.range(-3, 3), R.range(-3, 3)];
        const top = b.map((p) => [(p[0] - ox) * 0.35 + ox + lean[0], (p[1] - oy) * 0.35 + oy + lean[1], hz]);
        const pr = G.prism(b, top);
        for (const f of pr.sides) {
          if (!f.visible) continue;
          S.face(f.pts, { fill: { color: tone, alpha: 170, mode: 'hatch', spacing: 2.2, angle: 'side' }, edge: EDGE });
        }
        S.face(top, { fill: null, edge: EDGE });
        S.count('SHARDS');
      }

      return {
        kv: [['CIRC', R.pick(['LABYRINTHINE', 'LOOPED', 'SPLIT', 'SPIRAL'])]],
      };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.decon = STYLE;
})(window);
