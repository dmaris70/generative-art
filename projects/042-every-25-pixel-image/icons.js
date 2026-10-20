// 042 — Every 25-Pixel Image, Exhausted in One Day.
//
// A 5 × 5 grid of cells, each on or off, can show 2²⁵ = 33,554,432 images. John F. Simon Jr.'s
// Every Icon (1997) counts through every image of a 32 × 32 grid — its first row alone takes
// about 1.36 years at 100 a second, the whole grid longer than the universe has existed. Here
// the grid is 25 cells, and 25 images are shown on every frame, as a sheet of 5 × 5 tiles.
// At 60 frames a second that is 1,500 images a second, and every image has been shown after
// 6 h 12 m 49.6 s: the length of one exhibition day. The sheet is locked to Tokyo time. It
// begins at 10:00:00 JST, finishes at 16:12:49 JST, and rests on the last 25 images.
//
// The images are counted in binary. Cell c of an image is on when bit c of its number is set,
// bits numbered row by row from the top left — so the top-left cell changes every image, the
// next cell every second image, and the bottom-right cell once, three hours in. Each row of a
// tile is a clock five bits wide: the first row is a blur, the last row barely moves.
//
// Since the position comes from the clock and not from the frame count, the sheet is correct
// whenever it is shown, at whatever time a rotation brings it up. A display slower than
// 60 frames a second shows fewer of the images; it never shows them out of order.
//
// This file is the whole piece, free of any harness: Icons.create(canvas, options) runs it.
// sketch.js wires it to the gallery panel; neort.html is this file inlined with defaults.

const Icons = (function () {
  'use strict';

  const CELLS = 25, TILES = 25, TOTAL = 2 ** CELLS;   // 33,554,432
  const DEFAULTS = {
    seed: 1,
    clock: 'jst',        // jst: locked to Tokyo time · load: begins when the page loads
    start: '10:00',      // when the day begins (JST), clock = jst
    rate: 1500,          // images per second: 25 tiles × 60 frames
    order: 'row',        // row: bit c is cell c, row by row (as Every Icon) · seed: the seed shuffles the cells
    ground: 'dark',      // dark · paper
    caption: 1,
    hold: 60,            // clock = load: seconds the finished sheet rests before it begins again
    at: null,            // a still: show the block holding this image and stop (tests, thumbnails)
  };
  const PALETTE = {
    dark: { ground: '#0b0b0e', ink: '232,230,223', faint: 0.1 },
    paper: { ground: '#f4f0e8', ink: '27,27,27', faint: 0.14 },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1000, H = 1000, MARGIN = 60, GUTTER = 20;   // the sheet, in its own units
  const JST = 9 * 60;                                   // minutes east of UTC; Japan keeps no summer time

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    let pal = PALETTE.dark, scale = 1, ox = 0, oy = 0;
    let perm = [];                      // cell → bit
    let F = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN };
    let tile = 0, cell = 0;
    let raf = 0, loadedAt = 0, resizeTimer = 0;
    let state = { phase: 'before', k: 0, now: null };   // phase: before · counting · after

    // ── layout ──
    function layout() {
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
      tile = (F.w - 4 * GUTTER) / 5; cell = tile / 5;
    }
    function order() {
      perm = [...Array(CELLS).keys()];
      if (O.order === 'seed') {
        const r = mulberry32(O.seed >>> 0);
        for (let i = CELLS - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      }
    }

    // ── time ──
    // The day's start, as a UTC timestamp: today's (JST) date at O.start JST.
    function dayStart(now) {
      const [h, m] = O.start.split(':').map(Number);
      const jst = new Date(now + JST * 60000);
      return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), h, m, 0) - JST * 60000;
    }
    function jstClock(now) {
      const d = new Date(now + JST * 60000);
      return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    }
    // Where the sheet is now: the first image of the block on show, and the phase.
    function locate() {
      if (O.at !== null) return { phase: 'counting', k: Math.min(TOTAL - TILES, Math.floor(O.at / TILES) * TILES), now: Date.now() };
      const now = Date.now();
      let t0;
      if (O.clock === 'jst') t0 = dayStart(now);
      else {
        const span = TOTAL / O.rate + O.hold;        // the run, then the rest, then again
        t0 = loadedAt + Math.floor((now - loadedAt) / (span * 1000)) * span * 1000;
      }
      const elapsed = (now - t0) / 1000;
      if (elapsed < 0) return { phase: 'before', k: 0, now, until: -elapsed };
      const k = Math.floor((elapsed * O.rate) / TILES) * TILES;
      if (k >= TOTAL) return { phase: 'after', k: TOTAL - TILES, now };
      return { phase: 'counting', k, now };
    }

    // ── drawing ──
    const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
    // one image, n, as a tile of 5 × 5 cells: cell c is on when bit perm[c] of n is set
    function drawTile(cx, n, x, y) {
      cx.lineWidth = 1;
      cx.strokeStyle = rgba(pal.ink, pal.faint);
      cx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      cx.fillStyle = rgba(pal.ink, 0.95);
      cx.strokeStyle = rgba(pal.ink, pal.faint * 0.6);
      for (let c = 0; c < CELLS; c++) {
        const cxp = x + (c % 5) * cell, cyp = y + Math.floor(c / 5) * cell;
        if ((n >>> perm[c]) & 1) cx.fillRect(cxp + 1, cyp + 1, cell - 2, cell - 2);
        else cx.strokeRect(cxp + 0.5, cyp + 0.5, cell - 1, cell - 1);
      }
    }
    function render() {
      const s = state;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      for (let j = 0; j < TILES; j++) {
        const x = F.x + (j % 5) * (tile + GUTTER), y = F.y + Math.floor(j / 5) * (tile + GUTTER);
        drawTile(ctx, s.phase === 'before' ? 0 : s.k + j, x, y);
      }
      if (O.caption) drawCaption(ctx, s);
    }
    function drawCaption(cx, s) {
      cx.save();
      cx.fillStyle = rgba(pal.ink, 0.55); cx.font = '11px ' + MONO; cx.textBaseline = 'alphabetic';
      const y = H - 24;
      // the progress hairline
      const done = s.phase === 'before' ? 0 : s.phase === 'after' ? 1 : (s.k + TILES) / TOTAL;
      cx.fillStyle = rgba(pal.ink, 0.12); cx.fillRect(F.x, y - 22, F.w, 1);
      cx.fillStyle = rgba(pal.ink, 0.7); cx.fillRect(F.x, y - 22, F.w * done, 1);
      cx.fillStyle = rgba(pal.ink, 0.55);
      let left, right;
      if (s.phase === 'before') {
        const u = Math.ceil(s.until), hh = Math.floor(u / 3600), mm = Math.floor((u % 3600) / 60), ss = u % 60;
        left = 'image 0 of ' + group(TOTAL) + ' · begins in ' + (hh ? hh + ' h ' : '') + mm + ' m ' + ss + ' s';
      } else if (s.phase === 'after') left = 'every one of the ' + group(TOTAL) + ' images has been shown';
      else left = 'images ' + group(s.k) + ' – ' + group(s.k + TILES - 1) + ' of ' + group(TOTAL);
      const end = endClock();
      right = O.clock === 'jst'
        ? jstClock(s.now) + ' JST · ' + O.start + ':00 → ' + end + ' · ' + group(O.rate) + ' a second, 25 a frame'
        : 'from load · ' + end + ' to the last · ' + group(O.rate) + ' a second, 25 a frame';
      cx.textAlign = 'left'; cx.fillText(left, F.x, y);
      cx.textAlign = 'right'; cx.fillText(right, F.x + F.w, y);
      cx.restore();
    }
    function endClock() {
      const secs = TOTAL / O.rate;
      if (O.clock !== 'jst') { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60); return h + ' h ' + m + ' m'; }
      const [h, m] = O.start.split(':').map(Number);
      const t = h * 3600 + m * 60 + Math.floor(secs);
      return pad(Math.floor(t / 3600) % 24) + ':' + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      state = locate();
      render();
    }

    // ── export ──
    function sheetPNG() {
      const c = document.createElement('canvas');
      const k = 2;
      c.width = W * k; c.height = H * k;
      const cx = c.getContext('2d');
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, c.width, c.height);
      cx.setTransform(k, 0, 0, k, 0, 0);
      for (let j = 0; j < TILES; j++) {
        const x = F.x + (j % 5) * (tile + GUTTER), y = F.y + Math.floor(j / 5) * (tile + GUTTER);
        drawTile(cx, state.phase === 'before' ? 0 : state.k + j, x, y);
      }
      if (O.caption) drawCaption(cx, state);
      return c;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); render(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        order(); layout(); loadedAt = Date.now();
        state = locate(); render();
      },
      resize() { layout(); render(); },
      png: sheetPNG,
      state: () => state,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
      TOTAL, TILES,
    };
    api.reset();
    if (O.at === null) raf = requestAnimationFrame(frame);
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, DEFAULTS, TOTAL, TILES };
})();
