/*
 * styles/destijl.js — DE STIJL: the sliding planes.
 *
 * Rietveld's Schröder house and Van Doesburg's counter-constructions as a
 * grammar: the building is not a box but a set of rectangular planes that
 * slide past one another. At every corner one plane wins and runs on past
 * the other, which stops short and leaves a void or a pane of glass. Slabs
 * overrun the volume; thin posts stand free where the planes were pulled
 * apart; rails, balconies and joints carry the primaries. Large planes stay
 * white, grey or black — colour is an element, never a surface.
 *
 * Five tenets from Van Doesburg's "Towards a plastic architecture" (1924)
 * are run as predicates over the drawn scene and reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan, D = global.ISO.depth;

  const STYLE = {
    key: 'DE STIJL',
    header: 'NEOPLASTIC',
    titles: ['DE STIJL DIAGRAM', 'NEOPLASTIC STUDY', 'COUNTER-CONSTRUCTION', 'SLIDING PLANES', 'MAISON PARTICULIERE'],
    substyles: ['SCHRODER', 'COUNTER', 'ELEMENTARIST', 'PLANAR', 'ARTIST HOUSE'],
    types: ['HOUSE', 'STUDIO', 'PAVILION', 'VILLA'],
    palettes: ['RIETVELD', 'MONDRIAN', 'DOESBURG'],
    sites: [['CITY EDGE', 3], ['CITY', 2], ['PARK', 2], ['PLAZA DIST', 1]],
    shapes: ['RECTANGLE', 'RECTANGLE', 'LSHAPE', 'BAR', 'CORNER'],
    floors: [2, 4],
    legend: [
      ['PLANE', 'sq'], ['SLAB', 'sqf'], ['POST', 'bar'], ['BALCONY', 'dash'], ['GLAZE', 'grid'],
      ['RAIL', 'tee'], ['VOID', 'diag'], ['CANOPY', 'tee'], ['STAIR', 'step'], ['JOINT', 'dot'],
    ],

    size(rng, annex) {
      const cell = rng.range(3, 4);
      const nx = annex ? 2 : rng.int(3, 4), ny = annex ? rng.int(2, 3) : rng.int(2, 3);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors, cell = P.cell;
      const c = ctx.palette.colors;
      const white = c[0], red = c[1], blue = c[2], yellow = c[3], black = c[4], grey = c[5] || [150, 152, 156];
      const prim = [red, blue, yellow];
      const EDGE = { alpha: 185, weight: 0.95, wob: 0.85, passes: 2 };
      const THIN = { alpha: 140, weight: 0.75, wob: 0.7 };
      const FAINT = { alpha: 70, weight: 0.65, wob: 0.7 };
      const H = N * FH;
      const T = 0.2;

      const mask = plan.mask(P.nx, P.ny, ctx.shape, R);
      const loop = plan.toWorld(plan.outline(mask)[0], P.x, P.y, cell, 0);
      const nE = loop.length;
      const bb = { x0: P.x, y0: P.y, x1: P.x + P.w, y1: P.y + P.d };
      const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      const segs = []; // every vertical plane placed: { a, b, axis } for the predicates
      const bigPrimary = []; // primary-coloured faces with their area
      const slabOver = []; // per slab: did it overrun the volume?

      // outward normal of edge i (rectilinear loop, ccw around the filled cells)
      const edgeN = (i) => {
        const a = loop[i], b = loop[(i + 1) % nE];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        let nx = ey, ny = -ex;
        const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
        const l = Math.hypot(nx, ny) || 1;
        return [nx / l, ny / l];
      };

      // a plane along the segment a→b (axis-aligned), thickness T, from z0 to z1
      function plane(a, b, z0, z1, color, alpha, tag) {
        const axis = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'x' : 'y';
        const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
        const len = axis === 'x' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
        if (len < 0.3 || z1 - z0 < 0.2) return null;
        const box = axis === 'x'
          ? S.box(x0, y0 - T / 2, z0, len, T, z1 - z0, { color: color, alpha: alpha, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: tag || 'plane', shade: [1.04, 1, 0.9] })
          : S.box(x0 - T / 2, y0, z0, T, len, z1 - z0, { color: color, alpha: alpha, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: tag || 'plane', shade: [1.04, 1, 0.9] });
        segs.push({ a: [a[0], a[1]], b: [b[0], b[1]], axis: axis, z0: z0, z1: z1, len: len });
        if (prim.indexOf(color) >= 0) bigPrimary.push(len * (z1 - z0));
        return box;
      }

      // ---- the walls: at every corner one edge wins, the other stops short ----
      let nPlane = 0, nVoid = 0, nGlaze = 0, nPost = 0, nJoint = 0;
      const posts = [];
      // corner i belongs to edge i (it runs on past it) or to edge i-1: decided once,
      // so a two-storey plane never meets a winner rolled on the floor above
      const win = [];
      for (let i = 0; i < nE; i++) win.push(R.chance(0.5));
      for (let k = 0; k < N; k++) {
        const z0 = k * FH, z1 = (k + 1) * FH;
        for (let i = 0; i < nE; i++) {
          const a = loop[i], b = loop[(i + 1) % nE];
          const n = edgeN(i);
          const dir = G.norm([b[0] - a[0], b[1] - a[1], 0]);
          // start corner i: this edge wins if win[i]; end corner i+1: wins if !win[i+1]
          const winStart = win[i], winEnd = !win[(i + 1) % nE];
          const extS = winStart ? R.range(0.6, 1.8) : -R.range(0.5, 1.1);
          const extE = winEnd ? R.range(0.6, 1.8) : -R.range(0.5, 1.1);
          const off = R.chance(0.35) ? R.range(0.15, 0.5) : 0; // slid outward: layering
          const pa = [a[0] - dir[0] * extS + n[0] * off, a[1] - dir[1] * extS + n[1] * off];
          const pb = [b[0] + dir[0] * extE + n[0] * off, b[1] + dir[1] * extE + n[1] * off];
          const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
          if (R.chance(0.2) && L > 2) {
            // this edge is glazing on this floor: a pane between the neighbours
            const q = [[pa[0], pa[1], z0 + 0.1], [pb[0], pb[1], z0 + 0.1], [pb[0], pb[1], z1 - 0.15], [pa[0], pa[1], z1 - 0.15]];
            S.face(q, { fill: { color: [150, 172, 190], alpha: 80, mode: 'flat' }, edge: THIN, tag: 'glaze' });
            const nM = Math.max(1, Math.round(L / 1.1));
            for (let m = 1; m < nM; m++) { const t = m / nM; S.line([[pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, z0 + 0.1], [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, z1 - 0.15]], FAINT, { depth: D(q[0]) + 0.1 }); }
            nGlaze++;
            continue;
          }
          // the plane, sometimes two floors tall, mostly white
          const tall = k < N - 1 && R.chance(0.25);
          const col = R.weighted([[white, 6], [grey, 2], [black, 1]]);
          plane(pa, pb, z0, tall ? z1 + FH * R.range(0.4, 1) : z1 + (k === N - 1 ? R.range(0.3, 1.1) : 0), col, 150);
          nPlane++;
          // a small primary panel riding one end of the plane
          if (R.chance(0.35)) {
            const w = R.range(0.8, 1.6), h = R.range(0.8, 1.6);
            const atEnd = R.chance(0.5);
            const s0 = atEnd ? [pb[0] - dir[0] * w + n[0] * 0.12, pb[1] - dir[1] * w + n[1] * 0.12] : [pa[0] + n[0] * 0.12, pa[1] + n[1] * 0.12];
            const s1 = [s0[0] + dir[0] * w, s0[1] + dir[1] * w];
            const zz = z0 + R.range(0.2, FH - h - 0.2);
            plane(s0, s1, zz, zz + h, R.pick(prim), 210);
            nPlane++;
          }
          // the void where the loser stopped short, sometimes glazed
          if (!winStart) {
            if (R.chance(0.5)) {
              const g0 = [a[0] + n[0] * (off + 0.05), a[1] + n[1] * (off + 0.05)], g1 = [pa[0] + n[0] * 0.05, pa[1] + n[1] * 0.05];
              const q = [[g0[0], g0[1], z0 + 0.1], [g1[0], g1[1], z0 + 0.1], [g1[0], g1[1], z1 - 0.15], [g0[0], g0[1], z1 - 0.15]];
              S.face(q, { fill: { color: [150, 172, 190], alpha: 80, mode: 'flat' }, edge: THIN, tag: 'glaze' });
              nGlaze++;
            } else nVoid++;
          }
        }
      }
      S.count('PLANE', nPlane);
      S.count('VOID', nVoid);
      S.count('GLAZE', nGlaze);

      // ---- posts standing free at the corners, some rising past the roof ----
      for (let i = 0; i < nE; i++) {
        if (!R.chance(0.4)) continue;
        const p = loop[i], n = edgeN(i), n2 = edgeN((i + nE - 1) % nE);
        const x = p[0] + (n[0] + n2[0]) * 0.35, y = p[1] + (n[1] + n2[1]) * 0.35;
        const h = H + R.range(0.6, 2.2);
        const col = R.weighted([[yellow, 3], [black, 2], [red, 1], [blue, 1]]);
        S.box(x - 0.09, y - 0.09, 0, 0.18, 0.18, h, { color: col, alpha: 230, mode: 'flat', edge: { color: G.shade(col, 0.6), alpha: 200, weight: 0.8, wob: 0.5 }, tag: 'post' });
        posts.push([x, y, h]);
        nPost++;
      }
      S.count('POST', nPost);

      // ---- slabs: every floor plate overruns the volume on one or two sides ----
      for (let k = 1; k <= N; k++) {
        const z = k * FH;
        const over = [0, 0, 0, 0]; // -x, +x, -y, +y
        const sides = R.shuffle([0, 1, 2, 3]).slice(0, R.int(1, 2));
        for (const s of sides) over[s] = R.range(0.8, 2.4);
        const x0 = bb.x0 - over[0], x1 = bb.x1 + over[1], y0 = bb.y0 - over[2], y1 = bb.y1 + over[3];
        // the slab follows the mask bbox (a plate), with the overruns
        const col = R.weighted([[white, 5], [grey, 3], [black, 1]]);
        S.box(x0, y0, z - 0.22, x1 - x0, y1 - y0, 0.22, { color: col, alpha: 120, mode: 'flat', edge: EDGE, tag: 'slab' });
        slabOver.push(over.some((o) => o > 0));
        S.count('SLAB');
        // a rail along the overrun, in a primary, with joints at its ends
        for (const s of sides) {
          const h = z + 1.0;
          const rc = R.pick(prim);
          const rail = s === 0 ? [[x0 + 0.1, y0 + 0.3, h], [x0 + 0.1, y1 - 0.3, h]] : s === 1 ? [[x1 - 0.1, y0 + 0.3, h], [x1 - 0.1, y1 - 0.3, h]] : s === 2 ? [[x0 + 0.3, y0 + 0.1, h], [x1 - 0.3, y0 + 0.1, h]] : [[x0 + 0.3, y1 - 0.1, h], [x1 - 0.3, y1 - 0.1, h]];
          S.line(rail, { color: rc, alpha: 220, weight: 1.6, wob: 0.5 }, { depth: D(rail[1]) + 0.2, tag: 'rail' });
          const nB = Math.max(2, Math.round(G.len(G.sub(rail[1], rail[0])) / 1.2));
          for (let b = 0; b <= nB; b++) {
            const t = b / nB;
            const p = [rail[0][0] + (rail[1][0] - rail[0][0]) * t, rail[0][1] + (rail[1][1] - rail[0][1]) * t, h];
            S.line([p, [p[0], p[1], z]], THIN, { depth: D(p) + 0.19 });
          }
          for (const e of rail) {
            S.box(e[0] - 0.13, e[1] - 0.13, e[2] - 0.13, 0.26, 0.26, 0.26, { color: black, alpha: 230, mode: 'flat', edge: null, tag: 'joint' });
            nJoint++;
          }
          S.count('RAIL');
        }
      }

      // ---- balconies on the upper floors ----
      const nBal = R.int(1, 3);
      for (let i = 0; i < nBal; i++) {
        const e = R.int(0, nE - 1);
        const a = loop[e], b = loop[(e + 1) % nE], n = edgeN(e);
        const k = R.int(1, N - 1);
        const z = k * FH;
        const t = R.range(0.15, 0.6), w = R.range(2, 3.2), dpt = R.range(1.2, 2);
        const p0 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const along = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'x' : 'y';
        const bx = along === 'x' ? p0[0] : p0[0] + (n[0] > 0 ? 0 : -dpt), by = along === 'x' ? p0[1] + (n[1] > 0 ? 0 : -dpt) : p0[1];
        const bw = along === 'x' ? w : dpt, bd = along === 'x' ? dpt : w;
        S.box(bx, by, z - 0.18, bw, bd, 0.18, { color: white, alpha: 140, mode: 'flat', edge: EDGE, tag: 'balcony' });
        // a rail on its outer edge, overrunning the balcony
        const rc = R.pick(prim);
        const rail = along === 'x'
          ? [[bx - 0.5, n[1] > 0 ? by + bd : by, z + 1.0], [bx + bw + 0.5, n[1] > 0 ? by + bd : by, z + 1.0]]
          : [[n[0] > 0 ? bx + bw : bx, by - 0.5, z + 1.0], [n[0] > 0 ? bx + bw : bx, by + bd + 0.5, z + 1.0]];
        S.line(rail, { color: rc, alpha: 220, weight: 1.6, wob: 0.5 }, { depth: D(rail[1]) + 0.2, tag: 'rail' });
        for (const p of rail) S.line([p, [p[0], p[1], z + 0.1]], THIN, { depth: D(p) + 0.19 });
        S.box(rail[0][0] - 0.13, rail[0][1] - 0.13, z + 0.87, 0.26, 0.26, 0.26, { color: black, alpha: 230, mode: 'flat', edge: null, tag: 'joint' });
        nJoint++;
        S.count('BALCONY');
        S.count('RAIL');
      }
      S.count('JOINT', nJoint);

      // ---- counter-construction: free planes floating off the volume ----
      const nFree = R.int(1, 3);
      for (let i = 0; i < nFree; i++) {
        const e = R.int(0, nE - 1), n = edgeN(e), a = loop[e], b = loop[(e + 1) % nE];
        const t = R.range(0.2, 0.8);
        const p = [a[0] + (b[0] - a[0]) * t + n[0] * R.range(0.8, 2), a[1] + (b[1] - a[1]) * t + n[1] * R.range(0.8, 2)];
        const col = R.pick(prim.concat([black]));
        if (R.chance(0.5)) {
          // horizontal: a small slab floating in the air, held by a thin post
          const w = R.range(1, 2), d = R.range(1, 2), z = R.range(FH * 0.8, H);
          S.box(p[0] - w / 2, p[1] - d / 2, z, w, d, 0.16, { color: col, alpha: 220, mode: 'flat', edge: EDGE, tag: 'plane' });
          S.line([[p[0], p[1], 0], [p[0], p[1], z]], THIN, { tag: 'post' });
          bigPrimary.push(w * d);
        } else {
          const along = Math.abs(n[0]) > 0.5 ? 'y' : 'x';
          const w = R.range(1, 2.2), h = R.range(0.8, 1.8), z = R.range(0.4, H - h);
          const s0 = along === 'x' ? [p[0] - w / 2, p[1]] : [p[0], p[1] - w / 2];
          const s1 = along === 'x' ? [p[0] + w / 2, p[1]] : [p[0], p[1] + w / 2];
          plane(s0, s1, z, z + h, col, 220);
          S.line([[p[0], p[1], 0], [p[0], p[1], z]], THIN, { tag: 'post' });
        }
        nPlane++;
      }
      S.count('PLANE', nFree);

      // ---- canopy and an external stair ----
      const ex = bb.x0 + R.range(0.5, P.w - 2.5), ey = bb.y1 + 0.2;
      S.box(ex, ey, 2.3, 2.2, 1.4, 0.14, { color: R.pick([white, black]), alpha: 200, mode: 'flat', edge: EDGE, tag: 'canopy' });
      S.line([[ex + 2.2, ey + 1.4, 0], [ex + 2.2, ey + 1.4, 2.3]], { color: red, alpha: 220, weight: 1.4, wob: 0.5 }, { tag: 'post' });
      S.count('CANOPY');
      if (R.chance(0.7)) {
        const steps = R.int(8, 12), rise = FH / steps, run = 0.3;
        const sx = bb.x1 + 0.3, sy = bb.y0 + R.range(0.5, P.d - 4);
        for (let s = 0; s < steps; s++) S.box(sx, sy + s * run, s * rise, 1.1, run, rise, { color: grey, alpha: 60, mode: 'flat', edge: THIN, tag: 'stair' });
        const rail = [[sx + 1.1, sy, 1.0], [sx + 1.1, sy + steps * run, FH + 1.0]];
        S.line(rail, { color: blue, alpha: 220, weight: 1.4, wob: 0.5 }, { depth: D(rail[1]) + 0.2, tag: 'rail' });
        S.count('STAIR');
        S.count('RAIL');
      }

      // ---- the tenets, over what was drawn ----
      // 1. elementary: every tagged face is an axis-aligned rectangle
      const faces = S.items.filter((it) => it.kind === 'face' && it.tag);
      const elementary = faces.every((f) => [0, 1, 2].some((ax) => f.pts.every((p) => Math.abs(p[ax] - f.pts[0][ax]) < 1e-6)));
      // 2. anti-cubic: no corner of the plan is closed by two planes at the same level
      let closed = 0;
      for (let i = 0; i < nE; i++) {
        const cpt = loop[i];
        for (let k = 0; k < N; k++) {
          const z = k * FH + FH / 2;
          const at = segs.filter((s) => s.z0 <= z && s.z1 >= z && (near(s.a, cpt) || near(s.b, cpt) || spans(s, cpt)));
          if (at.some((s) => s.axis === 'x') && at.some((s) => s.axis === 'y')) closed++;
        }
      }
      function near(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.15; }
      function spans(s, q) {
        // the corner lies inside the plane's run (an overrunning winner passes through it)
        if (s.axis === 'x') return Math.abs(s.a[1] - q[1]) < 0.15 && q[0] > Math.min(s.a[0], s.b[0]) + 0.15 && q[0] < Math.max(s.a[0], s.b[0]) - 0.15;
        return Math.abs(s.a[0] - q[0]) < 0.15 && q[1] > Math.min(s.a[1], s.b[1]) + 0.15 && q[1] < Math.max(s.a[1], s.b[1]) - 0.15;
      }
      // 3. asymmetric: no mirror axis — on neither axis do most planes have a reflected twin
      const mid = (s) => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      const mirrored = (ax) => {
        let hit = 0;
        for (const s of segs) {
          const m = mid(s);
          const r = ax === 0 ? [2 * cx - m[0], m[1]] : [m[0], 2 * cy - m[1]];
          if (segs.some((t) => t !== s && t.axis === s.axis && Math.abs(t.len - s.len) < 0.3 && Math.abs(t.z0 - s.z0) < 0.1 && Math.hypot(mid(t)[0] - r[0], mid(t)[1] - r[1]) < 0.3)) hit++;
        }
        return hit / Math.max(1, segs.length);
      };
      const asym = mirrored(0) < 0.5 && mirrored(1) < 0.5;
      // 4. colour is an element: no primary face larger than a door
      const colourSmall = bigPrimary.every((a) => a < 4.5);
      // 5. every slab overruns the volume
      const overrun = slabOver.length > 0 && slabOver.every(Boolean);
      const tenets = [
        { name: 'ELEMENTARY', ok: elementary },
        { name: 'ANTI-CUBIC', ok: closed === 0 },
        { name: 'ASYMMETRIC', ok: asym },
        { name: 'COLOUR AS ELEMENT', ok: colourSmall },
        { name: 'OVERRUN', ok: overrun },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.destijl = STYLE;
})(window);
