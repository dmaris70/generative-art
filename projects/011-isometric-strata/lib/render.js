/*
 * render.js — the hand that draws the sheet.
 *
 * Everything on the page goes through Hand: a polyline renderer that lays each
 * stroke down like a pencil (a little wobble, a little overshoot, sometimes a
 * second pass that doesn't quite register), plus clipped fills that read as
 * coloured pencil or ruled hatching rather than flat vector colour.
 *
 *   const hand = Hand.create(g, rng, { wob: 1, weightScale: 1 });
 *   hand.line([[x,y], …], { color, alpha, weight, passes, dash, wob, overshoot });
 *   hand.poly(pts, { color, alpha, mode: 'pencil'|'flat'|'hatch'|'cross', spacing, angle }, edgePen);
 *   hand.text('DWG 01', x, y, capHeight, pen, { bold, align });
 *
 * Coordinates are sheet units (the caller applies any global scale). `g` is a
 * p5 renderer — the global window in p5 global mode, or a p5.Graphics.
 */
(function (global) {
  'use strict';

  const INK = [52, 58, 68];

  function create(g, rng, opts) {
    opts = opts || {};
    const WOB = opts.wob === undefined ? 1 : opts.wob;
    const WSCALE = opts.weightScale === undefined ? 1 : opts.weightScale;

    function pen(p) {
      p = p || {};
      return {
        color: p.color || INK,
        alpha: p.alpha === undefined ? 200 : p.alpha,
        weight: (p.weight === undefined ? 1 : p.weight) * WSCALE,
        passes: p.passes || 1,
        dash: p.dash || null,
        wob: (p.wob === undefined ? 1 : p.wob) * WOB,
        overshoot: p.overshoot === undefined ? 0 : p.overshoot,
      };
    }

    // ---- polyline with pencil character ----
    function wobblePath(pts, amp, over) {
      const out = [];
      const n = pts.length;
      // extend the ends a touch (overshoot), as a hand does past a ruler mark
      let a0 = pts[0], a1 = pts[n - 1];
      if (over > 0 && n >= 2) {
        const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1];
        const l = Math.hypot(dx, dy) || 1;
        const o0 = rng.range(-0.2, 1) * over;
        a0 = [pts[0][0] - (dx / l) * o0, pts[0][1] - (dy / l) * o0];
        const ex = pts[n - 1][0] - pts[n - 2][0], ey = pts[n - 1][1] - pts[n - 2][1];
        const le = Math.hypot(ex, ey) || 1;
        const o1 = rng.range(-0.2, 1) * over;
        a1 = [pts[n - 1][0] + (ex / le) * o1, pts[n - 1][1] + (ey / le) * o1];
      }
      const src = n >= 2 ? [a0].concat(pts.slice(1, n - 1), [a1]) : pts;
      for (let i = 0; i < src.length - 1; i++) {
        const a = src[i], b = src[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.hypot(dx, dy);
        const segs = Math.max(1, Math.min(14, Math.ceil(L / 16)));
        const px = -dy / (L || 1), py = dx / (L || 1);
        // a smooth random bow: two sine terms with random phase and amplitude
        const k1 = rng.range(-1, 1) * amp, k2 = rng.range(-0.6, 0.6) * amp, ph = rng.range(0, Math.PI);
        const j0 = i === 0 ? rng.gauss() * amp * 0.35 : 0;
        for (let s = i === 0 ? 0 : 1; s <= segs; s++) {
          const t = s / segs;
          let off = k1 * Math.sin(Math.PI * t) + k2 * Math.sin(2 * Math.PI * t + ph);
          if (s === 0) off += j0;
          if (s === segs) off += rng.gauss() * amp * 0.35;
          out.push([a[0] + dx * t + px * off, a[1] + dy * t + py * off]);
        }
      }
      return out;
    }

    function dashify(pts, dash) {
      const on = dash[0], off = dash[1];
      const out = [];
      let cur = [], remain = on, drawing = true;
      for (let i = 0; i < pts.length - 1; i++) {
        let a = pts[i];
        const b = pts[i + 1];
        let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (drawing && cur.length === 0) cur.push(a);
        while (L > 0) {
          const step = Math.min(L, remain);
          const t = step / L;
          const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (drawing) cur.push(p);
          remain -= step;
          L -= step;
          a = p;
          if (remain <= 1e-6) {
            if (drawing && cur.length > 1) out.push(cur);
            cur = [];
            drawing = !drawing;
            remain = drawing ? on : off;
            if (drawing) cur.push(a);
          }
        }
      }
      if (drawing && cur.length > 1) out.push(cur);
      return out;
    }

    function strokeOnce(pts, P) {
      g.beginShape();
      for (const p of pts) g.vertex(p[0], p[1]);
      g.endShape();
    }

    function line(pts, p) {
      if (!pts || pts.length < 2) return;
      const P = pen(p);
      const pieces = P.dash ? dashify(pts, P.dash) : [pts];
      g.noFill();
      g.strokeJoin(g.ROUND);
      g.strokeCap(g.ROUND);
      for (const piece of pieces) {
        for (let k = 0; k < P.passes; k++) {
          const amp = P.wob * rng.range(0.5, 1.3);
          const path = wobblePath(piece, amp, P.overshoot * P.wob);
          const a = P.alpha * (P.passes > 1 ? rng.range(0.55, 0.85) : rng.range(0.85, 1));
          g.stroke(P.color[0], P.color[1], P.color[2], a);
          g.strokeWeight(P.weight * rng.range(0.85, 1.15));
          strokeOnce(path);
        }
      }
    }

    // ---- fills ----
    function clipPath(pts) {
      const ctx = g.drawingContext;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.clip();
    }
    function unclip() {
      g.drawingContext.restore();
      // restore() puts the context's fill/stroke back to what they were at
      // save() time, but p5 caches the last style it set and skips the canvas
      // when asked for it again — so re-sync with a sentinel it will never match
      g.fill(1, 2, 3, 0);
      g.stroke(1, 2, 3, 0);
    }

    // Straight ruled lines across a polygon's bounding box at `angle`; call
    // inside a clip. Angle 0 = horizontal on screen.
    function ruled(pts, spacing, angle, p, jitter) {
      const P = pen(p);
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const nx = -sa, ny = ca;
      let d0 = Infinity, d1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      for (const q of pts) {
        const d = q[0] * nx + q[1] * ny, t = q[0] * ca + q[1] * sa;
        if (d < d0) d0 = d; if (d > d1) d1 = d;
        if (t < t0) t0 = t; if (t > t1) t1 = t;
      }
      g.noFill();
      g.strokeCap(g.ROUND);
      const jit = jitter === undefined ? 0.25 : jitter;
      for (let d = d0 + rng.range(0, spacing); d < d1; d += spacing * rng.range(1 - jit, 1 + jit)) {
        const dd = d + rng.gauss() * spacing * 0.08;
        const a = [nx * dd + ca * (t0 - 2), ny * dd + sa * (t0 - 2)];
        const b = [nx * dd + ca * (t1 + 2), ny * dd + sa * (t1 + 2)];
        const path = wobblePath([a, b], P.wob * 0.6, 0);
        g.stroke(P.color[0], P.color[1], P.color[2], P.alpha * rng.range(0.7, 1));
        g.strokeWeight(P.weight * rng.range(0.8, 1.2));
        strokeOnce(path);
      }
    }

    function resolveAngle(fill, pts) {
      const a = fill.angle;
      if (typeof a === 'number') return a;
      const e = (i, j) => Math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]);
      if (a === 'edge') return e(0, 1);
      if (a === 'side') return e(pts.length - 1, 0);
      if (a === 'edge2') return e(1, 2);
      // default: a pencil's natural diagonal, varied a little per face
      return -Math.PI / 3.2 + rng.range(-0.12, 0.12);
    }

    function poly(pts, fill, edge) {
      if (!pts || pts.length < 3) return;
      if (fill && fill.mode !== 'none') {
        const c = fill.color || INK;
        const alpha = fill.alpha === undefined ? 150 : fill.alpha;
        const mode = fill.mode || 'pencil';
        clipPath(pts);
        if (mode === 'flat' || mode === 'pencil') {
          g.noStroke();
          g.fill(c[0], c[1], c[2], mode === 'pencil' ? alpha * 0.62 : alpha);
          g.beginShape();
          for (const p of pts) g.vertex(p[0], p[1]);
          g.endShape(g.CLOSE);
        }
        if (mode === 'pencil') {
          // the tooth: two families of near-parallel strokes, unequal weight
          const ang = resolveAngle(fill, pts);
          const sp = fill.spacing || 2.6;
          ruled(pts, sp, ang, { color: c, alpha: alpha * 0.55, weight: 1.15, wob: 0.55 }, 0.3);
          ruled(pts, sp * 2.1, ang + rng.range(0.35, 0.7), { color: c, alpha: alpha * 0.28, weight: 0.9, wob: 0.7 }, 0.4);
        } else if (mode === 'hatch' || mode === 'cross') {
          const ang = resolveAngle(fill, pts);
          const sp = fill.spacing || 4;
          const hp = fill.pen || { color: c, alpha: alpha, weight: 0.8, wob: 0.5 };
          ruled(pts, sp, ang, hp, 0.15);
          if (mode === 'cross') ruled(pts, sp * 1.3, ang + Math.PI / 2 + rng.range(-0.2, 0.2), hp, 0.15);
        } else if (mode === 'grain') {
          // dense fine scribble, no flat base — the darkest a pencil gets
          const ang = resolveAngle(fill, pts);
          ruled(pts, 1.6, ang, { color: c, alpha: alpha, weight: 0.9, wob: 0.5 }, 0.35);
        }
        unclip();
      }
      if (edge) line(pts.concat([pts[0]]), edge);
    }

    // ---- lettering (single-stroke font from assets/strokefont.js) ----
    function textWidth(str, size) {
      return global.StrokeFont ? global.StrokeFont.width(str, size) : 0;
    }

    function text(str, x, y, size, p, o) {
      if (!global.StrokeFont) return;
      o = o || {};
      const w = textWidth(str, size);
      if (o.align === 'center') x -= w / 2;
      else if (o.align === 'right') x -= w;
      const P = pen(Object.assign({ weight: size * 0.085 + 0.25, wob: 0.35, alpha: 210 }, p || {}));
      const strokes = global.StrokeFont.text(str, x, y, size, { tracking: o.tracking });
      const reps = o.bold ? 2 : 1;
      for (let r = 0; r < reps; r++) {
        const dx = r === 0 ? 0 : size * 0.06, dy = r === 0 ? 0 : -size * 0.02;
        for (const s of strokes) line(s.map((q) => [q.x + dx, q.y + dy]), P);
      }
      return w;
    }

    // ---- small helpers ----
    function rect(x, y, w, h, p, fill) {
      poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill || null, p === undefined ? {} : p);
    }

    function circle(cx, cy, r, p, fill, n) {
      const k = n || Math.max(10, Math.min(48, Math.round(r * 1.2)));
      const pts = [];
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      poly(pts, fill || null, p === undefined ? {} : p);
    }

    function dot(x, y, r, p) {
      const P = pen(p);
      g.noStroke();
      g.fill(P.color[0], P.color[1], P.color[2], P.alpha);
      g.circle(x + rng.gauss() * 0.2, y + rng.gauss() * 0.2, r * 2);
    }

    return { line, poly, ruled, clipPath, unclip, text, textWidth, rect, circle, dot, pen, rng };
  }

  // Draw a Scene through a projection P(p3) → [sx, sy] in sheet units.
  function render(scene, hand, P) {
    const items = scene.sorted();
    for (const it of items) {
      if (it.kind === 'face') {
        const pts = it.pts.map(P);
        hand.poly(pts, it.fill, it.edge);
      } else if (it.kind === 'line') {
        hand.line(it.pts.map(P), it.pen);
      } else if (it.kind === 'custom') {
        it.draw(hand, P, it);
      }
    }
  }

  // ---- orthographic views: clip the scene to a half-space, draw the far side,
  // and mark where the cut passes through a face with a heavy line ----
  function clipPoly(pts, axis, max) {
    const out = [], cuts = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ina = a[axis] <= max, inb = b[axis] <= max;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (max - a[axis]) / (b[axis] - a[axis]);
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        out.push(q);
        cuts.push(q);
      }
    }
    return { pts: out, cuts: cuts };
  }

  function clipLine(pts, axis, max) {
    const runs = [];
    let cur = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ina = a[axis] <= max, inb = b[axis] <= max;
      if (ina && cur.length === 0) cur.push(a);
      if (ina && inb) cur.push(b);
      else if (ina !== inb) {
        const t = (max - a[axis]) / (b[axis] - a[axis]);
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        if (ina) { cur.push(q); runs.push(cur); cur = []; }
        else { cur = [q, b]; }
      }
    }
    if (cur.length > 1) runs.push(cur);
    return runs;
  }

  // o: { axis, max, depth(p3) → key, view: 'plan'|'section', cutPen }
  function renderView(scene, hand, P, o) {
    const items = scene.items.slice().sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      const ca = a.pts ? global.ISO.geom.centroid(a.pts) : a.anchor || [0, 0, 0];
      const cb = b.pts ? global.ISO.geom.centroid(b.pts) : b.anchor || [0, 0, 0];
      return o.depth(ca) - o.depth(cb);
    });
    const cutSegs = [];
    for (const it of items) {
      if (it.kind === 'face') {
        const c = clipPoly(it.pts, o.axis, o.max);
        if (c.pts.length >= 3) hand.poly(c.pts.map(P), it.fill, it.edge);
        for (let i = 0; i + 1 < c.cuts.length; i += 2) cutSegs.push([P(c.cuts[i]), P(c.cuts[i + 1])]);
      } else if (it.kind === 'line') {
        for (const run of clipLine(it.pts, o.axis, o.max)) hand.line(run.map(P), it.pen);
      } else if (it.kind === 'custom') {
        if (it.anchor[o.axis] > o.max) continue;
        if (it.alt) it.alt(hand, P, o.view, it);
        else it.draw(hand, P, it);
      }
    }
    const cp = o.cutPen || { alpha: 235, weight: 2.1, wob: 0.35 };
    for (const sgm of cutSegs) hand.line(sgm, cp);
  }

  global.Hand = { create: create, render: render, renderView: renderView, clipPoly: clipPoly, clipLine: clipLine, INK: INK };
})(window);
