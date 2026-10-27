/*
 * styles/bawa.js — BAWA: the courtyard house.
 *
 * Geoffrey Bawa's tropical modernism: a house is a sequence of pavilions round an
 * open court, joined by covered walks, never one roof over everything. Each pavilion
 * stands on a low plinth under a deep hipped tile roof whose eaves reach out over a
 * veranda, an open colonnade on the court side; the walls are plain and the sides
 * open. The court holds water and one tree.
 *
 * Five tenets over the drawn scene: courtyard central (three or four pavilions round
 * an open court), deep eaves (a metre and four fifths or more), veranda on every
 * pavilion (a colonnade on the court side), water (a pool in the court), covered
 * route (the verandas joined at every corner). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'BAWA',
    header: 'TROPICAL MODERN',
    titles: ['COURTYARD HOUSE', 'DEEP EAVES', 'VERANDA STUDY', 'LUNUGANGA', 'PAVILION PLAN'],
    substyles: ['LUNUGANGA', 'KANDALAMA', 'BENTOTA', 'CINNAMON HILL', 'TRIANGLE'],
    types: ['HOUSE', 'HOTEL', 'VILLA'],
    palettes: ['KANDY', 'LUNUGANGA', 'CEYLON'],
    sites: [['PARK', 3], ['HILLSIDE', 2], ['WATERFRONT', 2]],
    shapes: ['COURT'],
    floors: [1, 2],
    legend: [['PAVILION', 'bar'], ['VERANDA', 'cols'], ['POST', 'dot'], ['ROOF', 'dash'], ['POOL', 'wave'], ['WALK', 'sq']],

    size(rng, annex) {
      const w = rng.range(40, 46), d = rng.range(34, 38);
      return annex ? { w: w * 0.6, d: d * 0.72 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, tile = c[0], plaster = c[1], timber = c[2], leaf = c[3], water = c[4];
      const H = N * FH, cx = P.x + P.w / 2, cy = P.y + P.d / 2;
      const cw = Math.min(P.w - 30, Rn.range(11, 14)), cd = Math.min(P.d - 24, Rn.range(8, 10.5)), vw = 2.6, pw = 6.5;
      const over = Rn.range(1.4, 2.6);
      const sides = ['N', 'S', 'W', 'E'], drop = Rn.chance(0.4) ? Rn.pick(sides) : null;
      const have = {};
      const pavs = [];
      let posts = 0;
      const names = ctx.type === 'HOTEL' ? ['SUITES', 'RESTAURANT', 'LOBBY'] : ['LIVING PAVILION', 'DINING PAVILION', 'BEDROOMS', 'STUDY'];
      const wallO = { color: plaster, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'wall' };
      let wi = 0;

      // a pavilion whose veranda faces the court on the side given
      const pavilion = (side) => {
        let x0, y0, w0, d0, vx, vy, vww, vdd; // pavilion rect and veranda rect
        if (side === 'N') { w0 = cw + 2 * (vw + pw); d0 = pw; x0 = cx - w0 / 2; y0 = cy - cd / 2 - vw - pw; vx = cx - w0 / 2; vy = cy - cd / 2 - vw; vww = w0; vdd = vw; }
        else if (side === 'S') { w0 = cw + 2 * (vw + pw); d0 = pw; x0 = cx - w0 / 2; y0 = cy + cd / 2 + vw; vx = x0; vy = cy + cd / 2; vww = w0; vdd = vw; }
        else if (side === 'W') { w0 = pw; d0 = cd; x0 = cx - cw / 2 - vw - pw; y0 = cy - cd / 2; vx = cx - cw / 2 - vw; vy = y0; vww = vw; vdd = cd; }
        else { w0 = pw; d0 = cd; x0 = cx + cw / 2 + vw; y0 = cy - cd / 2; vx = cx + cw / 2; vy = y0; vww = vw; vdd = cd; }
        if (x0 < P.x + over || y0 < P.y + over || x0 + w0 > P.x + P.w - over || y0 + d0 > P.y + P.d - over) return null;
        const px0 = Math.min(x0, vx), py0 = Math.min(y0, vy), px1 = Math.max(x0 + w0, vx + vww), py1 = Math.max(y0 + d0, vy + vdd);
        S.box(px0, py0, 0, px1 - px0, py1 - py0, 0.5, { color: timber, alpha: 100, mode: 'flat', edge: K.THIN, tag: 'plinth' });
        // plain walls on the three sides away from the court
        const t = 0.35;
        if (side === 'N') { S.box(x0, y0, 0.5, w0, t, H, wallO); S.box(x0, y0 + t, 0.5, t, d0 - t, H, wallO); S.box(x0 + w0 - t, y0 + t, 0.5, t, d0 - t, H, wallO); }
        else if (side === 'S') { S.box(x0, y0 + d0 - t, 0.5, w0, t, H, wallO); S.box(x0, y0, 0.5, t, d0 - t, H, wallO); S.box(x0 + w0 - t, y0, 0.5, t, d0 - t, H, wallO); }
        else if (side === 'W') { S.box(x0, y0, 0.5, t, d0, H, wallO); S.box(x0 + t, y0, 0.5, w0 - t, t, H, wallO); S.box(x0 + t, y0 + d0 - t, 0.5, w0 - t, t, H, wallO); }
        else { S.box(x0 + w0 - t, y0, 0.5, t, d0, H, wallO); S.box(x0, y0, 0.5, w0 - t, t, H, wallO); S.box(x0, y0 + d0 - t, 0.5, w0 - t, t, H, wallO); }
        S.count('WALL', 3);
        // the veranda: posts along the court edge
        const edgePts = [];
        const nP = Math.max(3, Math.round((side === 'N' || side === 'S' ? vww : vdd) / 2.8));
        const hasVeranda = !(Rn.chance(0.1));
        if (hasVeranda) {
          for (let i = 0; i <= nP; i++) {
            const f = i / nP;
            let x, y;
            if (side === 'N') { x = vx + f * vww; y = vy + vdd - 0.2; }
            else if (side === 'S') { x = vx + f * vww; y = vy + 0.2; }
            else if (side === 'W') { x = vx + vww - 0.2; y = vy + f * vdd; }
            else { x = vx + 0.2; y = vy + f * vdd; }
            S.box(x - 0.15, y - 0.15, 0.5, 0.3, 0.3, H + 0.3, { color: timber, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'post' });
            posts++; edgePts.push([x, y]);
          }
          S.count('POST', nP + 1); S.count('VERANDA');
        }
        // the hipped roof over pavilion and veranda together
        K.hip(S, [[px0, py0], [px1, py0], [px1, py1], [px0, py1]], H + 0.5 + 0.3, 0.36 * Math.min(px1 - px0, py1 - py0) * 0.5, 0.5, over, tile, 'roof');
        S.count('ROOF');
        pavs.push({ side: side, veranda: hasVeranda });
        have[side] = { px0: px0, py0: py0, px1: px1, py1: py1, vx: vx, vy: vy, vww: vww, vdd: vdd };
        if (ctx.M) {
          for (let k = 0; k < N; k++) ctx.M.space({ name: names[(wi + k) % names.length], kind: 'room', x: x0, y: y0, w: w0, d: d0, z: 0.5 + k * FH, h: FH - 0.3, level: k });
          ctx.M.space({ name: 'VERANDA', kind: 'loggia', x: vx, y: vy, w: vww, d: vdd, z: 0.5, h: H, level: 0 });
        }
        wi++;
        return true;
      };
      for (const s of sides) if (s !== drop) pavilion(s);

      // covered walk at each corner where two verandas meet
      let gaps = 0;
      const corner = (a, b, x, y) => {
        if (!have[a] || !have[b]) return;
        if (Rn.chance(0.15)) { gaps++; return; }
        S.box(x, y, H + 0.5, vw, vw, 0.2, { color: tile, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'roof' });
        for (const p of [[x + 0.15, y + 0.15], [x + vw - 0.45, y + vw - 0.45]]) S.box(p[0], p[1], 0.5, 0.3, 0.3, H, { color: timber, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'post' });
        S.count('WALK');
      };
      corner('N', 'W', cx - cw / 2 - vw, cy - cd / 2 - vw); corner('N', 'E', cx + cw / 2, cy - cd / 2 - vw);
      corner('S', 'W', cx - cw / 2 - vw, cy + cd / 2); corner('S', 'E', cx + cw / 2, cy + cd / 2);

      // the court: a pool, stepping stones, one tree
      const pool = !Rn.chance(0.15);
      if (pool) {
        const pw2 = cw * 0.55, pd2 = cd * 0.5, px = cx - pw2 / 2, py = cy - pd2 / 2 + 0.6;
        S.face(G.rect(px, py, 0.08, pw2, pd2), { fill: { color: water, alpha: 100, mode: 'flat' }, edge: K.EDGE, tag: 'pool' });
        for (let k = 1; k <= 3; k++) S.line([[px + 0.5, py + (pd2 * k) / 4, 0.1], [px + pw2 - 0.5, py + (pd2 * k) / 4 + Rn.range(-0.1, 0.1), 0.1]], { alpha: 70, weight: 0.6, wob: 1.2 }, { depth: D([px + pw2, py + pd2, 0]) + 0.03 });
        S.count('POOL');
        if (ctx.M) ctx.M.space({ name: 'POOL', kind: 'water', x: px, y: py, w: pw2, d: pd2, z: 0, h: 0, level: 0 });
      }
      const tx = cx + cw * 0.3, ty = cy - cd * 0.28;
      K.cyl(S, tx, ty, 0, 0.25, 3.0, timber, 'trunk', 8);
      K.sphere(S, tx, ty, 4.2, 1.9, leaf, 'foliage');
      if (ctx.M) ctx.M.space({ name: 'COURT', kind: 'court', x: cx - cw / 2, y: cy - cd / 2, w: cw, d: cd, z: 0, h: 0, level: 0 });

      const tenets = [
        { name: 'COURTYARD CENTRAL', ok: pavs.length >= 3 },
        { name: 'DEEP EAVES', ok: over >= 1.8 },
        { name: 'VERANDA ON EVERY PAVILION', ok: pavs.length > 0 && pavs.every((q) => q.veranda) },
        { name: 'WATER IN THE COURT', ok: pool },
        { name: 'COVERED ROUTE', ok: gaps === 0 && pavs.length >= 3 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0.5 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.bawa = STYLE;
})(window);
