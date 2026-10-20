// 041 — Between a Square and a Cube.
//
// 25 = 5² and 27 = 3³. Fermat claimed, and Euler first proved, that 26 is the only whole number
// sitting directly between a square and a cube: the curve y² = x³ − 2 passes through exactly
// one pair of lattice points, (3, 5) and (3, −5). Every other point it holds with rational
// coordinates is reached from that pair by straight lines alone — the chord-and-tangent
// construction: a line through two points of the curve meets it a third time, and the mirror
// of that third point across the x-axis is the sum. Add P = (3, 5) to itself again and again
// and the lines, all through P, dot the curve densely with rational points whose fractions
// grow without end, without ever landing on another lattice point.
//
// The arithmetic is exact. nP = (A/d², B/d³) with A, B, d whole numbers, computed through the
// division polynomials ψ_n evaluated at P (gcd-free: d_n = |ψ_n|, verified reduced for
// n ≤ 300). Positions on the sheet are floats taken from the exact values, and the digits
// written along each ray are the exact fraction of the point it found.
//
// This file is the whole piece, free of any harness: Mordell.create(canvas, options) runs it.
// sketch.js wires it to the gallery panel; neort.html is this file inlined with defaults.
//
// Shape of the code: the exact arithmetic first (point, label), then the piece — layout of the
// sheet, the ground, one step and how it is drawn, the sequence of steps, time (a three-phase
// cycle: drawing → resting → fading → drawing again), export, and the public api.

const Mordell = (function () {
  'use strict';

  // ───────────────────────── exact points of y² = x³ − 2 ─────────────────────────
  const X = 3n, Y = 5n, B = -2n;             // P = (X, Y); the curve is y² = x³ + a x + b, a = 0
  // ψ_0..ψ_4 at P, then the doubling recurrences. ψ_3 = 3x⁴ + 12bx = 171, ψ_4 = 4y(x⁶ + 20bx³ − 8b²) = −7660.
  const psi = [0n, 1n, 2n * Y, 3n * X ** 4n + 12n * B * X, 4n * Y * (X ** 6n + 20n * B * X ** 3n - 8n * B * B)];
  function ensurePsi(n) {
    while (psi.length <= n) {
      const k = psi.length, m = k >> 1;
      if (k & 1) psi.push(psi[m + 2] * psi[m] ** 3n - psi[m - 1] * psi[m + 1] ** 3n);
      else psi.push((psi[m] * (psi[m + 2] * psi[m - 1] ** 2n - psi[m - 2] * psi[m + 1] ** 2n)) / (2n * Y));
    }
  }
  // A float from a fraction of BigInts, by scaling the pair down to ~17 significant digits first.
  function toFloat(num, den) {
    const neg = num < 0n;
    if (neg) num = -num;
    const k = den.toString().length - 17;
    if (k > 0) { const q = 10n ** BigInt(k); num /= q; den /= q; }
    const v = Number(num) / Number(den);
    return neg ? -v : v;
  }
  const cache = new Map();
  // nP for any whole n ≠ 0: { n, A, d, B, x, y } with x = A/d², y = B/d³ in lowest terms,
  // and the digit counts of A and d (a BigInt's string is costly; it is taken once, here).
  function point(n) {
    if (cache.has(n)) return cache.get(n);
    const m = Math.abs(n);
    let p;
    if (m === 1) p = { n: 1, A: X, d: 1n, B: Y, x: 3, y: 5, digitsA: 1, digitsD: 1 };
    else {
      ensurePsi(m + 2);
      const s = psi[m] < 0n ? -1n : 1n, d = psi[m] * s;
      const A = X * d * d - psi[m - 1] * psi[m + 1];
      const Bn = (psi[m + 2] * psi[m - 1] ** 2n - psi[m - 2] * psi[m + 1] ** 2n) / (4n * Y) * s;
      p = { n: m, A, d, B: Bn, x: 3 - toFloat(psi[m - 1] * psi[m + 1], d * d), y: toFloat(Bn, d ** 3n) };
      p.digitsA = (A < 0n ? -A : A).toString().length;
      p.digitsD = d.toString().length;
    }
    if (n < 0) p = Object.assign({}, p, { n, B: -p.B, y: -p.y });
    cache.set(n, p);
    return p;
  }
  function label(n) {                       // the exact coordinates of nP, written out
    const p = point(n), name = (n < 0 ? '−' : '') + (Math.abs(n) === 1 ? '' : Math.abs(n)) + 'P';
    if (Math.abs(n) === 1) return name + ' = (3, ' + (n < 0 ? '−5' : '5') + ')';
    const d = p.d.toString(), A = p.A.toString().replace('-', '−'), Bs = p.B.toString().replace('-', '−');
    return name + ' = (' + A + '/' + d + '², ' + Bs + '/' + d + '³)';
  }

  // ───────────────────────── the piece ─────────────────────────
  const DEFAULTS = {
    seed: 1,
    mode: 'star',        // star: nP = (n−1)P + P, every line through P · web: seeded chords between known points
    reach: 120,          // the last multiple drawn in a pass
    passes: 2,           // 1: through (3, 5) only · 2: then the mirror pass through (3, −5)
    tempo: 8,            // seconds per step
    hold: 60,            // seconds the finished sheet rests before it fades and starts again
    xMin: -1.5, xMax: 7.5, yMax: 13,
    format: 'square',    // square · landscape · portrait
    ground: 'dark',      // dark · paper
    labels: 'all',       // all · twelve · none
    textSize: 10,
    rayAlpha: 0.28,
    lattice: 1,
    caption: 1,
    instant: false,      // draw every step at once, no animation (tiles, tests)
  };
  const PALETTE = {
    dark: { ground: '#0b0b0e', ink: '232,230,223', accent: '240,163,94', paper: false },
    paper: { ground: '#f4f0e8', ink: '27,27,27', accent: '200,85,61', paper: true },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  // The sheet has its own units (a fixed sheet, scaled to whatever screen shows it); everything
  // below is in those units. The frame is the window onto the plane, inset by the margin.
  const SHEET = { square: [1000, 1000], landscape: [1400, 1000], portrait: [1000, 1250] };
  const MARGIN = 60;
  const MARK = {
    lattice: 1.25,       // radius of a lattice dot
    ring: 6,             // the two lattice points on the curve
    hit: 4,              // the third point of a line
    flash: 10,           // how far the hit's ring swells when it lands
    dot: 2.3,            // the point kept
    gap: 8,              // from a hit to the first digit along its ray
    lift: 3,             // the digits sit this far above the ray
    caption: 24,         // the caption's baseline above the sheet's foot
    captionSize: 11,
  };
  const STEP = { ray: 0.3, flash: 0.12, type: 0.45, offFrame: 0.45 };   // shares of a step's time; off-frame hits take less
  const FADE_SECONDS = 8;
  const LABELS_UP_TO = 12;                   // labels: 'twelve'

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    let W = 1000, H = 1000;                 // the sheet, in its own units
    let F = { x: 0, y: 0, w: 0, h: 0 };     // the frame on the sheet
    let win = { xMin: 0, xMax: 1, yMax: 1 }, sx = 1, sy = 1;   // the window onto the plane, and its scales
    let base = null, acc = null, scale = 1, ox = 0, oy = 0, charW = 6;
    let steps = [];                         // committed steps, replayed on resize
    let live = null;                        // the step being drawn now, while the phase is 'drawing'
    let pass = 1, n = 2, known = null, rng = null;
    let phase = 'drawing', phaseAt = 0;     // 'drawing' → 'resting' (the finished sheet) → 'fading' → 'drawing'
    let paused = false, clock = 0, last = 0, raf = 0, resizeTimer = 0;
    let pal = PALETTE.dark;

    // ── layout ──
    function layout() {
      [W, H] = SHEET[O.format] || SHEET.square;
      F = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN };
      // the seed nudges the window a little, so two seeds are two framings of the same drawing
      const r = mulberry32((O.seed >>> 0) ^ 0x9e3779b9);
      const dx = (r() - 0.5) * 1.5, ky = 0.85 + r() * 0.3;
      win = { xMin: O.xMin + dx, xMax: O.xMax + dx, yMax: O.yMax * ky };
      sx = F.w / (win.xMax - win.xMin);
      sy = F.h / (2 * win.yMax);
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
      base = layer(); acc = layer();
      charW = measure(acc.ctx);
      drawBase(base.ctx);
      for (const s of steps) drawStep(acc.ctx, s, 1, 1);
    }
    function layer() {
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
      const cx = c.getContext('2d');
      cx.setTransform(scale, 0, 0, scale, 0, 0);
      return { c, ctx: cx };
    }
    function measure(cx) { cx.font = O.textSize + 'px ' + MONO; return cx.measureText('0').width; }
    const px = (x) => F.x + (x - win.xMin) * sx;
    const py = (y) => F.y + (win.yMax - y) * sy;
    const inFrame = (p) => p.x >= win.xMin && p.x <= win.xMax && Math.abs(p.y) <= win.yMax;
    const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
    const labelled = (s) => O.labels === 'all' || (O.labels === 'twelve' && Math.abs(s.h) <= LABELS_UP_TO);

    // ── the ground: lattice, axes, the curve, the two lattice points it holds ──
    function drawBase(cx) {
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, W, H);
      cx.save(); cx.beginPath(); cx.rect(F.x, F.y, F.w, F.h); cx.clip();
      if (O.lattice) {
        cx.fillStyle = rgba(pal.ink, pal.paper ? 0.42 : 0.34);
        for (let i = Math.ceil(win.xMin); i <= Math.floor(win.xMax); i++)
          for (let j = Math.ceil(-win.yMax); j <= Math.floor(win.yMax); j++) {
            cx.beginPath(); cx.arc(px(i), py(j), MARK.lattice, 0, Math.PI * 2); cx.fill();
          }
      }
      cx.strokeStyle = rgba(pal.ink, 0.16); cx.lineWidth = 0.8;
      cx.beginPath(); cx.moveTo(F.x, py(0)); cx.lineTo(F.x + F.w, py(0)); cx.moveTo(px(0), F.y); cx.lineTo(px(0), F.y + F.h); cx.stroke();
      // the curve, parametrised by y so the turn at the root (∛2, 0) is smooth
      cx.strokeStyle = rgba(pal.ink, 0.9); cx.lineWidth = 1.3; cx.beginPath();
      const N = 1200;
      for (let i = 0; i <= N; i++) {
        const y = -win.yMax + (2 * win.yMax * i) / N, x = Math.cbrt(y * y + 2);
        if (i === 0) cx.moveTo(px(x), py(y)); else cx.lineTo(px(x), py(y));
      }
      cx.stroke();
      // (3, 5) and (3, −5): the only lattice points on the curve
      cx.strokeStyle = rgba(pal.accent, 0.95); cx.lineWidth = 1.6;
      for (const s of [5, -5]) { cx.beginPath(); cx.arc(px(3), py(s), MARK.ring, 0, Math.PI * 2); cx.stroke(); }
      cx.restore();
    }

    // ── a step: the line through aP and bP meets the curve at hP, h = −(a+b); its mirror is (a+b)P ──
    function makeStep(a, b) {
      const h = -(a + b), A = point(a), Bp = point(b), Hp = point(h), M = point(a + b);
      let m; // slope of the line
      if (a === b) m = (3 * A.x * A.x) / (2 * A.y); else m = (Bp.y - A.y) / (Bp.x - A.x);
      // the line clipped to the frame, in sheet units
      const seg = clipLine(A, m);
      // the text runs from the hit outward, away from aP
      const dir = Math.sign(Hp.x - A.x) || 1;
      let u = { x: dir, y: dir * m }; const L = Math.hypot(u.x * sx, u.y * sy);
      u = { x: (u.x * sx) / L, y: (-u.y * sy) / L };  // unit vector on the sheet (y down)
      return { a, b, h, seg, hit: Hp, mirror: M, u, hitIn: inFrame(Hp), text: label(h) };
    }
    function clipLine(P0, m) {
      // y − y0 = m (x − x0), intersected with the window's four edges
      const pts = [];
      for (const xe of [win.xMin, win.xMax]) { const y = P0.y + m * (xe - P0.x); if (Math.abs(y) <= win.yMax + 1e-9) pts.push([xe, y]); }
      for (const ye of [-win.yMax, win.yMax]) { if (!isFinite(m) || m === 0) continue; const x = P0.x + (ye - P0.y) / m; if (x >= win.xMin - 1e-9 && x <= win.xMax + 1e-9) pts.push([x, ye]); }
      if (pts.length < 2) return null;
      pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const p = pts[0], q = pts[pts.length - 1];
      return { x0: px(p[0]), y0: py(p[1]), x1: px(q[0]), y1: py(q[1]) };
    }
    // t0: how far the ray has grown (0–1, from aP outward both ways); t1: how much of the label
    // is typed; flash: the hit's ring swelling (1 → 0) as it lands. Every style change is kept
    // inside save/restore so nothing leaks into the next mark.
    function drawStep(cx, s, t0, t1, flash) {
      if (!s.seg) return;
      cx.save(); cx.beginPath(); cx.rect(F.x, F.y, F.w, F.h); cx.clip();
      const A = point(s.a), ax = px(A.x), ay = py(A.y);
      cx.strokeStyle = rgba(pal.ink, O.rayAlpha); cx.lineWidth = 0.9; cx.beginPath();
      if (t0 >= 1) { cx.moveTo(s.seg.x0, s.seg.y0); cx.lineTo(s.seg.x1, s.seg.y1); }
      else {
        const g = ease(t0);
        cx.moveTo(ax + (s.seg.x0 - ax) * g, ay + (s.seg.y0 - ay) * g); cx.lineTo(ax, ay);
        cx.lineTo(ax + (s.seg.x1 - ax) * g, ay + (s.seg.y1 - ay) * g);
      }
      cx.stroke();
      if (t0 < 1) { cx.restore(); return; }
      const hx = px(s.hit.x), hy = py(s.hit.y), mx = px(s.mirror.x), my = py(s.mirror.y);
      if (s.hitIn) {
        // the third point, ringed; the vertical to its mirror; the mirror, the point kept
        cx.strokeStyle = rgba(pal.accent, 0.9); cx.lineWidth = 1.1;
        const r = MARK.hit + (flash ? MARK.flash * (1 - flash) : 0);
        cx.beginPath(); cx.arc(hx, hy, r, 0, Math.PI * 2); cx.stroke();
        cx.strokeStyle = rgba(pal.ink, 0.22); cx.lineWidth = 0.7; cx.setLineDash([2, 3]);
        cx.beginPath(); cx.moveTo(hx, hy); cx.lineTo(mx, my); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = rgba(pal.accent, 0.95); cx.beginPath(); cx.arc(mx, my, MARK.dot, 0, Math.PI * 2); cx.fill();
        // the name of the point kept, beside it
        cx.fillStyle = rgba(pal.ink, 0.55); cx.font = Math.max(7, O.textSize - 2) + 'px ' + MONO; cx.textAlign = 'left'; cx.textBaseline = 'middle';
        const nm = (s.mirror.n < 0 ? '−' : '') + Math.abs(s.mirror.n) + 'P';
        cx.fillText(nm, mx + 5, my);
        // the exact fraction, typed along the ray outward from the hit
        if (labelled(s)) drawLabel(cx, s, hx, hy, t1);
      }
      cx.restore();
    }
    function drawLabel(cx, s, hx, hy, t1) {
      // room along the ray from the hit to the frame edge, in the outward direction
      const room = rayRoom(hx, hy, s.u);
      const max = Math.max(0, Math.floor((room - MARK.gap) / charW));
      const str = s.text.slice(0, Math.min(max, Math.round(ease(t1) * s.text.length)));
      if (!str) return;
      cx.save();
      cx.font = O.textSize + 'px ' + MONO; cx.textBaseline = 'alphabetic';
      cx.fillStyle = rgba(pal.ink, pal.paper ? 0.78 : 0.62);
      cx.translate(hx, hy);
      const ang = Math.atan2(s.u.y, s.u.x);
      if (Math.cos(ang) >= 0) { cx.rotate(ang); cx.textAlign = 'left'; cx.fillText(str, MARK.gap, -MARK.lift); }
      else { cx.rotate(ang + Math.PI); cx.textAlign = 'right'; cx.fillText(str, -MARK.gap, -MARK.lift); }
      cx.restore();
    }
    function rayRoom(x, y, u) {
      let t = Infinity;
      if (u.x > 0) t = Math.min(t, (F.x + F.w - x) / u.x); else if (u.x < 0) t = Math.min(t, (F.x - x) / u.x);
      if (u.y > 0) t = Math.min(t, (F.y + F.h - y) / u.y); else if (u.y < 0) t = Math.min(t, (F.y - y) / u.y);
      return isFinite(t) ? t : 0;
    }
    function drawCaption(cx, s) {
      if (!O.caption || !s) return;
      cx.save();
      cx.fillStyle = rgba(pal.ink, 0.55); cx.font = MARK.captionSize + 'px ' + MONO; cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
      const k = Math.abs(s.mirror.n);
      cx.fillText('y² = x³ − 2 · P = (3, 5) · ' + k + 'P · x = ' + s.mirror.digitsA + ' digits ⁄ (' + s.mirror.digitsD + ' digits)²', F.x, H - MARK.caption);
      cx.restore();
    }

    // ── the sequence of steps ──
    function start() {
      steps = []; live = null; clock = 0;
      phase = 'drawing'; phaseAt = 0;
      pass = 1; n = 2; known = new Set([1]); rng = mulberry32(O.seed >>> 0);
      if (acc) acc.ctx.clearRect(0, 0, W, H);
    }
    function nextStep() {
      if (O.mode === 'web') return webStep();
      if (n > O.reach) {
        if (pass === 1 && O.passes > 1) { pass = -1; n = 2; } else return null;
      }
      const s = makeStep(pass, pass * (n - 1)); n++;
      return s;
    }
    function webStep() {
      // chords between points already found (both signs), weighted toward the small ones;
      // each line finds a point not yet on the sheet, up to the reach
      const have = [...known];
      for (let tries = 0; tries < 400; tries++) {
        const pick = () => { const i = Math.floor(Math.pow(rng(), 1.8) * have.length); return have[i] * (rng() < 0.5 ? 1 : -1); };
        const a = pick(), b = pick();
        if (a + b === 0) continue;
        const k = Math.abs(a + b);
        if (k > O.reach || known.has(k)) continue;
        known.add(k);
        return makeStep(a, b);
      }
      return null;
    }
    function commit(s) { steps.push(s); drawStep(acc.ctx, s, 1, 1); }

    // ── time: drawing → resting → fading → drawing ──
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!paused) { clock += dt; advance(); }
      render();
    }
    function enter(next) { phase = next; phaseAt = clock; }
    function advance() {
      const t = clock - phaseAt;
      if (phase === 'resting') { if (t > O.hold) enter('fading'); return; }
      if (phase === 'fading') { if (t > FADE_SECONDS) start(); return; }
      if (!live) {
        const s = nextStep();
        if (!s) { enter('resting'); return; }
        live = { s, t0: clock, dur: O.tempo * (s.hitIn ? 1 : STEP.offFrame) };
      }
      if (clock - live.t0 >= live.dur) { commit(live.s); live = null; }
    }
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base.c, ox, oy);
      ctx.globalAlpha = phase === 'fading' ? Math.max(0, 1 - (clock - phaseAt) / FADE_SECONDS) : 1;
      ctx.drawImage(acc.c, ox, oy);
      ctx.globalAlpha = 1;
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      if (live) {
        const t = (clock - live.t0) / live.dur;
        const t0 = Math.min(1, t / STEP.ray);
        const flash = t > STEP.ray && t < STEP.ray + STEP.flash ? 1 - (t - STEP.ray) / STEP.flash : 0;
        const t1 = Math.max(0, Math.min(1, (t - STEP.type) / (1 - STEP.type)));
        drawStep(ctx, live.s, t0, t1, flash);
        drawCaption(ctx, live.s);
      } else drawCaption(ctx, steps[steps.length - 1]);
    }
    function instant() {
      let s;
      while ((s = nextStep())) commit(s);
      enter('resting');
    }

    // ── export ──
    function sheetPNG() {
      const c = document.createElement('canvas');
      const k = 2;
      c.width = W * k; c.height = H * k;
      const cx = c.getContext('2d');
      cx.drawImage(base.c, 0, 0, c.width, c.height);
      cx.drawImage(acc.c, 0, 0, c.width, c.height);
      cx.setTransform(k, 0, 0, k, 0, 0);
      drawCaption(cx, steps[steps.length - 1]);
      return c;
    }
    function toSVG() {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const f = (v) => v.toFixed(2);
      const out = [];
      out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
      out.push('<rect width="' + W + '" height="' + H + '" fill="' + pal.ground + '"/>');
      out.push('<clipPath id="f"><rect x="' + F.x + '" y="' + F.y + '" width="' + F.w + '" height="' + F.h + '"/></clipPath>');
      out.push('<g clip-path="url(#f)" fill="none" stroke="rgb(' + pal.ink + ')" stroke-width="0.9">');
      if (O.lattice) {
        out.push('<g fill="rgb(' + pal.ink + ')" fill-opacity="0.4" stroke="none">');
        for (let i = Math.ceil(win.xMin); i <= Math.floor(win.xMax); i++)
          for (let j = Math.ceil(-win.yMax); j <= Math.floor(win.yMax); j++)
            out.push('<circle cx="' + f(px(i)) + '" cy="' + f(py(j)) + '" r="' + MARK.lattice + '"/>');
        out.push('</g>');
      }
      let d = '';
      const N = 600;
      for (let i = 0; i <= N; i++) { const y = -win.yMax + (2 * win.yMax * i) / N, x = Math.cbrt(y * y + 2); d += (i ? 'L' : 'M') + f(px(x)) + ' ' + f(py(y)); }
      out.push('<path d="' + d + '" stroke-width="1.3"/>');
      out.push('<g stroke="rgb(' + pal.accent + ')" stroke-width="1.6"><circle cx="' + f(px(3)) + '" cy="' + f(py(5)) + '" r="' + MARK.ring + '"/><circle cx="' + f(px(3)) + '" cy="' + f(py(-5)) + '" r="' + MARK.ring + '"/></g>');
      out.push('<g stroke-opacity="' + O.rayAlpha + '">');
      for (const s of steps) if (s.seg) out.push('<line x1="' + f(s.seg.x0) + '" y1="' + f(s.seg.y0) + '" x2="' + f(s.seg.x1) + '" y2="' + f(s.seg.y1) + '"/>');
      out.push('</g>');
      out.push('<g font-family="monospace" font-size="' + O.textSize + '" fill="rgb(' + pal.ink + ')" fill-opacity="0.7" stroke="none">');
      for (const s of steps) {
        if (!s.seg || !s.hitIn) continue;
        const hx = px(s.hit.x), hy = py(s.hit.y), mx = px(s.mirror.x), my = py(s.mirror.y);
        out.push('<circle cx="' + f(hx) + '" cy="' + f(hy) + '" r="' + MARK.hit + '" fill="none" stroke="rgb(' + pal.accent + ')" stroke-width="1.1"/>');
        out.push('<line x1="' + f(hx) + '" y1="' + f(hy) + '" x2="' + f(mx) + '" y2="' + f(my) + '" stroke="rgb(' + pal.ink + ')" stroke-opacity="0.25" stroke-width="0.7"/>');
        out.push('<circle cx="' + f(mx) + '" cy="' + f(my) + '" r="' + MARK.dot + '" fill="rgb(' + pal.accent + ')"/>');
        if (!labelled(s)) continue;
        const max = Math.max(0, Math.floor((rayRoom(hx, hy, s.u) - MARK.gap) / charW)), str = s.text.slice(0, max);
        const ang = Math.atan2(s.u.y, s.u.x), flip = Math.cos(ang) < 0, deg = (ang * 180) / Math.PI;
        out.push('<text transform="translate(' + f(hx) + ' ' + f(hy) + ') rotate(' + f(flip ? deg + 180 : deg) + ')" x="' + (flip ? -MARK.gap : MARK.gap) + '" y="-' + MARK.lift + '" text-anchor="' + (flip ? 'end' : 'start') + '">' + esc(str) + '</text>');
      }
      out.push('</g></g></svg>');
      return out.join('\n');
    }

    // ── public ──
    function onResize() {               // a resize replays every step; wait for the drag to settle
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { layout(); render(); }, 120);
    }
    const api = {
      setOptions(o) { Object.assign(O, o); pal = PALETTE[O.ground] || PALETTE.dark; },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        start(); layout();
        if (O.instant) { instant(); render(); }
      },
      resize() { layout(); render(); },
      togglePause() { paused = !paused; return paused; },
      stepNow() { if (live) { commit(live.s); live = null; } advance(); render(); },
      png() { return sheetPNG(); },
      svg: toSVG,
      steps: () => steps,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
      point, label,
    };
    api.reset();
    last = performance.now();
    if (!O.instant) raf = requestAnimationFrame(frame);
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, point, label, DEFAULTS };
})();
