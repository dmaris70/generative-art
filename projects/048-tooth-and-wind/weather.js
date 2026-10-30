// 048 — Tooth and Wind: the engine.
//
// Not strokes drawn on a canvas but a sheet simulated under them. The paper has a height map
// (its tooth); three fields lie on it — charcoal, chalk, and the tooth itself, which an
// eraser burnishes flat. Every mark is a stick, a finger, an eraser or a lump of chalk moved
// across that sheet one footprint at a time:
//
//   charcoal  catches on the peaks of the tooth first; pressure decides how far into the
//             valleys it reaches, so a light stroke breaks into grain and a hard one fills
//   chalk     the same, in white, and it partly buries the charcoal under it
//   finger    carries a load: it lifts what it passes over and lays it down further on, so
//             a smudge is pigment moved, not pigment added — and it fills valleys evenly
//   eraser    lifts pigment and polishes the tooth, so a mark later drawn over an erasure
//             takes less: every erasure leaves a ghost in the paper itself
//
// A wind field (seeded Perlin, slowly turning, crossed by gusts) bends every gesture still
// being drawn. Hands are spawned around drifting "stands"; when the sheet fills, an eraser
// sweeps a region back and the drawing grows again over its own ghosts. It never repeats and
// never finishes.

(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Improved Perlin noise, 3D, seeded. Range ≈ [-1, 1].
  function makeNoise(rand) {
    const p = new Uint8Array(512), q = [];
    for (let i = 0; i < 256; i++) q[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = q[i]; q[i] = q[j]; q[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = q[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    function grad(h, x, y, z) {
      const hh = h & 15, u = hh < 8 ? x : y, v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
      return ((hh & 1) ? -u : u) + ((hh & 2) ? -v : v);
    }
    return function (x, y, z) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
        w);
    };
  }

  const GROUNDS = {
    // paper, charcoal, chalk — rgb
    bone: { paper: [236, 234, 227], ink: [24, 23, 26], chalk: [252, 251, 247], invert: false },
    toned: { paper: [158, 160, 158], ink: [20, 20, 23], chalk: [246, 245, 238], invert: false },
    night: { paper: [236, 234, 227], ink: [24, 23, 26], chalk: [252, 251, 247], invert: true },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let o = Object.assign({}, opts);
    let W, H, N, u, T, C, K, img, buf32, rand, noise, R;
    let hands, stands, gusts, push, frame, t, accSpawn, lastSweep, stats, finger, paused = false;

    // ---------- the sheet ----------
    function size() {
      const vw = canvas.clientWidth || global.innerWidth, vh = canvas.clientHeight || global.innerHeight;
      const k = Math.min(1, Math.sqrt(1.35e6 / (vw * vh)));   // cap the field at ~1.35 Mpx
      W = Math.max(64, Math.round(vw * k)); H = Math.max(64, Math.round(vh * k)); N = W * H;
      canvas.width = W; canvas.height = H;
      u = Math.min(W, H) / 900;
    }

    function makeTooth() {
      T = new Float32Array(N);
      const s = Math.max(1, u);
      const oct = (cell, amp) => {
        const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, g = new Float32Array(gw * gh);
        for (let i = 0; i < g.length; i++) g[i] = rand();
        for (let y = 0; y < H; y++) {
          const gy = y / cell, iy = gy | 0; let fy = gy - iy; fy = fy * fy * (3 - 2 * fy);
          const r0 = iy * gw, r1 = r0 + gw;
          for (let x = 0; x < W; x++) {
            const gx = x / cell, ix = gx | 0; let fx = gx - ix; fx = fx * fx * (3 - 2 * fx);
            const a = g[r0 + ix] + (g[r0 + ix + 1] - g[r0 + ix]) * fx;
            const b = g[r1 + ix] + (g[r1 + ix + 1] - g[r1 + ix]) * fx;
            T[y * W + x] += amp * (a + (b - a) * fy);
          }
        }
      };
      for (let i = 0; i < N; i++) T[i] = 0.3 * rand();   // the fibre: no cell, so no screen
      oct(2.3 * s, 0.34); oct(5.1 * s, 0.26); oct(15 * s, 0.13);
      // laid lines: the faint horizontal ribbing of a mould-made sheet
      const lp = 3.4 * s, ph = rand() * TAU;
      for (let y = 0; y < H; y++) {
        const l = 0.035 * Math.sin((y / lp) * TAU + ph + 0.6 * noise(y * 0.01, 3.1, 0));
        for (let x = 0, i = y * W; x < W; x++, i++) T[i] += l;
      }
      let m = 0, v = 0;
      for (let i = 0; i < N; i++) m += T[i];
      m /= N;
      for (let i = 0; i < N; i++) v += (T[i] - m) * (T[i] - m);
      const sd = Math.sqrt(v / N) || 1;
      for (let i = 0; i < N; i++) T[i] = clamp(0.5 + (T[i] - m) / (sd * 3.4), 0, 1);
    }

    // ---------- tools: one footprint each ----------
    function bbox(x, y, r) {
      return [Math.max(0, Math.floor(x - r)), Math.min(W - 1, Math.ceil(x + r)), Math.max(0, Math.floor(y - r)), Math.min(H - 1, Math.ceil(y + r))];
    }

    // stick of charcoal (or chalk, into K). ell > 1 = the stick laid on its side: the
    // footprint is narrow along the stroke and broad across it; tab = the grit of that edge,
    // which pulls the stroke into parallel striations.
    function stick(F, x, y, r, p, ang, ell, tab, hard, cover) {
      if (r < 0.35 || p <= 0) return;
      const [x0, x1, y0, y1] = bbox(x, y, r);
      const c = Math.cos(ang), s = Math.sin(ang), ir2 = 1 / (r * r), e2 = ell * ell, g = o.grain;
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, a1 = dx * c + dy * s, b1 = -dx * s + dy * c;
          const d2 = (a1 * a1 * e2 + b1 * b1) * ir2;
          if (d2 >= 1) continue;
          let q = p * (1 - d2 * d2);
          if (tab) q *= tab[((b1 + 4096) * 0.8) & 63];
          const a = q - (1 - T[i]) * g;
          if (a <= 0) continue;
          const v = F[i];
          F[i] = v + a * hard * (1 - v);
          if (cover) C[i] *= 1 - a * hard * 0.7;
        }
      }
    }

    function erase(x, y, r, e) {
      const [x0, x1, y0, y1] = bbox(x, y, r), ir2 = 1 / (r * r);
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
          if (d2 >= 1) continue;
          const f = Math.min(1, (1 - d2) * 3) * e;   // a kneaded eraser: crisp edge
          C[i] *= 1 - f; K[i] *= 1 - f * 0.5;
          T[i] = Math.max(0.12, T[i] - 0.035 * f);    // burnish: the ghost is in the paper
        }
      }
    }

    // finger: lays down its load and picks up what is under it
    function smudge(st, x, y, r, k) {
      const [x0, x1, y0, y1] = bbox(x, y, r), ir2 = 1 / (r * r);
      let sc = 0, sk = 0, sw = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
          if (d2 >= 1) continue;
          const f = (1 - d2) * (1 - d2), w = f * k;
          const c = C[i], kk = K[i];
          sc += c * f; sk += kk * f; sw += f;
          C[i] = c + (st.lc - c) * w * (0.75 + 0.5 * T[i] * (1 - c));
          K[i] = kk + (st.lk - kk) * w * 0.8;
        }
      }
      if (sw > 0) {
        const pick = 0.3;
        st.lc = (st.lc * (1 - pick) + (sc / sw) * pick) * 0.996;
        st.lk = (st.lk * (1 - pick) + (sk / sw) * pick) * 0.996;
      }
    }

    // ---------- the wind ----------
    function wind(x, y) {
      const z = t * 0.06;
      const n1 = noise(x * 0.0016 / u, y * 0.0016 / u, z), n2 = noise(x * 0.0021 / u + 40, y * 0.0021 / u, z + 9);
      const ang = R.windAng + 0.85 * n1 + 0.25 * Math.sin(t * 0.021);
      let m = o.wind * (0.55 + 0.45 * n2) * (0.75 + 0.25 * Math.sin(t * 0.13 + R.phase));
      let wx = Math.cos(ang) * m, wy = Math.sin(ang) * m;
      for (const g of gusts) {
        const pr = (x - g.ox) * g.cx + (y - g.oy) * g.cy;            // distance along the gust
        const d = (pr - g.front) / g.width;
        const k = g.strength * Math.exp(-d * d) * g.env;
        wx += g.cx * k; wy += g.cy * k;
      }
      if (push && push.life > 0) {
        const dx = x - push.x, dy = y - push.y, rr = 260 * u;
        const k = Math.exp(-(dx * dx + dy * dy) / (rr * rr)) * push.life;
        wx += push.vx * k; wy += push.vy * k;
      }
      return [wx, wy];
    }

    // ---------- a hand: one gesture, advanced a few footprints a frame ----------
    // tool: 'char' | 'chalk' | 'finger' | 'erase'
    function Hand(h) {
      this.x = h.x; this.y = h.y; this.a = h.a;
      this.len = h.len; this.r = h.r; this.p = h.p == null ? 0.8 : h.p;
      this.tool = h.tool || 'char';
      this.speed = h.speed || 6; this.bend = h.bend || 0; this.curl = h.curl || 0;
      this.brk = h.brk || 0; this.tin = h.tin == null ? 0.08 : h.tin; this.tout = h.tout == null ? 0.3 : h.tout;
      this.rtaper = h.rtaper == null ? 0.6 : h.rtaper;
      this.ell = h.ell || 1; this.hard = h.hard || 0.28; this.k = h.k || 0.3; this.e = h.e || 0.4;
      this.a0 = h.a; this.dev = h.dev || 1.1;   // how far the wind may turn a gesture off its first heading
      this.delay = h.delay || 0; this.onStep = h.onStep || null; this.s = 0;
      this.nz = rand() * 100; this.lc = 0; this.lk = 0;
      this.tab = null;
      if (h.streak) {
        this.tab = new Float32Array(64);
        for (let i = 0; i < 64; i++) this.tab[i] = 1 - h.streak * 0.75 + h.streak * 0.75 * Math.pow(rand(), 0.6) * 1.35;
      }
      if (this.tool === 'finger') {   // the finger starts loaded with what is under it
        const i = (clamp(this.y | 0, 0, H - 1)) * W + clamp(this.x | 0, 0, W - 1);
        this.lc = C[i]; this.lk = K[i];
      }
    }
    Hand.prototype.step = function () {
      if (this.delay > 0) { this.delay--; return true; }
      const n = Math.max(1, Math.round(this.speed * o.pace));
      for (let j = 0; j < n; j++) {
        const t01 = this.s / this.len;
        if (t01 >= 1) return false;
        const env = Math.min(1, t01 / Math.max(1e-3, this.tin)) * Math.min(1, (1 - t01) / Math.max(1e-3, this.tout));
        const shp = env * env * (3 - 2 * env);
        const r = this.r * (1 - this.rtaper + this.rtaper * shp);
        let p = this.p * (0.25 + 0.75 * shp);
        if (this.brk) {   // the dry break: pressure drops out where the stick skips
          const b = noise(this.nz, this.s * 0.045 / u, 0.5) + 0.45 * noise(this.nz + 7, this.s * 0.19 / u, 0.5);
          p *= clamp((b + 1.05 - 1.9 * this.brk) * 2.2, 0, 1.15);
        }
        const tl = this.tool;
        if (tl === 'char') stick(C, this.x, this.y, r, p, this.a, this.ell, this.tab, this.hard, false);
        else if (tl === 'chalk') stick(K, this.x, this.y, r, p, this.a, this.ell, this.tab, this.hard, true);
        else if (tl === 'finger') smudge(this, this.x, this.y, r, this.k * (0.3 + 0.7 * shp) * o.smudge);
        else erase(this.x, this.y, r, this.e * shp);
        // advance, bending toward the wind and curling on the hand's own noise
        const ds = Math.max(0.5, r * (this.ell > 1 ? 0.3 : 0.42));
        this.s += ds;
        let dx = Math.cos(this.a), dy = Math.sin(this.a);
        if (this.bend) { const w = wind(this.x, this.y); dx += w[0] * this.bend * 0.012 * ds; dy += w[1] * this.bend * 0.012 * ds; }
        let a = Math.atan2(dy, dx);
        let da = a - this.a0; da -= Math.round(da / TAU) * TAU;
        if (da > this.dev) a = this.a0 + this.dev; else if (da < -this.dev) a = this.a0 - this.dev;
        if (this.curl) a += this.curl * noise(this.nz + 3, this.s * 0.012 / u, 1.7) * 0.04 * ds / Math.max(1, u);
        this.a = a;
        this.x += Math.cos(a) * ds; this.y += Math.sin(a) * ds;
        if (this.onStep) this.onStep(this, t01);
      }
      return true;
    };

    const add = (h) => { if (hands.length < 260) hands.push(new Hand(h)); };
    const rr = (a, b) => a + (b - a) * rand();
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const UP = -Math.PI / 2;
    const isToned = () => o.ground !== 'bone';

    // ---------- the grammars, read off the drawing ----------

    // a tapered dab: heavy where the stick lands, flicked off to a point
    function flick(x, y, a, len, r, delay) {
      add({ x, y, a, len, r, p: rr(0.95, 1.3), tin: 0.02, tout: 0.9, rtaper: 0.92, hard: 0.42, speed: 3, delay, brk: rand() < 0.3 ? 0.2 : 0 });
    }

    // a stalk: a long thin dry line from the ground, leaning with the wind, shedding leaves
    function stalk(x, y, a, len, delay) {
      const leaf = rand() < 0.45 ? 0 : rr(0.0008, 0.005) / u, side = rand() < 0.5 ? -1 : 1;
      add({
        x, y, a, len, r: u * rr(0.7, 2.3), p: rr(0.6, 1.05), brk: rr(0.25, 0.65), bend: rr(0.3, 0.9), curl: rr(0.2, 1), dev: rr(0.35, 0.8),
        tin: 0.04, tout: rr(0.15, 0.4), rtaper: 0.5, speed: rr(6, 11), hard: 0.34, delay,
        onStep(hd, k) {
          if (k > 0.15 && rand() < leaf) {
            const sd = rand() < 0.7 ? side : -side;
            flick(hd.x, hd.y, hd.a + sd * rr(0.3, 0.85), u * rr(10, 42) * (1.2 - k * 0.6), u * rr(1.4, 3.4), 0);
          }
          if (k > 0.9 && rand() < 0.02) splatter(hd.x, hd.y, hd.a, 0.4);
        },
      });
    }

    // a tuft: stalks fanned from one root
    function tuft(st) {
      const n = Math.round(rr(2, 6)), bx = st.x + rr(-1, 1) * st.w * 0.4, by = Math.min(H * 1.08, st.y + rr(0.05, 0.35) * H);
      for (let i = 0; i < n; i++) {
        const a = UP + st.fan + rr(-0.55, 0.55) * st.spread;
        stalk(bx + rr(-8, 8) * u, by, a, H * rr(0.18, 0.75), i * Math.round(rr(2, 9)));
      }
    }

    // a plume: the flame-shaped grey masses — side-of-the-stick scumble driven up to jagged
    // points, smudged to an even tone, lit from within by the eraser, edged in black
    function plume(st) {
      const bx = st.x + rr(-0.5, 0.5) * st.w, by = st.y + rr(-0.05, 0.12) * H;
      const h = H * rr(0.18, 0.5), w0 = h * rr(0.2, 0.45), a0 = UP + st.fan * 0.6 + rr(-0.25, 0.25);
      const ca = Math.cos(a0), sa = Math.sin(a0), px = -sa, py = ca;
      const spine = (k) => [bx + ca * h * k, by + sa * h * k];
      const width = (k) => w0 * Math.pow(1 - k, 0.75) * (0.75 + 0.25 * Math.sin(k * 23 + bx));
      const n = Math.round(rr(18, 34) * o.mass);
      let d = 0;
      for (let i = 0; i < n; i++, d += Math.round(rr(0, 3))) {
        const k0 = Math.pow(rand(), 1.4) * 0.6, off = rr(-1, 1) * width(k0);
        const [sx, sy] = spine(k0);
        add({
          x: sx + px * off, y: sy + py * off, a: a0 - (off / Math.max(1, width(k0))) * 0.14 + rr(-0.1, 0.1),
          len: h * rr(0.25, 0.95) * (1 - k0), r: u * rr(4, 9), p: rr(0.55, 0.9), ell: rr(2, 3.5), streak: rr(0.4, 0.9),
          tin: 0.1, tout: 0.55, rtaper: 0.85, bend: 0.25, brk: 0.12, hard: 0.3, speed: 5, delay: d,
        });
      }
      for (let i = 0, m = Math.round(rr(2, 6)); i < m; i++) {   // the spikes
        const k0 = rr(0.25, 0.65), [sx, sy] = spine(k0), off = rr(-0.8, 0.8) * width(k0);
        add({
          x: sx + px * off, y: sy + py * off, a: a0 + rr(-0.3, 0.3), len: h * rr(0.3, 0.6), r: u * rr(2.5, 4.5), p: rr(0.7, 1),
          ell: 2, streak: 0.6, tin: 0.05, tout: 0.95, rtaper: 0.95, hard: 0.3, speed: 5, delay: d + Math.round(rr(0, 15)), bend: 0.4,
        });
      }
      d += 26;
      for (let i = 0, m = Math.round(rr(3, 8)); i < m; i++) {   // the finger
        const k0 = rr(0, 0.35), [sx, sy] = spine(k0), off = rr(-0.6, 0.6) * width(k0);
        add({
          tool: 'finger', x: sx + px * off, y: sy + py * off, a: a0 + rr(-0.12, 0.12), len: h * rr(0.3, 0.8),
          r: u * rr(7, 14), k: rr(0.25, 0.45), tin: 0.15, tout: 0.4, rtaper: 0.4, speed: 4, delay: d + i * 6,
        });
      }
      d += 40;
      for (let i = 0, m = Math.round(rr(1, 5)); i < m; i++) {   // lights drawn out with the eraser (and chalk on a toned sheet)
        const k0 = rr(0.05, 0.5), [sx, sy] = spine(k0), off = rr(-0.5, 0.5) * width(k0);
        const hh = { x: sx + px * off, y: sy + py * off, a: a0 + rr(-0.2, 0.2), len: h * rr(0.15, 0.5), tin: 0.1, tout: 0.6, speed: 5, delay: d + i * 5 };
        add(Object.assign({ tool: 'erase', r: u * rr(1.5, 3.5), e: rr(0.3, 0.6) }, hh));
        if (isToned() && rand() < 0.7) add(Object.assign({ tool: 'chalk', r: u * rr(1.2, 2.6), p: rr(0.5, 0.85), brk: 0.35, hard: 0.3 }, hh, { delay: hh.delay + 8 }));
      }
      d += 20;
      const edge = rand() < 0.5 ? -1 : 1;
      for (let i = 0, m = Math.round(rr(1, 5)); i < m; i++) {   // the black edge
        const k0 = rr(0, 0.5), [sx, sy] = spine(k0), off = edge * width(k0) * rr(0.6, 1.05);
        add({
          x: sx + px * off, y: sy + py * off, a: a0 - edge * rr(0.05, 0.25), len: h * rr(0.2, 0.6) * (1 - k0), r: u * rr(1, 2.2),
          p: rr(0.9, 1.25), brk: rr(0.4, 0.7), tin: 0.03, tout: 0.7, rtaper: 0.8, hard: 0.4, speed: 6, delay: d + i * 4, bend: 0.5,
          onStep(hd) { if (rand() < 0.012 / u) flick(hd.x, hd.y, hd.a + rr(-0.6, 0.6), u * rr(5, 18), u * rr(1, 2.2), 0); },
        });
      }
    }

    // hatching: a handful of near-parallel scumbled strokes
    function hatch(x, y) {
      const w = wind(x, y), wa = Math.atan2(w[1], w[0]);
      const a = rand() < 0.6 ? UP + (Math.cos(wa) > 0 ? 1 : -1) * rr(0.25, 0.75) : wa + rr(-0.3, 0.3);
      const n = Math.round(rr(4, 13)), gap = u * rr(2.5, 7), px = -Math.sin(a), py = Math.cos(a), len = u * rr(40, 170);
      for (let i = 0; i < n; i++) {
        const off = (i - n / 2) * gap * rr(0.6, 1.4);
        add({
          x: x + px * off + rr(-6, 6) * u, y: y + py * off + rr(-6, 6) * u, a: a + rr(-0.06, 0.06), len: len * rr(0.6, 1.2),
          r: u * rr(0.6, 1.5), p: rr(0.3, 0.65), brk: rr(0.3, 0.6), tin: 0.08, tout: 0.35, hard: 0.26, speed: 8, delay: i * 3, bend: 0.3,
        });
      }
    }

    // a splatter: the stick struck against the sheet, dabs thrown down the wind
    function splatter(x, y, a, amt) {
      const n = Math.round(rr(4, 16) * (amt == null ? 1 : amt));
      for (let i = 0; i < n; i++) {
        const aa = a + rr(-0.55, 0.55), dd = u * rr(0, 50);
        flick(x + Math.cos(aa) * dd, y + Math.sin(aa) * dd, aa + rr(-0.25, 0.25), u * rr(3, 26), u * rr(0.8, 2.6), Math.round(rr(0, 10)));
      }
    }

    // a long line: the reed that crosses the whole sheet
    function longLine() {
      const fromLeft = rand() < 0.5, w = wind(W / 2, H / 2), lean = Math.atan2(w[1], w[0]);
      const x = fromLeft ? rr(-0.05, 0.5) * W : rr(0.5, 1.05) * W;
      const a = UP + (Math.cos(lean) >= 0 ? 1 : -1) * rr(0.15, 0.65);
      stalk(x, H * rr(0.95, 1.1), a, H * rr(0.7, 1.2), 0);
    }

    // a gust: a front crossing the sheet; it smears along itself and throws dabs
    function gust() {
      const a = R.windAng + rr(-0.4, 0.4), cx = Math.cos(a), cy = Math.sin(a);
      const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => x * cx + y * cy);
      const lo = Math.min.apply(null, corners), hi = Math.max.apply(null, corners);
      gusts.push({ ox: 0, oy: 0, cx, cy, front: lo - 200 * u, end: hi + 200 * u, v: rr(4, 9) * u, width: rr(90, 220) * u,
        strength: o.wind * rr(2, 4) + rr(0.5, 1.5), env: 0 });
      stats.gusts++;
    }
    function gustTick(g) {
      g.front += g.v * o.pace;
      g.env = Math.min(1, g.env + 0.04);
      // positions on the front line inside the sheet
      const qx = -g.cy, qy = g.cx;
      for (let j = 0; j < 2; j++) {
        if (rand() > 0.35 * o.gust + 0.12) continue;
        const sidePos = rr(-1, 1) * Math.hypot(W, H) * 0.6;
        const x = g.cx * g.front + qx * sidePos, y = g.cy * g.front + qy * sidePos;
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        const i = clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1);
        const ga = Math.atan2(g.cy, g.cx);
        if (C[i] > 0.05 && rand() < 0.75)
          add({ tool: 'finger', x, y, a: ga + rr(-0.15, 0.15), len: u * rr(40, 170), r: u * rr(5, 11), k: rr(0.18, 0.35), tin: 0.1, tout: 0.5, speed: 7, bend: 0.6 });
        else if (rand() < 0.4) splatter(x, y, ga, 0.6);
        else if (rand() < 0.5) add({ tool: isToned() ? 'chalk' : 'erase', x, y, a: ga + rr(-0.1, 0.1), len: u * rr(30, 120), r: u * rr(1, 2.4), e: 0.35, p: 0.55, brk: 0.5, speed: 8, hard: 0.25 });
      }
      return g.front < g.end;
    }

    // the sweep: when the sheet fills, an eraser takes a region back
    function sweep(cx, cy) {
      const reg = Math.min(W, H) * rr(0.25, 0.55), a = rr(-0.9, -0.3) + (rand() < 0.5 ? 0 : -Math.PI / 2 + 0.6);
      const n = Math.round(rr(4, 9)), px = -Math.sin(a), py = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const off = (i / (n - 1) - 0.5) * reg * 1.3 + rr(-10, 10) * u, back = rr(0.5, 0.65) * reg;
        add({ tool: 'erase', x: cx + px * off - Math.cos(a) * back, y: cy + py * off - Math.sin(a) * back, a: a + rr(-0.15, 0.15),
          len: reg * rr(0.9, 1.4), r: u * rr(12, 26), e: rr(0.4, 0.62) * o.erase, tin: 0.08, tout: 0.25, rtaper: 0.3, speed: 5, delay: i * 9 });
        if (rand() < 0.5)
          add({ tool: 'finger', x: cx + px * off, y: cy + py * off, a: a + Math.PI + rr(-0.2, 0.2), len: reg * rr(0.4, 0.8), r: u * rr(10, 18), k: 0.3, speed: 5, delay: i * 9 + 30 });
      }
      stats.sweeps++;
    }

    // ---------- stands: where the hands return ----------
    function newStand() {
      return {
        x: rr(0.06, 0.94) * W, y: rr(0.35, 0.82) * H, w: rr(0.06, 0.2) * W, fan: rr(-0.45, 0.45), spread: rr(0.5, 1.3),
        life: Math.round(rr(600, 2200)), nz: rand() * 50,
        mix: { tuft: rr(0.2, 1), plume: rr(0.25, 1), hatch: rr(0.1, 0.6), splat: rr(0, 0.25) },
      };
    }

    function spawnOne() {
      const r0 = rand();
      if (r0 < 0.06) return longLine();
      if (r0 < 0.12) return hatch(rr(0, 1) * W, rr(0.05, 0.95) * H);
      const st = pick(stands), m = st.mix, tot = m.tuft + m.plume + m.hatch + m.splat;
      let q = rand() * tot;
      if ((q -= m.tuft) < 0) return tuft(st);
      if ((q -= m.plume) < 0) return plume(st);
      if ((q -= m.hatch) < 0) return hatch(st.x + rr(-1, 1) * st.w, st.y + rr(-0.25, 0.15) * H);
      const w = wind(st.x, st.y);
      splatter(st.x + rr(-1, 1) * st.w, st.y + rr(-0.3, 0.1) * H, Math.atan2(w[1], w[0]) + rr(-0.5, 0.5));
    }

    function coverage() {
      let s = 0;
      const n = 3000;
      for (let j = 0; j < n; j++) s += C[(rand() * N) | 0];
      return s / n;
    }

    // ---------- render ----------
    function render() {
      const G = GROUNDS[o.ground] || GROUNDS.bone;
      const [pr, pg, pb] = G.paper, [ir, ig, ib] = G.ink, [cr, cg, cb] = G.chalk, inv = G.invert;
      const d = buf32;
      for (let i = 0; i < N; i++) {
        const tt = 0.94 + 0.06 * T[i];
        let r = pr * tt, g = pg * tt, b = pb * tt;
        const c = C[i];
        if (c > 0.002) { const a = c > 1 ? 1 : c; r += (ir - r) * a; g += (ig - g) * a; b += (ib - b) * a; }
        const k = K[i];
        if (k > 0.002) { const a = k > 1 ? 1 : k; r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a; }
        if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
        d[i] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
      }
      ctx.putImageData(img, 0, 0);
    }

    // ---------- lifecycle ----------
    function reset() {
      size();
      rand = mulberry32(o.seed >>> 0);
      noise = makeNoise(rand);
      R = { windAng: rr(-0.5, 0.5) + (rand() < 0.5 ? 0 : Math.PI), phase: rr(0, TAU), breathP: rr(500, 1100) };
      C = new Float32Array(N); K = new Float32Array(N);
      makeTooth();
      img = ctx.createImageData(W, H);
      buf32 = new Uint32Array(img.data.buffer);
      hands = []; gusts = []; stands = []; push = null; frame = 0; t = 0; accSpawn = 0.6; lastSweep = -1e9;
      stats = { gusts: 0, sweeps: 0, cov: 0 };
      finger = { lc: 0, lk: 0, x: 0, y: 0 };
      for (let i = 0, n = Math.round(rr(2, 5)); i < n; i++) stands.push(newStand());
      // open with one reed already laid across the sheet, so the first frame is not empty
      longLine();
      render();
    }

    function tick() {
      if (paused) return;
      frame++; t += o.pace;
      // the hands
      for (let i = hands.length - 1; i >= 0; i--) if (!hands[i].step()) hands.splice(i, 1);
      // the wind
      for (let i = gusts.length - 1; i >= 0; i--) if (!gustTick(gusts[i])) gusts.splice(i, 1);
      if (push) { push.life *= 0.94; if (push.life < 0.02) push = null; }
      if (o.gust > 0 && rand() < (o.gust * o.pace) / 900 && gusts.length < 2) gust();
      // the stands drift and are replaced
      for (let i = 0; i < stands.length; i++) {
        const s = stands[i];
        s.x += noise(s.nz, t * 0.004, 0) * 0.6 * u * o.pace;
        s.fan = clamp(s.fan + noise(s.nz + 4, t * 0.004, 0) * 0.002, -0.7, 0.7);
        if ((s.life -= o.pace) <= 0) stands[i] = newStand();
      }
      // new gestures, on a slow breath
      const breath = 0.5 + 0.5 * Math.sin((t / R.breathP) * TAU + R.phase);
      accSpawn += (o.density / 60) * (0.25 + 0.95 * breath) * o.pace;
      while (accSpawn >= 1) { accSpawn -= 1; if (hands.length < 180) spawnOne(); }
      // the palimpsest
      if (frame % 40 === 0) {
        stats.cov = coverage();
        if (stats.cov > o.fill && t - lastSweep > 600) {
          lastSweep = t;
          // erase where it is darkest: probe a few sites
          let best = null, bv = -1;
          for (let j = 0; j < 12; j++) {
            const x = rr(0.15, 0.85) * W, y = rr(0.15, 0.85) * H;
            let v = 0;
            for (let q = 0; q < 40; q++) v += C[clamp((y + rr(-1, 1) * 0.12 * H) | 0, 0, H - 1) * W + clamp((x + rr(-1, 1) * 0.12 * W) | 0, 0, W - 1)];
            if (v > bv) { bv = v; best = [x, y]; }
          }
          sweep(best[0], best[1]);
        }
      }
      render();
    }

    // the visitor's finger: dragging smears the sheet and blows the wind
    function drag(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L < 0.5) return;
      const r = 11 * u, ds = r * 0.35;
      for (let s = 0; s <= L; s += ds) smudge(finger, x0 + (dx * s) / L, y0 + (dy * s) / L, r, 0.35 * Math.max(0.3, o.smudge));
      push = { x: x1, y: y1, vx: (dx / L) * Math.min(6, L * 0.4), vy: (dy / L) * Math.min(6, L * 0.4), life: 1 };
    }
    function touch(x, y) {
      const i = clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1);
      finger.lc = C[i]; finger.lk = K[i];
    }

    reset();

    return {
      tick, reset, render,
      setOptions(n) { o = Object.assign(o, n); },
      toSheet(cx, cy) { const b = canvas.getBoundingClientRect(); return [((cx - b.left) / b.width) * W, ((cy - b.top) / b.height) * H]; },
      drag, touch,
      gust() { gust(); },
      sweep() { sweep(rr(0.25, 0.75) * W, rr(0.25, 0.75) * H); },
      splatter(x, y) { const w = wind(x, y); splatter(x, y, Math.atan2(w[1], w[0])); },
      pause(v) { paused = v == null ? !paused : v; return paused; },
      status() {
        const w = wind(W / 2, H / 2);
        return { hands: hands.length, gusting: gusts.length > 0, cov: stats.cov, sweeps: stats.sweeps, gusts: stats.gusts,
          windDeg: Math.round((Math.atan2(w[1], w[0]) * 180) / Math.PI), windMag: Math.hypot(w[0], w[1]), paused };
      },
      canvas,
    };
  }

  global.Weather = { create, GROUNDS };
})(window);
