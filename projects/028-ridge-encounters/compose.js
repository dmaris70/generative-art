/*
 * compose.js (027) — not a skyline any more: a PLACE, a BODY standing in it, and WEATHER deciding what is seen.
 *
 *   terrain  a 1024² heightfield: one spine whose plan IS the source skyline (parts.js), ridged ground around it,
 *            gullies carved by real flow accumulation down the fall lines, tilted bedding planes cutting the surface
 *   light    one low sun, cast shadows, cloud shadow on the ground (the source's dark hollow)
 *   camera   the seed looks for somewhere to stand — scored so the frame holds a fragment, a diagonal, an imbalance
 *            between the two sheets, and never a whole centred peak
 *   weather  a cloud deck that hugs the ground, banks up on the windward side and thins in the lee; its density is
 *            solved so that each register shows exactly its budget of the land
 *   smear    the body's movement through depth: near ground streaks, far ground holds
 *
 * Five registers, named for what they do to you, not for a landform: exposure · looming · whiteout · passage · clearing.
 * Output: two SHEET objects (left, right of the cut) for assets/drybrush.js. Pure arithmetic + seeded PRNG.
 */
(function (global) {
  'use strict';
  const REGIMES = ['exposure', 'looming', 'whiteout', 'passage', 'clearing'];
  const EVENTS = ['none', 'tarn', 'hut', 'bird', 'moon'];   // rare: about one seed in five carries one
  const BUDGET = { exposure: 0.78, looming: 0.84, whiteout: 0.9, passage: 0.55, clearing: 0.3 };   // share of the land left visible
  const COVER = { exposure: 0.6, looming: 0.72, whiteout: 0.62, passage: 0.68, clearing: 0.66 };    // share of the frame that is land
  const N = 1024, FAR = 1500;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeNoise(R) {
    const perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = R(); }
    for (let i = 255; i > 0; i--) { const j = (R() * (i + 1)) | 0, t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X = xi & 255, Y = yi & 255;
      const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = val[perm[perm[X] + Y]], b = val[perm[perm[X + 1] + Y]], c = val[perm[perm[X] + Y + 1]], d = val[perm[perm[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, oct) => { let s = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { s += a * n2(x, y); n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; } return s / n; };
    const ridged = (x, y, oct) => { let s = 0, a = 0.5, wgt = 1; for (let o = 0; o < oct; o++) { let n = 1 - Math.abs(2 * n2(x, y) - 1); n *= n * wgt; wgt = Math.min(1, n * 2.2); s += n * a; a *= 0.5; x = x * 2.07 + 5.3; y = y * 2.07 + 1.9; } return s; };
    return { n2, fbm, ridged };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  function profileFn(pts) {
    return function (u) {
      u = Math.min(2, Math.max(0, u));
      let k = 0; while (k < pts.length - 2 && u > pts[k + 1][0]) k++;
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
      const t = (u - p1[0]) / (p2[0] - p1[0]);
      const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]), m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }
  function boxBlur(a, n, r, passes) {
    const b = new Float32Array(n * n), k = 2 * r + 1;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < n; y++) { const o = y * n; let s = 0; for (let i = -r; i <= r; i++) s += a[o + clamp(i, 0, n - 1)]; for (let x = 0; x < n; x++) { b[o + x] = s / k; s += a[o + Math.min(n - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < n; x++) { let s = 0; for (let i = -r; i <= r; i++) s += b[clamp(i, 0, n - 1) * n + x]; for (let y = 0; y < n; y++) { a[y * n + x] = s / k; s += b[Math.min(n - 1, y + r + 1) * n + x] - b[Math.max(0, y - r) * n + x]; } }
    }
    return a;
  }
  const mirror = (v, n) => { v = Math.abs(v) % (2 * (n - 1)); return v > n - 1 ? 2 * (n - 1) - v : v; };   // the land continues, reflected, past the edge of the grid
  function bil(A, n, x, z) {
    x = clamp(x, 0, n - 1.001); z = clamp(z, 0, n - 1.001);
    const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi, o = zi * n + xi;
    return (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fz) + (A[o + n] * (1 - fx) + A[o + n + 1] * fx) * fz;
  }

  // ───────────────────────── the place ─────────────────────────
  // base 1 — invented ground: one spine whose plan is the source skyline, ridged warped land around it
  function baseInvented(parts, R, Nz, H) {
    const P = profileFn(parts.profile), flip = R() < 0.5 ? -1 : 1;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const wx = x + 280 * (Nz.fbm(x / 310 + 3.1, z / 310, 3) - 0.5), wz = z + 280 * (Nz.fbm(x / 310 + 40.7, z / 310 + 11.3, 3) - 0.5);
      const u = clamp(wx / N * 2, 0, 2), p = P(u);
      const zs = N * (0.5 + (p - 0.52) * 0.9 * flip), d = Math.abs(wz - zs);
      const crest = (0.5 + 0.5 * (1 - (p - 0.195) / 0.65)) * (0.6 + 0.8 * Nz.fbm(wx / 170, wz / 420, 3));
      const rg = Nz.ridged(wx / 430, wz / 430, 6);
      H[z * N + x] = (0.72 * crest * Math.exp(-d / 230) * (0.5 + 1.0 * rg) + 0.4 * rg) * 230;
    }
  }
  // base 2 — a real range (dem/*.bin, ~20–30 m per pixel): the seed takes the quarter of the tile with the most relief,
  // turns and mirrors it, and brings it up ×4 (Catmull-Rom); what the survey cannot see below 30 m is grown back as
  // slope-scaled fractal, and then weathered by the same water as the invented ground.
  function baseReal(dem, R, Nz, H) {
    const n = dem.size, D = dem.data, w0 = 256, lake = new Uint8Array(N * N); let any = false, bx = 0, bz = 0, bs = -1;
    for (let k = 0; k < 14; k++) {
      const x0 = (R() * (n - w0)) | 0, z0 = (R() * (n - w0)) | 0; let mn = 1e9, mx = 0, m = 0, v = 0, c = 0;
      for (let j = 0; j < w0; j += 8) for (let i = 0; i < w0; i += 8) { const h = D[(z0 + j) * n + x0 + i]; mn = Math.min(mn, h); mx = Math.max(mx, h); m += h; v += h * h; c++; }
      m /= c; const sc = (mx - mn) * Math.sqrt(Math.max(0, v / c - m * m)); if (sc > bs) { bs = sc; bx = x0; bz = z0; }
    }
    // water the survey already knows about: large dead-flat patches in the tile are lakes, fjords or the sea
    if (!dem.flat) { let dmax = 0; for (let i = 0; i < n * n; i += 7) if (D[i] > dmax) dmax = D[i]; const hi45 = dmax * 0.45; const f = new Uint8Array(n * n), lab = new Int32Array(n * n); for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) { const i = z * n + x, v = D[i]; if (D[i - 1] === v && D[i + 1] === v && D[i - n] === v && D[i + n] === v) f[i] = 1; }
      let id = 0; for (let i = 0; i < n * n; i++) { if (!f[i] || lab[i]) continue; id++; const q = [i], cells = [i]; lab[i] = id; while (q.length) { const c = q.pop(); for (const o of [1, -1, n, -n]) { const j = c + o; if (j >= 0 && j < n * n && f[j] && !lab[j]) { lab[j] = id; q.push(j); cells.push(j); } } } if (cells.length < 60 || D[i] > hi45) for (const c of cells) f[c] = 0; }   /* small, or high in the tile: a flattened glacier or a data void, not water */
      dem.flat = f; }
    const rot = (R() * 4) | 0, flipX = R() < 0.5, vs = 0.1 / (dem.mpp / 4) * 1.3;               // decimetres → cells, a little taller
    const at = (i, j) => D[clamp(bz + j, 0, n - 1) * n + clamp(bx + i, 0, n - 1)];
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const E = w0 - 1.001;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let u = x / 4, v = z / 4; if (flipX) u = E - u;
      for (let r = 0; r < rot; r++) { const t = u; u = v; v = E - t; }
      const i = u | 0, j = v | 0, fu = u - i, fv = v - j, row = q => cr(at(i - 1, j + q), at(i, j + q), at(i + 1, j + q), at(i + 2, j + q), fu);
      H[z * N + x] = cr(row(-1), row(0), row(1), row(2), fv) * vs;
      if (dem.flat[clamp(bz + Math.round(v), 0, n - 1) * n + clamp(bx + Math.round(u), 0, n - 1)]) { lake[z * N + x] = 1; any = true; }
    }
    boxBlur(H, N, 3, 2);                                                                          // the survey's 30 m stair-steps
    const G = Float32Array.from(H);
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x, sl = Math.min(1, Math.hypot(G[i + 1] - G[i - 1], G[i + N] - G[i - N]) * 0.5);
      H[i] += (Nz.ridged(x / 150 + 3, z / 150, 6) - 0.3) * (1 + 9 * sl) + (Nz.fbm(x / 9, z / 9, 3) - 0.5) * 1.2 * sl;   // broad buttresses; the fine cutting is left to the water
    }
    if (!any) return null;
    // one level per body of water (the survey's flat cells still differ by decimetres; interpolated, that rippled and stepped)
    const lab = new Int32Array(N * N), lv = [0]; let nb = 0;
    for (let i = 0; i < N * N; i++) { if (!lake[i] || lab[i]) continue; nb++; const q = [i], hs = []; lab[i] = nb;
      while (q.length) { const c = q.pop(); hs.push(G[c]); const cx = c % N, cz = (c / N) | 0; for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + ox, z = cz + oz; if (x < 0 || z < 0 || x >= N || z >= N) continue; const j = z * N + x; if (lake[j] && !lab[j]) { lab[j] = nb; q.push(j); } } }
      hs.sort((a, b) => a - b); lv.push(hs[hs.length >> 1]); }
    const level = new Float32Array(N * N); for (let i = 0; i < N * N; i++) if (lake[i]) level[i] = lv[lab[i]];
    return { lake, level };
  }

  // water: droplets pick up rock where they run fast and drop it where they slow (after Hans Beyer) — real gullies,
  // and a map of where the debris came to rest (the scree). Then the steepest faces shed to their angle of repose.
  function weather(H, R, drops) {
    const dep = new Float32Array(N * N), rad = 3, bo = [], bw = []; let ws = 0;
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { const d = Math.hypot(i, j); if (d < rad) { bo.push(j * N + i); bw.push(1 - d / rad); ws += 1 - d / rad; } }
    const BO = Int32Array.from(bo), BW = Float32Array.from(bw.map(v => v / ws)), BN = BO.length, NB4 = Int32Array.of(1, N, -1, -N);
    for (let n = 0; n < drops; n++) {
      let x = 4 + R() * (N - 9), z = 4 + R() * (N - 9), dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
      for (let life = 0; life < 40; life++) {
        const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi, o = zi * N + xi;
        const h00 = H[o], h10 = H[o + 1], h01 = H[o + N], h11 = H[o + N + 1];
        const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz, gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        const hOld = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
        dx = dx * 0.06 - gx * 0.94; dz = dz * 0.06 - gz * 0.94; const len = Math.hypot(dx, dz); if (len < 1e-6) break; dx /= len; dz /= len;
        x += dx; z += dz; if (x < 4 || z < 4 || x > N - 5 || z > N - 5) break;
        const xj = x | 0, zj = z | 0, ax = x - xj, az = z - zj, p = zj * N + xj;
        const dh = (H[p] * (1 - ax) + H[p + 1] * ax) * (1 - az) + (H[p + N] * (1 - ax) + H[p + N + 1] * ax) * az - hOld, cap = Math.max(-dh, 0.01) * speed * water * 5;
        if (sed > cap || dh > 0) {
          const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * 0.3; sed -= amt;
          H[o] += amt * (1 - fx) * (1 - fz); H[o + 1] += amt * fx * (1 - fz); H[o + N] += amt * (1 - fx) * fz; H[o + N + 1] += amt * fx * fz; dep[o] += amt;
        } else {
          const amt = Math.min((cap - sed) * 0.3, -dh); for (let q = 0; q < BN; q++) H[o + BO[q]] -= amt * BW[q]; sed += amt;
        }
        speed = Math.sqrt(Math.max(0, speed * speed - dh * 4)); water *= 0.98;
      }
    }
    for (let pass = 0; pass < 2; pass++) for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x; for (let q = 0; q < 4; q++) { const o = NB4[q], d = H[i] - H[i + o] - 1.25; if (d > 0) { H[i] -= d * 0.22; H[i + o] += d * 0.22; dep[i + o] += d * 0.1; } }
    }
    return boxBlur(dep, N, 2, 2);
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()); let TIMES = {};
  function buildTerrain(parts, R, Nz, dem, ev, RE) {
    const H = new Float32Array(N * N); let t0 = now(); const mark = k => { const t = now(); TIMES[k] = Math.round(t - t0); t0 = t; };
    const known = dem ? baseReal(dem, R, Nz, H) : (baseInvented(parts, R, Nz, H), null);
    // bedding: tilted planes through the whole massif. Hard beds stand as ledges, soft ones recess — relief, not paint.
    const strike = R() * 6.2832, dip = 0.25 + R() * 0.55, bn = [Math.sin(dip) * Math.cos(strike), Math.cos(dip), Math.sin(dip) * Math.sin(strike)];
    const period = 9 + R() * 14, ledge = 0.25 + R() * 0.5, bed = (x, z, h) => (x * bn[0] + h * bn[1] * 1.5 + z * bn[2] + 18 * Nz.n2(x / 110, z / 110)) / period;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, t = bed(x, z, H[i]), f = t - Math.floor(t), how = ledge * sstep(0.3, 0.7, Nz.fbm(x / 260 + 3, z / 260 + 8, 3));   // beds come and go across the range
      H[i] += (Math.floor(t) + sstep(0.25, 0.75, f) - t) * period * how / (bn[1] * 1.5);
    }
    mark('base');
    const dep = weather(H, R, dem ? 160000 : 90000); mark('water');
    // gullies: water finds the fall lines (D8 flow accumulation over a height-sorted sweep), then cuts
    const Q = 4096; let hmax = 0; for (let i = 0; i < N * N; i++) if (H[i] > hmax) hmax = H[i];
    const cnt = new Uint32Array(Q + 1), order = new Uint32Array(N * N);
    for (let i = 0; i < N * N; i++) cnt[Q - 1 - Math.min(Q - 1, (H[i] / hmax * Q) | 0) + 1]++;
    for (let i = 0; i < Q; i++) cnt[i + 1] += cnt[i];
    for (let i = 0; i < N * N; i++) order[cnt[Q - 1 - Math.min(Q - 1, (H[i] / hmax * Q) | 0)]++] = i;
    const acc = new Float32Array(N * N).fill(1), nb = [-N - 1, -N, -N + 1, -1, 1, N - 1, N, N + 1];
    for (let k = 0; k < N * N; k++) {
      const i = order[k], x = i % N, z = (i / N) | 0; if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue;
      let best = -1, drop = 0;
      for (let j = 0; j < 8; j++) { const dd = (H[i] - H[i + nb[j]]) * (j === 0 || j === 2 || j === 5 || j === 7 ? 0.7071 : 1); if (dd > drop) { drop = dd; best = j; } }
      if (best >= 0) acc[i + nb[best]] += acc[i];
    }
    const carve = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) carve[i] = Math.min(16, 1.5 * Math.pow(acc[i], 0.36) - 1.5);
    boxBlur(carve, N, 2, 2);
    for (let i = 0; i < N * N; i++) H[i] -= carve[i];
    boxBlur(H, N, 1, 1);                                            // weathering: no needle survives

    mark('flow');
    // materials: beds, scree, wet gullies — and snow, which lodges where the ground lets it and the wind leaves it
    const alb = new Float32Array(N * N), rock = new Float32Array(N * N), snowMap = new Float32Array(N * N), Hs = boxBlur(Float32Array.from(H), N, 24, 2);
    const slopeS = new Float32Array(N * N); for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const i = z * N + x; slopeS[i] = Math.hypot(H[i - 1] - H[i + 1], H[i - N] - H[i + N]) * 0.5; } boxBlur(slopeS, N, 3, 2);   /* snow lies on a slope as a whole, not cell by cell */
    let hlo = 1e9, hhi = -1e9; for (let i = 0; i < N * N; i += 17) { if (H[i] < hlo) hlo = H[i]; if (H[i] > hhi) hhi = H[i]; }
    const season = R(), cover = season < 0.22 ? 0 : season < 0.7 ? 0.55 : 1, snowline = hlo + (hhi - hlo) * (cover === 1 ? 0.15 + R() * 0.3 : 0.4 + R() * 0.35), wa = R() * 6.2832, wx = Math.cos(wa), wz = Math.sin(wa);
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x, nx = H[i - 1] - H[i + 1], nz = H[i - N] - H[i + N], slope = Math.sqrt(nx * nx + nz * nz) * 0.5;
      const t = bed(x, z, H[i]), band = Nz.fbm(t * period / 34, 0.37, 4), hard = sstep(0.42, 0.58, band);
      let a = 0.34 + 0.34 * (band - 0.5) * 2 + 0.16 * (Nz.fbm(x / 23, z / 23, 3) - 0.5);
      const scree = Math.min(1, sstep(0.95, 0.4, slope) * sstep(0.35, 0.7, Nz.fbm(x / 190 + 9, z / 190 + 4, 4)) * 0.5 + sstep(0.03, 0.5, dep[i]) * sstep(1.3, 0.5, slope));
      a = lerp(a, 0.7, scree * 0.7) * (1 - 0.45 * sstep(3, 12, carve[i]));
      let snow = 0;
      if (cover > 0) {
        const scour = sstep(0, 0.5, (nx * wx + nz * wz) * 0.5) * sstep(0, 6, H[i] - Hs[i]);                 // windward and proud: blown clean
        const lodge = Math.max(sstep(2, 9, carve[i]), sstep(0.02, 0.3, dep[i]), sstep(0, -5, H[i] - Hs[i]) * 0.6);   // gullies, debris cones, hollows keep it
        const line = sstep(snowline - 22, snowline + 22, H[i] + 46 * (Nz.fbm(x / 95 + 31, z / 95 + 7, 4) - 0.5));
        snow = clamp(line * sstep(1.25 - 0.35 * (1 - cover), 0.55, slopeS[i]) * (1 - 0.8 * scour) * (cover + (1 - cover) * (0.25 + lodge)) + lodge * line * 0.5, 0, 1);
        snow = sstep(0.35, 0.6, snow) * sstep(3.0, 1.8, slopeS[i]);
        if (slopeS[i] > 0.8) snow = lerp(snow, sstep(0.25, 0.5, line * (cover + (1 - cover) * 0.4)), sstep(0.8, 1.6, slopeS[i]));   /* on a steep face the snow is a sheet, not a patchwork: it follows the snowline, not every hollow */   /* and none on a wall */                                                                  // snow has an edge
      }
      snowMap[i] = snow; alb[i] = lerp(a, 0.97, snow); rock[i] = (1 - scree * 0.7) * (0.6 + 0.4 * hard) * (1 - snow * 0.85);
    }
    mark('light');
    // the ridges (for standing on, and for the track): ground no water has crossed, proud of its surroundings
    const ridge = [];
    for (let proud = 5; proud >= 1 && ridge.length < 120; proud -= 2) { ridge.length = 0; for (let z = 200; z < N - 200; z += 4) for (let x = 200; x < N - 200; x += 4) { const i = z * N + x; if (acc[i] <= 2 && H[i] - Hs[i] > proud) ridge.push([x, z, H[i]]); } }   /* well inside the grid: what lies past its edge is a reflection */
    // ── rare events that belong to the land
    let water = null, target = null;
    if (known) { water = known.lake;
      // grow the water to every cell that lies below its body's level within a few cells of the mask, so the shore follows the ground
      const lvl = known.level, grown = new Uint8Array(N * N), L2 = new Float32Array(N * N);
      for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) { const i = z * N + x; if (water[i]) { grown[i] = 1; L2[i] = lvl[i]; continue; } let near = 0; for (let dz = -3; dz <= 3 && !near; dz++) for (let dx = -3; dx <= 3; dx++) { const j = i + dz * N + dx; if (water[j]) { near = lvl[j]; break; } } if (near && H[i] < near + 0.3) { grown[i] = 1; L2[i] = near; } }
      water = grown; for (let i = 0; i < N * N; i++) if (water[i]) { H[i] = L2[i]; rock[i] = 0; snowMap[i] = 0; } }   /* the survey's own water lies flat again after all that weathering */
    if (ev === 'tarn') {                 // a basin where the water gathers and the ground lies easy, filled to a level: one flat pale thing among diagonals
      let bi = -1, bs = 0; for (let k = 0; k < 4000; k++) { const x = 140 + (RE() * (N - 280)) | 0, z = 140 + (RE() * (N - 280)) | 0, i = z * N + x, sl = Math.hypot(H[i - 3] - H[i + 3], H[i - 3 * N] - H[i + 3 * N]) / 6; if (acc[i] < 60 || sl > 0.45) continue; const sc = Math.log(acc[i]) * (1 - sl) * (0.6 + 0.4 * (H[i] - hlo) / (hhi - hlo)); if (sc > bs) { bs = sc; bi = i; } }
      if (bi >= 0) {                     // flood from the centre inside a radius; the cells where it would leave are dammed (a low moraine),
        // but only if the dam is short relative to the shore — a long dam means the water would be perched on open ground (it rendered as a cylinder)
        const cx = bi % N, cz = (bi / N) | 0, rad = 22 + RE() * 26; let best = null;
        for (let lift = 5; lift >= 0.8 && !best; lift *= 0.8) {
          const level = H[bi] + lift, mask = new Uint8Array(N * N), q = [bi]; mask[bi] = 1; let n = 0, sx = 0, sz = 0, exits = 0, shore = 0;
          while (q.length) { const i = q.pop(), x = i % N, z = (i / N) | 0; n++; sx += x; sz += z;
            for (const o of [1, -1, N, -N]) { const j = i + o; if (mask[j]) continue; if (H[j] >= level) { shore++; continue; } const d = Math.hypot((j % N) - cx, ((j / N) | 0) - cz); if (d < rad) { mask[j] = 1; q.push(j); } else { exits++; mask[j] = 2; } } }
          if (n > 250 && exits < shore * 0.45) best = { level, mask, n, sx, sz };
        }
        if (best) { const { level, mask, n, sx, sz } = best;
          for (let i = 0; i < N * N; i++) if (mask[i] === 2) { mask[i] = 0; H[i] = level + 0.2 + 0.3 * Nz.n2((i % N) / 5, ((i / N) | 0) / 5); }   /* the dam: barely proud of the water */
          for (let pass = 0; pass < 2; pass++) for (let z = cz - 60; z <= cz + 60; z++) for (let x = cx - 60; x <= cx + 60; x++) { const i = z * N + x; if (mask[i]) continue; let near = false; for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) if (mask[i + dz * N + dx]) { near = true; break; } if (near) H[i] = (H[i] * 2 + H[i - 1] + H[i + 1] + H[i - N] + H[i + N]) / 6; }
          if (water) for (let i = 0; i < N * N; i++) if (water[i]) mask[i] = 1;
          water = mask; for (let i = 0; i < N * N; i++) if (mask[i]) { H[i] = level; rock[i] = 0; snowMap[i] = 0; } target = { x: sx / n, z: sz / n, y: level, kind: 'tarn' };
        }
      }
    } else if (ev === 'hut') {           // something built, small enough to give the mountain its size
      let bi = -1, bs = -1; for (let k = 0; k < 3000; k++) { const x = 160 + (RE() * (N - 320)) | 0, z = 160 + (RE() * (N - 320)) | 0, i = z * N + x, sl = Math.hypot(H[i - 3] - H[i + 3], H[i - 3 * N] - H[i + 3 * N]) / 6; if (sl > 0.3 || acc[i] > 12) continue; const pr = H[i] - Hs[i], sc = (1 - sl) * (1 - Math.abs(pr - 3) * 0.12) + RE() * 0.2;   /* a shoulder, not a summit */ if (sc > bs) { bs = sc; bi = i; } }
      if (bi >= 0) { const x0 = bi % N, z0 = (bi / N) | 0, base = H[bi], wide = RE() < 0.5;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -3; dx <= 3; dx++) { const ax = wide ? dx : dz, az = wide ? dz : dx, i = (z0 + az) * N + x0 + ax; H[i] = base + 3.4 + 2.2 * (1 - Math.abs(dz) / 2.5); alb[i] = cover > 0 && Math.abs(dz) < 2 ? 0.9 : 0.07; rock[i] = 0; }
        target = { x: x0, z: z0, y: base + 3, kind: 'hut' }; }
    }
    return { H, Hs, alb, rock, snow: snowMap, ridge, carve, cover, water, target, lum: new Float32Array(N * N) };
  }

  // ───────────────────────── light ─────────────────────────
  // decided AFTER the standpoint, because what light does depends on where you are: side light models the rock,
  // against the light the land goes black and the cloud glows, overcast flattens everything to tone.
  function lightTerrain(T, L, Nz) {
    const H = T.H, sun = L.sun, tanEl = sun[1] / Math.hypot(sun[0], sun[2]), lum = T.lum;
    // the surface normal for shading comes from a slope-smoothed height: on steep ground the ridged micro-relief shades as stripes
    // (each facet a hard dark band once magnified from a standpoint below), so the steeper the ground the broader the normal
    const Hn = boxBlur(Float32Array.from(H), N, 2, 2);
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x, rx = H[i - 1] - H[i + 1], rz = H[i - N] - H[i + N], st = Math.max(sstep(0.7, 1.8, Math.hypot(rx, rz) * 0.5), 0.8 * T.snow[i]);   /* and snow drifts smooth over small relief at any slope */
      const nx = lerp(rx, Hn[i - 1] - Hn[i + 1], st), nz = lerp(rz, Hn[i - N] - Hn[i + N], st), il = 1 / Math.sqrt(nx * nx + 4 + nz * nz);
      const lam = Math.max(0, (nx * sun[0] + 2 * sun[1] + nz * sun[2]) * il), slopeHere = Math.min(2, Math.hypot(nx, nz) * 0.5); let occ = 0;
      if (lam > 0 && L.direct > 0) for (let s = 0, dist = 3; s < 26 && occ < 1; s++, dist *= 1.22) {
        const qx = (x + sun[0] * dist) | 0, qz = (z + sun[2] * dist) | 0; if (qx < 0 || qz < 0 || qx >= N || qz >= N) break;
        const over = H[qz * N + qx] - (H[i] + 1.5 + dist * tanEl); if (over > 0) occ = Math.max(occ, Math.min(1, over / (dist * 0.1 + 2 + 6 * slopeHere)));
      }
      const cs = 1 - 0.6 * sstep(0.5, 0.68, Nz.fbm(x / 360 + 21, z / 360 + 2, 3));                        // cloud shadow lying on the land
      if (T.water && T.water[i]) { const rip = Nz.n2(x / 1.3 + z * 0.4, z / 9); lum[i] = (L.mode === 'against' ? 0.8 : L.mode === 'moon' ? 0.42 : 0.7) * (0.93 + 0.12 * rip) * (0.85 + 0.15 * cs); T.rock[i] = 0; continue; }   /* still water holds the sky — never brighter than the cloud it mirrors */   /* still water holds the sky */
      lum[i] = (L.rime ? lerp(T.alb[i], 0.92, L.rime) : T.alb[i]) * (L.ambient * (0.55 + 0.9 * il) + L.direct * lam * (1 - occ) * cs);
    }    // a wall seen from below is magnified many times over: any cell-to-cell change in its light becomes a stripe. Smooth the light
    // on steep ground (walls, > ~50°) with a wide blur, leaving gentle ground untouched.
    { const sm = boxBlur(Float32Array.from(lum), N, 3, 2);
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const i = z * N + x, st = sstep(1.6, 3.0, Math.hypot(H[i - 1] - H[i + 1], H[i - N] - H[i + N]) * 0.5); if (st > 0) lum[i] = lerp(lum[i], sm[i], st); } }
  }


  // ───────────────────────── the ground at your feet ─────────────────────────
  // The land is surveyed (or invented) at one unit. A body stands much closer to it than that. Around the standpoint a second,
  // finer ground is grown (768² cells of 1/8 unit): the coarse land brought up smoothly, then roughened, strewn with stones and
  // blocks (more on scree), drifted and wind-ridged where there is snow, with the trodden way and its cairns built into it.
  // It is lit by the same sun, its own small shadows cast, and folded back into the coarse light so the big shadows still hold.
  function nearGround(T, cam, L, Nz) {
    const M = 768, cell = 0.125, x0 = cam.x - M * cell / 2, z0 = cam.z - M * cell / 2, h = new Float32Array(M * M), lum = new Float32Array(M * M), rkP = new Float32Array(M * M), trk = new Float32Array(M * M), prints = new Float32Array(M * M), wet = new Uint8Array(M * M), bw = new Float32Array(M * M), bh = new Float32Array(M * M);
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const HH = (i, j) => T.H[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
    const sm = new Float32Array(M * M), stone = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const X = x0 + i * cell, Z = z0 + j * cell, xi = Math.floor(X), zi = Math.floor(Z), fx = X - xi, fz = Z - zi, row = q => cr(HH(xi - 1, zi + q), HH(xi, zi + q), HH(xi + 1, zi + q), HH(xi + 2, zi + q), fx);
      const base = cr(row(-1), row(0), row(1), row(2), fz), snowy = bil(T.snow, N, X, Z), scree = 1 - bil(T.rock, N, X, Z) / Math.max(0.15, 1 - snowy * 0.85);
      const clear = sstep(1, 6, Math.hypot(X - cam.x, Z - cam.z));   /* you are not standing inside a boulder */
      const rough = (Nz.fbm(X / 2.3 + 11, Z / 2.3, 4) - 0.5) * 0.24 + (Nz.fbm(X / 0.5, Z / 0.5 + 7, 3) - 0.5) * 0.13;
      const wxs = X + 1.3 * (Nz.n2(X / 1.9 + 50, Z / 1.9) - 0.5) + 0.5 * (Nz.n2(X / 0.45, Z / 0.45 + 60) - 0.5), wzs = Z + 1.3 * (Nz.n2(X / 1.9, Z / 1.9 + 70) - 0.5) + 0.5 * (Nz.n2(X / 0.45 + 80, Z / 0.45) - 0.5);
      const s1 = 0.62 * Nz.n2(wxs / 0.6 + 3, wzs / 0.6 + 19) + 0.38 * Nz.n2(wxs / 0.27 + 9, wzs / 0.27), s2 = 0.65 * Nz.n2(wxs / 2.6 + 40, wzs / 2.6) + 0.35 * Nz.n2(wxs / 1.1, wzs / 1.1 + 33), lots = 0.55 + 0.45 * clamp(scree, 0, 1);
      const st = Math.pow(Math.max(0, s1 - (0.66 - 0.1 * lots)) / 0.34, 1.4) * 0.2 + Math.pow(Math.max(0, s2 - (0.7 - 0.08 * lots)) / 0.3, 1.6) * 0.7 * clear;   // stones, and the odd block
      const ridges = (Nz.n2((X + Z * 0.6) / 5.5, (Z - X * 0.6) / 0.7) - 0.5) * 0.16;                                                               // sastrugi
      // steep ground: no snow, no stones — a face is a face (drawing snow on a resampled wall stretched it into ribbons)
      const steep = sstep(1.1, 2.2, Math.hypot(HH(xi + 1, zi) - HH(xi - 1, zi), HH(xi, zi + 1) - HH(xi, zi - 1)) * 0.5);
      const i0 = j * M + i; sm[i0] = snowy * (1 - steep); stone[i0] = st * clear * (1 - steep);
      // water: any cell of the 2×2 the point lies in is water → dead flat at the survey level, nothing strewn. (Interpolating across the shore raised a ledge.)
      { let wtr = false, lvl = 0; if (T.water) for (const [qx, qz] of [[xi, zi], [xi + 1, zi], [xi, zi + 1], [xi + 1, zi + 1]]) { const q = clamp(qz, 0, N - 1) * N + clamp(qx, 0, N - 1); if (T.water[q]) { wtr = true; lvl = T.H[q]; } }
        if (wtr) { h[i0] = Math.min(base, lvl); stone[i0] = 0; sm[i0] = 0; wet[i0] = 1; continue; } }
      h[i0] = base + lerp(rough + st * clear, rough * 0.3 + ridges + Math.max(0, st * clear - 0.1), snowy) * (1 - 0.85 * steep);
    }
    // the way, and what was built beside it
    const P = T.path || []; const stamp = (X, Z, rad, f) => { const ci = (X - x0) / cell, cj = (Z - z0) / cell, r = Math.ceil(rad / cell); for (let j = Math.max(0, (cj - r) | 0); j <= Math.min(M - 1, (cj + r) | 0); j++) for (let i = Math.max(0, (ci - r) | 0); i <= Math.min(M - 1, (ci + r) | 0); i++) { const d = Math.hypot(i - ci, j - cj) * cell; if (d < rad) f(j * M + i, d / rad); } };
    for (let k = 0; k + 1 < P.length; k++) { const a = P[k], b = P[k + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12); if (Math.min(Math.hypot(a[0] - cam.x, a[1] - cam.z), Math.hypot(b[0] - cam.x, b[1] - cam.z)) > 80) continue;
      for (let q = 0; q < n; q++) { const f = q / n, X = lerp(a[0], b[0], f) + 0.5 * (Nz.n2(k * 0.7 + f, 1) - 0.5), Z = lerp(a[1], b[1], f) + 0.5 * (Nz.n2(k * 0.7 + f, 9) - 0.5); stamp(X, Z, 0.32, (o, u) => { const g = 1 - u * u; if (g > trk[o]) trk[o] = g; }); if (q % 3 === 0) { const hc = bil(T.H, N, X, Z); stamp(X, Z, 1.5, (o, u) => { const g = (1 - u * u) * (1 - u * u); if (g > bw[o]) { bw[o] = g; bh[o] = hc; } }); } } }
    for (let o = 0; o < M * M; o++) if (bw[o] > 0) h[o] = lerp(h[o], bh[o] + (h[o] - bh[o]) * 0.15, Math.min(1, bw[o] * 1.6));   /* a way across a slope is a bench cut into it */
    { let run = 0, foot = 1; for (let k = 0; k + 1 < P.length; k++) { const a = P[k], b = P[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; if (Math.min(Math.hypot(a[0] - cam.x, a[1] - cam.z), Math.hypot(b[0] - cam.x, b[1] - cam.z)) > 60) { run += L; continue; }
        for (let d = 0.36 - (run % 0.36); d < L; d += 0.36) { foot = -foot; const f = d / L, X = lerp(a[0], b[0], f) + 0.5 * (Nz.n2(k * 0.7 + f, 1) - 0.5) - uz * 0.1 * foot, Z = lerp(a[1], b[1], f) + 0.5 * (Nz.n2(k * 0.7 + f, 9) - 0.5) + ux * 0.1 * foot; stamp(X, Z, 0.13, (o, u) => { const g = 1 - u; if (g > prints[o]) prints[o] = g; }); } run += L; } }
    for (let o = 0; o < M * M; o++) if (trk[o] > 0) h[o] -= 0.1 * trk[o] + 0.09 * Math.max(0, prints[o]) + stone[o] * trk[o] * 0.8;                                 // trodden: a shallow trench of footprints, cleared of stones                                                  // trodden: a shallow trench, cleared of stones
    for (const c of T.cairns || []) stamp(c[0], c[1], 0.62, (o, u) => { const ci = o % M, cj = (o / M) | 0, lump = Nz.n2(ci / 1.6 + c[0], cj / 1.6 + c[1]), course = Math.floor((1 - u) * 4 + lump * 0.9) / 4;   /* a pile: broad base, stepped courses of stones, a blunt top */
      h[o] += c[2] * Math.min(1, course * 1.15) * (0.85 + 0.3 * lump); stone[o] = 1; sm[o] *= 0.2; prints[o] = -1; });   /* prints < 0 marks what was built */
    // light
    const sun = L.sun, el = Math.hypot(sun[0], sun[2]), sxn = sun[0] / el, szn = sun[2] / el, tanEl = sun[1] / el, shade = (nx, nz, sp, lit) => { const il = 1 / Math.sqrt(nx * nx + 4 * sp * sp + nz * nz), lam = Math.max(0, (nx * sun[0] + 2 * sp * sun[1] + nz * sun[2]) * il); return L.ambient * (0.55 + 0.9 * 2 * sp * il * 0.5) + L.direct * lam * lit; };
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const o = j * M + i, X = x0 + i * cell, Z = z0 + j * cell; let occ = 0;
      // small cast shadows in the fine ground: only a stone or a cairn casts one (relief the patch itself added); the smooth snow or
      // rock surface does not, whatever the sun's angle — under a low sun the old test made every ripple a hard dark streak
      if (L.direct > 0.3 && (stone[o] > 0.05 || prints[o] < 0)) for (let q = 1; q <= 7 && occ < 1; q++) { const d = q * q * 0.06, ii = (i + sxn * d / cell) | 0, jj = (j + szn * d / cell) | 0; if (ii < 0 || jj < 0 || ii >= M || jj >= M) break; const over = h[jj * M + ii] - (h[o] + 0.02 + d * tanEl); if (over > 0) occ = Math.max(occ, Math.min(0.6, over / (0.1 + d * 0.3))); }
      else if (L.direct > 0.3) { const ii = (i + sxn * 3) | 0, jj = (j + szn * 3) | 0; if (ii > 0 && jj > 0 && ii < M && jj < M) { const over = h[jj * M + ii] - (h[o] + 0.05 + 0.4 * tanEl); if (over > 0) occ = Math.min(0.35, over * 0.8); } }   /* a stone's shadow falling on plain ground: soft, short */
      const local = shade(h[o - 1] - h[o + 1], h[o - M] - h[o + M], cell, 1 - occ), coarse = shade(bil(T.H, N, X - 1, Z) - bil(T.H, N, X + 1, Z), bil(T.H, N, X, Z - 1) - bil(T.H, N, X, Z + 1), 1, 1);
      const snowHere = sm[o] * (1 - 0.85 * sstep(0.35, 0.6, stone[o]) * sstep(0.85, 0.45, sm[o])),   /* only a large stone stands through thin snow; deep snow buries them */ albC = Math.max(0.08, bil(T.alb, N, X, Z)), rockAlb = (L.rime ? lerp(albC, 0.92, L.rime) * 0.9 : Math.min(0.5, albC * 1.05)) * (0.8 + 0.4 * Nz.n2(X / 0.6 + 3.3, Z / 0.6 + 19.2)) * (1 - 0.35 * trk[o] * (1 - sm[o])) + 0.25 * trk[o] * (1 - sm[o]);
      const albP = lerp(stone[o] > 0.02 || sm[o] > 0.5 ? rockAlb : (L.rime ? lerp(albC, 0.92, L.rime) : albC) * (0.62 + 0.76 * Nz.n2(X / 0.3, Z / 0.3)) * (0.8 + 0.4 * Nz.n2(X / 1.7 + 5, Z / 1.7)), 0.95 - 0.3 * trk[o] - 0.3 * Math.max(0, prints[o]), snowHere);
      if (wet[o]) { lum[o] = bil(T.lum, N, X, Z); rkP[o] = 0; continue; }
      if (prints[o] < 0) { lum[o] = 0.2 * (0.7 + 0.6 * Nz.n2(X / 0.12, Z / 0.12)) * clamp(local / Math.max(0.05, L.ambient), 0.5, 1.6) * (L.ambient + L.direct * 0.5); rkP[o] = 1; continue; }   /* a cairn is dark, piled stone: the one thing the rime has not closed over */
      const worn = L.rime ? 1 - (0.3 * trk[o] + 0.3 * Math.max(0, prints[o])) * (1 - snowHere) : 1;   /* rime is trodden off the way */
      lum[o] = worn * bil(T.lum, N, X, Z) * clamp(local / Math.max(0.05, coarse), 0.15, 3) * clamp(albP / (L.rime ? lerp(albC, 0.92, L.rime) : albC), 0.2, 4);
      rkP[o] = (1 - snowHere) * 0.9;
    }
    return { M, cell, x0, z0, h, lum, rk: rkP, reach: M * cell / 2 - 1 };
  }

  // ───────────────────────── looking ─────────────────────────
  // voxel-space heightfield rendering, near → far, with a per-column horizon buffer. `out` null = skyline only.
  function render(T, cam, w, h, Nz, out) {
    const focal = cam.focal * w / 900, horizon = h / 2 + Math.tan(cam.pitch) * focal; let nearCover = 0, nearL = 0, nearR = 0;
    const fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw), rx = -fz, rz = fx, sky = new Float32Array(w), dist = new Float32Array(w), NG = out ? T.near : null;
    for (let sx = 0; sx < w; sx++) {
      const kx = (sx + 0.5 - w / 2) / focal, dx = fx + rx * kx, dz = fz + rz * kx;
      let lastT = 0, yb = h, t = NG ? 0.35 : 1.2, pT = 0, pD = 0, pR = 0, pH = 0, first = true;
      while (t < FAR && yb > 0) {
        const rx0 = cam.x + dx * t, rz0 = cam.z + dz * t; if (rx0 < 1 || rz0 < 1 || rx0 > N - 2 || rz0 > N - 2) break;   /* the surveyed world ends here: beyond is cloud, not a reflection */
        const px = rx0, pz = rz0;
        let hh = bil(T.H, N, px, pz), ng = 0, gu = 0, gv = 0;
        if (NG && t < NG.reach * 1.5) { gu = (cam.x + dx * t - NG.x0) / NG.cell; gv = (cam.z + dz * t - NG.z0) / NG.cell; const e = Math.min(gu, gv, NG.M - 1 - gu, NG.M - 1 - gv) * NG.cell; if (e > 0) { const gx = bil(T.H, N, Math.min(N - 1.01, px + 1), pz) - bil(T.H, N, Math.max(0, px - 1), pz), gz = bil(T.H, N, px, Math.min(N - 1.01, pz + 1)) - bil(T.H, N, px, Math.max(0, pz - 1)); ng = sstep(0, 7, e) * sstep(2.2, 1.1, Math.hypot(gx, gz) * 0.5); hh = lerp(hh, bil(NG.h, NG.M, gu, gv), ng); } }   /* not on a cliff: the fine patch cannot hold a wall */
        const sy = horizon + (cam.y - hh) * focal / t;
        if (sy < yb) {
          if (out) {
            const gsx = bil(T.H, N, Math.min(N - 1.01, px + 1), pz) - bil(T.H, N, Math.max(0, px - 1), pz), gsz = bil(T.H, N, px, Math.min(N - 1.01, pz + 1)) - bil(T.H, N, px, Math.max(0, pz - 1));
            const face = sstep(2.0, 3.4, Math.hypot(gsx, gsz) * 0.5);   /* 1 on a wall (> ~50°): a face carries no fine texture, stones or snow — it is drawn by its light alone */
            let tone = bil(T.lum, N, px, pz), rk = bil(T.rock, N, px, pz); if (ng > 0) { tone = lerp(tone, bil(NG.lum, NG.M, gu, gv), ng); rk = lerp(rk, bil(NG.rk, NG.M, gu, gv), ng); }
            const fade = sstep(3, 25, t) * sstep(1300, 200, t) * rk;
            if (fade > 0.01) {
              const cr = (ox) => Math.pow(1 - Math.abs(2 * Nz.fbm((px + ox) / 9, (pz - ox) / 9 + hh / 14, 3) - 1), 7);
              { const sgx = bil(T.H, N, Math.min(N - 1.01, px + 1), pz) - bil(T.H, N, Math.max(0, px - 1), pz), sgz = bil(T.H, N, px, Math.min(N - 1.01, pz + 1)) - bil(T.H, N, px, Math.max(0, pz - 1)), flat = sstep(3.2, 1.6, Math.hypot(sgx, sgz) * 0.5);
              tone += ((cr(1.2) - cr(0)) * 0.4 * flat * sstep(45, 170, t) + (Nz.fbm(px / 2.6, pz / 2.6, 2) - 0.5) * 0.22 + (Nz.fbm(px / 0.9, pz / 0.9, 2) - 0.5) * 0.18 * sstep(300, 40, t)) * fade * (1 - face); }
            }
            if (t < 70) {                                                 // at your feet: stones and grit, which no survey and no erosion model holds
              const nf = sstep(70, 10, t) * (1 - 0.75 * ng) * (1 - face), st = Nz.n2(px / 0.55 + 31, pz / 0.55), st2 = Nz.n2(px / 0.17, pz / 0.17 + 5), snowy = 1 - rk;
              tone += nf * (1 - 0.8 * snowy) * ((st * st * st - 0.16) * 0.55 + (st2 - 0.5) * 0.2 - sstep(0.72, 0.8, Nz.n2(px / 1.9 + 7, pz / 1.9)) * 0.16)
                + nf * snowy * ((Nz.n2((px + pz * 0.6) / 7, (pz - px * 0.6) / 0.9) - 0.5) * 0.2 - sstep(0.7, 0.85, Nz.n2(px / 3.1 + 40, pz / 3.1)) * 0.22 * st);   /* snow: sastrugi, and stones standing through it */
            }
            if (face > 0 && rk < 0.9) { const bare = bil(T.lum, N, px, pz) * 0.42; tone = lerp(tone, bare, face * (1 - rk)); rk = lerp(rk, 1, face); }   /* snow cannot lie on a wall */
            { const tk = bil(T.trk, N, px, pz) * (1 - ng); tone += (rk < 0.35 || T.rime) ? -0.26 * tk * tk : 0.75 * tk; }   /* the coarse way, where the fine ground has not taken over */
            if (first) { pT = tone; pD = t; pR = rk; pH = hh; first = false; }
            const y0 = Math.max(0, Math.ceil(sy)), span = yb - sy;
            for (let y = yb - 1; y >= y0; y--) {
              const f = (yb - y) / span, o = y * w + sx;
              out.tone[o] = lerp(pT, tone, f); out.depth[o] = lerp(pD, t, f); out.rock[o] = lerp(pR, rk, f); out.hy[o] = lerp(pH, hh, f);
            }
            pT = tone; pD = t; pR = rk; pH = hh;
          }
          lastT = t; if (t < 28) { const a = (yb - Math.max(0, sy)) / (w * h); nearCover += a; if (sx < w / 2) nearL += 2 * a; else nearR += 2 * a; }
          yb = Math.max(0, Math.ceil(sy));
        } else if (out) { first = true; }
        t += Math.max(ng > 0 ? 0.07 : 0.35, t * 0.0045);
      }
      sky[sx] = yb / h; dist[sx] = lastT;
    }
    sky.dist = dist; sky.nearCover = nearCover; sky.nearHalf = Math.max(nearL, nearR);
    return sky;
  }

  // does this place, seen from here, make a picture? (a fragment, a diagonal, an imbalance — never a whole centred peak)
  function score(sky, regime) {
    const n = sky.length; let cov = 0, cl = 0, crr = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, mn = 2, mi = 0;
    for (let i = 0; i < n; i++) { const c = 1 - sky[i]; cov += c; if (i < n / 2) cl += c; else crr += c; const x = i / n; sx += x; sy += sky[i]; sxx += x * x; sxy += x * sky[i]; if (sky[i] < mn) { mn = sky[i]; mi = i; } }
    cov /= n; cl /= n / 2; crr /= n / 2;
    const slope = Math.abs((n * sxy - sx * sy) / (n * sxx - sx * sx));
    let tv = 0; for (let i = 1; i < n; i++) tv += Math.abs(sky[i] - sky[i - 1]); tv -= Math.abs(sky[n - 1] - sky[0]);          // what the skyline does beyond merely rising
    // a preference learned from the ratings (not a rule): the 5s are a calm field with one decisive near mass, or a near dark mass with a
    // legible far place behind it — i.e. the skyline belongs partly to something close and partly to something far (or to open sky).
    let taste = 0;
    if (sky.dist && regime !== 'whiteout') { let nr = 0, fr = 0; for (let i = 0; i < n; i++) { if (sky[i] < 0.97 && sky.dist[i] < 60) nr++; else if (sky.dist[i] > 200 || sky[i] > 0.6) fr++; } nr /= n; fr /= n;
      taste = 0.7 * Math.min(nr, fr, 0.45) - 0.15 * Math.min(0.5, tv); }                          /* and the skyline itself stays simple */
    let s = taste - 2.2 * Math.abs(cov - COVER[regime]) + 0.5 * Math.min(0.4, slope) + 1.1 * Math.min(0.45, tv) + 0.8 * Math.min(0.5, Math.abs(cl - crr)) + (mn <= 0.02 ? 0.3 : 0);
    s -= 3 * Math.max(0, sky.nearCover - (regime === 'whiteout' ? 0.6 : 0.4));   // a wall against the lens is not a view
    s -= 2.5 * Math.max(0, sky.nearHalf - 0.55);
    { let l = 0, r = 0; for (let i = 0; i < n; i++) { if (i < n / 2) l += 1 - sky[i]; else r += 1 - sky[i]; } l /= n / 2; r /= n / 2; s -= 1.5 * Math.max(0, 0.12 - Math.min(l, r)); }   /* a sheet with (almost) no land in it is not a view */                                  // one sheet filled by what is within arm's reach: a slab, not a view
    if (regime === 'looming' && sky.dist) {                                     // what looms is far off and high: the skyline should belong to something at a distance, with a little sky over it
      const d = Array.from(sky.dist).sort((a, b) => a - b), med = d[d.length >> 1];
      s += 1.2 * sstep(40, 180, med) - 3 * Math.max(0, cov - 0.88) + 0.8 * Math.min(0.45, tv);
    }
    const xm = mi / n;
    if (regime !== 'looming' && xm > 0.2 && xm < 0.8) {            // a summit standing whole inside the frame: the pictogram
      let l = 0, r = 0; for (let i = 0; i < mi; i++) l = Math.max(l, sky[i] - mn); for (let i = mi; i < n; i++) r = Math.max(r, sky[i] - mn);
      s -= 2.5 * Math.min(l, r);
    }
    if (regime === 'passage') {                                   // the col wants to sit near the cut
      let c = 0; for (let i = (n * 0.38) | 0; i < n * 0.62; i++) c = Math.max(c, sky[i]);
      let a = 2, b = 2; for (let i = 0; i < n * 0.3; i++) a = Math.min(a, sky[i]); for (let i = (n * 0.7) | 0; i < n; i++) b = Math.min(b, sky[i]);
      s += 2 * Math.min(0.35, c - Math.max(a, b));
    }
    return s;
  }

  function stand(T, R, regime, Nz, target) {
    const C = T.ridge, cols = [];
    const near = (c, rad, f) => { for (const q of C) { const dx = q[0] - c[0], dz = q[1] - c[1]; if (dx * dx + dz * dz < rad * rad) f(q, dx, dz); } };
    const dirAt = c => { let sxx = 0, szz = 0, sxz = 0; near(c, 48, (q, dx, dz) => { sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }); return 0.5 * Math.atan2(2 * sxz, sxx - szz); };
    for (let k = 0; k < C.length; k += 3) { let m = 0, n = 0; near(C[k], 100, q => { m += q[2]; n++; }); if (n > 6 && m / n - C[k][2] > 8) cols.push(C[k]); }
    let best = null;
    for (let k = 0; k < 64; k++) {
      const c = C[(R() * C.length) | 0], along = dirAt(c) + (R() < 0.5 ? Math.PI : 0), a = [c[0] + Math.cos(along) * 96, c[1] + Math.sin(along) * 96];
      const cam = { focal: 450 / Math.tan((0.5 + R() * 0.2)), roll: (R() < 0.5 ? -1 : 1) * (0.04 + R() * 0.14), wind: R() * 6.2832 };
      if (regime === 'looming') {
        const off = (R() < 0.5 ? -1 : 1) * (110 + R() * 170), px = c[0] - Math.sin(along) * off, pz = c[1] + Math.cos(along) * off;
        cam.x = clamp(px, 40, N - 40); cam.z = clamp(pz, 40, N - 40); cam.y = bil(T.H, N, cam.x, cam.z) + 1.6 + R() * R() * 5;
        cam.yaw = Math.atan2(a[1] - cam.z, a[0] - cam.x) + (R() - 0.5) * 0.5; cam.pitch = 0.14 + R() * 0.26;
      } else if (regime === 'passage' && cols.length) {
        const col = cols[(R() * cols.length) | 0], side = R() < 0.5 ? -1 : 1, off = 90 + R() * 130, al = dirAt(col);
        cam.x = clamp(col[0] - Math.sin(al) * off * side, 40, N - 40); cam.z = clamp(col[1] + Math.cos(al) * off * side, 40, N - 40);
        cam.y = Math.max(bil(T.H, N, cam.x, cam.z) + 1.6 + R() * 2, col[2] - 12 + R() * 30);
        cam.yaw = Math.atan2(col[1] - cam.z, col[0] - cam.x) + (R() - 0.5) * 0.25; cam.pitch = -0.04 + R() * 0.14;
        cam.wind = cam.yaw + Math.PI;                              // the cloud comes through the col, at you
      } else {
        cam.x = c[0]; cam.z = c[1]; const eye = regime === 'whiteout' ? 1.6 + R() * 0.7 : 1.6 + R() * R() * 7; cam.y = c[2] + eye;
        cam.yaw = along + (R() - 0.5) * 1.1; cam.pitch = -(regime === 'whiteout' ? 0.24 + R() * 0.2 : 0.1 + R() * 0.24);
      }
      let bonus = 0;
      if (target) {                       // the rare thing is what you came upon: stand where it can be seen, some way off, and look toward it
        let cc = c; for (let t = 0; t < 12; t++) { const q = C[(R() * C.length) | 0], d = Math.hypot(q[0] - target.x, q[1] - target.z); if (d > (target.kind === 'hut' ? 110 : 90) && d < (target.kind === 'hut' ? 220 : 330)) { cc = q; break; } }
        cam.x = cc[0]; cam.z = cc[1]; cam.y = cc[2] + 1.6 + R() * R() * 6; const d = Math.hypot(target.x - cam.x, target.z - cam.z);
        cam.yaw = Math.atan2(target.z - cam.z, target.x - cam.x) + (R() - 0.5) * 0.34; cam.pitch = Math.atan2(target.y - cam.y, d) + 0.1 + (R() - 0.5) * 0.12; cam.pitch = clamp(cam.pitch, -0.6, 0.3);
        let seen = true; for (let t = 1; t < 40 && seen; t++) { const f = t / 40; if (bil(T.H, N, lerp(cam.x, target.x, f), lerp(cam.z, target.z, f)) > lerp(cam.y, target.y, f) + 0.5) seen = false; }
        bonus = seen ? 2.5 : -3;
      }
      cam.y = bil(T.H, N, cam.x, cam.z) + Math.min(12, Math.max(1.4, cam.y - bil(T.H, N, cam.x, cam.z)));   /* a body stands on the ground: score the view it actually has */
      const s = score(render(T, cam, 150, 100, Nz, null), regime) + bonus + R() * 0.05;
      if (!best || s > best.s) best = { s, cam };
    }
    best.cam.dirAt = null; return best.cam;
  }

  // ───────────────────────── the scene (cached per seed + register) ─────────────────────────
  let CACHE = null; const DEMS = {};
  const places = () => ['invented'].concat(Object.keys(DEMS).sort());
  function scene(parts, seed, regimeOpt, placeOpt, camOpt, eventOpt, pairOpt) {
    const H0 = hashStr('ridge-encounters-' + seed), regime = regimeOpt > 0 ? REGIMES[(regimeOpt - 1) % 5] : (m => m < 20 ? 'exposure' : m < 40 ? 'passage' : m < 92 ? 'clearing' : 'whiteout')(H0 % 100);   /* v1.1: clearing 52 %, exposure 20 %, passage 20 %, whiteout 8 % */   /* looming is no longer dealt by seed: lowest in all five rating rounds (2.67–3.03), and a rework did not help. It can still be chosen by hand. */
    const PL = places(), place = typeof placeOpt === 'string' && PL.includes(placeOpt) ? placeOpt : placeOpt > 0 ? PL[(placeOpt - 1) % PL.length] : (PL.length < 2 || (H0 >>> 9) % 6 === 0) ? 'invented' : PL[1 + (H0 >>> 12) % (PL.length - 1)],   /* a place is named by its slug; a number is only a position in today's list */ key = seed + '|' + regime + '|' + place + '|' + (eventOpt | 0) + '|' + (pairOpt || '') + '|' + (camOpt ? JSON.stringify(camOpt) : '');
    if (CACHE && CACHE.key === key) return CACHE;
    const RE = mulberry32(H0 ^ 0x2545f491), er = RE();
    let event = eventOpt > 0 ? EVENTS[(eventOpt - 1) % EVENTS.length] : er < 0.05 ? 'none' : er < 0.09 ? 'hut' : er < 0.15 ? 'bird' : er < 0.21 ? 'moon' : 'none';   /* tarn no longer dealt by seed (2026-09-22): on this eroded ground a tarn perches on a shelf and its edge renders as a wall; it can still be forced */
    if (regime === 'whiteout' && event !== 'bird') event = 'none';
    if (regime === 'clearing' && event === 'moon') event = 'none';                        // veiled land under a dark sky is nothing at all                 // inside the cloud there is nothing to come upon
    const R = mulberry32(H0), Nz = makeNoise(R);
    const landEv = event === 'tarn' || event === 'hut' ? event : 'none';
    const T = (CACHE && CACHE.seed === seed && CACHE.place === place && CACHE.landEv === landEv) ? CACHE.T : buildTerrain(parts, mulberry32(H0 ^ 0x9e3779b9), makeNoise(mulberry32(H0 ^ 0x51ed27)), DEMS[place], landEv, RE);
    if (landEv !== 'none' && !T.target) event = 'none';                           // no basin, no site: the land refused
    // the track: a human trace along a stretch of the crest — rare, except when it is all there is
    T.trk = new Float32Array(N * N); T.cairns = []; T.near = null; const path = [];
    if (regime === 'whiteout' || R() < 0.22) {
      // the way keeps to the crest and keeps its heading: from a ridge point, always on to the ridge point most nearly straight ahead
      let best = [];
      for (let tries = 0; tries < 6; tries++) {
        let cur = T.ridge[(R() * T.ridge.length) | 0], dir = R() * 6.2832; const seen = new Set([cur]), line = [cur];
        for (let hop = 0; hop < 60; hop++) {
          let nx = null, bc = 1e9;
          for (const q of T.ridge) { if (seen.has(q)) continue; const dx = q[0] - cur[0], dz = q[1] - cur[1], d = Math.hypot(dx, dz); if (d < 3.5 || d > 13) continue; let da = Math.abs(Math.atan2(dz, dx) - dir) % 6.2832; if (da > Math.PI) da = 6.2832 - da; if (hop && da > 0.9) continue; const c = (hop ? da * 9 : 0) + d * 0.4 + Math.abs(q[2] - cur[2]) * 0.6; if (c < bc) { bc = c; nx = q; } }
          if (!nx) break; dir = Math.atan2(nx[1] - cur[1], nx[0] - cur[0]); seen.add(nx); line.push(nx); cur = nx;
        }
        if (line.length > best.length) best = line;
      }
      let sm = best.map(q => [q[0], q[1]]);
      for (let it = 0; it < 3 && sm.length > 2; it++) { const o = [sm[0]]; for (let k = 0; k + 1 < sm.length; k++) { const a = sm[k], b = sm[k + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(sm[sm.length - 1]); sm = o; }   /* corners cut: feet do not turn on a point */
      for (const q of sm) { path.push([q[0], q[1], bil(T.H, N, q[0], q[1])]); for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const o = ((q[1] | 0) + dz) * N + (q[0] | 0) + dx, g = Math.exp(-(dx * dx + dz * dz) / 1.4); if (o >= 0 && o < N * N && g > T.trk[o]) T.trk[o] = g; } }
      T.cairns = [];
      for (let k = 6; k < path.length; k += 8 + ((R() * 14) | 0)) {
        const a = path[k - 1], b = path[k], al = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2, off = (R() < 0.5 ? -1 : 1) * (0.7 + R() * 0.9), f = R();
        T.cairns.push([lerp(a[0], b[0], f) + Math.cos(al) * off, lerp(a[1], b[1], f) + Math.sin(al) * off, 0.45 + R() * 0.3]);
      }
    }
    T.path = path;
    // a standpoint chosen by hand in the live view overrides the seed's own search
    let t1 = now(); let cam = camOpt ? Object.assign({ wind: R() * 6.2832 }, camOpt, { y: bil(T.H, N, camOpt.x, camOpt.z) + camOpt.eye }) : null;
    if (!cam && regime === 'whiteout' && path.length > 60) {   // a true whiteout: no view to choose — you are on the way, low, looking along it, and the cloud ends the world a stone's throw ahead
      // face where the way runs level or falls away: standing this low, rising ground ahead is a wall in your face
      let bi = 0, bd = 3, br = 1e9; for (let k = 0; k < path.length; k++) for (const d of [24, -24]) { const j = k + d; if (j < 0 || j >= path.length) continue; const rise = path[j][2] - path[k][2], ux = path[j][0] - path[k][0], uz = path[j][1] - path[k][1], ul = Math.hypot(ux, uz) || 1, cross = Math.abs(bil(T.H, N, path[k][0] - uz / ul * 3, path[k][1] + ux / ul * 3) - bil(T.H, N, path[k][0] + uz / ul * 3, path[k][1] - ux / ul * 3)), cost = Math.abs(rise + 3) + cross * 1.2 + R() * 1.5;   /* and where the ground beside the way is not a precipice */ if (cost < br) { br = cost; bi = k; bd = d; } }
      // walk the way from where you stand: a point `dist` along it, and its direction there
      const along = dist => { let k = bi, d = dist, step = Math.sign(bd); while (path[k + step]) { const p = path[k], q = path[k + step], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= L) { const f = d / L; return [lerp(p[0], q[0], f), lerp(p[1], q[1], f), Math.atan2(q[1] - p[1], q[0] - p[0])]; } d -= L; k += step; } const p = path[k]; return [p[0], p[1], 0]; };
      const a = path[bi], eye = 1.7 + R() * 0.6, side = (R() < 0.5 ? -1 : 1), sideStep = side * (0.6 + R() * 1.2), al0 = along(1)[2], aim = along(12 + R() * 10);
      const cx = a[0] - Math.sin(al0) * sideStep, cz = a[1] + Math.cos(al0) * sideStep;
      // beside the way, looking to where it goes: the line enters at your feet and runs into the cloud
      cam = { focal: 450 / Math.tan(0.5 + R() * 0.2), roll: (R() < 0.5 ? -1 : 1) * (0.03 + R() * 0.1), wind: R() * 6.2832, x: cx, z: cz, y: 0, yaw: Math.atan2(aim[1] - cz, aim[0] - cx) + side * (0.04 + R() * 0.1), pitch: -(0.24 + R() * 0.14) };
      // the cairns you can see from here: one close, one at the edge of seeing, one that is only a guess — alternating sides of the way
      T.cairns = T.cairns.filter(c => Math.hypot(c[0] - cx, c[1] - cz) > 30);
      [7 + R() * 4, 18 + R() * 9, 38 + R() * 16].forEach((d, n) => { const q = along(d), off = (n % 2 ? side : -side) * (0.8 + R() * 0.8); T.cairns.push([q[0] - Math.sin(q[2]) * off, q[1] + Math.cos(q[2]) * off, 0.5 + R() * 0.25 + n * 0.12]); });
      cam.y = bil(T.H, N, cam.x, cam.z) + eye;
    }
    if (!cam) cam = stand(T, R, regime, Nz, T.target); TIMES.stand = Math.round(now() - t1); t1 = now();
    // the light, once the standpoint is known
    const lr = R(), mode = event === 'moon' ? 'moon' : regime === 'whiteout' ? 'overcast' : lr < 0.5 ? 'against' : lr < 0.88 ? 'side' : lr < 0.96 ? (regime === 'looming' ? 'front' : 'overcast') : 'front';   /* v1.1: against 50 %, side 38 %, overcast 8 %, front 4 % */   // inside the cloud there is no sun, only light
    const loomLit = regime === 'looming';   /* looming needs light somewhere: never overcast, and the wall is not left in unbroken shade */
    const off = mode === 'against' ? (R() - 0.5) * 0.9 : mode === 'side' ? (R() < 0.5 ? -1 : 1) * (1.2 + R() * 0.7) : mode === 'front' ? Math.PI + (R() - 0.5) : mode === 'moon' ? (R() - 0.5) * 1.1 : R() * 6.2832;
    const el = mode === 'against' ? 0.12 + R() * 0.2 : 0.22 + R() * 0.32, az = cam.yaw + off;
    const light = { mode, az, el, rime: regime === 'whiteout' ? 0.55 + R() * 0.3 : 0,   /* in the cloud everything is rimed: a whiteout is white */ sun: [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)],
      ambient: mode === 'overcast' ? 0.5 : mode === 'against' ? 0.26 : mode === 'moon' ? 0.28 : 0.26, direct: mode === 'overcast' ? 0.25 : mode === 'against' ? 1.25 : mode === 'moon' ? 1.0 : 1.1 };
    const kr = R(), tonalKey = event === 'moon' ? 'full' : regime === 'whiteout' ? 'high' : mode === 'against' ? (kr < 0.6 ? 'low' : 'full') : kr < 0.38 ? 'low' : kr < 0.94 ? 'full' : 'high';   /* v1.1: high key 6 % */
    T.rime = light.rime > 0; lightTerrain(T, light, Nz); TIMES.light = Math.round(now() - t1); t1 = now();
    // ── a gaze: one look from one standpoint, rendered, weathered, rolled into a frame w wide. The sky (deck, wind, what the
    // weather is doing) is decided by the first gaze and shared; `drift` lets a later moment move the cloud along the wind.
    const h = Math.round(parts.sheet.pic[1] / 2), W0 = parts.sheet.pic[0]; let WX = null;
    const smearKind = regime === 'looming' ? 'turn' : regime === 'exposure' ? (R() < 0.5 ? 'fall' : 'advance') : regime === 'passage' ? 'shove' : 'advance', smearSign = R() < 0.5 ? -1 : 1;
    const gaze = (cam, w, drift, note) => {
    // upright render, big enough to be rolled into the frame
      const ca = Math.abs(Math.cos(cam.roll)), sa = Math.abs(Math.sin(cam.roll));
      const W2 = Math.ceil(w * ca + h * sa) + 4, H2 = Math.ceil(w * sa + h * ca) + 4;
      const up = { tone: new Float32Array(W2 * H2), depth: new Float32Array(W2 * H2).fill(1e9), rock: new Float32Array(W2 * H2), hy: new Float32Array(W2 * H2) };
      const cam2 = Object.assign({}, cam, { focal: cam.focal * 900 / W2 });
      const nk = Math.round(cam.x * 4) + '|' + Math.round(cam.z * 4) + '|' + light.mode + light.az.toFixed(2) + (light.rime || 0).toFixed(2); if (!T.near || T.near.key !== nk) { T.near = nearGround(T, cam, light, Nz); T.near.key = nk; }
      { const eye = Math.min(12, Math.max(1.4, cam.y - bil(T.H, N, cam.x, cam.z))), c = T.near.M / 2; cam.y = bil(T.near.h, T.near.M, c, c) + eye; }   /* feet on the fine ground: never under it, never floating over a drop (the passage/looming searches could leave the body 100 units in the air, and a cliff seen from mid-air strobes) */
      const cam2b = 0; render(T, Object.assign({}, cam, { focal: cam.focal * 900 / W2 }), W2, H2, Nz, up);
      // weather: optical depth of a unit cloud along every ray (the deck hugs smoothed ground, banks windward, thins in the lee)
      const G = 256, cn = new Float32Array(G * G), lee = new Float32Array(G * G), alt = new Float32Array(G * G), wx = Math.cos(cam.wind), wz = Math.sin(cam.wind);
      const rc = new Float32Array(G * G), pl = new Float32Array(G * G), pa = new Float32Array(G * G);
      // what the wind is doing today: tearing snow (or a banner of cloud) off the crests, pouring the deck over the cols, dropping curtains
      const W = WX ? WX.W : { spin: R() < (T.cover > 0 ? 0.55 : 0.25) ? 0.6 + R() * 0.8 : 0, pour: regime === 'passage' ? 0.7 + R() * 0.3 : R() < 0.4 ? 0.5 + R() * 0.5 : 0, curtain: (R(), 0),   /* curtains removed 2026-09-22: they projected as bars or hard-edged patches at every scale tried, and never rated well; the draw is kept so other seeds do not move */ slant: (R() - 0.5) * 1.2 };
      if (!WX && W.spin && W.pour && W.curtain) W.curtain = 0;   /* never all three at once */
      let hm = 0, hv = 0, hn = 0; for (let i = 0; i < W2 * H2; i += 5) if (up.depth[i] < 1e8) { hm += up.hy[i]; hv += up.hy[i] * up.hy[i]; hn++; }
      hm /= Math.max(1, hn); hv = Math.sqrt(Math.max(1, hv / Math.max(1, hn) - hm * hm)); if (WX) { hm = WX.hm; hv = WX.hv; }   // one sky for both gazes
      // the deck is set against the land that is actually in view, so it cuts ACROSS what you see
      const deck = WX ? WX.deck + drift.deck * hv : (regime === 'whiteout' ? cam.y + 6 : regime === 'passage' ? hm + (R() - 0.3) * hv : regime === 'looming' ? hm + (0.5 + R() * 0.8) * hv : hm + (R() - 0.65) * 1.2 * hv);
      const thick = WX ? WX.thick : (regime === 'whiteout' ? 60 : Math.max(14, hv * (0.45 + R() * 0.5)));
      for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
        const X = x * 4, Z = z * 4, g = (bil(T.Hs, N, X + wx * 12, Z + wz * 12) - bil(T.Hs, N, X - wx * 12, Z - wz * 12)) / 24;   // + = air climbing
        const al = X * wx + Z * wz - drift.along, ac = -X * wz + Z * wx, hs = bil(T.Hs, N, X, Z);
        cn[z * G + x] = Nz.fbm(al / 330 + 5, ac / 150 + 8, 5);                                                   // the cloud is combed along the wind
        // pouring: just behind a crest the deck does not stop — it drapes down the lee slope before it thins
        const fall = W.pour * sstep(6, 34, bil(T.Hs, N, X - wx * 45, Z - wz * 45) - hs);
        lee[z * G + x] = lerp(1 - 0.85 * sstep(0.02, 0.4, -g) + 0.5 * sstep(0.02, 0.4, g), 1.35, fall);
        alt[z * G + x] = lerp(deck + 0.3 * (hs - hm), hs + 7, fall);
        rc[z * G + x] = W.curtain * sstep(0.6, 0.76, Nz.fbm(al / 260 + 50, ac / 190 + 3, 3));                      // where it is falling
      }
      // spindrift / banner cloud: every proud crest sheds a plume downwind, lofting and spreading as it goes
      if (W.spin > 0) {
        for (const q of T.ridge) {
          if (q[2] - bil(T.Hs, N, q[0], q[1]) < 6) continue;
          let X = q[0], Z = q[1], a = q[2] + 1;
          for (let st = 0; st < 42; st++) {
            X += wx * 4 + (Nz.n2(st * 0.3, q[0] * 0.1) - 0.5) * 3; Z += wz * 4 + (Nz.n2(st * 0.3, q[1] * 0.1 + 9) - 0.5) * 3; a = Math.max(a + 0.22, bil(T.H, N, X, Z) + 2);
            const gx = (X / 4) | 0, gz = (Z / 4) | 0; if (gx < 1 || gz < 1 || gx > G - 2 || gz > G - 2) break;
            const wgt = Math.exp(-st / 16); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = (gz + j) * G + gx + i, k = wgt * (i || j ? 0.5 : 1); pl[o] += k; pa[o] += k * a; }
          }
        }
        for (let i = 0; i < G * G; i++) { if (pl[i] > 0) pa[i] /= pl[i]; pl[i] = Math.min(1, pl[i] * 0.22) * W.spin; }
      }
      const focal2 = cam.focal, horizon = H2 / 2 + Math.tan(cam.pitch) * focal2, fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw);
      const WV = WX ? WX.WV : 60 + R() * 90;   /* how far you can see in the whiteout, in ground units */
      const tau = new Float32Array(W2 * H2), rain = new Float32Array(W2 * H2), fallLen = WX ? WX.fallLen : 60 + R() * 120;
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const o = y * W2 + x, kx = (x + 0.5 - W2 / 2) / focal2, ky = (horizon - y) / focal2, d = Math.min(up.depth[o], FAR);
        const dx = fx - fz * kx, dz = fz + fx * kx; let s = 0, sp = 0, rn = 0;
        for (let q = 0; q < 12; q++) {
          const t = d * (q + 0.5) / 12, px = mirror(cam.x + dx * t, N) / 4, pz = mirror(cam.z + dz * t, N) / 4, py = cam.y + ky * t;
          const v = (py - bil(alt, G, px, pz)) / thick;
          s += Math.max(0, bil(cn, G, px, pz) - 0.4) * Math.exp(-v * v) * bil(lee, G, px, pz);
          if (W.spin > 0) { const pd = bil(pl, G, px, pz); if (pd > 0.01) { const v2 = (py - bil(pa, G, px, pz)) / 3.2, X = px * 4, Z = pz * 4, st = Nz.n2((X * wx + Z * wz) / 38, (-X * wz + Z * wx) / 2.2); sp += pd * Math.exp(-v2 * v2) * (0.1 + 0.9 * st * st) * sstep(40, 150, t); } }
          if (W.curtain > 0) { const cell = bil(rc, G, px, pz); if (cell > 0.01) { const base = bil(alt, G, px, pz) + 12 * (Nz.n2(px / 9 + 70, pz / 9) - 0.5), below = base - py; /* a ragged cloud base */ if (below > 0 && below < fallLen) { const X = px * 4, Z = pz * 4, st = Nz.n2((-X * wz + Z * wx + W.slant * below) / (3.5 + t * 0.03), (X * wx + Z * wz) / 70); rn += cell * sstep(0, 60, below) * sstep(fallLen, fallLen * 0.4, below) * (0.35 + 0.65 * st * st) * sstep(320, 700, t); } } }   /* streaks widen with distance so they never project as bars; curtains only far off */
        }
        tau[o] = s * d / 12 * 0.02 + (regime === 'clearing' ? 0.0016 : 0) * d * (0.6 + 0.8 * Nz.fbm(x / 90, y / 90, 3));   // whiteout: you are inside it
      up.hy[o] = d * 0.0007 + sp * d / 12 * 0.14 + (regime === 'whiteout' ? d / (WV * (drift.vis || 1)) * (0.75 + 0.5 * Nz.fbm(x / 70 + 9, y / 70, 3)) : 0);                     // hy reused: the fixed aerial haze — and the spindrift, which no budget may thin
        rain[o] = Math.min(0.7, rn * d / 12 * 0.06);
      }
      if (!WX) WX = { W, hm, hv, deck, thick, fallLen, WV };
      // roll everything into the frame
      const F = { tone: new Float32Array(w * h), depth: new Float32Array(w * h), rock: new Float32Array(w * h), tau: new Float32Array(w * h), haze: new Float32Array(w * h), rain: new Float32Array(w * h) };
      const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ux = x - w / 2, uy = y - h / 2, qx = clamp(ux * cr - uy * sr + W2 / 2, 0, W2 - 1.001), qy = clamp(ux * sr + uy * cr + H2 / 2, 0, H2 - 1.001);
        const xi = qx | 0, yi = qy | 0, a = qx - xi, b = qy - yi, o = yi * W2 + xi, i = y * w + x;
        const bl = A => (A[o] * (1 - a) + A[o + 1] * a) * (1 - b) + (A[o + W2] * (1 - a) + A[o + W2 + 1] * a) * b;
        F.depth[i] = up.depth[o + (a > 0.5 ? 1 : 0) + (b > 0.5 ? W2 : 0)];
        F.tone[i] = F.depth[i] > 1e8 ? 0 : bl(up.tone); F.rock[i] = bl(up.rock); F.tau[i] = bl(tau); F.haze[i] = bl(up.hy); F.rain[i] = bl(rain);
      }
      // a tear in the cloud (clearing): where far, lit ground is — found once, in the frame
      let tear = null;
      if (regime === 'clearing') {
        // a tear is worth having only for what it opens onto: a whole patch of far, LIT ground (judged over the patch, not at a point —
        // a point finds one bright stone in dark rock, and the tear comes up as a smudge). Wide, ragged, and longer than it is tall.
        const rad = Math.min(w, 900) * (0.12 + R() * 0.09), ph = R() * 40; let bs = 0.2;
        for (let k = 0; k < 500; k++) { const x = (w * (0.14 + 0.72 * R())) | 0, y = (h * (0.14 + 0.55 * R())) | 0; let m = 0, n = 0, far = 0;
          for (let j = -2; j <= 2; j++) for (let q = -2; q <= 2; q++) { const xx = clamp((x + q * rad * 0.45) | 0, 0, w - 1), yy = clamp((y + j * rad * 0.28) | 0, 0, h - 1), i = yy * w + xx; n++; if (F.depth[i] > 1e8) continue; m += Math.min(0.9, F.tone[i]); far += sstep(120, 500, F.depth[i]); }
          const lit = m / n, sc = lit * (far / n); if (lit > 0.4 && far / n > 0.5 && sc > bs) { bs = sc; tear = [x, y, rad, ph]; } }   /* dark ground seen through a hole in pale cloud is a stain, not a clearing */
      }
      const dAz = Math.atan2(Math.sin(light.az - cam.yaw), Math.cos(light.az - cam.yaw));
      const screen = Math.abs(dAz) < 1.25 ? [w / 2 + Math.tan(dAz) * cam.focal, h / 2 + Math.tan(cam.pitch) * cam.focal - Math.tan(light.el) * cam.focal] : null;
      const fr0 = R(), edge = cam.pitch > -0.45 && regime !== 'whiteout' && fr0 < 0.24 ? { cx: R() < 0.5 ? 0 : 1, cy: R() < 0.75 ? 1 : 0, r: 0.22 + R() * 0.2, pale: T.cover > 0 && R() < 0.45 && event !== 'moon', ph: R() * 50 } : null;
      const eyeH = cam.y - bil(T.H, N, cam.x, cam.z), nearAt = Math.min(18, 2.2 * eyeH);   /* what counts as near depends on how low you stand */
      return { F, w, cam, tear, screen, note, edge, nearAt, revealK: drift.reveal || 1, smear: { kind: cam.pitch < -0.45 ? 'fall' : smearKind, sign: smearSign, horizon: h / 2 + Math.tan(cam.pitch) * cam.focal } };
    };
    // ── the pair. A cut panorama is one option among five; more often the two sheets are two acts of looking.
    const still = { along: 0, deck: 0 }, pr = R();
    let pair = camOpt ? 'panorama' : regime === 'whiteout' ? (pr < 0.55 ? 'panorama' : 'later') : pr < 0.5 ? 'panorama' : pr < 0.76 ? 'turn' : pr < 0.79 ? 'back' : pr < 0.82 ? 'down' : 'later';   /* v1.1: one view 50 %, turned 26 %, later 18 % */
    if (pairOpt && !camOpt && regime !== 'whiteout') pair = pairOpt;   /* for review batches */
    if (T.target && pair === 'panorama') pair = 'turn';   /* what you came upon should not fall on the cut */
    const frames = [];
    if (pair === 'panorama') frames.push(gaze(cam, W0, still, 'one view, cut'));
    else {
      frames.push(gaze(cam, W0 / 2, still, 'ahead'));
      if (pair === 'later' && regime !== 'whiteout') { const f0 = frames[0].F; let m = 0, n = 0; for (let i = 0; i < f0.tau.length; i += 9) if (f0.depth[i] < 1e8) { m += Math.min(1, f0.tau[i] * 8); n++; } if (!n || m / n < 0.4) pair = 'turn'; }   // no cloud in view: nothing for time to move
      let c2 = Object.assign({}, cam), drift = still, note = pair;
      if (pair === 'turn') {            // the head turns: the best of nine other directions from the same feet
        let bs = -1e9; for (let k = 0; k < 9; k++) { const c = Object.assign({}, cam, { yaw: cam.yaw + (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.5), pitch: cam.pitch + (R() - 0.5) * 0.3, roll: (R() < 0.5 ? -1 : 1) * (0.04 + R() * 0.14) }), sc = score(render(T, c, 75, 100, Nz, null), regime) + R() * 0.05; if (sc > bs) { bs = sc; c2 = c; } }
        note = 'turned';
      } else if (pair === 'back') { c2.yaw = cam.yaw + Math.PI + (R() - 0.5) * 0.6; c2.pitch = -(0.05 + R() * 0.25); c2.roll = -cam.roll; note = 'looking back'; }
      else if (pair === 'down') {       // down — but toward something: of seven ways of looking down, the one whose ground holds the most (tone and depth both varied: a drop, a gully, snow against rock)
        let bs = -1; const tw = 60, th = 80, buf = { tone: new Float32Array(tw * th), depth: new Float32Array(tw * th), rock: new Float32Array(tw * th), hy: new Float32Array(tw * th) };
        for (let k = 0; k < 7; k++) { const c = Object.assign({}, cam, { yaw: cam.yaw + (R() - 0.5) * 2.4, pitch: -(0.5 + R() * 0.45), roll: (R() < 0.5 ? -1 : 1) * (0.08 + R() * 0.2) }); buf.depth.fill(1e9); render(T, Object.assign({}, c, { focal: c.focal * 900 / tw }), tw, th, Nz, buf);
          let n = 0, st = 0, st2 = 0, sd = 0, sd2 = 0; for (let i = 0; i < tw * th; i++) if (buf.depth[i] < 1e8) { const v = buf.tone[i], d = Math.log(buf.depth[i]); n++; st += v; st2 += v * v; sd += d; sd2 += d * d; }
          if (n < tw * th * 0.85) continue; const sc = Math.sqrt(Math.max(0, st2 / n - (st / n) ** 2)) * 3 + Math.sqrt(Math.max(0, sd2 / n - (sd / n) ** 2)) * 0.5 + (st / n) * 0.6; if (sc > bs) { bs = sc; c2 = c; } }
        if (bs < 0) { c2.yaw = cam.yaw + (R() - 0.5) * 0.9; c2.pitch = -(0.7 + R() * 0.35); c2.roll = (R() < 0.5 ? -1 : 1) * (0.08 + R() * 0.2); }
        note = 'down, at your feet'; }
      else {                            // the same gaze, later: the cloud has moved, and so have you, a little
        const step = 8 + R() * 22; c2.x = cam.x + Math.cos(cam.yaw) * step; c2.z = cam.z + Math.sin(cam.yaw) * step; c2.y = bil(T.H, N, c2.x, c2.z) + (cam.y - bil(T.H, N, cam.x, cam.z)); c2.yaw += (R() - 0.5) * 0.25;
        drift = { vis: R() < 0.5 ? 0.4 : 2.4, along: 260 + R() * 420, deck: (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.7), reveal: R() < 0.5 ? 0.3 : 2.3 }; note = 'the same gaze, later';
      }
      frames.push(gaze(c2, W0 / 2, drift, note));
      if (R() < 0.5) frames.reverse();
    }
    if (event === 'bird') { const fr = frames[(RE() * frames.length) | 0]; for (let k = 0; k < 300 && !fr.bird; k++) { const x = (fr.w * (0.1 + 0.8 * RE())) | 0, y = (h * (0.08 + 0.6 * RE())) | 0; if (fr.F.depth[y * fr.w + x] > 1e8 && fr.F.rain[y * fr.w + x] < 0.2) fr.bird = [x, y, 5 + RE() * 6, (RE() - 0.5) * 0.7, 0.5 + RE() * 0.7]; } }
    TIMES.view = Math.round(now() - t1);
    const sm0 = R(), sky = { mood: regime === 'whiteout' ? 'bright' : sm0 < 0.3 ? 'bright' : sm0 < 0.65 ? 'banded' : 'heavy', bandY: 0.25 + R() * 0.45, bandH: 0.09 + R() * 0.12, from: R() < 0.5 ? 0 : 1 };
    CACHE = { sky, event, landEv, keepBlack: R() < 0.125, key, light, tonalKey, weather: [WX.W.spin ? 'spindrift' : '', WX.W.pour ? 'pouring' : '', WX.W.curtain ? 'curtains' : ''].filter(Boolean).join('+') || 'still', seed, regime, place, times: Object.assign({}, TIMES), T, cam, frames, pair, h, Nz, skyPhase: R() * 100 };
    return CACHE;
  }

  // temper: how much the weather allows, how deep the darks, how much the body moves — and the hand: bristle, drag, grain.
  // Each seed draws its own, from its own generator (so nothing else about the seed moves); a value given explicitly wins.
  const TEMPER = { reveal: [0.7, 1.5], drama: [0.8, 1.45], smear: [0.1, 1.1], bristle: [0.5, 1.9], streak: [0.4, 1.9], grain: [0.8, 1.2] };
  function temper(seed) { const R = mulberry32(hashStr('ridge-temper-' + seed)), t = {}; for (const k in TEMPER) { const [a, b] = TEMPER[k], u = (R() + R()) / 2; t[k] = +(a + (b - a) * u).toFixed(2); } return t; }

  function sheets(parts, opt) {
    opt = opt || {};
    const seed = (opt.seed >>> 0) || 1, S = scene(parts, seed, opt.regime | 0, opt.place || 0, opt.cam || null, opt.event | 0, opt.pair || ''), { h, Nz, regime } = S;
    const TP = temper((opt.seed >>> 0) || 1); for (const k in TP) if (opt[k] != null) TP[k] = opt[k];
    const reveal = TP.reveal, drama = TP.drama, smearK = TP.smear;
    const develop = fr => {
    const F = fr.F, w = fr.w;
    // solve the cloud's density so the land left visible meets the register's budget
    const target = clamp(BUDGET[regime] * reveal * fr.revealK, 0.03, 0.97); let lo = 0, hi = opt.nofog ? 0 : 40;
    for (let it = 0; it < 22; it++) { const k = (lo + hi) / 2; let s = 0, n = 0; for (let i = 0; i < w * h; i += 7) if (F.depth[i] < 1e8) { s += Math.exp(-k * F.tau[i] - F.haze[i]); n++; } if (n && s / n > target) lo = k; else hi = k; }
    const kd = (lo + hi) / 2;
    const gain = 0.8 + 0.5 * drama, curve = l0 => { const c = l0 < 0 ? 0 : l0 > 1 ? 1 : l0 * l0 * (3 - 2 * l0) * 0.55 + l0 * 0.45; return S.tonalKey === 'low' ? Math.pow(c, 1.45) : S.tonalKey === 'high' ? Math.pow(c, 0.75) : c; };
    // the printer's hand: a sheet that would come up as a black rectangle is dodged — its shadows opened until the form in them shows.
    // (one seed in eight, the black is left alone.)
    let dk = 0, nn = 0; for (let i = 0; i < w * h; i += 11) { nn++; if (F.depth[i] < 1e8 && Math.exp(-F.tau[i] * kd - F.haze[i]) > 0.5 && curve(0.4 + (F.tone[i] - 0.4) * gain) < 0.16) dk++; }
    const dodge = S.keepBlack ? 0 : sstep(0.2, 0.6, dk / nn);
    const tone = new Float32Array(w * h), vis = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let tau = F.tau[i] * kd, key = 0;
      let rim = 0;
      if (fr.tear) { const rag = 0.65 + 0.7 * Nz.fbm(x * 0.012 + fr.tear[3], y * 0.02, 3), dx = (x - fr.tear[0]) / (fr.tear[2] * 1.5 * rag), dy = (y - fr.tear[1]) / (fr.tear[2] * 0.62 * rag), d2 = dx * dx + dy * dy;
        key = sstep(1.25, 0.35, d2); rim = key * (1 - key) * 4; tau *= 1 - 0.9 * key; }                         /* a ragged opening with a soft, lit lip */
      const bil2 = Nz.fbm(x * 0.0035 + S.skyPhase, y * 0.005, 4);
      const cloud = parts.cloud.tone + (bil2 - 0.5) * 16 - (parts.cloud.tone - parts.cloud.band.tone) * (F.depth[i] > 1e8 ? 0.35 : 0.8) * sstep(1.2, 6, F.tau[i] * kd * (F.depth[i] > 1e8 ? 0.2 : 1)) * sstep(0.25, 0.8, Nz.fbm(x * 0.006 + 3, y * 0.011 + S.skyPhase, 4)) * Math.min(1.4, drama);   // thick cloud goes dark, as in the source's band
      let cloudM = cloud;                                                                                         // the sky's mood: the source's own sky is not white — a dark band lies across it
      if (S.sky.mood === 'banded') { const bd = (y / h - S.sky.bandY + (bil2 - 0.5) * 0.18) / S.sky.bandH; cloudM = lerp(cloud, parts.cloud.band.tone + (bil2 - 0.5) * 44, Math.exp(-bd * bd) * 0.85); }
      else if (S.sky.mood === 'heavy') { const g = S.sky.from ? y / h : 1 - y / h; cloudM = cloud - (26 + 34 * bil2) * sstep(0.05, 0.85, g + (bil2 - 0.5) * 0.6); }
      let glow = 0; if (fr.screen) { const gx = (x - fr.screen[0]) / (w * 0.42), gy = (y - fr.screen[1]) / (h * 0.6); glow = Math.exp(-(gx * gx + gy * gy)); }
      const air = Math.min(212, cloudM + rim * 9 + glow * (S.light.mode === 'against' ? 9 : 3)) - (S.light.mode === 'against' ? 14 * (1 - glow) : 0);      // against the light the cloud itself is lit from behind
      let airD = air;
      if (S.light.mode === 'moon') { airD = 82 + (air - 140) * 0.3 + glow * 50; if (fr.screen && F.depth[i] > 1e8) { const md = Math.hypot(x - fr.screen[0], y - fr.screen[1]); airD += 150 * sstep(7.5, 5.5, md) * Math.exp(-tau * 0.6); } }   /* night: the sky is the dark thing, the moon a small hard disc, the cloud near it lit */
      const veil = 1 - Math.exp(-F.rain[i]), wet = airD - 34;                                                        // a curtain is darker than the cloud it hangs from
      if (F.depth[i] > 1e8) { tone[i] = lerp(airD + key * 8, wet, veil); continue; }
      const Tn = Math.exp(-tau - F.haze[i] * (1 - 0.6 * key)), l1 = curve(0.4 + (F.tone[i] * (1 + 0.22 * key) - 0.4) * gain), l2 = Math.pow(l1, 1 - 0.4 * dodge), l3 = l2 + dodge * 0.13 * (1 - l2) * (1 - l2), l = l3 + key * 0.14 * (1 - l3);   /* and what the tear shows is in the light */
      const isWater = F.rock[i] < 0.02 && F.tone[i] > 0.6, land = isWater ? lerp(airD, 34 + 190 * clamp(l, 0, 1), 0.45) : 34 + 190 * clamp(l, 0, 1);   /* water: half sky, half its own light */
      tone[i] = lerp(lerp(airD, land, Tn), wet, veil * 0.85); vis[i] = Tn * F.rock[i] * sstep(900, 60, F.depth[i]);
    }
    // something close to the lens, out of focus: a rock edge or a snow bank that the eye reads past (the source's blurred corner)
    if (fr.edge) { const e = fr.edge, base = e.pale ? 190 : 60;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot((x / w - e.cx) * (w / h) * 0.42, y / h - e.cy),   /* a low wide bank, not a ball */ wob = (Nz.fbm(x * 0.004 + e.ph, y * 0.004, 3) - 0.5) * 0.4, m = sstep(e.r + wob + 0.13, e.r + wob - 0.13, d);
        if (m > 0) tone[y * w + x] = lerp(tone[y * w + x], base + (Nz.fbm(x * 0.01 + e.ph, y * 0.01 + 4, 3) - 0.5) * 30, m * 0.94); } }
    // smear: the body's movement through depth — near ground streaks, far ground and cloud hold
    const out = new Float32Array(w * h), sm = fr.smear, vx = w / 2, vy = sm.horizon;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, near = F.depth[i] > 1e8 ? 0 : Math.min(1, fr.nearAt / F.depth[i]);
      let dx, dy, L = parts.smear.length * w * smearK * near * (fr.cam.pitch < -0.45 || regime === 'whiteout' ? 0.35 : 1.1);
      if (sm.kind === 'fall') { dx = 0.25 * sm.sign; dy = 1; } else if (sm.kind === 'turn') { dx = 1; dy = 0.15 * sm.sign; L = L * 0.6 + 1.6 * smearK; }
      else if (sm.kind === 'shove') { dx = sm.sign; dy = -0.35; L = L * 0.7 + 1.0 * smearK; } else { dx = x - vx; dy = y - vy; }
      const il = 1 / (Math.sqrt(dx * dx + dy * dy) + 1e-6); dx *= il; dy *= il; L += 0.5;
      let s = 0; for (let q = -4; q <= 4; q++) { const px = clamp(Math.round(x + dx * L * q / 4), 0, w - 1), py = clamp(Math.round(y + dy * L * q / 4), 0, h - 1); s += tone[py * w + px]; }
      out[i] = clamp(s / 9, 36, 211);
    }
    if (fr.bird) { const [bx, by, sz, tilt, flap] = fr.bird;       // a bird: two strokes, and suddenly the mountain has a size
      for (let t = -1; t <= 1; t += 0.04) { const px = bx + t * sz * Math.cos(tilt) + Math.abs(t) * 0, py = by + t * sz * Math.sin(tilt) - (Math.pow(Math.abs(t), 0.7) - 0.35) * sz * 0.42 * flap, th = 1.5 * (1 - 0.6 * Math.abs(t));
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = Math.round(px) + dx, Y = Math.round(py) + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const a = clamp(th - Math.hypot(X - px, Y - py), 0, 1); if (a > 0) out[Y * w + X] = Math.min(out[Y * w + X], lerp(out[Y * w + X], 48, a)); } } }
    return { out, vis, w, F };
    };
    const dev = S.frames.map(develop), one = dev.length === 1, hw = parts.sheet.pic[0] >> 1;
    const side = k => one ? { d: dev[0], x0: k * hw } : { d: dev[k], x0: 0 };
    // what the curation harness reads: the skyline (first land per column, 0 top … 1 none) and the land share of each sheet
    const skyline = [], land = [0, 0];
    for (let c = 0; c < 48; c++) { const sd = side(c < 24 ? 0 : 1), x = sd.x0 + (((c % 24) + 0.5) / 24 * hw) | 0; let y = 0; while (y < h && sd.d.F.depth[y * sd.d.w + x] > 1e8) y++; skyline.push(+(y / h).toFixed(3)); }
    for (let k = 0; k < 2; k++) { const sd = side(k); let n = 0, m = 0; for (let y = 0; y < h; y += 3) for (let x = 0; x < hw; x += 3) { m++; if (sd.d.F.depth[y * sd.d.w + sd.x0 + x] < 1e8) n++; } land[k] = n / m; }
    const Sh = parts.sheet, xw = hw >> 2, xh = h >> 2;
    return [0, 1].map(k => {
      const { d, x0 } = side(k), out = d.out, vis = d.vis, w = d.w;
      const tb = new Uint8Array(hw * h), tex = new Uint8Array(xw * xh);
      for (let y = 0; y < h; y++) for (let x = 0; x < hw; x++) tb[y * hw + x] = out[y * w + x + x0];
      for (let y = 0; y < xh; y++) for (let x = 0; x < xw; x++) tex[y * xw + x] = Math.min(255, vis[(y * 4 + 2) * w + x * 4 + 2 + x0] * 7.5 * 8);
      return { W: Sh.W, H: Sh.H, box: [k ? 0 : Sh.W - Sh.pic[0], Sh.top, Sh.pic[0], Sh.pic[1]], mat: Sh.mat, tw: hw, th: h, tone: tb, xw, xh, tex,
               grainL: parts.grainL, grainSD: parts.grainSD, grainRho: parts.grainRho, regime, light: S.light.mode, tonalKey: S.tonalKey, temper: TP, weather: S.weather, event: S.event, pair: S.pair, gaze: S.frames[one ? 0 : k].note, place: S.place, times: S.times, skyline, land, placeLabel: S.place === 'invented' ? 'invented ground' : DEMS[S.place].label };
    });
  }

  const ground = (parts, opt) => { const S = scene(parts, (opt.seed >>> 0) || 1, opt.regime | 0, opt.place || 0, opt.cam || null, opt.event | 0, opt.pair || ''), c = S.cam; return { n: N, H: S.T.H, lum: S.T.lum, cam: { x: c.x, z: c.z, eye: c.y - bil(S.T.H, N, c.x, c.z), yaw: c.yaw, pitch: c.pitch, roll: c.roll, focal: c.focal } }; };
  const api = { sheets, ground, temper, REGIMES, EVENTS, places, setDEM: (slug, meta, data) => { DEMS[slug] = Object.assign({}, meta, { data }); CACHE = null; }, _scene: scene };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Compose = api;
})(typeof window !== 'undefined' ? window : globalThis);
