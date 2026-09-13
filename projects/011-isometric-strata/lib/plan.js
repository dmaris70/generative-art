/*
 * plan.js — footprints. A building's plan is a mask over a cell grid; the
 * shape names (RECTANGLE, LSHAPE, …) are recipes for carving that mask, and
 * outline() traces the mask back into rectilinear polygons so a slab or a
 * volume can follow an L or a T without seams.
 */
(function (global) {
  'use strict';

  const SHAPES = ['RECTANGLE', 'LSHAPE', 'TSHAPE', 'STEPPED', 'CORNER', 'CROSS', 'COURT', 'BAR'];

  function mask(nx, ny, shape, rng) {
    const m = [];
    for (let i = 0; i < nx; i++) {
      m.push([]);
      for (let j = 0; j < ny; j++) m[i].push(true);
    }
    const cut = (i0, j0, i1, j1) => {
      for (let i = Math.max(0, i0); i < Math.min(nx, i1); i++) for (let j = Math.max(0, j0); j < Math.min(ny, j1); j++) m[i][j] = false;
    };
    const hx = Math.max(1, Math.round(nx * rng.range(0.35, 0.5))), hy = Math.max(1, Math.round(ny * rng.range(0.35, 0.5)));
    if (shape === 'LSHAPE') {
      const c = rng.int(0, 3);
      cut(c & 1 ? nx - hx : 0, c & 2 ? ny - hy : 0, c & 1 ? nx : hx, c & 2 ? ny : hy);
    } else if (shape === 'TSHAPE') {
      if (rng.chance(0.5)) { cut(0, ny - hy, hx, ny); cut(nx - hx, ny - hy, nx, ny); }
      else { cut(nx - hx, 0, nx, hy); cut(nx - hx, ny - hy, nx, ny); }
    } else if (shape === 'STEPPED') {
      const steps = Math.min(nx, ny) - 1;
      for (let s = 1; s <= steps; s++) cut(nx - s, ny - (steps - s + 1), nx, ny);
    } else if (shape === 'CORNER') {
      cut(hx, hy, nx, ny);
    } else if (shape === 'CROSS') {
      const cx = Math.max(1, Math.round(nx * 0.28)), cy = Math.max(1, Math.round(ny * 0.28));
      cut(0, 0, cx, cy); cut(nx - cx, 0, nx, cy); cut(0, ny - cy, cx, ny); cut(nx - cx, ny - cy, nx, ny);
    } else if (shape === 'COURT') {
      if (nx >= 3 && ny >= 3) cut(1, 1, nx - 1, ny - 1);
    } else if (shape === 'BAR') {
      cut(0, Math.max(1, Math.round(ny * 0.55)), nx, ny);
    }
    // never lose everything
    let any = false;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) any = any || m[i][j];
    if (!any) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) m[i][j] = true;
    return m;
  }

  function cells(m) {
    const out = [];
    for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) if (m[i][j]) out.push([i, j]);
    return out;
  }

  function at(m, i, j) {
    return i >= 0 && j >= 0 && i < m.length && j < m[i].length && m[i][j];
  }

  // Rectilinear outline loops of a mask, in grid coordinates, counter-clockwise
  // around filled cells (bottom edge runs +i, right edge +j, …).
  function outline(m) {
    const edges = new Map(); // "i,j" start → [end]
    const push = (a, b) => {
      const k = a.join(',');
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(b);
    };
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (!m[i][j]) continue;
        if (!at(m, i, j - 1)) push([i, j], [i + 1, j]);
        if (!at(m, i + 1, j)) push([i + 1, j], [i + 1, j + 1]);
        if (!at(m, i, j + 1)) push([i + 1, j + 1], [i, j + 1]);
        if (!at(m, i - 1, j)) push([i, j + 1], [i, j]);
      }
    }
    const loops = [];
    while (edges.size) {
      const startK = edges.keys().next().value;
      const start = startK.split(',').map(Number);
      const loop = [start];
      let cur = start;
      for (let guard = 0; guard < 10000; guard++) {
        const k = cur.join(',');
        const outs = edges.get(k);
        if (!outs || !outs.length) break;
        const nxt = outs.shift();
        if (!outs.length) edges.delete(k);
        if (nxt[0] === start[0] && nxt[1] === start[1]) break;
        loop.push(nxt);
        cur = nxt;
      }
      // drop collinear vertices
      const simp = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i + loop.length - 1) % loop.length], b = loop[i], c = loop[(i + 1) % loop.length];
        if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) simp.push(b);
      }
      if (simp.length >= 3) loops.push(simp);
    }
    return loops;
  }

  // Mirror the left half of a mask onto the right: a symmetric plan.
  function mirror(m) {
    const nx = m.length;
    for (let i = 0; i < Math.floor(nx / 2); i++) for (let j = 0; j < m[i].length; j++) m[nx - 1 - i][j] = m[i][j];
    return m;
  }

  // grid loop → world polygon at height z
  function toWorld(loop, x0, y0, cell, z) {
    return loop.map((p) => [x0 + p[0] * cell, y0 + p[1] * cell, z || 0]);
  }

  global.ISO.plan = { SHAPES: SHAPES, mask: mask, mirror: mirror, cells: cells, at: at, outline: outline, toWorld: toWorld };
})(window);
