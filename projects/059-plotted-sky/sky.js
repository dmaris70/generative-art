// 059 — Plotted Sky: an engraver's sky over 048 Plotted Field.
//
// One cloud deck per field, on a horizontal plane `height` metres up. Every view of the field
// looks up at the same deck from its own eye, so neighbouring views agree, as the grass does.
// The deck's pattern is the folded cloud engine (Yohei Nishitsuji's twigl shader, as decomposed in
// 058 Folded Weather) evaluated on the CPU, in double precision, so a sheet is the same file on
// every machine. It is drawn the way engravers ruled skies: horizontal lines, a second set between
// them where the tone deepens, a cross-ruling in the darkest passages. Lit cloud is where the pen
// lifts, as moonlit grass is in 048.
//
// Runs in the browser and in Node. Plugs into PlottedField.build through its `extend` hook.

(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ───────────────────────── weather: the fold constants ─────────────────────────
  // Same seed space as 058: weather 0 is the original shader; weather n is 058's screened seed n.
  const KEPT = [8, 12, 17, 21, 30, 32, 75, 78, 89, 95, 109, 110, 111, 120, 136, 139, 166, 172, 173, 201, 202, 222, 235, 242, 245, 282, 310, 334, 344, 358, 365, 371, 379, 388, 389, 396, 399, 408, 417, 442, 472, 483, 495, 501, 543, 544, 545, 548];
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function weather(n) {
    n = Math.max(0, n | 0);
    if (n === 0) return { off: [0.08, 4, -1], box: [3, 4, 3], aniso: [0.51, 0.51, 0.51], scale: 7.1 };
    const R = mulberry32(KEPT[(n - 1) % KEPT.length] * 7919 + 13);
    const j = (c, a) => c + (R() * 2 - 1) * a;
    const Y = 3.7 + R() * 1.1;
    return { off: [j(0.08, 0.25), Y, j(-1, 0.35)], box: [j(3, 0.3), Y, j(3, 0.3)], aniso: [j(0.51, 0.03), 0.51, j(0.51, 0.03)], scale: j(7.1, 0.3) };
  }

  // ───────────────────────── the engine, on the CPU ─────────────────────────
  // GLSL `v * M` with M = rotate3D(a, axis): each output component is v · (a column of M).
  function cameraColumns(tc) {
    const an = -1.15 - Math.cos(tc * 0.2) * 0.05;
    let ax = 1, ay = 11 + Math.sin(tc) * 0.2, az = -1.5;
    const l = Math.hypot(ax, ay, az); ax /= l; ay /= l; az /= l;
    const s = Math.sin(an), c = Math.cos(an), k = 1 - c;
    return [
      [ax * ax * k + c, ay * ax * k + az * s, az * ax * k - ay * s],
      [ax * ay * k - az * s, ay * ay * k + c, az * ay * k + ax * s],
      [ax * az * k + ay * s, ay * az * k - ax * s, az * az * k + c],
    ];
  }
  // W (density) and S (sky weight) at input point (qx, qy) of the engine's plane.
  function fields(qx, qy, P, C) {
    const [ox, oy, oz] = P.off, [bx, by, bz] = P.box, [nx, ny, nz] = P.aniso, sc = P.scale;
    const [c0, c1, c2] = C;
    const vx = qx, vy = qy + 9;
    let g = 0, e = 0, s = 0, W = 0, S = 0;
    for (let i = 1; i < 99; i++) {
      let px = vx * c0[0] + vy * c0[1] + g * c0[2];
      let py = vx * c1[0] + vy * c1[1] + g * c1[2];
      let pz = vx * c2[0] + vy * c2[1] + g * c2[2];
      s = 2;
      for (let j = 0; j < 19; j++) {
        e = sc / (px * px * nx + py * py * ny + pz * pz * nz);
        s *= e;
        px = ox - Math.abs(Math.abs(px) * e - bx);
        py = oy - Math.abs(Math.abs(py) * e - by);
        pz = oz - Math.abs(Math.abs(pz) * e - bz);
      }
      g += py / s;
      s = Math.log2(s) / Math.exp(e);
      const v = s / 200;
      W += v; S += v * (g * 0.016 - e * 0.3);
    }
    return [W, S];
  }

  // Weathers differ a lot in mean density (058 measured 0.32 to 0.57), so each is levelled: its tone
  // is scaled so a fixed 16 × 16 patch of the deck plane averages TARGET. The patch is the same for
  // every view, so all 25 views of a field get the same gain.
  const TARGET = 0.3, gains = new Map();
  function rawTone(W, S) { return smoothstep(0.04, 0.85, W) + S * 0.25; }
  function levelGain(n, P, C) {
    const key = n + ':' + C[0][0].toFixed(6);
    if (gains.has(key)) return gains.get(key);
    let sum = 0, k = 0;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const [W, S] = fields(-4 + 8 * (i + 0.5) / 16, -5 + 8 * (j + 0.5) / 16, P, C);
      sum += clamp(rawTone(W, S), 0, 1); k++;
    }
    const g = clamp(TARGET / Math.max(0.05, sum / k), 0.5, 1.6);
    gains.set(key, g);
    return g;
  }

  // ───────────────────────── the sky of one view ─────────────────────────
  const DEFAULTS = {
    weather: 0,        // 0 = the original constants; 1…48 = 058's screened seeds
    height: 600,       // m, the cloud deck
    scale: 3.5,        // km of deck per unit of the engine's plane
    drift: 8,          // m/s, the deck moves with the field's wind direction
    reach: 25,         // km: the deck fades from here …
    reachEnd: 40,      // … to here, where the paper is left bare at the horizon
    ruling: 0.75,      // mm between ruled lines
    tone: 1,           // gain on the tone, after each weather is levelled to the same mean
    dither: 0.14,      // spread of each line's threshold along its length (broken, flicked transitions)
    cross: 1,          // 1 = cross-ruling in the darkest passages
    sample: 1.2,       // mm, the grid the engine is evaluated on (interpolated between)
  };
  const THRESH = [0.16, 0.46, 0.76];   // tone at which the main lines, the lines between, the cross-ruling start

  function sky(ctx, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const t0 = Date.now();
    const { frame, F, basis: B, eye: E, grain, mask, world, moon: M } = ctx;
    const inst = ctx.options.instant;
    const P = weather(o.weather);
    const C = cameraColumns(inst * 0.01);                            // a slow sway, set by the instant
    const gain = levelGain(o.weather, P, C) * o.tone;
    const L = o.scale * 1000, H = o.height;
    // the deck drifts downwind; the engine's plane is turned so the wind runs along its x
    const wa = world.windAz + (ctx.options.windTurn || 0) * Math.PI / 180, cw = Math.cos(wa), sw = Math.sin(wa);
    const shift = o.drift * inst;

    // tone at a point on the frame (mm), or -1 where there is no sky (below the horizon)
    function rayTone(x, y, out) {
      const a = (x - frame.w / 2) / F, b = (frame.h / 2 - y) / F;
      let dx = B.f[0] + B.rt[0] * a + B.up[0] * b, dy = B.f[1] + B.rt[1] * a + B.up[1] * b, dz = B.f[2] + B.rt[2] * a + B.up[2] * b;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      if (dy <= 0.004) return -1;
      const t = (H - E[1]) / dy, X = dx * t, Z = dz * t, rho = Math.hypot(X, Z) / 1000;
      const fade = 1 - smoothstep(o.reach, o.reachEnd, rho);
      if (fade <= 0) return 0;
      const wx = E[0] + X, wz = E[2] + Z;
      // across the wind the engine's plane is only sound within about ±6 units (058, measured):
      // beyond, the deck is mirrored back, which far off reads only as more of the same weather
      const u = (wx * cw + wz * sw - shift) / L, v = mirror((-wx * sw + wz * cw) / L - 1, -5.5, 3.5);
      const [W, S] = fields(u, v, P, C);
      let D = clamp(rawTone(W, S) * gain, 0, 1) * fade;
      // the moon clears the deck around it
      const ang = Math.acos(clamp(dx * M[0] + dy * M[1] + dz * M[2], -1, 1));
      D *= 0.3 + 0.7 * smoothstep(0.03, 0.35, ang);
      if (out) out.ang = ang;
      return D;
    }

    // ── the tone grid, over the part of the frame that is sky
    const h = o.sample, GW = Math.ceil(frame.w / h) + 1, GH = Math.ceil(frame.h / h) + 1;
    const grid = new Float64Array(GW * GH).fill(-1);
    let evaluated = 0;
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = Math.min(i * h, frame.w), y = Math.min(j * h, frame.h);
        grid[j * GW + i] = rayTone(x, y);
        if (grid[j * GW + i] > 0) evaluated++;
      }
    }
    function tone(x, y) {
      const fx = clamp(x / h, 0, GW - 1.0001), fy = clamp(y / h, 0, GH - 1.0001);
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const a = grid[j * GW + i], b = grid[j * GW + i + 1], c = grid[(j + 1) * GW + i], d = grid[(j + 1) * GW + i + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) return -1;                // at or below the horizon: no lines
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }

    // ── ruled lines: runs where the tone passes the line's threshold and nothing is in front
    const strokes = [];
    let ink = 0;
    const step = 0.25, minRun = 0.8;
    let lineNo = 0;
    function rule(x0, y0, dx, dy, len, thr) {
      const id = ++lineNo, cell = 0.9;                  // the threshold wavers every 0.9 mm along the line
      let run = null, rl = 0;
      const flush = () => { if (run && rl >= minRun) { strokes.push(run.map((v, k) => v + (k % 2 ? frame.y : frame.x))); ink += rl; } run = null; rl = 0; };
      const n = Math.ceil(len / step);
      for (let k = 0; k <= n; k++) {
        const x = x0 + dx * k * step, y = y0 + dy * k * step;
        const inFrame = x >= 0 && y >= 0 && x <= frame.w && y <= frame.h;
        const th = thr + (h01(id, Math.floor(k * step / cell)) - 0.5) * o.dither;
        const on = inFrame && tone(x, y) > th && mask.seen(x / grain, y / grain);
        if (on) {
          if (!run) run = [x, y];
          else { run.length = Math.min(run.length, 2); run.push(x, y); rl = Math.hypot(x - run[0], y - run[1]); }
        } else flush();
      }
      flush();
    }
    const sp = o.ruling;
    for (let k = 0, y = sp / 2; y < frame.h; k++, y += sp) rule(0, y, 1, 0, frame.w, THRESH[0]);
    for (let y = sp; y < frame.h; y += sp) rule(0, y, 1, 0, frame.w, THRESH[1]);
    if (o.cross) {
      // cross-ruling at 28°, the same spacing measured across the lines
      const an = 28 * Math.PI / 180, ux = Math.cos(an), uy = -Math.sin(an), nx = -uy, ny = ux;
      const diag = Math.hypot(frame.w, frame.h), gap = sp * 1.5;
      for (let d = -diag; d < diag; d += gap) {
        const cx = frame.w / 2 + nx * d, cy = frame.h / 2 + ny * d;
        rule(cx - ux * diag / 2, cy - uy * diag / 2, ux, uy, diag, THRESH[2]);
      }
    }

    // ── the moon, if it is in the sky and not behind the grass: a ring, the deck cleared around it
    const moonStrokes = [];
    const mz = M[0] * B.f[0] + M[1] * B.f[1] + M[2] * B.f[2];
    if (mz > 0) {
      const mx = frame.w / 2 + F * (M[0] * B.rt[0] + M[1] * B.rt[1] + M[2] * B.rt[2]) / mz;
      const my = frame.h / 2 - F * (M[0] * B.up[0] + M[1] * B.up[1] + M[2] * B.up[2]) / mz;
      const r = Math.max(2.2, F * Math.tan(0.0045) * 2.5);           // the moon's half-degree, drawn 2.5× large
      if (mx > r && my > r && mx < frame.w - r && my < frame.h - r && M[1] > 0 && mask.seen(mx / grain, my / grain)) {
        const ring = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; ring.push(mx + Math.cos(a) * r + frame.x, my + Math.sin(a) * r + frame.y); }
        moonStrokes.push(ring);
        // clear the ruling inside the ring and a little beyond: drop stroke points within 1.6 r
        const cut = (s) => {
          const out = []; let cur = [];
          for (let k = 0; k < s.length; k += 2) {
            const inside = Math.hypot(s[k] - frame.x - mx, s[k + 1] - frame.y - my) < r * 1.6;
            if (inside) { if (cur.length >= 4) out.push(cur); cur = []; } else cur.push(s[k], s[k + 1]);
          }
          if (cur.length >= 4) out.push(cur);
          return out;
        };
        const kept = strokes.flatMap((s) => cut(densify(s, 0.5)));
        strokes.length = 0; strokes.push(...kept);
      }
    }

    const all = strokes.concat(moonStrokes);
    return {
      title: 'PLOTTED SKY',
      layers: [{ id: 'sky', label: '3 sky', pen: 1, strokes: all }],
      stats: { skyGain: +gain.toFixed(3), skyStrokes: all.length, skyInk: ink / 1000, skySamples: evaluated, skyMs: Date.now() - t0, moon: moonStrokes.length > 0 },
      caption: ['SKY: WEATHER ' + o.weather + ' - DECK ' + o.height + ' M UP - ' + all.length + ' RULED STROKES - ' + (ink / 1000).toFixed(0) + ' M OF LINE'],
    };
  }
  function mirror(v, lo, hi) {
    const span = hi - lo; let t = (v - lo) / span;
    t -= 2 * Math.floor(t / 2);
    return lo + span * (t < 1 ? t : 2 - t);
  }
  // integer hash → [0, 1)
  function h01(a, b) {
    let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  }
  // a two-point run becomes evenly spaced points, so the moon can cut it
  function densify(s, d) {
    if (s.length !== 4) return s;
    const [x0, y0, x1, y1] = s, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / d)), out = [];
    for (let k = 0; k <= n; k++) out.push(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
    return out;
  }

  // PlottedField.build options with the sky attached
  function withSky(fieldOptions, skyOptions) {
    return Object.assign({}, fieldOptions, { extend: (ctx) => sky(ctx, skyOptions) });
  }

  const api = { sky, withSky, weather, fields, cameraColumns, DEFAULTS, KEPT };
  global.PlottedSky = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
