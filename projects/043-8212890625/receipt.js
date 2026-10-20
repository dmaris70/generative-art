// 043 — …8212890625.
//
// 25² = 625. 625² = 390625. 90625² = 8212890625. Each square keeps the ending of the number it
// came from, and the endings grow: 25, 0625, 90625, 8212890625, 18212890625, … The process
// converges — not to any whole number, but to a number with infinitely many digits to the
// left, …896109004106619977392256259918212890625, that is its own square. It is one of the
// two non-trivial idempotents of the 10-adic integers (the other ends in …109376), and the
// only one that squaring alone finds: this one is ≡ 1 in the 2-adic part and ≡ 0 in the
// 5-adic part, and squaring a number ≡ 1 mod 2ʲ gives one ≡ 1 mod 2ʲ⁺¹ while squaring a
// multiple of 5ᵏ gives a multiple of 5²ᵏ — so every squaring fixes at least one more digit.
// Seeded by 6 instead, squaring goes nowhere: 6, 36, 6, 36, …
//
// The piece is the receipt of that process: every squaring written out as hand-written long
// multiplication on a till roll, right-aligned, the frozen digits carried down to the next
// multiplication, the rows growing leftward past the edge of the paper as the number grows.
// The number itself stands at the head of the roll, growing leftward forever while its
// right-hand tail never changes again.
//
// The arithmetic is exact (BigInt). How many digits are fixed after a squaring is not a guess:
// y = x² agrees with the idempotent in exactly min(v₅(y), v₂(y − 1)) trailing digits.
//
// This file is the whole piece, free of any harness, given StrokeFont (assets/strokefont.js):
// Receipt.create(canvas, options) runs it. sketch.js wires it to the gallery panel;
// neort.html is this file, with the font, inlined with defaults.

const Receipt = (function () {
  'use strict';

  const DEFAULTS = {
    seed: 1,             // the hand: how each glyph leans and wobbles
    beat: 0.4,           // seconds per row of the receipt
    pause: 1.6,          // seconds between one squaring and the next
    size: 14,            // digit height, in sheet units
    hand: 0.5,           // 0: ruled type · 1: a hurried hand
    ground: 'paper',     // paper · dark
    header: 1,           // the number so far at the head of the roll
    at: null,            // a still: the roll after this many squarings (tests, thumbnails)
  };
  const PALETTE = {
    paper: { ground: '#f4f0e8', ink: '27,27,27', accent: '200,85,61', rule: 0.35 },
    dark: { ground: '#0b0b0e', ink: '232,230,223', accent: '240,163,94', rule: 0.3 },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1000, H = 1000, MARGIN = 60;
  const ROW = 1.6;                                      // row height, × digit size

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

  // ───────────────────────── the arithmetic ─────────────────────────
  function val(n, p) { let k = 0; while (n !== 0n && n % p === 0n) { n /= p; k++; } return k; }
  // One squaring: x (a string of digits) → its square, the digits of it that are now fixed,
  // and the long multiplication's partial products (one per digit of x, from the right).
  function square(x) {
    const X = BigInt(x), Y = X * X;
    const fixed = Math.min(val(Y, 5n), val(Y - 1n, 2n));
    const y = Y.toString();
    const partials = [];
    for (let i = x.length - 1; i >= 0; i--) {
      const d = BigInt(x[i]);
      partials.push({ shift: x.length - 1 - i, text: d === 0n ? '0' : (X * d).toString() });
    }
    const tail = y.length >= fixed ? y.slice(y.length - fixed) : y.padStart(fixed, '0');
    return { x, y, fixed, tail, partials };
  }

  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    let pal = PALETTE.paper, scale = 1, ox = 0, oy = 0;
    let F = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN };
    let head = 0, rowH = 0, cell = 0;        // the header's height; a row; a digit cell
    let roll = null;                         // the till roll: an offscreen canvas of the rows
    let rows = [];                           // every row so far, for replay on resize
    let step = null, queue = [], stepsDone = 0, tail = '25';
    let clock = 0, last = 0, raf = 0, nextAt = 0, slide = 0, resizeTimer = 0;

    // ── layout ──
    function layout() {
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
      rowH = O.size * ROW; cell = (O.size / 6) * StrokeFont.ADVANCE;
      head = O.header ? rowH * 3.2 : 0;
      roll = document.createElement('canvas');
      roll.width = Math.ceil(F.w * scale); roll.height = Math.ceil((F.h - head) * scale);
      paint();
    }
    // The roll shows its last rows, written from the foot up. It is repainted whole on every
    // new row rather than scrolled by copying itself: a copy shifted by a fractional pixel
    // resamples the strokes, and forty such copies turn a hand into a smear.
    function paint() {
      const rc = roll.getContext('2d'), h = F.h - head;
      rc.setTransform(scale, 0, 0, scale, 0, 0);
      rc.fillStyle = pal.ground; rc.fillRect(0, 0, F.w, h);
      const visible = Math.ceil(h / rowH) + 1, from = Math.max(0, rows.length - visible);
      for (let i = from; i < rows.length; i++) drawRow(rc, rows[i], h - (rows.length - i) * rowH);
    }

    // ── the hand: single-stroke glyphs, each leaning and wobbling as the seed says ──
    const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
    function glyphs(cx, str, right, y, colour, alpha, rowIndex, from) {
      // str right-aligned so that its last digit ends at x = right; `from` colours the digits
      // from that index onward in the accent
      const n = str.length, x0 = right - n * cell;
      cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = Math.max(1, O.size / 9);
      for (let i = 0; i < n; i++) {
        const ch = str[i];
        if (ch === ' ') continue;
        const r = mulberry32((O.seed ^ Math.imul(rowIndex + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0);
        const lean = (r() - 0.5) * 0.22 * O.hand, dx = (r() - 0.5) * 0.12 * O.size * O.hand, dy = (r() - 0.5) * 0.16 * O.size * O.hand;
        const sz = O.size * (1 + (r() - 0.5) * 0.12 * O.hand);
        const lines = ch === '×' ? cross(x0 + i * cell, y, sz) : StrokeFont.text(ch, x0 + i * cell, y, sz);
        cx.strokeStyle = rgba(from !== undefined && i >= from ? pal.accent : colour, alpha);
        cx.save(); cx.translate(x0 + i * cell + sz / 3 + dx, y + sz / 2 + dy); cx.transform(1, 0, lean, 1, 0, 0); cx.translate(-(x0 + i * cell + sz / 3), -(y + sz / 2));
        cx.beginPath();
        for (const pl of lines) {
          for (let k = 0; k < pl.length; k++) {
            const wx = (r() - 0.5) * 0.06 * sz * O.hand, wy = (r() - 0.5) * 0.06 * sz * O.hand;
            if (k === 0) cx.moveTo(pl[k].x + wx, pl[k].y + wy); else cx.lineTo(pl[k].x + wx, pl[k].y + wy);
          }
        }
        cx.stroke(); cx.restore();
      }
    }
    function cross(x, y, sz) {                       // × on the 4 × 6 grid, as two strokes
      const s = sz / 6;
      return [[{ x: x + 0.6 * s, y: y + 1.8 * s }, { x: x + 3.4 * s, y: y + 4.6 * s }], [{ x: x + 3.4 * s, y: y + 1.8 * s }, { x: x + 0.6 * s, y: y + 4.6 * s }]];
    }
    function rule(cx, right, y, width, rowIndex) {    // a hand-drawn line
      const r = mulberry32((O.seed ^ Math.imul(rowIndex + 7, 0x27d4eb2f)) >>> 0);
      cx.strokeStyle = rgba(pal.ink, pal.rule); cx.lineWidth = Math.max(1, O.size / 11); cx.lineCap = 'round';
      cx.beginPath();
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const px = right - width + (width * i) / n, py = y + (r() - 0.5) * 0.08 * O.size * O.hand;
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      cx.stroke();
    }

    // ── rows of the receipt ──
    // kinds: 'x' the multiplicand · 'times' × the multiplier · 'rule' · 'partial' one partial
    // product, shifted · 'result' the square, its fixed digits in the accent · 'blank'
    function drawRow(cx, row, y) {
      const right = F.w - cell * 0.5, top = y + (rowH - O.size) / 2, i = row.index;
      if (row.kind === 'x') glyphs(cx, row.text, right, top, pal.ink, 0.9, i);
      else if (row.kind === 'times') glyphs(cx, '× ' + row.text, right, top, pal.ink, 0.9, i);
      else if (row.kind === 'rule') rule(cx, right, y + rowH * 0.5, Math.min(F.w, (row.width + 1) * cell), i);
      else if (row.kind === 'partial') glyphs(cx, row.text, right - row.shift * cell, top, pal.ink, 0.72, i);
      else if (row.kind === 'result') glyphs(cx, row.text, right, top, pal.ink, 0.9, i, row.text.length - row.fixed);
    }
    function rowsOf(s, index) {
      const out = [];
      const push = (kind, extra) => out.push(Object.assign({ kind, index: index + out.length }, extra || {}));
      push('x', { text: s.x });
      push('times', { text: s.x });
      push('rule', { width: s.x.length + 2 });
      for (const p of s.partials) push('partial', p);
      push('rule', { width: s.y.length });
      push('result', { text: s.tail.length > s.y.length ? s.tail : s.y, fixed: s.fixed });
      push('blank');
      return out;
    }
    function append(row) {
      rows.push(row);
      if (rows.length > 400) rows.splice(0, rows.length - 200);   // the roll keeps what it can show
      paint();
      slide = 1;                                   // the view glides up to meet the new row
    }

    // ── time ──
    function nextSquaring() {
      const s = square(tail);
      queue = rowsOf(s, rows.length);
      step = s; stepsDone++; tail = s.tail;
    }
    function advance() {
      if (clock < nextAt) return;
      if (!queue.length) { nextSquaring(); }
      const row = queue.shift();
      append(row);
      nextAt = clock + (queue.length ? O.beat : O.pause);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      clock += dt;
      advance();
      if (slide > 0) slide = Math.max(0, slide - dt / Math.min(O.beat, 0.4));
      render();
    }
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      // the roll, under the header, gliding
      ctx.save(); ctx.beginPath(); ctx.rect(F.x, F.y + head, F.w, F.h - head); ctx.clip();
      ctx.drawImage(roll, F.x, F.y + head + ease(slide) * rowH, F.w, F.h - head);
      ctx.restore();
      if (O.header) drawHeader(ctx);
    }
    function drawHeader(cx) {
      const right = F.x + F.w - cell * 0.5, y = F.y;
      // the number so far: its fixed digits, growing leftward; '…' as three dots in the hand
      cx.save(); cx.translate(F.x, 0);
      glyphs(cx, '...' + tail, right - F.x, y + rowH * 0.4, pal.accent, 0.95, 1000003, 3);
      cx.restore();
      cx.fillStyle = rgba(pal.ink, 0.55); cx.font = '11px ' + MONO; cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
      cx.fillText('e² = e · 25 → 625 → 0625 → 90625 → … · ' + tail.length + ' digits fixed after ' + stepsDone + (stepsDone === 1 ? ' squaring' : ' squarings'), right, y + rowH * 2.5);
      rule(cx, right, y + rowH * 2.9, F.w - cell, 1000007);
    }
    function instant(n) {
      for (let i = 0; i < n; i++) { nextSquaring(); for (const r of queue) rows.push(r); queue = []; }
      if (rows.length > 400) rows.splice(0, rows.length - 200);
      paint(); slide = 0; render();
    }

    // ── export ──
    function sheetPNG() {
      const c = document.createElement('canvas');
      const k = 2;
      c.width = W * k; c.height = H * k;
      const cx = c.getContext('2d');
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, c.width, c.height);
      cx.setTransform(k, 0, 0, k, 0, 0);
      cx.drawImage(roll, F.x, F.y + head, F.w, F.h - head);
      if (O.header) drawHeader(cx);
      return c;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); render(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.paper;
        rows = []; queue = []; step = null; stepsDone = 0; tail = '25'; clock = 0; nextAt = 0; slide = 0;
        layout();
        if (O.at !== null) instant(Math.max(0, Math.floor(O.at))); else render();
      },
      resize() { layout(); render(); },
      png: sheetPNG,
      tail: () => tail,
      square,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
    };
    api.reset();
    last = performance.now();
    if (O.at === null) raf = requestAnimationFrame(frame);
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, square, DEFAULTS };
})();
