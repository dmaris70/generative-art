/*
 * paper.js — the sheet itself: mottled paper, the printed grid, and the
 * marginalia a working drawing accumulates (scribbles, dither patches,
 * construction lines, hatch tests).
 *
 *   Paper.KINDS                       VINTAGE | STANDARD | ROUGH
 *   Paper.texture(w, h, kind, seed)   p5.Image — cached per (w, h, kind, seed)
 *   Paper.grid(hand, W, H, step)      the fine blue-grey ruling
 *   Paper.marginalia(hand, rng, W, H, avoid)
 */
(function (global) {
  'use strict';

  const KINDS = {
    VINTAGE: { base: [231, 225, 209], mottle: 9, grain: 8, fibres: 30, tint: [1.0, 0.985, 0.95] },
    STANDARD: { base: [225, 225, 221], mottle: 7, grain: 7, fibres: 12, tint: [1, 1, 1] },
    ROUGH: { base: [221, 223, 223], mottle: 8, grain: 10, fibres: 48, tint: [0.99, 1, 1.01] },
  };

  // hash-based value noise, integer-safe, independent of p5's noise state
  function makeNoise(seed) {
    function h2(x, y) {
      let n = (Math.imul(x | 0, 1619) + Math.imul(y | 0, 31337) + Math.imul(seed | 0, 6971)) | 0;
      n = (n << 13) ^ n;
      const m = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) | 0;
      return 1 - (m & 0x7fffffff) / 1073741824;
    }
    const fade = (t) => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = fade(x - xi), yf = fade(y - yi);
      const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
      const top = a + (b - a) * xf, bot = c + (d - c) * xf;
      return (top + (bot - top) * yf) * 0.5 + 0.5;
    }
    return function (x, y, oct) {
      let amp = 1, f = 1, s = 0, norm = 0;
      for (let i = 0; i < (oct || 1); i++) {
        s += n2(x * f, y * f) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      return s / norm;
    };
  }

  const cache = {};

  function texture(w, h, kind, seed) {
    const K = KINDS[kind] || KINDS.STANDARD;
    const key = [w, h, kind, seed].join('|');
    if (cache[key]) return cache[key];
    const rw = Math.max(64, Math.round(w / 2)), rh = Math.max(64, Math.round(h / 2));
    const img = global.createImage(rw, rh);
    const noise = makeNoise(seed);
    const rnd = global.ISO.rng(seed ^ 0x5eed);
    img.loadPixels();
    const px = img.pixels;
    const sx = 1 / (rw * 0.9); // cloud scale
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const cloud = (noise(x * sx * 10, y * sx * 10, 4) - 0.5) * 2; // -1..1, soft
        const mid = (noise(x * 0.06 + 91, y * 0.06 + 17, 2) - 0.5) * 2;
        const grain = (rnd.r() - 0.5) * 2;
        const v = cloud * K.mottle + mid * K.mottle * 0.5 + grain * K.grain;
        const i = (y * rw + x) * 4;
        px[i] = Math.max(0, Math.min(255, K.base[0] * K.tint[0] + v));
        px[i + 1] = Math.max(0, Math.min(255, K.base[1] * K.tint[1] + v));
        px[i + 2] = Math.max(0, Math.min(255, K.base[2] * K.tint[2] + v));
        px[i + 3] = 255;
      }
    }
    // fibres: short dark flecks
    for (let k = 0; k < K.fibres * (rw * rh) / 40000; k++) {
      const x0 = rnd.int(0, rw - 1), y0 = rnd.int(0, rh - 1), l = rnd.int(1, 4);
      const a = rnd.range(0, Math.PI);
      for (let t = 0; t < l; t++) {
        const x = Math.round(x0 + Math.cos(a) * t), y = Math.round(y0 + Math.sin(a) * t);
        if (x < 0 || y < 0 || x >= rw || y >= rh) continue;
        const i = (y * rw + x) * 4;
        const dk = rnd.range(12, 40);
        px[i] -= dk; px[i + 1] -= dk; px[i + 2] -= dk;
      }
    }
    img.updatePixels();
    cache[key] = img;
    return img;
  }

  // Printed graph-paper ruling. Straight (a press printed it), very faint.
  function grid(hand, W, H, step, color) {
    const c = color || [130, 148, 172];
    const p = { color: c, alpha: 58, weight: 0.6, wob: 0 };
    for (let x = step; x < W; x += step) hand.line([[x, 0], [x, H]], p);
    for (let y = step; y < H; y += step) hand.line([[0, y], [W, y]], p);
  }

  // ---- marginalia ----

  function overlaps(r, avoid) {
    for (const a of avoid) {
      if (r.x < a.x + a.w && r.x + r.w > a.x && r.y < a.y + a.h && r.y + r.h > a.y) return true;
    }
    return false;
  }

  function place(rng, W, H, w, h, avoid, tries) {
    for (let t = 0; t < (tries || 30); t++) {
      const r = { x: rng.range(10, W - w - 10), y: rng.range(10, H - h - 10), w: w, h: h };
      if (!overlaps(r, avoid)) return r;
    }
    return null;
  }

  // a loose looping scribble — the pen tested, or a thought abandoned
  function scribble(hand, rng, cx, cy, size, pen) {
    const pts = [];
    let x = cx, y = cy, a = rng.range(0, Math.PI * 2);
    const n = rng.int(30, 90);
    let curl = rng.range(-0.5, 0.5);
    for (let i = 0; i < n; i++) {
      pts.push([x, y]);
      curl += rng.range(-0.25, 0.25);
      curl *= 0.92;
      a += curl;
      const step = size * rng.range(0.03, 0.08);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step * 0.6;
      // stay near home
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > size * size * 0.3) a += Math.atan2(-dy, -dx) - a > 0 ? 0.6 : -0.6;
    }
    hand.line(pts, pen);
  }

  function ditherSquare(hand, rng, x, y, n, cell, alpha) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (rng.chance(0.45)) {
          hand.rect(x + i * cell, y + j * cell, cell * 0.9, cell * 0.9, null, { color: [70, 76, 86], alpha: alpha, mode: 'flat' });
        }
      }
    }
  }

  function marginalia(hand, rng, W, H, avoid, level) {
    const lvl = level === undefined ? 1 : level;
    const pencil = { color: [84, 90, 102], alpha: 90, weight: 0.8, wob: 1.6 };
    const faint = { color: [90, 96, 108], alpha: 40, weight: 0.6, wob: 0.3 };

    // scribble loops
    const nS = Math.round(rng.int(1, 3) * lvl);
    for (let i = 0; i < nS; i++) {
      const s = rng.range(80, 260);
      const r = place(rng, W, H, s, s * 0.6, avoid);
      if (r) scribble(hand, rng, r.x + s / 2, r.y + s * 0.3, s, Object.assign({}, pencil, { alpha: rng.range(45, 100) }));
    }
    // dither / halftone test patches
    const nD = Math.round(rng.int(3, 7) * lvl);
    for (let i = 0; i < nD; i++) {
      const n = rng.int(6, 12), cell = rng.range(1.6, 3);
      const r = place(rng, W, H, n * cell, n * cell, avoid);
      if (r) ditherSquare(hand, rng, r.x, r.y, n, cell, rng.range(60, 150));
    }
    // hatch swatches: the pencil tried on a corner
    const nH = Math.round(rng.int(2, 5) * lvl);
    for (let i = 0; i < nH; i++) {
      const w = rng.range(18, 60), h = rng.range(14, 40);
      const r = place(rng, W, H, w, h, avoid);
      if (!r) continue;
      const sk = rng.range(-0.5, 0.5) * h;
      const pts = [[r.x, r.y], [r.x + w, r.y], [r.x + w + sk, r.y + h], [r.x + sk, r.y + h]];
      hand.poly(pts, { color: [80, 86, 98], alpha: rng.range(40, 90), mode: 'hatch', spacing: rng.range(1.6, 3), angle: rng.range(0.3, 1.3) }, null);
    }
    // construction lines: long, faint, straight — the drawing's setting-out
    const nL = rng.int(2, 6);
    for (let i = 0; i < nL; i++) {
      const edge = rng.int(0, 3);
      let a, b;
      const ang = rng.range(0.35, 1.2) * rng.sign();
      if (edge === 0) a = [rng.range(0, W), 0];
      else if (edge === 1) a = [W, rng.range(0, H)];
      else if (edge === 2) a = [rng.range(0, W), H];
      else a = [0, rng.range(0, H)];
      const L = rng.range(200, 900);
      b = [a[0] + Math.cos(ang) * L * (edge === 1 ? -1 : 1), a[1] + Math.sin(ang) * L * (edge === 2 ? -1 : 1)];
      hand.line([a, b], faint);
    }
    // small circles / arcs: compass marks
    const nC = rng.int(0, 3);
    for (let i = 0; i < nC; i++) {
      const r = rng.range(8, 40);
      const p = place(rng, W, H, r * 2, r * 2, avoid);
      if (p) hand.circle(p.x + r, p.y + r, r, faint);
    }
    // a strip of tiny ticks along one margin
    if (rng.chance(0.6)) {
      const y = rng.chance(0.5) ? rng.range(12, 30) : H - rng.range(12, 30);
      const x0 = rng.range(0.1, 0.5) * W, n = rng.int(8, 30), st = rng.range(4, 9);
      for (let i = 0; i < n; i++) hand.line([[x0 + i * st, y], [x0 + i * st, y + (i % 5 === 0 ? 7 : 4)]], faint);
    }
  }

  global.Paper = { KINDS: KINDS, texture: texture, grid: grid, marginalia: marginalia, scribble: scribble, makeNoise: makeNoise };
})(window);
