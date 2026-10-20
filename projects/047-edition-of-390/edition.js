// 047 — Edition of 390.
//
// The exhibition at NEORT++ runs from 10:00 to 16:30 JST on 24 October 2026: 390 minutes. Each
// minute is one offset of the 25-grid, so one tiling with exact 25-fold symmetry (de Bruijn's
// dual, as in 046) that no other minute has. The screen grows the current minute's tiling from
// the centre in about twenty seconds, rests on it, and at the minute boundary fades into the
// next. A QR code in the corner opens take.html on the gallery site, which reads the phone's
// clock in JST and regenerates the tiling of that minute — the same arithmetic, no server — and
// hands it over as a plotter-ready SVG and a PNG. The visitor leaves with the tiling of the
// minute they stood there. Edition k is offset(seed k): deterministic, auditable, finite.
//
// Outside the room's hours the screen rehearses: the editions in order from load, one a minute,
// so the piece is whole at any time of day. On the day, in the room, it is locked to the clock.
//
// This file is the whole piece but for the tiling, which it takes from Fold (046: Fold.tiling,
// Fold.offset). Edition.create(canvas, options) runs it. sketch.js wires it to the gallery
// panel; take.html is the visitor's page; neort.html is fold.js + this file inlined.

const Edition = (function () {
  'use strict';

  const N = 25, TOTAL = 390;
  const OPEN = 10 * 60, CLOSE = 16 * 60 + 30;      // minutes of the day, JST
  const JST = 9 * 60;                               // minutes east of UTC; Japan keeps no summer time
  const DAY = '24 October 2026';
  const DEFAULTS = {
    radius: 4,           // the multigrid's window (as 046)
    rate: 220,           // tiles a second while growing: the whole disc in about twenty seconds
    fade: 2,             // seconds to fade at the minute boundary
    ground: 'dark',      // dark · paper
    caption: 1,
    qr: 1,               // draw the code that opens take.html
    clock: 'jst',        // jst: locked to Tokyo time in the room's hours, rehearsal outside them · load: rehearsal from load
    m: null,             // a fixed edition index 0 … 389 (null: by the clock)
    at: null,            // a still: the share of tiles placed (0 … 1), no animation
  };
  // The code opens the visitor's page. Version 5, 37 × 37, error correction M; generated once
  // and verified to decode to TAKE (tools: qrcode + jsQR).
  const TAKE = 'https://dmaris70.github.io/generative-art/projects/047-edition-of-390/take.html';
  const QR = {
    size: 37,
    rows: [
      '1111111010101000110000001100001111111',
      '1000001010010110000110000110101000001',
      '1011101010101111001101011101101011101',
      '1011101001101101010101001111001011101',
      '1011101010000110011100000010001011101',
      '1000001000011011110010111010001000001',
      '1111111010101010101010101010101111111',
      '0000000000010100001110110111100000000',
      '1001111111111101110100110011110010111',
      '1100010001011000011101011111010011010',
      '1010011110100100011010110101001100101',
      '0100100111100111010110010000011111111',
      '1011101101111010100010101001001101001',
      '0100100010110111010000011011000011000',
      '1000101000100101100101101101001011111',
      '1100000110100010000110111001101101100',
      '0001101101010101100010011101011000111',
      '1110000100011000111101101001000000000',
      '1100011001010001000100011001000001001',
      '1011000101110100001100110100111111001',
      '1000111100110101010110001011011111000',
      '1101010100010111011101110111000010110',
      '1011001000110001010000110101101101001',
      '1000000111101111111010010010111111111',
      '1000101101101001111110011000111000011',
      '1111110101010010101000110011110011000',
      '1111001001100000100110000101001100111',
      '1010110110101011000110010000011111110',
      '1010001010110010101110100100111111100',
      '0000000011101001001110100110100010100',
      '1111111010111111000111011000101010001',
      '1000001010010110011000001111100010010',
      '1011101010110001000000011001111110010',
      '1011101011100000111100110010011000101',
      '1011101000110011110001110001000010101',
      '1000001000110110110000010000001011111',
      '1111111011001111100110001001100100001'
    ],
  };
  const PALETTE = {
    dark: {
      ground: '#0b0b0e', ink: '232,230,223', edge: 'rgba(11,11,14,0.9)', light: '#f4f0e8',
      fill: ['#1c2044', '#243068', '#2d428c', '#3a5aae', '#4b76c6', '#6a95d4', '#92b3de', '#bcc9e0', '#dccdb3', '#e4b67d', '#dc934f', '#c76a2d'],
    },
    paper: {
      ground: '#f4f0e8', ink: '27,27,27', edge: 'rgba(27,27,27,0.55)', light: '#f4f0e8',
      fill: ['#f1ece3', '#e8e1d2', '#dfd4bf', '#d4c6ab', '#c9b797', '#bca983', '#ae9a72', '#9f8b63', '#8f7b56', '#7e6b4a', '#6c5a3f', '#594a35'],
    },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1000, H = 1000;

  // ───────────────────────── the clock ─────────────────────────
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const hhmm = (minuteOfDay) => pad(Math.floor(minuteOfDay / 60) % 24) + ':' + pad(minuteOfDay % 60);
  // Where the day stands at a UTC timestamp: open or not, and which minute of the 390.
  function minute(nowMs) {
    const d = new Date(nowMs + JST * 60000);
    const mod = d.getUTCHours() * 60 + d.getUTCMinutes();
    const open = mod >= OPEN && mod < CLOSE;
    return {
      open, k: open ? mod - OPEN : null, now: hhmm(mod),
      second: d.getUTCSeconds() + d.getUTCMilliseconds() / 1000,
      untilOpen: open ? 0 : (OPEN - mod + 1440) % 1440,          // minutes
    };
  }
  const seedFor = (k) => k + 1;                 // edition k (0 … 389) is the tiling of offset(seed k + 1)
  const timeOf = (k) => hhmm(OPEN + k);         // the minute it belongs to
  const build = (k, radius) => Fold.offset(seedFor(k), radius);   // { c, T: { tiles, degenerate } }

  // ───────────────────────── the visitor's file ─────────────────────────
  // The whole tiles of the disc, filled by shape and outlined, with the caption in single-stroke
  // letters (StrokeFont, when present) so that a plotter can draw every line of it.
  function svg(k, radius, ground) {
    const pal = PALETTE[ground] || PALETTE.dark;
    const o = build(k, radius), tiles = o.T.tiles;
    const far = tiles.length ? tiles[tiles.length - 1].d : 1, rim = far * 0.62, unit = (H / 2 - 70) / rim;
    const f = (v) => v.toFixed(2);
    const P = (t) => t.v.map((p, i) => (i ? 'L' : 'M') + f(W / 2 + p.x * unit) + ' ' + f(H / 2 - p.y * unit)).join('') + 'Z';
    const whole = tiles.filter((t) => t.v.every((p) => Math.hypot(p.x, p.y) <= rim));
    const out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="250mm" height="250mm" viewBox="0 0 ' + W + ' ' + H + '">');
    out.push('<title>Edition ' + (k + 1) + ' of 390 — ' + timeOf(k) + ' JST, ' + DAY + '</title>');
    out.push('<rect width="' + W + '" height="' + H + '" fill="' + pal.ground + '"/>');
    out.push('<g id="fills" stroke="none">');
    for (let s = 1; s <= 12; s++) {
      const d = whole.filter((t) => t.shape === s).map(P).join('');
      if (d) out.push('<path fill="' + pal.fill[s - 1] + '" d="' + d + '"/>');
    }
    out.push('</g>');
    out.push('<g id="edges" fill="none" stroke="rgb(' + pal.ink + ')" stroke-width="0.5" stroke-linejoin="round"><path d="' + whole.map(P).join('') + '"/></g>');
    const line1 = 'EDITION ' + (k + 1) + ' OF 390 - ' + timeOf(k) + ' JST - 24 OCT 2026 - NEORT++ TOKYO';
    const line2 = '25-FOLD - ' + whole.length + ' TILES - OFFSET ' + o.c.toFixed(4) + ' - PCDTOKYO2026';
    out.push('<g id="caption" fill="none" stroke="rgb(' + pal.ink + ')" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">');
    if (typeof StrokeFont !== 'undefined') {
      for (const [str, y] of [[line1, H - 48], [line2, H - 30]])
        for (const pl of StrokeFont.text(str, 60, y, 11))
          out.push('<polyline points="' + pl.map((p) => f(p.x) + ',' + f(p.y)).join(' ') + '"/>');
    } else {
      out.push('<text x="60" y="' + (H - 40) + '" font-family="monospace" font-size="11" fill="rgb(' + pal.ink + ')" stroke="none">' + line1 + '</text>');
      out.push('<text x="60" y="' + (H - 24) + '" font-family="monospace" font-size="11" fill="rgb(' + pal.ink + ')" stroke="none">' + line2 + '</text>');
    }
    out.push('</g></svg>');
    return { svg: out.join('\n'), tiles: whole.length, offset: o.c };
  }

  // ───────────────────────── the piece ─────────────────────────
  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    let pal = PALETTE.dark, scale = 1, ox = 0, oy = 0;
    let k = -1, mode = 'live', c = 0, tiles = [], placed = 0, drawn = 0, unit = 1, rim = 0;
    let sheet = null, phase = 'growing', phaseAt = 0, clock = 0, last = 0, raf = 0, resizeTimer = 0, acc = 0;
    const loadAt = Date.now();

    // Which edition the screen should show now, and why.
    function target() {
      if (O.m !== null && isFinite(O.m)) return { k: Math.max(0, Math.min(TOTAL - 1, Math.floor(O.m))), mode: 'fixed' };
      const now = Date.now();
      if (O.clock === 'jst') { const mi = minute(now); if (mi.open) return { k: mi.k, mode: 'live' }; }
      return { k: Math.floor((now - loadAt) / 60000) % TOTAL, mode: 'rehearsal' };
    }
    function layout() {
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
      sheet = document.createElement('canvas');
      sheet.width = Math.ceil(W * scale); sheet.height = Math.ceil(H * scale);
      repaint();
    }
    function load(next) {
      k = next;
      const o = build(k, O.radius);
      c = o.c; tiles = o.T.tiles;
      const far = tiles.length ? tiles[tiles.length - 1].d : 1;
      rim = far * 0.62;
      unit = (H / 2 - 70) / rim;                // room for the caption and the code
      placed = 0; drawn = 0; acc = 0;
    }
    // ── drawing ──
    function drawTile(cx, t) {
      cx.beginPath();
      for (let i = 0; i < 4; i++) { const x = W / 2 + t.v[i].x * unit, y = H / 2 - t.v[i].y * unit; if (i) cx.lineTo(x, y); else cx.moveTo(x, y); }
      cx.closePath();
      cx.fillStyle = pal.fill[t.shape - 1]; cx.fill();
      cx.strokeStyle = pal.edge; cx.lineWidth = Math.max(0.6, unit * 0.045); cx.lineJoin = 'round'; cx.stroke();
    }
    function clipDisc(cx) { cx.save(); cx.beginPath(); cx.arc(W / 2, H / 2, rim * unit, 0, Math.PI * 2); cx.clip(); }
    function repaint() {
      const sc = sheet.getContext('2d');
      sc.setTransform(scale, 0, 0, scale, 0, 0); sc.clearRect(0, 0, W, H);
      clipDisc(sc); for (let i = 0; i < placed; i++) drawTile(sc, tiles[i]); sc.restore();
    }
    function place(n) {
      const sc = sheet.getContext('2d');
      sc.setTransform(scale, 0, 0, scale, 0, 0);
      clipDisc(sc);
      for (let i = 0; i < n && placed < tiles.length; i++, placed++) {
        if (tiles[placed].d > rim + 1.5) { placed = tiles.length; break; }
        drawTile(sc, tiles[placed]); drawn++;
      }
      sc.restore();
    }
    function drawQR(cx, x, y, size) {
      const q = 4, n = QR.size, m = size / (n + 2 * q);
      cx.fillStyle = pal.light; cx.fillRect(x, y, size, size);
      cx.fillStyle = '#0b0b0e';
      for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) if (QR.rows[r][i] === '1') cx.fillRect(x + (q + i) * m, y + (q + r) * m, m + 0.2, m + 0.2);
    }
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      const t = clock - phaseAt;
      ctx.save();
      ctx.globalAlpha = phase === 'fading' ? Math.max(0, 1 - t / Math.max(0.01, O.fade)) : 1;
      ctx.drawImage(sheet, 0, 0, W, H);
      ctx.restore();
      const ink = (a) => 'rgba(' + pal.ink + ',' + a + ')';
      if (O.qr) {
        drawQR(ctx, W - 60 - 118, H - 24 - 118, 118);
        ctx.fillStyle = ink(0.55); ctx.font = '11px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(mode === 'live' ? 'take this minute' : 'the visitor\'s page', W - 60, H - 24 - 118 - 10);
      }
      if (O.caption) {
        ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const ed = 'Edition ' + (k + 1) + ' of 390 · ' + timeOf(k) + ' JST';
        const head = mode === 'rehearsal' ? 'Rehearsal · edition ' + (k + 1) + ' of 390 · ' + timeOf(k) + ' JST' : ed;
        const sub = mode === 'live' ? 'one tiling a minute while the room is open, 10:00 – 16:30 · 25-fold · ' + drawn.toLocaleString('en-US') + ' tiles · offset ' + c.toFixed(4)
          : 'the editions are cut 10:00 – 16:30 JST, ' + DAY + ', NEORT++ · 25-fold · ' + drawn.toLocaleString('en-US') + ' tiles · offset ' + c.toFixed(4);
        ctx.fillStyle = ink(0.85); ctx.fillText(head, 60, H - 42);
        ctx.fillStyle = ink(0.55); ctx.fillText(sub, 60, H - 24);
      }
    }

    // ── time: growing → resting; at the minute boundary fading → growing ──
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      clock += dt;
      const tg = target();
      if (tg.k !== k && phase !== 'fading') { phase = 'fading'; phaseAt = clock; }
      const t = clock - phaseAt;
      if (phase === 'fading') {
        if (t >= O.fade) { mode = tg.mode; load(tg.k); repaint(); phase = 'growing'; phaseAt = clock; }
      } else if (phase === 'growing') {
        acc += dt * O.rate;
        const n = Math.floor(acc); acc -= n;
        if (n) place(n);
        if (placed >= tiles.length) { phase = 'resting'; phaseAt = clock; }
      }
      if (tg.mode !== mode && phase !== 'fading') mode = tg.mode;
      render();
    }

    // ── export: the disc at 2×, captioned ──
    function png() {
      const cnv = document.createElement('canvas'), s = 2;
      cnv.width = W * s; cnv.height = H * s;
      const cx = cnv.getContext('2d');
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, cnv.width, cnv.height);
      cx.setTransform(s, 0, 0, s, 0, 0);
      clipDisc(cx); for (let i = 0; i < placed; i++) drawTile(cx, tiles[i]); cx.restore();
      cx.fillStyle = 'rgba(' + pal.ink + ',0.85)'; cx.font = '11px ' + MONO; cx.textBaseline = 'alphabetic';
      cx.fillText('Edition ' + (k + 1) + ' of 390 · ' + timeOf(k) + ' JST · ' + DAY + ' · NEORT++ Tokyo', 60, H - 42);
      cx.fillStyle = 'rgba(' + pal.ink + ',0.55)';
      cx.fillText('25-fold · ' + drawn.toLocaleString('en-US') + ' tiles · offset ' + c.toFixed(4) + ' · PCDTokyo2026', 60, H - 24);
      return cnv;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); render(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        cancelAnimationFrame(raf);
        const tg = target(); mode = tg.mode; load(tg.k); layout();
        clock = 0; phaseAt = 0; phase = 'growing';
        if (O.at !== null) { place(Math.floor(Math.max(0, Math.min(1, O.at)) * tiles.length)); phase = 'resting'; render(); }
        else { last = performance.now(); raf = requestAnimationFrame(frame); }
      },
      resize() { layout(); render(); },
      png, edition: () => ({ k, number: k + 1, time: timeOf(k), mode, offset: c, tiles: drawn }),
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
    };
    api.reset();
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, minute, seedFor, timeOf, build, svg, TOTAL, OPEN, CLOSE, DAY, TAKE, QR, DEFAULTS };
})();
