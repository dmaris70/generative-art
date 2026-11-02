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
  function sheet(formatIdx, landscape, borderMM, dpi) {
    let wh = FORMATS[FORMAT_KEYS[formatIdx]] || FORMATS[FORMAT_KEYS[0]];
    if (landscape) wh = [wh[1], wh[0]];
    const b = Math.max(0, Math.min(borderMM, Math.min(wh[0], wh[1]) * 0.3));
    const img = [wh[0] - 2 * b, wh[1] - 2 * b];
    const m = Math.min(img[0], img[1]);
    return {
      name: FORMAT_KEYS[formatIdx],
      mm: wh, borderMM: b, imageMM: img,
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

  function composeBrief(rng, brief, o) {
    const A = o.aspect, energy = o.energy;
    const R = function (a, b) { return a + (b - a) * rng(); };
    const J = function (v, j) { return v + R(-j, j); };
    const chan = briefColours(['', '', '', '', ''], brief).chan;
    const scr = function (x, y) { return [x, 1 - y]; };                      // y-down → sim uv
    const sh = function (u) { return [(u[0] - 0.5) * A[0], (u[1] - 0.5) * A[1]]; }; // uv → short units
    const un = function (p) { return [0.5 + p[0] / A[0], 0.5 + p[1] / A[1]]; };
    const clampUV = function (q) { return [Math.max(0.03, Math.min(0.97, q[0])), Math.max(0.03, Math.min(0.97, q[1]))]; };
    const events = [];
    let t = 1;
    const jit = 0.012, sj = 0.06, aj = 3 * Math.PI / 180;

    const fieldOf = function (f) {
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
      // L: a band between two points
      const a = sh(scr(J(f[2], jit), J(f[3], jit))), b = sh(scr(J(f[4], jit), J(f[5], jit)));
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const ctr = un([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      return { type: 'zone', shape: 0, cx: ctr[0], cy: ctr[1], hx: len / 2, hy: f[6] / 2 * (1 + R(-sj, sj)), ang: Math.atan2(dy, dx), chan: ch, th: FIELD_TH };
    };
    const drops = [];
    for (const f of brief.z) {
      if (f[0] === 'D') {
        const n = Math.max(1, Math.round(f[6] * R(0.8, 1.25)));
        for (let i = 0; i < n; i++) {
          const u = scr(R(f[2], f[4]), R(f[3], f[5]));
          drops.push({ type: 'pour', x: Math.max(0.02, Math.min(0.98, u[0])), y: Math.max(0.02, Math.min(0.98, u[1])), r: f[7] * R(0.7, 1.4), pig: chan[f[1]], k: 0.4 });
        }
      } else {
        const e = fieldOf(f); e.t = t++; events.push(e);
      }
    }
    for (const d of drops) { d.t = t++; events.push(d); }
    t += 8;

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
        const a = sh(scr(J(m[1], .03), J(m[2], .03))), b = sh(scr(J(m[3], .03), J(m[4], .03)));
        strokes.push([line(a, b, R(-0.15, 0.15)), m[5] * R(0.8, 1.25)]);
      } else if (k === 'B') {
        const c = sh(scr(J(m[1], .02), J(m[2], .02)));
        const n = Math.max(2, m[6] + Math.round(R(-1, 1)));
        for (let i = 0; i < n; i++) {
          const ang = (m[3] + (m[4] - m[3]) * (i + 0.5) / n + R(-12, 12)) * Math.PI / 180;
          const len = m[5] * R(0.7, 1.15);
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
          const half = ext * R(0.6, 0.95);
          const box = function (p) { return [Math.max(lo[0], Math.min(hi[0], p[0])), Math.max(lo[1], Math.min(hi[1], p[1]))]; };
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
          let p = [R(lo[0], hi[0]), R(lo[1], hi[1])], h = R(0, Math.PI * 2);
          const pts = [un(p)], steps = 6 + Math.floor(rng() * 8);
          for (let s = 0; s < steps; s++) {
            h += R(-1.6, 1.6);
            const st = R(0.04, 0.1);
            p = [Math.max(lo[0], Math.min(hi[0], p[0] + Math.cos(h) * st)), Math.max(lo[1], Math.min(hi[1], p[1] + Math.sin(h) * st))];
            pts.push(un(p));
          }
          strokes.push([pts, m[6] * R(0.8, 1.25)]);
        }
      }
    });
    // the hand chooses: most gestures are kept, occasionally one is left out
    const kept = strokes.filter(function () { return rng() < 0.88; });
    if (!kept.length && strokes.length) kept.push(strokes[0]);
    for (const s of kept) {
      const end = drag(s[0], s[1], t);
      t = Math.max(t + 4, Math.round(t + (end - t) * R(0.4, 0.8)));
    }
    let last = 0;
    for (const e of events) last = Math.max(last, e.type === 'drag' ? e.t1 : e.t);
    return { events: events, steps: last + SETTLE };
  }

  global.PouredGround = {
    STYLES: STYLES, FPS: FPS, FORMATS: FORMATS, FORMAT_KEYS: FORMAT_KEYS, PAPER: PAPER,
    compose: compose, composeBrief: composeBrief, briefColours: briefColours, dragAt: dragAt, assignColours: assignColours, sheet: sheet,
    hexToSRGB: hexToSRGB, toLinear: toLinear, luminance: luminance, fromUV: fromUV,
  };
})(typeof window !== 'undefined' ? window : globalThis);
