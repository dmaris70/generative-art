/*
 * styles/palladio.js — PALLADIAN: the villa on its axis.
 *
 * The Quattro Libri as a grammar: a central block raised on a podium, its
 * plan mirror-symmetric about an axis that runs on through the garden; a
 * temple front — columns, entablature, pediment — set on that axis with a
 * broad flight of steps; windows in an ABA rhythm across the front; hipped
 * roofs; wings lower than the block, joined to it by colonnaded arms and
 * hollowed with niches; sometimes a drum and dome over the hall.
 *
 * Five tenets are run as predicates over the drawn scene: bilateral
 * symmetry (every face has its mirror twin), a portico on the axis, an ABA
 * bay rhythm, wings subordinate to the block, and a block proportioned to
 * one of Palladio's ratios. Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, plan = global.ISO.plan, D = global.ISO.depth;

  const RATIOS = [[1, 1], [2, 3], [3, 4], [3, 5], [1, Math.SQRT2], [1, 2]];

  const STYLE = {
    key: 'PALLADIAN',
    header: 'CLASSICAL',
    titles: ['VILLA DIAGRAM', 'QUATTRO LIBRI', 'PALLADIAN STUDY', 'ROTONDA SECTION', 'VILLA VENETA'],
    substyles: ['ROTONDA', 'BARCHESSA', 'TEMPLE FRONT', 'MALCONTENTA', 'EMO'],
    types: ['VILLA', 'PALAZZO', 'TEMPIETTO', 'CASINO'],
    palettes: ['INTONACO', 'PIETRA', 'VENETO'],
    sites: [['PARK', 3], ['HILLSIDE', 2], ['CITY EDGE', 1], ['PLAZA DIST', 1], ['WATERFRONT', 1]],
    shapes: ['RECTANGLE', 'RECTANGLE', 'TSHAPE', 'CROSS', 'COURT'],
    floors: [2, 3],
    legend: [
      ['PORTICO', 'tee'], ['COLUMN', 'cols'], ['PEDIMENT', 'tri'], ['WING', 'sqf'], ['AXIS', 'dash'],
      ['BAY', 'grid'], ['NICHE', 'dome'], ['STAIR', 'step'], ['TERRACE', 'sq'], ['DOME', 'circ'],
    ],

    size(rng, annex) {
      // the block's bays follow one of Palladio's ratios; wings add a third each side
      const cell = rng.range(3.4, 4.2);
      const pair = rng.pick(annex ? [[2, 2], [2, 3], [2, 4]] : [[3, 3], [4, 4], [2, 3], [4, 6], [3, 4], [3, 5], [2, 4], [3, 6]]);
      let nx = pair[0], ny = pair[1];
      if (rng.chance(0.5)) { const t = nx; nx = ny; ny = t; }
      const wingW = annex ? 0 : cell * rng.range(1.2, 2);
      return { w: nx * cell + 2 * wingW + 2 * cell * 0.6, d: ny * cell + cell * 1.2, nx: nx, ny: ny, cell: cell, wingW: wingW };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const FH = ctx.floorH, N = ctx.floors, cell = P.cell;
      const c = ctx.palette.colors;
      const stucco = c[0], roofCol = c[1], stone = c[2], umber = c[3], sky = c[4];
      const EDGE = { alpha: 180, weight: 0.95, wob: 0.85, passes: 2 };
      const THIN = { alpha: 140, weight: 0.75, wob: 0.7 };
      const FAINT = { alpha: 75, weight: 0.65, wob: 0.7 };

      const cx = P.x + P.w / 2; // the axis
      const mx = (x) => 2 * cx - x;
      const bw = P.nx * cell, bd = P.ny * cell; // the block
      const bx = cx - bw / 2, by = P.y + cell * 0.6;
      const pod = R.range(1.2, 2.0); // podium height: the piano nobile is raised
      const H = pod + N * FH; // eaves
      const front = by + bd; // the +y face carries the portico

      // ---- the podium terrace and the axis ----
      S.box(P.x, P.y, 0, P.w, P.d, pod, { color: stone, alpha: 90, mode: 'pencil', spacing: 2.8, angle: 'edge', edge: EDGE, tag: 'terrace' });
      S.count('TERRACE');
      S.line([[cx, P.y - 10, 0.02], [cx, P.y + P.d + 14, 0.02]], { alpha: 110, weight: 0.8, wob: 0.4, dash: [10, 6] }, { layer: 0, tag: 'axis' });
      S.count('AXIS');
      if (R.chance(0.5)) {
        S.line([[P.x - 8, by + bd / 2, 0.02], [P.x + P.w + 8, by + bd / 2, 0.02]], { alpha: 80, weight: 0.7, wob: 0.4, dash: [8, 6] }, { layer: 0, tag: 'axis' });
        S.count('AXIS');
      }

      // ---- the block: a symmetric mask, walls, and a hipped roof ----
      const mask = plan.mirror(plan.mask(P.nx, P.ny, ctx.shape, R));
      const loop = plan.toWorld(plan.outline(mask)[0], bx, by, cell, 0);
      const wallsFrom = (poly, z0, z1, col, tag) => {
        const pr = G.prism(poly.map((p) => [p[0], p[1], z0]), poly.map((p) => [p[0], p[1], z1]));
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: col, alpha: 140, mode: 'pencil', spacing: 2.6, angle: 'edge' }, edge: EDGE, tag: tag });
        else S.line([f.pts[0], f.pts[3]], FAINT, { depth: D(f.pts[0]) - 1, tag: tag });
        return pr;
      };
      wallsFrom(loop, pod, H, stucco, 'block');
      // string course between storeys, on the visible faces
      for (let k = 1; k < N; k++) {
        const z = pod + k * FH;
        S.box(bx - 0.08, by - 0.08, z - 0.15, bw + 0.16, bd + 0.16, 0.15, { color: stone, alpha: 120, mode: 'flat', edge: THIN, tag: 'block' });
      }
      // hipped roof: the outline drawn in toward its centre at the ridge
      const cen = G.centroid(loop);
      const ridgeH = R.range(0.22, 0.32) * Math.min(bw, bd);
      const ridge = loop.map((p) => [cen[0] + (p[0] - cen[0]) * 0.35, cen[1] + (p[1] - cen[1]) * 0.35, H + ridgeH]);
      const eave = loop.map((p) => [p[0] - Math.sign(p[0] - cen[0]) * 0.5, p[1] - Math.sign(p[1] - cen[1]) * 0.5, H]);
      const rp = G.prism(eave, ridge);
      S.box(bx - 0.5, by - 0.5, H - 0.25, bw + 1, bd + 1, 0.25, { color: stone, alpha: 120, mode: 'flat', edge: EDGE, tag: 'block' }); // cornice
      for (const f of rp.sides) if (f.visible) S.face(f.pts, { fill: { color: roofCol, alpha: 130, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'roof' });
      S.face(ridge, { fill: { color: roofCol, alpha: 90, mode: 'flat' }, edge: EDGE, tag: 'roof' });

      // ---- the temple front on the axis ----
      const nCol = R.pick([4, 6]);
      const pw = Math.min(bw * 0.6, nCol * 2.2), pdp = R.range(2.4, 3.6);
      const px0 = cx - pw / 2, py0 = front, py1 = front + pdp;
      const colH = N * FH; // a giant order, podium to eaves
      const colR = 0.32;
      const column = (x, y, z0, h, tag) => {
        const base = G.regular(x, y, z0 + 0.35, colR, 10, Math.PI / 10);
        const top = base.map((p) => [p[0], p[1], z0 + h - 0.4]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(stone, f.n[0] > f.n[1] ? 0.9 : 1.02), alpha: 150, mode: 'flat' }, edge: null, tag: tag });
        S.line([[x + colR, y, z0 + 0.35], [x + colR, y, z0 + h - 0.4]], THIN, { tag: tag, depth: D([x + colR, y, z0]) + 0.05 });
        S.line([[x, y + colR, z0 + 0.35], [x, y + colR, z0 + h - 0.4]], THIN, { tag: tag, depth: D([x, y + colR, z0]) + 0.05 });
        S.box(x - 0.45, y - 0.45, z0, 0.9, 0.9, 0.35, { color: stone, alpha: 150, mode: 'flat', edge: THIN, tag: tag });
        S.box(x - 0.45, y - 0.45, z0 + h - 0.4, 0.9, 0.9, 0.4, { color: stone, alpha: 150, mode: 'flat', edge: THIN, tag: tag });
        S.count('COLUMN');
      };
      const colXs = [];
      for (let i = 0; i < nCol; i++) colXs.push(px0 + 0.6 + (pw - 1.2) * i / (nCol - 1));
      for (const x of colXs) column(x, py1 - 0.6, pod, colH, 'portico');
      // entablature and pediment
      S.box(px0, py0, pod + colH, pw, pdp, 0.7, { color: stucco, alpha: 150, mode: 'flat', edge: EDGE, tag: 'portico' });
      const pedH = pw * 0.22, ze = pod + colH + 0.7;
      const tri = [[px0, py1, ze], [px0 + pw, py1, ze], [cx, py1, ze + pedH]];
      S.face(tri, { fill: { color: stucco, alpha: 160, mode: 'pencil', spacing: 2.4, angle: 0 }, edge: EDGE, tag: 'pediment' });
      const slopeR = [[px0 + pw, py1, ze], [cx, py1, ze + pedH], [cx, py0, ze + pedH], [px0 + pw, py0, ze]];
      S.face(slopeR, { fill: { color: roofCol, alpha: 130, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'pediment' });
      const slopeL = [[px0, py1, ze], [cx, py1, ze + pedH], [cx, py0, ze + pedH], [px0, py0, ze]];
      S.face(slopeL, { fill: { color: roofCol, alpha: 110, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'pediment' });
      S.count('PORTICO');
      S.count('PEDIMENT');
      // the flight of steps to the portico
      const steps = R.int(6, 9), rise = pod / steps, run = 0.32;
      for (let s = 0; s < steps; s++) {
        const z = s * rise;
        S.box(px0 - 0.3, py1 + (steps - 1 - s) * run, 0, pw + 0.6, run, z + rise, { color: stone, alpha: 90, mode: 'flat', edge: THIN, tag: 'stair' });
      }
      S.count('STAIR');

      // ---- the front bays: windows in ABA rhythm either side of the portico ----
      const window = (x, y, z, w, h, nrm, tag) => {
        const o = 0.03;
        const q = nrm === 'y'
          ? [[x, y + o, z], [x + w, y + o, z], [x + w, y + o, z + h], [x, y + o, z + h]]
          : [[x + o, y, z], [x + o, y + w, z], [x + o, y + w, z + h], [x + o, y, z + h]];
        S.face(q, { fill: { color: sky, alpha: 110, mode: 'flat' }, edge: THIN, tag: tag, depth: D(q[0]) + 0.2 });
        // a small pediment over it
        const t = nrm === 'y'
          ? [[x - 0.15, y + o, z + h + 0.1], [x + w + 0.15, y + o, z + h + 0.1], [x + w / 2, y + o, z + h + 0.5]]
          : [[x + o, y - 0.15, z + h + 0.1], [x + o, y + w + 0.15, z + h + 0.1], [x + o, y + w / 2, z + h + 0.5]];
        S.line(t.concat([t[0]]), THIN, { tag: tag, depth: D(t[0]) + 0.2 });
      };
      const flank = px0 - bx; // width left of the portico
      const nWin = Math.max(1, Math.floor(flank / R.range(2.6, 3.4)));
      const bays = [];
      for (let i = 0; i < nWin; i++) {
        const bwid = flank / nWin;
        bays.push(bwid);
        const wx = bx + bwid * (i + 0.5) - 0.55;
        for (let k = 0; k < N; k++) {
          window(wx, front, pod + k * FH + 1.0, 1.1, k === 0 ? 2.2 : 1.6, 'y', 'bay');
          window(mx(wx) - 1.1, front, pod + k * FH + 1.0, 1.1, k === 0 ? 2.2 : 1.6, 'y', 'bay');
        }
      }
      const bayList = bays.concat([pw], bays.slice().reverse());
      S.count('BAY', bayList.length);
      // and the side face, evenly
      const nSide = Math.max(2, Math.floor(bd / 3));
      for (let i = 0; i < nSide; i++) for (let k = 0; k < N; k++) window(bx + bw, by + (bd / nSide) * (i + 0.5) - 0.55, pod + k * FH + 1.0, 1.1, k === 0 ? 2.2 : 1.6, 'x', 'bay');

      // ---- wings, lower, joined by colonnaded arms, hollowed with niches ----
      let wingH = 0;
      if (P.wingW > 0) {
        const ww = P.wingW, wd = bd * R.range(0.45, 0.7), wh = pod + FH * R.range(0.9, 1.3);
        wingH = wh;
        const gap = cell * 0.6;
        const wy = front - wd; // wings align to the front
        const wing = (x0) => {
          S.box(x0, wy, pod, ww, wd, wh - pod, { color: stucco, alpha: 130, mode: 'pencil', spacing: 2.6, edge: EDGE, tag: 'wing' });
          // a shallow hipped roof
          const e = G.rect(x0 - 0.3, wy - 0.3, wh, ww + 0.6, wd + 0.6);
          const rg = G.rect(x0 + ww * 0.25, wy + wd * 0.25, wh + Math.min(ww, wd) * 0.22, ww * 0.5, wd * 0.5);
          const pr = G.prism(e, rg);
          for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: roofCol, alpha: 130, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: 'wingroof' });
          S.face(rg, { fill: { color: roofCol, alpha: 90, mode: 'flat' }, edge: EDGE, tag: 'wingroof' });
          // niches on the front face
          const nN = Math.max(1, Math.floor(ww / 2.4));
          for (let i = 0; i < nN; i++) {
            const nx = x0 + (ww / nN) * (i + 0.5) - 0.5, z = pod + 0.6, w = 1.0, h = 1.9;
            const pts = [[nx, front + 0.03, z], [nx + w, front + 0.03, z], [nx + w, front + 0.03, z + h]];
            for (let a = 0; a <= 8; a++) { const t = (a / 8) * Math.PI; pts.push([nx + w / 2 + Math.cos(t) * w / 2, front + 0.03, z + h + Math.sin(t) * w / 2]); }
            pts.push([nx, front + 0.03, z + h]);
            S.face(pts, { fill: { color: umber, alpha: 90, mode: 'hatch', spacing: 2.2, angle: 0 }, edge: THIN, tag: 'niche', depth: D(pts[0]) + 0.2 });
            S.count('NICHE');
          }
          S.count('WING');
        };
        wing(bx - gap - ww);
        wing(mx(bx - gap - ww) - ww);
        // the arms: a row of columns under an entablature across each gap
        const armH = pod + FH * 0.85;
        const nA = Math.max(2, Math.round(gap / 1.6));
        for (let i = 0; i <= nA; i++) {
          const ax = bx - gap + (gap / nA) * i;
          if (i === 0 || i === nA) continue;
          column(ax, front - 0.6, pod, armH - pod, 'arm');
          column(mx(ax), front - 0.6, pod, armH - pod, 'arm');
        }
        S.box(bx - gap, front - 1.2, armH, gap, 1.2, 0.4, { color: stucco, alpha: 140, mode: 'flat', edge: EDGE, tag: 'arm' });
        S.box(mx(bx - gap) - gap, front - 1.2, armH, gap, 1.2, 0.4, { color: stucco, alpha: 140, mode: 'flat', edge: EDGE, tag: 'arm' });
      }

      // ---- the dome over the hall ----
      let hasDome = false;
      if (ctx.substyle === 'ROTONDA' || R.chance(0.4)) {
        hasDome = true;
        const dr = Math.min(bw, bd) * 0.24, dz = H + ridgeH * 0.6, drumH = 1.6;
        const drum = G.regular(cen[0], cen[1], dz, dr, 16);
        const drumTop = drum.map((p) => [p[0], p[1], dz + drumH]);
        const pr = G.prism(drum, drumTop);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: stucco, alpha: 140, mode: 'flat' }, edge: null, tag: 'dome' });
        S.line(drumTop.concat([drumTop[0]]), EDGE, { depth: D([cen[0] + dr, cen[1] + dr, dz + drumH]) + 0.1, tag: 'dome' });
        S.line(drum.concat([drum[0]]), THIN, { depth: D([cen[0] + dr, cen[1] + dr, dz]) + 0.1, tag: 'dome' });
        const z0 = dz + drumH;
        for (let lat = 1; lat <= 3; lat++) {
          const t = (lat / 4) * Math.PI / 2;
          const ring = G.regular(cen[0], cen[1], z0 + Math.sin(t) * dr, Math.cos(t) * dr, 24);
          S.line(ring.concat([ring[0]]), lat === 3 ? FAINT : THIN, { depth: D([cen[0] + dr, cen[1] + dr, z0]) + 0.2, tag: 'dome' });
        }
        for (let m = 0; m < 8; m++) {
          const a = (m / 8) * Math.PI * 2, arc = [];
          for (let t = 0; t <= 1.001; t += 0.1) { const lat = t * Math.PI / 2; arc.push([cen[0] + Math.cos(a) * Math.cos(lat) * dr, cen[1] + Math.sin(a) * Math.cos(lat) * dr, z0 + Math.sin(lat) * dr]); }
          S.line(arc, THIN, { depth: D([cen[0] + dr, cen[1] + dr, z0]) + 0.2, tag: 'dome' });
        }
        S.box(cen[0] - 0.4, cen[1] - 0.4, z0 + dr, 0.8, 0.8, 1.0, { color: stucco, alpha: 150, mode: 'flat', edge: THIN, tag: 'dome' });
        S.count('DOME');
      }

      // ---- the garden: parterres and an avenue, mirrored about the axis ----
      const gy = P.y + P.d + 3;
      for (let i = 0; i < 2; i++) {
        const gw = R.range(4, 7), gd = R.range(4, 7), gx = cx + 1.5 + i * (gw + 1.5);
        global.Site.panel(ctx, gx, gy, gw, gd, i === 0 ? 'hatch' : 'diamond');
        global.Site.panel(ctx, mx(gx) - gw, gy, gw, gd, i === 0 ? 'hatch' : 'diamond');
      }
      const avenueN = R.int(4, 7), sp = R.range(2.8, 3.6);
      for (let i = 0; i < avenueN; i++) {
        global.Site.tree(ctx, cx - 2.2, gy + 1 + i * sp, 1.0);
        global.Site.tree(ctx, cx + 2.2, gy + 1 + i * sp, 1.0);
      }

      // ---- the tenets ----
      const faces = S.items.filter((it) => it.kind === 'face' && it.tag);
      const key = (pts) => pts.map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).sort().join('|');
      const keys = new Set(faces.map((f) => key(f.pts)));
      let twins = 0, required = 0;
      for (const f of faces) {
        let n = G.cross(G.sub(f.pts[1], f.pts[0]), G.sub(f.pts[2], f.pts[0]));
        if (n[0] + n[1] + n[2] < 0) n = G.mul(n, -1); // drawn faces face the viewer
        const l = G.len(n) || 1;
        if ((-n[0] + n[1] + n[2]) / l <= 0.05) continue; // its mirror would be a back face
        required++;
        if (keys.has(key(f.pts.map((p) => [mx(p[0]), p[1], p[2]])))) twins++;
      }
      const symmetry = required > 0 && twins / required >= 0.95;
      const onAxis = Math.abs((px0 + pw / 2) - cx) < 0.05;
      const aba = bayList.length >= 3 && Math.abs(bayList[0] - bayList[bayList.length - 1]) < 0.05 && bayList[Math.floor(bayList.length / 2)] > bayList[0] * 1.15;
      const subordinate = P.wingW === 0 || wingH < H - 0.5;
      const ratio = Math.max(bw, bd) / Math.min(bw, bd);
      const harmonic = RATIOS.some((r) => Math.abs(ratio - r[1] / r[0]) < 0.03 * (r[1] / r[0]));
      const tenets = [
        { name: 'SYMMETRY', ok: symmetry },
        { name: 'PORTICO ON AXIS', ok: onAxis },
        { name: 'ABA RHYTHM', ok: aba },
        { name: 'HIERARCHY', ok: subordinate },
        { name: 'HARMONIC RATIO', ok: harmonic },
      ];
      void hasDome;
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.palladio = STYLE;
})(window);
