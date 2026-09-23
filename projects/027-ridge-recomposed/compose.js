/*
 * compose.js — morphs the parts of the ridge diptych (parts.js) and recomposes them into a new
 * panorama, cut into two sheets for assets/drybrush.js to paint. Pure arithmetic + seeded PRNG,
 * so it runs the same in node and in every browser.
 *
 *   const [left, right] = Compose.sheets(PARTS, { seed, recompose, regime, drama, fog, smear });
 *
 * recompose 0 → the parts in their source arrangement; 1 → the new synthesis.
 * The skyline is never invented: every ridge is the SOURCE profile, reflected, stretched,
 * shifted and roughened — the one long rise and its knuckled crag, met again as a range.
 */
(function (global) {
  'use strict';
  const REGIMES = ['massif', 'range', 'inversion', 'pass', 'wall'];

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
    return { n2, fbm };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  // the source skyline as a function of panorama x (0…2) → y (0…1), monotone cubic through the measured points
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

  // a new scene: which morphs of the parts, where
  function scene(parts, R, regime) {
    const mirror = R() < 0.5, ridges = [];
    // each ridge: the source profile read through u(x) = reflect(x·scale + shift), lifted/flattened; z = distance (0 near … 1 far)
    const ridge = (z, scale, shift, top, amp, spineK) => ({ z, scale, shift, top, amp, spineK, rough: 0.5 + R(), lean: (R() < 0.5 ? -1 : 1) * (0.15 + R() * 0.4), bite: 0.5 + R() * 1.2 });
    let hollow, ceiling = 0, knot, smear;
    if (regime === 'massif') {            // one great summit moved inward, storm-dark behind it
      ridges.push(ridge(0.75, 0.7, R() * 0.6, 0.42, 0.45, 0.3));
      ridges.push(ridge(0, 1.25 + R() * 0.3, 0.55 + R() * 0.25, 0.08, 1.15, 1));
      hollow = { x: 0.9 + R() * 0.5, y: 0.2 + R() * 0.1, rx: 0.75, ry: 0.22, tone: 66, behind: 1 };
    } else if (regime === 'range') {      // three receding ranges, each a reflection of the same rise
      for (let i = 2; i >= 0; i--) ridges.push(ridge(i * 0.42, 1.2 + i * 0.9 + R() * 0.5, R() * 2, 0.16 + (2 - i) * 0.15 + R() * 0.06, 0.55 + (2 - i) * 0.2, i === 0 ? 1 : 0.5));
      hollow = { x: 0.3 + R() * 1.4, y: 0.6 + R() * 0.1, rx: 0.5, ry: 0.13, tone: 70, behind: 0 };
    } else if (regime === 'inversion') {  // a cloud sea; crags stand out of it
      ridges.push(ridge(0.6, 2.2 + R(), R() * 2, 0.34, 0.5, 0.6));
      ridges.push(ridge(0.12, 1.6 + R() * 0.6, R() * 2, 0.2, 0.8, 1));
      ceiling = 0.55 + R() * 0.1;
      hollow = { x: 0.4 + R() * 1.2, y: 0.9, rx: 0.8, ry: 0.12, tone: 96, behind: 0 };
    } else if (regime === 'pass') {       // two flanks descending to a saddle, the hollow lying in it
      const c = 0.8 + R() * 0.4;
      ridges.push(ridge(0.55, 1.0, 2 - c + 0.1, 0.2, 0.75, 0.7));
      ridges.push(ridge(0, 1.0, c + 0.25, 0.1, 1.05, 1)); ridges[1].flip = true;
      hollow = { x: c, y: 0.6, rx: 0.4, ry: 0.2, tone: 62, behind: 0.5 };
    } else {                              // wall: the rise steepened until it is a face filling one sheet
      ridges.push(ridge(0.8, 2.6, R() * 2, 0.5, 0.3, 0.2));
      ridges.push(ridge(0, 0.62, 1.05 + R() * 0.1, 0.02, 1.7, 1));
      hollow = { x: 0.45, y: 0.8, rx: 0.6, ry: 0.2, tone: 64, behind: 0 };
    }
    knot = { x: 0.2 + R() * 1.6, y: 0.12 + R() * 0.25, r: 0.05 + R() * 0.06, lift: 10 + R() * 8 };
    smear = { corner: [R() < 0.5 ? 0 : 2, 1], angle: -90 + (R() - 0.5) * 110, reach: 0.7 + R() * 0.5, length: 0.035 + R() * 0.05 };
    return { mirror, ridges, hollow, ceiling, knot, smear, band: { y: 0.3 + R() * 0.35, h: 0.08 + R() * 0.1, tone: 135 + R() * 30 }, trackAt: R() };
  }

  function sheets(parts, opt) {
    opt = opt || {};
    const seed = (opt.seed >>> 0) || 1, k = opt.recompose === undefined ? 1 : opt.recompose;
    const drama = 1 + ((opt.drama === undefined ? 1 : opt.drama) - 1) * k, fogK = opt.fog === undefined ? 1 : opt.fog, smearK = opt.smear === undefined ? 1 : opt.smear;
    const H0 = hashStr('ridge-recomposed-' + seed), R = mulberry32(H0), N = makeNoise(R);
    const regime = opt.regime > 0 ? REGIMES[(opt.regime - 1) % REGIMES.length] : REGIMES[H0 % REGIMES.length];
    const sc = scene(parts, R, regime), P = profileFn(parts.profile);
    const w = parts.sheet.pic[0], h = Math.round(parts.sheet.pic[1] / 2), hw = w >> 1;          // half-res panorama: 900 × 597
    const TOP = 1.8, reflect = u => { u = ((u % (2 * TOP)) + 2 * TOP) % (2 * TOP); return u > TOP ? 2 * TOP - u : u; };   // fold just past the crag, so a reflected rise makes a peak, not a mesa

    // skylines (px) — ridge list far → near; the nearest morphs out of the source skyline, the others arrive with k
    const pmin = 0.195, pspan = 0.845 - 0.195;
    const lines = sc.ridges.map((r, idx) => {
      const near = idx === sc.ridges.length - 1, ys = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        let u = x / w * 2; if (sc.mirror !== !!r.flip) u = 2 - u;
        const t = (P(reflect(u * r.scale + r.shift)) - pmin) / pspan;                            // 0 summit … 1 foot
        let y = r.top + t * pspan * r.amp + (N.fbm(x * 0.012 + idx * 31, idx * 7.7, 4) - 0.5) * 0.05 * r.rough;
        if (near) y = lerp(P(x / w * 2), y, k);
        ys[x] = y * h;
      }
      let sx = 0; for (let x = 1; x < w; x++) if (ys[x] < ys[sx]) sx = x;                        // the spine falls from the summit
      return { r, ys, near, sx, presence: near ? 1 : k };
    });
    const nearL = lines[lines.length - 1];
    const srcSpine = parts.spine.x / 2 * w;
    const hol = { x: lerp(parts.hollow.x, sc.hollow.x, k), y: lerp(parts.hollow.y, sc.hollow.y, k), rx: lerp(parts.hollow.rx, sc.hollow.rx, k), ry: lerp(parts.hollow.ry, sc.hollow.ry, k), tone: lerp(parts.hollow.tone, sc.hollow.tone, k) - (drama - 1) * 25, behind: sc.hollow.behind * k };
    const knot = { x: lerp(parts.cloud.knot.x, sc.knot.x, k), y: lerp(parts.cloud.knot.y, sc.knot.y, k), r: lerp(parts.cloud.knot.r, sc.knot.r, k), lift: lerp(parts.cloud.knot.lift, sc.knot.lift, k) };
    const band = { y: lerp(parts.cloud.band.y, sc.band.y, k), h: lerp(parts.cloud.band.h, sc.band.h, k), tone: lerp(parts.cloud.band.tone, sc.band.tone, k) };
    const ceiling = sc.ceiling * k;

    const tone = new Float32Array(w * h), rockM = new Float32Array(w * h);
    const hollowAt = (x, y) => {
      const wob = (N.fbm(x * 0.006, y * 0.006, 3) - 0.5) * 0.5;
      const dx = (x / w * 2 - hol.x) / hol.rx, dy = (y / h - hol.y) / hol.ry;
      return Math.min(1, 1.25 * Math.exp(-(dx * dx + dy * dy) * (1 + wob)));
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = y / h, u = x / w * 2;
      // 1 · cloud
      const bil = N.fbm(x * 0.0035, y * 0.005, 4);
      let t = parts.cloud.tone + (bil - 0.5) * 16;
      const bd = (v - band.y) / band.h; t = lerp(t, band.tone + (bil - 0.5) * 40, Math.exp(-bd * bd) * 0.85);
      const kx = (u - knot.x) / knot.r / 2, ky = (v - knot.y) / knot.r; t += knot.lift * Math.exp(-(kx * kx + ky * ky));
      if (hol.behind > 0) t = lerp(t, hol.tone, hollowAt(x, y) * hol.behind);
      const fogTone = t;
      // 9 · tongues
      const tongue = sstep(0.42, 0.72, N.fbm(x * 0.005 + 40, y * 0.008 + 3, 4)) * fogK;
      let rm = 0;
      for (let li = 0; li < lines.length; li++) {
        const L = lines[li], r = L.r; if (L.presence <= 0) continue;
        if (L.near && hol.behind < 1) t = lerp(t, hol.tone, hollowAt(x, y) * (1 - hol.behind));  // 2 · hollow lies behind the near slope
        const d = y - L.ys[x]; if (d < -0.2 * h) continue;
        const c = lerp(1, 0.22, r.z) * L.presence * (L.near ? 1 : Math.min(1.2, drama));
        const soft = (parts.tongues.soft * (0.25 + 2.5 * tongue) + r.z * 0.02) * h;
        let m = sstep(-soft, soft * 0.5, d - tongue * parts.tongues.bite * r.bite * h);
        if (m <= 0) continue;
        // 4 · rock
        const dd = d / h;
        let rock = parts.rock.tone - (drama - 1) * 30 * (1 - r.z) - 12 * k * (1 - r.z) + (N.fbm(x * 0.011 + li * 13, d * 0.085, 4) - 0.5) * 2 * parts.rock.strata * 1.6
          + (Math.abs(N.fbm(x * 0.03 + li * 5, y * 0.03, 4) - 0.5) * 2 - 0.35) * parts.rock.blocks * 1.5
          + (N.fbm(x * 0.004, y * 0.004 + li, 3) - 0.5) * 50
          + (N.fbm(x * 0.022 + li * 3, d * 0.3, 3) - 0.5) * 22;
        // crevices and their lit crests: one ridged field read twice, a few pixels apart, running with the skyline
        const cr = (ox, oy) => Math.pow(1 - Math.abs(2 * N.fbm((x + ox) * 0.017 + li * 9, (d + oy) * 0.04 + x * 0.004, 4) - 1), 9);
        const broken = sstep(0.35, 0.65, N.fbm(x * 0.009 + 5, y * 0.009 + li * 4, 3));   // crevices come in fields, not everywhere
        rock += (cr(3, -3) * 60 - cr(0, 0) * 70) * broken;
        // 5 · spine  6 · pale flank
        const sx0 = L.near ? lerp(srcSpine, L.sx, k) : L.sx, lean = L.near ? lerp(parts.spine.lean, r.lean, k) : r.lean;
        const sx = sx0 + lean * d + (N.fbm(d * 0.009, li * 3.3, 4) - 0.5) * 190 * sstep(0, 0.5, dd), sw = parts.spine.width * w * (0.35 + 2.2 * dd) * (0.6 + 0.8 * N.fbm(d * 0.02 + 9, li, 3));
        const q = (x - sx) / sw, sp = Math.exp(-q * q) * sstep(0, 0.04, dd) * sstep(1.05, 0.35, dd);
        rock = lerp(rock, parts.spine.tone - (drama - 1) * 20, Math.min(1, sp * r.spineK * 1.1));
        const side = (L.near && k < 0.5) || lean >= 0 ? 1 : -1, beyond = sstep(1.3, 3.2, q * side) * sstep(0.12, 0.5, dd);
        const patch = sstep(0.3, 0.75, N.fbm(x * 0.006 + y * 0.004 + 70, y * 0.02 - x * 0.006, 4));
        rock = lerp(rock, parts.flank.tone, beyond * (0.3 + 0.5 * patch) * r.spineK);
        rock = lerp(rock, fogTone, sstep(0.45, 1.1, dd) * 0.6 * fogK);                           // valley fog rising from below
        rock = fogTone + (rock - fogTone) * c * (0.8 + 0.2 * drama);
        t = lerp(t, rock, m); rm = Math.max(rm * (1 - m), m * c);
      }
      // cloud sea (inversion)
      if (ceiling > 0) {
        const sea = sstep(ceiling - 0.05, ceiling + 0.12, v + (N.fbm(x * 0.006, y * 0.012 + 8, 4) - 0.5) * 0.25);
        t = lerp(t, parts.cloud.tone - 8 + (bil - 0.5) * 22, sea * 0.93); rm *= 1 - sea;
      }
      tone[i] = t; rockM[i] = rm;
    }

    // 8 · track: one pale line lying on the near skyline
    {
      const len = (parts.track.x1 - parts.track.x0) / 2 * w, x0 = lerp(parts.track.x0 / 2 * w, sc.trackAt * (w - len), k);
      for (let x = Math.max(0, x0 | 0); x < Math.min(w, x0 + len); x++) {
        const s = (x - x0) / len, a = parts.track.lift * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.1)) * (0.6 + 0.4 * N.n2(x * 0.05, 3));
        for (let dy = -2; dy <= 3; dy++) { const y = Math.round(nearL.ys[x]) + 1 + dy; if (y >= 0 && y < h) tone[y * w + x] += a * Math.exp(-dy * dy / 1.6) * (1 - rockM[y * w + x] * 0.3); }
      }
    }

    // 7 · smear: the camera's movement, growing toward one corner
    const sm = { cx: lerp(parts.smear.corner[0], sc.smear.corner[0], k), ang: lerp(parts.smear.angle, sc.smear.angle, k) * Math.PI / 180, reach: lerp(parts.smear.reach, sc.smear.reach, k), len: lerp(parts.smear.length, sc.smear.length, k) * smearK };
    const out = new Float32Array(w * h), ca = Math.cos(sm.ang), sa = Math.sin(sm.ang);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x / w * 2 - sm.cx) / 2, dy = y / h - 1, dist = Math.sqrt(dx * dx + dy * dy);
      const L = sm.len * w * Math.pow(sstep(sm.reach, 0, dist), 1.6) + 0.6;
      let s = 0, n = 0;
      for (let q = -4; q <= 4; q++) {
        const px = Math.min(w - 1, Math.max(0, Math.round(x + ca * L * q / 4))), py = Math.min(h - 1, Math.max(0, Math.round(y + sa * L * q / 4)));
        s += tone[py * w + px]; n++;
      }
      out[y * w + x] = Math.min(216, Math.max(36, s / n));
    }

    // cut at the middle into two sheets
    const S = parts.sheet, xw = hw >> 2, xh = h >> 2;
    return [0, 1].map(side => {
      const tb = new Uint8Array(hw * h), tex = new Uint8Array(xw * xh);
      for (let y = 0; y < h; y++) for (let x = 0; x < hw; x++) tb[y * hw + x] = out[y * w + x + side * hw];
      for (let y = 0; y < xh; y++) for (let x = 0; x < xw; x++) tex[y * xw + x] = Math.min(255, rockM[(y * 4 + 2) * w + x * 4 + 2 + side * hw] * 7.5 * 8);
      return { W: S.W, H: S.H, box: [side ? 0 : S.W - S.pic[0], S.top, S.pic[0], S.pic[1]], mat: S.mat, tw: hw, th: h, tone: tb, xw, xh, tex,
               grainL: parts.grainL, grainSD: parts.grainSD, grainRho: parts.grainRho, regime };
    });
  }

  const api = { sheets, REGIMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Compose = api;
})(typeof window !== 'undefined' ? window : globalThis);
