/*
 * riso.js — the architectural risograph: the stock, the inks, the print.
 *
 * A riso prints one spot ink per drum, each through its own screen, onto
 * uncoated stock; the inks overprint by multiplication and the drums never
 * register perfectly. This module does that to a finished drawing:
 *
 *   Riso.PAIRS                         the key ink + accent ink pairs
 *   Riso.pair(seed, name)              → { name, a: {name, rgb}, b: {name, rgb} }
 *   Riso.stock(Wpx, Hpx, seed)         the paper: grey stock, 1:5 ruling, registration crosses
 *   Riso.print(g, ink, spec)           separate `ink` (a white-ground p5 buffer) into
 *                                      two plates, screen, misregister, overprint on
 *                                      the stock, and draw the result onto g
 *   Riso.bar(spec)                     the colour bar's layout in sheet units
 *
 * The drawing is made as usual in dark/warm colours on white; the separation
 * sends cool and dark tones to the key ink and warm tones to the accent.
 */
(function (global) {
  'use strict';

  const INKS = {
    'BLUE': [0, 120, 191], 'FEDERAL BLUE': [61, 85, 136], 'TEAL': [0, 131, 138], 'INDIGO': [72, 77, 122],
    'BLACK': [38, 34, 36], 'STEEL': [55, 94, 119],
    'FLUORESCENT ORANGE': [255, 116, 119], 'FLUORESCENT PINK': [255, 72, 176], 'SUNFLOWER': [255, 181, 17],
    'BRIGHT RED': [241, 80, 96], 'ORANGE': [255, 108, 47], 'YELLOW': [255, 232, 0],
  };
  const PAIRS = [
    ['BLUE', 'FLUORESCENT ORANGE', 4],
    ['FEDERAL BLUE', 'FLUORESCENT PINK', 3],
    ['TEAL', 'SUNFLOWER', 2],
    ['BLACK', 'BRIGHT RED', 2],
    ['INDIGO', 'ORANGE', 2],
    ['STEEL', 'YELLOW', 1],
  ];
  const pairName = (p) => p[0] + ' + ' + p[1];

  function pair(seed, which) {
    let p = null;
    if (typeof which === 'number' && which >= 1 && which <= PAIRS.length) p = PAIRS[which - 1];
    else if (typeof which === 'string') p = PAIRS.find((q) => pairName(q) === which) || null;
    if (!p) {
      const R = global.ISO.rng((seed >>> 0) ^ 0x7150);
      p = R.weighted(PAIRS.map((q) => [q, q[2]]));
    }
    return { name: pairName(p), a: { name: p[0], rgb: INKS[p[0]] }, b: { name: p[1], rgb: INKS[p[1]] } };
  }

  // integer hash → [0,1)
  function hash(x, y, s) {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  // smooth low-frequency field on a coarse lattice, sampled bilinearly
  function lattice(Wp, Hp, cell, seed) {
    const gw = Math.ceil(Wp / cell) + 2, gh = Math.ceil(Hp / cell) + 2;
    const v = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) v[j * gw + i] = hash(i, j, seed);
    return function (x, y) {
      const fx = x / cell, fy = y / cell, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = v[j * gw + i], b = v[j * gw + i + 1], c = v[(j + 1) * gw + i], d = v[(j + 1) * gw + i + 1];
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
  }

  // ---- the stock ----
  // Sheet units: 1500 × 2000. Ruling every 10 units, a heavier line every 50,
  // a registration cross every 150 across (from 150) and every 150 down (from 100),
  // so each cross sits on a heavy line.
  const SW = 1500, SH = 2000;
  const stockCache = {};

  function stock(Wp, Hp, seed) {
    const key = Wp + 'x' + Hp + '#' + seed;
    if (stockCache[key]) return stockCache[key];
    const out = new Uint8ClampedArray(Wp * Hp * 4);
    const k = Wp / SW; // px per sheet unit
    const lf = lattice(Wp, Hp, 90, seed ^ 0x51), lf2 = lattice(Wp, Hp, 22, seed ^ 0x77);
    const colF = new Float32Array(Wp), rowF = new Float32Array(Hp);
    const lineW = Math.max(0.9, k * 0.9);
    const lineF = (u, step, major) => {
      const d = Math.abs(((u % step) + step) % step); const dd = Math.min(d, step - d) * k;
      return Math.max(0, Math.min(1, 0.5 + 0.5 * lineW - dd));
    };
    for (let x = 0; x < Wp; x++) {
      const u = (x + 0.5) / k;
      colF[x] = (1 - 0.055 * lineF(u, 10)) * (1 - 0.075 * lineF(u, 50));
    }
    for (let y = 0; y < Hp; y++) {
      const v = (y + 0.5) / k;
      rowF[y] = (1 - 0.055 * lineF(v, 10)) * (1 - 0.075 * lineF(v, 50));
    }
    const base = [238, 238, 236];
    for (let y = 0; y < Hp; y++) {
      for (let x = 0; x < Wp; x++) {
        const m = (lf(x, y) - 0.5) * 7 + (lf2(x, y) - 0.5) * 3 + (hash(x, y, seed) - 0.5) * 3.2;
        const f = colF[x] * rowF[y], i = (y * Wp + x) * 4;
        out[i] = (base[0] + m) * f; out[i + 1] = (base[1] + m) * f; out[i + 2] = (base[2] + m * 1.05) * f; out[i + 3] = 255;
      }
    }
    // registration crosses, with a clear halo
    const arm = 4.2 * k, th = Math.max(0.9, k * 1.1), halo = 7 * k;
    const cross = (cx, cy) => {
      const x0 = Math.max(0, Math.floor(cx - halo)), x1 = Math.min(Wp - 1, Math.ceil(cx + halo));
      const y0 = Math.max(0, Math.floor(cy - halo)), y1 = Math.min(Hp - 1, Math.ceil(cy + halo));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy), i = (y * Wp + x) * 4;
          const r = Math.hypot(dx, dy);
          if (r < halo) { const lift = (1 - r / halo) * 0.06; out[i] += (255 - out[i]) * lift; out[i + 1] += (255 - out[i + 1]) * lift; out[i + 2] += (255 - out[i + 2]) * lift; }
          const on = (dy < th / 2 + 0.5 && dx < arm) || (dx < th / 2 + 0.5 && dy < arm);
          if (on) { out[i] *= 0.6; out[i + 1] *= 0.6; out[i + 2] *= 0.62; }
        }
      }
    };
    for (let cx = 150; cx < SW; cx += 150) for (let cy = 100; cy < SH; cy += 150) cross(cx * k, cy * k);
    // a few fibres, some tinted by the stock's recycled content
    const R = global.ISO.rng((seed ^ 0xf1b3) >>> 0);
    const nF = Math.round((Wp * Hp) / 9000);
    for (let n = 0; n < nF; n++) {
      const x0 = R.range(0, Wp), y0 = R.range(0, Hp), a = R.range(0, Math.PI), L = R.range(2, 7) * Math.max(1, k);
      const tint = R.chance(0.25) ? [-10, -2, 8] : [-16, -16, -16];
      for (let t = 0; t < L; t++) {
        const x = Math.round(x0 + Math.cos(a) * t), y = Math.round(y0 + Math.sin(a) * t);
        if (x < 0 || y < 0 || x >= Wp || y >= Hp) continue;
        const i = (y * Wp + x) * 4;
        out[i] += tint[0]; out[i + 1] += tint[1]; out[i + 2] += tint[2];
      }
    }
    stockCache[key] = out;
    return out;
  }

  // ---- the colour bar: tint steps of each drum and the overprint, in sheet units ----
  function bar() {
    const y0 = 1962, y1 = 1986, w = 22, g = 4, x0 = 1425 - (11 * w + 10 * g);
    const cells = [];
    const steps = [0.2, 0.4, 0.6, 0.8, 1];
    steps.forEach((s, i) => cells.push({ x0: x0 + i * (w + g), x1: x0 + i * (w + g) + w, a: s, b: 0 }));
    steps.forEach((s, i) => cells.push({ x0: x0 + (5 + i) * (w + g), x1: x0 + (5 + i) * (w + g) + w, a: 0, b: s }));
    cells.push({ x0: x0 + 10 * (w + g), x1: x0 + 10 * (w + g) + w, a: 1, b: 1 });
    return { y0: y0, y1: y1, x0: x0, x1: 1425, cells: cells };
  }

  // ---- the print ----
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function print(g, ink, spec) {
    const pd = (ink.pixelDensity ? ink.pixelDensity() : 1) || 1;
    // the canvas's own pixel size: a fractional css size floors, so width * density is not its row stride
    const Wp = ink.canvas ? ink.canvas.width : Math.round(ink.width * pd), Hp = ink.canvas ? ink.canvas.height : Math.round(ink.height * pd);
    const k = Wp / SW;
    const seed = spec.seed >>> 0;
    const inks = spec.inks;
    const A = inks.a.rgb, B = inks.b.rgb;
    ink.loadPixels();
    const src = ink.pixels;
    const N = Wp * Hp;
    const cA = new Uint8Array(N), cB = new Uint8Array(N);
    // separation: linework and dark → key ink; warm hues → accent; mid-tone shading and
    // fills (away from linework, whose antialiased edges are mid-tone too) → accent as well
    // "wide" mid-tone = a morphological opening of the mid-tone mask: strokes, text and
    // hairlines (≤ ~4 px) vanish under the erosion, areas of tone survive
    const dk = new Uint8Array(N), mid = new Uint8Array(N);
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const d = 1 - (0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]) / 255;
      dk[p] = d * 255; mid[p] = d > 0.07 && d < 0.6 ? 1 : 0;
    }
    const RAD = Math.max(2, Math.round(1.1 * (Wp / (spec.outW || Wp))) + 1);
    function morph(m, wantMax) {
      const t = new Uint8Array(N), o = new Uint8Array(N);
      for (let y = 0; y < Hp; y++) {
        const row = y * Wp;
        for (let x = 0; x < Wp; x++) {
          const x0 = Math.max(0, x - RAD), x1 = Math.min(Wp - 1, x + RAD);
          let v = wantMax ? 0 : 1;
          for (let xx = x0; xx <= x1; xx++) { const q = m[row + xx]; if (wantMax ? q : !q) { v = wantMax ? 1 : 0; break; } }
          t[row + x] = v;
        }
      }
      for (let y = 0; y < Hp; y++) {
        const y0 = Math.max(0, y - RAD), y1 = Math.min(Hp - 1, y + RAD);
        for (let x = 0; x < Wp; x++) {
          let v = wantMax ? 0 : 1;
          for (let yy = y0; yy <= y1; yy++) { const q = t[yy * Wp + x]; if (wantMax ? q : !q) { v = wantMax ? 1 : 0; break; } }
          o[y * Wp + x] = v;
        }
      }
      return o;
    }
    const wide = morph(morph(mid, false), true);
    const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const r = src[i], b = src[i + 2], dark = dk[p] / 255;
      const warm = clamp01((r - b) / 100) * clamp01((255 - b) / 150);
      let wb = warm * clamp01(0.25 + dark * 1.4);
      if (wide[p]) {
        const tone = sstep(0.07, 0.2, dark) * (1 - sstep(0.45, 0.6, dark));
        wb = Math.max(wb, 0.85 * tone * clamp01(0.4 + dark * 1.2));
      }
      const wa = clamp01(dark * 1.3 - wb * 0.7);
      cA[p] = wa * 255; cB[p] = wb * 255;
    }
    // misregistration of the accent drum, in px
    const R = global.ISO.rng(seed ^ 0x3e91);
    const ang = R.range(0, Math.PI * 2), mag = R.range(1.1, 2.6) * k;
    const mx = Math.round(Math.cos(ang) * mag), my = Math.round(Math.sin(ang) * mag);
    const paper = stock(Wp, Hp, seed);
    const out = global.createImage(Wp, Hp);
    out.loadPixels();
    const px = out.pixels;
    const lf = lattice(Wp, Hp, 38, seed ^ 0x9a), lf2 = lattice(Wp, Hp, 7, seed ^ 0x4c);
    const SS = Wp / (spec.outW || Wp); // supersampling of the plates over the output
    const pitch = Math.max(2.1, (spec.outW || Wp) / 470) * SS;
    const TA = (15 * Math.PI) / 180, TB = (75 * Math.PI) / 180;
    const caA = Math.cos(TA), saA = Math.sin(TA), caB = Math.cos(TB), saB = Math.sin(TB);
    const TAU = Math.PI * 2, alpha = 0.93;
    const bz = bar();
    const by0 = bz.y0 * k, by1 = bz.y1 * k;
    const gain = 6;
    for (let y = 0; y < Hp; y++) {
      const inBar = y >= by0 && y < by1;
      for (let x = 0; x < Wp; x++) {
        const p = y * Wp + x, i = p * 4;
        let a = cA[p] / 255, bb;
        const xs = Math.min(Wp - 1, Math.max(0, x - mx)), ys = Math.min(Hp - 1, Math.max(0, y - my));
        bb = cB[ys * Wp + xs] / 255;
        if (inBar) {
          for (const c of bz.cells) if (x >= c.x0 * k && x < c.x1 * k) { a = c.a; bb = c.b; break; }
        }
        let covA = 0, covB = 0;
        if (a > 0.01 || bb > 0.01) {
          // the plates' own grain: density wanders, edges roughen, specks drop out
          const dens = 0.9 + 0.12 * lf(x, y) - 0.05 + (lf2(x, y) - 0.5) * 0.06;
          const h1 = hash(x, y, seed ^ 0x11), h2 = hash(x, y, seed ^ 0x22);
          if (a > 0.01) {
            const u = (x * caA + y * saA) / pitch, v = (-x * saA + y * caA) / pitch;
            const s = (0.5 - 0.25 * (Math.cos(u * TAU) + Math.cos(v * TAU))) * 0.82;
            const c = (1 - Math.pow(1 - Math.min(1, a), 1.9)) + (h1 - 0.5) * 0.1;
            covA = clamp01((c - s) * gain + 0.5) * dens;
            if (h1 > 0.985 && covA > 0.5) covA *= 0.3;
          }
          if (bb > 0.01) {
            const u = (x * caB + y * saB) / pitch, v = (-x * saB + y * caB) / pitch;
            const s = (0.5 - 0.25 * (Math.cos(u * TAU) + Math.cos(v * TAU))) * 0.82;
            const c = (1 - Math.pow(1 - Math.min(1, bb), 1.5)) + (h2 - 0.5) * 0.1;
            covB = clamp01((c - s) * gain + 0.5) * dens;
            if (h2 > 0.982 && covB > 0.5) covB *= 0.3;
          }
        }
        let r = paper[i], gg = paper[i + 1], b = paper[i + 2];
        if (covA > 0) { const t = covA * alpha; r *= 1 - t + t * A[0] / 255; gg *= 1 - t + t * A[1] / 255; b *= 1 - t + t * A[2] / 255; }
        if (covB > 0) { const t = covB * alpha; r *= 1 - t + t * B[0] / 255; gg *= 1 - t + t * B[1] / 255; b *= 1 - t + t * B[2] / 255; }
        px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = 255;
      }
    }
    out.updatePixels();
    g.blendMode(g.BLEND);
    g.noTint();
    g.image(out, 0, 0, g.width, g.height);
  }

  global.Riso = { INKS: INKS, PAIRS: PAIRS, pair: pair, stock: stock, bar: bar, print: print };
})(window);
