// Ruled Light — engine.
//
// Pure geometry: no DOM, no WebGL. The same file runs in the browser (window.RuledLight)
// and in Node (require), so the loop and determinism checks in tools/ruled-light-check.mjs
// test exactly the code the wall plays.
//
// The rule (inherited from 031 Ruled Continuum): only straight segments are emitted. Each
// bundle is a pair of rails A0→A1 and B0→B1; filament k joins A(t_k) to B(t_b), where
//   t_b = t_k·(1 − c) + (1 − t_k)·c
// The crossing c is what animates:
//   c = 0   → parallel ruling (a band, no caustic)
//   c = 0.5 → every filament passes through B's midpoint (a fan, a focus)
//   c = 1   → full opposite phase: classic curve stitching, a parabolic envelope
// Sweeping c makes curves form and dissolve, though no curve is ever drawn.
//
// Exact loop: every time-dependent quantity is sin/cos of 2π·frac(frac(k·t) + φ) with integer
// k. At t = 1, frac(k·1) is exactly 0, so frame N reproduces frame 0 bit for bit (not just
// within floating tolerance).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RuledLight = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const STRIDE = 8; // x0 y0 x1 y1 r g b (pad)

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const frac = (x) => x - Math.floor(x);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, u) => a + (b - a) * u;
  // A loop-exact oscillator: integer frequency k, phase φ ∈ [0,1).
  const osc = (k, t, phi) => Math.sin(TAU * frac(frac(k * t) + phi));
  const oscC = (k, t, phi) => Math.cos(TAU * frac(frac(k * t) + phi));

  // Colours are linear-light emitter values (what the LED adds), not paint.
  const PALETTES = [
    { name: 'Tungsten', ink: [1.0, 0.84, 0.64], accent: null },
    { name: 'Tungsten + vermilion', ink: [1.0, 0.84, 0.64], accent: [1.0, 0.22, 0.08] },
    { name: 'Phosphor', ink: [0.5, 1.0, 0.72], accent: [0.3, 0.62, 1.0] },
    { name: 'Sodium + cobalt', ink: [1.0, 0.58, 0.2], accent: [0.22, 0.4, 1.0] },
    { name: 'White', ink: [1.0, 1.0, 1.0], accent: null },
  ];

  const DEFAULTS = {
    aspect: 64 / 9, // wall width / height
    bundles: 8, // per square of wall (height × height), so long ribbons get proportionally more
    filaments: 120,
    spread: 0.55, // bundle length in wall heights
    crossing: 0.72, // mean opposite-phase amount
    warp: 0.4, // twist + endpoint jitter
    ascent: 0.3, // 0 = an undulating register along the wall, 1 = one diagonal ascent
    accent: 0.15, // share of bundles in the second ink (if the palette has one)
    motion: 1.0, // 0 = frozen; 1 = designed; >1 = agitated
    ground: 0.0, // faint metric grid (straight lines too); 0 keeps LED black truly black
  };

  // Build the seeded architecture. The number of random draws per bundle is fixed and does not
  // depend on options, so a seed keeps its identity while sliders move.
  function makeScene(seed, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const r = mulberry32(seed >>> 0);
    const rr = (a, b) => a + (b - a) * r();
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1)); // integer in [a, b]

    const A = o.aspect;
    const m = 0.1; // margin, in wall heights
    const n = Math.max(1, Math.round(o.bundles * A));
    const mel = [
      { k: rr(0.6, 1.4), p: r() },
      { k: rr(1.6, 3.2), p: r() },
    ];

    const bundles = [];
    for (let b = 0; b < n; b++) {
      const u = clamp01((b + 0.5 + rr(-0.4, 0.4)) / n);
      const x = m + u * (A - 2 * m) + rr(-0.05, 0.05);
      const melody =
        0.5 + 0.26 * (0.65 * Math.sin(TAU * (mel[0].k * u + mel[0].p)) + 0.35 * Math.sin(TAU * (mel[1].k * u + mel[1].p)));
      const diag = 1 - m - u * (1 - 2 * m);
      const y = lerp(melody, diag, o.ascent) + rr(-0.12, 0.12);

      const len = o.spread * rr(0.55, 1.35);
      const wid = len * rr(0.1, 0.42);
      const jit = [];
      for (let j = 0; j < 8; j++) jit.push(rr(-1, 1));

      bundles.push({
        x, y, len, wid,
        ang0: -Math.PI / 4 + rr(-1, 1) * Math.PI * 0.28,
        twist0: rr(-1, 1) * 0.7,
        c0: rr(-0.22, 0.22), // offset from the global crossing
        jit,
        // loop-exact motion: integer frequencies, seeded phases
        kc: ri(1, 2), pc: r(),
        kt: ri(1, 2), pt: r(),
        ka: ri(1, 3), pa: r(),
        kx: ri(1, 3), px: r(),
        ky: ri(1, 3), py: r(),
        kp: ri(1, 2), pp: r(),
        // some bundles are always present; the rest breathe in and out over the loop
        presFloor: r() < 0.35 ? 1 : rr(0, 0.3),
        accent: r(),
        gain: rr(0.7, 1.15),
      });
    }

    // Ground: the ruled sheet, drawn with the same primitive (straight lines).
    const ground = [];
    if (o.ground > 0) {
      const fine = 1 / 30, coarse = 1 / 6;
      for (let gx = 0; gx <= A + 1e-9; gx += fine) {
        const major = Math.abs(gx / coarse - Math.round(gx / coarse)) < 1e-6;
        ground.push([gx, 0, gx, 1, major ? 1 : 0.35]);
      }
      for (let gy = 0; gy <= 1 + 1e-9; gy += fine) {
        const major = Math.abs(gy / coarse - Math.round(gy / coarse)) < 1e-6;
        ground.push([0, gy, A, gy, major ? 1 : 0.35]);
      }
    }

    return { seed: seed >>> 0, o, bundles, ground, capacity: n * o.filaments + ground.length };
  }

  // Emit every segment of the scene at loop phase t ∈ [0, 1] into `out` (Float32Array, STRIDE
  // floats per segment), in wall pixels with y pointing down. Returns the segment count.
  //   W, H       wall size in pixels
  //   look       { palette, intensity }
  function segments(scene, t, W, H, look, out) {
    const o = scene.o;
    const pal = PALETTES[look.palette | 0] || PALETTES[0];
    const ink = pal.ink;
    const acc = pal.accent;
    const I = look.intensity;
    const mo = o.motion;
    const depth = Math.min(1, mo);
    const S = H; // one wall height in pixels
    const F = o.filaments;
    let w = 0;

    for (let i = 0; i < scene.ground.length; i++) {
      const g = scene.ground[i];
      const e = 0.05 * o.ground * g[4];
      out[w++] = g[0] * S; out[w++] = g[1] * S; out[w++] = g[2] * S; out[w++] = g[3] * S;
      out[w++] = ink[0] * e; out[w++] = ink[1] * e; out[w++] = ink[2] * e; out[w++] = 0;
    }

    for (let i = 0; i < scene.bundles.length; i++) {
      const b = scene.bundles[i];
      const breathe = 0.5 + 0.5 * oscC(b.kp, t, b.pp);
      const presDyn = b.presFloor + (1 - b.presFloor) * breathe * breathe;
      const pres = 1 - depth * (1 - presDyn);
      const energy = I * b.gain * pres;
      if (energy <= 1e-5) continue;

      const c = clamp01(o.crossing + b.c0 + mo * 0.5 * osc(b.kc, t, b.pc));
      const twist = (b.twist0 + mo * 0.4 * osc(b.kt, t, b.pt)) * o.warp;
      const ang = b.ang0 + mo * 0.1 * osc(b.ka, t, b.pa);
      const cx = (b.x + mo * 0.05 * osc(b.kx, t, b.px)) * S;
      const cy = (b.y + mo * 0.04 * osc(b.ky, t, b.py)) * S;

      const hl = (b.len * S) / 2, hw = (b.wid * S) / 2;
      const dx = Math.cos(ang) * hl, dy = Math.sin(ang) * hl;
      const tx = Math.cos(ang + twist) * hl, ty = Math.sin(ang + twist) * hl;
      const px = Math.cos(ang + Math.PI / 2) * hw, py = Math.sin(ang + Math.PI / 2) * hw;
      const js = o.warp * b.wid * S * 0.16;
      const J = b.jit;
      const a0x = cx - dx + px + J[0] * js, a0y = cy - dy + py + J[1] * js;
      const a1x = cx + dx + px + J[2] * js, a1y = cy + dy + py + J[3] * js;
      const b0x = cx - tx - px + J[4] * js, b0y = cy - ty - py + J[5] * js;
      const b1x = cx + tx - px + J[6] * js, b1y = cy + ty - py + J[7] * js;

      const col = acc && b.accent < o.accent ? acc : ink;
      const er = col[0] * energy, eg = col[1] * energy, eb = col[2] * energy;

      for (let k = 0; k < F; k++) {
        const tk = F > 1 ? k / (F - 1) : 0.5;
        const tb = tk * (1 - c) + (1 - tk) * c;
        out[w++] = a0x + (a1x - a0x) * tk;
        out[w++] = a0y + (a1y - a0y) * tk;
        out[w++] = b0x + (b1x - b0x) * tb;
        out[w++] = b0y + (b1y - b0y) * tb;
        out[w++] = er; out[w++] = eg; out[w++] = eb; out[w++] = 0;
      }
    }
    return w / STRIDE;
  }

  return { makeScene, segments, PALETTES, DEFAULTS, STRIDE, mulberry32 };
});
