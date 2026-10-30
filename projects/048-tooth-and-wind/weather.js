// 048 — Tooth and Wind: the engine.
//
// Not strokes drawn on a canvas but a sheet simulated under them. The paper has a height map
// (its tooth); fields lie on it — pigment, white, and the tooth itself, which an eraser
// burnishes flat. Every mark is a stick, a finger, an eraser or a lump of chalk moved across
// that sheet one footprint at a time:
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
//
// The same grammar runs in five media. Each medium translates the hands into its own tools,
// makes its own paper, renders its own pigment and answers a full sheet in its own way:
//
//   charcoal     the eraser sweeps a region back; ghosts stay in the burnished tooth
//   graphite     on gesso: smooth, smudges easily, erases clean; the graphite shines, and a
//                slow raking light crosses the sheet
//   silverpoint  cannot be smudged or erased; tone only by hatching; every line tarnishes from
//                grey to brown as it ages. A full sheet is finished: it is left to tarnish,
//                then a new sheet begins
//   ink          on wet paper: a water field carries the ink, which spreads through the wet,
//                gathers at drying edges and fixes as the wind dries it. A full sheet is
//                veiled in thin white and drawn over
//   pastel       on sanded paper: opaque colour that fills the tooth until it will take no
//                more. A full sheet is fixed: fixative restores the tooth and darkens the
//                colour, and the next layer goes on top
//
// Any medium can be shown as the paper's memory: everything that was ever taken away.

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

  // ground: 'bone' (light) · 'toned' · 'night' (dark), read per medium
  const GROUNDS = {
    charcoal: {
      bone: { paper: [236, 234, 227], ink: [24, 23, 26], chalk: [252, 251, 247], invert: false },
      toned: { paper: [158, 160, 158], ink: [20, 20, 23], chalk: [246, 245, 238], invert: false },
      night: { paper: [236, 234, 227], ink: [24, 23, 26], chalk: [252, 251, 247], invert: true },
    },
    graphite: {   // gesso; dark = black gesso, where the graphite is seen only by its shine
      bone: { paper: [243, 241, 236], lead: [64, 66, 72], shine: [190, 193, 202] },
      toned: { paper: [178, 176, 171], lead: [52, 54, 60], shine: [214, 216, 224] },
      night: { paper: [30, 30, 33], lead: [40, 41, 46], shine: [176, 180, 192] },
    },
    silverpoint: {   // prepared grounds, as the old masters tinted them; white heightening shows on the darker two
      bone: { paper: [235, 229, 213], fresh: [124, 126, 133], aged: [96, 76, 52], white: [250, 248, 240] },
      toned: { paper: [214, 189, 176], fresh: [118, 116, 122], aged: [92, 66, 48], white: [250, 244, 236] },
      night: { paper: [118, 128, 138], fresh: [70, 74, 82], aged: [66, 52, 38], white: [246, 246, 240] },
    },
    ink: {
      bone: { paper: [241, 236, 224], ink: [17, 15, 20], white: [250, 248, 242], invert: false },
      toned: { paper: [214, 203, 182], ink: [20, 17, 20], white: [246, 242, 232], invert: false },
      night: { paper: [241, 236, 224], ink: [17, 15, 20], white: [250, 248, 242], invert: true },
    },
    pastel: {   // sanded paper with its palette: late summer on buff, dusk on warm grey, frost on slate
      bone: { paper: [150, 134, 110], sticks: [[46, 40, 30], [122, 98, 44], [184, 152, 72], [104, 116, 66], [224, 210, 164], [156, 72, 48], [246, 238, 210]] },
      toned: { paper: [92, 85, 80], sticks: [[40, 32, 40], [118, 102, 76], [92, 110, 96], [168, 150, 118], [204, 190, 164], [172, 90, 64], [240, 232, 214]] },
      night: { paper: [52, 56, 64], sticks: [[24, 28, 38], [86, 104, 128], [144, 160, 172], [118, 96, 112], [196, 206, 210], [170, 128, 96], [244, 246, 244]] },
    },
  };
  const MEDIA = ['charcoal', 'graphite', 'silverpoint', 'ink', 'pastel'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let o = Object.assign({ medium: 'charcoal', ground: 'bone', view: 'drawing', tarnish: 1 }, opts);
    let W, H, N, u, T, C, K, E, D, Wt, Mo, PR, PG, PB, Fl, wetTiles, img, buf32, rand, noise, R, med;
    let hands, stands, gusts, push, frame, t, accSpawn, lastSweep, stats, finger, paused = false, sheet;
    const TS = 32;
    let tilesX, tilesY, sheenLUT;

    // ---------- the sheet ----------
    function size() {
      const vw = canvas.clientWidth || global.innerWidth, vh = canvas.clientHeight || global.innerHeight;
      const k = Math.min(1, Math.sqrt(1.35e6 / (vw * vh)));   // cap the field at ~1.35 Mpx
      W = Math.max(64, Math.round(vw * k)); H = Math.max(64, Math.round(vh * k)); N = W * H;
      canvas.width = W; canvas.height = H;
      u = Math.min(W, H) / 900;
      tilesX = Math.ceil(W / TS); tilesY = Math.ceil(H / TS);
    }

    function octave(cell, amp) {
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
    }
    function normalizeTooth(spread) {
      let m = 0, v = 0;
      for (let i = 0; i < N; i++) m += T[i];
      m /= N;
      for (let i = 0; i < N; i++) v += (T[i] - m) * (T[i] - m);
      const sd = Math.sqrt(v / N) || 1;
      for (let i = 0; i < N; i++) T[i] = clamp(0.5 + (T[i] - m) / (sd * spread), 0, 1);
    }

    // each medium's paper
    function makeTooth() {
      T = new Float32Array(N);
      const s = Math.max(1, u), m = o.medium;
      if (m === 'charcoal') {
        for (let i = 0; i < N; i++) T[i] = 0.3 * rand();   // the fibre: no cell, so no screen
        octave(2.3 * s, 0.34); octave(5.1 * s, 0.26); octave(15 * s, 0.13);
        // laid lines: the faint horizontal ribbing of a mould-made sheet
        const lp = 3.4 * s, ph = rand() * TAU;
        for (let y = 0; y < H; y++) {
          const l = 0.035 * Math.sin((y / lp) * TAU + ph + 0.6 * noise(y * 0.01, 3.1, 0));
          for (let x = 0, i = y * W; x < W; x++, i++) T[i] += l;
        }
        normalizeTooth(3.4);
      } else if (m === 'graphite') {
        // gesso: smooth, with the ridges of the brush that laid it — two coats brushed across
        // each other, one or the other showing in broad patches
        for (let i = 0; i < N; i++) T[i] = 0.12 * rand();
        octave(3 * s, 0.12);
        const b0 = rand() * Math.PI, c0 = Math.cos(b0), s0 = Math.sin(b0);
        for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) {
          const a = x * c0 + y * s0, b = -x * s0 + y * c0;
          const mix = 0.5 + 0.5 * noise(x * 0.004 / s, y * 0.004 / s, 7.3);
          T[i] += 0.32 * (mix * noise(a * 0.006 / s, b * 0.5 / s, 2.2) + (1 - mix) * noise(b * 0.006 / s, a * 0.5 / s, 4.4));
        }
        normalizeTooth(4.2);
      } else if (m === 'silverpoint') {
        // bone-dust ground: fine, even, nearly without structure
        for (let i = 0; i < N; i++) T[i] = 0.4 * rand();
        octave(1.8 * s, 0.3); octave(6 * s, 0.08);
        normalizeTooth(4);
      } else if (m === 'ink') {
        // a mulberry sheet: soft, with long fibres the water runs along
        for (let i = 0; i < N; i++) T[i] = 0.18 * rand();
        octave(3 * s, 0.2); octave(12 * s, 0.14);
        const nf = Math.round(N / (260 * s * s));
        for (let f = 0; f < nf; f++) {
          let x = rand() * W, y = rand() * H, a = rand() * TAU;
          const len = (20 + rand() * 90) * s, amp = 0.08 + rand() * 0.18;
          for (let k = 0; k < len; k++) {
            const xi = x | 0, yi = y | 0;
            if (xi >= 0 && yi >= 0 && xi < W && yi < H) T[yi * W + xi] += amp;
            a += (rand() - 0.5) * 0.15; x += Math.cos(a); y += Math.sin(a);
          }
        }
        normalizeTooth(3.6);
      } else {
        // sanded paper: grit, sharp and dense
        for (let i = 0; i < N; i++) { const g = rand(); T[i] = g * g * 0.9; }
        octave(1.4 * s, 0.25); octave(9 * s, 0.08);
        normalizeTooth(2.6);
      }
    }

    // ---------- tools: one footprint each ----------
    function bbox(x, y, r) {
      return [Math.max(0, Math.floor(x - r)), Math.min(W - 1, Math.ceil(x + r)), Math.max(0, Math.floor(y - r)), Math.min(H - 1, Math.ceil(y + r))];
    }

    // stick of charcoal (or chalk, into K). ell > 1 = the stick laid on its side: the
    // footprint is narrow along the stroke and broad across it; tab = the grit of that edge,
    // which pulls the stroke into parallel striations. mem > 0 records the mark in the
    // paper's memory (a veil laid over the drawing counts as taking it away).
    function stick(F, x, y, r, p, ang, ell, tab, hard, cover, mem) {
      if (r < 0.35 || p <= 0) return;
      const [x0, x1, y0, y1] = bbox(x, y, r);
      const c = Math.cos(ang), s = Math.sin(ang), ir2 = 1 / (r * r), e2 = ell * ell, g = o.grain * med.grain;
      const dated = D && F === C;
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
          if (dated) D[i] = D[i] + (t - D[i]) * Math.min(1, (a * hard) / Math.max(0.05, F[i]));   // the silver's age: new metal over old
          if (mem) E[i] += a * hard * mem;
        }
      }
    }

    function erase(x, y, r, e, burnish) {
      const [x0, x1, y0, y1] = bbox(x, y, r), ir2 = 1 / (r * r);
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
          if (d2 >= 1) continue;
          const f = Math.min(1, (1 - d2) * 3) * e;   // a kneaded eraser: crisp edge
          E[i] += f * (C[i] + 0.15);
          C[i] *= 1 - f; K[i] *= 1 - f * 0.5;
          T[i] = Math.max(0.12, T[i] - burnish * f);    // burnish: the ghost is in the paper
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

    // pastel: opaque colour into the tooth, until the tooth is full
    function pastel(h, x, y, r, p, ang, ell, tab) {
      if (r < 0.35 || p <= 0) return;
      const [x0, x1, y0, y1] = bbox(x, y, r);
      const c = Math.cos(ang), s = Math.sin(ang), ir2 = 1 / (r * r), e2 = ell * ell, g = o.grain * med.grain;
      const [cr, cg, cb] = h.col;
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, a1 = dx * c + dy * s, b1 = -dx * s + dy * c;
          const d2 = (a1 * a1 * e2 + b1 * b1) * ir2;
          if (d2 >= 1) continue;
          let q = p * (1 - d2 * d2);
          if (tab) q *= tab[((b1 + 4096) * 0.8) & 63];
          let a = (q - (1 - T[i]) * g) * (1 - Fl[i]);
          if (a <= 0) continue;
          a = Math.min(1, a * h.hard * 2.2);
          const A = C[i], A2 = A + a * (1 - A), w = a / Math.max(1e-4, A2);
          PR[i] += (cr - PR[i]) * w; PG[i] += (cg - PG[i]) * w; PB[i] += (cb - PB[i]) * w;
          C[i] = A2; Fl[i] = Math.min(1, Fl[i] + a * 0.22);
        }
      }
    }
    // a finger in pastel drags colour
    function pblend(st, x, y, r, k) {
      const [x0, x1, y0, y1] = bbox(x, y, r), ir2 = 1 / (r * r);
      let sr = 0, sg = 0, sb = 0, sa = 0, sw = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
          if (d2 >= 1) continue;
          const f = (1 - d2) * (1 - d2), w = f * k;
          sr += PR[i] * C[i] * f; sg += PG[i] * C[i] * f; sb += PB[i] * C[i] * f; sa += C[i] * f; sw += f;
          if (st.la > 0.01) {
            const ww = w * st.la;
            PR[i] += (st.lr - PR[i]) * ww; PG[i] += (st.lg - PG[i]) * ww; PB[i] += (st.lb - PB[i]) * ww;
          }
          C[i] += (st.la - C[i]) * w * 0.6;
        }
      }
      if (sa > 1e-3) {
        const pk = 0.3;
        st.lr = st.lr * (1 - pk) + (sr / sa) * pk; st.lg = st.lg * (1 - pk) + (sg / sa) * pk; st.lb = st.lb * (1 - pk) + (sb / sa) * pk;
      }
      if (sw > 0) st.la = (st.la * 0.7 + (sa / sw) * 0.3) * 0.995;
    }

    // ink: water and pigment into the paper; the sheet does the rest (inkTick)
    function markWet(x0, x1, y0, y1) {
      for (let ty = (y0 / TS) | 0; ty <= (y1 / TS) | 0; ty++) for (let tx = (x0 / TS) | 0; tx <= (x1 / TS) | 0; tx++) wetTiles[ty * tilesX + tx] = 1;
    }
    function inkStamp(h, x, y, r, p) {
      if (r < 0.35 || p <= 0) return;
      const [x0, x1, y0, y1] = bbox(x, y, r), ir2 = 1 / (r * r), g = o.grain * med.grain, tl = h.tool;
      const load = h.load == null ? 1 : h.load, conc = h.conc == null ? 1 : h.conc;
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - y;
        for (let xx = x0, i = yy * W + x0; xx <= x1; xx++, i++) {
          const dx = xx + 0.5 - x, d2 = (dx * dx + dy * dy) * ir2;
          if (d2 >= 1) continue;
          const f = 1 - d2 * d2, q = p * f;
          if (tl === 'brush') {
            const dry = q * (1 - load) * 1.3 - (1 - T[i]) * g;     // the dry end of the stroke catches the fibre
            if (dry > 0) C[i] += dry * 0.55 * (1 - C[i]);
            const wv = q * load;
            Wt[i] = Math.min(0.85, Wt[i] + wv * 0.3); Mo[i] = Math.min(1.6, Mo[i] + wv * 0.5 * conc);
          } else if (tl === 'wash') {
            Wt[i] = Math.min(0.8, Wt[i] + f * 0.3); Mo[i] = Math.min(1.6, Mo[i] + f * 0.22 * conc * p);
          } else if (tl === 'water') {
            Wt[i] = Math.min(0.8, Wt[i] + f * 0.35);
          } else {   // blot
            const k = f * 0.85;
            E[i] += Mo[i] * k + Wt[i] * k * 0.2;
            Wt[i] *= 1 - k; Mo[i] *= 1 - k;
          }
        }
      }
      if (tl === 'brush') h.load = Math.max(0, load - 0.004 * (1 + o.wind * 0.3));
      if (tl !== 'blot') markWet(x0, x1, y0, y1);
    }

    // the wet sheet, one step: ink spreads where both cells are wet, water runs to the drier
    // cell and takes ink with it (so ink gathers at the drying edge), a flooded cell bleeds
    // into dry paper along the fibre, and the wind dries it; as it dries the ink fixes
    // (half the tiles a frame, in a checkerboard, each taking a double step)
    function inkTick() {
      const nb = [-1, 1, -W, W], par = frame & 1;
      for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
        const ti = ty * tilesX + tx;
        if (!wetTiles[ti] || ((tx + ty) & 1) !== par) continue;
        const x0 = Math.max(1, tx * TS), x1 = Math.min(W - 2, tx * TS + TS - 1), y0 = Math.max(1, ty * TS), y1 = Math.min(H - 2, ty * TS + TS - 1);
        const wv = wind(tx * TS + TS / 2, ty * TS + TS / 2), wm = Math.hypot(wv[0], wv[1]);
        const evap = 0.009 * (0.6 + wm * 0.5) * o.pace * med.dry;
        let any = false;
        for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
          let w = Wt[i];
          if (w <= 0) continue;
          any = true;
          for (let k = 0; k < 4; k++) {
            const n = i + nb[k], wn = Wt[n];
            if (wn > 0.01) {
              const d = (Mo[n] - Mo[i]) * 0.2 * Math.min(w, wn);
              Mo[i] += d; Mo[n] -= d;
              if (w > wn) {
                const fl = (w - wn) * 0.16, m = Mo[i] * (fl / w) * 0.9;
                Wt[i] -= fl; Wt[n] += fl; Mo[i] -= m; Mo[n] += m; w = Wt[i];
              }
            } else if (w > 0.45) {
              const fl = (w - 0.45) * 0.1 * T[n] * T[n] * 2, m = Mo[i] * (fl / w) * 0.7;
              Wt[i] -= fl; Wt[n] += fl; Mo[i] -= m; Mo[n] += m; w = Wt[i];
              const nx = n % W, ny = (n / W) | 0, nt = ((ny / TS) | 0) * tilesX + ((nx / TS) | 0);
              if (nt !== ti) wetTiles[nt] = 1;
            }
          }
          const e = Math.min(w, evap * (0.7 + 0.6 * T[i]));
          w -= e;
          if (w <= 0.002) { C[i] += Mo[i] * 0.8 * (1 - C[i]); Mo[i] = 0; Wt[i] = 0; }
          else {
            const fx = Mo[i] * (e / (w + e)) * 0.5;
            C[i] += fx * 0.8 * (1 - C[i]); Mo[i] -= fx; Wt[i] = w;
          }
        }
        if (!any) wetTiles[ti] = 0;
      }
    }

    // pastel's answer to a full sheet: fixative over everything — it gives the tooth back
    // and darkens what it fixes
    function fixative() {
      for (let i = 0; i < N; i++) {
        const a = C[i];
        if (a > 0.002) { PR[i] *= 0.93; PG[i] *= 0.93; PB[i] *= 0.94; E[i] += a * 0.25; }
        Fl[i] *= 0.4;
      }
      stats.sweeps++;
    }

    // ---------- the wind ----------
    function wind(x, y) {
      const z = t * 0.06;
      const n1 = noise(x * 0.0016 / u, y * 0.0016 / u, z), n2 = noise(x * 0.0021 / u + 40, y * 0.0021 / u, z + 9);
      const ang = R.windAng + 0.85 * n1 + 0.25 * Math.sin(t * 0.021);
      const m = o.wind * (0.55 + 0.45 * n2) * (0.75 + 0.25 * Math.sin(t * 0.13 + R.phase));
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
    // tool: 'char' | 'chalk' | 'finger' | 'erase', and per medium 'pastel' | 'pfinger' |
    // 'brush' | 'wash' | 'water' | 'blot'
    function Hand(h) {
      this.x = h.x; this.y = h.y; this.a = h.a;
      this.len = h.len; this.r = h.r; this.p = h.p == null ? 0.8 : h.p;
      this.tool = h.tool || 'char';
      this.speed = h.speed || 6; this.bend = h.bend || 0; this.curl = h.curl || 0;
      this.brk = h.brk || 0; this.tin = h.tin == null ? 0.08 : h.tin; this.tout = h.tout == null ? 0.3 : h.tout;
      this.rtaper = h.rtaper == null ? 0.6 : h.rtaper;
      this.ell = h.ell || 1; this.hard = h.hard || 0.28; this.k = h.k || 0.3; this.e = h.e || 0.4;
      this.burnish = h.burnish == null ? 0.035 : h.burnish; this.mem = h.mem || 0;
      this.col = h.col || null; this.load = h.load; this.conc = h.conc;
      this.a0 = h.a; this.dev = h.dev || 1.1;   // how far the wind may turn a gesture off its first heading
      this.delay = h.delay || 0; this.onStep = h.onStep || null; this.s = 0;
      this.nz = rand() * 100; this.lc = 0; this.lk = 0;
      this.tab = null;
      if (h.streak) {
        this.tab = new Float32Array(64);
        for (let i = 0; i < 64; i++) this.tab[i] = 1 - h.streak * 0.75 + h.streak * 0.75 * Math.pow(rand(), 0.6) * 1.35;
      }
      if (this.tool === 'finger' || this.tool === 'pfinger') {   // the finger starts loaded with what is under it
        const i = (clamp(this.y | 0, 0, H - 1)) * W + clamp(this.x | 0, 0, W - 1);
        this.lc = C[i]; this.lk = K[i];
        if (PR) { this.lr = PR[i]; this.lg = PG[i]; this.lb = PB[i]; this.la = C[i]; }
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
        if (tl === 'char') stick(C, this.x, this.y, r, p, this.a, this.ell, this.tab, this.hard, false, 0);
        else if (tl === 'chalk') stick(K, this.x, this.y, r, p, this.a, this.ell, this.tab, this.hard, med.chalkCovers, this.mem);
        else if (tl === 'finger') smudge(this, this.x, this.y, r, this.k * (0.3 + 0.7 * shp) * o.smudge);
        else if (tl === 'erase') erase(this.x, this.y, r, this.e * shp, this.burnish);
        else if (tl === 'pastel') pastel(this, this.x, this.y, r, p, this.a, this.ell, this.tab);
        else if (tl === 'pfinger') pblend(this, this.x, this.y, r, this.k * (0.3 + 0.7 * shp) * o.smudge);
        else inkStamp(this, this.x, this.y, r, tl === 'blot' ? this.e * shp : p);
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

    const rr = (a, b) => a + (b - a) * rand();
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const add = (h) => {
      const list = med.xlate ? med.xlate(h) : [h];
      for (const x of list) if (hands.length < 320) hands.push(new Hand(x));
    };
    const UP = -Math.PI / 2;
    const isToned = () => o.ground !== 'bone';

    // ---------- the media: how each one reads the hands ----------
    const MED = {
      charcoal: { grain: 1, dry: 1, chalkCovers: true },
      graphite: {
        grain: 0.75, dry: 1, chalkCovers: true,
        xlate(h) {
          const tl = h.tool || 'char';
          if (tl === 'char') { h.r *= 0.62; h.hard = (h.hard || 0.28) * 0.85; if (h.ell > 1) h.ell = Math.min(h.ell, 1.8); }
          else if (tl === 'finger') h.k = (h.k || 0.3) * 1.35;
          else if (tl === 'erase') { h.e = (h.e || 0.4) * 1.2; h.burnish = 0.012; }     // gesso erases clean
          else if (tl === 'chalk') return [Object.assign(h, { tool: 'erase', r: h.r * 0.8, e: 0.55, burnish: 0.01 })];
          return [h];
        },
      },
      silverpoint: {
        grain: 0.45, dry: 1, chalkCovers: false,
        xlate(h) {
          const tl = h.tool || 'char';
          if (tl === 'finger' || tl === 'erase') return [];       // silver will not move and will not come off
          if (tl === 'chalk') return [Object.assign(h, { r: clamp(h.r * 0.5, 0.5 * u, 1.3 * u), p: (h.p || 0.8) * 0.85, hard: 0.22, ell: 1, streak: 0 })];
          if (h.ell > 1) {   // no side of the stylus: a mass becomes hatching
            const n = clamp(Math.round(h.r / (1.4 * u)), 2, 6), px = -Math.sin(h.a), py = Math.cos(h.a), out = [];
            for (let k = 0; k < n; k++) {
              const off = (k / (n - 1) - 0.5) * h.r * 1.6;
              out.push(Object.assign({}, h, { x: h.x + px * off, y: h.y + py * off, a: h.a + rr(-0.03, 0.03), ell: 1, streak: 0,
                r: u * rr(0.55, 0.85), p: Math.min(1, (h.p || 0.8) * 1.1), hard: 0.17, brk: 0.08, len: h.len * rr(0.75, 1.05), onStep: null,
                delay: (h.delay || 0) + k * 2 }));
            }
            return out;
          }
          h.r = clamp(h.r * 0.45, 0.5 * u, 1.3 * u); h.hard = 0.2; h.p = Math.min(1, h.p == null ? 0.8 : h.p);
          return [h];
        },
      },
      ink: {
        grain: 0.6, dry: 1, chalkCovers: false,
        xlate(h) {
          const tl = h.tool || 'char';
          if (tl === 'char') {
            if (h.ell > 1) return [Object.assign(h, { tool: 'wash', r: h.r * 1.5, ell: 1, streak: 0, conc: rr(0.2, 0.7) })];
            const flick = (h.tout || 0) > 0.85;
            return [Object.assign(h, { tool: 'brush', r: h.r * (flick ? 1.1 : 0.9), load: flick ? rr(0.7, 1) : rr(0.25, 0.85), conc: flick ? rr(0.9, 1.4) : rr(0.6, 1.2) })];
          }
          if (tl === 'finger') return [Object.assign(h, { tool: 'water', r: h.r * 0.9 })];
          if (tl === 'erase') return [Object.assign(h, { tool: 'blot', r: h.r * 1.2, e: Math.min(1, (h.e || 0.4) * 1.4) })];
          return [Object.assign(h, { tool: 'chalk', p: (h.p || 0.6) * 0.9, hard: 0.22 })];   // white gouache
        },
      },
      pastel: {
        grain: 0.55, dry: 1, chalkCovers: false,
        xlate(h) {
          const tl = h.tool || 'char', st = R.sticks;
          if (tl === 'finger') return [Object.assign(h, { tool: 'pfinger' })];
          if (tl === 'erase') return [];          // pastel is not erased; it is fixed and worked over
          let col;
          if (tl === 'chalk') col = st[st.length - 1];
          else if (h.ell > 1) col = st[1 + Math.floor(rand() * (st.length - 3))];      // masses: the middle sticks
          else if ((h.p || 0) > 1 || (h.tout || 0) > 0.85) col = rand() < 0.75 ? st[0] : st[st.length - 2];   // accents and dabs
          else col = rand() < 0.55 ? st[0] : pick(st.slice(1, -1));                    // stalks
          return [Object.assign(h, { tool: 'pastel', col, hard: (h.hard || 0.28) * 1.1 })];
        },
      },
    };

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
      const m = o.medium;
      if (m === 'silverpoint') return finishSheet();
      if (m === 'pastel') return fixative();
      const reg = Math.min(W, H) * rr(0.25, 0.55), a = rr(-0.9, -0.3) + (rand() < 0.5 ? 0 : -Math.PI / 2 + 0.6);
      const n = Math.round(rr(4, 9)), px = -Math.sin(a), py = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const off = (i / (n - 1) - 0.5) * reg * 1.3 + rr(-10, 10) * u, back = rr(0.5, 0.65) * reg;
        const x = cx + px * off - Math.cos(a) * back, y = cy + py * off - Math.sin(a) * back;
        if (m === 'ink') {   // ink will not come off: a thin white veil is laid over it instead
          hands.push(new Hand({ tool: 'chalk', x, y, a: a + rr(-0.15, 0.15), len: reg * rr(0.9, 1.4), r: u * rr(16, 30), p: rr(0.4, 0.6) * o.erase,
            hard: 0.12, ell: 1, tin: 0.1, tout: 0.3, rtaper: 0.3, speed: 5, delay: i * 9, mem: 2.5 }));
          continue;
        }
        add({ tool: 'erase', x, y, a: a + rr(-0.15, 0.15),
          len: reg * rr(0.9, 1.4), r: u * rr(12, 26), e: rr(0.4, 0.62) * o.erase, tin: 0.08, tout: 0.25, rtaper: 0.3, speed: 5, delay: i * 9 });
        if (rand() < 0.5)
          add({ tool: 'finger', x: cx + px * off, y: cy + py * off, a: a + Math.PI + rr(-0.2, 0.2), len: reg * rr(0.4, 0.8), r: u * rr(10, 18), k: 0.3, speed: 5, delay: i * 9 + 30 });
      }
      stats.sweeps++;
    }

    // silverpoint's answer to a full sheet: stop, let it tarnish, begin another
    function finishSheet() {
      if (sheet.state !== 'drawing') return;
      sheet.state = 'finished'; sheet.at = t; hands.length = 0;
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
    function put(i, r, g, b) { buf32[i] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }

    function renderMemory() {
      // what was taken away: erasures, blots, veils, fixative — light on dark
      for (let i = 0; i < N; i++) {
        const e = E[i], a = e > 0 ? 1 - Math.exp(-e * 1.6) : 0, tt = 14 + 8 * T[i];
        put(i, tt + (232 - tt) * a, tt + (226 - tt) * a, tt + 2 + (212 - tt) * a);
      }
    }

    function render() {
      if (o.view === 'memory') { renderMemory(); ctx.putImageData(img, 0, 0); return; }
      const m = o.medium, G = GROUNDS[m][o.ground] || GROUNDS[m].bone;
      const [pr, pg, pb] = G.paper;
      if (m === 'charcoal') {
        const [ir, ig, ib] = G.ink, [cr, cg, cb] = G.chalk, inv = G.invert;
        for (let i = 0; i < N; i++) {
          const tt = 0.94 + 0.06 * T[i];
          let r = pr * tt, g = pg * tt, b = pb * tt;
          const c = C[i];
          if (c > 0.002) { const a = c > 1 ? 1 : c; r += (ir - r) * a; g += (ig - g) * a; b += (ib - b) * a; }
          const k = K[i];
          if (k > 0.002) { const a = k > 1 ? 1 : k; r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a; }
          if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
          put(i, r, g, b);
        }
      } else if (m === 'graphite') {
        // a raking light crosses the sheet slowly; graphite answers it, the gesso does not
        const [lr, lg, lb] = G.lead, [sr, sg, sb] = G.shine;
        const lx = Math.cos(R.lightAng), ly = Math.sin(R.lightAng), span = Math.abs(W * lx) + Math.abs(H * ly);
        const off = (t * 0.00025 * o.pace) % 1;
        for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) {
          const tt = 0.975 + 0.025 * T[i];
          let r = pr * tt, g = pg * tt, b = pb * tt;
          const c = C[i];
          if (c > 0.002) {
            const a = c > 1 ? 1 : c;
            let ph = (x * lx + y * ly) / span - off; ph -= Math.floor(ph);
            const sh = sheenLUT[(ph * 1023) | 0] * a * a * (0.6 + 0.4 * T[i]);
            const cr = lr + (sr - lr) * sh, cg = lg + (sg - lg) * sh, cb = lb + (sb - lb) * sh;
            r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
          }
          const k = K[i];
          if (k > 0.002) { const a = k > 1 ? 1 : k; r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a; }
          put(i, r, g, b);
        }
      } else if (m === 'silverpoint') {
        const [fr, fg, fb] = G.fresh, [ar, ag, ab] = G.aged, [wr, wg, wb] = G.white, span = 2400 / Math.max(0.05, o.tarnish);
        for (let i = 0; i < N; i++) {
          const tt = 0.96 + 0.04 * T[i];
          let r = pr * tt, g = pg * tt, b = pb * tt;
          const c = C[i];
          if (c > 0.002) {
            let age = (t - D[i]) / span; age = age > 1 ? 1 : age < 0 ? 0 : age; age = Math.sqrt(age);
            const a = (c > 1 ? 1 : c) * 0.92;
            const cr = fr + (ar - fr) * age, cg = fg + (ag - fg) * age, cb = fb + (ab - fb) * age;
            r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
          }
          const k = K[i];
          if (k > 0.002) { const a = (k > 1 ? 1 : k) * 0.9; r += (wr - r) * a; g += (wg - g) * a; b += (wb - b) * a; }
          put(i, r, g, b);
        }
      } else if (m === 'ink') {
        const [ir, ig, ib] = G.ink, [wr, wg, wb] = G.white, inv = G.invert;
        for (let i = 0; i < N; i++) {
          const tt = 0.95 + 0.05 * T[i], wet = 1 - 0.08 * Wt[i];
          let r = pr * tt * wet, g = pg * tt * wet, b = pb * tt * (wet + 0.02 * Wt[i]);
          let v = C[i] + 0.75 * Mo[i];
          if (v > 0.002) { const a = v > 1 ? 1 : v; r += (ir - r) * a; g += (ig - g) * a; b += (ib - b) * a; }
          const k = K[i];
          if (k > 0.002) { const a = (k > 1 ? 1 : k) * 0.85; r += (wr - r) * a; g += (wg - g) * a; b += (wb - b) * a; }
          if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
          put(i, r, g, b);
        }
      } else {
        for (let i = 0; i < N; i++) {
          const gr = 0.84 + 0.3 * T[i];
          let r = pr * gr, g = pg * gr, b = pb * gr;
          const a = C[i];
          if (a > 0.002) {
            const s = 0.9 + 0.14 * T[i], aa = a > 1 ? 1 : a;
            r += (PR[i] * s - r) * aa; g += (PG[i] * s - g) * aa; b += (PB[i] * s - b) * aa;
          }
          put(i, r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b);
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // ---------- lifecycle ----------
    // a fresh sheet of the current medium, drawing on the same stream of chance
    function freshSheet() {
      makeTooth();
      C = new Float32Array(N); K = new Float32Array(N); E = new Float32Array(N);
      D = o.medium === 'silverpoint' ? new Float32Array(N) : null;
      Wt = Mo = null; wetTiles = null; PR = PG = PB = Fl = null;
      if (o.medium === 'ink') { Wt = new Float32Array(N); Mo = new Float32Array(N); wetTiles = new Uint8Array(tilesX * tilesY); }
      if (o.medium === 'pastel') {
        PR = new Float32Array(N); PG = new Float32Array(N); PB = new Float32Array(N); Fl = new Float32Array(N);
        const st = GROUNDS.pastel[o.ground] || GROUNDS.pastel.bone;
        R.sticks = st.sticks.slice();
      }
      hands = []; gusts = []; stands = []; push = null; accSpawn = 0.6; lastSweep = t;
      for (let i = 0, n = Math.round(rr(2, 5)); i < n; i++) stands.push(newStand());
      // open with one reed already laid across the sheet, so the first frame is not empty
      longLine();
    }

    function reset() {
      size();
      med = MED[o.medium] || MED.charcoal;
      if (!MED[o.medium]) o.medium = 'charcoal';
      rand = mulberry32(o.seed >>> 0);
      noise = makeNoise(rand);
      R = { windAng: rr(-0.5, 0.5) + (rand() < 0.5 ? 0 : Math.PI), phase: rr(0, TAU), breathP: rr(500, 1100), lightAng: rr(0, TAU) };
      sheenLUT = new Float32Array(1024);
      for (let j = 0; j < 1024; j++) { const d = (j / 1023 - 0.5) * 5; sheenLUT[j] = 0.12 + 0.88 * Math.exp(-d * d); }
      img = ctx.createImageData(W, H);
      buf32 = new Uint32Array(img.data.buffer);
      frame = 0; t = 0;
      stats = { gusts: 0, sweeps: 0, cov: 0 };
      sheet = { n: 1, state: 'drawing', at: 0 };
      finger = { lc: 0, lk: 0, x: 0, y: 0, lr: 0, lg: 0, lb: 0, la: 0 };
      freshSheet();
      render();
    }

    function tick() {
      if (paused) return;
      frame++; t += o.pace;
      // the hands
      for (let i = hands.length - 1; i >= 0; i--) if (!hands[i].step()) hands.splice(i, 1);
      if (Wt) inkTick();
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
      if (sheet.state === 'finished') {
        // a finished silverpoint is left alone to tarnish, then laid aside for a new sheet
        if (t - sheet.at > 1800) { sheet.n++; sheet.state = 'drawing'; freshSheet(); }
        render();
        return;
      }
      // new gestures, on a slow breath
      const breath = 0.5 + 0.5 * Math.sin((t / R.breathP) * TAU + R.phase);
      accSpawn += (o.density / 60) * (0.25 + 0.95 * breath) * o.pace;
      while (accSpawn >= 1) { accSpawn -= 1; if (hands.length < 200) spawnOne(); }
      // the palimpsest
      if (frame % 40 === 0) {
        stats.cov = coverage();
        const thr = o.fill * (o.medium === 'silverpoint' ? 0.7 : o.medium === 'pastel' ? 3.2 : o.medium === 'ink' ? 1.6 : 1);
        if (stats.cov > thr && t - lastSweep > 600) {
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

    // the visitor's finger: dragging smears the sheet and blows the wind (silver will not smear)
    function drag(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L < 0.5) return;
      const r = 11 * u, ds = r * 0.35, m = o.medium, k = 0.35 * Math.max(0.3, o.smudge);
      if (m !== 'silverpoint') for (let s = 0; s <= L; s += ds) {
        const x = x0 + (dx * s) / L, y = y0 + (dy * s) / L;
        if (m === 'pastel') pblend(finger, x, y, r, k);
        else if (m === 'ink') inkStamp({ tool: 'water' }, x, y, r, 1);
        else smudge(finger, x, y, r, m === 'graphite' ? k * 1.3 : k);
      }
      push = { x: x1, y: y1, vx: (dx / L) * Math.min(6, L * 0.4), vy: (dy / L) * Math.min(6, L * 0.4), life: 1 };
    }
    function touch(x, y) {
      const i = clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1);
      finger.lc = C[i]; finger.lk = K[i];
      if (PR) { finger.lr = PR[i]; finger.lg = PG[i]; finger.lb = PB[i]; finger.la = C[i]; }
    }

    reset();

    return {
      tick, reset, render,
      setOptions(n) { o = Object.assign(o, n); },
      toSheet(cx, cy) { const b = canvas.getBoundingClientRect(); return [((cx - b.left) / b.width) * W, ((cy - b.top) / b.height) * H]; },
      drag, touch,
      gust() { gust(); },
      sweep() { lastSweep = t; sweep(rr(0.25, 0.75) * W, rr(0.25, 0.75) * H); },
      splatter(x, y) { const w = wind(x, y); splatter(x, y, Math.atan2(w[1], w[0])); },
      pause(v) { paused = v == null ? !paused : v; return paused; },
      status() {
        const w = wind(W / 2, H / 2);
        return { hands: hands.length, gusting: gusts.length > 0, cov: stats.cov, sweeps: stats.sweeps, gusts: stats.gusts,
          windDeg: Math.round((Math.atan2(w[1], w[0]) * 180) / Math.PI), windMag: Math.hypot(w[0], w[1]), paused,
          medium: o.medium, view: o.view, sheet: sheet.n, finished: sheet.state === 'finished' };
      },
      canvas,
    };
  }

  global.Weather = { create, GROUNDS, MEDIA };
})(window);
