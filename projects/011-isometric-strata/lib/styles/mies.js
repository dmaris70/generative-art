/*
 * styles/mies.js — MIESIAN: the glass box on its plinth.
 *
 * The one grammar in the series that succeeds by removing parts. A
 * travertine plinth, raised, with a broad flight of steps and a
 * reflecting pool; a regular grid of steel columns standing outside the
 * glass line; the skin a single glazed volume ruled by mullions on one
 * module; one free-standing service core; a few free-standing stone
 * planes inside that touch neither skin nor column; a thin roof plane
 * overhanging all round. Everything sits on the same module.
 *
 * Five tenets over the drawn scene: less is more (a hard part budget),
 * on the module (every set-out coordinate a multiple of it), structure
 * expressed (every column outside the glass), raised on a plinth, free
 * plan (no interior plane touches skin or column). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'MIESIAN',
    header: 'LESS IS MORE',
    titles: ['MIESIAN STUDY', 'PAVILION DIAGRAM', 'GLASS BOX', 'PLINTH AND GRID', 'NEUE HALLE'],
    substyles: ['PAVILION', 'FARNSWORTH', 'CROWN HALL', 'SEAGRAM', 'BARCELONA'],
    types: ['PAVILION', 'HALL', 'TOWER', 'HOUSE'],
    palettes: ['TRAVERTINE', 'ONYX', 'STEEL'],
    sites: [['PLAZA DIST', 3], ['PARK', 2], ['CITY', 2], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE'],
    floors: [1, 4],
    legend: [
      ['PLINTH', 'sqf'], ['COLUMN', 'cols'], ['MULLION', 'bar'], ['GLAZE', 'grid'], ['CORE', 'sqh'],
      ['ROOF', 'dash'], ['STEP', 'step'], ['PLANE', 'sq'], ['POOL', 'wave'], ['MODULE', 'dot'],
    ],

    size(rng, annex) {
      const M = rng.range(1.5, 2.0);
      const bw = (annex ? rng.int(4, 6) : rng.int(7, 12)) * M, bd = (annex ? rng.int(3, 5) : rng.int(5, 8)) * M;
      const apron = 3 * M, front = (annex ? 3 : rng.int(4, 6)) * M;
      return { w: bw + 2 * apron, d: bd + apron + front, M: M, bw: bw, bd: bd, apron: apron, front: front };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors;
      const M = P.M;
      const c = ctx.palette.colors;
      const stone = c[0], steel = c[1], glass = c[2], onyx = c[3], water = c[4];
      const EDGE = { alpha: 190, weight: 0.95, wob: 0.55, passes: 1 };
      const THIN = { alpha: 150, weight: 0.75, wob: 0.45 };
      const FAINT = { alpha: 70, weight: 0.6, wob: 0.5 };
      const H = N * FH;
      const setout = []; // every coordinate that must sit on the module
      const onM = (v) => { setout.push(v); return v; };

      // ---- the plinth, its joints, its steps, its pool ----
      const tread = M / 4;
      const plH = (Math.ceil(0.6 / tread) + R.int(0, 2)) * tread; // never below 0.6, always whole risers
      const px = P.x, py = P.y, pw = P.w, pd = P.d;
      onM(pw); onM(pd);
      S.box(px, py, 0, pw, pd, plH, { color: stone, alpha: 110, mode: 'pencil', spacing: 3, angle: 'edge', edge: EDGE, tag: 'plinth' });
      for (let gx = px + M; gx < px + pw - 0.01; gx += M) S.line([[gx, py, plH + 0.01], [gx, py + pd, plH + 0.01]], FAINT, { depth: D([gx, py + pd, plH]) + 0.02 });
      for (let gy = py + M; gy < py + pd - 0.01; gy += M) S.line([[px, gy, plH + 0.01], [px + pw, gy, plH + 0.01]], FAINT, { depth: D([px + pw, gy, plH]) + 0.02 });
      S.count('PLINTH');
      S.count('MODULE', Math.round(pw / M) * Math.round(pd / M));
      // steps down the front (+y), the full width of the box
      const bx = px + P.apron, by = py + P.apron, bw = P.bw, bd = P.bd;
      onM(bx - px); onM(by - py); onM(bw); onM(bd);
      const nSteps = Math.max(2, Math.round(plH / 0.16));
      const rise = plH / nSteps, run = tread;
      for (let s = 0; s < nSteps; s++) {
        S.box(bx, py + pd + (nSteps - 1 - s) * run, 0, bw, run, (s + 1) * rise, { color: stone, alpha: 90, mode: 'flat', edge: THIN, tag: 'step' });
      }
      S.count('STEP', nSteps);
      // the pool on the front apron
      let pool = null;
      if (R.chance(0.75)) {
        const pwid = Math.max(2, Math.round((P.front - M) / M)) * M;
        const plen = Math.round(bw * R.range(0.4, 0.7) / M) * M;
        const pxx = onM(bx + (R.chance(0.5) ? 0 : bw - plen) - bx) + bx, pyy = by + bd + (P.front - pwid) / 2;
        pool = { x: pxx, y: pyy, w: plen, d: pwid };
        S.face(G.rect(pxx, pyy, plH + 0.02, plen, pwid), { fill: { color: water, alpha: 90, mode: 'flat' }, edge: THIN, tag: 'pool' });
        for (let k = 1; k <= 3; k++) S.line([[pxx + 0.4, pyy + pwid * k / 4, plH + 0.03], [pxx + plen - 0.4, pyy + pwid * k / 4 + R.range(-0.1, 0.1), plH + 0.03]], { alpha: 70, weight: 0.6, wob: 1.2 }, { depth: D([pxx + plen, pyy + pwid, plH]) + 0.03 });
        S.count('POOL');
      }

      // ---- the column grid, outside the glass line ----
      // bays are whole modules: the divisor of the box's module count nearest four
      const bays = (cells) => { let best = 1; for (let n = 1; n <= cells; n++) if (cells % n === 0 && Math.abs(cells / n - 4) < Math.abs(cells / best - 4)) best = n; return best; };
      const nbx = bays(Math.round(bw / M)), nby = bays(Math.round(bd / M));
      const colOff = M; // the glass sits one module inside the column line
      const columns = [];
      const colW = 0.3;
      const column = (x, y) => {
        S.box(x - colW / 2, y - colW / 2, plH, colW, colW, H + 0.4, { color: steel, alpha: 220, mode: 'flat', edge: { color: G.shade(steel, 0.5), alpha: 200, weight: 0.8, wob: 0.4 }, tag: 'column' });
        columns.push([x, y]);
        onM(x - bx); onM(y - by);
        S.count('COLUMN');
      };
      for (let i = 0; i <= nbx; i++) {
        const x = bx + (bw * i) / nbx;
        column(x, by - colOff);
        column(x, by + bd + colOff);
      }
      for (let j = 1; j < nby; j++) {
        const y = by + (bd * j) / nby;
        column(bx - colOff, y);
        column(bx + bw + colOff, y);
      }

      // ---- the glass skin, ruled by mullions on the module ----
      const gz0 = plH, gz1 = plH + H;
      const glassFace = (a, b, visible) => {
        const q = [[a[0], a[1], gz0], [b[0], b[1], gz0], [b[0], b[1], gz1], [a[0], a[1], gz1]];
        S.face(q, { fill: { color: glass, alpha: visible ? 55 : 30, mode: 'flat' }, edge: visible ? EDGE : FAINT, tag: 'glaze', depth: D(G.centroid(q)) + (visible ? 0 : -3) });
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.round(L / M);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          S.line([[x, y, gz0], [x, y, gz1]], visible ? THIN : FAINT, { tag: 'mullion', depth: D([x, y, gz0]) + (visible ? 0.1 : -3) });
          if (visible) { S.count('MULLION'); setout.push(x - bx, y - by); }
        }
        if (visible) S.count('GLAZE', n);
      };
      glassFace([bx, by + bd], [bx + bw, by + bd], true); // front (+y)
      glassFace([bx + bw, by], [bx + bw, by + bd], true); // right (+x)
      glassFace([bx, by], [bx + bw, by], false);
      glassFace([bx, by], [bx, by + bd], false);
      // floor slabs and spandrels for the taller boxes
      for (let k = 1; k < N; k++) {
        const z = plH + k * FH;
        S.box(bx, by, z - 0.35, bw, bd, 0.35, { color: stone, alpha: 60, mode: 'flat', edge: THIN, tag: 'slab' });
        S.box(bx - 0.02, by - 0.02, z - 0.35, bw + 0.04, bd + 0.04, 0.9, { color: steel, alpha: 120, mode: 'flat', edge: null, tag: 'slab' });
      }

      // ---- the roof plane, overhanging by half a module ----
      const ov = M / 2;
      S.box(bx - ov, by - ov, gz1, bw + 2 * ov, bd + 2 * ov, 0.4, { color: stone, alpha: 110, mode: 'flat', edge: EDGE, tag: 'roof' });
      S.line([[bx + bw + ov, by - ov, gz1 + 0.4], [bx + bw + ov, by + bd + ov, gz1 + 0.4], [bx - ov, by + bd + ov, gz1 + 0.4]], THIN, { depth: D([bx + bw + ov, by + bd + ov, gz1 + 0.4]) + 0.2 });
      S.count('ROOF');

      // ---- the core, and the free-standing planes ----
      const cw = 2 * M, cd = (R.chance(0.5) ? 2 : 3) * M;
      const cxm = bx + Math.round(R.range(1, Math.max(1, bw / M - cw / M - 1))) * M;
      const cym = by + Math.round(R.range(1, Math.max(1, bd / M - cd / M - 1))) * M;
      onM(cxm - bx); onM(cym - by);
      S.box(cxm, cym, gz0, cw, cd, H, { color: onyx, alpha: 170, mode: 'pencil', spacing: 2.4, angle: 'edge', edge: EDGE, tag: 'core' });
      S.count('CORE');
      const planes = [];
      const nPl = R.int(1, 3);
      for (let i = 0; i < nPl; i++) {
        const alongX = R.chance(0.5);
        const len = R.int(2, 4) * M, t = 0.2;
        const x0 = bx + R.int(1, Math.max(1, Math.round((bw - (alongX ? len : t)) / M) - 1)) * M;
        const y0 = by + R.int(1, Math.max(1, Math.round((bd - (alongX ? t : len)) / M) - 1)) * M;
        const w = alongX ? len : t, d = alongX ? t : len;
        // never inside the core, never touching the skin
        if (x0 < cxm + cw && x0 + w > cxm && y0 < cym + cd && y0 + d > cym) continue;
        if (x0 < bx + M * 0.5 || x0 + w > bx + bw - M * 0.5 || y0 < by + M * 0.5 || y0 + d > by + bd - M * 0.5) continue;
        const col = R.chance(0.5) ? onyx : G.shade(stone, 0.85);
        S.box(x0, y0, gz0, w, d, Math.min(H, FH) - 0.2, { color: col, alpha: 190, mode: 'pencil', spacing: 2.2, angle: 'edge', edge: EDGE, tag: 'plane' });
        planes.push({ x: x0, y: y0, w: w, d: d });
        onM(x0 - bx); onM(y0 - by);
        S.count('PLANE');
      }

      // ---- the tenets ----
      const partTags = ['core', 'plane', 'pool'];
      const opaque = S.items.filter((it) => it.tag === 'core' || it.tag === 'plane').length / 3; // three faces each
      const lessIsMore = planes.length <= 4 && opaque <= 5 && S.items.every((it) => !it.tag || ['plinth', 'step', 'column', 'mullion', 'glaze', 'slab', 'roof', 'core', 'plane', 'pool'].indexOf(it.tag) >= 0);
      const onModule = setout.every((v) => Math.abs(v / M - Math.round(v / M)) < 0.01);
      const expressed = columns.every(([x, y]) => x < bx - 0.1 || x > bx + bw + 0.1 || y < by - 0.1 || y > by + bd + 0.1);
      const raised = plH >= 0.6 && nSteps >= 2;
      const touches = (p) => {
        const skin = p.x <= bx + 0.05 || p.x + p.w >= bx + bw - 0.05 || p.y <= by + 0.05 || p.y + p.d >= by + bd - 0.05;
        const col = columns.some(([x, y]) => x > p.x - colW && x < p.x + p.w + colW && y > p.y - colW && y < p.y + p.d + colW);
        return skin || col;
      };
      const freePlan = planes.every((p) => !touches(p));
      void partTags; void pool;
      const tenets = [
        { name: 'LESS IS MORE', ok: lessIsMore },
        { name: 'ON THE MODULE', ok: onModule },
        { name: 'STRUCTURE EXPRESSED', ok: columns.length > 0 && expressed },
        { name: 'RAISED ON PLINTH', ok: raised },
        { name: 'FREE PLAN', ok: freePlan },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.mies = STYLE;
})(window);
