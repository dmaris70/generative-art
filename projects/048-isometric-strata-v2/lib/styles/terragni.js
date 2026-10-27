/*
 * styles/terragni.js — TERRAGNI: the rational frame.
 *
 * Giuseppe Terragni's Casa del Fascio as a grammar: a block half as high as it is
 * wide, a square frame of columns and beams six bays across, a covered court at its
 * centre lit from above, and four faces that play solid against void: one an open
 * frame with the glass set back behind it, another filled with panels each pierced
 * by a window, the others plain walls. The frame is drawn before anything that fills it.
 *
 * Five tenets over the drawn scene: half a cube (height one half of the side), central
 * court (a glazed roof over it), frame expressed (panels set behind the columns, not
 * over them), one bay (equal bays both ways), solid and void (an open frame face and a
 * panel face). Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, K = global.Kit;
  const STYLE = {
    key: 'TERRAGNI',
    header: 'RATIONALISM',
    titles: ['CASA DEL FASCIO', 'HALF A CUBE', 'FRAME STUDY', 'RATIONAL FRAME', 'ATRIUM'],
    substyles: ['COMO', 'NOVOCOMUM', 'SANT ELIA', 'FRIGERIO', 'GIULIANI'],
    types: ['OFFICE', 'CIVIC', 'HOUSING'],
    palettes: ['COMO', 'NOVOCOMUM', 'MARBLE'],
    sites: [['PLAZA DIST', 3], ['CITY', 2], ['CITY EDGE', 2]],
    shapes: ['RECTANGLE'],
    floors: [3, 5],
    legend: [['COLUMN', 'cols'], ['BEAM', 'bar'], ['PANEL', 'sqf'], ['GLAZE', 'grid'], ['COURTROOF', 'dash'], ['SLAB', 'sq']],

    size(rng, annex) {
      const s = annex ? rng.range(16, 20) : rng.range(30, 36);
      return { w: s, d: s * (annex ? 0.9 : 1) };
    },

    build(ctx) {
      const Rn = ctx.rng, S = ctx.scene, P = ctx.plot, FH = ctx.floorH, N = ctx.floors;
      const c = ctx.palette.colors, marble = c[0], frameCol = c[1], glass = c[2], stone = c[3];
      const H = N * FH;
      const side = Math.min(P.w - 2, 2 * H * Rn.range(0.93, 1.07));
      const bw = side, bd = Math.min(P.d - 2, Rn.chance(0.25) ? side * Rn.range(0.8, 0.9) : side);
      const bx = P.x + (P.w - bw) / 2, by = P.y + (P.d - bd) / 2;
      const nb = 6, ax = bw / nb, ay = bd / nb, cs = 0.55;
      const xs = [], ys = [];
      for (let i = 0; i <= nb; i++) { xs.push(bx + i * ax); ys.push(by + i * ay); }
      const flush = Rn.chance(0.12), southPanelled = Rn.chance(0.15), courtRoof = !Rn.chance(0.12);

      // ---- the frame: columns on the perimeter and round the court ----
      const colO = { color: frameCol, alpha: 190, mode: 'flat', edge: K.EDGE, tag: 'column' };
      let nCols = 0;
      for (let i = 0; i <= nb; i++) for (let j = 0; j <= nb; j++) {
        const perim = i === 0 || j === 0 || i === nb || j === nb;
        const courtRing = i >= 2 && i <= 4 && j >= 2 && j <= 4 && (i === 2 || i === 4 || j === 2 || j === 4);
        if (!perim && !courtRing) continue;
        S.box(xs[i] - cs / 2, ys[j] - cs / 2, 0, cs, cs, H, colO); nCols++;
      }
      S.count('COLUMN', nCols);
      // slabs: a ring round the court, at every level and the roof
      const ring = (z, th, o) => {
        S.box(bx, by, z, bw, 2 * ay, th, o); S.box(bx, by + bd - 2 * ay, z, bw, 2 * ay, th, o);
        S.box(bx, by + 2 * ay, z, 2 * ax, bd - 4 * ay, th, o); S.box(bx + bw - 2 * ax, by + 2 * ay, z, 2 * ax, bd - 4 * ay, th, o);
      };
      for (let k = 1; k <= N; k++) { ring(k * FH - 0.4, 0.4, { color: marble, alpha: 100, mode: 'flat', edge: K.EDGE, tag: 'slab' }); S.count('SLAB'); }
      // beams along the perimeter at each level
      const beam = { color: frameCol, alpha: 160, mode: 'flat', edge: K.EDGE, tag: 'beam' };
      for (let k = 1; k <= N; k++) {
        const z = k * FH - 0.9;
        S.box(bx, by + bd - 0.3, z, bw, 0.3, 0.5, beam); S.box(bx, by, z, bw, 0.3, 0.5, beam);
        S.box(bx, by + 0.3, z, 0.3, bd - 0.6, 0.5, beam); S.box(bx + bw - 0.3, by + 0.3, z, 0.3, bd - 0.6, 0.5, beam);
        S.count('BEAM', 4);
      }
      // the court roof, glazed and ruled
      if (courtRoof) {
        const rx = xs[2], ry = ys[2], rw = 2 * ax, rd = 2 * ay;
        S.face(G.rect(rx, ry, H - 0.1, rw, rd), { fill: { color: glass, alpha: 70, mode: 'flat' }, edge: K.EDGE, tag: 'courtroof' });
        for (let k = 1; k < 6; k++) {
          S.line([[rx + (rw * k) / 6, ry, H - 0.08], [rx + (rw * k) / 6, ry + rd, H - 0.08]], K.THIN, { tag: 'courtroof', depth: 0 + (rx + rw + ry + rd) * 1 + H });
          S.line([[rx, ry + (rd * k) / 6, H - 0.08], [rx + rw, ry + (rd * k) / 6, H - 0.08]], K.THIN, { tag: 'courtroof', depth: 0 + (rx + rw + ry + rd) * 1 + H });
        }
        S.count('COURTROOF');
      }

      // ---- the faces: the north and west plain, the east panelled, the south open ----
      const plain = { color: marble, alpha: 110, mode: 'flat', edge: K.EDGE, tag: 'wall' };
      S.box(bx, by + 0.1, 0, bw, 0.3, H, plain); S.box(bx + 0.1, by, 0, 0.3, bd, H, plain);
      const panelFace = (face) => {
        const eastward = face === 'x1';
        const n = nb, setback = flush ? 0 : 0.5;
        for (let k = 0; k < N; k++) for (let m = 0; m < n; m++) {
          const z0 = k * FH + 0.1, ph = FH - 1.1;
          if (eastward) {
            const y0 = ys[m] + cs / 2 + 0.05, len = ay - cs - 0.1;
            S.box(bx + bw - 0.3 - setback, y0, z0, 0.3, len, ph, { color: marble, alpha: 100, mode: 'flat', edge: K.THIN, tag: 'panel' });
            K.aperture(S, 'x1', bx + bw - setback, y0 + len * 0.18, y0 + len * 0.82, z0 + ph * 0.2, z0 + ph * 0.8, 'rect', K.VOID, 'glaze');
          } else {
            const x0 = xs[m] + cs / 2 + 0.05, len = ax - cs - 0.1;
            S.box(x0, by + bd - 0.3 - setback, z0, len, 0.3, ph, { color: marble, alpha: 100, mode: 'flat', edge: K.THIN, tag: 'panel' });
            K.aperture(S, 'y1', by + bd - setback, x0 + len * 0.18, x0 + len * 0.82, z0 + ph * 0.2, z0 + ph * 0.8, 'rect', K.VOID, 'glaze');
          }
          S.count('PANEL'); S.count('GLAZE');
        }
      };
      panelFace('x1');
      if (southPanelled) panelFace('y1');
      else {
        // an open frame: the glass set back a metre behind it, a strip a level
        for (let k = 0; k < N; k++) {
          K.aperture(S, 'y1', by + bd - 1.0, bx + 0.8, bx + bw - 0.8, k * FH + 0.9, (k + 1) * FH - 0.5, 'rect', glass, 'glaze');
          S.count('GLAZE');
        }
      }

      if (ctx.M) {
        ctx.M.grid(xs, ys);
        for (let k = 0; k < N; k++) {
          ctx.M.space({ name: ctx.type === 'HOUSING' ? 'FLATS' : 'OFFICES', kind: 'room', x: bx, y: by, w: bw, d: bd, z: k * FH, h: FH - 0.4, level: k, area: bw * bd - 4 * ax * ay });
        }
        ctx.M.space({ name: 'ATRIUM', kind: 'room', x: xs[2], y: ys[2], w: 2 * ax, d: 2 * ay, z: 0, h: H, level: 0 });
        ctx.M.space({ name: 'STAIR', kind: 'service', x: xs[0] + 0.4, y: ys[0] + 0.4, w: 3, d: 4, z: 0, h: H, level: 0 });
      }

      const tenets = [
        { name: 'HALF A CUBE', ok: Math.abs(H * 2 - bw) / bw <= 0.05 },
        { name: 'CENTRAL COURT', ok: courtRoof },
        { name: 'FRAME EXPRESSED', ok: !flush },
        { name: 'ONE BAY', ok: Math.abs(ax - ay) / ax <= 0.03 },
        { name: 'SOLID AND VOID', ok: !southPanelled },
      ];
      return { kv: [['TENETS', tenets.filter((q) => q.ok).length + '/5']], tenets: tenets, datum: 0 };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.terragni = STYLE;
})(window);
