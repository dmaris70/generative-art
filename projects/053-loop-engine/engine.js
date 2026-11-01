// Loop Engine — a seeded, looping, pixel-grid scene renderer + a dependency-free GIF encoder.
//
// The scene: two-sided cards spinning in 3D, and streams of metaball "ink" that orbit them,
// shedding specks. Everything is a function of loop phase t ∈ [0,1) built only from integer
// frequencies, so frame N wraps exactly onto frame 0 — every GIF is a seamless loop.
// Rendering is a tiny software rasterizer on a coarse grid (exact ray–plane intersection for
// cards, a compact-kernel scalar field for streams, a shared z-buffer for occlusion), output as
// palette indices — which is also exactly what a GIF stores, so no colour quantization is needed.
//
// No DOM, no p5: the same file runs in the browser (window.LoopEngine) and in Node
// (module.exports), so the CLI in tools/loopgif.mjs renders byte-identical GIFs.

(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  // ---------- deterministic randomness (same mulberry32 / FNV-1a as assets/genart.js) ----------
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function coerceSeed(raw) {
    const s = String(raw).trim();
    return /^\d+$/.test(s) ? Number(s) >>> 0 : hashStr(s);
  }
  // Stateless integer hash → [0,1): used for per-cell grain so it is a pure function of (x,y,frame).
  function hash3(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- palettes: index 0 is the ground; 1 = ink, 2 = card front, 3 = card back, 4+ extra ----------
  const PALETTES = {
    primaries: { name: 'RGB primaries', colors: ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'] },
    subtractive: { name: 'CMY on paper', colors: ['#ffffff', '#ff00ff', '#00ffff', '#ffff00', '#000000'] },
    bauhaus: { name: 'Bauhaus', colors: ['#efe8d8', '#d2291f', '#1d3fa0', '#f2b705', '#111111'] },
    phosphor: { name: 'Phosphor', colors: ['#020a04', '#39ff6a', '#0f7a2e', '#b6ffc8', '#063d17'] },
    signal: { name: 'Signal', colors: ['#0a0a0a', '#ff4f00', '#f4f4f0', '#5a5a5a', '#ff4f00'] },
    mono: { name: 'Mono', colors: ['#000000', '#ffffff', '#ffffff', '#7f7f7f', '#ffffff'] },
  };
  const PALETTE_KEYS = Object.keys(PALETTES);
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const ASPECTS = { '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16 };

  const DEFAULTS = {
    palette: 'primaries',
    aspect: '16:9',
    cells: 160,     // grid width in cells (the "pixel" size)
    frames: 96,     // frames per loop
    delay: 4,       // GIF frame delay, centiseconds (4 → 25 fps)
    cards: 1,
    streams: 1,
    trail: 18,      // metaballs per stream
    body: 1,        // stream thickness multiplier
    debris: 70,     // specks per stream alive across the loop
    grain: 0.35,    // probability of speckle in the stream's soft edge
    spin: 1,        // card revolutions per loop (integer ⇒ seamless)
    zoom: 1,
  };

  // ---------- small vector helpers ----------
  function rotMat(ax, ay, az) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
    // R = Rz * Ry * Rx (row-major 3x3)
    return [
      cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
      sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
      -sy, cy * sx, cy * cx,
    ];
  }
  function mul(m, v) {
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  }
  function matMul(a, b) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  }
  const wrap = (x) => x - Math.floor(x);

  // ---------- scene generation: everything stochastic is decided here, once, from the seed ----------
  function createScene(seedRaw, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const seed = typeof seedRaw === 'number' ? seedRaw >>> 0 : coerceSeed(seedRaw);
    const rnd = mulberry32(seed);
    const R = (a, b) => a + (b - a) * rnd();
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

    const aspect = ASPECTS[o.aspect] || 16 / 9;
    const W = Math.max(16, Math.round(o.cells));
    const H = Math.max(16, Math.round(W / aspect));
    const pal = PALETTES[o.palette] || PALETTES.primaries;

    // camera: a slight fixed yaw/pitch so cards read as planes in space
    const cam = rotMat(R(-0.3, 0.3), R(-0.45, 0.45), 0);

    const nCards = Math.max(0, Math.round(o.cards));
    const cards = [];
    const spread = nCards > 1 ? Math.min(1.5, 2.6 / nCards) : 0;
    for (let i = 0; i < nCards; i++) {
      const slot = nCards > 1 ? (i - (nCards - 1) / 2) * spread : 0;
      cards.push({
        base: [slot + R(-0.15, 0.15), R(-0.25, 0.25), R(-0.2, 0.2)],
        drift: [R(0, 0.25), R(0, 0.2), R(0, 0.25)],
        driftFreq: pick([1, 1, 2]),
        driftPh: [R(0, TAU), R(0, TAU), R(0, TAU)],
        half: [R(0.45, 0.85) / Math.sqrt(Math.max(1, nCards * 0.7)), R(0.5, 0.9) / Math.sqrt(Math.max(1, nCards * 0.7))],
        // spin about the card's own vertical axis: integer revolutions per loop, ±
        spinDir: rnd() < 0.5 ? -1 : 1,
        spinPh: R(0, TAU),
        // a tilt that nods once (or twice) per loop
        tilt: R(-0.5, 0.5),
        nod: R(0, 0.45),
        nodFreq: pick([1, 2]),
        nodPh: R(0, TAU),
        roll: R(-0.4, 0.4),
        front: 2,
        back: 3,
      });
    }
    if (nCards > 2) cards[nCards - 1].front = 4; // a third card earns the accent colour

    const nStreams = Math.max(0, Math.round(o.streams));
    const streams = [];
    for (let s = 0; s < nStreams; s++) {
      const dir = rnd() < 0.5 ? -1 : 1;
      const orbit = [R(0.9, 1.5), R(0.7, 1.3)];
      const harm = [];
      for (let k = 0; k < 3; k++) {
        harm.push({ amp: [R(0, 0.35), R(0.1, 0.5), R(0, 0.35)], f: [pick([2, 3]), pick([1, 2, 3]), pick([2, 3, 4])], ph: [R(0, TAU), R(0, TAU), R(0, TAU)] });
      }
      const K = Math.max(2, Math.round(o.trail));
      const balls = [];
      for (let k = 0; k < K; k++) {
        const u = k / (K - 1);
        balls.push({
          lagJitter: R(-0.45, 0.45),
          r: (0.13 + 0.07 * Math.sin(u * Math.PI)) * Math.pow(1 - u, 0.5) * R(0.6, 1.35) + 0.025,
          lumpF: pick([1, 2, 3]),
          lumpPh: R(0, TAU),
          off: [R(-0.14, 0.14), R(-0.14, 0.14), R(-0.14, 0.14)],
          wobF: pick([2, 3, 5]),
          wobPh: R(0, TAU),
        });
      }
      const nDebris = Math.max(0, Math.round(o.debris));
      const debris = [];
      for (let j = 0; j < nDebris; j++) {
        const th = R(0, TAU), ph = Math.acos(R(-1, 1));
        const sp = R(0.4, 1.6);
        debris.push({
          birth: rnd(),
          life: R(0.08, 0.3),
          src: Math.floor(Math.pow(rnd(), 0.6) * K), // biased toward the tail
          vel: [Math.sin(ph) * Math.cos(th) * sp, Math.sin(ph) * Math.sin(th) * sp, Math.cos(ph) * sp],
          size: rnd() < 0.25 ? 2 : 1,
        });
      }
      streams.push({
        dir,
        phase: s / nStreams + R(-0.1, 0.1),
        orbit,
        ySway: R(0.15, 0.5),
        yFreq: pick([1, 2]),
        yPh: R(0, TAU),
        harm,
        lag: R(0.016, 0.026) * (18 / K),
        balls,
        debris,
        color: s === 0 ? 1 : s === 1 ? 4 : 2,
      });
    }

    return {
      seed, opts: o, W, H, palette: pal.colors.map(hexToRgb), paletteHex: pal.colors.slice(),
      cam, cards, streams,
      S: Math.min(H, W * 0.5625) * 0.3 * o.zoom, D: 5.5,
      spin: Math.max(0, Math.round(o.spin)),
      frames: Math.max(2, Math.round(o.frames)),
    };
  }

  function streamPos(st, phi) {
    const a = TAU * phi * st.dir + TAU * st.phase;
    const p = [st.orbit[0] * Math.cos(a), st.ySway * Math.sin(TAU * st.yFreq * phi + st.yPh), st.orbit[1] * Math.sin(a)];
    for (const h of st.harm) {
      p[0] += h.amp[0] * Math.sin(TAU * h.f[0] * phi + h.ph[0]);
      p[1] += h.amp[1] * Math.sin(TAU * h.f[1] * phi + h.ph[1]) * 0.6;
      p[2] += h.amp[2] * Math.sin(TAU * h.f[2] * phi + h.ph[2]);
    }
    return p;
  }

  // ---------- rendering: one frame of palette indices ----------
  function makeBuffers(scene) {
    const n = scene.W * scene.H;
    return { idx: new Uint8Array(n), z: new Float32Array(n), field: new Float32Array(n), fz: new Float32Array(n) };
  }

  function renderFrame(scene, frame, buf) {
    buf = buf || makeBuffers(scene);
    const { W, H, S, D, cam } = scene;
    const t = frame / scene.frames;
    const cx = W / 2, cy = H / 2;
    const { idx, z, field, fz } = buf;
    idx.fill(0);
    z.fill(Infinity);

    const project = (p) => {
      const f = D / (p[2] + D);
      return [cx + S * p[0] * f, cy - S * p[1] * f, f];
    };

    // --- cards: exact perspective ray–plane intersection per covered cell
    for (const c of scene.cards) {
      const ang = TAU * scene.spin * c.spinDir * t + c.spinPh;
      const nod = c.tilt + c.nod * Math.sin(TAU * c.nodFreq * t + c.nodPh);
      const M = matMul(cam, rotMat(nod, ang, c.roll));
      const ctr = mul(cam, [
        c.base[0] + c.drift[0] * Math.sin(TAU * c.driftFreq * t + c.driftPh[0]),
        c.base[1] + c.drift[1] * Math.sin(TAU * c.driftFreq * t + c.driftPh[1]),
        c.base[2] + c.drift[2] * Math.sin(TAU * c.driftFreq * t + c.driftPh[2]),
      ]);
      const u = mul(M, [1, 0, 0]), v = mul(M, [0, 1, 0]), n = mul(M, [0, 0, 1]);
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const q = project([ctr[0] + u[0] * c.half[0] * a + v[0] * c.half[1] * b, ctr[1] + u[1] * c.half[0] * a + v[1] * c.half[1] * b, ctr[2] + u[2] * c.half[0] * a + v[2] * c.half[1] * b]);
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      }
      x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W - 1, Math.ceil(x1));
      y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
      const oc = [ctr[0], ctr[1], ctr[2] + D]; // card centre relative to the eye at (0,0,-D)
      const num = n[0] * oc[0] + n[1] * oc[1] + n[2] * oc[2];
      for (let py = y0; py <= y1; py++) {
        const dy = -(py + 0.5 - cy) / S;
        for (let px = x0; px <= x1; px++) {
          const dx = (px + 0.5 - cx) / S;
          const den = n[0] * dx + n[1] * dy + n[2] * D;
          if (Math.abs(den) < 1e-9) continue;
          const lam = num / den;
          if (lam <= 0) continue;
          const P0 = dx * lam - ctr[0], P1 = dy * lam - ctr[1], P2 = D * lam - D - ctr[2];
          if (Math.abs(P0 * u[0] + P1 * u[1] + P2 * u[2]) > c.half[0]) continue;
          if (Math.abs(P0 * v[0] + P1 * v[1] + P2 * v[2]) > c.half[1]) continue;
          const depth = D * lam - D;
          const i = py * W + px;
          if (depth < z[i]) {
            z[i] = depth;
            idx[i] = den < 0 ? c.front : c.back;
          }
        }
      }
    }

    // --- streams: metaballs in a compact kernel field, then specks
    const T = 0.42; // threshold where a lone ball's surface sits at its radius
    const body = scene.opts.body;
    const grain = scene.opts.grain;
    for (let si = 0; si < scene.streams.length; si++) {
      const st = scene.streams[si];
      field.fill(0);
      fz.fill(0);
      let bx0 = W, bx1 = -1, by0 = H, by1 = -1;
      const centres = [];
      for (let k = 0; k < st.balls.length; k++) {
        const b = st.balls[k];
        const phi = wrap(t - (k + b.lagJitter) * st.lag);
        const p = streamPos(st, phi);
        const lump = 1 + 0.4 * Math.sin(TAU * b.lumpF * phi + b.lumpPh);
        const wob = Math.sin(TAU * b.wobF * phi + b.wobPh);
        const wp = mul(cam, [p[0] + b.off[0] * wob, p[1] + b.off[1] * wob, p[2] + b.off[2] * wob]);
        centres.push(wp);
        const q = project(wp);
        const Rp = b.r * body * lump * q[2] * S; // screen radius
        const K = 2 * Rp, K2 = K * K;
        const xa = Math.max(0, Math.floor(q[0] - K)), xb = Math.min(W - 1, Math.ceil(q[0] + K));
        const ya = Math.max(0, Math.floor(q[1] - K)), yb = Math.min(H - 1, Math.ceil(q[1] + K));
        if (xa < bx0) bx0 = xa; if (xb > bx1) bx1 = xb; if (ya < by0) by0 = ya; if (yb > by1) by1 = yb;
        for (let py = ya; py <= yb; py++) {
          const ddy = py + 0.5 - q[1];
          for (let px = xa; px <= xb; px++) {
            const ddx = px + 0.5 - q[0];
            const d2 = (ddx * ddx + ddy * ddy) / K2;
            if (d2 >= 1) continue;
            const g = (1 - d2) * (1 - d2) * (1 - d2);
            const i = py * W + px;
            field[i] += g;
            fz[i] += g * (wp[2] - b.r * body * Math.sqrt(Math.max(0, 1 - 4 * d2)));
          }
        }
      }
      for (let py = Math.max(0, by0); py <= by1; py++) {
        for (let px = Math.max(0, bx0); px <= bx1; px++) {
          const i = py * W + px;
          const f = field[i];
          if (f <= 0) continue;
          let on = f >= T;
          if (!on && grain > 0 && f > T * 0.45) on = hash3(px, py, (frame % scene.frames) * 7 + si) < grain * (f - T * 0.45) / (T * 0.55) * 0.6;
          if (!on) continue;
          const depth = fz[i] / f;
          if (depth < z[i]) { z[i] = depth; idx[i] = st.color; }
        }
      }
      // specks: born at a trail ball, fly ballistically, die — age taken mod 1 so they loop
      for (const d of st.debris) {
        const age = wrap(t - d.birth);
        if (age > d.life) continue;
        const b = st.balls[d.src];
        const phi = wrap(d.birth - (d.src + b.lagJitter) * st.lag);
        const p0 = streamPos(st, phi);
        const a = age;
        const wp = mul(scene.cam, [p0[0] + d.vel[0] * a, p0[1] + d.vel[1] * a - 1.2 * a * a, p0[2] + d.vel[2] * a]);
        const q = project(wp);
        const px = Math.floor(q[0]), py = Math.floor(q[1]);
        for (let yy = 0; yy < d.size; yy++) for (let xx = 0; xx < d.size; xx++) {
          const X = px + xx, Y = py + yy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const i = Y * W + X;
          if (wp[2] < z[i]) { z[i] = wp[2]; idx[i] = st.color; }
        }
      }
    }
    return buf.idx;
  }

  // ---------- GIF89a encoder (global palette, LZW, frame-diff cropping, infinite loop) ----------
  function ByteOut(cap) {
    let buf = new Uint8Array(cap || 1 << 16), n = 0;
    const ensure = (k) => {
      if (n + k <= buf.length) return;
      let c = buf.length * 2;
      while (c < n + k) c *= 2;
      const nb = new Uint8Array(c); nb.set(buf.subarray(0, n)); buf = nb;
    };
    return {
      byte(b) { ensure(1); buf[n++] = b; },
      u16(v) { ensure(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255; },
      bytes(arr) { ensure(arr.length); buf.set(arr, n); n += arr.length; },
      str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); },
      result() { return buf.slice(0, n); },
    };
  }

  function lzwEncode(out, pixels, minCode) {
    out.byte(minCode);
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1;
    let table = new Map();
    let cur = 0, shift = 0;
    const block = new Uint8Array(255);
    let bl = 0;
    const flushBlock = () => { if (bl) { out.byte(bl); out.bytes(block.subarray(0, bl)); bl = 0; } };
    const emit = (code) => {
      cur |= code << shift; shift += size;
      while (shift >= 8) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); cur >>>= 8; shift -= 8; }
    };
    emit(clear);
    let prefix = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 8) | k;
      const hit = table.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        size = minCode + 1; next = eoi + 1; table = new Map();
      } else {
        if (next >= 1 << size) size++;
        table.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (shift > 0) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); }
    flushBlock();
    out.byte(0);
  }

  // frames: array of Uint8Array index buffers at grid resolution (w×h); scale: integer upscale.
  function encodeGIF(frames, w, h, paletteRgb, opts) {
    opts = opts || {};
    const scale = Math.max(1, Math.round(opts.scale || 1));
    const delay = Math.max(2, Math.round(opts.delay || 4));
    const W = w * scale, H = h * scale;
    let bits = 1;
    while (1 << bits < paletteRgb.length) bits++;
    const tableSize = 1 << bits;
    const minCode = Math.max(2, bits);
    const out = ByteOut(1 << 20);
    out.str('GIF89a');
    out.u16(W); out.u16(H);
    out.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
    out.byte(0); out.byte(0);
    for (let i = 0; i < tableSize; i++) {
      const c = paletteRgb[i] || [0, 0, 0];
      out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
    }
    out.byte(0x21); out.byte(0xff); out.byte(11); out.str('NETSCAPE2.0'); out.byte(3); out.byte(1); out.u16(0); out.byte(0);

    let prev = null;
    for (let f = 0; f < frames.length; f++) {
      const cur = frames[f];
      // crop to the bounding box of cells that changed since the previous frame (disposal: keep)
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
      if (prev) {
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (cur[i] !== prev[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) { x0 = y0 = x1 = y1 = 0; } // identical frame: re-emit one cell
      }
      const cw = (x1 - x0 + 1) * scale, ch = (y1 - y0 + 1) * scale;
      const px = new Uint8Array(cw * ch);
      let o = 0;
      for (let y = y0; y <= y1; y++) {
        const rowStart = o;
        for (let x = x0; x <= x1; x++) { const v = cur[y * w + x]; for (let s = 0; s < scale; s++) px[o++] = v; }
        for (let s = 1; s < scale; s++) { px.copyWithin(o, rowStart, rowStart + cw); o += cw; }
      }
      out.byte(0x21); out.byte(0xf9); out.byte(4); out.byte(1 << 2); out.u16(delay); out.byte(0); out.byte(0);
      out.byte(0x2c); out.u16(x0 * scale); out.u16(y0 * scale); out.u16(cw); out.u16(ch); out.byte(0);
      lzwEncode(out, px, minCode);
      prev = cur;
      if (opts.onProgress) opts.onProgress((f + 1) / frames.length);
    }
    out.byte(0x3b);
    return out.result();
  }

  // Convenience: render a whole loop and encode it.
  function renderGIF(seed, opts) {
    const scene = createScene(seed, opts);
    const frames = [];
    const buf = makeBuffers(scene);
    for (let f = 0; f < scene.frames; f++) frames.push(renderFrame(scene, f, buf).slice());
    const scale = (opts && opts.scale) || Math.max(1, Math.round(960 / scene.W));
    return { scene, bytes: encodeGIF(frames, scene.W, scene.H, scene.palette, { scale, delay: scene.opts.delay }) };
  }

  const api = { createScene, renderFrame, makeBuffers, encodeGIF, renderGIF, coerceSeed, PALETTES, PALETTE_KEYS, ASPECTS, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoopEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
