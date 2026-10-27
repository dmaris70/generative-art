/*
 * styles/archigram.js — ARCHIGRAM: the plug-in rig.
 *
 * Cook, Herron and Chalk's proposition inverted from the Metabolist shaft:
 * the structure is an exoskeleton — masts and lattice trusses on the
 * envelope, cable ties across its faces — and every service runs outside
 * it: ducts in pop colours, escalator tubes climbing the flanks, tanks on
 * brackets. Inside there are only decks and the pods that plug onto them.
 * A tower crane on a corner mast is lifting one more pod in: the drawing
 * shows the city mid-change.
 *
 * Five tenets over the drawn scene: exo-structure (every mast, truss and
 * tie on the envelope), exo-services (every duct, escalator and tank
 * outside it), pods only within (nothing else inside), plugged in (every
 * pod rests on a deck or a pod), in transit (a crane, and a pod in the
 * air). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'ARCHIGRAM',
    header: 'PLUG-IN',
    titles: ['PLUG-IN DIAGRAM', 'INSTANT CITY', 'LIVING POD', 'CRANE STUDY', 'WALKING SECTION'],
    substyles: ['PLUG-IN', 'INSTANT', 'GASKET', 'CUSHICLE', 'CAPSULE HOMES'],
    types: ['MEGASTRUCTURE', 'POD STACK', 'RIG', 'FRAME'],
    palettes: ['ZOOM', 'POP', 'HIGHTECH'],
    sites: [['CITY', 3], ['WATERFRONT', 2], ['CITY EDGE', 2], ['PLAZA DIST', 1]],
    shapes: ['RECTANGLE'],
    floors: [5, 9],
    legend: [
      ['TRUSS', 'x'], ['DUCT', 'bar'], ['CRANE', 'tee'], ['POD', 'sq'], ['ESCALATOR', 'ramp'],
      ['TIE', 'diag'], ['MAST', 'cols'], ['TANK', 'circ'], ['DECK', 'sqf'], ['FLOORS', 'step'],
    ],

    size(rng, annex) {
      const bay = rng.range(6, 8);
      const nx = annex ? 1 : rng.int(2, 3), ny = annex ? 1 : rng.int(1, 2);
      return { w: nx * bay + 4, d: ny * bay + 4, nx: nx, ny: ny, bay: bay };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors, bay = P.bay;
      const c = ctx.palette.colors;
      const white = c[0], acc = [c[1], c[2], c[3]], dark = c[4];
      const EDGE = { alpha: 185, weight: 0.95, wob: 0.85, passes: 2 };
      const THIN = { alpha: 150, weight: 0.8, wob: 0.7 };
      const FAINT = { alpha: 80, weight: 0.65, wob: 0.7 };
      const H = N * FH;

      // the envelope: the rig's masts stand on this rectangle
      const ex0 = P.x + 2, ey0 = P.y + 2, ex1 = ex0 + P.nx * bay, ey1 = ey0 + P.ny * bay;
      const inside = (p, m) => p[0] > ex0 + (m || 0) && p[0] < ex1 - (m || 0) && p[1] > ey0 + (m || 0) && p[1] < ey1 - (m || 0);
      const onEnvelope = (p) => Math.abs(p[0] - ex0) < 0.3 || Math.abs(p[0] - ex1) < 0.3 || Math.abs(p[1] - ey0) < 0.3 || Math.abs(p[1] - ey1) < 0.3;

      // ---- masts on the envelope ----
      const masts = [];
      for (let i = 0; i <= P.nx; i++) {
        for (let j = 0; j <= P.ny; j++) {
          if (i > 0 && i < P.nx && j > 0 && j < P.ny) continue; // never inside
          const x = ex0 + i * bay, y = ey0 + j * bay;
          const h = H + FH * R.range(0.3, 1.2);
          S.box(x - 0.25, y - 0.25, 0, 0.5, 0.5, h, { color: dark, alpha: 60, mode: 'flat', edge: EDGE, tag: 'mast' });
          // lattice inside the mast: a zigzag on the two visible faces
          for (let z = 0; z + 1 < h; z += 1) {
            S.line([[x + 0.25, y - 0.25, z], [x + 0.25, y + 0.25, z + 1]], FAINT, { depth: D([x + 0.25, y + 0.25, z]) + 0.05 });
            S.line([[x - 0.25, y + 0.25, z], [x + 0.25, y + 0.25, z + 1]], FAINT, { depth: D([x + 0.25, y + 0.25, z]) + 0.05 });
          }
          masts.push({ x: x, y: y, h: h, i: i, j: j });
          S.count('MAST');
        }
      }
      S.count('FLOORS', N);

      // ---- trusses between neighbouring masts at every level ----
      const trussPts = [];
      const truss = (a, b, z) => {
        const dh = 0.8;
        S.line([[a.x, a.y, z], [b.x, b.y, z]], THIN, { tag: 'truss', depth: D([b.x, b.y, z]) });
        S.line([[a.x, a.y, z + dh], [b.x, b.y, z + dh]], THIN, { tag: 'truss', depth: D([b.x, b.y, z]) });
        const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.round(L / 1.3));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const p0 = [a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, k % 2 ? z + dh : z];
          const p1 = [a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1, k % 2 ? z : z + dh];
          S.line([p0, p1], FAINT, { tag: 'truss', depth: D(p1) });
        }
        trussPts.push([a.x, a.y], [b.x, b.y]);
        S.count('TRUSS');
      };
      const mastAt = (i, j) => masts.find((m) => m.i === i && m.j === j);
      for (let k = 1; k <= N; k++) {
        const z = k * FH;
        for (const m of masts) {
          const r = mastAt(m.i + 1, m.j), u = mastAt(m.i, m.j + 1);
          if (r && z < Math.min(m.h, r.h) && (m.j === 0 || m.j === P.ny)) truss(m, r, z);
          if (u && z < Math.min(m.h, u.h) && (m.i === 0 || m.i === P.nx)) truss(m, u, z);
        }
      }

      // ---- ties: cable crosses on the envelope's visible faces ----
      let nTie = 0;
      const tiePts = [];
      for (let k = 0; k < N; k++) {
        const z0 = k * FH + 0.8, z1 = (k + 1) * FH;
        for (let i = 0; i < P.nx; i++) if (R.chance(0.35)) {
          const xa = ex0 + i * bay, xb = xa + bay;
          S.line([[xa, ey1, z0], [xb, ey1, z1]], FAINT, { tag: 'tie', depth: D([xb, ey1, z0]) + 0.02 });
          S.line([[xa, ey1, z1], [xb, ey1, z0]], FAINT, { tag: 'tie', depth: D([xb, ey1, z0]) + 0.02 });
          tiePts.push([xa, ey1], [xb, ey1]);
          nTie++;
        }
        for (let j = 0; j < P.ny; j++) if (R.chance(0.35)) {
          const ya = ey0 + j * bay, yb = ya + bay;
          S.line([[ex1, ya, z0], [ex1, yb, z1]], FAINT, { tag: 'tie', depth: D([ex1, yb, z0]) + 0.02 });
          S.line([[ex1, ya, z1], [ex1, yb, z0]], FAINT, { tag: 'tie', depth: D([ex1, yb, z0]) + 0.02 });
          tiePts.push([ex1, ya], [ex1, yb]);
          nTie++;
        }
      }
      S.count('TIE', nTie);

      // ---- decks: open gratings at some levels, inside the rig ----
      const deckLevels = [];
      for (let k = 1; k <= N; k++) if (k === 1 || R.chance(0.45)) deckLevels.push(k);
      for (const k of deckLevels) {
        const z = k * FH;
        const dx0 = ex0 + 0.4, dy0 = ey0 + 0.4, dw = ex1 - ex0 - 0.8, dd = ey1 - ey0 - 0.8;
        S.box(dx0, dy0, z - 0.25, dw, dd, 0.25, { color: white, alpha: 60, mode: 'flat', edge: THIN, tag: 'deck' });
        for (let gx = dx0 + 1; gx < dx0 + dw; gx += 1) S.line([[gx, dy0, z + 0.01], [gx, dy0 + dd, z + 0.01]], FAINT, { depth: D([gx, dy0 + dd, z]) + 0.02 });
        S.count('DECK');
      }

      // ---- pods: the only thing inside, plugged onto decks or onto pods ----
      const pods = [];
      const PW = 3, PH = 2.6;
      const cols = Math.floor((ex1 - ex0 - 1) / (PW + 0.6)), rows = Math.floor((ey1 - ey0 - 1) / (PW + 0.6));
      const pod = (x, y, z, tag) => {
        S.box(x, y, z, PW, PW, PH, { color: white, alpha: 165, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: tag || 'pod', shade: [1.03, 0.98, 0.9] });
        // a rounded corner suggested by a chamfer line, a porthole, a door
        S.line([[x + PW, y, z + PH - 0.3], [x + PW, y + PW, z + PH - 0.3], [x, y + PW, z + PH - 0.3]], FAINT, { depth: D([x + PW, y + PW, z + PH]) + 0.1 });
        const pts = [];
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([x + PW / 2 + Math.cos(a) * 0.5, y + PW + 0.02, z + PH * 0.55 + Math.sin(a) * 0.5]); }
        S.face(pts, { fill: { color: acc[2], alpha: 120, mode: 'flat' }, edge: THIN, tag: 'porthole', depth: D(pts[0]) + 0.2 });
        const door = [[x + PW + 0.02, y + 0.6, z], [x + PW + 0.02, y + 1.5, z], [x + PW + 0.02, y + 1.5, z + 2.1], [x + PW + 0.02, y + 0.6, z + 2.1]];
        S.face(door, { fill: { color: acc[0], alpha: 140, mode: 'flat' }, edge: THIN, tag: 'porthole', depth: D(door[0]) + 0.2 });
        pods.push({ x: x, y: y, z: z, tag: tag || 'pod' });
        S.count('POD');
      };
      for (const k of deckLevels) {
        const z = k * FH;
        const occ = R.range(0.35, 0.7);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (!R.chance(occ)) continue;
          const x = ex0 + 0.8 + i * (PW + 0.6), y = ey0 + 0.8 + j * (PW + 0.6);
          pod(x, y, z);
          // a pod on a pod, then perhaps one more
          let zz = z;
          while (R.chance(0.35) && zz + 2 * PH < H) { zz += PH; pod(x, y, zz); }
        }
      }

      // ---- the crane on a corner mast, a pod in the air ----
      const nCrane = R.int(1, 2);
      let lifted = 0;
      const corners = masts.filter((m) => (m.i === 0 || m.i === P.nx) && (m.j === 0 || m.j === P.ny));
      const used = new Set();
      for (let i = 0; i < nCrane; i++) {
        const m = R.pick(corners.filter((q) => !used.has(q)));
        if (!m) break;
        used.add(m);
        const top = m.h + FH * 1.2;
        S.box(m.x - 0.3, m.y - 0.3, m.h, 0.6, 0.6, top - m.h, { color: acc[0], alpha: 120, mode: 'flat', edge: EDGE, tag: 'crane' });
        // the jib reaches out over the street, away from the rig
        const dirX = m.i === P.nx ? 1 : m.i === 0 && P.nx > 0 ? -1 : 1;
        const dirY = m.j === P.ny ? 1 : -1;
        const alongX = R.chance(0.5);
        const jl = R.range(8, 13), cl = R.range(3, 4.5);
        const jib = alongX ? [m.x + dirX * jl, m.y] : [m.x, m.y + dirY * jl];
        const cj = alongX ? [m.x - dirX * cl, m.y] : [m.x, m.y - dirY * cl];
        const jx0 = Math.min(m.x, jib[0], cj[0]), jy0 = Math.min(m.y, jib[1], cj[1]);
        S.box(jx0 - 0.3, jy0 - 0.3, top - 0.6, Math.abs(jib[0] - cj[0]) + 0.6, Math.abs(jib[1] - cj[1]) + 0.6, 0.6, { color: acc[0], alpha: 150, mode: 'flat', edge: EDGE, tag: 'crane' });
        // jib lattice
        const L = jl + cl, nL = Math.round(L / 1.2);
        for (let k = 0; k < nL; k++) {
          const t0 = k / nL, t1 = (k + 1) / nL;
          const a = [cj[0] + (jib[0] - cj[0]) * t0, cj[1] + (jib[1] - cj[1]) * t0, k % 2 ? top : top - 0.6];
          const b = [cj[0] + (jib[0] - cj[0]) * t1, cj[1] + (jib[1] - cj[1]) * t1, k % 2 ? top - 0.6 : top];
          S.line([a, b], FAINT, { depth: D(b) + 0.3 });
        }
        S.line([[m.x, m.y, top + 2], [jib[0], jib[1], top]], THIN, { depth: D([m.x, m.y, top]) + 0.3 });
        S.line([[m.x, m.y, top + 2], [cj[0], cj[1], top]], THIN, { depth: D([m.x, m.y, top]) + 0.3 });
        S.line([[m.x, m.y, top], [m.x, m.y, top + 2]], THIN, { depth: D([m.x, m.y, top]) + 0.3 });
        S.box(cj[0] - 0.8, cj[1] - 0.8, top - 1.6, 1.6, 1.6, 1.0, { color: dark, alpha: 120, mode: 'flat', edge: THIN, tag: 'crane' }); // counterweight
        // the hook, and a pod in transit below it, outside the envelope
        const hook = [cj[0] + (jib[0] - cj[0]) * R.range(0.6, 0.85), cj[1] + (jib[1] - cj[1]) * R.range(0.6, 0.85)];
        const hz = R.range(H * 0.35, H * 0.9);
        S.line([[hook[0], hook[1], top - 0.6], [hook[0], hook[1], hz + PH]], THIN, { depth: D([hook[0], hook[1], hz]) + 0.3, tag: 'crane' });
        pod(hook[0] - PW / 2, hook[1] - PW / 2, hz, 'lifted');
        S.line([[hook[0] - PW / 2, hook[1] - PW / 2, hz + PH], [hook[0], hook[1], hz + PH + 1.2], [hook[0] + PW / 2, hook[1] + PW / 2, hz + PH]], FAINT, { depth: D([hook[0], hook[1], hz + PH]) + 0.3 });
        lifted++;
        S.count('CRANE');
      }

      // ---- services, all outside: ducts, escalators, tanks ----
      const services = [];
      let nDuct = 0;
      for (const m of masts) {
        if (!R.chance(0.6)) continue;
        const ox = m.i === P.nx ? 0.7 : m.i === 0 ? -0.7 : 0, oy = m.j === P.ny ? 0.7 : m.j === 0 ? -0.7 : 0;
        if (ox === 0 && oy === 0) continue;
        const col = R.pick(acc);
        S.box(m.x + ox - 0.16, m.y + oy - 0.16, 0, 0.32, 0.32, m.h * R.range(0.6, 1), { color: col, alpha: 210, mode: 'flat', edge: { color: G.shade(col, 0.6), alpha: 170, weight: 0.7, wob: 0.5 }, tag: 'duct' });
        services.push([m.x + ox, m.y + oy]);
        nDuct++;
      }
      // horizontal ducts along the outside of the front and right faces
      for (let k = 1; k < N; k++) {
        if (!R.chance(0.4)) continue;
        const z = k * FH + R.range(1.2, 2.4);
        const col = R.pick(acc);
        if (R.chance(0.5)) { S.box(ex0 - 0.5, ey1 + 0.6, z, ex1 - ex0 + 1, 0.3, 0.3, { color: col, alpha: 210, mode: 'flat', edge: { color: G.shade(col, 0.6), alpha: 170, weight: 0.7, wob: 0.5 }, tag: 'duct' }); services.push([(ex0 + ex1) / 2, ey1 + 0.75]); }
        else { S.box(ex1 + 0.6, ey0 - 0.5, z, 0.3, ey1 - ey0 + 1, 0.3, { color: col, alpha: 210, mode: 'flat', edge: { color: G.shade(col, 0.6), alpha: 170, weight: 0.7, wob: 0.5 }, tag: 'duct' }); services.push([ex1 + 0.75, (ey0 + ey1) / 2]); }
        nDuct++;
      }
      S.count('DUCT', nDuct);

      let nEsc = 0;
      const nE = R.int(1, 3);
      for (let i = 0; i < nE; i++) {
        const k = R.int(0, Math.max(0, deckLevels.length - 2));
        const z0 = (deckLevels[k] || 1) * FH, z1 = (deckLevels[k + 1] || deckLevels[k] + 1 || 2) * FH;
        if (z1 <= z0) continue;
        const onFront = R.chance(0.5);
        const run = (z1 - z0) / Math.tan(Math.PI / 6);
        const start = onFront ? [ex0 + R.range(0, Math.max(0.1, ex1 - ex0 - run)), ey1 + 1.4] : [ex1 + 1.4, ey0 + R.range(0, Math.max(0.1, ey1 - ey0 - run))];
        const u = G.norm(onFront ? [run, 0, z1 - z0] : [0, run, z1 - z0]);
        const v = onFront ? [0, 1, 0] : [1, 0, 0];
        const w = G.norm(G.cross(u, v));
        const len = Math.hypot(run, z1 - z0);
        const cen = [start[0] + u[0] * len / 2, start[1] + u[1] * len / 2, z0 + (z1 - z0) / 2];
        S.faces(G.obox(cen, u, v, w, len / 2, 0.7, 0.8), { color: acc[1], alpha: 60, mode: 'flat', edge: EDGE, tag: 'escalator' });
        const nR = Math.round(len / 0.6);
        for (let r = 1; r < nR; r++) {
          const t = r / nR;
          const p = [start[0] + u[0] * len * t, start[1] + u[1] * len * t, z0 + (z1 - z0) * t - 0.8];
          S.line([G.add(p, G.mul(v, -0.7)), G.add(p, G.mul(v, 0.7))], FAINT, { depth: D(p) + 0.2 });
        }
        services.push([cen[0], cen[1]]);
        nEsc++;
      }
      S.count('ESCALATOR', nEsc);

      let nTank = 0;
      const nT = R.int(1, 3);
      for (let i = 0; i < nT; i++) {
        const m = R.pick(masts.filter((q) => q.i === P.nx || q.j === P.ny));
        const ox = m.i === P.nx ? 1.4 : 0, oy = m.j === P.ny && ox === 0 ? 1.4 : 0;
        const tz = R.range(FH * 1.5, H - 2);
        const base = G.regular(m.x + ox, m.y + oy, tz, 0.8, 12);
        const top = base.map((p) => [p[0], p[1], tz + 1.8]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(acc[2], f.n[0] > f.n[1] ? 0.85 : 1), alpha: 150, mode: 'flat' }, edge: null, tag: 'tank' });
        S.line(top.concat([top[0]]), THIN, { depth: D([m.x + ox + 0.8, m.y + oy + 0.8, tz + 1.8]) + 0.1, tag: 'tank' });
        S.line([[m.x, m.y, tz], [m.x + ox, m.y + oy, tz]], THIN, { depth: D([m.x + ox, m.y + oy, tz]) + 0.05 });
        S.line([[m.x, m.y, tz - 1], [m.x + ox, m.y + oy, tz]], FAINT, { depth: D([m.x + ox, m.y + oy, tz]) + 0.05 });
        services.push([m.x + ox, m.y + oy]);
        nTank++;
      }
      S.count('TANK', nTank);

      // ---- the tenets ----
      const exoStructure = masts.every((m) => onEnvelope([m.x, m.y])) && trussPts.every(onEnvelope) && tiePts.every(onEnvelope);
      const exoServices = services.every((p) => !inside(p, 0.05));
      const items = S.items.filter((it) => it.tag);
      let intruders = 0;
      for (const it of items) {
        const cen = it.pts ? G.centroid(it.pts) : it.anchor;
        // the envelope is a volume: the cranes ride above it
        if (!cen || !inside(cen, 0.35) || cen[2] >= H) continue;
        if (it.tag !== 'pod' && it.tag !== 'porthole' && it.tag !== 'deck' && it.tag !== 'lifted') intruders++;
      }
      const deckZ = deckLevels.map((k) => k * FH);
      const plugged = pods.filter((p) => p.tag === 'pod').every((p) =>
        deckZ.some((z) => Math.abs(p.z - z) < 0.05) || pods.some((q) => q !== p && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.y - p.y) < 0.05 && Math.abs(q.z + PH - p.z) < 0.05));
      const tenets = [
        { name: 'EXO-STRUCTURE', ok: exoStructure },
        { name: 'EXO-SERVICES', ok: exoServices },
        { name: 'PODS ONLY WITHIN', ok: intruders === 0 },
        { name: 'PLUGGED IN', ok: pods.length > 0 && plugged },
        { name: 'IN TRANSIT', ok: lifted >= 1 },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.archigram = STYLE;
})(window);
