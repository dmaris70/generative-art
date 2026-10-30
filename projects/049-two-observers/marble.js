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
 * Two observers borrowed from physical work. Soto (the Vibrations): a fixed striped panel on the
 * glass seen through ink that carries its own near-parallel lines, so combing makes the moire
 * swim and the viewer's position shifts the panel. Mellan (the Sudarium, 1649): one spiral line
 * per drop whose width carries the tone, combed with the ink and exportable for a pen plotter.
 *
 * And a hand, after Polke's raster paintings: the screens carried by the ink are painted, not
 * machined. Each dot wanders, swells or shrinks, goes out of round; now and then one is missing or
 * runs into its neighbours as a blot; ruled lines waver, thicken and break. The irregularity is a
 * property of the ink's own cells, so it is stable in time and is combed with the ink. The fixed
 * screens on the glass stay exact. hand = 0 is the machine and reproduces the unpainted screens.
 *
 * And a wire field, from a line etching: long taut lines across a band of the plate, dense short
 * vertical strokes hanging from them (thickest across the upper middle, a few spikes rising from
 * the top wires), bare wires crossing at shallow angles below, and a speckle of plate tone between.
 * It is ground, so the gestures bend the wires and drag the strokes; it is line, so it joins the
 * plotter layer.
 *
 * sketch.js runs the same arithmetic in a fragment shader; this file generates the score,
 * the blue-noise screen and a CPU render used for previews and for checking the shader.
 */
(function (global) {
  'use strict';

  // --- constants shared with the shader (keep in step with sketch.js) ---
  const PLATE_W = 1.0, PLATE_H = 1.25;     // plate units, 4 : 5, origin at the centre
  const OP = { DROP: 1, COMB: 2, WAVE: 3, SWIRL: 4 };
  const PAT = { FLAT: 0, STRIPES: 1, BANDS: 2, LATTICE: 3, NOISE: 4, RINGS: 5, SPHERE: 6, WIRES: 7 };
  const SCR = { BAYER: 0, BLUE: 1, DOTS: 2, LINES: 3, SOTO: 4, SPIRAL: 5 };
  const MAX_OPS = 160, MAX_MATS = 16, MAX_WINS = 8, MAX_WIRES = 32, WIRE_SLOT = 0.0032;

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

    // Soto and Mellan, drawn from their own stream so the rest of a seed's score is unchanged.
    const R2 = mulberry32(sessionSeed(seed, bath) ^ 0x50703e11);
    const pSoto = opts.soto == null ? 0.7 : opts.soto, pMellan = opts.mellan == null ? 0.8 : opts.mellan;
    let sotoMat = -1, mellanMat = -1;
    if (R2() < pSoto) {
      // ink that carries near-vertical lines at nearly the panel's pitch: the beat is the moire
      mats.push({ pattern: PAT.FLAT, tone: 0.35 + 0.3 * R2(), freq: 0, angle: 0, screen: SCR.SOTO,
        sfreq: (R2() < 0.5 ? 0.93 : 1.03) + 0.04 * R2(), sangle: (R2() - 0.5) * 0.12, param: 0 });
      sotoMat = mats.length - 1;
      // a modest panel, slipped in among the other windows rather than laid over all of them
      const hx = 0.12 + 0.1 * R2(), hy = 0.18 + 0.14 * R2();
      const at = Math.floor(R2() * (wins.length + 1));
      wins.splice(at, 0, { cx: (R2() - 0.5) * 0.55, cy: (R2() - 0.5) * 0.7, hx, hy, angle: 0, mat: sotoMat });
    }
    if (R2() < pMellan) {
      // a sphere lit from above left, engraved as one spiral (angle = light direction, y down)
      mats.push({ pattern: PAT.SPHERE, tone: 0, freq: 0, angle: -2.36 + (R2() - 0.5) * 0.9, screen: SCR.SPIRAL,
        sfreq: 70 + 30 * R2(), sangle: 0, param: 0 });
      mellanMat = mats.length - 1;
    }
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
    // Some of the larger drops become Mellan spheres or Soto glass.
    for (const o of ops) {
      if (o.type !== OP.DROP) continue;
      const u = R2();
      if (mellanMat >= 0 && o.a[2] >= 0.05 && u < 0.4) o.mat = mellanMat;
      else if (sotoMat >= 0 && u > 0.93) o.mat = sotoMat;
    }
    // The wire field: one wide band window, from the same side stream (appended draws only).
    const pWires = opts.wires == null ? 0.6 : opts.wires;
    let wiresMat = -1;
    if (R2() < pWires && mats.length < MAX_MATS) {
      const hx = 0.36 + 0.12 * R2(), hy = 0.13 + 0.11 * R2();
      const cx = (R2() - 0.5) * (0.5 - hx) * 2 * 0.5, cy = (R2() - 0.5) * 0.7;
      mats.push({ pattern: PAT.WIRES, tone: 0.8 + 0.1 * R2(), freq: 14 + Math.floor(R2() * 17), angle: 0,
        screen: SCR.BLUE, sfreq: 0, sangle: 0, param: 0.55 + 0.35 * R2(), wcx: cx, wcy: cy, why: hy });
      wiresMat = mats.length - 1;
      wins.splice(Math.floor(R2() * (wins.length + 1)), 0, { cx, cy, hx, hy, angle: 0, mat: wiresMat });
    }
    // The hand: painted carried screens. No draws from the score's streams — a hash per ink sets how
    // heavy each hand is, so the gestures and inks of a seed do not move when the hand changes.
    const hand = opts.hand == null ? 0.6 : opts.hand;
    const ss = sessionSeed(seed, bath);
    mats.forEach((Mt, i) => {
      Mt.hand = 0; Mt.salt = hash32(ss ^ Math.imul(i + 1, 0x85ebca6b));
      if (hand > 0 && (Mt.screen === SCR.DOTS || Mt.screen === SCR.LINES)) {
        Mt.hand = hand * (0.6 + 0.4 * (hash32(Mt.salt ^ 0x51ed) / 4294967296));
        if (Mt.screen === SCR.DOTS) Mt.sfreq *= 1 - 0.45 * Mt.hand;   // Polke's enlarged raster
      }
    });
    let end = 0;
    for (const o of ops) end = Math.max(end, o.t0 + o.dur);
    const settle = end + 2.5;
    return {
      seed: seed >>> 0, bath, sessionSeed: sessionSeed(seed, bath), movement, sotoMat, mellanMat, wiresMat,
      mats, bg, wins, ops, settle, hold: 6, length: settle + 6,
      lagrange, density, hand,
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
        if (L2 < rr2) { const k2 = 1 / Math.sqrt(Math.max(s, 1e-4)); return { mat: o.mat, x: vx * k2, y: vy * k2, rad: a[2], op: k }; }
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
    return { mat: m, x, y, rad: 0, op: -1 };
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
  // The wire field's parts, all from hashes of the ink's salt: wire j, and the stroke in slot s.
  function wireOf(M, j) {
    const base = (M.salt ^ Math.imul(j + 1, 0x632be5ab)) >>> 0;
    const h = (n) => hash32(base ^ Math.imul(n, 0x9e3779b9)) / 4294967296;
    const rho = h(1), bare = rho > 0.74;                          // 0 = top of the band, 1 = bottom
    return {
      rho, bare, y0: M.wcy - M.why * 1.02 + rho * 2.04 * M.why,
      slope: (h(2) - 0.5) * (bare ? 0.26 : 0.06),
      env: bare ? 0 : Math.exp(-Math.pow((rho - 0.36) / 0.24, 2)),
      off: h(3) * WIRE_SLOT, salt: hash32(M.salt ^ Math.imul(j + 1, 0x1b873593)),
    };
  }
  function strokeOf(M, W, s) {
    const hh = hash32(W.salt ^ Math.imul(s + 65536, 0x85ebca6b));
    const u = (n) => hash32(hh ^ Math.imul(n, 0x9e3779b9)) / 4294967296;
    const cluster = 0.35 + 1.3 * vnoise(s * 0.045, 0.5, W.salt);    // the strokes come in bursts
    if (u(1) >= M.param * W.env * cluster) return null;
    const down = 0.004 + 0.055 * Math.pow(u(2), 3);
    const up = W.rho < 0.16 && u(3) < 0.35 ? 0.006 + 0.045 * u(4) * u(4) : 0.0015 + 0.004 * u(4);
    return { xs: (s + 0.5) * WIRE_SLOT - W.off + (u(5) - 0.5) * 0.4 * WIRE_SLOT, up, down };
  }
  function wiresInk(M, x, y, k) {
    const wt = Math.max(0.0011, 0.55 * k), sw = Math.max(0.0008, 0.42 * k);
    const K = Math.min(MAX_WIRES, M.freq);
    for (let j = 0; j < K; j++) {
      const W = wireOf(M, j);
      const dy = y - (W.y0 + W.slope * (x - M.wcx));
      if (Math.abs(dy) < wt) return true;
      if (W.bare || dy < -0.06 || dy > 0.065) continue;
      const s0 = Math.floor((x + W.off) / WIRE_SLOT);
      for (let s = s0 - 1; s <= s0 + 1; s++) {
        const st = strokeOf(M, W, s);
        if (st && Math.abs(x - st.xs) < sw && dy > -st.up && dy < st.down) return true;
      }
    }
    return false;
  }

  function tone(M, x, y, rad, k) {
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
      case PAT.WIRES: return wiresInk(M, x, y, k || 0) ? 0 : M.tone;
      case PAT.SPHERE: {
        const r = Math.max(rad || 0.05, 1e-4), nx = x / r, ny = y / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lx = Math.cos(M.angle) * 0.62, ly = Math.sin(M.angle) * 0.62, lz = 0.78;
        return Math.min(1, 0.04 + 0.96 * Math.max(0, nx * lx + ny * ly + nz * lz));
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
  // Soto: fixed vertical panel (period P cells, shifted by the viewer) OR the ink's own lines.
  function sotoBit(M, ix, x, y, k, C) {
    const P = C.panel, par = C.parallax || 0;
    const panelInk = (((ix + par) / P) % 1 + 1) % 1 < 0.5;
    const fL = M.sfreq * C.gw / (P * PLATE_W);
    let lineInk = false;
    if (1 / (fL * Math.max(k, 1e-9)) >= C.resolve) {
      const u = (x * Math.cos(M.sangle) + y * Math.sin(M.sangle)) * fL;
      lineInk = u - Math.floor(u) < 0.3 + 0.35 * (1 - M.tone);
    }
    return panelInk || lineInk ? 0 : 1;
  }
  // Four independent unit values from one cell of an ink's screen.
  function cellHash(cx, cy, salt) {
    const h = hash32(Math.imul((cx + 4096) >>> 0, 0x8da6b343) ^ Math.imul((cy + 4096) >>> 0, 0xd8163841) ^ salt);
    const u = (n) => hash32(h ^ Math.imul(n, 0x9e3779b9)) / 4294967296;
    return [u(1), u(2), u(3), u(4), u(5), u(6)];
  }
  // Polke's dots: each of the nine nearest painted dots may reach this pixel.
  function handDotsInk(M, x, y, g) {
    const H = M.hand, c = Math.cos(M.sangle), s = Math.sin(M.sangle);
    const u = (x * c + y * s) * M.sfreq, v = (-x * s + y * c) * M.sfreq;
    const bx = Math.floor(u), by = Math.floor(v);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = bx + dx, cy = by + dy;
      const h = cellHash(cx, cy, M.salt);
      if (h[3] > 1 - 0.05 * H) continue;                                  // a dot left out
      let size = 1 + 0.6 * H * (h[2] - 0.5);
      if (h[3] < 0.015 * H) size *= 1.9;                                   // a blot
      const r2 = (1 - g) / Math.PI * size * size;
      if (r2 <= 0) continue;
      let ex = u - (cx + 0.5 + 0.32 * H * (h[0] - 0.5));
      let ey = v - (cy + 0.5 + 0.32 * H * (h[1] - 0.5));
      const e = 0.45 * H * (h[4] - 0.5);                                  // out of round
      ex *= 1 + e; ey *= 1 - e;
      const wob = 1 + 0.14 * H * Math.sin(3 * Math.atan2(ey, ex) + 6.283185307 * h[5]);
      if ((ex * ex + ey * ey) * wob * wob < r2) return true;
    }
    return false;
  }
  // Lines ruled by hand: each wavers along its length, varies in width, and breaks.
  function handLinesInk(M, x, y, g) {
    const H = M.hand, c = Math.cos(M.sangle), s = Math.sin(M.sangle);
    const u = (x * c + y * s) * M.sfreq, v = (-x * s + y * c) * M.sfreq;
    const b = Math.floor(v);
    for (let dl = -1; dl <= 1; dl++) {
      const L = b + dl;
      const sl = (M.salt ^ Math.imul(L + 4096, 0x27d4eb2d)) >>> 0;
      const wob = 0.42 * H * (vnoise(u * 0.18, 0.5, sl) - 0.5);
      const width = 1 + 0.7 * H * (vnoise(u * 0.5, 7.5, sl) - 0.5);
      if (vnoise(u * 0.09, 13.5, sl) < 0.22 * H) continue;                // the brush lifted
      if (Math.abs(v - (L + 0.5 + wob)) < 0.5 * (1 - g) * width) return true;
    }
    return false;
  }
  function shade(M, ix, iy, q, k, C) {
    if (M.screen === SCR.SOTO) return sotoBit(M, ix, q.x, q.y, k, C);
    const g = tone(M, q.x, q.y, q.rad, k);
    if (M.hand > 0 && (M.screen === SCR.DOTS || M.screen === SCR.LINES)
      && 1 / (M.sfreq * Math.max(k, 1e-9)) >= C.resolve) {
      return (M.screen === SCR.DOTS ? handDotsInk(M, q.x, q.y, g) : handLinesInk(M, q.x, q.y, g)) ? 0 : 1;
    }
    return g > threshold(M, ix, iy, q.x, q.y, k, C.resolve, C.blue) ? 1 : 0;
  }

  function threshold(M, ix, iy, x, y, k, resolve, blue) {
    if (M.screen === SCR.SPIRAL) {
      // Mellan: one Archimedean spiral about the drop's centre, pitch 1 / sfreq
      if (1 / (M.sfreq * Math.max(k, 1e-9)) >= resolve) {
        const u = Math.sqrt(x * x + y * y) * M.sfreq - Math.atan2(y, x) / 6.283185307;
        return 0.5 - 0.5 * Math.cos(6.283185307 * u);
      }
      return blue[(iy & 63) * 64 + (ix & 63)];
    }
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
    const C = { resolve, blue, gw, panel: opts.panel || 4, parallax: opts.parallax || 0 };
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
      bits[iy * gw + ix] = shade(M, ix, iy, q, k, C);
    }
    return bits;
  }

  // ------------------------------------------------------------------ the plotter layer (Mellan)
  // Push a point forward through every started op after op k (the pull-back, run the other way).
  function pushForward(S, t, k, x, y) {
    for (let j = k + 1; j < S.ops.length; j++) {
      const o = S.ops[j];
      if (t < o.t0) continue;
      const s = progress(o, t), a = o.a, b = o.b;
      if (o.type === OP.DROP) {
        let vx = x - a[0], vy = y - a[1];
        let L2 = vx * vx + vy * vy;
        if (L2 < 1e-14) { vx = 1e-7; vy = 0; L2 = 1e-14; }
        const f = Math.sqrt(1 + a[2] * a[2] * s / L2);
        x = a[0] + vx * f; y = a[1] + vy * f;
      } else if (o.type === OP.COMB) {
        const mx = a[2], my = a[3], nx = -my, ny = mx;
        const d = (x - a[0]) * nx + (y - a[1]) * ny;
        const tines = b[2], sp = b[3], half = (tines - 1) / 2;
        const i = Math.min(tines - 1, Math.max(0, Math.round(d / sp + half)));
        const dn = Math.abs(d - (i - half) * sp);
        const disp = b[0] * s * b[1] / (dn + b[1]);
        x += disp * mx; y += disp * my;
      } else if (o.type === OP.WAVE) {
        const mx = a[0], my = a[1], nx = -my, ny = mx;
        const u = (x - b[1]) * mx + (y - b[2]) * my;
        const w = a[2] * s * Math.sin(a[3] * u + b[0]);
        x += w * nx; y += w * ny;
      } else if (o.type === OP.SWIRL) {
        const vx = x - a[0], vy = y - a[1];
        const r = Math.sqrt(vx * vx + vy * vy);
        const th = (a[3] * s * b[0] / (Math.abs(r - a[2]) + b[0])) / Math.max(r, 1e-4);
        const c = Math.cos(th), sn = Math.sin(th);
        x = a[0] + vx * c - vy * sn; y = a[1] + vx * sn + vy * c;
      }
    }
    return [x, y];
  }

  // March a curve's parameter from a0 to a1; where the gestures have stretched it, bisect until
  // segments are short, and lift the pen where they stay long (the line was torn by a later
  // gesture) or where the curve is hidden. inked(a): the curve is drawn here; pt(a): its place on
  // the plate at time t, or null where later ink covers it.
  function trace(a0, a1, next, inked, pt, lines) {
    let cur = null;
    const flush = () => { if (cur && cur.length > 1) lines.push(cur); cur = null; };
    const extend = (b0, P0, b1, P1, depth) => {
      if (Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) <= 0.0025) { cur.push(P1); return true; }
      if (depth >= 12) return false;
      const bm = 0.5 * (b0 + b1);
      if (!inked(bm)) return false;
      const Pm = pt(bm);
      if (!Pm) return false;
      if (!extend(b0, P0, bm, Pm, depth + 1)) { flush(); cur = [Pm]; }
      if (!extend(bm, Pm, b1, P1, depth + 1)) { flush(); cur = [P1]; }
      return true;
    };
    let a = a0, prevA = a0, prev = null;
    for (;;) {
      const P = inked(a) ? pt(a) : null;
      if (P) {
        if (!cur) cur = [P];
        else if (!extend(prevA, prev, a, P, 0)) { flush(); cur = [P]; }
        prev = P; prevA = a;
      } else { flush(); prev = null; }
      if (a >= a1) break;
      a = Math.min(a1, next(a));
    }
    flush();
  }

  // The plotter layer: Mellan's spirals and the wire field, pushed forward to time t through the
  // exact forward maps, clipped where later ink covers them or the plate ends. One pen. Mellan's
  // swelling line is up to five strands side by side, each drawn only where the engraving is dark
  // enough to need it; the wire field is its wires and its strokes.
  function plotter(S, t, opts) {
    opts = opts || {};
    const mmW = opts.width || 160, mmH = mmW * PLATE_H / PLATE_W, margin = opts.margin || 20, pen = opts.pen || 0.25;
    const X = (x) => margin + (x / PLATE_W + 0.5) * mmW, Y = (y) => margin + (y / PLATE_H + 0.5) * mmH;
    const onPlate = (P) => Math.abs(P[0]) <= PLATE_W / 2 && Math.abs(P[1]) <= PLATE_H / 2;
    const groups = [];
    let total = 0, drops = 0, wires = 0, strokes = 0;
    const emit = (id, label, lines) => {
      if (!lines.length) return;
      total += lines.length;
      groups.push(`<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}">` +
        lines.map((L) => '<polyline points="' + L.map((P) => X(P[0]).toFixed(3) + ',' + Y(P[1]).toFixed(3)).join(' ') + '"/>').join('') + '</g>');
    };

    S.ops.forEach((o, k) => {
      if (o.type !== OP.DROP || t < o.t0 || o.mat !== S.mellanMat || S.mellanMat < 0) return;
      const M = S.mats[o.mat], f = M.sfreq, rad = o.a[2], sNow = progress(o, t);
      if (sNow <= 0) return;
      const root = Math.sqrt(sNow);
      const strands = [[0, 0.04], [-0.11, 0.32], [0.11, 0.32], [-0.22, 0.62], [0.22, 0.62]];
      const lines = [];
      const at = (th, off) => {
        const r = th / (6.283185307 * f) + off / f;
        return { r, lx: r * Math.cos(th), ly: r * Math.sin(th) };
      };
      for (const [off, need] of strands) {
        trace(0, 6.283185307 * f * rad,
          (th) => th + 0.0012 / Math.max(Math.abs(at(th, off).r), 0.002),
          (th) => { const q = at(th, off); return q.r > 0 && q.r < rad && 1 - tone(M, q.lx, q.ly, rad) > need; },
          (th) => {
            const q = at(th, off);
            const P = pushForward(S, t, k, o.a[0] + q.lx * root, o.a[1] + q.ly * root);
            return onPlate(P) && pullBack(S, t, P[0], P[1]).op === k ? P : null;
          }, lines);
      }
      if (lines.length) drops++;
      emit(`mellan-${k}`, `mellan drop ${k}`, lines);
    });

    if (S.wiresMat >= 0) {
      const M = S.mats[S.wiresMat], w = S.wins.find((v) => v.mat === S.wiresMat);
      // a ground point is drawn where, pushed forward and pulled back, it is still this ground
      const ground = (gx, gy) => {
        const P = pushForward(S, t, -1, gx, gy);
        if (!onPlate(P)) return null;
        const b = pullBack(S, t, P[0], P[1]);
        return b.op === -1 && b.mat === S.wiresMat && Math.abs(b.x - gx) + Math.abs(b.y - gy) < 1e-6 ? P : null;
      };
      const x0 = w.cx - w.hx, x1 = w.cx + w.hx;
      const wl = [], sl = [];
      for (let j = 0; j < Math.min(MAX_WIRES, M.freq); j++) {
        const W = wireOf(M, j), yAt = (x) => W.y0 + W.slope * (x - M.wcx);
        trace(x0, x1, (x) => x + 0.0015, () => true, (x) => ground(x, yAt(x)), wl);
        wires++;
        if (W.bare) continue;
        for (let s = Math.floor((x0 + W.off) / WIRE_SLOT); s <= Math.floor((x1 + W.off) / WIRE_SLOT); s++) {
          const st = strokeOf(M, W, s);
          if (!st || st.xs < x0 || st.xs > x1) continue;
          const yw = yAt(st.xs);
          const before = sl.length;
          trace(-st.up, st.down, (d) => d + 0.0015, () => true, (d) => ground(st.xs, yw + d), sl);
          if (sl.length > before) strokes++;
        }
      }
      emit('wires', 'wire field: wires', wl);
      emit('strokes', 'wire field: strokes', sl);
    }

    const W = mmW + 2 * margin, H = mmH + 2 * margin;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<desc>Two Observers — the plotter layer (Mellan, wire field). seed ${S.seed}, bath ${S.bath + 1}, t ${t.toFixed(2)} s. One pen, ${pen} mm.</desc>
<g fill="none" stroke="#000" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round">
<g id="frame" inkscape:groupmode="layer" inkscape:label="frame"><rect x="${margin - 6}" y="${margin - 6}" width="${mmW + 12}" height="${mmH + 12}"/></g>
${groups.join('\n')}
</g>
</svg>
`;
    return { svg, polylines: total, drops, wires, strokes, layers: groups.length };
  }

  // Ops and materials packed for the shader.
  function pack(S) {
    const ops = new Float32Array(MAX_OPS * 12);
    S.ops.forEach((o, i) => {
      ops.set([o.type, o.t0, o.dur, o.mat, o.a[0], o.a[1], o.a[2], o.a[3], o.b[0], o.b[1], o.b[2], o.b[3]], i * 12);
    });
    const mats = new Float32Array(MAX_MATS * 12);
    S.mats.forEach((M, i) => {
      mats.set([M.pattern, M.tone, M.freq, M.angle, M.screen, M.sfreq, M.sangle, M.param, M.hand || 0, M.wcx || 0, M.wcy || 0, M.why || 0], i * 12);
    });
    const salts = new Uint32Array(MAX_MATS);
    S.mats.forEach((M, i) => { salts[i] = M.salt >>> 0; });
    const wins = new Float32Array(MAX_WINS * 8);
    S.wins.forEach((w, i) => { wins.set([w.cx, w.cy, w.hx, w.hy, w.angle, w.mat, 0, 0], i * 8); });
    return { ops, nOps: S.ops.length, mats, salts, wins, nWins: S.wins.length, bg: S.bg };
  }

  // The score as a plain, auditable record.
  function describe(S) {
    const names = { 1: 'drop', 2: 'comb', 3: 'wave', 4: 'swirl' };
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    return {
      piece: 'Two Observers', seed: S.seed, bath: S.bath, sessionSeed: S.sessionSeed,
      movement: S.movement, settle: r4(S.settle), length: r4(S.length),
      lagrange: S.lagrange, density: S.density, hand: S.hand, wires: S.wiresMat >= 0,
      ground: { bg: S.bg, windows: S.wins.map((w) => ({ cx: r4(w.cx), cy: r4(w.cy), hx: r4(w.hx), hy: r4(w.hy), angle: r4(w.angle), mat: w.mat })) },
      materials: S.mats.map((M) => ({
        pattern: Object.keys(PAT).find((k) => PAT[k] === M.pattern), tone: r4(M.tone), freq: r4(M.freq), angle: r4(M.angle),
        observer: M.screen === SCR.SOTO ? 'soto (fixed panel + carried lines)' : M.screen === SCR.SPIRAL ? 'mellan (carried spiral)' : M.screen >= SCR.DOTS ? 'lagrangian' : 'eulerian',
        screen: Object.keys(SCR).find((k) => SCR[k] === M.screen), screenFreq: r4(M.sfreq), screenAngle: r4(M.sangle),
        hand: r4(M.hand || 0),
      })),
      ops: S.ops.map((o) => ({ op: names[o.type], t0: r4(o.t0), dur: r4(o.dur), mat: o.type === OP.DROP ? o.mat : undefined, a: o.a.map(r4), b: o.b.map(r4) })),
    };
  }

  const api = {
    PLATE_W, PLATE_H, OP, PAT, SCR, MAX_OPS, MAX_MATS, MAX_WINS, MAX_WIRES, WIRE_SLOT,
    score, blueNoise, bayer8, pullBack, pushForward, tone, threshold, shade, render, plotter, pack, describe, plateXY, progress, hash32, sessionSeed,
  };
  global.Marble = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
