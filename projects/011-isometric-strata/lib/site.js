/*
 * site.js — the ground the building stands on.
 *
 * Six site types, each a different mix of the same vocabulary: kerbs and roads
 * with dashed centre lines, paving grids, plaza patterns (hatched panels,
 * diamonds, a fountain), street trees, neighbouring blocks drawn as outline
 * boxes with window rows, a hillside escarpment, a quay and water.
 *
 *   Site.TYPES                         CITY | CITY EDGE | PLAZA DIST | HILLSIDE | PARK | WATERFRONT
 *   Site.build(ctx)                    ctx: { rng, scene, plot:{x,y,w,d}, site, density, detail, floorH, buildingH }
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom;
  const TYPES = ['CITY', 'CITY EDGE', 'PLAZA DIST', 'HILLSIDE', 'PARK', 'WATERFRONT'];

  const GROUND = { alpha: 150, weight: 0.85, wob: 0.7 };
  const LIGHT = { alpha: 70, weight: 0.7, wob: 0.6 };
  const KERB = { alpha: 170, weight: 1.0, wob: 0.6 };
  const CENTRE = { alpha: 110, weight: 0.8, wob: 0.6, dash: [9, 7] };

  // ---- primitives on the ground plane (z = 0) ----

  function rectLines(scene, x, y, w, d, pen, z) {
    const r = G.rect(x, y, z || 0, w, d);
    scene.line(r.concat([r[0]]), pen, { layer: 0 });
  }

  function isoGrid(scene, x, y, w, d, step, pen, z) {
    for (let gx = x + step; gx < x + w - 1e-6; gx += step) scene.line([[gx, y, z || 0], [gx, y + d, z || 0]], pen, { layer: 0 });
    for (let gy = y + step; gy < y + d - 1e-6; gy += step) scene.line([[x, gy, z || 0], [x + w, gy, z || 0]], pen, { layer: 0 });
  }

  // a paving panel with one of several patterns
  function panel(ctx, x, y, w, d, kind) {
    const S = ctx.scene, R = ctx.rng;
    const r = G.rect(x, y, 0.01, w, d);
    if (kind === 'hatch') {
      S.face(r, { fill: { color: [70, 76, 88], alpha: 120, mode: 'hatch', spacing: R.range(2.6, 4.2), angle: R.pick(['edge', 'edge2', -Math.PI / 3, Math.PI / 6]) }, edge: GROUND, layer: 0 });
    } else if (kind === 'cross') {
      S.face(r, { fill: { color: [70, 76, 88], alpha: 90, mode: 'cross', spacing: R.range(3.5, 5), angle: 'edge' }, edge: GROUND, layer: 0 });
    } else if (kind === 'grid') {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
      isoGrid(S, x, y, w, d, R.range(0.8, 1.6), LIGHT);
    } else if (kind === 'diamond') {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
      const n = R.int(2, 4);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1) * 0.5;
        const q = [[x + w * t, y + d * 0.5, 0], [x + w * 0.5, y + d * t, 0], [x + w * (1 - t), y + d * 0.5, 0], [x + w * 0.5, y + d * (1 - t), 0]];
        S.line(q.concat([q[0]]), LIGHT, { layer: 0 });
      }
    } else if (kind === 'fountain') {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
      const cx = x + w / 2, cy = y + d / 2, rr = Math.min(w, d) * 0.42;
      const o1 = G.regular(cx, cy, 0, rr, 8, Math.PI / 8);
      const o2 = G.regular(cx, cy, 0, rr * 0.62, 8, Math.PI / 8);
      S.line(o1.concat([o1[0]]), GROUND, { layer: 0 });
      S.line(o2.concat([o2[0]]), LIGHT, { layer: 0 });
      S.face(G.regular(cx, cy, 0.02, rr * 0.6, 8, Math.PI / 8), { fill: { color: ctx.water || [110, 128, 150], alpha: 70, mode: 'flat' }, edge: null, layer: 0 });
      for (let i = 0; i < 8; i++) S.line([o1[i], o2[i]], LIGHT, { layer: 0 });
      if (R.chance(0.6)) S.face(G.regular(cx, cy, 0.4, rr * 0.18, 8), { fill: { color: [120, 126, 136], alpha: 120, mode: 'flat' }, edge: GROUND, layer: 0, depth: 0 });
    } else if (kind === 'rings') {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
      const cx = x + w / 2, cy = y + d / 2, rr = Math.min(w, d) * 0.45;
      for (let i = 1; i <= 3; i++) {
        const c = G.regular(cx, cy, 0, rr * i / 3, 28);
        S.line(c.concat([c[0]]), LIGHT, { layer: 0 });
      }
    } else if (kind === 'tri') {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
      const n = R.int(2, 3);
      const cw = w / n, cd = d / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (R.chance(0.55)) {
          const tx = x + i * cw, ty = y + j * cd;
          const t = [[tx + cw * 0.15, ty + cd * 0.85, 0], [tx + cw * 0.85, ty + cd * 0.85, 0], [tx + cw * 0.5, ty + cd * 0.15, 0]];
          S.face(t, { fill: R.chance(0.5) ? { color: [70, 76, 88], alpha: 120, mode: 'hatch', spacing: 2.2, angle: 'edge' } : null, edge: LIGHT, layer: 0 });
        }
      }
    } else {
      S.face(r, { fill: null, edge: GROUND, layer: 0 });
    }
  }

  function manhole(ctx, x, y) {
    const S = ctx.scene;
    const s = 0.8;
    rectLines(S, x - s / 2, y - s / 2, s, s, GROUND, 0);
    if (ctx.rng.chance(0.5)) {
      S.line([[x - s / 2, y - s / 2, 0], [x + s / 2, y + s / 2, 0]], LIGHT, { layer: 0 });
      S.line([[x + s / 2, y - s / 2, 0], [x - s / 2, y + s / 2, 0]], LIGHT, { layer: 0 });
    } else {
      const c = G.regular(x, y, 0, s * 0.3, 10);
      S.line(c.concat([c[0]]), LIGHT, { layer: 0 });
    }
  }

  // ---- trees: a screen-space glyph at a world anchor ----
  function tree(ctx, x, y, size) {
    const S = ctx.scene, R = ctx.rng;
    const sz = size || R.range(0.7, 1.3);
    const seedA = R.range(0, Math.PI * 2), bumps = R.int(6, 9), wob = R.range(0.6, 1.4);
    const stemH = R.range(0.5, 1.0);
    S.custom([x, y, 0], function (hand, P) {
      const base = P([x, y, 0]);
      const px = P([x + 1, y, 0]);
      const unit = Math.hypot(px[0] - base[0], px[1] - base[1]) * 0.55; // sheet units per metre-ish
      const r = unit * sz * 0.8;
      const cy = base[1] - unit * stemH - r * 0.7;
      const pts = [];
      const n = bumps * 3;
      for (let i = 0; i < n; i++) {
        const a = seedA + (i / n) * Math.PI * 2;
        const rr = r * (1 + 0.16 * Math.sin(a * bumps + seedA) * wob);
        pts.push([base[0] + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]);
      }
      hand.poly(pts, null, { alpha: 150, weight: 0.75, wob: 0.9 });
      hand.line([[base[0], cy + r * 0.85], [base[0], base[1]]], { alpha: 160, weight: 0.9, wob: 0.5 });
      if (r > 3.5) hand.line([[base[0] - r * 0.3, cy + r * 0.2], [base[0], cy + r * 0.6], [base[0] + r * 0.3, cy + r * 0.1]], { alpha: 90, weight: 0.6, wob: 0.8 });
    }, { layer: 1, bias: -0.2 });
  }

  function treeRow(ctx, a, b, spacing) {
    const R = ctx.rng;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(L / spacing);
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1);
      if (R.chance(0.15)) continue;
      tree(ctx, a[0] + (b[0] - a[0]) * t + R.range(-0.3, 0.3), a[1] + (b[1] - a[1]) * t + R.range(-0.3, 0.3));
    }
  }

  function treeField(ctx, x, y, w, d, n) {
    const R = ctx.rng;
    for (let i = 0; i < n; i++) tree(ctx, x + R.range(0.5, w - 0.5), y + R.range(0.5, d - 0.5));
  }

  // ---- neighbouring blocks: outlines with window rows ----
  function neighbour(ctx, x, y, w, d, h) {
    const S = ctx.scene, R = ctx.rng;
    const pen = { alpha: 175, weight: 0.9, wob: 0.8, passes: 1 };
    const win = { alpha: 120, weight: 0.7, wob: 0.5 };
    S.box(x, y, 0, w, d, h, { color: null, edge: pen });
    const winRows = ctx.detail >= 2 && h > 5 && R.chance(0.8);
    if (winRows) {
      const fh = ctx.floorH * R.range(0.8, 1.1);
      const ww = R.range(0.8, 1.5), gap = R.range(1.0, 2.2);
      for (let z = fh * 0.4; z < h - fh * 0.5; z += fh) {
        // right face (+x): windows along y
        for (let yy = y + 0.6; yy < y + d - ww - 0.3; yy += ww + gap) {
          const f = [[x + w, yy, z], [x + w, yy + ww, z], [x + w, yy + ww, z + fh * 0.45], [x + w, yy, z + fh * 0.45]];
          S.line(f.concat([f[0]]), win, { depth: global.ISO.depth([x + w, yy, z]) + 0.05 });
        }
        // left face (+y): windows along x
        for (let xx = x + 0.6; xx < x + w - ww - 0.3; xx += ww + gap) {
          const f = [[xx, y + d, z], [xx + ww, y + d, z], [xx + ww, y + d, z + fh * 0.45], [xx, y + d, z + fh * 0.45]];
          S.line(f.concat([f[0]]), win, { depth: global.ISO.depth([xx, y + d, z]) + 0.05 });
        }
      }
    } else if (ctx.detail >= 1 && h > 6 && R.chance(0.5)) {
      // floor lines only
      for (let z = ctx.floorH; z < h - 0.5; z += ctx.floorH) {
        S.line([[x + w, y, z], [x + w, y + d, z], [x, y + d, z]], win, { depth: global.ISO.depth([x + w, y + d, z]) + 0.05 });
      }
    }
    // stepped top or rooftop box
    if (R.chance(0.35)) {
      const sw = w * R.range(0.4, 0.7), sd = d * R.range(0.4, 0.7);
      S.box(x + R.range(0, w - sw), y + R.range(0, d - sd), h, sw, sd, ctx.floorH * R.range(0.6, 1.5), { color: null, edge: pen });
    }
  }

  // ---- terrain: an escarpment across the site, hatched on its slope ----
  function escarpment(ctx, site, plot) {
    const S = ctx.scene, R = ctx.rng;
    const noise = global.Paper.makeNoise(R.int(0, 1e9));
    const along = R.chance(0.5) ? 'x' : 'y';
    // the contour runs across the site beyond the plot on one side
    const off = R.chance(0.5) ? 1 : -1;
    const base = along === 'x' ? (off > 0 ? plot.y + plot.d + R.range(5, 9) : plot.y - R.range(5, 9)) : (off > 0 ? plot.x + plot.w + R.range(5, 9) : plot.x - R.range(5, 9));
    const lo = along === 'x' ? site.x0 : site.y0, hi = along === 'x' ? site.x1 : site.y1;
    const lines = R.int(2, 4);
    const drop = R.range(1.5, 3);
    for (let k = 0; k < lines; k++) {
      const pts = [];
      const dz = -k * drop;
      const shift = k * R.range(2.5, 4) * off;
      for (let t = lo; t <= hi; t += 1.2) {
        const wig = (noise(t * 0.08 + k * 3, k * 7, 2) - 0.5) * 6;
        const u = base + shift + wig;
        pts.push(along === 'x' ? [t, u, 0] : [u, t, 0]);
      }
      // the contour, then the slope ticks off its downhill side
      S.line(pts, { alpha: 150, weight: 0.9, wob: 0.8 }, { layer: 0, depth: -1e6 + k });
      if (k < lines - 1) {
        for (let i = 0; i < pts.length - 1; i += 1) {
          if (R.chance(0.25)) continue;
          const p = pts[i];
          const len = R.range(1.2, 2.6);
          const q = along === 'x' ? [p[0] + R.range(-0.3, 0.3), p[1] + len * off, 0] : [p[0] + len * off, p[1] + R.range(-0.3, 0.3), 0];
          S.line([p, q], { alpha: 110, weight: 0.7, wob: 0.6 }, { layer: 0, depth: -1e6 + k });
        }
      }
      void dz;
    }
    // rocks: scattered small marks below the slope
    for (let i = 0; i < 14; i++) {
      const t = R.range(lo, hi);
      const u = base + off * (lines * 3 + R.range(1, 12));
      const p = along === 'x' ? [t, u, 0] : [u, t, 0];
      const s = R.range(0.3, 0.7);
      const poly = G.regular(p[0], p[1], 0, s, R.int(4, 6), R.range(0, 3));
      S.line(poly.concat([poly[0]]), LIGHT, { layer: 0 });
    }
  }

  function water(ctx, x, y, w, d) {
    const S = ctx.scene, R = ctx.rng;
    const pen = { color: ctx.water || [96, 118, 140], alpha: 120, weight: 0.8, wob: 0.6 };
    const n = Math.round(w * d * 0.35);
    for (let i = 0; i < n; i++) {
      const px = x + R.range(0, w), py = y + R.range(0, d);
      const l = R.range(0.6, 2.2);
      S.line([[px, py, 0], [px + l, py, 0]], pen, { layer: 0 });
    }
    // quay edge doubled, with bollards
    S.line([[x, y, 0], [x + w, y, 0]], KERB, { layer: 0 });
    S.line([[x, y + 0.5, 0], [x + w, y + 0.5, 0]], LIGHT, { layer: 0 });
    for (let t = x + 2; t < x + w - 1; t += R.range(3, 5)) {
      S.box(t, y - 0.7, 0, 0.5, 0.5, 0.7, { color: null, edge: { alpha: 150, weight: 0.7, wob: 0.5 } });
    }
  }

  // ---- roads ----
  function road(ctx, x, y, w, d, dir) {
    const S = ctx.scene;
    rectLines(S, x, y, w, d, KERB, 0);
    if (dir === 'x') S.line([[x, y + d / 2, 0], [x + w, y + d / 2, 0]], CENTRE, { layer: 0 });
    else S.line([[x + w / 2, y, 0], [x + w / 2, y + d, 0]], CENTRE, { layer: 0 });
  }

  function crossing(ctx, x, y, w, d, dir) {
    const S = ctx.scene;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (dir === 'x') S.line([[x + w * t, y, 0], [x + w * t, y + d, 0]], { alpha: 90, weight: 2.2, wob: 0.4 }, { layer: 0 });
      else S.line([[x, y + d * t, 0], [x + w, y + d * t, 0]], { alpha: 90, weight: 2.2, wob: 0.4 }, { layer: 0 });
    }
  }

  // ---------------------------------------------------------------- build

  function build(ctx) {
    const S = ctx.scene, R = ctx.rng, P = ctx.plot;
    const site = ctx.site || 'CITY';
    const dens = ctx.density === 'FEW' ? 0.45 : ctx.density === 'DENSE' ? 1.6 : 1;

    const cx = P.x + P.w / 2, cy = P.y + P.d / 2;
    const Rext = Math.max(P.w, P.d) * 0.85 + 16;
    const ext = { x0: cx - Rext, y0: cy - Rext, x1: cx + Rext, y1: cy + Rext };
    ctx.ext = ext;

    // site boundary: faint dashed diamond
    const b = G.rect(ext.x0, ext.y0, 0, ext.x1 - ext.x0, ext.y1 - ext.y0);
    S.line(b.concat([b[0]]), { alpha: 60, weight: 0.7, wob: 0.5, dash: [14, 10] }, { layer: 0, depth: -1e7 });

    // the plot: paving grid and kerb ring
    const walk = 3.2;
    const K = { x: P.x - walk, y: P.y - walk, w: P.w + walk * 2, d: P.d + walk * 2 };
    S.face(G.rect(P.x, P.y, 0, P.w, P.d), { fill: null, edge: GROUND, layer: 0, depth: -1e6 });
    const pav = R.range(1.4, 2.4);
    isoGrid(S, P.x, P.y, P.w, P.d, pav, { alpha: 55, weight: 0.6, wob: 0.5 });
    rectLines(S, K.x, K.y, K.w, K.d, KERB, 0);

    const roadW = 7;
    const sides = { n: false, s: false, e: false, w: false }; // n = -y side, e = +x side
    const occupied = [{ x: K.x - roadW, y: K.y - roadW, w: K.w + roadW * 2, d: K.d + roadW * 2 }];

    function roads(list) {
      for (const s of list) sides[s] = true;
      if (sides.s) road(ctx, ext.x0, K.y + K.d, ext.x1 - ext.x0, roadW, 'x');
      if (sides.n) road(ctx, ext.x0, K.y - roadW, ext.x1 - ext.x0, roadW, 'x');
      if (sides.e) road(ctx, K.x + K.w, sides.n ? K.y - roadW : ext.y0, roadW, sides.n && sides.s ? K.d + 2 * roadW : ext.y1 - ext.y0, 'y');
      if (sides.w) road(ctx, K.x - roadW, sides.n ? K.y - roadW : ext.y0, roadW, sides.n && sides.s ? K.d + 2 * roadW : ext.y1 - ext.y0, 'y');
      // crossings at the plot's corners
      if (sides.s && sides.e) crossing(ctx, K.x + K.w - 4, K.y + K.d, 4, roadW, 'x');
      if (sides.n && sides.w) crossing(ctx, K.x - roadW, K.y + 2, roadW, 4, 'y');
    }

    function blocks(n, hScale) {
      // candidate zones outside the road ring
      const zones = [
        { x: ext.x0, y: ext.y0, w: K.x - roadW - ext.x0, d: ext.y1 - ext.y0 },
        { x: K.x + K.w + roadW, y: ext.y0, w: ext.x1 - (K.x + K.w + roadW), d: ext.y1 - ext.y0 },
        { x: ext.x0, y: ext.y0, w: ext.x1 - ext.x0, d: K.y - roadW - ext.y0 },
        { x: ext.x0, y: K.y + K.d + roadW, w: ext.x1 - ext.x0, d: ext.y1 - (K.y + K.d + roadW) },
      ].filter((z) => z.w > 5 && z.d > 5);
      let placed = 0;
      for (let t = 0; t < n * 12 && placed < n; t++) {
        const z = R.pick(zones);
        const w = R.range(5, Math.min(16, z.w)), d = R.range(5, Math.min(16, z.d));
        const x = z.x + R.range(0, z.w - w), y = z.y + R.range(0, z.d - d);
        const r = { x: x - 1.5, y: y - 1.5, w: w + 3, d: d + 3 };
        let ok = true;
        for (const o of occupied) if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.d && r.y + r.d > o.y) { ok = false; break; }
        if (!ok) continue;
        occupied.push(r);
        const h = ctx.floorH * R.int(1, 5) * hScale * R.range(0.8, 1.2);
        neighbour(ctx, x, y, w, d, Math.max(2.5, Math.min(h, ctx.buildingH * 0.9)));
        placed++;
      }
      return placed;
    }

    function plaza(nPanels) {
      // paving panels in the free zones around the kerb ring
      const kinds = ['hatch', 'grid', 'diamond', 'cross', 'rings', 'tri', 'fountain', 'plain', 'hatch'];
      for (let i = 0; i < nPanels; i++) {
        const w = R.range(4, 10), d = R.range(4, 10);
        const zone = R.int(0, 3);
        let x, y;
        if (zone === 0) { x = R.range(ext.x0, K.x - roadW - w); y = R.range(ext.y0, ext.y1 - d); }
        else if (zone === 1) { x = R.range(K.x + K.w + roadW, ext.x1 - w); y = R.range(ext.y0, ext.y1 - d); }
        else if (zone === 2) { x = R.range(ext.x0, ext.x1 - w); y = R.range(ext.y0, K.y - roadW - d); }
        else { x = R.range(ext.x0, ext.x1 - w); y = R.range(K.y + K.d + roadW, ext.y1 - d); }
        if (!isFinite(x) || !isFinite(y)) continue;
        const r = { x: x, y: y, w: w, d: d };
        let ok = true;
        for (const o of occupied) if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.d && r.y + r.d > o.y) { ok = false; break; }
        if (!ok) continue;
        occupied.push(r);
        panel(ctx, x, y, w, d, R.pick(kinds));
      }
    }

    function streetTrees() {
      const sp = R.range(3.5, 5.5);
      if (sides.s) treeRow(ctx, [K.x + 1, K.y + K.d - 1.2], [K.x + K.w - 1, K.y + K.d - 1.2], sp);
      if (sides.e) treeRow(ctx, [K.x + K.w - 1.2, K.y + 1], [K.x + K.w - 1.2, K.y + K.d - 1], sp);
      if (sides.n) treeRow(ctx, [K.x + 1, K.y + 1.2], [K.x + K.w - 1, K.y + 1.2], sp);
      if (sides.w) treeRow(ctx, [K.x + 1.2, K.y + 1], [K.x + 1.2, K.y + K.d - 1], sp);
      // far kerbs
      if (sides.s) treeRow(ctx, [ext.x0 + 2, K.y + K.d + roadW + 1.5], [ext.x1 - 2, K.y + K.d + roadW + 1.5], sp * 1.3);
      if (sides.e) treeRow(ctx, [K.x + K.w + roadW + 1.5, ext.y0 + 2], [K.x + K.w + roadW + 1.5, ext.y1 - 2], sp * 1.3);
    }

    function manholes(n) {
      for (let i = 0; i < n; i++) {
        const onS = R.chance(0.5);
        const x = onS ? R.range(K.x, K.x + K.w) : K.x + K.w + roadW * R.range(0.2, 0.8);
        const y = onS ? K.y + K.d + roadW * R.range(0.2, 0.8) : R.range(K.y, K.y + K.d);
        manhole(ctx, x, y);
      }
    }

    // ---- per-site recipes ----
    if (site === 'CITY') {
      roads(['s', 'e', R.chance(0.7) ? 'n' : null, R.chance(0.7) ? 'w' : null].filter(Boolean));
      blocks(Math.round(R.int(4, 7) * dens), 1);
      streetTrees();
      manholes(R.int(2, 5));
      if (R.chance(0.5)) plaza(R.int(1, 3));
    } else if (site === 'CITY EDGE') {
      roads(['s', R.chance(0.6) ? 'e' : 'w']);
      blocks(Math.round(R.int(2, 4) * dens), 1.1);
      streetTrees();
      plaza(R.int(2, 4));
      treeField(ctx, ext.x0, ext.y0, (K.x - roadW - ext.x0) * 0.9, ext.y1 - ext.y0, Math.round(R.int(6, 14) * dens));
      manholes(R.int(1, 3));
    } else if (site === 'PLAZA DIST') {
      roads([R.pick(['s', 'e'])]);
      plaza(Math.round(R.int(6, 12) * dens));
      blocks(Math.round(R.int(1, 3) * dens), 0.8);
      // a formal grid of trees on one side
      const gx = K.x + K.w + roadW + 2, n = R.int(3, 5), sp = R.range(3, 4.5);
      if (gx + n * sp < ext.x1) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) tree(ctx, gx + i * sp, K.y + 1 + j * sp, R.range(0.8, 1.1));
      streetTrees();
    } else if (site === 'HILLSIDE') {
      roads([R.pick(['s', 'w'])]);
      escarpment(ctx, ext, K);
      treeField(ctx, ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0, Math.round(R.int(4, 10) * dens));
      blocks(Math.round(R.int(0, 2) * dens), 0.6);
      manholes(R.int(0, 2));
    } else if (site === 'PARK') {
      roads(['s']);
      streetTrees();
      treeField(ctx, ext.x0, ext.y0, ext.x1 - ext.x0, K.y - roadW - ext.y0, Math.round(R.int(10, 24) * dens));
      treeField(ctx, K.x + K.w + roadW, ext.y0, ext.x1 - K.x - K.w - roadW, ext.y1 - ext.y0, Math.round(R.int(6, 16) * dens));
      // a winding path
      const pts = [];
      let x = ext.x0 + 2, y = ext.y0 + R.range(4, 12);
      const noise = global.Paper.makeNoise(R.int(0, 1e9));
      while (x < K.x - roadW - 2) { pts.push([x, y, 0]); x += 1.5; y += (noise(x * 0.1, 3, 2) - 0.5) * 3; }
      S.line(pts, { alpha: 110, weight: 0.8, wob: 0.6, dash: [6, 4] }, { layer: 0 });
      plaza(R.int(1, 3));
    } else if (site === 'WATERFRONT') {
      roads(['n', R.chance(0.5) ? 'e' : 'w']);
      water(ctx, ext.x0, K.y + K.d + 4, ext.x1 - ext.x0, ext.y1 - (K.y + K.d + 4));
      blocks(Math.round(R.int(2, 4) * dens), 0.9);
      streetTrees();
      plaza(R.int(1, 3));
    }
  }

  global.Site = { TYPES: TYPES, build: build, tree: tree, panel: panel, neighbour: neighbour };
})(window);
