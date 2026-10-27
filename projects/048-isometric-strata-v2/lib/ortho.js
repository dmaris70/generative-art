/*
 * ortho.js — the orthographic drawings, from the building's solids.
 *
 * Plans, sections and elevations are not the axonometric clipped: each solid
 * the scene recorded is drawn with the face the viewer would actually see,
 * and where the cutting plane passes through a solid it is drawn as a cut —
 * thin elements (walls, slabs, columns) in solid poché, massive ones in
 * hatch — under a heavy outline. Whatever the styles drew without a solid
 * (prisms, glyphs, lines) goes through the same half-space clip the
 * axonometric engine used, in the same painter's order.
 *
 * Conventions on the sheet: plan has north up (so +y runs down the page and
 * +x to the right); a view "from the south" stands at +y and looks at −y with
 * +x on its right; from the east, −y is on the right; from the north, −x;
 * from the west, +y.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom;
  const Hnd = global.Hand;
  const POCHE = [44, 48, 56];
  const THIN = 0.8;      // a solid thinner than this in the cutting plane is poché, not hatch

  const SIDES = {
    // viewer standing on this side of the building, looking at it
    S: { n: [0, 1], face: 'y1', sx: (p) => p[0], key: (s) => (s.y + s.d / 2), shade: 1 },
    N: { n: [0, -1], face: 'y0', sx: (p) => -p[0], key: (s) => -(s.y + s.d / 2), shade: 1 },
    E: { n: [1, 0], face: 'x1', sx: (p) => -p[1], key: (s) => (s.x + s.w / 2), shade: 2 },
    W: { n: [-1, 0], face: 'x0', sx: (p) => p[1], key: (s) => -(s.x + s.w / 2), shade: 2 },
  };

  function facePts(s, face) {
    const x0 = s.x, x1 = s.x + s.w, y0 = s.y, y1 = s.y + s.d, z0 = s.z, z1 = s.z + s.h;
    switch (face) {
      case 'y1': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      case 'y0': return [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]];
      case 'x1': return [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]];
      case 'x0': return [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]];
      case 'top': return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      default: return [];
    }
  }

  function solidFill(s, k, mode) {
    if (!s.color) return null;
    return { color: G.shade(s.color, k), alpha: s.alpha, mode: mode || s.mode, spacing: s.spacing, angle: 'edge' };
  }

  // the cut: solid poché for thin elements, hatch for massive ones, outline only for open frames
  function cutFill(s, thin) {
    if (!s.color) return null;
    if (thin) return { color: G.mix(s.color, POCHE, 0.72), alpha: 235, mode: 'flat' };
    return { color: G.mix(s.color, POCHE, 0.45), alpha: 150, mode: 'hatch', spacing: 3.4, angle: Math.PI / 4 };
  }
  const CUT_EDGE = { alpha: 240, weight: 2.1, wob: 0.35 };

  // ---- the shared drawing loop ----
  // drawables: { layer, key, draw }  sorted painter's-order, far / low first
  function run(scene, hand, P, o) {
    const list = [];
    const cuts = [];
    const push = (layer, key, draw) => list.push({ layer: layer, key: key, draw: draw, i: list.length });

    // ---- the solids ----
    scene.solids.forEach((s) => o.solid(s, push));

    // ---- everything drawn without a solid ----
    for (const it of scene.items) {
      if (it.solid !== undefined) continue; // the three faces a box emitted: the solid replaces them
      if (it.kind === 'face') {
        const c = Hnd.clipPoly(it.pts, o.axis, o.max);
        if (c.pts.length >= 3) push(it.layer, o.depth(G.centroid(c.pts)), () => hand.poly(c.pts.map(P), it.fill, it.edge));
        for (let i = 0; i + 1 < c.cuts.length; i += 2) cuts.push([P(c.cuts[i]), P(c.cuts[i + 1])]);
      } else if (it.kind === 'line') {
        for (const run of Hnd.clipLine(it.pts, o.axis, o.max)) push(it.layer, o.depth(G.centroid(run)), () => hand.line(run.map(P), it.pen));
      } else if (it.kind === 'custom') {
        if (it.anchor[o.axis] > o.max) continue;
        push(it.layer, o.depth(it.anchor), () => (it.alt ? it.alt(hand, P, o.view, it) : it.draw(hand, P, it)));
      }
    }
    list.sort((a, b) => a.layer - b.layer || a.key - b.key || a.i - b.i);
    for (const d of list) d.draw();
    for (const sg of cuts) hand.line(sg, CUT_EDGE);
  }

  // ---- plan, cut at z ----
  function plan(scene, hand, P, cutZ) {
    run(scene, hand, P, {
      axis: 2, max: cutZ, view: 'plan', depth: (c) => c[2],
      solid(s, push) {
        const z1 = s.z + s.h;
        if (s.z >= cutZ) return; // above the cut
        const foot = [[s.x, s.y, 0], [s.x + s.w, s.y, 0], [s.x + s.w, s.y + s.d, 0], [s.x, s.y + s.d, 0]];
        if (z1 <= cutZ) {
          // below the cut, seen from above: its top
          push(s.layer, z1, () => hand.poly(facePts(s, 'top').map(P), solidFill(s, s.shade[0]), s.edge));
        } else {
          const thin = Math.min(s.w, s.d) <= THIN && s.h >= 1;
          push(s.layer, cutZ + 0.001, () => {
            hand.poly(foot.map(P), cutFill(s, thin), s.color || s.edge ? CUT_EDGE : null);
          });
        }
      },
    });
  }

  // ---- section: keep the near half, look at the cut ----
  // dir 'y': plane y = cut, viewer at the plane looking toward −y (right = +x)
  // dir 'x': plane x = cut, viewer looking toward −x (right = −y)
  function section(scene, hand, P, dir, cut) {
    const v = dir === 'y' ? SIDES.S : SIDES.E;
    const axis = dir === 'y' ? 1 : 0;
    run(scene, hand, P, {
      axis: axis, max: cut, view: 'section', depth: (c) => c[axis],
      solid(s, push) {
        const lo = dir === 'y' ? s.y : s.x, hi = lo + (dir === 'y' ? s.d : s.w);
        if (lo >= cut) return; // the far half is cut away
        if (hi <= cut) {
          // beyond the plane, seen from it: the face that looks toward the viewer
          push(s.layer, lo + (hi - lo) / 2, () => hand.poly(facePts(s, v.face).map(P), solidFill(s, s.shade[v.shade]), s.edge));
        } else {
          const t = dir === 'y' ? s.w : s.d;
          const thin = Math.min(t, s.h) <= THIN;
          const rect = dir === 'y'
            ? [[s.x, cut, s.z], [s.x + s.w, cut, s.z], [s.x + s.w, cut, s.z + s.h], [s.x, cut, s.z + s.h]]
            : [[cut, s.y, s.z], [cut, s.y + s.d, s.z], [cut, s.y + s.d, s.z + s.h], [cut, s.y, s.z + s.h]];
          push(s.layer, 1e9, () => hand.poly(rect.map(P), cutFill(s, thin), s.color || s.edge ? CUT_EDGE : null));
        }
      },
    });
  }

  // ---- elevation: nothing cut, one face of every solid ----
  function elevation(scene, hand, P, side) {
    const v = SIDES[side];
    run(scene, hand, P, {
      axis: 2, max: Infinity, view: 'section', depth: (c) => (side === 'S' ? c[1] : side === 'N' ? -c[1] : side === 'E' ? c[0] : -c[0]),
      solid(s, push) {
        push(s.layer, v.key(s), () => hand.poly(facePts(s, v.face).map(P), solidFill(s, s.shade[v.shade]), s.edge));
        // the roof seen edge-on adds nothing; the top face stays out of an elevation
      },
    });
  }

  // ---- drawing furniture ----
  const PEN = { color: [58, 64, 74], alpha: 175, weight: 0.8, wob: 0.3 };
  const TXT = { color: [48, 54, 64], alpha: 205 };

  // a dimension string between two page points, offset to one side
  function dim(hand, a, b, off, label, size) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const A = [a[0] + nx * off, a[1] + ny * off], B = [b[0] + nx * off, b[1] + ny * off];
    hand.line([a, [A[0] + nx * 3, A[1] + ny * 3]], { alpha: 110, weight: 0.6, wob: 0.2 });
    hand.line([b, [B[0] + nx * 3, B[1] + ny * 3]], { alpha: 110, weight: 0.6, wob: 0.2 });
    hand.line([A, B], PEN);
    for (const e of [A, B]) hand.line([[e[0] - (dx / l) * 4 - nx * 4, e[1] - (dy / l) * 4 - ny * 4], [e[0] + (dx / l) * 4 + nx * 4, e[1] + (dy / l) * 4 + ny * 4]], { alpha: 190, weight: 1.2, wob: 0.2 });
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], sz = size || 9;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const w = hand.textWidth(label, sz);
    if (horizontal) hand.text(label, m[0] - w / 2, m[1] - sz - 3, sz, TXT);
    else {
      // a vertical string reads a quarter of the way along, clear of whatever crosses its middle
      const q = [A[0] + (B[0] - A[0]) * 0.22, A[1] + (B[1] - A[1]) * 0.22];
      hand.text(label, q[0] - sz - 4 - w, q[1] - sz / 2, sz, TXT);
    }
  }

  // a grid bubble: a circle with its letter or number, on a dash-dot line
  function bubble(hand, x, y, label) {
    hand.circle(x, y, 9, PEN, { color: [236, 232, 220], alpha: 230, mode: 'flat' });
    hand.text(label, x - hand.textWidth(label, 8) / 2, y - 4, 8, TXT);
  }
  function gridLines(hand, grid, P, ext, labelsX, labelsY) {
    const bub = [];
    grid.xs.forEach((x, i) => {
      const a = P([x, ext.y0, 0]), b = P([x, ext.y1, 0]);
      hand.line([a, b], { alpha: 95, weight: 0.6, wob: 0.3, dash: [14, 3, 2, 3] });
      bub.push([a[0], a[1] - 14, labelsX[i] || '']);
    });
    grid.ys.forEach((y, j) => {
      const a = P([ext.x0, y, 0]), b = P([ext.x1, y, 0]);
      hand.line([a, b], { alpha: 95, weight: 0.6, wob: 0.3, dash: [14, 3, 2, 3] });
      bub.push([a[0] - 14, a[1], labelsY[j] || '']);
    });
    for (const b of bub) bubble(hand, b[0], b[1], b[2]);
  }
  function labels(n, alpha) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(alpha ? String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') : String(i + 1));
    return out;
  }

  // a level marker: a small triangle on a ruled line, the elevation beside it
  function level(hand, x0, x1, y, text, side) {
    hand.line([[x0, y], [x1, y]], { alpha: 110, weight: 0.6, wob: 0.3, dash: [8, 4] });
    // the triangle sits at the outer end of the rule, the elevation inboard of it
    const tx = side === 'left' ? x0 : x1;
    hand.poly([[tx, y], [tx - 5, y - 8], [tx + 5, y - 8]], null, PEN);
    const w = hand.textWidth(text, 8.5);
    hand.text(text, side === 'left' ? tx + 9 : tx - 9 - w, y - 11, 8.5, TXT);
  }

  global.Ortho = { plan: plan, section: section, elevation: elevation, dim: dim, gridLines: gridLines, labels: labels, level: level, SIDES: SIDES };
})(window);
