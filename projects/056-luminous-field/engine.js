// Luminous Field — engine.
//
// Pure scene logic: no DOM, no WebGL. The same file runs in the browser (window.LuminousField)
// and in Node (require), so tools/luminous-field-check.mjs tests exactly what the wall plays.
//
// The idiom (Rothko's classic format, 1949 onward, translated rather than copied): a canvas of
// ground colour carrying one to three soft-edged rectangles stacked on the vertical axis, close
// to the canvas edge, their borders feathered and uneven, their interiors built of thin
// scumbled layers so that one colour is seen through another. On paper the edge is where two
// thin paints overlap; on an LED wall it becomes a seam of light. Nothing is copied from any
// particular painting: the seed chooses the proportions, the register chooses the colours.
//
// What moves is what the paintings are said to do in front of a viewer: they breathe. Field
// edges swell and contract by a few percent, the feather opens and closes, a core of light
// wanders inside each field, the luminance of each canvas rises and falls, and the brushed edge
// slowly re-forms as the noise domain travels a closed circle.
//
// Exact loop: every time-dependent value is sin/cos of 2π·frac(frac(k·t) + φ) with integer k,
// so at t = 1 every uniform the shader receives equals its value at t = 0 bit for bit.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LuminousField = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const MAX_PANELS = 16;
  const MAX_FIELDS = 3;
  // Uniform block per panel, in vec4s: 4 panel vec4s + 6 per field.
  const PANEL_VEC4 = 4 + 6 * MAX_FIELDS;
  const STRIDE = PANEL_VEC4 * 4;

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
  const lerp = (a, b, u) => a + (b - a) * u;
  const osc = (k, t, phi) => Math.sin(TAU * frac(frac(k * t) + phi));
  const oscC = (k, t, phi) => Math.cos(TAU * frac(frac(k * t) + phi));

  // sRGB hex → linear light. Registers are authored as a painter would see them; the wall adds
  // light, so everything is converted to linear before it reaches the accumulator.
  function lin(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
  }

  // Registers: colour families, not paintings. Each gives a ground (top → bottom), the inks a
  // field may take, the colour of the luminous seam at a field's edge, and the colour of the
  // core of light inside a field. `feather` and `halo` scale the edge: the late dark registers
  // are tighter and quieter, the 1950s registers open and radiant.
  const REGISTERS = [
    {
      name: 'Nocturne — indigo, teal, violet',
      ground: ['#0c1a5c', '#0e7d8c'], fields: ['#4f86e8', '#6d7cff', '#3e9be6', '#8a86ff'],
      seam: '#bfeeff', core: '#a98cff', feather: 1.0, halo: 1.0,
    },
    {
      name: 'Ember — vermilion, cadmium, oxblood',
      ground: ['#b8361a', '#c9471c'], fields: ['#f2a516', '#e8661a', '#8c1a10', '#f4c430'],
      seam: '#ffd88a', core: '#ffe08a', feather: 1.0, halo: 0.8,
    },
    {
      name: 'Saffron — yellow, rose, cream',
      ground: ['#e39a35', '#e8a63a'], fields: ['#f7d34a', '#e57b7b', '#f4efe0', '#f0b84a'],
      seam: '#fff2c4', core: '#fff6d8', feather: 1.1, halo: 0.7,
    },
    {
      name: 'Sea — viridian, ultramarine, mist',
      ground: ['#0f3b3a', '#0d2f3c'], fields: ['#2f8f6a', '#1b4f8a', '#8fc2aa', '#2a6f86'],
      seam: '#c8f0e0', core: '#bfe6d6', feather: 1.0, halo: 0.9,
    },
    {
      name: 'Maroon — murals, oxblood on black',
      ground: ['#3d0c12', '#330a10'], fields: ['#0f0406', '#5a1418', '#1a0508', '#6b1d16'],
      seam: '#8a2a1c', core: '#5a1a14', feather: 0.7, halo: 0.6,
    },
    {
      name: 'Chapel — plum and black',
      ground: ['#1c1022', '#170c1c'], fields: ['#0a060d', '#251530', '#120a16', '#2c1a33'],
      seam: '#3e2648', core: '#24162a', feather: 0.55, halo: 0.45,
    },
    {
      name: 'Black on grey',
      ground: ['#e6e2da', '#e6e2da'], fields: ['#0c0b0c', '#6e6c6a', '#141314', '#7e7b78'],
      seam: '#a29e98', core: '#8a8784', feather: 0.25, halo: 0.25, stack: [0, 1],
    },
  ];

  const DEFAULTS = {
    aspect: 16 / 9, // wall width / height
    panels: 0, // canvases across the wall; 0 = from the wall's shape and the seed
    fields: 0, // fields per canvas; 0 = the seed decides, 1–3 forces
    hang: 0.06, // black wall around and between canvases, in wall heights (0 = edge to edge)
    register: 0,
    series: 0.35, // how far canvases in a row depart from one another in colour
    feather: 1.0, // softness of every field edge
    halo: 1.0, // the luminous seam at the edge
    scumble: 1.0, // brushed, layered texture inside fields and ground
    core: 1.0, // the wandering core of light
    motion: 1.0, // 0 = still; 1 = designed; > 1 = agitated
  };

  // Build the seeded architecture. Every canvas and every field takes a fixed number of random
  // draws whatever the options are, and MAX_PANELS canvases are always drawn, so a seed keeps
  // its identity while sliders move.
  function makeScene(seed, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const r = mulberry32(seed >>> 0);
    const rr = (a, b) => a + (b - a) * r();
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1));

    const prefAspect = rr(0.72, 1.15); // the series' preferred canvas shape (width / height)
    const prefFields = r();
    const drift = rr(0.4, 0.8); // radius of the noise circle the brushed edges travel

    const all = [];
    for (let p = 0; p < MAX_PANELS; p++) {
      const nRoll = r();
      const nSeed = nRoll < 0.22 ? 1 : nRoll < 0.68 ? 2 : 3;
      const panel = {
        nSeed,
        hueShift: rr(-1, 1), lumShift: rr(-1, 1), groundMix: r(),
        noise: [rr(-500, 500), rr(-500, 500)],
        // single-field margins (the reference format: a tall glowing block floating high)
        single: { mx: rr(0.15, 0.22), mt: rr(0.17, 0.24), mb: rr(0.14, 0.2) },
        // stacked margins
        mx: rr(0.05, 0.1), mt: rr(0.04, 0.09), mb: rr(0.05, 0.12),
        gaps: [rr(0.025, 0.07), rr(0.025, 0.07)],
        weights: [rr(0.55, 1.7), rr(0.55, 1.7), rr(0.35, 1.2)],
        kL: ri(1, 2), pL: r(),
        kG: ri(1, 2), pG: r(),
        fields: [],
      };
      for (let f = 0; f < MAX_FIELDS; f++) {
        panel.fields.push({
          ink: r(), inkB: r(),
          round: rr(0.015, 0.06), rough: rr(0.5, 1.2), feather: rr(0.7, 1.4), halo: rr(0.6, 1.3),
          opacity: rr(0.82, 0.97), bleed: rr(0.6, 1.4),
          coreX: rr(0.3, 0.7), coreY: rr(0.55, 0.8), coreR: rr(0.8, 1.3),
          // loop-exact motion
          kH: ri(1, 3), pH: r(), // height breath
          kW: ri(1, 2), pW: r(), // width breath
          kF: ri(1, 3), pF: r(), // feather
          kL: ri(1, 3), pL: r(), // luminance
          kC: 1, pC: r(), // core wander (one slow circle)
          kD: ri(1, 2), pD: r(), // brushed edge drift
          kI: ri(1, 2), pI: r(), // ink turn
        });
      }
      all.push(panel);
    }

    // Lay the canvases on the wall, in wall heights (x right, y down).
    const A = o.aspect;
    const hang = Math.max(0, o.hang);
    const ph = Math.max(0.2, 1 - 2 * hang);
    const gap = Math.max(hang * 0.8, 0.03);
    let n = o.panels | 0;
    if (n <= 0) {
      n = A < 2.2 ? 1 : Math.max(1, Math.round((A - 2 * hang + gap) / (ph * prefAspect + gap)));
    }
    const side = n === 1 && hang === 0 ? 0 : hang;
    // never narrower than a quarter of the canvas height, whatever is asked
    const fit = Math.max(1, Math.floor((A - 2 * side + gap) / (0.25 * ph + gap)));
    n = Math.min(MAX_PANELS, fit, Math.max(1, n));
    const pw = (A - 2 * side - (n - 1) * gap) / n;
    const panels = [];
    for (let i = 0; i < n; i++) {
      const P = all[i];
      const pa = pw / ph; // canvas aspect
      const k = o.fields > 0 ? Math.min(MAX_FIELDS, o.fields | 0) : prefFields < 0.15 ? 1 : P.nSeed;
      panels.push(Object.assign({}, P, {
        x: side + i * (pw + gap), y: hang, w: pw, h: ph, aspect: pa, n: k, index: i, count: n,
        layout: layoutFields(P, k, pa),
      }));
    }

    return { seed: seed >>> 0, o, panels, drift };
  }

  // Field rectangles inside a canvas, in canvas units: x ∈ [0, aspect], y ∈ [0, 1] (y down).
  function layoutFields(P, k, pa) {
    if (k === 1) {
      const s = P.single;
      const mx = s.mx * Math.min(pa, 1.2);
      return [{ x0: mx, x1: pa - mx, y0: s.mt, y1: 1 - s.mb }];
    }
    const mx = P.mx * Math.min(pa, 1.2);
    const gaps = P.gaps.slice(0, k - 1);
    const usable = 1 - P.mt - P.mb - gaps.reduce((a, b) => a + b, 0);
    const w = P.weights.slice(0, k);
    const sum = w.reduce((a, b) => a + b, 0);
    const out = [];
    let y = P.mt;
    for (let i = 0; i < k; i++) {
      const h = (usable * w[i]) / sum;
      out.push({ x0: mx, x1: pa - mx, y0: y, y1: y + h });
      y += h + (gaps[i] || 0);
    }
    return out;
  }

  function pickInk(reg, u, avoid) {
    const L = reg.fields.length;
    let i = Math.floor(u * L) % L;
    if (i === avoid) i = (i + 1) % L;
    return i;
  }

  function shade(c, hue, lum) {
    // a small, register-preserving departure: tilt the channels and scale the light
    const g = Math.max(0, 1 + 0.35 * lum);
    return [c[0] * g * (1 + 0.18 * hue), c[1] * g, c[2] * g * (1 - 0.18 * hue)];
  }

  // Write every canvas's uniform block at loop phase t ∈ [0, 1] into `out` (Float32Array,
  // STRIDE floats per canvas). Rects are in wall pixels, y down. Returns the canvas count.
  //   look  { intensity }
  function frame(scene, t, W, H, look, out) {
    const o = scene.o;
    const reg = REGISTERS[o.register | 0] || REGISTERS[0];
    const mo = o.motion;
    const S = H;
    const I = look && look.intensity != null ? look.intensity : 1;
    const g0 = lin(reg.ground[0]), g1 = lin(reg.ground[1]);
    const inks = reg.fields.map(lin);
    const seam = lin(reg.seam), coreC = lin(reg.core);
    let w = 0;

    for (let p = 0; p < scene.panels.length; p++) {
      const P = scene.panels[p];
      const ser = o.series;
      const hue = P.hueShift * ser, lum = P.lumShift * ser * 0.5;
      const breath = 1 + mo * 0.06 * osc(P.kL, t, P.pL);
      const gTop = shade(g0, hue, lum), gBot = shade(g1, hue, lum);

      // vec4 0: canvas rect in wall px
      out[w++] = P.x * S; out[w++] = P.y * S; out[w++] = P.w * S; out[w++] = P.h * S;
      // vec4 1: ground top, canvas breath × intensity
      out[w++] = gTop[0]; out[w++] = gTop[1]; out[w++] = gTop[2]; out[w++] = breath * I;
      // vec4 2: ground bottom, scumble
      out[w++] = gBot[0]; out[w++] = gBot[1]; out[w++] = gBot[2]; out[w++] = o.scumble;
      // vec4 3: noise origin (seeded, + ground drift), aspect, field count
      const gd = scene.drift * mo * 0.5;
      out[w++] = P.noise[0] + gd * oscC(P.kG, t, P.pG);
      out[w++] = P.noise[1] + gd * osc(P.kG, t, P.pG);
      out[w++] = P.aspect; out[w++] = P.n;

      let prev = -1;
      for (let f = 0; f < MAX_FIELDS; f++) {
        const F = P.fields[f];
        if (f >= P.n) { for (let j = 0; j < 24; j++) out[w++] = 0; continue; }
        const R = P.layout[f];
        let ia = reg.stack ? reg.stack[f % reg.stack.length] : pickInk(reg, F.ink, prev);
        prev = ia;
        const ib = pickInk(reg, F.inkB, ia);
        const turn = 0.5 + 0.5 * osc(F.kI, t, F.pI);
        const colA = shade(inks[ia], hue, lum);
        const colB = shade(inks[ib], hue, lum);
        const mixB = 0.18 + 0.22 * turn * Math.min(1, mo);

        const hw = (R.x1 - R.x0) / 2, hh = (R.y1 - R.y0) / 2;
        const sH = 1 + mo * 0.022 * osc(F.kH, t, F.pH);
        const sW = 1 + mo * 0.012 * osc(F.kW, t, F.pW);
        const feather = 0.018 * F.feather * o.feather * reg.feather * (1 + mo * 0.3 * osc(F.kF, t, F.pF));
        const L = 1 + mo * 0.1 * osc(F.kL, t, F.pL);
        const cr = 0.06 * mo;

        // a: centre, half size (canvas units)
        out[w++] = (R.x0 + R.x1) / 2; out[w++] = (R.y0 + R.y1) / 2; out[w++] = hw * sW; out[w++] = hh * sH;
        // b: corner round, feather, edge roughness, seam
        out[w++] = Math.min(F.round, hw, hh); out[w++] = Math.max(0.0015, feather);
        out[w++] = F.rough; out[w++] = F.halo * o.halo * reg.halo;
        // c: ink A × luminance, opacity
        out[w++] = colA[0] * L; out[w++] = colA[1] * L; out[w++] = colA[2] * L; out[w++] = F.opacity;
        // d: ink B (the layer seen through), mix
        out[w++] = colB[0] * L; out[w++] = colB[1] * L; out[w++] = colB[2] * L; out[w++] = mixB;
        // e: seam colour, bleed into the ground
        out[w++] = seam[0]; out[w++] = seam[1]; out[w++] = seam[2]; out[w++] = F.bleed;
        // f: core position (field-relative 0..1) and strength; edge drift angle
        out[w++] = F.coreX + cr * oscC(F.kC, t, F.pC);
        out[w++] = F.coreY + cr * 0.6 * osc(F.kC, t, F.pC);
        out[w++] = o.core * F.coreR * (1 + 0.15 * Math.min(1, mo) * (turn - 0.5));
        out[w++] = mo > 0 ? TAU * frac(frac(F.kD * t) + F.pD) : TAU * F.pD;
      }
    }
    return scene.panels.length;
  }

  // The core colour is shared per register and passed once.
  function coreColour(scene) {
    const reg = REGISTERS[scene.o.register | 0] || REGISTERS[0];
    return lin(reg.core);
  }

  return {
    makeScene, frame, coreColour, REGISTERS, DEFAULTS, STRIDE, PANEL_VEC4, MAX_PANELS, MAX_FIELDS, mulberry32,
  };
});
