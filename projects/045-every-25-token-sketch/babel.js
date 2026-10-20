// 045 — Every 25-Token Sketch.
//
// つぶやきProcessing — "tweet Processing" — is a Tokyo-born practice: a whole sketch in the
// 280 characters of one post. The culture lives on a fact nobody states: nearly every short
// program draws nothing worth looking at, and the few that do are found by people, one at a
// time. This piece does the finding by exhaustion instead. It enumerates every program of a
// tiny pixel language — fifteen symbols, written postfix so that every well-formed string of
// them is a program — in order, shortest first, and draws each one as it arrives. A conveyor
// of 25 tiles shows the last 25 programs, their code beneath them; a slow lane keeps the one
// that scores best for having structure, and lets its claim fade so another can take it.
//
// The language: leaves x, y, t, 2, 25 · unary sin, cos, abs, sqrt, floor · binary + − × ÷ mod.
// A pixel at (x, y) ∈ [−2, 2]² at time t takes the value of the program, shown as a tone.
// There are 5 programs of one token, 25 of two, 250 of three, 2,500 of four, 28,125 of five,
// 328,125 of six. At 8 a second, a day reaches the sixth token. The first 25-token program
// is number 72,482,416,106,745,349,561,765,281 and arrives in 2.9 × 10¹⁷ years. The sketch
// does not stop.
//
// Enumeration is exact: the programs of each length are counted by a recurrence on stack
// depth, and the k-th program is unranked from that table (BigInt), so the order is the same
// for everyone, forever. The seed may shelve the library differently (another order of the
// alphabet); seed 1 is the canonical shelving.
//
// This file is the whole piece, free of any harness: Babel.create(canvas, options) runs it.
// sketch.js wires it to the gallery panel; neort.html is this file inlined with defaults.

const Babel = (function () {
  'use strict';

  const DEFAULTS = {
    seed: 1,             // 1: the canonical order of the alphabet · else the seed shuffles it
    rate: 8,             // programs a second
    from: 0,             // the program to begin at (its index in the enumeration)
    ground: 'dark',      // dark · paper
    fade: 0.9992,        // the champion's score decays by this per program, so it can be beaten
    at: null,            // a still: the conveyor and champion as they stand after this many programs
  };
  const PALETTE = {
    dark: { ground: '#0b0b0e', ink: '232,230,223', accent: '240,163,94', tileBg: '#101014' },
    paper: { ground: '#f4f0e8', ink: '27,27,27', accent: '200,85,61', tileBg: '#ebe6dc' },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1400, H = 1000, MARGIN = 60;              // a landscape sheet: the conveyor left, the slow lane right
  const RES = 64;                                   // a sketch is drawn at 64 × 64, as a tweet is short
  const TILES = 25, COLS = 5;
  const MAX = 25;                                   // the longest program the library holds

  // ───────────────────────── the language ─────────────────────────
  // [symbol, arity, infix precedence, how to write it as code]
  const ALPHABET = [
    ['x', 0], ['y', 0], ['t', 0], ['2', 0], ['25', 0],
    ['sin', 1], ['cos', 1], ['abs', 1], ['sqrt', 1], ['floor', 1],
    ['+', 2], ['-', 2], ['*', 2], ['/', 2], ['mod', 2],
  ];
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2 };
  const JS = {
    sin: (a) => 'Math.sin(' + a + ')', cos: (a) => 'Math.cos(' + a + ')', abs: (a) => 'Math.abs(' + a + ')',
    sqrt: (a) => 'Math.sqrt(Math.abs(' + a + '))', floor: (a) => 'Math.floor(' + a + ')',
    '+': (a, b) => '(' + a + '+' + b + ')', '-': (a, b) => '(' + a + '-' + b + ')', '*': (a, b) => '(' + a + '*' + b + ')',
    '/': (a, b) => 'D(' + a + ',' + b + ')', mod: (a, b) => 'M(' + a + ',' + b + ')',
  };
  const D = (a, b) => (Math.abs(b) < 1e-9 ? (a < 0 ? -1e9 : 1e9) : a / b);
  const M = (a, b) => (Math.abs(b) < 1e-9 ? 0 : a - b * Math.floor(a / b));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ───────────────────────── counting and unranking ─────────────────────────
  // ways[rem][d]: completions with rem tokens left from stack depth d, ending at depth 1
  const ways = [];
  for (let rem = 0; rem <= MAX; rem++) {
    ways[rem] = [];
    for (let d = 0; d <= MAX + 1; d++) {
      if (rem === 0) { ways[rem][d] = d === 1 ? 1n : 0n; continue; }
      let n = d + 1 <= MAX + 1 ? 5n * ways[rem - 1][d + 1] : 0n;
      if (d >= 1) n += 5n * ways[rem - 1][d];
      if (d >= 2) n += 5n * ways[rem - 1][d - 1];
      ways[rem][d] = n;
    }
  }
  const COUNT = ways.map((w) => w[0]);                // programs of each length
  const CUM = [0n]; for (let n = 1; n <= MAX; n++) CUM[n] = CUM[n - 1] + COUNT[n];

  // The k-th program (k from 0) in an alphabet order: its length, then its tokens by unranking.
  function program(k, order) {
    const K = BigInt(k);
    let n = 1; while (n <= MAX && K >= CUM[n]) n++;
    if (n > MAX) return null;
    let r = K - CUM[n - 1];
    const tokens = [];
    let d = 0;
    for (let i = 0; i < n; i++) {
      const rem = n - i - 1;
      for (const idx of order) {
        const [, ar] = ALPHABET[idx];
        if (d < ar) continue;
        const nd = d - ar + 1;
        if (nd > MAX + 1) continue;
        const c = ways[rem][nd];
        if (r < c) { tokens.push(idx); d = nd; break; }
        r -= c;
      }
    }
    return { k, n, tokens };
  }

  // Code for people (infix, minimal parentheses) and code for the machine (a JS function).
  function render(tokens) {
    const st = [], js = [];
    for (const idx of tokens) {
      const [sym, ar] = ALPHABET[idx];
      if (ar === 0) { st.push({ s: sym, p: 3 }); js.push(sym === 't' ? 't' : sym); }
      else if (ar === 1) { const a = st.pop(); st.push({ s: sym + '(' + a.s + ')', p: 3 }); js.push(JS[sym](js.pop())); }
      else {
        const b = st.pop(), a = st.pop(), p = PREC[sym];
        const L = a.p < p ? '(' + a.s + ')' : a.s;
        const R = b.p < p || (b.p === p && (sym === '-' || sym === '/' || sym === 'mod')) ? '(' + b.s + ')' : b.s;
        st.push({ s: L + (sym === 'mod' ? ' mod ' : ' ' + sym + ' ') + R, p });
        const jb = js.pop(), ja = js.pop(); js.push(JS[sym](ja, jb));
      }
    }
    return { code: st[0].s, fn: new Function('x', 'y', 't', 'D', 'M', 'return ' + js[0] + ';') };
  }

  // ───────────────────────── the piece ─────────────────────────
  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    const F = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN };
    let pal = PALETTE.dark, scale = 1, ox = 0, oy = 0;
    let order = [];
    let slots = [];                       // the conveyor: the last 25 programs
    let champ = null;                     // the slow lane
    let next = 0, clock = 0, last = 0, raf = 0, nextAt = 0, resizeTimer = 0;
    const tile = document.createElement('canvas'); tile.width = RES; tile.height = RES;
    const tctx = tile.getContext('2d'); const img = tctx.createImageData(RES, RES);
    const vals = new Float32Array(RES * RES);

    function layout() {
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
    }
    function shelve() {
      order = [...Array(ALPHABET.length).keys()];
      if ((O.seed >>> 0) !== 1) {
        const r = mulberry32(O.seed >>> 0);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      }
    }

    // ── one program: evaluate on the 64 × 64 field at time t, into vals; return a score ──
    function evaluate(fn, t) {
      let i = 0;
      for (let py = 0; py < RES; py++) {
        const y = -2 + (4 * (py + 0.5)) / RES;
        for (let px = 0; px < RES; px++) {
          const x = -2 + (4 * (px + 0.5)) / RES;
          let v = fn(x, y, t, D, M);
          if (!isFinite(v)) v = 0;
          vals[i++] = 0.5 + 0.5 * Math.sin(v);                     // a tone in [0, 1]
        }
      }
    }
    // structure: tonal range spread over the histogram, times a preference for edges in the
    // middle — a flat field scores 0, a plain gradient low (edge ≈ 0.01), bands, fans and
    // rings high (0.1 … 0.2), moiré and noise nothing (0.35 and up); measured, not guessed
    function score() {
      const bins = new Float32Array(16); let grad = 0;
      for (let i = 0; i < RES * RES; i++) {
        bins[Math.min(15, Math.floor(vals[i] * 16))]++;
        if (i % RES) grad += Math.abs(vals[i] - vals[i - 1]);
        if (i >= RES) grad += Math.abs(vals[i] - vals[i - RES]);
      }
      let H = 0;
      for (let b = 0; b < 16; b++) if (bins[b]) { const p = bins[b] / (RES * RES); H -= p * Math.log2(p); }
      const g = grad / (2 * RES * RES);                              // mean edge, 0 … ~0.5
      return (H / 4) * Math.exp(-Math.pow((g - 0.13) / 0.09, 2));
    }
    function paintTile(cx, x, y, size) {
      const d = img.data;
      const [r1, g1, b1] = pal.ink.split(',').map(Number);
      const g = pal.tileBg, r0 = parseInt(g.slice(1, 3), 16), g0 = parseInt(g.slice(3, 5), 16), b0 = parseInt(g.slice(5, 7), 16);
      for (let i = 0; i < RES * RES; i++) {
        const v = vals[i];
        d[4 * i] = r0 + (r1 - r0) * v; d[4 * i + 1] = g0 + (g1 - g0) * v; d[4 * i + 2] = b0 + (b1 - b0) * v; d[4 * i + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
      cx.imageSmoothingEnabled = false;
      cx.drawImage(tile, x, y, size, size);
    }

    // ── the conveyor and the champion ──
    function arrive() {
      const p = program(next, order);
      if (!p) return false;
      const { code, fn } = render(p.tokens);
      const entry = { k: next, n: p.n, code, fn };
      evaluate(fn, clock); entry.score = score();
      slots[next % TILES] = entry;
      if (champ) champ.score *= O.fade;
      if (!champ || entry.score > champ.score) champ = Object.assign({}, entry, { since: clock });
      next++;
      return true;
    }

    // ── drawing ──
    const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
    const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      // the conveyor: 5 × 5 tiles with their code, on the left
      const gap = 10, size = (F.h - 22 * 5 - gap * 4) / 5, rowH = size + 22, gw = COLS * size + (COLS - 1) * gap;
      ctx.font = '10px ' + MONO; ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < TILES; i++) {
        const e = slots[i];
        const x = F.x + (i % COLS) * (size + gap), y = F.y + Math.floor(i / COLS) * rowH;
        ctx.fillStyle = pal.tileBg; ctx.fillRect(x, y, size, size);
        if (!e) continue;
        evaluate(e.fn, clock); paintTile(ctx, x, y, size);
        const fresh = e.k === next - 1;
        ctx.fillStyle = rgba(fresh ? pal.accent : pal.ink, fresh ? 0.95 : 0.6); ctx.textAlign = 'left';
        ctx.fillText(clip(e.code, size, 10), x, y + size + 14);
      }
      // the slow lane: the champion, large, on the right
      const cx0 = F.x + gw + 40, cw = F.w - gw - 40;
      if (champ) {
        evaluate(champ.fn, clock); paintTile(ctx, cx0, F.y, cw);
        ctx.fillStyle = rgba(pal.accent, 0.95); ctx.font = '15px ' + MONO; ctx.textAlign = 'left';
        wrap(ctx, champ.code, cx0, F.y + cw + 28, cw, 20, 15);
        ctx.fillStyle = rgba(pal.ink, 0.55); ctx.font = '10px ' + MONO;
        ctx.fillText('program ' + group(champ.k + 1) + ' · ' + champ.n + (champ.n === 1 ? ' token' : ' tokens') + ' · structure ' + champ.score.toFixed(3), cx0, F.y + cw + 28 + 20 * 4 + 6);
        ctx.fillText('the best so far; its claim fades, so another can take it', cx0, F.y + cw + 28 + 20 * 4 + 22);
      }
      // the caption
      const e = slots[(next - 1 + TILES) % TILES];
      if (e) {
        const years = Number(CUM[MAX - 1] / BigInt(Math.round(O.rate))) / 31557600;
        ctx.fillStyle = rgba(pal.ink, 0.55); ctx.font = '11px ' + MONO; ctx.textAlign = 'left';
        ctx.fillText('program ' + group(e.k + 1) + ' of the library · ' + e.n + (e.n === 1 ? ' token' : ' tokens') + ' · 15 symbols · ' + group(O.rate) + ' a second', F.x, H - 24);
        ctx.textAlign = 'right';
        ctx.fillText('the first 25-token sketch arrives in ' + sci(years) + ' years', F.x + F.w, H - 24);
      }
    }
    function sci(v) { const [m, e] = v.toExponential(1).split('e'); return m + ' × 10' + String(+e).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]); }
    function clip(s, width, px) { const n = Math.floor(width / (px * 0.6)); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function wrap(cx, s, x, y, width, lh, px) {
      const n = Math.max(8, Math.floor(width / (px * 0.6)));
      for (let i = 0, line = 0; i < s.length && line < 4; i += n, line++) cx.fillText(s.slice(i, i + n), x, y + line * lh);
    }

    // ── time ──
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      clock += dt;
      while (clock >= nextAt) { if (!arrive()) break; nextAt += 1 / O.rate; }
      draw();
    }

    // ── export ──
    function sheetPNG() {
      const c = document.createElement('canvas'), k = 2;
      c.width = W * k; c.height = H * k;
      const cx = c.getContext('2d');
      cx.drawImage(canvas, ox, oy, W * scale, H * scale, 0, 0, W * k, H * k);
      return c;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); draw(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        cancelAnimationFrame(raf);
        shelve(); layout();
        slots = []; champ = null; next = Math.max(0, Math.floor(O.from)); clock = 0; nextAt = 0;
        if (O.at !== null) { for (let i = 0; i < Math.max(1, Math.floor(O.at)); i++) if (!arrive()) break; draw(); }
        else { last = performance.now(); raf = requestAnimationFrame(frame); }
      },
      resize() { layout(); draw(); },
      png: sheetPNG,
      program, render, COUNT, CUM,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
    };
    api.reset();
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, program, render, ALPHABET, COUNT, CUM, DEFAULTS };
})();
