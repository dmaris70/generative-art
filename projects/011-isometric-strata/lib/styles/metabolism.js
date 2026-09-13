/*
 * styles/metabolism.js — METABOLISM: the capsule tower.
 *
 * Kikutake and Kurokawa's charter (1960) as a growth rule rather than a
 * composition rule: a permanent service shaft, and impermanent capsules
 * plugged onto its faces in a staggered spiral, each with its porthole,
 * its four bolts and its service branch. Some slots are left vacant — the
 * structure is drawn with room to grow. Decks cantilever from the shaft,
 * bridges truss two shafts together, a helical stair winds up one of them.
 *
 * Five tenets are run as predicates over the drawn scene: every capsule
 * attaches to a shaft, no capsule touches another, a growth reserve of
 * vacant slots remains, capsules stagger rather than stack, every capsule
 * is serviced. Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'METABOLISM',
    header: 'METABOLIST',
    titles: ['METABOLISM DIAGRAM', 'CAPSULE TOWER', 'MARINE CITY', 'PLUG-IN SECTION', 'HELIX STUDY'],
    substyles: ['NAKAGIN', 'CLUSTER', 'HELIX', 'MARINE', 'SKY HOUSE'],
    types: ['TOWER', 'CLUSTER', 'MEGASTRUCTURE', 'PIER'],
    palettes: ['NAKAGIN', 'EXPO70', 'KIKUTAKE'],
    sites: [['CITY', 3], ['WATERFRONT', 3], ['CITY EDGE', 1], ['PLAZA DIST', 1]],
    shapes: ['RECTANGLE'],
    floors: [6, 12],
    legend: [
      ['CORE', 'sqh'], ['CAPSULE', 'sq'], ['SPINE', 'bar'], ['JOINT', 'dot'], ['DECK', 'sqf'],
      ['SERVICE', 'dash'], ['BRIDGE', 'x'], ['STAIR', 'step'], ['MODULE', 'grid'], ['FLOORS', 'cols'],
    ],

    size(rng, annex) {
      const two = !annex && rng.chance(0.55);
      return { w: two ? rng.range(18, 24) : rng.range(12, 15), d: rng.range(12, 15), two: two };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors;
      const concrete = c[0], capsuleCol = c[1], accent = c[2], dark = c[3], second = c[4];
      const EDGE = { alpha: 185, weight: 0.95, wob: 0.85, passes: 2 };
      const THIN = { alpha: 140, weight: 0.75, wob: 0.7 };
      const FAINT = { alpha: 70, weight: 0.65, wob: 0.7 };
      const H = N * FH;
      const CW = 2.5, CL = 4, CH = 2.5; // the capsule: Nakagin's 2.5 × 4 × 2.5

      // ---- podium deck ----
      const px0 = P.x + 1, py0 = P.y + 1, pw = P.w - 2, pd = P.d - 2;
      S.box(px0, py0, 0, pw, pd, FH * 0.8, { color: concrete, alpha: 90, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: EDGE, tag: 'podium' });
      const railZ = FH * 0.8 + 1.0;
      S.line([[px0, py0, railZ], [px0 + pw, py0, railZ], [px0 + pw, py0 + pd, railZ], [px0, py0 + pd, railZ], [px0, py0, railZ]], THIN, { depth: D([px0 + pw, py0 + pd, railZ]) + 0.2 });
      for (let t = 0; t <= 1.001; t += 0.125) {
        S.line([[px0 + pw, py0 + pd * t, FH * 0.8], [px0 + pw, py0 + pd * t, railZ]], FAINT, { depth: D([px0 + pw, py0 + pd * t, railZ]) + 0.2 });
        S.line([[px0 + pw * t, py0 + pd, FH * 0.8], [px0 + pw * t, py0 + pd, railZ]], FAINT, { depth: D([px0 + pw * t, py0 + pd, railZ]) + 0.2 });
      }
      S.count('DECK');

      // ---- the shafts ----
      const shafts = [];
      const nShaft = P.two ? 2 : 1;
      for (let i = 0; i < nShaft; i++) {
        const ss = R.range(4.2, 5.6);
        const sx = nShaft === 2 ? P.x + 3 + i * (P.w - ss - 6) : P.x + P.w / 2 - ss / 2 + R.range(-1, 1);
        const sy = P.y + P.d / 2 - ss / 2 + R.range(-1.5, 1.5);
        const sh = H + FH * R.range(0.6, 1.6) * (i === 0 ? 1 : R.range(0.6, 1));
        shafts.push({ x: sx, y: sy, s: ss, h: sh, caps: [], slots: 0, pipes: {} });
      }

      const capsules = []; // { x, y, z, w, d, h, face, shaft, lane, level }
      let nService = 0, nJoint = 0, nModule = 0, nVacant = 0;

      for (const sh of shafts) {
        const { x: sx, y: sy, s: ss, h: shH } = sh;
        S.box(sx, sy, 0, ss, ss, shH, { color: concrete, alpha: 130, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'core' });
        // floor lines on the visible faces
        for (let k = 1; k * FH < shH; k++) {
          const z = k * FH;
          S.line([[sx + ss, sy, z], [sx + ss, sy + ss, z], [sx, sy + ss, z]], FAINT, { depth: D([sx + ss, sy + ss, z]) + 0.05 });
        }
        S.count('CORE');
        S.count('FLOORS', Math.round(shH / FH));
        // service spines: pipes running the full height on each face
        const pipeCol = R.chance(0.5) ? accent : dark;
        const faces = ['+x', '+y', '-x', '-y'];
        // where two shafts face each other the gap belongs to the bridges
        const capFaces = shafts.length === 2 ? faces.filter((f) => !(sh === shafts[0] && f === '+x') && !(sh === shafts[1] && f === '-x')) : faces;
        for (const f of faces) {
          const nP = R.int(1, 2);
          sh.pipes[f] = [];
          for (let p = 0; p < nP; p++) {
            const t = R.range(0.15, 0.85);
            let bx, by;
            if (f === '+x') { bx = sx + ss; by = sy + ss * t; }
            else if (f === '-x') { bx = sx - 0.25; by = sy + ss * t; }
            else if (f === '+y') { bx = sx + ss * t; by = sy + ss; }
            else { bx = sx + ss * t; by = sy - 0.25; }
            S.box(bx, by, 0, 0.25, 0.25, shH + 0.6, { color: pipeCol, alpha: 200, mode: 'flat', edge: { color: G.shade(pipeCol, 0.6), alpha: 170, weight: 0.7, wob: 0.5 }, tag: 'spine' });
            sh.pipes[f].push([bx + 0.125, by + 0.125]);
            S.count('SPINE');
          }
        }
        // machine room and mast on top
        S.box(sx + ss * 0.2, sy + ss * 0.2, shH, ss * 0.6, ss * 0.6, FH * 0.7, { color: second, alpha: 90, mode: 'flat', edge: EDGE, tag: 'core' });
        S.line([[sx + ss / 2, sy + ss / 2, shH + FH * 0.7], [sx + ss / 2, sy + ss / 2, shH + FH * 2.2]], { alpha: 190, weight: 1.2, wob: 0.5 }, { depth: D([sx + ss / 2, sy + ss / 2, shH]) + 0.3 });
        for (let r = 0; r < 3; r++) {
          const ring = G.regular(sx + ss / 2, sy + ss / 2, shH + FH * (1.2 + r * 0.35), 0.5 - r * 0.12, 8);
          S.line(ring.concat([ring[0]]), THIN, { depth: D([sx + ss / 2, sy + ss / 2, shH]) + 0.31 });
        }

        // ---- capsules: staggered slots on every face ----
        // two lateral positions on each face; a narrow shaft alternates them by
        // level, a wide one fills both — either way the stack is staggered
        const wide = ss >= 2 * CW + 0.7;
        const lanePos = [0.2 + CW / 2, ss - 0.2 - CW / 2];
        const faceOff = { '+x': 0, '+y': 0.25, '-x': 0.5, '-y': 0.75 };
        const occupancy = R.range(0.6, 0.82);
        for (const f of capFaces) {
          for (let k = 1; (k + faceOff[f]) * FH + CH < shH - 0.3; k++) {
            const z = (k + faceOff[f]) * FH;
            for (let l = 0; l < 2; l++) {
              if (!wide && l !== k % 2) continue;
              const lt = lanePos[l] / ss;
              // the capsule's box, long axis normal to the face
              let bx, by, bw, bd;
              if (f === '+x') { bx = sx + ss; by = sy + ss * lt - CW / 2; bw = CL; bd = CW; }
              else if (f === '-x') { bx = sx - CL; by = sy + ss * lt - CW / 2; bw = CL; bd = CW; }
              else if (f === '+y') { bx = sx + ss * lt - CW / 2; by = sy + ss; bw = CW; bd = CL; }
              else { bx = sx + ss * lt - CW / 2; by = sy - CL; bw = CW; bd = CL; }
              sh.slots++;
              nModule++;
              if (!R.chance(occupancy)) {
                // a vacant slot: its outline only, dashed, on the visible faces
                if (f === '+x' || f === '+y') {
                  const r = G.rect(bx, by, z, bw, bd);
                  S.line(r.concat([r[0]]), { alpha: 80, weight: 0.7, wob: 0.6, dash: [5, 4] }, { tag: 'slot', depth: D([bx + bw, by + bd, z]) });
                  S.line([[bx + bw, by + bd, z], [bx + bw, by + bd, z + CH]], { alpha: 80, weight: 0.7, wob: 0.6, dash: [5, 4] }, { tag: 'slot', depth: D([bx + bw, by + bd, z]) });
                }
                nVacant++;
                continue;
              }
              S.box(bx, by, z, bw, bd, CH, { color: capsuleCol, alpha: 160, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: 'capsule', shade: [1.03, 0.98, 0.9] });
              capsules.push({ x: bx, y: by, z: z, w: bw, d: bd, h: CH, face: f, shaft: sh, lane: l, level: k });
              // porthole on the outer face (the visible faces only)
              if (f === '+x' || f === '+y') {
                const r = 0.55, pts = [];
                for (let i = 0; i < 18; i++) {
                  const a = (i / 18) * Math.PI * 2;
                  pts.push(f === '+x' ? [bx + bw + 0.02, by + bd / 2 + Math.cos(a) * r, z + CH * 0.55 + Math.sin(a) * r] : [bx + bw / 2 + Math.cos(a) * r, by + bd + 0.02, z + CH * 0.55 + Math.sin(a) * r]);
                }
                S.face(pts, { fill: { color: second, alpha: 110, mode: 'flat' }, edge: THIN, tag: 'porthole', depth: D(pts[0]) + 0.2 });
              }
              // the four bolts where it meets the shaft
              const ax = f === '+x' ? sx + ss : f === '-x' ? sx - 0.2 : null;
              const ay = f === '+y' ? sy + ss : f === '-y' ? sy - 0.2 : null;
              for (let b = 0; b < 4; b++) {
                const u = b % 2 ? 0.3 : CW - 0.5, v = b < 2 ? 0.3 : CH - 0.5;
                if (ax !== null) S.box(ax - 0.05, by + u, z + v, 0.3, 0.2, 0.2, { color: dark, alpha: 220, mode: 'flat', edge: null, tag: 'joint' });
                else S.box(bx + u, ay - 0.05, z + v, 0.2, 0.3, 0.2, { color: dark, alpha: 220, mode: 'flat', edge: null, tag: 'joint' });
              }
              nJoint++;
              // service branch from the nearest pipe on this face
              const pipe = sh.pipes[f][0];
              const mid = f === '+x' || f === '-x' ? [ax !== null ? ax : bx, by + bd / 2] : [bx + bw / 2, ay !== null ? ay : by];
              const zz = z + CH * 0.2;
              S.line([[pipe[0], pipe[1], zz], [mid[0] + (f === '+x' ? 0.15 : f === '-x' ? -0.15 : 0), mid[1] + (f === '+y' ? 0.15 : f === '-y' ? -0.15 : 0), zz]], { color: accent, alpha: 170, weight: 0.8, wob: 0.5 }, { tag: 'service', depth: D([mid[0], mid[1], zz]) + 0.25 });
              nService++;
            }
          }
        }
      }
      S.count('CAPSULE', capsules.length);
      S.count('MODULE', nModule);
      S.count('JOINT', nJoint);
      S.count('SERVICE', nService);

      // ---- decks cantilevered from the shafts ----
      const nDeck = R.int(1, 2);
      for (let i = 0; i < nDeck; i++) {
        const sh = R.pick(shafts);
        const z = FH * R.int(2, Math.max(2, N - 2)) + FH * 0.5;
        const r = sh.s * R.range(1.1, 1.5);
        const hex = G.regular(sh.x + sh.s / 2, sh.y + sh.s / 2, z, r, 6, R.range(0, 1));
        const lo = hex.map((p) => [p[0], p[1], z - 0.35]);
        const pr = G.prism(lo, hex);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: concrete, alpha: 110, mode: 'flat' }, edge: EDGE, tag: 'deck' });
        S.face(hex, { fill: { color: concrete, alpha: 60, mode: 'flat' }, edge: EDGE, tag: 'deck' });
        S.line(hex.map((p) => [p[0], p[1], z + 1]).concat([[hex[0][0], hex[0][1], z + 1]]), THIN, { depth: D([sh.x + sh.s, sh.y + sh.s, z]) + 0.3 });
        for (const p of hex) S.line([p, [p[0], p[1], z + 1]], FAINT, { depth: D(p) + 0.3 });
        S.count('DECK');
      }

      // ---- bridges between two shafts, trussed ----
      if (shafts.length === 2) {
        const a = shafts[0], b = shafts[1];
        const nB = R.int(1, 3);
        for (let i = 0; i < nB; i++) {
          const k = R.int(2, N - 1);
          const z = k * FH + FH * 0.3;
          const y = Math.max(a.y, b.y) + R.range(0.5, Math.min(a.s, b.s) - 2);
          const x0 = a.x + a.s, x1 = b.x;
          S.box(x0, y, z, x1 - x0, 1.6, 0.35, { color: second, alpha: 80, mode: 'flat', edge: EDGE, tag: 'bridge' });
          const nT = Math.max(2, Math.round((x1 - x0) / 1.6));
          for (let t = 0; t < nT; t++) {
            const xa = x0 + (x1 - x0) * t / nT, xb = x0 + (x1 - x0) * (t + 1) / nT;
            S.line([[xa, y + 1.6, z + 0.35], [xb, y + 1.6, z + 1.6]], THIN, { depth: D([xb, y + 1.6, z]) + 0.2 });
            S.line([[xa, y + 1.6, z + 1.6], [xb, y + 1.6, z + 0.35]], THIN, { depth: D([xb, y + 1.6, z]) + 0.2 });
          }
          S.line([[x0, y + 1.6, z + 1.6], [x1, y + 1.6, z + 1.6]], THIN, { depth: D([x1, y + 1.6, z]) + 0.2 });
          S.count('BRIDGE');
        }
      }

      // ---- a helical stair around one shaft ----
      const sh0 = shafts[shafts.length - 1];
      const hr = sh0.s / 2 + CL + 0.6, hcx = sh0.x + sh0.s / 2, hcy = sh0.y + sh0.s / 2;
      const helix = [];
      const top = Math.min(sh0.h, H);
      for (let t = 0; t <= top; t += 0.1) {
        const a = t * (Math.PI * 2 / (FH * 1.5));
        helix.push([hcx + Math.cos(a) * hr, hcy + Math.sin(a) * hr, t + FH * 0.8]);
      }
      S.line(helix, THIN, { depth: D([hcx + hr, hcy + hr, top / 2]) - 0.5, tag: 'stair' });
      S.line(helix.map((p) => [p[0], p[1], p[2] + 1]), FAINT, { depth: D([hcx + hr, hcy + hr, top / 2]) - 0.5 });
      for (let i = 0; i < helix.length; i += 3) {
        const p = helix[i];
        const inward = [hcx + (p[0] - hcx) * 0.82, hcy + (p[1] - hcy) * 0.82, p[2]];
        S.line([p, inward], FAINT, { depth: D(p) - 0.5 });
      }
      S.count('STAIR');

      // ---- the tenets ----
      const attached = capsules.every((cp) => {
        const sh = cp.shaft;
        if (cp.face === '+x') return Math.abs(cp.x - (sh.x + sh.s)) < 0.05;
        if (cp.face === '-x') return Math.abs(cp.x + cp.w - sh.x) < 0.05;
        if (cp.face === '+y') return Math.abs(cp.y - (sh.y + sh.s)) < 0.05;
        return Math.abs(cp.y + cp.d - sh.y) < 0.05;
      });
      let touching = 0;
      for (let i = 0; i < capsules.length; i++) for (let j = i + 1; j < capsules.length; j++) {
        const a = capsules[i], b = capsules[j];
        const sep = a.x + a.w <= b.x + 0.2 || b.x + b.w <= a.x + 0.2 || a.y + a.d <= b.y + 0.2 || b.y + b.d <= a.y + 0.2 || a.z + a.h <= b.z + 0.2 || b.z + b.h <= a.z + 0.2;
        if (!sep) touching++;
      }
      const reserve = nModule > 0 ? nVacant / nModule : 0;
      let stacked = 0, pairs = 0;
      for (const a of capsules) for (const b of capsules) {
        if (a === b || a.shaft !== b.shaft || a.face !== b.face || b.level !== a.level + 1) continue;
        pairs++;
        if (a.lane === b.lane) stacked++;
      }
      const tenets = [
        { name: 'PERMANENT SPINE', ok: capsules.length > 0 && attached },
        { name: 'DISCRETE CAPSULES', ok: touching === 0 },
        { name: 'GROWTH RESERVE', ok: reserve >= 0.12 },
        { name: 'STAGGERED', ok: pairs === 0 || stacked / pairs < 0.5 },
        { name: 'SERVICED', ok: nService >= capsules.length },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets, datum: FH * 0.8 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.metabolism = STYLE;
})(window);
