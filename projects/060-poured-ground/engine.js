// Poured Ground — composition engine. No DOM, no GL: the same seed gives the same score
// in the browser and in Node (tools/poured-ground-check.mjs).
//
// A composition is a *score* of timed events on a fixed 60 Hz clock:
//   pour  { t, x, y, r, pig }               a blob of pigment `pig` (0..3) set down at step t
//   drag  { t0, t1, pts, r, amt }           a finger drawn along polyline `pts` from t0 to t1
// Positions are in uv [0,1]² of the image area; lengths (r, path lengths) in units of the
// image's short side, so a composition reads the same on any format or resolution.
(function (global) {
  'use strict';

  const STYLES = { Spread: 0, Sweep: 1, Swirl: 2, Scatter: 3, Mixed: 4 };
  const FPS = 60;
  const SETTLE = 150; // steps after the last gesture for the liquid to come to rest

  // ---- colour ---------------------------------------------------------------------------
  function hexToSRGB(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function toLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function luminance(hex) {
    const s = hexToSRGB(hex).map(toLinear);
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }

  // Five palette colours → one ground + four pigments.
  //   ground 0 'lightest': the palette's lightest colour is the ground, the other four are paint
  //   ground 1 'darkest' : the darkest is the ground
  //   ground 2 'paper'   : a neutral paper white; four of the five colours are drawn as paint
  //                         (the one left out is chosen by the seed)
  const PAPER = '#F4F1EA';
  function assignColours(colors, ground, rng) {
    const idx = [0, 1, 2, 3, 4];
    const lum = colors.map(luminance);
    let g;
    if (ground === 2) {
      const drop = Math.floor(rng() * 5);
      idx.splice(drop, 1);
      g = PAPER;
    } else {
      let k = 0;
      for (let i = 1; i < 5; i++) if (ground === 1 ? lum[i] < lum[k] : lum[i] > lum[k]) k = i;
      idx.splice(k, 1);
      g = colors[k];
    }
    // seeded order, so the dominant pigment changes with the seed
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return { ground: g, pigments: idx.map(function (i) { return colors[i]; }), sourceIndex: idx };
  }

  // ---- paths ----------------------------------------------------------------------------
  // All builders work in "short-side units" around the image centre, then map to uv.
  function toUV(p, aspect) { return [0.5 + p[0] / aspect[0], 0.5 + p[1] / aspect[1]]; }
  function fromUV(u, aspect) { return [(u[0] - 0.5) * aspect[0], (u[1] - 0.5) * aspect[1]]; }

  function polyLength(pts, aspect) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i][0] - pts[i - 1][0]) * aspect[0], dy = (pts[i][1] - pts[i - 1][1]) * aspect[1];
      L += Math.hypot(dx, dy);
    }
    return L;
  }

  // quadratic bend + optional waviness; returns uv points
  function curve(a, b, bend, wave, waves, aspect, n) {
    n = n || 48;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const off = bend * 4 * u * (1 - u) * L + wave * Math.sin(u * Math.PI * 2 * waves) * L;
      pts.push(toUV([a[0] + dx * u + nx * off, a[1] + dy * u + ny * off], aspect));
    }
    return pts;
  }
  function arc(c, rad, a0, a1, drift, aspect, n) {
    n = n || 64;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = a0 + (a1 - a0) * u, r = rad * (1 + drift * u);
      pts.push(toUV([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], aspect));
    }
    return pts;
  }

  // ---- the score --------------------------------------------------------------------------
  // o: { style, pours, energy (0.3–2), aspect [ax, ay] = size / min(size) }
  function compose(rng, o) {
    const A = o.aspect;
    const R = function (a, b) { return a + (b - a) * rng(); };
    const half = [A[0] / 2, A[1] / 2]; // half extents in short-side units
    const inside = function (p, m) {
      return [Math.max(-half[0] + m, Math.min(half[0] - m, p[0])), Math.max(-half[1] + m, Math.min(half[1] - m, p[1]))];
    };
    const energy = o.energy;
    const speed = function () { return R(0.35, 0.8) * energy; }; // short-side units per second
    const events = [];
    let t = 8;

    // pigment sequence: weighted so one or two colours lead, the rest accent
    const weights = [R(1, 3), R(0.6, 2), R(0.3, 1.2), R(0.2, 0.9)];
    const wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    const pickPig = function () {
      let x = rng() * wsum;
      for (let i = 0; i < 4; i++) { if ((x -= weights[i]) <= 0) return i; }
      return 3;
    };

    const addDrag = function (pts, r, start) {
      // arcs and wavy pulls may overshoot: the finger lifts short of the sheet edge, so paint is not piled against the wall
      pts = pts.map(function (q) { return [Math.max(0.06, Math.min(0.94, q[0])), Math.max(0.06, Math.min(0.94, q[1]))]; });
      const len = polyLength(pts, A);
      const dur = Math.max(12, Math.round((len / speed()) * FPS));
      events.push({ type: 'drag', t0: start, t1: start + dur, pts: pts, r: r, amt: 0.9 });
      return start + dur;
    };
    const addPour = function (p, r, pig, at) {
      const u = toUV(p, A);
      events.push({ type: 'pour', t: at, x: u[0], y: u[1], r: r, pig: pig });
    };

    const style = o.style;
    const swirlC = [R(-0.12, 0.12) * A[0], R(-0.12, 0.12) * A[1]];
    const sweepTheta = R(0, Math.PI * 2);
    const centres = [];
    const nc = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nc; i++) centres.push([R(-0.3, 0.3) * A[0], R(-0.3, 0.3) * A[1]]);

    const n = o.pours * (style === STYLES.Scatter ? 2 : 1);
    for (let k = 0; k < n; k++) {
      const s = style === STYLES.Mixed ? Math.floor(rng() * 4) : style;
      const pig = pickPig();
      let end = t;
      if (s === STYLES.Spread) {
        const c = centres[Math.floor(rng() * centres.length)];
        const p = inside([c[0] + R(-0.12, 0.12), c[1] + R(-0.12, 0.12)], 0.08);
        const r = R(0.06, 0.13);
        addPour(p, r, pig, t);
        const nd = 2 + Math.floor(rng() * 3);
        let tt = t + 4;
        for (let d = 0; d < nd; d++) {
          const ang = R(0, Math.PI * 2), L = R(0.15, 0.45);
          const a = [p[0] + Math.cos(ang) * r * 0.3, p[1] + Math.sin(ang) * r * 0.3];
          const b = inside([a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L], 0.04);
          tt = addDrag(curve(a, b, R(-0.25, 0.25), 0, 0, A), R(0.03, 0.07), tt) - 6;
        }
        end = tt;
      } else if (s === STYLES.Sweep) {
        const th = sweepTheta + R(-0.25, 0.25);
        const dir = [Math.cos(th), Math.sin(th)], nrm = [-dir[1], dir[0]];
        const off = R(-0.45, 0.45), along = R(-0.25, 0.1);
        const p = inside([nrm[0] * off * A[0] + dir[0] * along, nrm[1] * off * A[1] + dir[1] * along], 0.08);
        const r = R(0.05, 0.11);
        addPour(p, r, pig, t);
        const L = R(0.5, 1.2);
        const a = [p[0] - dir[0] * r * 0.8, p[1] - dir[1] * r * 0.8];
        const b = inside([a[0] + dir[0] * L, a[1] + dir[1] * L], 0.03);
        end = addDrag(curve(a, b, R(-0.08, 0.08), R(0, 0.03), R(1, 3), A), R(0.06, 0.12), t + 4);
      } else if (s === STYLES.Swirl) {
        const rho = R(0.02, 0.32), a0 = R(0, Math.PI * 2);
        const p = inside([swirlC[0] + Math.cos(a0) * rho, swirlC[1] + Math.sin(a0) * rho], 0.08);
        const r = R(0.05, 0.11);
        addPour(p, r, pig, t);
        const span = R(1.2, 3.4) * (rng() < 0.85 ? 1 : -1);
        end = addDrag(arc(swirlC, Math.max(rho, 0.05), a0 - 0.2 * Math.sign(span), a0 + span, R(-0.3, 0.5), A), R(0.04, 0.08), t + 4);
      } else {
        const p = inside([R(-0.45, 0.45) * A[0], R(-0.45, 0.45) * A[1]], 0.05);
        const r = R(0.03, 0.07);
        addPour(p, r, pig, t);
        const ang = R(0, Math.PI * 2), L = R(0.06, 0.22);
        const b = inside([p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L], 0.03);
        end = addDrag(curve(p, b, R(-0.3, 0.3), 0, 0, A), R(0.025, 0.05), t + 3);
      }
      // the next gesture starts before this one ends, as a hand would
      t = Math.max(t + 6, Math.round(t + (end - t) * R(0.45, 0.85)));
    }
    let last = 0;
    for (const e of events) last = Math.max(last, e.type === 'pour' ? e.t : e.t1);
    return { events: events, steps: last + SETTLE };
  }

  // Finger position at step t for a drag, eased in and out; null when inactive.
  function dragAt(e, t) {
    if (t < e.t0 || t > e.t1) return null;
    let u = (t - e.t0) / (e.t1 - e.t0);
    u = u * u * (3 - 2 * u);
    const f = u * (e.pts.length - 1), i = Math.min(e.pts.length - 2, Math.floor(f)), w = f - i;
    const a = e.pts[i], b = e.pts[i + 1];
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  }

  // ---- print formats -----------------------------------------------------------------------
  const FORMATS = {
    'A3 (297×420 mm)': [297, 420],
    'A2 (420×594 mm)': [420, 594],
    'A1 (594×841 mm)': [594, 841],
    'A0 (841×1189 mm)': [841, 1189],
    '16×20 in': [406.4, 508],
    '24×30 in': [609.6, 762],
    '30×40 in': [762, 1016],
    '40×50 in': [1016, 1270],
    'Square 24 in': [609.6, 609.6],
    'Square 36 in': [914.4, 914.4],
  };
  const FORMAT_KEYS = Object.keys(FORMATS);

  // sheet & image geometry in mm and print pixels
  // Sheet geometry. `imgAspect` (width / height of the original work, optional) keeps the
  // proportions of the original: the image area takes that aspect, fitted whole inside the
  // paper minus the border, so the border grows on one axis only; nothing is cropped and the
  // paper keeps its size. Without it, the image area fills the paper minus an even border.
  // `landscape` may be true/false, or 'auto' to orient the paper like the original.
  function sheet(formatIdx, landscape, borderMM, dpi, imgAspect) {
    let wh = FORMATS[FORMAT_KEYS[formatIdx]] || FORMATS[FORMAT_KEYS[0]];
    if (landscape === 'auto') landscape = !!(imgAspect && imgAspect > 1);
    if (landscape) wh = [wh[1], wh[0]];
    const b = Math.max(0, Math.min(borderMM, Math.min(wh[0], wh[1]) * 0.3));
    let img = [wh[0] - 2 * b, wh[1] - 2 * b];
    if (imgAspect && isFinite(imgAspect) && imgAspect > 0) {
      img = img[0] / img[1] > imgAspect ? [img[1] * imgAspect, img[1]] : [img[0], img[0] / imgAspect];
    }
    const bx = (wh[0] - img[0]) / 2, by = (wh[1] - img[1]) / 2;
    const m = Math.min(img[0], img[1]);
    return {
      name: FORMAT_KEYS[formatIdx], landscape: !!landscape,
      mm: wh, borderMM: b, bx: bx, by: by, imageMM: img, imgAspect: imgAspect || null,
      aspect: [img[0] / m, img[1] / m],
      px: [Math.round((wh[0] / 25.4) * dpi), Math.round((wh[1] / 25.4) * dpi)],
    };
  }

  // ---- "after the work": a brief (briefs.js) compiled into a score -------------------------
  // The ground is the brief's colour; the other four palette colours become the pigment
  // channels in palette order. Fields are laid first (each covers what lies beneath, as a
  // painter blocks in), then the drops, then the gestures. The seed varies geometry slightly,
  // drops' placement, and the hand: which gestures, their angles, reach and count. The layout
  // stays the work's.
  function briefColours(colors, brief) {
    const idx = [0, 1, 2, 3, 4].filter(function (i) { return i !== brief.g; });
    const chan = {};
    idx.forEach(function (i, c) { chan[i] = c; });
    return { ground: colors[brief.g], pigments: idx.map(function (i) { return colors[i]; }), sourceIndex: idx, chan: chan };
  }

  const FIELD_TH = 0.055; // thickness of a laid field; a poured drop peaks near 0.19


  // ---- interpretation: the work as a starting point ------------------------------------------
  // A brief is the work's layout. `interp` (0..1) says how far a generation travels from it.
  // The seed picks readings, each a named, reversible-in-principle operation on the layout, so
  // every print can say what was done to its source:
  //   detail    zoom into one region of the work (a fragment becomes the whole)
  //   turn      the composition rotated
  //   fragment  fields cut into strips and shards, pieces displaced
  //   drift     every field carried by a slow current, stretched and turned
  //   distil    only the main mass of each colour kept, enlarged
  //   echo      the work's own gestures repeated elsewhere, turned and rescaled
  //   exchange  ground and figure swap: the largest field's colour becomes the ground
  // Independently of the readings, the hand goes further with interp: longer, stronger, more
  // gestures, and freer placement. All five colours are always kept: a colour that a reading
  // pushes off the sheet returns as traces.
  const READINGS = [['detail', 1.2], ['turn', 0.6], ['fragment', 1], ['drift', 1], ['distil', 0.7], ['echo', 1], ['exchange', 0.6]];

  function interpret(rng, brief, interp) {
    const R = function (a, b) { return a + (b - a) * rng(); };
    const g0 = brief.g;
    let g = g0;
    let z = brief.z.map(function (f) { return f.slice(); });
    let m = brief.m.map(function (f) { return f.slice(); });
    const said = [];
    if (interp <= 0) return { g: g, z: z, m: m, readings: said };

    // pick readings without replacement
    const count = interp < 0.15 ? 0 : interp < 0.45 ? 1 : interp < 0.8 ? 2 : 3;
    const pool = READINGS.slice(), picked = [];
    for (let i = 0; i < count && pool.length; i++) {
      let tot = 0; pool.forEach(function (r) { tot += r[1]; });
      let x = rng() * tot, j = 0;
      for (; j < pool.length - 1; j++) { if ((x -= pool[j][1]) <= 0) break; }
      picked.push(pool[j][0]); pool.splice(j, 1);
    }
    const has = function (k) { return picked.indexOf(k) >= 0; };

    const area = function (f) {
      if (f[0] === 'R') return Math.abs((f[4] - f[2]) * (f[5] - f[3]));
      if (f[0] === 'E') return Math.PI * f[4] * f[5];
      if (f[0] === 'M') return 4 * f[4] * f[5] * (f[7].a / Math.max(1e-9, 4 * f[7].sx * f[7].sy));   // its box × how much of it the mask fills
      if (f[0] === 'L') return Math.hypot(f[4] - f[2], f[5] - f[3]) * f[6];
      return f[6] * Math.PI * f[7] * f[7];
    };
    const centre = function (f) {
      if (f[0] === 'E' || f[0] === 'M') return [f[2], f[3]];
      return [(f[2] + f[4]) / 2, (f[3] + f[5]) / 2];
    };
    // apply a similarity map T (point → point) with length factor k and turn dθ (degrees, CCW)
    const mapAll = function (T, k, dth, fields, moves) {
      const box = function (f, i) { const a = T(f[i], f[i + 1]), b = T(f[i + 2], f[i + 3]); f[i] = Math.min(a[0], b[0]); f[i + 1] = Math.min(a[1], b[1]); f[i + 2] = Math.max(a[0], b[0]); f[i + 3] = Math.max(a[1], b[1]); };
      const fieldMap = function (f) {
        if (f[0] === 'R') {
          const c = T((f[2] + f[4]) / 2, (f[3] + f[5]) / 2), hx = Math.abs(f[4] - f[2]) / 2 * k, hy = Math.abs(f[5] - f[3]) / 2 * k;
          f[2] = c[0] - hx; f[3] = c[1] - hy; f[4] = c[0] + hx; f[5] = c[1] + hy; f[6] += dth;
        } else if (f[0] === 'E' || f[0] === 'M') { const c = T(f[2], f[3]); f[2] = c[0]; f[3] = c[1]; f[4] *= k; f[5] *= k; f[6] += dth; }
        else if (f[0] === 'L') { const a = T(f[2], f[3]), b = T(f[4], f[5]); f[2] = a[0]; f[3] = a[1]; f[4] = b[0]; f[5] = b[1]; f[6] *= k; }
        else { box(f, 2); f[7] *= k; }
      };
      const moveMap = function (q) {
        if (q[0] === 'P') { const a = T(q[1], q[2]), b = T(q[3], q[4]); q[1] = a[0]; q[2] = a[1]; q[3] = b[0]; q[4] = b[1]; q[5] *= k; }
        else if (q[0] === 'B') { const c = T(q[1], q[2]); q[1] = c[0]; q[2] = c[1]; q[3] += dth; q[4] += dth; q[5] *= k; q[7] *= k; }
        else if (q[0] === 'C') { box(q, 1); q[5] += dth; q[7] *= k; }
        else if (q[0] === 'S') { const c = T(q[1], q[2]); q[1] = c[0]; q[2] = c[1]; q[3] *= k; q[5] *= k; }
        else { box(q, 1); q[6] *= k; }
      };
      (fields || z).forEach(fieldMap);
      (moves || m).forEach(moveMap);
    };
    const rot = function (cx, cy, th) {
      const c = Math.cos(th * Math.PI / 180), s = Math.sin(th * Math.PI / 180);
      return function (x, y) { const dx = x - cx, dy = y - cy; return [cx + dx * c + dy * s, cy - dx * s + dy * c]; };
    };

    if (has('exchange')) {
      // the largest field's colour becomes the ground; the old ground takes its place as paint
      let best = null;
      z.forEach(function (f) { if (f[1] !== g && f[0] !== 'D' && (!best || area(f) > area(best))) best = f; });
      if (best) {
        const ng = best[1];
        z.forEach(function (f) { if (f[1] === ng) f[1] = g; else if (f[1] === g) f[1] = ng; });
        g = ng;
        said.push('ground and figure exchanged');
      } else picked.splice(picked.indexOf('exchange'), 1);
    }
    if (has('distil')) {
      // the largest mass of each colour, enlarged; everything else let go
      const keep = {};
      z.forEach(function (f) { if (!keep[f[1]] || area(f) > area(keep[f[1]])) keep[f[1]] = f; });
      z = Object.keys(keep).map(function (k) { return keep[k]; }).sort(function (a, b) { return area(b) - area(a); });
      const grow = 1 + 0.6 * interp;
      z.forEach(function (f) { const c = centre(f); mapAll(function (x, y) { return [c[0] + (x - c[0]) * grow, c[1] + (y - c[1]) * grow]; }, grow, 0, [f], []); });
      said.push('distilled to the main mass of each colour');
    }
    if (has('fragment')) {
      const out = [];
      z.forEach(function (f) {
        if (f[0] === 'D' || rng() > 0.35 + 0.5 * interp) { out.push(f); return; }
        const n = 2 + Math.floor(rng() * (2 + 3 * interp)), shift = 0.08 * interp;
        if (f[0] === 'M') f = ['R', f[1], f[2] - f[4], f[3] - f[5], f[2] + f[4], f[3] + f[5], f[6]];   // a silhouette fragments as its box does
        if (f[0] === 'R') {
          const vert = rng() < 0.5;
          for (let i = 0; i < n; i++) {
            const a = i / n, b = (i + 0.85) / n, o = R(-shift, shift);
            out.push(vert ? ['R', f[1], f[2] + (f[4] - f[2]) * a, f[3] + o, f[2] + (f[4] - f[2]) * b, f[5] + o, f[6] + R(-6, 6) * interp]
                          : ['R', f[1], f[2] + o, f[3] + (f[5] - f[3]) * a, f[4] + o, f[3] + (f[5] - f[3]) * b, f[6] + R(-6, 6) * interp]);
          }
        } else if (f[0] === 'E') {
          for (let i = 0; i < n; i++) out.push(['E', f[1], f[2] + R(-1, 1) * f[4] * 0.8, f[3] + R(-1, 1) * f[5] * 0.8, f[4] * R(0.35, 0.7), f[5] * R(0.35, 0.7), f[6] + R(-40, 40)]);
        } else {
          for (let i = 0; i < n; i++) {
            const a = i / n, b = (i + 0.7) / n, o = R(-shift, shift);
            out.push(['L', f[1], f[2] + (f[4] - f[2]) * a + o, f[3] + (f[5] - f[3]) * a, f[2] + (f[4] - f[2]) * b + o, f[3] + (f[5] - f[3]) * b, f[6]]);
          }
        }
      });
      z = out;
      said.push('fragmented');
    }
    if (has('drift')) {
      const A = 0.14 * interp, fx = R(2, 5), fy = R(2, 5), p1 = R(0, 6.3), p2 = R(0, 6.3);
      z.forEach(function (f) {
        const c = centre(f), d = [A * Math.sin(fy * c[1] + p1), A * Math.cos(fx * c[0] + p2)];
        const k = 1 + R(-0.3, 0.4) * interp, th = R(-25, 25) * interp;
        const T0 = rot(c[0], c[1], th);
        mapAll(function (x, y) { const q = T0(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k); return [q[0] + d[0], q[1] + d[1]]; }, k, th, [f], []);
      });
      said.push('drifted');
    }
    if (has('detail')) {
      // a region of the work, enlarged to fill the sheet; centred on one of its larger fields
      const big = z.filter(function (f) { return f[0] !== 'D'; }).sort(function (a, b) { return area(b) - area(a); }).slice(0, 4);
      const f = big.length ? big[Math.floor(rng() * big.length)] : null;
      const c = f ? centre(f) : [0.5, 0.5];
      const cx = Math.min(0.8, Math.max(0.2, c[0] + R(-0.12, 0.12))), cy = Math.min(0.8, Math.max(0.2, c[1] + R(-0.12, 0.12)));
      const k = 1.4 + R(0.4, 1.6) * interp;
      mapAll(function (x, y) { return [0.5 + (x - cx) * k, 0.5 + (y - cy) * k]; }, k, 0);
      said.push('a detail, enlarged ' + k.toFixed(1) + '×');
    }
    if (has('turn')) {
      const th = (rng() < 0.5 ? -1 : 1) * R(15, 25 + 65 * interp);
      mapAll(rot(0.5, 0.5, th), 1, th);
      said.push('turned ' + Math.round(Math.abs(th)) + '°');
    }
    if (has('echo') && m.length) {
      const src = m.slice(), n = 2 + Math.floor(rng() * (1 + 3 * interp));
      for (let i = 0; i < n; i++) {
        const q = src[Math.floor(rng() * src.length)].slice(), k = R(0.6, 1.4), th = R(-60, 60);
        const dx = R(-0.3, 0.3), dy = R(-0.3, 0.3);
        const T0 = rot(0.5, 0.5, th);
        mapAll(function (x, y) { const p = T0(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k); return [p[0] + dx, p[1] + dy]; }, k, th, [], [q]);
        m.push(q);
      }
      said.push('its gestures echoed');
    }

    // the hand goes further: longer, stronger, more gestures; extra pulls through the fields
    const reach = 1 + 0.9 * interp;
    m.forEach(function (q) {
      if (q[0] === 'P') { const cx = (q[1] + q[3]) / 2, cy = (q[2] + q[4]) / 2; q[1] = cx + (q[1] - cx) * reach; q[3] = cx + (q[3] - cx) * reach; q[2] = cy + (q[2] - cy) * reach; q[4] = cy + (q[4] - cy) * reach; q[5] *= 1 + 0.5 * interp; }
      else if (q[0] === 'B') { q[5] *= reach; q[6] = Math.round(q[6] * (1 + interp)); q[7] *= 1 + 0.5 * interp; }
      else if (q[0] === 'C') { q[6] = Math.round(q[6] * (1 + interp)); q[7] *= 1 + 0.5 * interp; }
      else if (q[0] === 'S') { q[3] *= 1 + 0.5 * interp; q[4] *= reach; q[5] *= 1 + 0.5 * interp; }
      else { q[5] = Math.round(q[5] * (1 + interp)); q[6] *= 1 + 0.5 * interp; }
    });
    const extra = Math.round(4 * interp * interp);
    const solids = z.filter(function (f) { return f[0] !== 'D'; });
    for (let i = 0; i < extra && solids.length; i++) {
      const c = centre(solids[Math.floor(rng() * solids.length)]), a = R(0, Math.PI * 2), L = R(0.2, 0.6);
      m.push(['P', c[0] - Math.cos(a) * L / 2, c[1] - Math.sin(a) * L / 2, c[0] + Math.cos(a) * L / 2, c[1] + Math.sin(a) * L / 2, R(0.03, 0.07)]);
    }
    if (interp >= 0.3) said.push('the hand pushed further');

    // every colour stays: one pushed off the sheet comes back as traces
    const visible = function (f) {
      let x0, y0, x1, y1;
      if (f[0] === 'E' || f[0] === 'M') { x0 = f[2] - f[4]; x1 = f[2] + f[4]; y0 = f[3] - f[5]; y1 = f[3] + f[5]; }
      else { x0 = Math.min(f[2], f[4]); x1 = Math.max(f[2], f[4]); y0 = Math.min(f[3], f[5]); y1 = Math.max(f[3], f[5]); }
      return x1 > 0.04 && x0 < 0.96 && y1 > 0.04 && y0 < 0.96;
    };
    for (let c = 0; c < 5; c++) {
      if (c === g) continue;
      if (!z.some(function (f) { return f[1] === c && visible(f); })) z.push(['D', c, 0.1, 0.1, 0.9, 0.9, 3, 0.03]);
    }
    return { g: g, z: z, m: m, readings: said };
  }

  // ---- from the reading: a brief derived from the painting reader's measurements ------------
  // A reading (readings.js / archive/readings.json, made by tools/painting-reader) holds what the
  // reader measured in the museum image: colour clusters with shares, connected value masses,
  // colour islands and a sparse-detail field (each with box, centroid, principal axis, occupancy),
  // the configurations it found between them, the dominant edge direction and the detail per
  // grid cell. Nothing here traces the image: the masses are laid where the reader found them,
  // at their measured size and orientation, and the configurations become what the hand does.
  // Deterministic: the same record and aspect give the same brief. Basis k = 2.
  //
  //   colours      the five clusters by share; the largest is the ground (the painting's surface)
  //   light mass   the lightest colour · dark mass the darkest · colour island its own cluster
  //   sparse field laid as nothing: a calm interval the gestures avoid
  //   a colour with no island   dabs around its pixel centroid, so every measured colour is present
  //   shape        the field's own silhouette (the reader's connected grid cells, smoothed), laid
  //                where it was measured; a record without masks falls back to a rectangle (a mass
  //                filling ≥ 55% of its box) or an ellipse of its area, elongated by its axis-variance
  //                ratio and turned to its principal axis
  //   value_opposition   one pull of the hand from the dark mass to the light one
  //   cross_axes         a comb along each field's axis
  //   detail_interval    a burst from the detailed field, aimed away from the sparse one
  //   color_recurrence   a pull joining the two islands of one colour
  //   shared field       a swirl on the field the principal configurations have in common
  //   edges              a comb across the sheet along the dominant edge direction (if it dominates)
  //   grid cells         scribbles in the cell(s) with the most detail
  const READ_KIND = { light: 'light', dark: 'dark', color: 'colour', sparse: 'sparse' };
  function readBrief(rd, aspect) {
    const A = aspect || [1, 1], cols = rd.colors;
    const lum = cols.map(luminance);
    const g = 0;
    const clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    const tilt = function (deg) { let t = -deg; while (t <= -90) t += 180; while (t > 90) t -= 180; return Math.round(t); };  // reader: 0 right, 90 down → ccw
    const F = rd.fields.map(function (f) {
      return { id: f[0], kind: f[1], area: f[2], x0: f[3], y0: f[4], x1: f[5], y1: f[6], cx: f[7], cy: f[8], axis: f[9], vr: f[10], occ: f[11], edge: f[12], L: f[13], pal: f[14], mask: f[15] || null };
    });
    const byId = {}; F.forEach(function (f) { byId[f.id] = f; });
    // A value mass takes a pigment by rank, not always the single lightest or darkest: the darker
    // of two dark masses gets the darker pigment, the next the next, so a work with one dark mass
    // keeps its strongest colour (the Wave stays Prussian blue) and a work with five spreads across
    // the palette instead of flooding the sheet with one. The ground is not a candidate, so a mass
    // the reader measured is always laid rather than cleared to bare sheet.
    const Lst = lum.map(function (y) { return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; });
    const pigments = [0, 1, 2, 3, 4].filter(function (i) { return i !== g; });
    const darkRank = pigments.slice().sort(function (a, b) { return Lst[a] - Lst[b]; });
    const lightRank = pigments.slice().sort(function (a, b) { return Lst[b] - Lst[a]; });
    const massColour = {};
    rd.fields.filter(function (f) { return f[1] === 'dark'; }).sort(function (a, b) { return a[13] - b[13]; })
      .forEach(function (f, i) { massColour[f[0]] = darkRank[Math.min(i, darkRank.length - 1)]; });
    rd.fields.filter(function (f) { return f[1] === 'light'; }).sort(function (a, b) { return b[13] - a[13]; })
      .forEach(function (f, i) { massColour[f[0]] = lightRank[Math.min(i, lightRank.length - 1)]; });
    const colourOf = function (f) { return f.kind === 'color' ? f.pal : f.kind === 'light' || f.kind === 'dark' ? massColour[f.id] : null; };
    const z = [];
    F.filter(function (f) { return f.kind !== 'sparse' && colourOf(f) !== null; })
      .sort(function (a, b) { return b.area - a.area; })
      .forEach(function (f) {
        const c = colourOf(f);
        if (f.mask && rd.grid) {
          // M: the silhouette, placed by its box centre; sx, sy half-extents (uv); the mask object
          // keeps its own frame so interpretation can move, scale and turn it
          const sx = (f.x1 - f.x0) / 2, sy = (f.y1 - f.y0) / 2;
          z.push(['M', c, +((f.x0 + f.x1) / 2).toFixed(3), +((f.y0 + f.y1) / 2).toFixed(3), +sx.toFixed(3), +sy.toFixed(3), 0,
                  { cols: rd.grid[0], rows: rd.grid[1], bits: f.mask, a: f.area, sx: sx, sy: sy, c0: [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2] }]);
        } else if (f.occ >= 0.55) {
          const s = clamp(Math.sqrt(f.occ), 0.55, 1), hw = (f.x1 - f.x0) / 2 * s, hh = (f.y1 - f.y0) / 2 * s;
          z.push(['R', c, +(f.cx - hw).toFixed(3), +(f.cy - hh).toFixed(3), +(f.cx + hw).toFixed(3), +(f.cy + hh).toFixed(3), 0]);
        } else {
          const areaSU = f.area * A[0] * A[1], q = clamp(Math.sqrt(f.vr || 1), 1, 3);
          const ry = Math.sqrt(areaSU / (Math.PI * q)), rx = ry * q;
          z.push(['E', c, f.cx, f.cy, +rx.toFixed(3), +ry.toFixed(3), f.axis === null || f.axis === undefined ? 0 : tilt(f.axis)]);
        }
      });
    const m = [];
    const centroidDist = function (a, b) { return Math.hypot((a.cx - b.cx) * A[0], (a.cy - b.cy) * A[1]); };
    // The reader orders its configurations by the area they affect, and says so: its selection
    // weight is the summed area of the fields a configuration names. The hand follows that order
    // and that weight, so the relation the reader called principal is made first and made hardest.
    const weighed = rd.configs.map(function (c) {
      const f = c[2].map(function (id) { return byId[id]; }).filter(Boolean);
      return { c: c, f: f, w: f.reduce(function (s, x) { return s + x.area; }, 0) };
    }).filter(function (q) { return q.f.length >= 2; }).sort(function (a, b) { return b.w - a.w; });
    const wTop = weighed.length ? weighed[0].w : 1;
    weighed.forEach(function (q) {
      const kind = q.c[1], f = q.f;
      const k = 0.6 + 0.8 * (wTop > 0 ? q.w / wTop : 1);          // 1.4 for the principal, 0.6 for the slightest
      if (kind === 'value_opposition') {
        const d = f[0].kind === 'dark' ? f[0] : f[1], l = d === f[0] ? f[1] : f[0];
        m.push(['P', d.cx, d.cy, l.cx, l.cy, +((0.03 + 0.06 * Math.sqrt(Math.min(d.area, l.area))) * k).toFixed(3)]);
      } else if (kind === 'cross_axes') {
        f.forEach(function (x) { if (x.axis !== null && x.axis !== undefined) m.push(['C', x.x0, x.y0, x.x1, x.y1, tilt(x.axis), Math.max(2, Math.round((2 + 6 * Math.sqrt(x.area)) * k)), +(0.03 * k).toFixed(3)]); });
      } else if (kind === 'detail_interval') {
        const sp = f[0].kind === 'sparse' ? f[0] : f[1], det = sp === f[0] ? f[1] : f[0];
        const dx = (det.cx - sp.cx) * A[0], dy = (det.cy - sp.cy) * A[1];
        const ang = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI);    // away from the calm field, ccw (90 = up)
        const len = clamp(0.5 * Math.hypot(dx, dy) * k, 0.08, 0.3);
        m.push(['B', det.cx, det.cy, ang - 50, ang + 50, +len.toFixed(3), clamp(Math.round((3 + det.edge * 20) * k), 3, 8), +(0.03 * k).toFixed(3)]);
      } else if (kind === 'color_recurrence') {
        m.push(['P', f[0].cx, f[0].cy, f[1].cx, f[1].cy, +(0.03 * k).toFixed(3)]);
      }
    });
    if (rd.shared && rd.shared.length && byId[rd.shared[0]]) {
      const s = byId[rd.shared[0]], rad = clamp(0.5 * Math.sqrt(s.area * A[0] * A[1] / Math.PI), 0.06, 0.3);
      m.push(['S', s.cx, s.cy, +rad.toFixed(3), 1.5, 0.04]);
    }
    // The grain of the whole sheet. The reader bins edge tangents into 8 directions over 180
    // degrees; a flat image would put 1/8 in each. The strongest direction carrying at least 1.5
    // times that is combed across the sheet, with 2 to 4 teeth in proportion to its share; a
    // second such direction is combed lightly across it, 2 narrow teeth, so a woven painting is
    // crossed both ways without being worked into drips. A one-direction painting is combed once,
    // as before. Two full combs were tried first and turned rectilinear works into curtains.
    if (rd.ebins && rd.ebins.length === 8) {
      const EB_MIN = 0.1875, EB_MAX = 2;
      rd.ebins.map(function (v, i) { return [v, i * 180 / 8]; })
        .filter(function (b) { return b[0] >= EB_MIN; })
        .sort(function (a, b) { return b[0] - a[0]; })
        .slice(0, EB_MAX)
        .forEach(function (b, i) { m.push(['C', 0.05, 0.05, 0.95, 0.95, tilt(b[1]), i === 0 ? clamp(Math.round(b[0] * 10), 2, 4) : 2, i === 0 ? 0.025 : 0.015]); });
    } else if (rd.edges && rd.edges[1] >= 0.22) {   // a reading made before the grain was kept
      m.push(['C', 0.05, 0.05, 0.95, 0.95, tilt(rd.edges[0]), 3, 0.025]);
    }
    if (rd.cells && rd.cells.length === 9) {
      const order = rd.cells.map(function (d, i) { return [d, i]; }).sort(function (a, b) { return b[0] - a[0]; });
      order.slice(0, 2).forEach(function (ci, k) {
        if (ci[0] < (k === 0 ? 0.1 : 0.15)) return;
        const row = Math.floor(ci[1] / 3), col = ci[1] % 3;
        m.push(['W', +(col / 3).toFixed(3), +(row / 3).toFixed(3), +((col + 1) / 3).toFixed(3), +((row + 1) / 3).toFixed(3), k === 0 ? 3 : 2, 0.025]);
      });
    }
    // every measured colour reaches the sheet: one the reader found no connected island for is
    // dropped as dabs around its pixel centroid (the colour is present there, only scattered)
    const usedC = new Set([g]); z.forEach(function (f) { usedC.add(f[1]); });
    for (let c = 0; c < cols.length; c++) {
      if (usedC.has(c)) continue;
      const ct = (rd.centroids && rd.centroids[c]) || [0.5, 0.5], sh = rd.shares[c] || 0.05, half = clamp(0.1 + 0.3 * Math.sqrt(sh), 0.1, 0.25);
      z.push(['D', c, +clamp(ct[0] - half, 0.03, 0.97).toFixed(3), +clamp(ct[1] - half, 0.03, 0.97).toFixed(3), +clamp(ct[0] + half, 0.03, 0.97).toFixed(3), +clamp(ct[1] + half, 0.03, 0.97).toFixed(3), clamp(3 + Math.round(sh * 20), 3, 8), +(0.02 + 0.04 * Math.sqrt(sh)).toFixed(3)]);
    }
    if (!m.length && z.length) {   // no configuration found: one pull across the largest mass
      const f = F.filter(function (x) { return x.kind !== 'sparse'; }).sort(function (a, b) { return b.area - a.area; })[0];
      m.push(['P', f.x0, f.cy, f.x1, f.cy, 0.04]);
    }
    // the note: where the reader found the masses (positions, not subjects)
    const where = function (f) {
      const v = f.cy < 0.37 ? 'upper' : f.cy > 0.63 ? 'lower' : '', h = f.cx < 0.37 ? 'left' : f.cx > 0.63 ? 'right' : '';
      return v && h ? v + ' ' + h : v || h || 'centre';
    };
    const first = function (kind) { return F.filter(function (f) { return f.kind === kind; }).sort(function (a, b) { return b.area - a.area; })[0]; };
    const parts = [];
    const dk = first('dark'), lt = first('light'), sp = first('sparse');
    if (dk && lt) parts.push('a darker mass ' + where(dk) + ' against a lighter one ' + where(lt));
    else if (dk) parts.push('a darker mass ' + where(dk)); else if (lt) parts.push('a lighter mass ' + where(lt));
    const islands = F.filter(function (f) { return f.kind === 'color'; }).sort(function (a, b) { return b.area - a.area; }).slice(0, 3);
    if (islands.length) parts.push('colour ' + islands.map(function (f) { return cols[f.pal] + ' ' + where(f); }).join(', '));
    if (sp) parts.push('calm ' + where(sp));
    const kinds = rd.configs.map(function (c) { return c[1].replace('_', ' '); });
    if (kinds.length) parts.push(kinds.join(', '));
    const note = parts.join('; ') || 'what the reader measured in the image';
    return { g: g, k: 2, note: note, z: z, m: m, read: { fields: F.length, laid: z.length, gestures: m.length, configurations: kinds, sha256: rd.sha256, source: rd.source, px: rd.px, reader: rd.reader, read_on: rd.read_on } };
  }

  function composeBrief(rng, brief, o) {
    const A = o.aspect, energy = o.energy, interp = o.interp || 0;
    // handling 1 (default): the masses are poured in layers and the hand works between them, and
    // every stroke travels less, so what the reader measured is still legible when the film
    // settles. handling 0 is the earlier sweeping hand: one pour, then every gesture at full reach.
    const layered = o.handling === undefined ? 1 : (o.handling ? 1 : 0);
    const REACH = layered ? 0.62 : 1;
    const R = function (a, b) { return a + (b - a) * rng(); };
    const J = function (v, j) { return v + R(-j, j); };
    const plan = interpret(rng, brief, interp);
    brief = { g: plan.g, z: plan.z, m: plan.m };
    const chan = briefColours(['', '', '', '', ''], brief).chan;
    const scr = function (x, y) { return [x, 1 - y]; };                      // y-down → sim uv
    const sh = function (u) { return [(u[0] - 0.5) * A[0], (u[1] - 0.5) * A[1]]; }; // uv → short units
    const un = function (p) { return [0.5 + p[0] / A[0], 0.5 + p[1] / A[1]]; };
    const clampUV = function (q) { return [Math.max(0.03, Math.min(0.97, q[0])), Math.max(0.03, Math.min(0.97, q[1]))]; };
    const events = [];
    let t = 1;
    // placement loosens with interpretation
    const jit = 0.012 + 0.04 * interp, sj = 0.06 + 0.2 * interp, aj = (3 + 15 * interp) * Math.PI / 180;

    // every field stays on the sheet: one that would cross an edge is moved in, and one larger
    // than the sheet is scaled down to fit (nothing is cut off by the canvas's edge)
    const contain = function (e) {
      const c = Math.abs(Math.cos(e.ang)), s = Math.abs(Math.sin(e.ang));
      let ex = e.shape === 1 ? Math.hypot(e.hx * c, e.hy * s) : e.hx * c + e.hy * s;   // half extents,
      let ey = e.shape === 1 ? Math.hypot(e.hx * s, e.hy * c) : e.hx * s + e.hy * c;   // short units
      const fit = Math.min(1, 0.5 * A[0] / ex, 0.5 * A[1] / ey);
      if (fit < 1) { e.hx *= fit; e.hy *= fit; ex *= fit; ey *= fit; if (e.mask) e.scale *= fit; }
      const mx = ex / A[0], my = ey / A[1];                     // in uv
      e.cx = Math.min(1 - mx, Math.max(mx, e.cx));
      e.cy = Math.min(1 - my, Math.max(my, e.cy));
      return e;
    };
    const fieldOf = function (f) { return contain(fieldRaw(f)); };
    const fieldRaw = function (f) {
      const c = f[1], ch = c === brief.g ? -1 : chan[c];
      if (f[0] === 'R') {
        const x0 = J(f[2], jit), y0 = J(f[3], jit), x1 = J(f[4], jit), y1 = J(f[5], jit);
        const ctr = scr((x0 + x1) / 2, (y0 + y1) / 2);
        return { type: 'zone', shape: 0, cx: ctr[0], cy: ctr[1], hx: Math.abs(x1 - x0) / 2 * A[0], hy: Math.abs(y1 - y0) / 2 * A[1], ang: f[6] * Math.PI / 180 + R(-aj, aj), chan: ch, th: FIELD_TH };
      }
      if (f[0] === 'E') {
        const k = 1 + R(-sj, sj), ctr = scr(J(f[2], jit), J(f[3], jit));
        return { type: 'zone', shape: 1, cx: ctr[0], cy: ctr[1], hx: f[4] * k, hy: f[5] * k, ang: f[6] * Math.PI / 180 + R(-aj, aj), chan: ch, th: FIELD_TH };
      }
      if (f[0] === 'M') {
        // the silhouette: its box centre is placed (with the usual jitter), its extent scaled, its
        // frame turned; the mask is sampled in its own frame at `scale` times the original size
        const k = 1 + R(-sj, sj), ctr = scr(J(f[2], jit), J(f[3], jit)), m = f[7];
        const c0 = scr(m.c0[0], m.c0[1]);
        return { type: 'zone', shape: 2, cx: ctr[0], cy: ctr[1], hx: f[4] * k * A[0], hy: f[5] * k * A[1], ang: f[6] * Math.PI / 180 + R(-aj, aj), chan: ch, th: FIELD_TH,
                 mask: m, m0: c0, scale: (f[4] / Math.max(1e-9, m.sx)) * k };
      }
      // L: a band between two points
      const a = sh(scr(J(f[2], jit), J(f[3], jit))), b = sh(scr(J(f[4], jit), J(f[5], jit)));
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const ctr = un([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      return { type: 'zone', shape: 0, cx: ctr[0], cy: ctr[1], hx: len / 2, hy: f[6] / 2 * (1 + R(-sj, sj)), ang: Math.atan2(dy, dx), chan: ch, th: FIELD_TH };
    };
    const drops = [], zones = [];
    for (const f of brief.z) {
      if (f[0] === 'D') {
        const n = Math.max(1, Math.round(f[6] * R(0.8, 1.25)));
        for (let i = 0; i < n; i++) {
          const u = scr(R(f[2], f[4]), R(f[3], f[5]));
          drops.push({ type: 'pour', x: Math.max(0.02, Math.min(0.98, u[0])), y: Math.max(0.02, Math.min(0.98, u[1])), r: f[7] * R(0.7, 1.4), pig: chan[f[1]], k: 0.4 });
        }
      } else {
        zones.push(fieldOf(f));
      }
    }

    const speed = function () { return R(0.35, 0.8) * energy; };
    const drag = function (pts, r, start) {
      pts = pts.map(clampUV);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot((pts[i][0] - pts[i - 1][0]) * A[0], (pts[i][1] - pts[i - 1][1]) * A[1]);
      const dur = Math.max(10, Math.round(len / speed() * FPS));
      events.push({ type: 'drag', t0: start, t1: start + dur, pts: pts, r: r, amt: 0.9 });
      return start + dur;
    };
    const line = function (a, b, bend, n) { // a, b in short units → uv polyline with a bend
      n = n || 32;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, out = [];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), off = bend * 4 * u * (1 - u) * L;
        out.push(un([a[0] + dx * u + nx * off, a[1] + dy * u + ny * off]));
      }
      return out;
    };
    const strokes = []; // [pts, r] in order
    brief.m.forEach(function (m) {
      const k = m[0];
      if (k === 'P') {
        let a = sh(scr(J(m[1], .03), J(m[2], .03))), b = sh(scr(J(m[3], .03), J(m[4], .03)));
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];     // shortened about its middle: same
        a = [mid[0] + (a[0] - mid[0]) * REACH, mid[1] + (a[1] - mid[1]) * REACH];   // place, same
        b = [mid[0] + (b[0] - mid[0]) * REACH, mid[1] + (b[1] - mid[1]) * REACH];   // direction
        strokes.push([line(a, b, R(-0.15, 0.15)), m[5] * R(0.8, 1.25)]);
      } else if (k === 'B') {
        const c = sh(scr(J(m[1], .02), J(m[2], .02)));
        const n = Math.max(2, m[6] + Math.round(R(-1, 1)));
        for (let i = 0; i < n; i++) {
          const ang = (m[3] + (m[4] - m[3]) * (i + 0.5) / n + R(-12, 12)) * Math.PI / 180;
          const len = m[5] * R(0.7, 1.15) * REACH;
          strokes.push([line(c, [c[0] + Math.cos(ang) * len, c[1] + Math.sin(ang) * len], R(-0.2, 0.2)), m[7] * R(0.8, 1.25)]);
        }
      } else if (k === 'C') {
        const ang = (m[5] + R(-10, 10)) * Math.PI / 180, d = [Math.cos(ang), Math.sin(ang)], nrm = [-d[1], d[0]];
        const a = sh(scr(m[1], m[2])), b = sh(scr(m[3], m[4]));
        const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1])], hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        const ctr = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], ext = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 2;
        const n = Math.max(1, m[6] + Math.round(R(-1, 1)));
        for (let i = 0; i < n; i++) {
          const off = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * ext * 1.2 + R(-0.02, 0.02);
          const mid = [ctr[0] + nrm[0] * off, ctr[1] + nrm[1] * off];
          // The teeth are longest in the middle of the comb and shorter towards its ends, so the
          // paint it disturbs lies in a lens rather than a rectangle. With every tooth the same
          // length, and all of them clamped to one box, the combed area had four straight sides
          // and read as a rectangle laid over the painting. Each also stops somewhere of its own.
          const taper = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - Math.pow(ext ? off / ext : 0, 2)));
          const half = ext * R(0.6, 0.95) * taper * REACH;
          const sx = (hi[0] - lo[0]) * 0.12, sy = (hi[1] - lo[1]) * 0.12;
          const bl = [lo[0] + R(-sx, sx), lo[1] + R(-sy, sy)], bh = [hi[0] + R(-sx, sx), hi[1] + R(-sy, sy)];
          const box = function (p) { return [Math.max(bl[0], Math.min(bh[0], p[0])), Math.max(bl[1], Math.min(bh[1], p[1]))]; };
          strokes.push([line(box([mid[0] - d[0] * half, mid[1] - d[1] * half]), box([mid[0] + d[0] * half, mid[1] + d[1] * half]), R(-0.1, 0.1)), m[7] * R(0.8, 1.25)]);
        }
      } else if (k === 'S') {
        const c = sh(scr(J(m[1], .02), J(m[2], .02))), rad = m[3] * R(0.85, 1.15), turns = m[4] * R(0.8, 1.2);
        const a0 = R(0, Math.PI * 2), dir = rng() < 0.8 ? 1 : -1, n = 64, pts = [];
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), a = a0 + dir * turns * Math.PI * 2 * u, rr = rad * (1 - 0.35 * u);
          pts.push(un([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]));
        }
        strokes.push([pts, m[5] * R(0.8, 1.25)]);
      } else if (k === 'W') {
        const a = sh(scr(m[1], m[2])), b = sh(scr(m[3], m[4]));
        const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1])], hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        const n = Math.max(1, m[5] + Math.round(R(-2, 2)));
        for (let i = 0; i < n; i++) {
          // started nearer the middle of the cell than its corners, for the same reason
          const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
          let p = [mid[0] + (R(lo[0], hi[0]) - mid[0]) * 0.75, mid[1] + (R(lo[1], hi[1]) - mid[1]) * 0.75], h = R(0, Math.PI * 2);
          // a walk is held near where it started rather than clamped to the cell: clamping gave
          // every walk in a cell the same straight boundary, and the cell showed as a rectangle
          const home = [p[0], p[1]], rad = Math.min(hi[0] - lo[0], hi[1] - lo[1]) * R(0.3, 0.5);
          const pts = [un(p)], steps = 6 + Math.floor(rng() * 8);
          for (let s = 0; s < steps; s++) {
            h += R(-1.6, 1.6);
            const st = R(0.04, 0.1) * REACH;
            let q = [p[0] + Math.cos(h) * st, p[1] + Math.sin(h) * st];
            const dx = q[0] - home[0], dy = q[1] - home[1], dd = Math.hypot(dx, dy);
            if (dd > rad) { q = [home[0] + dx / dd * rad, home[1] + dy / dd * rad]; h += Math.PI * R(0.4, 0.6); }
            p = q;
            pts.push(un(p));
          }
          strokes.push([pts, m[6] * R(0.8, 1.25)]);
        }
      }
    });
    // the hand chooses: most gestures are kept, occasionally one is left out
    const kept = strokes.filter(function () { return rng() < 0.88; });
    if (!kept.length && strokes.length) kept.push(strokes[0]);
    // Wet into wet. The masses are poured largest first; layered, the hand works between the
    // layers instead of after all of them, so a small mass lands on paint that has already moved
    // and is itself worked by fewer, later strokes. Unlayered, there is one layer: pour, then work.
    const L = layered ? (zones.length >= 6 ? 3 : zones.length >= 3 ? 2 : 1) : 1;
    const zPer = Math.ceil(zones.length / L), sPer = Math.ceil(kept.length / L);
    for (let i = 0; i < L; i++) {
      for (const e of zones.slice(i * zPer, (i + 1) * zPer)) { e.t = t++; events.push(e); }
      if (i === L - 1) for (const d of drops) { d.t = t++; events.push(d); }
      t += 8;
      for (const s of kept.slice(i * sPer, (i + 1) * sPer)) {
        const end = drag(s[0], s[1], t);
        t = Math.max(t + 4, Math.round(t + (end - t) * R(0.4, 0.8)));
      }
    }
    let last = 0;
    for (const e of events) last = Math.max(last, e.type === 'drag' ? e.t1 : e.t);
    return { events: events, steps: last + SETTLE, g: plan.g, readings: plan.readings, interp: interp };
  }

  global.PouredGround = {
    STYLES: STYLES, FPS: FPS, FORMATS: FORMATS, FORMAT_KEYS: FORMAT_KEYS, PAPER: PAPER,
    compose: compose, composeBrief: composeBrief, readBrief: readBrief, interpret: interpret, READINGS: READINGS, briefColours: briefColours, dragAt: dragAt, assignColours: assignColours, sheet: sheet,
    hexToSRGB: hexToSRGB, toLinear: toLinear, luminance: luminance, fromUV: fromUV,
  };
})(typeof window !== 'undefined' ? window : globalThis);
