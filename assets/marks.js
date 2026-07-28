/*
 * marks.js — a library of mark generators for plotter-native drawing.
 *
 * Every element returns the same thing: a list of strokes, each `{pts, passes}`,
 * where pts is an array of {x,y} and passes is how many times the pen should lay
 * the stroke down (thickness is repetition — a pen has no stroke-weight).
 *
 * No fills, no alpha, no p5 dependency: these are polylines, which is all a plotter
 * can draw and all an SVG needs to carry. See docs/plotter-guide.md.
 *
 *   const ctx = Marks.context({ seed: 1234, field: {x0,y0,x1,y1}, U: 1, masks: [...] });
 *   const strokes = Marks.ELEMENTS.rulings.build(ctx, { angle: 38, density: 90, ... });
 *   const polylines = Marks.flatten(strokes, ctx.U);
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- foundations

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hash-based value noise — deterministic from the seed, no p5, no tables.
  function makeNoise(seed) {
    function h2(x, y) {
      // all-int32 via Math.imul — in plain JS floats n³·15731 exceeds the 53-bit
      // mantissa, the low bits vanish, and the "noise" collapses to a constant
      let n = (Math.imul(x | 0, 1619) + Math.imul(y | 0, 31337) + Math.imul(seed | 0, 6971)) | 0;
      n = (n << 13) ^ n;
      const m = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) | 0;
      return 1 - (m & 0x7fffffff) / 1073741824;
    }
    const fade = (t) => t * t * (3 - 2 * t);
    function noise2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = fade(x - xi), yf = fade(y - yi);
      const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
      const top = a + (b - a) * xf, bot = c + (d - c) * xf;
      return (top + (bot - top) * yf) * 0.5 + 0.5; // → [0,1]
    }
    return function (x, y, octaves) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      const n = octaves || 1;
      for (let i = 0; i < n; i++) {
        sum += noise2(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return sum / norm;
    };
  }

  function context(cfg) {
    const rng = mulberry32(cfg.seed >>> 0);
    const f = cfg.field;
    const masks = cfg.masks || [];
    // `field` is where the drawing lives; `page` is the whole sheet inside its margin
    // (field plus any reserved gutter), which is what type is positioned against.
    const pg = cfg.page || f;
    const occluders = [];
    return {
      // Shapes this layer hides earlier layers behind. Elements push their own
      // silhouettes here as they build, so the geometry matches exactly.
      occluders: occluders,
      addOccluder: function (poly) { occluders.push(poly); },
      seed: cfg.seed >>> 0,
      U: cfg.U || 1,
      field: { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, w: f.x1 - f.x0, h: f.y1 - f.y0 },
      page: { x0: pg.x0, y0: pg.y0, x1: pg.x1, y1: pg.y1, w: pg.x1 - pg.x0, h: pg.y1 - pg.y0 },
      canvas: cfg.canvas || { w: pg.x1 + pg.x0, h: pg.y1 + pg.y0 },
      rng: rng,
      noise: makeNoise(cfg.seed >>> 0),
      rnd: (a, b) => a + rng() * (b - a),
      chance: (p) => rng() < p,
      pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))],
      // true where the pen must not come down
      mask: function (x, y) {
        for (let i = 0; i < masks.length; i++) if (pointInPoly(x, y, masks[i])) return true;
        return false;
      },
      masks: masks,
      inField: function (x, y) {
        return x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1;
      },
    };
  }

  function pointInPoly(x, y, poly) {
    const v = poly.verts || poly;
    if (poly.rmax !== undefined) {
      const dx = x - poly.cx, dy = y - poly.cy;
      if (dx * dx + dy * dy > poly.rmax * poly.rmax) return false; // cheap reject
    }
    let inside = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      if ((v[i].y > y) !== (v[j].y > y) &&
          x < ((v[j].x - v[i].x) * (y - v[i].y)) / (v[j].y - v[i].y) + v[i].x) {
        inside = !inside;
      }
    }
    return inside;
  }

  // An irregular closed shape — used for voids, hatched patches, ring centres.
  function blob(ctx, cx, cy, r, wobble, squash, sides) {
    const N = sides || 96;
    const verts = [];
    const ox = ctx.rnd(0, 100), oy = ctx.rnd(0, 100);
    let rmax = 0;
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N;
      const n = ctx.noise(Math.cos(a) * 1.4 + ox, Math.sin(a) * 1.4 + oy);
      const rr = r * (1 - wobble + 2 * wobble * n);
      const x = cx + Math.cos(a) * rr * (squash || 1);
      const y = cy + Math.sin(a) * rr;
      verts.push({ x: x, y: y });
      rmax = Math.max(rmax, Math.hypot(x - cx, y - cy));
    }
    return { cx: cx, cy: cy, r: r, rmax: rmax, verts: verts };
  }

  // Expand multipass strokes into plain polylines, offset by a fraction of a nib.
  function flatten(strokes, U) {
    const out = [];
    for (const s of strokes) {
      const pts = s.pts || s;
      const n = s.passes || 1;
      if (pts.length < 2) continue;
      if (n === 1) { out.push(pts); continue; }
      const a = pts[0], b = pts[pts.length - 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const px = -(b.y - a.y) / d, py = (b.x - a.x) / d;
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 0.55 * (U || 1);
        out.push(pts.map((p) => ({ x: p.x + px * o, y: p.y + py * o })));
      }
    }
    return out;
  }

  // Walk a straight line across the field, laying dashes with irregular gaps and
  // skipping the mask. Shared by rulings and grid.
  function dashRay(ctx, px, py, ang, o) {
    const out = [];
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx;
    const U = ctx.U;
    const f = ctx.field;
    const reach = Math.hypot(f.w, f.h);
    const step = 1.6 * U;
    const wanderAmp = o.drift * 9 * U * (0.3 + ctx.rng());
    const wanderScale = 0.0016 / (0.4 + o.drift);
    const jump = ctx.chance(0.45) ? ctx.rnd(-3.2, 3.2) * U * (0.4 + o.drift) : 0;

    const kind = ctx.rng();
    const gapMul = kind < 0.16 ? ctx.rnd(0.25, 0.55) : kind < 0.82 ? ctx.rnd(0.8, 1.3) : ctx.rnd(1.8, 3.6);
    const dashMul = kind < 0.16 ? ctx.rnd(2.5, 6) : ctx.rnd(0.8, 1.4);
    const passes = kind < 0.08 ? 2 : 1;
    const dashLen = () => ctx.rnd(0.4, 2.6) * U * dashMul;
    const spacing = o.dot * U;

    let down = ctx.chance(0.5);
    let need = down ? dashLen() : spacing * gapMul;
    let acc = 0, crossed = false, run = [];

    const flush = () => {
      if (run.length > 1) out.push({ pts: run, passes: passes });
      else if (run.length === 1) {
        out.push({ pts: [run[0], { x: run[0].x + dx * 0.6 * U, y: run[0].y + dy * 0.6 * U }], passes: passes });
      }
      run = [];
    };

    for (let t = -reach; t < reach; t += step) {
      const w = (ctx.noise((t + o.seedOff * 130) * wanderScale, o.seedOff * 0.37) - 0.5) * 2 * wanderAmp;
      const off = w + (crossed ? jump : 0);
      const x = px + dx * t + nx * off;
      const y = py + dy * t + ny * off;

      acc += step;
      if (acc >= need) {
        acc = 0;
        if (down) {
          flush();
          need = spacing * gapMul * (ctx.chance(0.07) ? ctx.rnd(4, 14) : ctx.rnd(0.5, 1.7));
          down = false;
        } else {
          need = dashLen() * (ctx.chance(0.06) ? ctx.rnd(3, 9) : 1);
          down = true;
        }
      }

      if (!ctx.inField(x, y)) { flush(); continue; }
      if (ctx.mask(x, y)) { crossed = true; flush(); continue; }
      if (down) run.push({ x: x, y: y });
      else flush();
    }
    flush();
    return out;
  }

  // ---------------------------------------------------------------- occlusion
  //
  // Hidden-line removal: a shape in front deletes the parts of earlier strokes that
  // fall behind it. A pen has no z-buffer and ink is additive, so this is a
  // compositional decision, not physics — but it is the difference between a stack of
  // layers reading as depth and reading as an x-ray. It also removes marks, which
  // makes the plot shorter.
  //
  // Clipping is done exactly, segment against polygon edges: a long dash can cross a
  // shape with neither endpoint inside it, so testing points would leak.

  function bboxOf(verts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of verts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Parameters along a→b where it crosses any edge of `verts`.
  function crossings(a, b, verts, out) {
    const rx = b.x - a.x, ry = b.y - a.y;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const c = verts[j], d = verts[i];
      const sx = d.x - c.x, sy = d.y - c.y;
      const den = rx * sy - ry * sx;
      if (den === 0) continue; // parallel
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
      const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
    }
  }

  function occlude(strokes, polys) {
    if (!polys || !polys.length || !strokes.length) return strokes;
    const shapes = polys.map((p) => {
      const verts = p.verts || p;
      return { verts: verts, bb: bboxOf(verts) };
    });
    const out = [];

    for (const s of strokes) {
      const pts = s.pts;
      let run = [];
      const flush = () => {
        if (run.length > 1) out.push({ pts: run, passes: s.passes });
        run = [];
      };

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x);
        const sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y);

        const near = [];
        for (const sh of shapes) {
          if (sx1 < sh.bb.x0 || sx0 > sh.bb.x1 || sy1 < sh.bb.y0 || sy0 > sh.bb.y1) continue;
          near.push(sh);
        }
        if (!near.length) { // nothing can hide it
          if (!run.length) run.push(a);
          run.push(b);
          continue;
        }

        const ts = [0, 1];
        for (const sh of near) crossings(a, b, sh.verts, ts);
        ts.sort((p, q) => p - q);

        const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        for (let k = 1; k < ts.length; k++) {
          const t0 = ts[k - 1], t1 = ts[k];
          if (t1 - t0 < 1e-9) continue;
          const mid = at((t0 + t1) / 2);
          let hidden = false;
          for (const sh of near) {
            if (pointInPoly(mid.x, mid.y, sh.verts)) { hidden = true; break; }
          }
          if (hidden) { flush(); continue; }
          const p0 = at(t0), p1 = at(t1);
          if (run.length) {
            const last = run[run.length - 1];
            if (Math.abs(last.x - p0.x) > 1e-9 || Math.abs(last.y - p0.y) > 1e-9) {
              flush();
              run.push(p0);
            }
          } else {
            run.push(p0);
          }
          run.push(p1);
        }
      }
      flush();
    }
    return out;
  }

  // Drawn length of a stroke list. Counting strokes tells you nothing after clipping —
  // cutting one line in half leaves two lines and less ink.
  function totalLength(strokes) {
    let sum = 0;
    for (const s of strokes) {
      const pts = s.pts || s;
      for (let i = 1; i < pts.length; i++) {
        sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * (s.passes || 1);
      }
    }
    return sum;
  }

  // A rectangle around a segment, `w` wide — the silhouette of a heavy bar.
  function segmentBox(a, b, w) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = (-dy / d) * w * 0.5, ny = (dx / d) * w * 0.5;
    const ex = (dx / d) * w * 0.5, ey = (dy / d) * w * 0.5;
    return [
      { x: a.x + nx - ex, y: a.y + ny - ey },
      { x: b.x + nx + ex, y: b.y + ny + ey },
      { x: b.x - nx + ex, y: b.y - ny + ey },
      { x: a.x - nx - ex, y: a.y - ny - ey },
    ];
  }

  function boxPoly(x0, y0, x1, y1) {
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  // Split a polyline wherever it leaves the field or enters a mask, so a shape that
  // overruns the drawing area is cut rather than drawn across the margin.
  function clipRun(ctx, pts) {
    const out = [];
    let run = [];
    for (const p of pts) {
      if (ctx.inField(p.x, p.y) && !ctx.mask(p.x, p.y)) run.push(p);
      else { if (run.length > 1) out.push({ pts: run, passes: 1 }); run = []; }
    }
    if (run.length > 1) out.push({ pts: run, passes: 1 });
    return out;
  }

  // Clip a set of parallel lines to a polygon — the honest way to fill a shape.
  function hatchPolygon(poly, angle, spacing) {
    const v = poly.verts || poly;
    const ca = Math.cos(-angle), sa = Math.sin(-angle);
    const rot = v.map((p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }));
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of rot) {
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    }
    const back = (x, y) => ({ x: x * ca + y * sa, y: -x * sa + y * ca });
    const out = [];
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
      const xs = [];
      for (let i = 0, j = rot.length - 1; i < rot.length; j = i++) {
        const a = rot[i], b = rot[j];
        if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] < 1e-6) continue;
        out.push({ pts: [back(xs[i], y), back(xs[i + 1], y)], passes: 1 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- elements

  const ELEMENTS = {
    // ---- masks (computed before everything else; draw nothing themselves) ----
    voidPatch: {
      label: 'Void',
      mask: true,
      hint: 'A region the pen never entered.',
      params: {
        size: { value: 0.42, min: 0.05, max: 1, step: 0.01, label: 'size' },
        x: { value: 0.55, min: 0, max: 1, step: 0.01, label: 'x' },
        y: { value: 0.45, min: 0, max: 1, step: 0.01, label: 'y' },
        wobble: { value: 0.32, min: 0, max: 0.8, step: 0.01, label: 'ragged' },
        squash: { value: 1, min: 0.3, max: 2.2, step: 0.05, label: 'squash' },
      },
      build: function (ctx, p) {
        const f = ctx.field;
        return blob(ctx, f.x0 + p.x * f.w, f.y0 + p.y * f.h,
                    p.size * Math.min(f.w, f.h) * 0.36, p.wobble, p.squash);
      },
    },

    // ---- stroke elements ----
    rulings: {
      label: 'Rulings',
      hint: 'Families of irregular dotted lines.',
      params: {
        density: { value: 90, min: 5, max: 220, step: 1, label: 'density' },
        angle: { value: 38, min: 0, max: 90, step: 1, label: 'angle' },
        dot: { value: 5.5, min: 1, max: 20, step: 0.5, label: 'dot spacing' },
        drift: { value: 0.45, min: 0, max: 1, step: 0.02, label: 'irregularity' },
        vertical: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'vertical share' },
        mirror: { value: 1, min: 0, max: 1, step: 1, label: 'mirror (0/1)' },
      },
      build: function (ctx, p) {
        const f = ctx.field;
        const out = [];
        const a = (p.angle * Math.PI) / 180;
        const nVert = Math.round(p.density * p.vertical);
        const nDiag = Math.max(0, p.density - nVert);

        let x = f.x0 + ctx.rnd(0, 0.03) * f.w;
        const base = f.w / Math.max(nVert, 1);
        for (let i = 0; i < nVert && x < f.x1; i++) {
          const tilt = (ctx.rnd(-3.5, 3.5) * Math.PI) / 180;
          push(out, dashRay(ctx, x, f.y0 - 10, Math.PI / 2 + tilt, { dot: p.dot, drift: p.drift, seedOff: i }));
          x += base * (0.3 + 2 * Math.pow(ctx.rng(), 1.7));
        }

        const fams = p.mirror >= 0.5 ? [a, Math.PI - a] : [a];
        const per = Math.max(1, Math.round(nDiag / fams.length));
        for (let k = 0; k < fams.length; k++) {
          const ang = fams[k];
          const nx = -Math.sin(ang), ny = Math.cos(ang);
          const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
          const reach = (Math.abs(f.w * nx) + Math.abs(f.h * ny)) / 2;
          let o = -reach;
          const stepBase = (2 * reach) / per;
          for (let i = 0; i < per * 2 && o < reach; i++) {
            push(out, dashRay(ctx, cx + nx * o, cy + ny * o, ang,
                              { dot: p.dot, drift: p.drift, seedOff: 500 + k * 97 + i }));
            o += stepBase * (0.3 + 2 * Math.pow(ctx.rng(), 1.7));
          }
        }
        return out;
      },
    },

    bars: {
      label: 'Heavy bars',
      hint: 'Thick fragmented bars, scattered along an axis.',
      params: {
        count: { value: 12, min: 0, max: 40, step: 1, label: 'count' },
        length: { value: 0.16, min: 0.02, max: 0.5, step: 0.01, label: 'length' },
        weight: { value: 7, min: 1, max: 18, step: 1, label: 'weight' },
        frags: { value: 3, min: 1, max: 6, step: 1, label: 'fragments' },
        spread: { value: 0.16, min: 0, max: 0.6, step: 0.02, label: 'scatter' },
        tilt: { value: 0, min: -30, max: 30, step: 1, label: 'bar tilt' },
        occlude: { value: 1, min: 0, max: 1, step: 1, label: 'hides behind' },
      },
      build: function (ctx, p) {
        const f = ctx.field, out = [];
        const down = ctx.chance(0.5);
        const ax0 = f.x0 + ctx.rnd(0, 0.2) * f.w;
        const ay0 = f.y0 + (down ? ctx.rnd(0, 0.2) : ctx.rnd(0.8, 1)) * f.h;
        const ax1 = f.x1 - ctx.rnd(0, 0.2) * f.w;
        const ay1 = f.y0 + (down ? ctx.rnd(0.8, 1) : ctx.rnd(0, 0.2)) * f.h;
        const tilt = (p.tilt * Math.PI) / 180;

        for (let i = 0; i < p.count; i++) {
          const t = (i + ctx.rnd(-0.35, 0.35)) / Math.max(p.count - 1, 1);
          const sp = ctx.rnd(-p.spread, p.spread);
          const cx = ax0 + (ax1 - ax0) * t + sp * f.w * 0.5;
          const cy = ay0 + (ay1 - ay0) * t + sp * f.h * 0.5;
          if (!ctx.inField(cx, cy)) continue;

          const len = (ctx.chance(0.25) ? ctx.rnd(0.15, 0.4) : ctx.rnd(0.6, 1.4)) * p.length * f.w;
          const passes = Math.max(1, Math.round(p.weight * ctx.rnd(0.5, 1.3)));
          const frags = 1 + Math.floor(ctx.rnd(0, p.frags + 0.5));
          const dx = Math.cos(tilt), dy = Math.sin(tilt);

          const cuts = [];
          let remain = len;
          for (let k = 0; k < frags; k++) {
            const share = k === frags - 1 ? remain : remain * ctx.rnd(0.28, 0.62);
            cuts.push(share);
            remain -= share;
          }
          let s = -len / 2;
          const thick = passes * 0.7 * ctx.U;
          for (let k = 0; k < cuts.length; k++) {
            const e = Math.min(s + cuts[k], len / 2);
            if (p.occlude >= 0.5) {
              // the bar's own silhouette, so rulings stop at its edge
              ctx.addOccluder(segmentBox(
                { x: cx + dx * s, y: cy + dy * s },
                { x: cx + dx * e, y: cy + dy * e },
                thick + 1.2 * ctx.U));
            }
            for (let q = 0; q < passes; q++) {
              const o = (q - (passes - 1) / 2) * 0.7 * ctx.U;
              const a = { x: cx + dx * s - dy * o, y: cy + dy * s + dx * o };
              const b = { x: cx + dx * e - dy * o, y: cy + dy * e + dx * o };
              if (ctx.mask(a.x, a.y) || ctx.mask(b.x, b.y)) continue;
              if (!ctx.inField(a.x, a.y) || !ctx.inField(b.x, b.y)) continue;
              out.push({ pts: [a, b], passes: 1 });
            }
            s = e + len * ctx.rnd(0.04, 0.2);
          }
        }
        return out;
      },
    },

    flow: {
      label: 'Flow lines',
      hint: 'Polylines advected through a noise field.',
      params: {
        count: { value: 220, min: 10, max: 900, step: 10, label: 'lines' },
        steps: { value: 120, min: 10, max: 400, step: 10, label: 'length' },
        scale: { value: 1.6, min: 0.2, max: 6, step: 0.1, label: 'field scale' },
        step: { value: 3, min: 1, max: 10, step: 0.5, label: 'step' },
        turns: { value: 2.4, min: 0.3, max: 6, step: 0.1, label: 'turbulence' },
        dash: { value: 0, min: 0, max: 1, step: 1, label: 'dashed (0/1)' },
      },
      build: function (ctx, p) {
        const f = ctx.field, out = [];
        const sc = (p.scale * 0.0016) / ctx.U;
        for (let i = 0; i < p.count; i++) {
          let x = f.x0 + ctx.rng() * f.w;
          let y = f.y0 + ctx.rng() * f.h;
          let run = [];
          for (let s = 0; s < p.steps; s++) {
            const a = ctx.noise(x * sc, y * sc, 3) * Math.PI * 2 * p.turns;
            x += Math.cos(a) * p.step * ctx.U;
            y += Math.sin(a) * p.step * ctx.U;
            if (!ctx.inField(x, y) || ctx.mask(x, y)) {
              if (run.length > 1) out.push({ pts: run, passes: 1 });
              run = [];
              if (!ctx.inField(x, y)) break;
              continue;
            }
            run.push({ x: x, y: y });
            if (p.dash >= 0.5 && run.length > 3 + Math.floor(ctx.rng() * 6)) {
              out.push({ pts: run, passes: 1 });
              run = [];
              x += Math.cos(a) * p.step * ctx.U * ctx.rnd(1, 4);
              y += Math.sin(a) * p.step * ctx.U * ctx.rnd(1, 4);
            }
          }
          if (run.length > 1) out.push({ pts: run, passes: 1 });
        }
        return out;
      },
    },

    grid: {
      label: 'Grid',
      hint: 'A ruled grid, with cells that subdivide.',
      params: {
        cols: { value: 9, min: 1, max: 40, step: 1, label: 'columns' },
        rows: { value: 6, min: 1, max: 40, step: 1, label: 'rows' },
        jitter: { value: 0.12, min: 0, max: 1, step: 0.02, label: 'jitter' },
        split: { value: 0.35, min: 0, max: 1, step: 0.05, label: 'subdivide' },
        depth: { value: 2, min: 0, max: 4, step: 1, label: 'depth' },
        weight: { value: 1, min: 1, max: 6, step: 1, label: 'weight' },
      },
      build: function (ctx, p) {
        const f = ctx.field, out = [];
        const seg = (x0, y0, x1, y1) => {
          const a = { x: x0, y: y0 }, b = { x: x1, y: y1 };
          if (ctx.mask((x0 + x1) / 2, (y0 + y1) / 2)) return;
          out.push({ pts: [a, b], passes: p.weight });
        };
        const cell = (x0, y0, x1, y1, d) => {
          if (d < p.depth && ctx.chance(p.split)) {
            const mx = x0 + (x1 - x0) * ctx.rnd(0.35, 0.65);
            const my = y0 + (y1 - y0) * ctx.rnd(0.35, 0.65);
            if (ctx.chance(0.5)) {
              cell(x0, y0, mx, y1, d + 1); cell(mx, y0, x1, y1, d + 1);
              seg(mx, y0, mx, y1);
            } else {
              cell(x0, y0, x1, my, d + 1); cell(x0, my, x1, y1, d + 1);
              seg(x0, my, x1, my);
            }
            return;
          }
          const j = p.jitter * Math.min(x1 - x0, y1 - y0) * 0.5;
          const jx = () => ctx.rnd(-j, j);
          seg(x0 + jx(), y0 + jx(), x1 + jx(), y0 + jx());
          seg(x0 + jx(), y0 + jx(), x0 + jx(), y1 + jx());
        };
        const cw = f.w / p.cols, ch = f.h / p.rows;
        for (let i = 0; i < p.cols; i++) {
          for (let k = 0; k < p.rows; k++) {
            cell(f.x0 + i * cw, f.y0 + k * ch, f.x0 + (i + 1) * cw, f.y0 + (k + 1) * ch, 0);
          }
        }
        seg(f.x1, f.y0, f.x1, f.y1);
        seg(f.x0, f.y1, f.x1, f.y1);
        return out;
      },
    },

    rings: {
      label: 'Rings',
      hint: 'Concentric irregular loops, whole or broken.',
      params: {
        count: { value: 22, min: 1, max: 80, step: 1, label: 'rings' },
        radius: { value: 0.42, min: 0.05, max: 1, step: 0.01, label: 'outer radius' },
        x: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'x' },
        y: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'y' },
        wobble: { value: 0.16, min: 0, max: 0.7, step: 0.01, label: 'wobble' },
        broken: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'broken' },
        occlude: { value: 0, min: 0, max: 1, step: 1, label: 'hides behind' },
      },
      build: function (ctx, p) {
        const f = ctx.field, out = [];
        const cx = f.x0 + p.x * f.w, cy = f.y0 + p.y * f.h;
        const R = p.radius * Math.min(f.w, f.h);
        const ox = ctx.rnd(0, 60), oy = ctx.rnd(0, 60);

        // the outer ring's silhouette — noise() is pure, so this costs no RNG state
        if (p.occlude >= 0.5) {
          const verts = [];
          for (let k = 0; k < 96; k++) {
            const a = (Math.PI * 2 * k) / 96;
            const n = ctx.noise(Math.cos(a) * 1.6 + ox, Math.sin(a) * 1.6 + oy + p.count * 0.35, 2);
            const rr = R * (1 + p.wobble * (n - 0.5) * 2);
            verts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
          }
          ctx.addOccluder(verts);
        }
        for (let i = 1; i <= p.count; i++) {
          const r = (R * i) / p.count;
          const gapAt = ctx.rng() * Math.PI * 2;
          const gapSize = ctx.chance(p.broken) ? ctx.rnd(0.2, 1.6) : 0;
          const N = Math.max(24, Math.round(r * 0.6));
          let run = [];
          for (let k = 0; k <= N; k++) {
            const a = (Math.PI * 2 * k) / N;
            let da = Math.abs(((a - gapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            const inGap = gapSize > 0 && da > Math.PI - gapSize;
            const n = ctx.noise(Math.cos(a) * 1.6 + ox, Math.sin(a) * 1.6 + oy + i * 0.35, 2);
            const rr = r * (1 + p.wobble * (n - 0.5) * 2);
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            if (inGap || !ctx.inField(x, y) || ctx.mask(x, y)) {
              if (run.length > 1) out.push({ pts: run, passes: 1 });
              run = [];
              continue;
            }
            run.push({ x: x, y: y });
          }
          if (run.length > 1) out.push({ pts: run, passes: 1 });
        }
        return out;
      },
    },

    hatch: {
      label: 'Hatch patch',
      hint: 'A shape filled with ruled lines — tone without alpha.',
      params: {
        angle: { value: 35, min: 0, max: 180, step: 1, label: 'angle' },
        spacing: { value: 7, min: 1.5, max: 24, step: 0.5, label: 'spacing' },
        size: { value: 0.34, min: 0.05, max: 1, step: 0.01, label: 'size' },
        x: { value: 0.42, min: 0, max: 1, step: 0.01, label: 'x' },
        y: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'y' },
        cross: { value: 0, min: 0, max: 1, step: 1, label: 'cross-hatch' },
        outline: { value: 1, min: 0, max: 1, step: 1, label: 'outline' },
        occlude: { value: 1, min: 0, max: 1, step: 1, label: 'hides behind' },
      },
      build: function (ctx, p) {
        const f = ctx.field;
        const shape = blob(ctx, f.x0 + p.x * f.w, f.y0 + p.y * f.h,
                           p.size * Math.min(f.w, f.h) * 0.5, 0.28, ctx.rnd(0.7, 1.4), 64);
        if (p.occlude >= 0.5) ctx.addOccluder(shape.verts);
        let out = hatchPolygon(shape, (p.angle * Math.PI) / 180, p.spacing * ctx.U);
        if (p.cross >= 0.5) {
          out = out.concat(hatchPolygon(shape, ((p.angle + 90) * Math.PI) / 180, p.spacing * ctx.U));
        }
        if (p.outline >= 0.5) push(out, clipRun(ctx, shape.verts.concat([shape.verts[0]])));
        // clip to field + mask
        return out.filter((s) => {
          const a = s.pts[0], b = s.pts[s.pts.length - 1];
          return ctx.inField(a.x, a.y) && ctx.inField(b.x, b.y) &&
                 !ctx.mask(a.x, a.y) && !ctx.mask(b.x, b.y);
        });
      },
    },

    frame: {
      label: 'Frame & marks',
      hint: 'Registration marks and an optional border.',
      params: {
        corners: { value: 1, min: 0, max: 1, step: 1, label: 'corner marks' },
        border: { value: 0, min: 0, max: 1, step: 1, label: 'border' },
        rule: { value: 1, min: 0, max: 1, step: 1, label: 'left rule' },
        ticks: { value: 24, min: 0, max: 80, step: 1, label: 'rule ticks' },
        weight: { value: 2, min: 1, max: 6, step: 1, label: 'weight' },
      },
      build: function (ctx, p) {
        const f = ctx.field, U = ctx.U, out = [];
        if (p.corners >= 0.5) {
          const L = 16 * U;
          const c = [[f.x0, f.y0, 1, 1], [f.x1, f.y0, -1, 1], [f.x0, f.y1, 1, -1], [f.x1, f.y1, -1, -1]];
          for (const [x, y, sx, sy] of c) {
            out.push({ pts: [{ x: x, y: y }, { x: x + L * sx, y: y }], passes: 1 });
            out.push({ pts: [{ x: x, y: y }, { x: x, y: y + L * sy }], passes: 1 });
          }
        }
        if (p.border >= 0.5) {
          out.push({ pts: [{ x: f.x0, y: f.y0 }, { x: f.x1, y: f.y0 }, { x: f.x1, y: f.y1 },
                           { x: f.x0, y: f.y1 }, { x: f.x0, y: f.y0 }], passes: p.weight });
        }
        if (p.rule >= 0.5) {
          const rx = f.x0 - 14 * U;
          out.push({ pts: [{ x: rx, y: f.y0 - 6 * U }, { x: rx, y: f.y1 + 6 * U }], passes: p.weight });
          for (let i = 1; i <= p.ticks; i++) {
            const ty = f.y0 + (f.h * i) / (p.ticks + 1);
            out.push({ pts: [{ x: rx - 4 * U, y: ty }, { x: rx, y: ty }], passes: 1 });
          }
        }
        return out;
      },
    },

    label: {
      label: 'Label',
      hint: 'Single-stroke type — the kind a pen can draw.',
      params: {
        size: { value: 16, min: 4, max: 60, step: 1, label: 'size' },
        x: { value: 0.02, min: -0.3, max: 1, step: 0.01, label: 'x' },
        y: { value: 0.97, min: 0, max: 1.1, step: 0.01, label: 'y' },
        weight: { value: 1, min: 1, max: 4, step: 1, label: 'weight' },
        occlude: { value: 0, min: 0, max: 1, step: 1, label: 'hides behind' },
      },
      text: 'PLOTTER STUDIO',
      build: function (ctx, p, prior, text) {
        if (!global.StrokeFont) return [];
        const g = ctx.page; // type is set against the sheet, not the drawing area
        const str = String(text === undefined ? '' : text);
        const size = p.size * ctx.U;
        const x = g.x0 + p.x * g.w, y = g.y0 + p.y * g.h;
        if (p.occlude >= 0.5 && str.length) {
          const pad = size * 0.45;
          ctx.addOccluder(boxPoly(x - pad, y - pad,
                                  x + global.StrokeFont.width(str, size) + pad, y + size + pad));
        }
        return global.StrokeFont.text(str, x, y, size).map((l) => ({ pts: l, passes: p.weight }));
      },
    },

    program: {
      label: 'HP-GL program',
      hint: 'A command column measured off the drawing beside it.',
      params: {
        size: { value: 12, min: 4, max: 30, step: 1, label: 'size' },
        x: { value: 0.005, min: -0.2, max: 1, step: 0.005, label: 'x' },
        y: { value: 0.01, min: -0.1, max: 1, step: 0.01, label: 'y' },
        rows: { value: 22, min: 4, max: 44, step: 1, label: 'rows' },
        box: { value: 1, min: 0, max: 1, step: 1, label: 'boxed row' },
        occlude: { value: 1, min: 0, max: 1, step: 1, label: 'hides behind' },
      },
      build: function (ctx, p, prior) {
        if (!global.StrokeFont) return [];
        const f = ctx.field, g = ctx.page, U = ctx.U;
        let fs = p.size * U;
        const x = g.x0 + p.x * g.w;

        // A4 landscape at the HP standard 40 plotter units/mm; HP-GL's y points up.
        const W = ctx.canvas.w, H = ctx.canvas.h;
        const hp = (px, py) => [
          Math.round((px / W) * 297 * 40),
          Math.round(((H - py) / H) * 210 * 40),
        ].join(',');

        const diag = Math.hypot(f.w, f.h);
        const rows = ['IN;', 'IP' + hp(f.x0, f.y1) + ',' + hp(f.x1, f.y0) + ';',
                      'SC0,' + Math.round(W) + ',0,' + Math.round(H) + ';', 'PN1;', 'SP1;'];
        const dotted = prior && prior.length ? prior : [];
        rows.push('LT1,' + ((5.5 * U) / diag * 100).toFixed(2) + ';');
        rows.push('PT' + (1.15 * U * (297 / W)).toFixed(2) + ';', 'WU0;', 'RO0;', 'DI1,0;');
        rows.push('IW' + hp(f.x0, f.y1) + ',' + hp(f.x1, f.y0) + ';', 'CN5;');

        const budget = Math.max(0, p.rows - rows.length - 2);
        const pairs = Math.floor(budget / 2);
        if (pairs > 0 && dotted.length > 1) {
          const stride = Math.max(1, Math.floor(dotted.length / (pairs + 1)));
          for (let i = 0; i < pairs; i++) {
            const s = dotted[Math.min((i + 1) * stride, dotted.length - 1)];
            const a = s.pts[0], b = s.pts[s.pts.length - 1];
            rows.push('PU' + hp(a.x, a.y) + ';', 'PD' + hp(b.x, b.y) + ';');
          }
        }
        rows.push('PU;', 'SP0;');

        // Fit the column: the gutter (or a third of the sheet) is all there is. Drop the
        // four-coordinate rows before shrinking the type into illegibility.
        const colW = Math.max(40, (f.x0 > g.x0 ? f.x0 - g.x0 - 16 * U : g.w * 0.32) - fs * 1.4);
        const ADV = global.StrokeFont.ADVANCE;
        const widthOf = (n, size) => ((n * ADV - (ADV - 4)) * size) / 6;
        const longest = () => rows.reduce((a, s) => Math.max(a, s.length), 5);
        const anchor = (s) => s.indexOf('LT1') === 0 || s.indexOf('PN1') === 0 || s.indexOf('CN5') === 0;
        for (let guard = 0; guard < 8 && widthOf(longest(), fs) > colW; guard++) {
          let widest = -1;
          for (let i = 0; i < rows.length; i++) {
            if (anchor(rows[i]) || rows[i].length < 14) continue;
            if (widest === -1 || rows[i].length > rows[widest].length) widest = i;
          }
          if (widest === -1) break;
          rows.splice(widest, 1);
        }
        fs = Math.min(fs, (colW * 6) / Math.max(longest() * ADV - (ADV - 4), 1));

        const out = [];
        const lead = fs * 1.95;
        let y = g.y0 + p.y * g.h + fs;

        // knock out the column so nothing rules through the type
        if (p.occlude >= 0.5) {
          ctx.addOccluder(boxPoly(x - fs * 0.5, y - fs * 1.4,
                                  x + fs * 1.6 + widthOf(longest(), fs),
                                  y + rows.length * lead));
        }

        const boxRow = p.box >= 0.5 ? Math.floor(ctx.rng() * rows.length) : -1;
        for (let i = 0; i < rows.length; i++) {
          for (const l of global.StrokeFont.text(rows[i], x + fs * 0.9, y, fs)) {
            out.push({ pts: l, passes: 1 });
          }
          if (i === boxRow) {
            const w = global.StrokeFont.width(rows[i], fs);
            out.push({ pts: [
              { x: x + fs * 0.4, y: y - fs * 0.42 }, { x: x + fs * 1.4 + w, y: y - fs * 0.42 },
              { x: x + fs * 1.4 + w, y: y + fs * 1.42 }, { x: x + fs * 0.4, y: y + fs * 1.42 },
              { x: x + fs * 0.4, y: y - fs * 0.42 }], passes: 1 });
          }
          y += lead;
        }
        return out;
      },
    },
  };

  function push(dst, src) {
    for (let i = 0; i < src.length; i++) dst.push(src[i]);
  }

  global.Marks = {
    ELEMENTS: ELEMENTS,
    context: context,
    flatten: flatten,
    blob: blob,
    hatchPolygon: hatchPolygon,
    clipRun: clipRun,
    occlude: occlude,
    totalLength: totalLength,
    segmentBox: segmentBox,
    boxPoly: boxPoly,
    pointInPoly: pointInPoly,
    _mulberry32: mulberry32,
    _makeNoise: makeNoise,
  };
})(window);
