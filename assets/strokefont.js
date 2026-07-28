/*
 * strokefont.js — a single-stroke (engraving) font for plotter work.
 *
 * Every glyph is a set of polylines on a 4×6 grid (x right, y down, baseline at
 * y=6), so text comes out as centreline paths a pen can actually draw — unlike
 * an outline font, which a plotter would have to trace twice and then fill.
 * The shapes are drawn from scratch in the spirit of the classic Hershey /
 * plotter character sets; no glyph data is copied from any existing font.
 *
 * Covers A–Z, 0–9 and a few symbols. Lowercase is folded to uppercase.
 *
 *   const lines = StrokeFont.text('LT1 PN1', x, y, 14);  // → [[{x,y},…], …]
 *   const w     = StrokeFont.width('LT1 PN1', 14);
 *
 * The y passed in is the TOP of the cap height; size is the cap height in px.
 */
(function (global) {
  'use strict';

  const G = 6; // glyph grid height — the unit everything scales from

  // Each entry: array of polylines, each a flat [x0,y0, x1,y1, …] on the 4×6 grid.
  const GLYPHS = {
    ' ': [],
    A: [[0, 6, 2, 0, 4, 6], [0.7, 4, 3.3, 4]],
    B: [[0, 0, 0, 6], [0, 0, 3, 0, 4, 0.9, 4, 2.1, 3, 3, 0, 3], [3, 3, 4, 3.9, 4, 5.1, 3, 6, 0, 6]],
    C: [[4, 1.2, 3, 0, 1, 0, 0, 1.2, 0, 4.8, 1, 6, 3, 6, 4, 4.8]],
    D: [[0, 0, 0, 6], [0, 0, 3, 0, 4, 1.2, 4, 4.8, 3, 6, 0, 6]],
    E: [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
    F: [[4, 0, 0, 0, 0, 6], [0, 3, 3, 3]],
    G: [[4, 1.2, 3, 0, 1, 0, 0, 1.2, 0, 4.8, 1, 6, 3, 6, 4, 4.8, 4, 3.2, 2.2, 3.2]],
    H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
    I: [[1, 0, 3, 0], [2, 0, 2, 6], [1, 6, 3, 6]],
    J: [[3, 0, 3, 4.8, 2, 6, 1, 6, 0, 4.8]],
    K: [[0, 0, 0, 6], [4, 0, 0, 3.6], [1.5, 2.5, 4, 6]],
    L: [[0, 0, 0, 6, 4, 6]],
    M: [[0, 6, 0, 0, 2, 2.6, 4, 0, 4, 6]],
    N: [[0, 6, 0, 0, 4, 6, 4, 0]],
    O: [[1, 0, 3, 0, 4, 1.2, 4, 4.8, 3, 6, 1, 6, 0, 4.8, 0, 1.2, 1, 0]],
    P: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2.2, 3, 3.2, 0, 3.2]],
    Q: [[1, 0, 3, 0, 4, 1.2, 4, 4.8, 3, 6, 1, 6, 0, 4.8, 0, 1.2, 1, 0], [2.4, 4.4, 4.2, 6.4]],
    R: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2.2, 3, 3.2, 0, 3.2], [2.2, 3.2, 4, 6]],
    S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2.1, 1, 3, 3, 3, 4, 3.9, 4, 5, 3, 6, 1, 6, 0, 5]],
    T: [[0, 0, 4, 0], [2, 0, 2, 6]],
    U: [[0, 0, 0, 4.8, 1, 6, 3, 6, 4, 4.8, 4, 0]],
    V: [[0, 0, 2, 6, 4, 0]],
    W: [[0, 0, 1, 6, 2, 2.6, 3, 6, 4, 0]],
    X: [[0, 0, 4, 6], [4, 0, 0, 6]],
    Y: [[0, 0, 2, 3.2, 4, 0], [2, 3.2, 2, 6]],
    Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
    0: [[1, 0, 3, 0, 4, 1.2, 4, 4.8, 3, 6, 1, 6, 0, 4.8, 0, 1.2, 1, 0], [0.4, 4.9, 3.6, 1.1]],
    1: [[0.5, 1.3, 2, 0, 2, 6], [0.7, 6, 3.3, 6]],
    2: [[0, 1.1, 1, 0, 3, 0, 4, 1.1, 4, 2.2, 0, 6, 4, 6]],
    3: [[0, 0, 4, 0, 2.1, 2.6], [2.1, 2.6, 3, 2.6, 4, 3.6, 4, 5, 3, 6, 1, 6, 0, 5]],
    4: [[3, 6, 3, 0, 0, 4.2, 4.2, 4.2]],
    5: [[4, 0, 0, 0, 0, 2.6, 3, 2.6, 4, 3.6, 4, 5, 3, 6, 1, 6, 0, 5]],
    6: [[4, 1, 3, 0, 1, 0, 0, 1.2, 0, 4.8, 1, 6, 3, 6, 4, 4.9, 4, 3.9, 3, 3, 1, 3, 0, 3.9]],
    7: [[0, 0, 4, 0, 1.6, 6]],
    8: [[1, 3, 0, 2.1, 0, 1, 1, 0, 3, 0, 4, 1, 4, 2.1, 3, 3, 1, 3, 0, 3.9, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3.9, 3, 3]],
    9: [[0, 5, 1, 6, 3, 6, 4, 4.8, 4, 1.2, 3, 0, 1, 0, 0, 1.1, 0, 2.1, 1, 3, 3, 3, 4, 2.1]],
    '-': [[0.5, 3.2, 3.5, 3.2]],
    '.': [[1.8, 5.8, 2.2, 6]],
    ',': [[2.2, 5.7, 1.6, 6.8]],
    ':': [[2, 2, 2, 2.35], [2, 4.5, 2, 4.85]],
    ';': [[2, 2, 2, 2.35], [2.2, 4.5, 1.7, 5.5]],
    '/': [[0, 6, 4, 0]],
    '*': [[2, 1.4, 2, 4.6], [0.7, 2.1, 3.3, 3.9], [3.3, 2.1, 0.7, 3.9]],
    '=': [[0.4, 2.2, 3.6, 2.2], [0.4, 4, 3.6, 4]],
    '+': [[2, 1.4, 2, 4.6], [0.5, 3, 3.5, 3]],
    '(': [[3, 0, 1.6, 1.6, 1.6, 4.4, 3, 6]],
    ')': [[1, 0, 2.4, 1.6, 2.4, 4.4, 1, 6]],
    '<': [[3.4, 1, 0.8, 3, 3.4, 5]],
    '>': [[0.6, 1, 3.2, 3, 0.6, 5]],
    '#': [[1.3, 0.6, 0.7, 5.4], [3.1, 0.6, 2.5, 5.4], [0.2, 2.2, 3.5, 2.2], [0.1, 3.9, 3.4, 3.9]],
    '%': [[4, 0, 0, 6], [0.4, 0.3, 1.4, 0.3, 1.4, 1.7, 0.4, 1.7, 0.4, 0.3], [2.6, 4.3, 3.6, 4.3, 3.6, 5.7, 2.6, 5.7, 2.6, 4.3]],
  };

  const ADVANCE = 5.4; // glyph cell + tracking, in grid units

  function width(str, size) {
    return (String(str).length * ADVANCE - (ADVANCE - 4)) * (size / G);
  }

  // Returns an array of polylines; each polyline is an array of {x, y}.
  function text(str, x, y, size, opts) {
    opts = opts || {};
    const s = size / G;
    const adv = ADVANCE * s * (opts.tracking === undefined ? 1 : opts.tracking);
    const out = [];
    const chars = String(str).toUpperCase();
    for (let i = 0; i < chars.length; i++) {
      const glyph = GLYPHS[chars[i]];
      if (!glyph) continue; // silently skip anything the font doesn't carry
      const ox = x + i * adv;
      for (let j = 0; j < glyph.length; j++) {
        const flat = glyph[j];
        const pts = [];
        for (let k = 0; k < flat.length; k += 2) {
          pts.push({ x: ox + flat[k] * s, y: y + flat[k + 1] * s });
        }
        out.push(pts);
      }
    }
    return out;
  }

  global.StrokeFont = { text: text, width: width, glyphs: GLYPHS, ADVANCE: ADVANCE };
})(window);
