// 059 — Plotted Sky in motion: the page. Frames are built by a pool of workers and played as a
// loop as soon as the first ones arrive. Keys: space pause · H hide · B build.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PM = window.PlottedMotion, PF = window.PlottedField;
  const canvas = $('view'), ctx = canvas.getContext('2d');
  const q = new URLSearchParams(location.search);
  for (const [k, id] of [['seed', 'seed'], ['view', 'view-n'], ['weather', 'weather'], ['gusts', 'gusts'], ['fps', 'fps'], ['mode', 'mode']]) if (q.has(k)) $(id).value = q.get(k);

  const scripts = ['../../assets/strokefont.js?v=1', '../048-plotted-field/field.js?v=6', 'sky.js?v=3', 'motion.js?v=1'].map((s) => new URL(s, location.href).href);
  const POOL = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1));
  let workers = [], job = 0, frames = [], n = 0, ready = 0, sheet = null, caption = null, paused = false, still = null, t0 = 0, fps = 8, built = 0, msSum = 0;

  function makeWorkers() {
    if (workers.length) return;
    for (let i = 0; i < POOL; i++) {
      const w = new Worker('motion-worker.js?v=1'); w.postMessage({ scripts });
      w.onmessage = (e) => onFrame(e.data, w); workers.push(w);
    }
  }
  function settings() {
    return { base: { seed: Math.max(1, +$('seed').value | 0), view: Math.min(25, Math.max(1, +$('view-n').value | 0)), instant: 1200 },
      sky: { weather: Math.min(48, Math.max(0, +$('weather').value | 0)) }, gusts: +$('gusts').value, fps: +$('fps').value };
  }
  function syncURL() {
    const S = settings(), u = new URL(location.href);
    u.search = new URLSearchParams({ mode: $('mode').value, seed: S.base.seed, view: S.base.view, weather: S.sky.weather, gusts: S.gusts, fps: S.fps }).toString();
    history.replaceState(null, '', u);
  }

  let queue = [];
  function build() {
    syncURL();
    const S = settings();
    job++; frames = []; ready = 0; built = 0; msSum = 0; still = null; sheet = null; caption = null;
    if ($('mode').value === 'chronograph') {
      $('status').textContent = 'building three instants of one gust…';
      setTimeout(() => {
        const t = performance.now();
        still = PM.chronograph(S.base, S.sky, 3); sheet = still.sheet;
        $('status').textContent = 'chronograph · field ' + S.base.seed + ' · view ' + S.base.view + ' · 3 instants, ' + (PM.GUST / 3).toFixed(2) + ' s apart, in 3 pens · '
          + still.strokes.toLocaleString() + ' strokes · built in ' + Math.round(performance.now() - t) + ' ms';
        draw();
      }, 30);
      return;
    }
    makeWorkers();
    n = PM.frameCount(S.gusts, S.fps); fps = S.fps; frames = new Array(n);
    queue = Array.from({ length: n }, (_, k) => k);
    const msg = (k) => ({ job, k, n, base: S.base, sky: S.sky, gusts: S.gusts });
    workers.forEach((w) => { if (queue.length) w.postMessage(msg(queue.shift())); });
    workers.forEach((w) => (w.next = () => queue.length && w.postMessage(msg(queue.shift()))));
    t0 = performance.now();
    status();
  }
  function onFrame(m, w) {
    if (m.job !== job) return;
    frames[m.k] = m.layers; built++; msSum += m.ms;
    if (m.k === 0) { sheet = m.sheet; caption = m.layers.find((l) => l.id === 'caption'); }
    while (ready < n && frames[ready]) ready++;
    w.next();
    status();
  }
  function status() {
    const S = settings();
    const head = 'field ' + S.base.seed + ' · view ' + S.base.view + ' · weather ' + S.sky.weather + ' · ' + S.gusts + ' gusts = ' + PM.loopSeconds(S.gusts).toFixed(2) + ' s loop · ' + n + ' frames at ' + fps + ' fps';
    $('status').textContent = head + (built < n ? ' · building ' + built + '/' + n + ' on ' + POOL + ' workers (≈' + (msSum / Math.max(1, built) / 1000).toFixed(1) + ' s a frame)' : ' · all frames built');
  }

  // ── drawing
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    return { dpr, W, H };
  }
  function frame(layers, k, ox, oy, scale) {
    for (const l of layers) {
      if (l.id === 'caption') continue;
      ctx.strokeStyle = l.pen === 2 ? PF.INKS.sepia : PF.INKS.black;
      ctx.beginPath();
      let s = 0;
      for (const e of l.ends) {
        ctx.moveTo(ox + l.xy[s] * scale, oy + l.xy[s + 1] * scale);
        for (let i = s + 2; i < e; i += 2) ctx.lineTo(ox + l.xy[i] * scale, oy + l.xy[i + 1] * scale);
        s = e;
      }
      ctx.stroke();
    }
  }
  function draw() {
    const { dpr, W, H } = fit();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#16161a'; ctx.fillRect(0, 0, W, H);
    if (!sheet) return;
    const k = Math.min((W - 40) / sheet.w, (H - 110) / sheet.h), ox = (W - sheet.w * k) / 2, oy = (H - 80 - sheet.h * k) / 2;
    ctx.fillStyle = '#f3efe6'; ctx.fillRect(ox, oy, sheet.w * k, sheet.h * k);
    ctx.lineWidth = Math.max(0.5, 0.3 * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (still) {
      for (const l of still.layers) {
        ctx.strokeStyle = PM.PEN_INKS[(l.pen - 1) % PM.PEN_INKS.length]; ctx.beginPath();
        for (const s of l.strokes) { ctx.moveTo(ox + s[0] * k, oy + s[1] * k); for (let i = 2; i < s.length; i += 2) ctx.lineTo(ox + s[i] * k, oy + s[i + 1] * k); }
        ctx.stroke();
      }
      return;
    }
    if (!ready) return;
    const idx = Math.floor(((performance.now() - t0) / 1000) * fps) % ready;
    frame(frames[idx], idx, ox, oy, k / 100);
    if (caption) frame([Object.assign({}, caption, { id: 'cap' })], 0, ox, oy, k / 100);
  }
  function tick() { if (!paused && !still) draw(); requestAnimationFrame(tick); }

  function saveSVG() {
    let text, name;
    const S = settings();
    if (still) { text = PM.chronographSVG(still); name = 'plotted-sky-' + S.base.seed + '-view-' + S.base.view + '-chronograph.svg'; }
    else {
      // the frame on screen, as a plottable sheet (rebuilt on the main thread)
      const idx = ready ? Math.floor(((performance.now() - t0) / 1000) * fps) % ready : 0;
      const r = PF.build(PM.frameOptions(S.base, S.sky, idx, n || 1, S.gusts));
      text = PF.svg(r); name = 'plotted-sky-' + S.base.seed + '-view-' + S.base.view + '-frame-' + idx + '-of-' + n + '.svg';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('go').onclick = build;
  $('mode').onchange = build;
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
  $('svg').onclick = saveSVG;
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') { $('pause').click(); e.preventDefault(); }
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('bare');
    else if (e.key === 'b' || e.key === 'B') build();
  });
  addEventListener('resize', () => still && draw());
  build();
  requestAnimationFrame(tick);
})();
