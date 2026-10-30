/*
 * marble.js — the bath, the score and the two observers, without a GPU.
 *
 * A session ("bath") is a score: a ground collage floated at t = 0, then a timed list of
 * marbling operations — ink drops, comb strokes, waves, swirls. Every operation is an exact,
 * invertible map of the plane (Lu, Jaffer et al., "Mathematical Marbling", IEEE CG&A 2012),
 * so the bath at any time t is found by pulling each pixel back through the operations that
 * have started, newest first, until it lands in a drop's ink or on the ground. Nothing is
 * integrated and nothing is stored between frames: time is an argument, not a history.
 *
 * Each material is seen by one of two observers. The Eulerian observer looks through a fixed
 * screen on the glass (Bayer or blue noise, per pixel). The Lagrangian observer's screen is
 * printed on the material itself (dots or lines in the ink's own frame), so it is combed and
 * stretched with the ink. Where the ink is squeezed finer than the eye can resolve, the fixed
 * observer takes over.
 *
 * sketch.js runs the same arithmetic in a fragment shader; this file generates the score,
 * the blue-noise screen and a CPU render used for previews and for checking the shader.
 */
(function (global) {
  'use strict';

  // --- constants shared with the shader (keep in step with sketch.js) ---
  const PLATE_W = 1.0, PLATE_H = 1.25;     // plate units, 4 : 5, origin at the centre
  const OP = { DROP: 1, COMB: 2, WAVE: 3, SWIRL: 4 };
  const PAT = { FLAT: 0, STRIPES: 1, BANDS: 2, LATTICE: 3, NOISE: 4, RINGS: 5 };
  const SCR = { BAYER: 0, BLUE: 1, DOTS: 2, LINES: 3 };
  const MAX_OPS = 160, MAX_MATS = 16, MAX_WINS = 6;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // lowbias32 — the same integer hash runs in the shader (uint arithmetic wraps alike)
  function hash32(x) {
    x >>>= 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }
  function sessionSeed(seed, bath) { return hash32((seed >>> 0) ^ Math.imul(bath + 1, 0x9e3779b9)); }

  // ------------------------------------------------------------------ the score
  function score(seed, bath, opts) {
    opts = opts || {};
    const lagrange = opts.lagrange == null ? 0.5 : opts.lagrange;
    const density = opts.density == null ? 1 : opts.density;
    const R = mulberry32(sessionSeed(seed, bath));
    const rnd = (a, b) => a + (b - a) * R();
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const chance = (p) => R() < p;

    // Materials: m0 = [pattern, tone, freq, angle], m1 = [screen, screenFreq, screenAngle, param]
    const mats = [];
    function screenFor(tone, hard) {
      if (hard) return [SCR.BAYER, 0, 0];
      if (chance(lagrange)) {
        return [chance(0.55) ? SCR.DOTS : SCR.LINES, rnd(55, 95), pick([0, Math.PI / 4, Math.PI / 6, rnd(0, Math.PI)])];
      }
      return [chance(0.6) ? SCR.BAYER : SCR.BLUE, 0, 0];
    }
    function mat(pattern, tone, freq, angle, param) {
      const hard = pattern === PAT.STRIPES;
      const s = screenFor(tone, hard);
      mats.push({ pattern, tone, freq, angle, screen: s[0], sfreq: s[1], sangle: s[2], param: param || 0 });
      return mats.length - 1;
    }

    // Ground: a collage floated before the first gesture — a field and a few rigid windows.
    const diag = pick([Math.PI / 4, -Math.PI / 4, Math.PI / 3, -Math.PI / 5]);
    const bg = chance(0.6)
      ? mat(PAT.BANDS, rnd(0.42, 0.6), rnd(4, 7), diag, rnd(0.2, 0.7))
      : mat(PAT.NOISE, 0.5, rnd(2.5, 4.5), 0, 0);
    const winMats = [
      mat(PAT.STRIPES, 1, rnd(7, 12), pick([0, Math.PI / 2, Math.PI / 4]), 0.5),
      mat(PAT.LATTICE, rnd(0.3, 0.45), rnd(5, 8), Math.PI / 4, 0),
      mat(PAT.NOISE, 0.5, rnd(3, 6), 0, chance(0.6) ? rnd(5, 9) : 0),
      mat(PAT.BANDS, rnd(0.3, 0.55), rnd(6, 10), diag + Math.PI / 2, rnd(0, 0.5)),
    ];
    const wins = [];
    const nWin = 3 + Math.floor(R() * 3);
    for (let i = 0; i < nWin; i++) {
      const diamond = chance(0.45);
      const hx = rnd(0.16, 0.36), hy = diamond ? hx : rnd(0.16, 0.4);
      wins.push({
        cx: rnd(-0.32, 0.32), cy: rnd(-0.42, 0.42), hx, hy,
        angle: diamond ? Math.PI / 4 : pick([0, 0, rnd(-0.5, 0.5)]),
        mat: winMats[i % winMats.length],
      });
    }

    // Inks for drops: black, white and greys, each with its observer, plus ringed and striped inks.
    const inks = [
      mat(PAT.FLAT, 0, 0, 0), mat(PAT.FLAT, 1, 0, 0),
      mat(PAT.FLAT, rnd(0.25, 0.4), 0, 0), mat(PAT.FLAT, rnd(0.55, 0.75), 0, 0),
      mat(PAT.RINGS, rnd(0.35, 0.6), rnd(28, 46), 0, 0),
      mat(PAT.STRIPES, 1, rnd(16, 30), rnd(0, Math.PI), 0.5),
    ];
    while (mats.length > MAX_MATS) mats.pop();

    // Timeline: movements in a seeded order. Each op: {type, t0, dur, mat, a:[4], b:[4]}.
    const ops = [];
    let t = 2.5;
    const push = (o) => { if (ops.length < MAX_OPS) ops.push(o); };
    const inkPick = () => pick(inks);
    const n = (k) => Math.max(1, Math.round(k * density));

    function stones() {
      const k = n(rnd(2, 5));
      for (let s = 0; s < k; s++) {
        const cx = rnd(-0.38, 0.38), cy = rnd(-0.5, 0.5);
        const rings = n(rnd(4, 9));
        const seq = [inkPick(), inkPick(), inkPick()];
        for (let i = 0; i < rings; i++) {
          push({ type: OP.DROP, t0: t, dur: rnd(0.5, 1.1), mat: seq[i % seq.length], a: [cx, cy, rnd(0.035, 0.075), 0], b: [0, 0, 0, 0] });
          t += rnd(0.18, 0.4);
        }
        t += rnd(0.3, 0.9);
      }
    }
    function scatter() {
      const k = n(rnd(6, 16));
      for (let i = 0; i < k; i++) {
        push({ type: OP.DROP, t0: t, dur: rnd(0.5, 1.2), mat: inkPick(), a: [rnd(-0.45, 0.45), rnd(-0.58, 0.58), rnd(0.02, 0.09), 0], b: [0, 0, 0, 0] });
        t += rnd(0.12, 0.35);
      }
    }
    function comb(fine) {
      // gel-git: strokes back and forth across the bath
      const ang = pick([0, Math.PI / 2, diag, rnd(0, Math.PI)]);
      const mx = Math.cos(ang), my = Math.sin(ang);
      const strokes = n(fine ? rnd(1, 3) : rnd(2, 3.5));
      const tines = fine ? 9 + Math.floor(R() * 10) : 3 + Math.floor(R() * 6);
      const spacing = fine ? rnd(0.035, 0.06) : rnd(0.09, 0.2);
      let off = rnd(-0.5, 0.5) * spacing;
      for (let i = 0; i < strokes; i++) {
        const z = (i % 2 ? -1 : 1) * (fine ? rnd(0.015, 0.035) : rnd(0.07, 0.2));
        push({ type: OP.COMB, t0: t, dur: rnd(1.6, 3.2), mat: 0,
          a: [-my * off, mx * off, mx, my], b: [z, fine ? rnd(0.008, 0.016) : rnd(0.02, 0.05), tines, spacing] });
        off += spacing * rnd(0.3, 0.6);
        t += rnd(1.1, 2.4);
      }
    }
    function wave() {
      const ang = pick([0, Math.PI / 2, diag]);
      push({ type: OP.WAVE, t0: t, dur: rnd(2.5, 4.5), mat: 0,
        a: [Math.cos(ang), Math.sin(ang), rnd(0.02, 0.06), rnd(5, 14)], b: [rnd(0, 6.283), 0, 0, 0] });
      t += rnd(1.8, 3.2);
    }
    function swirl() {
      const k = n(rnd(1, 3));
      for (let i = 0; i < k; i++) {
        push({ type: OP.SWIRL, t0: t, dur: rnd(2.5, 5), mat: 0,
          a: [rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(0.05, 0.3), (chance(0.5) ? -1 : 1) * rnd(0.1, 0.35)], b: [rnd(0.03, 0.08), 0, 0, 0] });
        t += rnd(1.2, 2.6);
      }
    }

    // Every movement ends on drops: the last gesture lays clean ink on the worked field,
    // as a marbler does before the paper goes down.
    const grammar = [
      ['stones', 'comb', 'wave', 'scatter', 'swirl', 'stones'],
      ['scatter', 'comb', 'stones', 'swirl', 'scatter'],
      ['wave', 'stones', 'comb', 'fine', 'stones'],
      ['stones', 'swirl', 'comb', 'scatter'],
      ['comb', 'stones', 'wave', 'swirl', 'stones'],
      ['stones', 'fine', 'swirl', 'scatter', 'stones'],
    ];
    const movement = pick(grammar);
    for (const m of movement) {
      if (m === 'stones') stones();
      else if (m === 'scatter') scatter();
      else if (m === 'comb') comb(false);
      else if (m === 'fine') comb(true);
      else if (m === 'wave') wave();
      else if (m === 'swirl') swirl();
      t += rnd(0.6, 1.6);
    }
    let end = 0;
    for (const o of ops) end = Math.max(end, o.t0 + o.dur);
    const settle = end + 2.5;
    return {
      seed: seed >>> 0, bath, sessionSeed: sessionSeed(seed, bath), movement,
      mats, bg, wins, ops, settle, hold: 6, length: settle + 6,
      lagrange, density,
    };
  }

  // ------------------------------------------------------------------ blue noise (void and cluster)
  let _blue = null;
  function blueNoise() {
    if (_blue) return _blue;
    const N = 64, NN = N * N, sigma = 1.5;
    const K = new Float64Array(NN);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = Math.min(x, N - x), dy = Math.min(y, N - y);
      K[y * N + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
    const E = new Float64Array(NN), on = new Uint8Array(NN), rank = new Int32Array(NN).fill(-1);
    const add = (i, s) => {
      const ix = i % N, iy = (i / N) | 0;
      for (let y = 0; y < N; y++) {
        const ky = ((y - iy + N) % N) * N;
        for (let x = 0; x < N; x++) E[y * N + x] += s * K[ky + ((x - ix + N) % N)];
      }
    };
    const R = mulberry32(0xb1e0);
    const ones0 = Math.round(NN * 0.1);
    let placed = 0;
    while (placed < ones0) { const i = Math.floor(R() * NN); if (!on[i]) { on[i] = 1; add(i, 1); placed++; } }
    const tightest = () => { let b = -1, v = -1; for (let i = 0; i < NN; i++) if (on[i] && E[i] > v) { v = E[i]; b = i; } return b; };
    const voidest = () => { let b = -1, v = Infinity; for (let i = 0; i < NN; i++) if (!on[i] && E[i] < v) { v = E[i]; b = i; } return b; };
    for (let guard = 0; guard < 4 * NN; guard++) {            // relax the initial pattern
      const c = tightest(); on[c] = 0; add(c, -1);
      const v = voidest();
      if (v === c) { on[c] = 1; add(c, 1); break; }
      on[v] = 1; add(v, 1);
    }
    const proto = on.slice(), Eproto = E.slice();
    for (let r = ones0 - 1; r >= 0; r--) { const c = tightest(); rank[c] = r; on[c] = 0; add(c, -1); }
    on.set(proto); E.set(Eproto);
    for (let r = ones0; r < NN; r++) { const v = voidest(); rank[v] = r; on[v] = 1; add(v, 1); }
    const out = new Float32Array(NN);
    for (let i = 0; i < NN; i++) out[i] = (rank[i] + 0.5) / NN;
    _blue = out;
    return out;
  }

  function bayer8(x, y) {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      const bx = (x >> i) & 1, by = (y >> i) & 1;
      v |= (((bx ^ by) << 1) | by) << (2 * (2 - i));
    }
    return (v + 0.5) / 64;
  }

  // ------------------------------------------------------------------ the pull-back (CPU twin of the shader)
  const smooth = (s) => s * s * (3 - 2 * s);
  function progress(o, t) { const s = Math.min(1, Math.max(0, (t - o.t0) / o.dur)); return smooth(s); }

  // Pull a plate point back through every started op. Returns {mat, x, y} in the material's frame.
  function pullBack(S, t, px, py) {
    let x = px, y = py;
    for (let k = S.ops.length - 1; k >= 0; k--) {
      const o = S.ops[k];
      if (t < o.t0) continue;
      const s = progress(o, t);
      const a = o.a, b = o.b;
      if (o.type === OP.DROP) {
        const vx = x - a[0], vy = y - a[1];
        const L2 = vx * vx + vy * vy, rr2 = a[2] * a[2] * s;
        if (L2 < rr2) { const k2 = 1 / Math.sqrt(Math.max(s, 1e-4)); return { mat: o.mat, x: vx * k2, y: vy * k2 }; }
        const f = Math.sqrt(1 - rr2 / L2);
        x = a[0] + vx * f; y = a[1] + vy * f;
      } else if (o.type === OP.COMB) {
        const mx = a[2], my = a[3], nx = -my, ny = mx;
        const d = (x - a[0]) * nx + (y - a[1]) * ny;
        const tines = b[2], sp = b[3], half = (tines - 1) / 2;
        const i = Math.min(tines - 1, Math.max(0, Math.round(d / sp + half)));
        const dn = Math.abs(d - (i - half) * sp);
        const disp = b[0] * s * b[1] / (dn + b[1]);
        x -= disp * mx; y -= disp * my;
      } else if (o.type === OP.WAVE) {
        const mx = a[0], my = a[1], nx = -my, ny = mx;
        const u = (x - b[1]) * mx + (y - b[2]) * my;
        const w = a[2] * s * Math.sin(a[3] * u + b[0]);
        x -= w * nx; y -= w * ny;
      } else if (o.type === OP.SWIRL) {
        const vx = x - a[0], vy = y - a[1];
        const r = Math.sqrt(vx * vx + vy * vy);
        const arc = a[3] * s * b[0] / (Math.abs(r - a[2]) + b[0]);
        const th = -arc / Math.max(r, 1e-4);
        const c = Math.cos(th), sn = Math.sin(th);
        x = a[0] + vx * c - vy * sn; y = a[1] + vx * sn + vy * c;
      }
    }
    // the ground: windows, top-most last
    let m = S.bg;
    for (let i = 0; i < S.wins.length; i++) {
      const w = S.wins[i];
      const c = Math.cos(-w.angle), sn = Math.sin(-w.angle);
      const ux = (x - w.cx) * c - (y - w.cy) * sn, uy = (x - w.cx) * sn + (y - w.cy) * c;
      if (Math.abs(ux) < w.hx && Math.abs(uy) < w.hy) m = w.mat;
    }
    return { mat: m, x, y };
  }

  function vnoise(x, y, salt) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const h = (i, j) => hash32(Math.imul((i + 4096) >>> 0, 0x8da6b343) ^ Math.imul((j + 4096) >>> 0, 0xd8163841) ^ salt) / 4294967296;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y) {
    return 0.55 * vnoise(x, y, 17) + 0.3 * vnoise(x * 2.03, y * 2.03, 71) + 0.15 * vnoise(x * 4.1, y * 4.1, 131);
  }
  const fract = (v) => v - Math.floor(v);

  // Tone of a material at its own coordinates (0 = ink, 1 = paper).
  function tone(M, x, y) {
    const c = Math.cos(M.angle), s = Math.sin(M.angle);
    const u = x * c + y * s, v = -x * s + y * c;
    switch (M.pattern) {
      case PAT.FLAT: return M.tone;
      case PAT.STRIPES: return fract(u * M.freq) < M.param ? 1 : 0;
      case PAT.BANDS: {
        const w = fract(u * M.freq + M.param * Math.sin(v * M.freq * 0.9 + 1.7));
        return w < 0.07 ? 1 : w < 0.13 ? 0 : M.tone;
      }
      case PAT.LATTICE: {
        const gx = u * M.freq, gy = v * M.freq;
        const cx = Math.floor(gx), cy = Math.floor(gy);
        const fx = gx - cx - 0.5, fy = gy - cy - 0.5;
        const odd = (cx + cy) & 1;
        if (Math.abs(fx) + Math.abs(fy) < 0.15) return odd ? 0 : 1;
        const blob = Math.exp(-(fx * fx + fy * fy) / 0.05);
        return Math.min(1, Math.max(0, M.tone + (odd ? -0.3 : 0.45) * blob));
      }
      case PAT.NOISE: {
        const nv = fbm(x * M.freq, y * M.freq);
        const g = Math.min(1, Math.max(0, 0.5 + 1.9 * (nv - 0.5)));
        if (M.param > 0) { const k = fract(nv * M.param); if (k < 0.1) return 0; if (k < 0.16) return 1; }
        return g;
      }
      case PAT.RINGS: {
        const w = fract(Math.sqrt(x * x + y * y) * M.freq);
        return w < 0.18 ? 0 : w < 0.3 ? 1 : M.tone;
      }
    }
    return 0.5;
  }

  // Threshold of the observer that sees material M at pixel (ix, iy), local coords (x, y),
  // with k = material units per pixel and resolve = minimum resolvable screen period (px).
  function threshold(M, ix, iy, x, y, k, resolve, blue) {
    if (M.screen === SCR.DOTS || M.screen === SCR.LINES) {
      const period = 1 / (M.sfreq * Math.max(k, 1e-9));
      if (period >= resolve) {
        const c = Math.cos(M.sangle), s = Math.sin(M.sangle);
        const u = (x * c + y * s) * M.sfreq, v = (-x * s + y * c) * M.sfreq;
        if (M.screen === SCR.DOTS) return 0.5 - 0.25 * (Math.cos(6.283185307 * u) + Math.cos(6.283185307 * v));
        return 0.5 - 0.5 * Math.cos(6.283185307 * v);
      }
      return blue[(iy & 63) * 64 + (ix & 63)];
    }
    if (M.screen === SCR.BLUE) return blue[(iy & 63) * 64 + (ix & 63)];
    return bayer8(ix & 7, iy & 7);
  }

  // Grid point (ix, iy) of a gw × gh grid → plate coords (y down).
  function plateXY(ix, iy, gw, gh) {
    return [((ix + 0.5) / gw - 0.5) * PLATE_W, ((iy + 0.5) / gh - 0.5) * PLATE_H];
  }

  // CPU render: 1 = paper, 0 = ink. Derivatives follow the GPU's 2 × 2 quads.
  function render(S, t, gw, gh, opts) {
    opts = opts || {};
    const resolve = opts.resolve || 2.5;
    const blue = blueNoise();
    const bits = new Uint8Array(gw * gh);
    const P = new Array(gw * gh);
    for (let iy = 0; iy < gh; iy++) for (let ix = 0; ix < gw; ix++) {
      const p = plateXY(ix, iy, gw, gh);
      P[iy * gw + ix] = pullBack(S, t, p[0], p[1]);
    }
    for (let iy = 0; iy < gh; iy++) for (let ix = 0; ix < gw; ix++) {
      const q = P[iy * gw + ix], M = S.mats[q.mat];
      const x0 = ix & ~1, y0 = iy & ~1;
      const a = P[y0 * gw + x0], bx = P[y0 * gw + Math.min(gw - 1, x0 + 1)], by = P[Math.min(gh - 1, y0 + 1) * gw + x0];
      const kx = Math.hypot(bx.x - a.x, bx.y - a.y), ky = Math.hypot(by.x - a.x, by.y - a.y);
      const k = Math.max(kx, ky);
      const g = tone(M, q.x, q.y);
      const T = threshold(M, ix, iy, q.x, q.y, k, resolve, blue);
      bits[iy * gw + ix] = g > T ? 1 : 0;
    }
    return bits;
  }

  // Ops and materials packed for the shader.
  function pack(S) {
    const ops = new Float32Array(MAX_OPS * 12);
    S.ops.forEach((o, i) => {
      ops.set([o.type, o.t0, o.dur, o.mat, o.a[0], o.a[1], o.a[2], o.a[3], o.b[0], o.b[1], o.b[2], o.b[3]], i * 12);
    });
    const mats = new Float32Array(MAX_MATS * 8);
    S.mats.forEach((M, i) => {
      mats.set([M.pattern, M.tone, M.freq, M.angle, M.screen, M.sfreq, M.sangle, M.param], i * 8);
    });
    const wins = new Float32Array(MAX_WINS * 8);
    S.wins.forEach((w, i) => { wins.set([w.cx, w.cy, w.hx, w.hy, w.angle, w.mat, 0, 0], i * 8); });
    return { ops, nOps: S.ops.length, mats, wins, nWins: S.wins.length, bg: S.bg };
  }

  // The score as a plain, auditable record.
  function describe(S) {
    const names = { 1: 'drop', 2: 'comb', 3: 'wave', 4: 'swirl' };
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    return {
      piece: 'Two Observers', seed: S.seed, bath: S.bath, sessionSeed: S.sessionSeed,
      movement: S.movement, settle: r4(S.settle), length: r4(S.length),
      lagrange: S.lagrange, density: S.density,
      ground: { bg: S.bg, windows: S.wins.map((w) => ({ cx: r4(w.cx), cy: r4(w.cy), hx: r4(w.hx), hy: r4(w.hy), angle: r4(w.angle), mat: w.mat })) },
      materials: S.mats.map((M) => ({
        pattern: Object.keys(PAT).find((k) => PAT[k] === M.pattern), tone: r4(M.tone), freq: r4(M.freq), angle: r4(M.angle),
        observer: M.screen >= SCR.DOTS ? 'lagrangian' : 'eulerian',
        screen: Object.keys(SCR).find((k) => SCR[k] === M.screen), screenFreq: r4(M.sfreq), screenAngle: r4(M.sangle),
      })),
      ops: S.ops.map((o) => ({ op: names[o.type], t0: r4(o.t0), dur: r4(o.dur), mat: o.type === OP.DROP ? o.mat : undefined, a: o.a.map(r4), b: o.b.map(r4) })),
    };
  }

  const api = {
    PLATE_W, PLATE_H, OP, PAT, SCR, MAX_OPS, MAX_MATS, MAX_WINS,
    score, blueNoise, bayer8, pullBack, tone, threshold, render, pack, describe, plateXY, progress, hash32, sessionSeed,
  };
  global.Marble = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
