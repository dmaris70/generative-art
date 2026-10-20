// 044 — The 25th Frame.
//
// The Soviet "25th frame": a frame slipped into film running at 24 a second, too brief to be
// seen, said to work on the viewer all the same. The myth has it the other way round. Here the
// number 25 is never in any frame at all. Every frame is fair-coin noise — each cell black or
// white on a toss, and from one frame alone nothing about the figure can be read. The figure is
// in the relation between frames. Outside it, every cell flips to its opposite on each frame,
// so any two frames cancel to flat grey. Inside it, the noise holds still (or drifts one cell a
// frame). To the eye, the still region stands in the shimmering field; to a camera on a long
// exposure, frozen noise stands in grey. Look at any one frame and it is gone.
//
// The figure comes and goes in takes — a few seconds on, a few off — and sits where the seed
// puts it. A long exposure is built in (the mean of the last n frames), for the thumbnail and
// for checking that what a camera would see is what is claimed.
//
// This file is the whole piece, free of any harness: Frame25.create(canvas, options) runs it.
// sketch.js wires it to the gallery panel; neort.html is this file inlined with defaults.

const Frame25 = (function () {
  'use strict';

  const DEFAULTS = {
    seed: 1,
    cell: 6,             // cell size, in sheet units
    figure: 'still',     // still: the noise holds inside the figure · drift: it moves one cell a frame
    take: 4,             // seconds the figure is present
    gap: 2.5,            // seconds between takes, the whole field flickering
    size: 0.62,          // the figure's height as a share of the frame
    wander: 1,           // 0: the figure centred · 1: the seed moves it about between takes
    ground: 'dark',      // dark · paper (the noise is the same; the page around it differs)
    contrast: 0.8,       // of the noise, 1 being full black and white — a courtesy to the eye
    expose: 0,           // 0: live · n: a still, the mean of n frames — what a camera sees
    caption: 0,
  };
  const PALETTE = {
    dark: { ground: '#0b0b0e', ink: '232,230,223' },
    paper: { ground: '#f4f0e8', ink: '27,27,27' },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1000, H = 1000, MARGIN = 60;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    const F = { x: MARGIN, y: MARGIN, w: W - 2 * MARGIN, h: H - 2 * MARGIN };
    let pal = PALETTE.dark, scale = 1, ox = 0, oy = 0;
    let n = 0;                            // cells across (and down) the frame
    let field = null, mask = null;        // the noise, 0/1 per cell; the figure, 0/1 per cell
    let grid = null, gctx = null, img = null;   // the frame at cell resolution
    let rng = null, frames = 0, raf = 0, resizeTimer = 0;
    let takeAt = 0, inTake = false, clock = 0, last = 0;
    let sum = null, exposed = 0;          // the long exposure

    // ── layout ──
    function layout() {
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = Math.min(canvas.width / W, canvas.height / H);
      ox = (canvas.width - W * scale) / 2; oy = (canvas.height - H * scale) / 2;
    }
    function build() {
      n = Math.floor(F.w / O.cell);
      field = new Uint8Array(n * n);
      mask = new Uint8Array(n * n);
      grid = document.createElement('canvas'); grid.width = n; grid.height = n;
      gctx = grid.getContext('2d'); img = gctx.createImageData(n, n);
      rng = mulberry32(O.seed >>> 0);
      for (let i = 0; i < n * n; i++) field[i] = rng() < 0.5 ? 1 : 0;
      sum = new Float32Array(n * n); exposed = 0;
      frames = 0; clock = 0; takeAt = 0; inTake = false;
      placeFigure();
    }
    // the figure: the numeral, rasterised at cell resolution where the seed puts it
    function placeFigure() {
      const c = document.createElement('canvas'); c.width = n; c.height = n;
      const cx = c.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, n, n);
      const h = n * O.size;
      cx.font = 'bold ' + h + 'px ' + MONO; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const dx = O.wander ? (rng() - 0.5) * (n - h * 1.3) : 0, dy = O.wander ? (rng() - 0.5) * (n - h * 1.1) : 0;
      cx.fillStyle = '#fff'; cx.fillText('25', n / 2 + dx, n / 2 + dy);
      const d = cx.getImageData(0, 0, n, n).data;
      for (let i = 0; i < n * n; i++) mask[i] = d[4 * i] > 127 ? 1 : 0;
    }

    // ── one frame of the field ──
    function step() {
      // outside the figure every cell flips: two frames cancel to grey.
      // inside it the noise holds, or drifts a cell to the right.
      const present = inTake;
      if (O.figure === 'drift' && present) {
        const next = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const i = y * n + x;
          if (mask[i]) { const j = y * n + ((x - 1 + n) % n); next[i] = mask[j] ? field[j] : (rng() < 0.5 ? 1 : 0); }
          else next[i] = field[i] ^ 1;
        }
        field = next;
      } else {
        for (let i = 0; i < n * n; i++) if (!(present && mask[i])) field[i] ^= 1;
      }
      frames++;
      if (sum) { for (let i = 0; i < n * n; i++) sum[i] += field[i]; exposed++; }
    }
    function paint() {
      const d = img.data;
      // the two tones of the noise: ink and ground, pulled toward their mean by the contrast
      const [r1, g1, b1] = pal.ink.split(',').map(Number);
      const g = pal.ground, r0 = parseInt(g.slice(1, 3), 16), g0 = parseInt(g.slice(3, 5), 16), b0 = parseInt(g.slice(5, 7), 16);
      const c = O.contrast, mr = (r0 + r1) / 2, mg = (g0 + g1) / 2, mb = (b0 + b1) / 2;
      const ir = mr + (r1 - mr) * c, ig = mg + (g1 - mg) * c, ib = mb + (b1 - mb) * c;
      const gr = mr + (r0 - mr) * c, gg = mg + (g0 - mg) * c, gb = mb + (b0 - mb) * c;
      if (O.expose > 0) {
        // the long exposure: the mean of the last frames
        for (let i = 0; i < n * n; i++) {
          const v = exposed ? sum[i] / exposed : 0.5;
          d[4 * i] = gr + (ir - gr) * v; d[4 * i + 1] = gg + (ig - gg) * v; d[4 * i + 2] = gb + (ib - gb) * v; d[4 * i + 3] = 255;
        }
      } else {
        for (let i = 0; i < n * n; i++) {
          const v = field[i];
          d[4 * i] = v ? ir : gr; d[4 * i + 1] = v ? ig : gg; d[4 * i + 2] = v ? ib : gb; d[4 * i + 3] = 255;
        }
      }
      gctx.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, F.x, F.y, n * O.cell, n * O.cell);
      if (O.caption) {
        ctx.fillStyle = 'rgba(' + pal.ink + ',0.55)'; ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(O.expose > 0 ? 'the mean of ' + exposed + ' frames — what a camera sees' : 'frame ' + frames + ' · every frame is fair-coin noise', F.x, H - 24);
      }
    }

    // ── time: takes and gaps ──
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      clock += dt;
      if (clock >= takeAt) {
        inTake = !inTake;
        takeAt = clock + (inTake ? O.take : O.gap);
        if (inTake && O.wander) placeFigure();
      }
      step();
      paint();
    }
    // a still: n frames of a take, averaged
    function exposure(k) {
      inTake = true;
      sum = new Float32Array(n * n); exposed = 0;
      for (let i = 0; i < k; i++) step();
      paint();
    }

    // ── export ──
    function sheetPNG() {
      const c = document.createElement('canvas');
      const k = 2;
      c.width = W * k; c.height = H * k;
      const cx = c.getContext('2d');
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, c.width, c.height);
      cx.setTransform(k, 0, 0, k, 0, 0);
      cx.imageSmoothingEnabled = false;
      cx.drawImage(grid, F.x, F.y, n * O.cell, n * O.cell);
      return c;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); paint(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        cancelAnimationFrame(raf);
        layout(); build();
        if (O.expose > 0) exposure(Math.max(1, Math.floor(O.expose)));
        else { sum = null; last = performance.now(); raf = requestAnimationFrame(frame); }
      },
      resize() { layout(); paint(); },
      png: sheetPNG,
      frames: () => frames,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
    };
    api.reset();
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, DEFAULTS };
})();
