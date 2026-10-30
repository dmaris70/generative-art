/*
 * styles/santelia.js — SANT'ELIA: the Futurist city.
 *
 * Antonio Sant'Elia's Città Nuova, 1914: a city built like a vast tumultuous shipyard,
 * agile, mobile, dynamic. Towers step back in tiers with no ornament at all, the lift
 * shafts climb the outside of the walls in tall bare cylinders of concrete and glass,
 * bridges tie the towers together at several heights, a long low power station with its
 * stacks lies at the foot, and every roof and flight runs on the oblique.
 *
 * Five tenets over the drawn scene: stepped profile (each tier smaller than the one
 * below), external lifts (the shafts outside the wall), no ornament (no cornice or
 * moulding anywhere), bridged (the towers tied together), oblique lines (a sloping roof
 * or flight). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth, K = global.Kit;
  const STYLE = {
    key: 'SANTELIA',
    header: 'FUTURIST CITY',
    titles: ['CITTA NUOVA', 'STEPPED TOWER', 'POWER STATION', 'DYNAMIC CITY', 'FUTURIST STUDY'],
    substyles: ['CITTA NUOVA', 'STAZIONE', 'CENTRALE', 'CASA A GRADINATA', 'AEROPORTO'],
    types: ['TOWER', 'STATION'],
    palettes: ['FUTURA', 'CEMENTO', 'VELOCITA'],
    sites: [['CITY', 3], ['PLAZA DIST', 2], ['WATERFRONT', 2]],
    shapes: ['STEPPED'],
    floors: [5, 8],
    legend: [['TIER', 'sq'], ['LIFT', 'bar'], ['BRIDGE', 'dash'], ['STACK', 'circ'], ['SLOPE', 'ramp'], ['WINDOW', 'grid']],

    size(rng, annex) {
      const w = rng.range(40, 46), d = rng.range(32, 36);
      return annex ? { w: w * 0.6, d: d * 0.75 } : { w: w, d: d };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, conc = c[0], glassC = c[1], accent = c[2], dark = c[3];
      const nT = Rn.int(3, 4), H = N * FH, th = H / nT;
      const tw = 16, td = 14;
      const tx = P.x + 3, ty = P.y + 4;
      const wallO = (col) => ({ color: col, alpha: 135, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: K.EDGE, tag: 'tier' });
      const tiers = [];
      let ok = true, prev = Infinity;
      const tower = (x, y, w, d, n, h, label) => {
        const out = [];
        for (let k = 0; k < n; k++) {
          const inset = k * 1.8 * (k === 2 && Rn.chance(0.1) ? -0.5 : 1), x0 = x + inset, y0 = y + inset, w0 = w - 2 * inset, d0 = d - 2 * inset;
          if (w0 <= 3 || d0 <= 3) break;
          const area = w0 * d0;
          if (label === 'main') { if (area >= prev) ok = false; prev = area; }
          S.box(x0, y0, k * h, w0, d0, h, wallO(k % 2 ? glassC : conc)); S.count('TIER');
          // narrow vertical windows on the two visible faces
          const nw = Math.max(3, Math.round(w0 / 2)), nd = Math.max(3, Math.round(d0 / 2));
          for (let i = 0; i < nw; i++) K.aperture(S, 'y1', y0 + d0, x0 + ((i + 0.3) / nw) * w0, x0 + ((i + 0.6) / nw) * w0, k * h + 0.8, (k + 1) * h - 0.8, 'rect', K.VOID, 'window');
          for (let i = 0; i < nd; i++) K.aperture(S, 'x1', x0 + w0, y0 + ((i + 0.3) / nd) * d0, y0 + ((i + 0.6) / nd) * d0, k * h + 0.8, (k + 1) * h - 0.8, 'rect', K.VOID, 'window');
          S.count('WINDOW', nw + nd);
          if (ctx.M) ctx.M.space({ name: 'OFFICES', kind: 'room', x: x0, y: y0, w: w0, d: d0, z: k * h, h: h - 0.3, level: Math.floor((k * h) / FH) });
          out.push({ x: x0, y: y0, w: w0, d: d0, z: k * h });
        }
        return out;
      };
      const mainT = tower(tx, ty, tw, td, nT, th, 'main');
      tiers.push(...mainT);
      // a second, lower tower to the east, the bridge between
      const sx = tx + tw + 9, sw = 9, sd = 8, sn = Math.max(2, nT - 1), sh = (H * 0.7) / sn;
      tower(sx, ty + 1.5, sw, sd, sn, sh, 'second');
      let bridges = 0;
      if (!Rn.chance(0.15)) {
        for (const f of [0.45, 0.75]) {
          const z = H * f * 0.9;
          S.box(tx + tw - 2.2 * Math.round(f * nT) * 0.5, ty + 3.5, z, sx - (tx + tw) + 2, 2.2, 1.2, { color: glassC, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'bridge' }); S.count('BRIDGE'); bridges++;
        }
      }
      // the lift shafts, outside the front wall, taller than the tower
      const inside = Rn.chance(0.15);
      const lifts = [];
      for (const lx of [tx + 1.2, tx + tw - 3.6]) {
        const ly = inside ? ty + 1 : ty + td;
        S.box(lx, ly, 0, 2.4, 2.4, H + 3.2, { color: conc, alpha: 150, mode: 'pencil', spacing: 2.4, angle: 'edge', edge: K.EDGE, tag: 'core' }); S.count('LIFT');
        lifts.push({ x: lx, y: ly });
        if (ctx.M) ctx.M.space({ name: 'CORE', kind: 'service', x: lx, y: ly, w: 2.4, d: 2.4, z: 0, h: H + 3.2, level: 0 });
      }
      // the power station: a long low block with three stacks
      const px = tx, py = ty + td + 5, pw = 20, pd = 6;
      S.box(px, py, 0, pw, pd, 4.2, { color: dark, alpha: 120, mode: 'pencil', spacing: 2.6, angle: 'edge', edge: K.EDGE, tag: 'wall' });
      for (let i = 0; i < 3; i++) { K.cyl(S, px + 3 + i * 6.5, py + pd / 2, 4.2, 0.9, 9 + i * 1.5, conc, 'stack', 10); S.count('STACK'); }
      if (ctx.M) ctx.M.space({ name: 'POWER HALL', kind: 'room', x: px, y: py, w: pw, d: pd, z: 0, h: 4.2, level: 0 });
      // an oblique: a sloping roof on the top tier of the main tower
      const slope = !Rn.chance(0.15), top = mainT[mainT.length - 1];
      if (slope && top) {
        const z0 = H, base = [[top.x, top.y, z0], [top.x + top.w, top.y, z0], [top.x + top.w, top.y + top.d, z0], [top.x, top.y + top.d, z0]];
        const tp = [[top.x, top.y, z0 + 4.2], [top.x + top.w, top.y, z0 + 4.2], [top.x + top.w, top.y + top.d, z0 + 0.4], [top.x, top.y + top.d, z0 + 0.4]];
        const pr = G.prism(base, tp);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: accent, alpha: 150, mode: 'pencil', spacing: 2.4, angle: 'edge' }, edge: K.EDGE, tag: 'slope' });
        S.face(tp, { fill: { color: G.shade(accent, 1.1), alpha: 150, mode: 'flat' }, edge: K.EDGE, tag: 'slope' }); S.count('SLOPE');
      }
      const cornice = Rn.chance(0.12);
      if (cornice) S.box(tx - 0.4, ty - 0.4, th - 0.5, tw + 0.8, td + 0.8, 0.5, { color: conc, alpha: 130, mode: 'flat', edge: K.EDGE, tag: 'cornice' });

      const tenets = [
        { name: 'STEPPED PROFILE', ok: ok && mainT.length >= 3 },
        { name: 'EXTERNAL LIFTS', ok: !inside },
        { name: 'NO ORNAMENT', ok: !cornice },
        { name: 'BRIDGED', ok: bridges >= 2 },
        { name: 'OBLIQUE LINES', ok: slope },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.santelia = STYLE;
})(window);
