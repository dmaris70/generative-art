/*
 * styles/wright.js — WRIGHT: the prairie house.
 *
 * Frank Lloyd Wright's horizontal: a hearth at the centre, a tall chimney mass the
 * house is built round, and wings reaching out from it on a pinwheel, each under a
 * low hipped roof with eaves that run a long way past the wall; beneath each eave
 * one continuous band of windows; low garden walls running out into the landscape,
 * a terrace with urns. Everything is long and low except the one thing that anchors it.
 *
 * Five tenets over the drawn scene: hearth at the centre (the chimney within a sixth of
 * the footprint's middle), deep eaves (a metre and a fifth or more), horizontal
 * emphasis (the footprint two and a half times its height), a band of windows on every
 * wing, wings radiate (three or more wings and two garden walls). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, K = global.Kit;
  const STYLE = {
    key: 'WRIGHT',
    header: 'PRAIRIE',
    titles: ['PRAIRIE HOUSE', 'LOW ROOFS', 'HEARTH AND WINGS', 'ROBIE STUDY', 'USONIAN PLAN'],
    substyles: ['ROBIE', 'WILLITS', 'DANA', 'HEURTLEY', 'COONLEY'],
    types: ['HOUSE', 'VILLA'],
    palettes: ['PRAIRIE', 'ROBIE', 'TALIESIN'],
    sites: [['PARK', 3], ['CITY EDGE', 2], ['HILLSIDE', 1]],
    shapes: ['PINWHEEL'],
    floors: [1, 2],
    legend: [['WING', 'bar'], ['HEARTH', 'sqh'], ['BAND', 'grid'], ['EAVE', 'dash'], ['WALL', 'sq'], ['URN', 'dot']],

    size(rng, annex) {
      const w = rng.range(40, 48), d = rng.range(32, 38);
      return annex ? { w: w * 0.55, d: d * 0.7 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, wallC = c[0], roofC = c[1], sill = c[2];
      const cx = P.x + P.w / 2 + Rn.range(-0.2, 0.2) * P.w * 0.3, cy = P.y + P.d / 2 + Rn.range(-0.2, 0.2) * P.d * 0.3;
      const over = Rn.range(0.9, 2.3), H = N * FH;
      const wings = [];
      const wall = { color: wallC, alpha: 150, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: K.EDGE, tag: 'wall' };
      const volume = (x, y, bw, bd, n, bandOK, label) => {
        const h = n * FH;
        S.box(x, y, 0, bw, bd, h, wall);
        S.box(x - 0.05, y - 0.05, 0, bw + 0.1, bd + 0.1, 0.5, { color: sill, alpha: 120, mode: 'flat', edge: K.THIN, tag: 'wall' });
        if (bandOK) {
          for (let k = 0; k < n; k++) {
            K.aperture(S, 'y1', y + bd, x + 0.6, x + bw - 0.6, (k + 1) * FH - 1.55, (k + 1) * FH - 0.55, 'rect', K.VOID, 'band');
            K.aperture(S, 'x1', x + bw, y + 0.6, y + bd - 0.6, (k + 1) * FH - 1.55, (k + 1) * FH - 0.55, 'rect', K.VOID, 'band');
            S.count('BAND', 2);
          }
        }
        const rise = 0.2 * Math.min(bw, bd);
        K.hip(S, [[x, y], [x + bw, y], [x + bw, y + bd], [x, y + bd]], h, rise, 0.45, over, roofC, 'roof');
        S.count('EAVE');
        wings.push({ band: bandOK, label: label, x: x, y: y, w: bw, d: bd, n: n });
        S.count('WING');
        return h;
      };

      // the central living block and the hearth
      const lw = Rn.range(9, 12), ld = Rn.range(6.5, 8.5);
      const lx = cx - lw / 2, ly = cy - ld / 2;
      volume(lx, ly, lw, ld, N, true, 'living');
      const hw = 3.2, hd = 2.2, hx = cx - hw / 2 + Rn.range(-1, 1) * (Rn.chance(0.25) ? 6 : 0.8), hy = cy - hd / 2 + Rn.range(-1, 1) * (Rn.chance(0.25) ? 4 : 0.5);
      S.box(hx, hy, 0, hw, hd, N * FH + 3.4, { color: G.shade(sill, 0.7), alpha: 190, mode: 'pencil', spacing: 2.4, angle: 'edge', edge: K.EDGE, tag: 'hearth' });
      S.box(hx - 0.2, hy - 0.2, N * FH + 3.4, hw + 0.4, hd + 0.4, 0.3, { color: sill, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'hearth' });
      S.count('HEARTH');

      // wings on a pinwheel: east, south, west, north, three or four of them
      const dirs = Rn.shuffle(['E', 'S', 'W', 'N']).slice(0, Rn.chance(0.55) ? 4 : 3);
      const walls = [];
      const names = ['DINING ROOM', 'BEDROOMS', 'KITCHEN', 'STUDIO', 'PLAYROOM'];
      let wi = 0;
      for (const dir of dirs) {
        const len = Rn.range(7, 10), wd = Rn.range(5, 6.5), n = Math.max(1, N - Rn.int(0, 1)), bandOK = !Rn.chance(0.12);
        let x, y, bw, bd;
        if (dir === 'E') { x = lx + lw; y = cy - wd / 2 + Rn.range(-1.5, 1.5); bw = len; bd = wd; }
        else if (dir === 'W') { x = lx - len; y = cy - wd / 2 + Rn.range(-1.5, 1.5); bw = len; bd = wd; }
        else if (dir === 'S') { x = cx - wd / 2 + Rn.range(-1.5, 1.5); y = ly + ld; bw = wd; bd = len; }
        else { x = cx - wd / 2 + Rn.range(-1.5, 1.5); y = ly - len; bw = wd; bd = len; }
        if (x < P.x + over || y < P.y + over || x + bw > P.x + P.w - over || y + bd > P.y + P.d - over) continue;
        volume(x, y, bw, bd, n, bandOK, dir);
        if (ctx.M) for (let k = 0; k < n; k++) ctx.M.space({ name: names[(wi + k) % names.length], kind: 'room', x: x, y: y, w: bw, d: bd, z: k * FH, h: FH - 0.3, level: k });
        wi++;
        // a garden wall running on from the wing's end
        const wl = Rn.range(4, 9), wt = 0.45, wh = 1.1;
        const gw = { color: wallC, alpha: 130, mode: 'flat', edge: K.THIN, tag: 'wall' };
        let gx, gy, gwid, gd;
        if (dir === 'E') { gx = x + bw; gy = y + Rn.range(0.5, bd - 1); gwid = wl; gd = wt; }
        else if (dir === 'W') { gx = x - wl; gy = y + Rn.range(0.5, bd - 1); gwid = wl; gd = wt; }
        else if (dir === 'S') { gx = x + Rn.range(0.5, bw - 1); gy = y + bd; gwid = wt; gd = wl; }
        else { gx = x + Rn.range(0.5, bw - 1); gy = y - wl; gwid = wt; gd = wl; }
        if (gx >= P.x && gy >= P.y && gx + gwid <= P.x + P.w && gy + gd <= P.y + P.d) { S.box(gx, gy, 0, gwid, gd, wh, gw); walls.push(1); S.count('WALL'); }
      }
      // a terrace with urns
      const tx = lx + lw * 0.2, ty = ly + ld, tw = 6.5, td = 3.2;
      if (ty + td < P.y + P.d - 0.5) {
        S.box(tx, ty, 0, tw, td, 0.45, { color: sill, alpha: 100, mode: 'flat', edge: K.EDGE, tag: 'terrace' });
        for (const u of [[tx + 0.5, ty + td - 0.5], [tx + tw - 0.5, ty + td - 0.5]]) { K.cyl(S, u[0], u[1], 0.45, 0.45, 0.8, sill, 'urn', 10); S.count('URN'); }
        if (ctx.M) ctx.M.space({ name: 'TERRACE', kind: 'terrace', x: tx, y: ty, w: tw, d: td, z: 0, h: 0.45, level: 0 });
      }
      if (ctx.M) {
        for (let k = 0; k < N; k++) ctx.M.space({ name: 'LIVING ROOM', kind: 'room', x: lx, y: ly, w: lw, d: ld, z: k * FH, h: FH - 0.3, level: k, area: lw * ld - hw * hd });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: hx + hw, y: hy, w: 1.2, d: hd, z: 0, h: N * FH, level: 0 });
      }

      // the tenets
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of wings) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x + q.w); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y + q.d); }
      const ex = Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const hearthOK = Math.abs(hx + hw / 2 - mx) <= ex / 6 && Math.abs(hy + hd / 2 - my) <= ex / 6;
      const tenets = [
        { name: 'HEARTH AT THE CENTRE', ok: hearthOK },
        { name: 'DEEP EAVES', ok: over >= 1.2 },
        { name: 'HORIZONTAL EMPHASIS', ok: ex / (N * FH + 0.2 * Math.min(lw, ld)) >= 2.5 },
        { name: 'BAND ON EVERY WING', ok: wings.every((q) => q.band) },
        { name: 'WINGS RADIATE', ok: wings.length >= 4 && walls.length >= 2 },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.wright = STYLE;
})(window);
