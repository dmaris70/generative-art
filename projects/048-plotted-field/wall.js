// 048 — Plotted Field, the wall: a pen drawing the field, in real plotting order, locked to the clock.
//
// Every hour of local time is one sheet: views 1 … 25 of a field, then its map, then the next
// field — a 26-hour cycle, so the same view never falls at the same hour two days running.
// Within the hour the pen draws for `draw` minutes, the finished sheet rests, and it fades out
// at the hour. Where the pen is follows from the clock alone: a restart, a second screen or a
// power cut all come back to the same stroke.
//
// URL: ?field=N (keep one field; default: a new field every 26 h) · ?slot=60 (minutes a sheet)
//      ?draw=50 (minutes drawing) · ?ink=light|paper · ?dim=19-22:0.6,22-7:0.35 · ?reload=4
//      ?hud=0 · ?at=2026-11-02T14:20 & ?speed=60 (rehearsal: start the clock there, run it faster)
(function (global) {
  'use strict';

  const CYCLE = 26;                                     // 25 views and the map
  const PACE = { draw: 25, travel: 75, lift: 0.15, penChange: 20 };   // mm/s, mm/s, s per lift, s
  const INKS = {
    light: { ground: '#0d0e10', pen1: '#ddd7ca', pen2: '#c9925c', marker: '#ffffff' },   // the LED wall
    paper: { ground: '#f3efe6', pen1: '#1b1a1f', pen2: '#7a4b2c', marker: '#000000' },
  };

  // ───────────────────────── the schedule (pure; tested in Node) ─────────────────────────
  function localMs(ms) { return ms - new Date(ms).getTimezoneOffset() * 60000; }
  function slotAt(ms, o) {
    const len = o.slot * 60000, local = localMs(ms);
    const n = Math.floor(local / len), into = (local - n * len) / 1000;
    const pos = ((n % CYCLE) + CYCLE) % CYCLE, round = Math.floor(n / CYCLE);
    const seed = o.field ? o.field : 1 + (((round % 9973) + 9973) % 9973);
    return { n, into, seed, kind: pos === CYCLE - 1 ? 'map' : 'view', view: pos + 1, start: ms - into * 1000, length: o.slot * 60 };
  }
  function dimAt(ms, spec) {
    const h = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
    for (const part of String(spec || '').split(',')) {
      const m = part.match(/^\s*(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):(\d*\.?\d+)\s*$/);
      if (!m) continue;
      const a = +m[1], b = +m[2], v = +m[3];
      if (a <= b ? h >= a && h < b : h >= a || h < b) return v;
    }
    return 1;
  }

  // When each stroke starts and ends at a real plotter's pace (s): travel with the pen up, lower,
  // draw, lift; a pause to change pens between layers of different pens.
  function timeline(layers) {
    const items = [];
    let t = 0, px = 0, py = 0, pen = layers.length ? layers[0].pen : 1;
    for (const layer of layers) {
      if (layer.pen !== pen && layer.strokes.length) { t += PACE.penChange; pen = layer.pen; }
      for (const s of layer.strokes) {
        const travel = Math.hypot(s[0] - px, s[1] - py);
        const from = [px, py], t0 = t;
        t += travel / PACE.travel + PACE.lift;
        const lens = [0];
        for (let k = 2; k < s.length; k += 2) lens.push(lens[lens.length - 1] + Math.hypot(s[k] - s[k - 2], s[k + 1] - s[k - 1]));
        const len = lens[lens.length - 1], start = t;
        t += len / PACE.draw + PACE.lift;
        items.push({ s, pen: layer.pen, from, travelStart: t0, start, end: start + len / PACE.draw, lens, len });
        px = s[s.length - 2]; py = s[s.length - 1];
      }
    }
    return { items, total: t };
  }
  // the index of the first item whose end is after τ
  function firstOpen(items, tau) {
    let lo = 0, hi = items.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (items[mid].end <= tau) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function pointAlong(it, f) {                          // f ∈ [0,1] of the stroke's length
    const d = f * it.len, s = it.s, L = it.lens;
    let k = 1; while (k < L.length - 1 && L[k] < d) k++;
    const a = L[k - 1], b = L[k], u = b > a ? (d - a) / (b - a) : 0;
    return [s[(k - 1) * 2] + (s[k * 2] - s[(k - 1) * 2]) * u, s[(k - 1) * 2 + 1] + (s[k * 2 + 1] - s[(k - 1) * 2 + 1]) * u, k];
  }

  const api = { slotAt, dimAt, timeline, firstOpen, pointAlong, PACE, CYCLE, INKS };
  global.PlottedWall = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ───────────────────────── the screen ─────────────────────────
  const Q = new URLSearchParams(location.search), num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const O = {
    field: num('field', 0) >>> 0, slot: Math.max(5, num('slot', 60)), draw: num('draw', 50), ink: INKS[Q.get('ink')] ? Q.get('ink') : 'light',
    dim: Q.has('dim') ? Q.get('dim') : '19-22:0.6,22-7:0.35', reload: num('reload', 4), hud: Q.get('hud') !== '0',
    speed: Math.max(1, num('speed', 1)), pen: num('pen', 0.3),
  };
  O.draw = Math.min(O.draw, O.slot - 1);
  const t0Real = Date.now(), t0Wall = Q.has('at') && !isNaN(Date.parse(Q.get('at'))) ? Date.parse(Q.get('at')) : t0Real;
  const now = () => t0Wall + (Date.now() - t0Real) * O.speed;
  const C = INKS[O.ink];

  const stage = document.getElementById('stage'), base = document.getElementById('base'), over = document.getElementById('over');
  const hud = document.getElementById('hud'), bx = base.getContext('2d'), ox = over.getContext('2d');
  document.documentElement.style.setProperty('--ground', C.ground);
  hud.hidden = !O.hud;

  // the sheet, built in a worker when possible
  const scripts = [...document.querySelectorAll('script[data-engine]')].map((s) => new URL(s.getAttribute('src'), location.href).href);
  let worker = null, pending = new Map(), ids = 0;
  try {
    worker = new Worker(new URL('wall-worker.js', document.currentScript ? document.currentScript.src : location.href));
    worker.postMessage({ scripts });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    worker.onerror = () => { worker = null; };
  } catch (err) { worker = null; }
  function buildSheet(slot) {
    // the wind is frozen at the moment the pen lifts, `draw` minutes into the hour
    const options = { seed: slot.seed, view: slot.view, sheet: 'W16x9', instant: Math.round(O.draw * 60) % 3600 };
    const kind = slot.kind;
    if (worker) return new Promise((res) => { const id = ++ids; pending.set(id, res); worker.postMessage({ id, kind, options }); });
    const PF = global.PlottedField, r = kind === 'map' ? PF.buildMap(options) : PF.build(options);
    return Promise.resolve({ kind: r.kind, sheet: r.sheet, stats: r.stats, view: r.camera ? r.camera.view : 0, eye: r.camera ? r.camera.height : 0,
      layers: r.layers.map((l) => ({ id: l.id, pen: l.pen, strokes: PF.orderStrokes(l.strokes) })) });
  }

  // ── layout: the 16:9 sheet fills the screen (letterboxed if the screen is not 16:9)
  let k = 1, offX = 0, offY = 0, W = 0, H = 0, dpr = 1;
  function layout(sheet) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    for (const c of [base, over]) { c.width = W; c.height = H; }
    k = Math.min(W / sheet.w, H / sheet.h); offX = (W - sheet.w * k) / 2; offY = (H - sheet.h * k) / 2;
    bx.fillStyle = C.ground; bx.fillRect(0, 0, W, H);
  }
  const lw = () => Math.max(1, O.pen * k);
  function strokeTo(ctx, it, upto) {                    // the whole stroke, or up to fraction `upto`
    const s = it.s;
    ctx.strokeStyle = it.pen === 2 ? C.pen2 : C.pen1;
    ctx.beginPath(); ctx.moveTo(offX + s[0] * k, offY + s[1] * k);
    if (upto >= 1) { for (let i = 2; i < s.length; i += 2) ctx.lineTo(offX + s[i] * k, offY + s[i + 1] * k); }
    else {
      const [x, y, seg] = pointAlong(it, upto);
      for (let i = 1; i < seg; i++) ctx.lineTo(offX + s[i * 2] * k, offY + s[i * 2 + 1] * k);
      ctx.lineTo(offX + x * k, offY + y * k);
    }
    ctx.stroke();
  }

  // ── the hour
  let cur = null, next = null, done = 0;
  async function enter(slot) {
    const data = await buildSheet(slot);
    if (slotAt(now(), O).n !== slot.n) return;          // the hour moved on while building
    const tl = timeline(data.layers);
    cur = { slot, data, tl, scale: tl.total / (O.draw * 60) };     // real plotter seconds per wall second
    done = 0; layout(data.sheet);
    for (const c of [bx, ox]) { c.lineCap = 'round'; c.lineJoin = 'round'; }
    bx.lineWidth = ox.lineWidth = lw();
  }
  function frame() {
    const t = now(), slot = slotAt(t, O);
    if (!cur || cur.slot.n !== slot.n) {
      if (!next || next.n !== slot.n) { next = slot; stage.style.opacity = 0; enter(slot); }
      if (!cur || cur.slot.n !== slot.n) { requestAnimationFrame(frame); return; }
    }
    const { tl, data, scale } = cur, into = (t - cur.slot.start) / 1000;
    const tau = Math.min(tl.total, into * scale);
    // newly finished strokes onto the base; a jump (load mid-hour, hidden tab) draws them all at once
    bx.lineWidth = lw();
    const upto = firstOpen(tl.items, tau);
    for (; done < upto; done++) strokeTo(bx, tl.items[done], 1);
    ox.clearRect(0, 0, W, H);
    let pen = null, down = false;
    if (upto < tl.items.length && tau < tl.total) {
      const it = tl.items[upto];
      ox.lineWidth = lw(); ox.lineCap = 'round'; ox.lineJoin = 'round';
      if (tau >= it.start) { const f = (tau - it.start) / Math.max(1e-6, it.end - it.start); strokeTo(ox, it, f); pen = pointAlong(it, f); down = true; }
      else {
        const f = Math.min(1, Math.max(0, (tau - it.travelStart) / Math.max(1e-6, it.start - it.travelStart)));
        pen = [it.from[0] + (it.s[0] - it.from[0]) * f, it.from[1] + (it.s[1] - it.from[1]) * f];
      }
      ox.fillStyle = C.marker; ox.globalAlpha = down ? 0.9 : 0.35;
      ox.beginPath(); ox.arc(offX + pen[0] * k, offY + pen[1] * k, Math.max(2, 0.9 * k), 0, Math.PI * 2); ox.fill(); ox.globalAlpha = 1;
    }
    // fade in over the first 4 s of the hour, out over the last 30 s
    const left = cur.slot.length - into;
    stage.style.opacity = String(Math.min(1, into / 4, left / 30) * dimAt(t, O.dim));
    if (O.hud) {
      const label = data.kind === 'map' ? 'THE MAP OF THE 25 VIEWS' : 'VIEW ' + data.view + ' OF 25 · EYE ' + data.eye.toFixed(2) + ' M';
      const hh = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      hud.textContent = 'FIELD ' + cur.slot.seed + ' · ' + label + ' · ' + hh(new Date(cur.slot.start)) + '–' + hh(new Date(cur.slot.start + cur.slot.length * 1000))
        + ' · ' + upto.toLocaleString() + ' / ' + tl.items.length.toLocaleString() + ' STROKES · ' + (tau >= tl.total ? 'AT REST' : scale.toFixed(1) + '× A PLOTTER\'S PACE');
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { if (cur) { layout(cur.data.sheet); done = 0; } });
  // a fresh page once a night: the clock brings it back to the same stroke
  if (O.reload >= 0 && O.speed === 1) {
    const d = new Date(); d.setHours(O.reload, 7, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
    setTimeout(() => location.reload(), d - new Date());
  }
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : globalThis);
