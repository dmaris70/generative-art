// 046 — Twenty-five-fold.
//
// A crystal can repeat with 2-, 3-, 4- or 6-fold symmetry and no other: the crystallographic
// restriction, which every periodic pattern obeys. A pattern that never repeats is not bound by
// it. De Bruijn's construction gives such a pattern for any n: lay n families of parallel lines
// across the plane, one family for each direction at 2π/n, and read the intersections as the
// rhombi of a tiling — each crossing of two lines is one rhombus, its edges along the two
// directions. For n = 25 there are twelve shapes of rhombus (one for each difference of
// directions, 14.4° to 172.8°), the tiling has exact 25-fold symmetry about its centre when the
// families share one offset, and it never repeats: turn it by 14.4° and it lies on itself; move
// it by any amount and it does not.
//
// The sheet grows the tiling from the centre, a tile a frame, in order of distance; when it is
// whole it turns through the 14.4° that leaves it unchanged, rests, fades, and grows again with
// another offset — another tiling with the same symmetry. The seed is the offset.
//
// This file is the whole piece, free of any harness: Fold.create(canvas, options) runs it.
// sketch.js wires it to the gallery panel; neort.html is this file inlined with defaults.

const Fold = (function () {
  'use strict';

  const N = 25;
  const DEFAULTS = {
    seed: 1,
    radius: 4,           // the multigrid's window: lines up to this many units from the centre
    rate: 60,            // tiles a second while growing
    turn: 60,            // seconds for the turn through 14.4° (0: no turn)
    hold: 20,            // seconds at rest before the fade
    edges: 1,            // draw the rhombus edges
    ground: 'dark',      // dark · paper
    caption: 1,
    at: null,            // a still: the share of tiles placed (0 … 1), no animation
  };
  const PALETTE = {
    dark: {
      ground: '#0b0b0e', ink: '232,230,223', edge: 'rgba(11,11,14,0.9)',
      // twelve shapes, thin to fat
      fill: ['#1c2044', '#243068', '#2d428c', '#3a5aae', '#4b76c6', '#6a95d4', '#92b3de', '#bcc9e0', '#dccdb3', '#e4b67d', '#dc934f', '#c76a2d'],
    },
    paper: {
      ground: '#f4f0e8', ink: '27,27,27', edge: 'rgba(27,27,27,0.55)',
      fill: ['#f1ece3', '#e8e1d2', '#dfd4bf', '#d4c6ab', '#c9b797', '#bca983', '#ae9a72', '#9f8b63', '#8f7b56', '#7e6b4a', '#6c5a3f', '#594a35'],
    },
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const W = 1000, H = 1000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

  // ───────────────────────── the tiling ─────────────────────────
  const E = [];
  for (let j = 0; j < N; j++) E.push({ x: Math.cos((2 * Math.PI * j) / N), y: Math.sin((2 * Math.PI * j) / N) });

  // The dual of the multigrid with offset c, within the window radius r: every rhombus as its
  // four vertices (in edge units), its shape (1 … 12) and the distance of its centre.
  function tiling(c, r) {
    const tiles = [];
    const K = Math.ceil(r + 1);
    const seen = new Map();                   // intersection points, to detect three lines meeting
    let degenerate = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const ei = E[i], ej = E[j], det = ei.x * ej.y - ei.y * ej.x;
      for (let ki = -K; ki <= K; ki++) for (let kj = -K; kj <= K; kj++) {
        const a = ki + c, b = kj + c;
        const px = (a * ej.y - b * ei.y) / det, py = (ei.x * b - ej.x * a) / det;
        if (px * px + py * py > r * r) continue;
        const key = Math.round(px * 1e6) + ',' + Math.round(py * 1e6);
        if (seen.has(key)) degenerate++; else seen.set(key, 1);
        // the indices of the regions around the crossing
        let vx = 0, vy = 0;
        for (let m = 0; m < N; m++) {
          if (m === i || m === j) continue;
          const km = Math.ceil(px * E[m].x + py * E[m].y - c);
          vx += km * E[m].x; vy += km * E[m].y;
        }
        const base = { x: vx + ki * ei.x + kj * ej.x, y: vy + ki * ei.y + kj * ej.y };
        const v = [base, { x: base.x + ei.x, y: base.y + ei.y }, { x: base.x + ei.x + ej.x, y: base.y + ei.y + ej.y }, { x: base.x + ej.x, y: base.y + ej.y }];
        const cx = base.x + (ei.x + ej.x) / 2, cy = base.y + (ei.y + ej.y) / 2;
        const d = j - i, shape = d <= 12 ? d : N - d;     // the difference of directions, 1 … 12
        tiles.push({ v, shape, d: Math.hypot(cx, cy) });
      }
    }
    tiles.sort((p, q) => p.d - q.d);
    return { tiles, degenerate };
  }
  // The seed's offset: away from 0 and ½ (where lines concur) and generic, retried if three
  // lines meet anywhere in the window.
  function offset(seed, r) {
    const rng = mulberry32(seed >>> 0);
    for (let tries = 0; tries < 20; tries++) {
      const c = 0.08 + rng() * 0.34;
      const T = tiling(c, r);
      if (!T.degenerate) return { c, T };
    }
    const c = 0.2731; return { c, T: tiling(c, r) };
  }

  // ───────────────────────── the piece ─────────────────────────
  function create(canvas, options) {
    const O = Object.assign({}, DEFAULTS, options || {});
    const ctx = canvas.getContext('2d');
    let pal = PALETTE.dark, scale = 1, ox = 0, oy = 0;
    let c = 0, tiles = [], placed = 0, drawn = 0, unit = 1, rim = 0;   // placed: the index reached; drawn: tiles on the sheet
    let sheet = null;                         // the tiling so far, drawn once per tile
    let phase = 'growing', phaseAt = 0, clock = 0, last = 0, raf = 0, resizeTimer = 0, acc = 0;

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
    function build() {
      const o = offset(O.seed, O.radius);
      c = o.c; tiles = o.T.tiles;
      // the disc the sheet shows: the tiling is whole out to about half its reach, ragged beyond
      const far = tiles.length ? tiles[tiles.length - 1].d : 1;
      rim = far * 0.62;
      unit = (H / 2 - 50) / rim;                // edge units → sheet units, with room for the caption
      placed = 0; drawn = 0;
    }
    // ── drawing ──
    function tilePath(cx, t) {
      cx.beginPath();
      for (let k = 0; k < 4; k++) {
        const x = W / 2 + t.v[k].x * unit, y = H / 2 - t.v[k].y * unit;
        if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      }
      cx.closePath();
    }
    function drawTile(cx, t) {
      tilePath(cx, t);
      cx.fillStyle = pal.fill[t.shape - 1]; cx.fill();
      if (O.edges) { cx.strokeStyle = pal.edge; cx.lineWidth = Math.max(0.6, unit * 0.045); cx.lineJoin = 'round'; cx.stroke(); }
    }
    function repaint() {
      const sc = sheet.getContext('2d');
      sc.setTransform(scale, 0, 0, scale, 0, 0);
      sc.clearRect(0, 0, W, H);
      sc.save(); sc.beginPath(); sc.arc(W / 2, H / 2, rim * unit, 0, Math.PI * 2); sc.clip();
      for (let i = 0; i < placed; i++) drawTile(sc, tiles[i]);
      sc.restore();
    }
    function place(n) {
      const sc = sheet.getContext('2d');
      sc.setTransform(scale, 0, 0, scale, 0, 0);
      sc.save(); sc.beginPath(); sc.arc(W / 2, H / 2, rim * unit, 0, Math.PI * 2); sc.clip();
      for (let i = 0; i < n && placed < tiles.length; i++, placed++) {
        if (tiles[placed].d > rim + 1.5) { placed = tiles.length; break; }   // beyond the rim: done
        drawTile(sc, tiles[placed]); drawn++;
      }
      sc.restore();
    }
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      // the sheet, turned while turning, fading while fading
      let angle = 0, alpha = 1;
      const t = clock - phaseAt;
      if (phase === 'turning') angle = ease(Math.min(1, t / O.turn)) * (2 * Math.PI / N);
      if (phase === 'fading') { angle = 2 * Math.PI / N; alpha = Math.max(0, 1 - t / 6); }
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(-angle); ctx.translate(-W / 2, -H / 2);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sheet, 0, 0, W, H);
      ctx.restore();
      if (O.caption) {
        ctx.fillStyle = 'rgba(' + pal.ink + ',0.55)'; ctx.font = '11px ' + MONO; ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText('25-fold · 12 rhombi · ' + drawn.toLocaleString('en-US') + ' tiles · the dual of 25 grids, offset ' + c.toFixed(4), 60, H - 24);
        ctx.textAlign = 'right';
        const note = phase === 'growing' ? 'growing from the centre' : phase === 'turning' ? 'turning through 14.4°, which changes nothing' : phase === 'resting' ? 'a symmetry no crystal can have' : 'another offset, the same symmetry';
        ctx.fillText(note, W - 60, H - 24);
      }
    }

    // ── time: growing → turning → resting → fading → growing ──
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      clock += dt;
      const t = clock - phaseAt;
      if (phase === 'growing') {
        acc += dt * O.rate;
        const n = Math.floor(acc); acc -= n;
        if (n) place(n);
        if (placed >= tiles.length) { phase = O.turn > 0 ? 'turning' : 'resting'; phaseAt = clock; }
      } else if (phase === 'turning') { if (t >= O.turn) { phase = 'resting'; phaseAt = clock; } }
      else if (phase === 'resting') { if (t >= O.hold) { phase = 'fading'; phaseAt = clock; } }
      else if (phase === 'fading') { if (t >= 6) { O.seed = (O.seed + 1) >>> 0; build(); repaint(); phase = 'growing'; phaseAt = clock; } }
      render();
    }

    // ── export ──
    function sheetPNG() {
      const cnv = document.createElement('canvas'), k = 2;
      cnv.width = W * k; cnv.height = H * k;
      const cx = cnv.getContext('2d');
      cx.fillStyle = pal.ground; cx.fillRect(0, 0, cnv.width, cnv.height);
      cx.setTransform(k, 0, 0, k, 0, 0);
      cx.save(); cx.beginPath(); cx.arc(W / 2, H / 2, rim * unit, 0, Math.PI * 2); cx.clip();
      for (let i = 0; i < placed; i++) drawTile(cx, tiles[i]);
      cx.restore();
      return cnv;
    }

    // ── public ──
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); render(); }, 120); }
    const api = {
      setOptions(o) { Object.assign(O, o); },
      reset() {
        pal = PALETTE[O.ground] || PALETTE.dark;
        cancelAnimationFrame(raf);
        build(); layout(); clock = 0; phaseAt = 0; acc = 0; phase = 'growing';
        if (O.at !== null) { placed = 0; drawn = 0; place(Math.floor(Math.max(0, Math.min(1, O.at)) * tiles.length)); phase = 'resting'; render(); }
        else { last = performance.now(); raf = requestAnimationFrame(frame); }
      },
      resize() { layout(); render(); },
      png: sheetPNG,
      tiles: () => tiles, offset: () => c,
      destroy() { cancelAnimationFrame(raf); clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); },
    };
    api.reset();
    window.addEventListener('resize', onResize);
    return api;
  }

  return { create, tiling, offset, DEFAULTS, N };
})();
