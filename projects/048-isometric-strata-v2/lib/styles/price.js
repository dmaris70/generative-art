/*
 * styles/price.js — PRICE: the Fun Palace.
 *
 * Cedric Price's Fun Palace, 1961: not a building but a kit of parts and a crane, a
 * steel framework with no fixed use, in which floors, walls and rooms are lifted
 * in and out as the day demands, and the whole is expected to be demolished when it
 * is no longer wanted. The grammar is a bare frame of columns and ruled beams, a
 * gantry crane on rails across the top, floor plates and room modules sitting in some
 * bays, and one module in the air on the hook.
 *
 * Five tenets over the drawn scene: framework only (thirty or more columns), crane (a
 * gantry on the top), movable (twelve or more modules), temporary (no solid wall), in
 * transit (a module hanging from the hook). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'PRICE',
    header: 'FUN PALACE',
    titles: ['FUN PALACE', 'NO FIXED USE', 'THINKBELT', 'FRAMEWORK', 'INTERACTION'],
    substyles: ['FUN PALACE', 'THINKBELT', 'INTERACTION', 'MAGIC', 'POTTERIES'],
    types: ['FRAMEWORK', 'CENTRE'],
    palettes: ['SCAFFOLD', 'GANTRY', 'SIGNAL'],
    sites: [['CITY EDGE', 3], ['WATERFRONT', 2], ['CITY', 2]],
    shapes: ['FRAME'],
    floors: [3, 5],
    legend: [['COLUMN', 'cols'], ['BEAM', 'dash'], ['MODULE', 'sq'], ['PLATE', 'sqf'], ['GANTRY', 'bar'], ['BRACE', 'x']],

    size(rng, annex) {
      const w = rng.range(40, 46), d = rng.range(30, 34);
      return annex ? { w: w * 0.55, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, steel = c[0], plateC = c[1], modC = c[2], modC2 = c[3];
      const bay = ctx.annex ? 5.6 : 6.8, nx = Math.max(3, Math.floor((P.w - 4) / bay)), ny = Math.max(2, Math.floor((P.d - 4) / bay));
      const H = N * FH, x0 = P.x + (P.w - nx * bay) / 2, y0 = P.y + (P.d - ny * bay) / 2;
      const xs = [], ys = [];
      for (let i = 0; i <= nx; i++) xs.push(x0 + i * bay);
      for (let j = 0; j <= ny; j++) ys.push(y0 + j * bay);
      const beam = { color: steel, alpha: 185, weight: 0.85, wob: 0.3 }, brace = { color: steel, alpha: 110, weight: 0.6, wob: 0.3 };
      let nCols = 0;
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) { S.box(xs[i] - 0.25, ys[j] - 0.25, 0, 0.5, 0.5, H + 0.6, { color: steel, alpha: 200, mode: 'flat', edge: K.EDGE, tag: 'column' }); nCols++; }
      S.count('COLUMN', nCols);
      // the ruled beams at every floor line, and X-braces in a few bays on the front and end
      for (let k = 1; k <= N; k++) {
        const z = k * FH;
        for (let i = 0; i <= nx; i++) S.line([[xs[i], ys[0], z], [xs[i], ys[ny], z]], beam, { depth: D([xs[i], ys[ny], z]) + 0.02, tag: 'beam' });
        for (let j = 0; j <= ny; j++) S.line([[xs[0], ys[j], z], [xs[nx], ys[j], z]], beam, { depth: D([xs[nx], ys[j], z]) + 0.02, tag: 'beam' });
        S.count('BEAM', nx + ny + 2);
      }
      for (let i = 0; i < nx; i++) if (Rn.chance(0.3)) { const k = Rn.int(0, N - 1); S.line([[xs[i], ys[ny], k * FH], [xs[i + 1], ys[ny], (k + 1) * FH]], brace, { depth: D([xs[i + 1], ys[ny], (k + 1) * FH]) + 0.03, tag: 'brace' }); S.count('BRACE'); }
      // plates and modules sitting in the bays
      const mods = []; let plates = 0;
      const cells = [];
      for (let k = 0; k < N; k++) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([k, i, j]);
      for (const [k, i, j] of Rn.shuffle(cells).slice(0, Math.round(cells.length * 0.32))) {
        const z = k * FH + 0.02;
        S.box(xs[i] + 0.1, ys[j] + 0.1, z, bay - 0.2, bay - 0.2, 0.22, { color: plateC, alpha: 90, mode: 'flat', edge: K.THIN, tag: 'slab' }); S.count('PLATE'); plates++;
        if (Rn.chance(0.55)) {
          const u = bay * 0.66, o = (bay - u) / 2;
          S.box(xs[i] + o, ys[j] + o, z + 0.22, u, u, 2.7, { color: Rn.chance(0.5) ? modC : modC2, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'module' }); S.count('MODULE'); mods.push(1);
          if (ctx.M) ctx.M.space({ name: 'MODULE', kind: 'unit', x: xs[i] + o, y: ys[j] + o, w: u, d: u, z: z + 0.22, h: 2.7, level: k });
        }
      }
      // the gantry: two rails along x on the top, a trolley, and one module on the hook
      const crane = !Rn.chance(0.1), hang = crane && Rn.chance(0.72);
      if (crane) {
        const zr = H + 1.6;
        for (const y of [ys[0] + 0.5, ys[ny] - 0.5]) S.box(xs[0], y - 0.3, zr, nx * bay, 0.6, 0.6, { color: steel, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'beam' });
        const tx = xs[Math.floor(nx / 2)] + Rn.range(-bay, bay), ty = (ys[0] + ys[ny]) / 2;
        S.box(tx - 1.2, ys[0] + 0.5, zr + 0.6, 2.4, ys[ny] - ys[0] - 1, 0.5, { color: modC2, alpha: 200, mode: 'flat', edge: K.EDGE, tag: 'gantry' }); S.count('GANTRY');
        if (hang) {
          const u = bay * 0.6, hz = H * 0.55;
          for (const dx of [-u / 2 + 0.3, u / 2 - 0.3]) S.line([[tx + dx, ty, zr + 0.6], [tx + dx, ty, hz + 2.7]], { color: steel, alpha: 190, weight: 0.8, wob: 0.2 }, { depth: D([tx + dx, ty, hz]) + 0.3, tag: 'cable' });
          S.box(tx - u / 2, ty - u / 2, hz, u, u, 2.7, { color: modC, alpha: 150, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'module' }); S.count('MODULE'); mods.push(1);
        }
      }
      const wallT = Rn.chance(0.12);
      if (wallT) S.box(xs[0], ys[ny], 0, nx * bay, 0.3, FH, { color: plateC, alpha: 120, mode: 'flat', edge: K.EDGE, tag: 'wall' });
      if (ctx.M) {
        ctx.M.grid(xs, ys);
        ctx.M.space({ name: 'DECK', kind: 'terrace', x: xs[0], y: ys[0], w: nx * bay, d: ny * bay, z: 0, h: 0.2, level: 0, area: Math.max(1, plates * bay * bay) });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: xs[nx] - 2, y: ys[0], w: 2, d: 3, z: 0, h: H, level: 0 });
      }
      const tenets = [
        { name: 'FRAMEWORK ONLY', ok: nCols >= 30 },
        { name: 'CRANE', ok: crane },
        { name: 'MOVABLE', ok: mods.length >= 12 },
        { name: 'TEMPORARY', ok: !wallT },
        { name: 'IN TRANSIT', ok: hang },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.price = STYLE;
})(window);
