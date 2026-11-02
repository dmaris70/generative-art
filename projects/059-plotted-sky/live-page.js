// 059 — Plotted Sky, live: the page. Keys: space pause · H hide · S save SVG of this instant.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fail = (m) => { $('err').textContent = '⚠ ' + m; $('err').hidden = false; };
  addEventListener('error', (e) => fail(e.message));
  const q = new URLSearchParams(location.search);
  for (const [k, id] of [['seed', 'seed'], ['view', 'view-n'], ['weather', 'weather'], ['wind', 'wind'], ['speed', 'speed'], ['look', 'look']]) if (q.has(k)) $(id).value = q.get(k);
  const gl = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
  let L;
  try { L = PlottedLive.create(gl); } catch (e) { fail(e.message); return; }

  const SKY_PERIOD = 60;                       // s for the deck to go round 058's drift path once, as 058's Drift
  let dirty = true, info = null, opts = null, clock = 0, last = performance.now(), paused = q.has('t'), frames = 0, fpsT = performance.now(), fps = 0, layout = null;
  if (q.has('t')) clock = +q.get('t');

  function settings() {
    return { seed: Math.max(1, +$('seed').value | 0), view: Math.min(25, Math.max(1, +$('view-n').value | 0)), instant: 1200,
      look: $('look').value, wind: +$('wind').value, body: q.has('body') ? +q.get('body') : 1.6, light: q.has('light') ? +q.get('light') : 0.35, sky: true, skyOpts: { weather: Math.min(48, Math.max(0, +$('weather').value | 0)), invert: $('look').value !== 'positive' } };
  }
  function rebuild() {
    opts = settings();
    document.body.classList.toggle('dark', opts.look === 'dark');
    $('status').textContent = 'planting field ' + opts.seed + ', view ' + opts.view + '…';
    setTimeout(() => {
      try { info = L.setup(opts); } catch (e) { fail(e.message); return; }
      const u = new URL(location.href); u.search = new URLSearchParams({ seed: opts.seed, view: opts.view, weather: opts.skyOpts.weather, wind: opts.wind, speed: $('speed').value, look: opts.look }).toString(); history.replaceState(null, '', u);
      size();
    }, 20);
  }
  // the sheet fitted to the stage; the frame inside it is where the GPU draws
  function size() {
    if (!info) return;
    const st = $('stage').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const k = Math.min((st.width - 32) / info.sheet.w, (st.height - 16) / info.sheet.h);      // css px per mm
    const W = Math.round(info.sheet.w * k), H = Math.round(info.sheet.h * k);
    for (const c of [gl, ov]) { c.style.width = W + 'px'; c.style.height = H + 'px'; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const pxmm = k * dpr, f = info.frame;
    dirty = true;
    layout = { pxmm, px: Math.round(f.x * pxmm), py: Math.round((info.sheet.h - f.y - f.h) * pxmm), pw: Math.round(f.w * pxmm), ph: Math.round(f.h * pxmm) };
    // the caption and inset map: static, drawn once on the overlay
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.width, ov.height);
    octx.strokeStyle = PlottedSky.look(opts.look).ink; octx.lineWidth = Math.max(0.6, 0.3 * pxmm); octx.lineCap = 'round'; octx.beginPath();
    // keep the title line and the inset map; the other caption lines give the numbers of one frozen
    // instant, which the live sheet does not have (the status line shows the live ones)
    const top = f.y + f.h, fs = Math.max(2.4, info.sheet.w * 0.0075), line1 = top + fs * 2.2 + fs * 1.45, insetX = f.x + f.w - 0.08 * info.sheet.w;
    for (const s of info.caption ? info.caption.strokes : []) {
      let maxY = -1e9, minX = 1e9; for (let i = 0; i < s.length; i += 2) { maxY = Math.max(maxY, s[i + 1]); minX = Math.min(minX, s[i]); }
      if (maxY > line1 && minX < insetX) continue;
      octx.moveTo(s[0] * pxmm, s[1] * pxmm); for (let i = 2; i < s.length; i += 2) octx.lineTo(s[i] * pxmm, s[i + 1] * pxmm);
    }
    octx.stroke();
  }
  function now() { return { t: opts.instant + clock, u: ((clock / SKY_PERIOD) % 1 + 1) % 1 }; }
  function tick(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    if (!paused) clock += dt * +$('speed').value;
    if (info && layout && (!paused || dirty)) {
      dirty = false;
      const { t, u } = now();
      L.render(t, u, layout, paused ? 1 : 2);
      frames++;
      if (ts - fpsT > 1000) { fps = frames * 1000 / (ts - fpsT); frames = 0; fpsT = ts; }
      $('status').textContent = 'field ' + opts.seed + ' · view ' + opts.view + ' · ' + info.blades.toLocaleString() + ' blades, ' + info.heads + ' seed heads · weather ' + opts.skyOpts.weather
        + ' · ' + (paused ? 'paused' : fps.toFixed(0) + ' fps') + ' · gust ' + (((t * 1.25) / (2 * Math.PI)) % 1).toFixed(2) + ' · deck ' + u.toFixed(3) + ' of its drift';
    }
    requestAnimationFrame(tick);
  }
  function saveSVG() {
    if (!info) return;
    const { t, u } = now();
    const r = L.exportSheet(t, u);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([PlottedSky.svgLook(PlottedField.svg(r), opts.look)], { type: 'image/svg+xml' }));
    a.download = 'plotted-sky-' + opts.seed + '-view-' + opts.view + (opts.look === 'positive' ? '' : '-' + opts.look) + '-live-t' + t.toFixed(2) + '-deck' + u.toFixed(3) + '.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('go').onclick = rebuild;
  // a new draw of the field, view, weather and wind (generate.js); speed is left as it is
  function generate() {
    const g = PlottedSkyGenerate.draw();
    $('seed').value = g.field; $('view-n').value = g.view; $('weather').value = g.weather; $('wind').value = g.wind;
    clock = 0; rebuild();
  }
  $('gen').onclick = generate;
  $('look').onchange = rebuild;
  $('wind').oninput = () => { if (opts) opts.wind = +$('wind').value; dirty = true; };
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
  $('svg').onclick = saveSVG;
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { $('pause').click(); e.preventDefault(); }
    else if (e.key === 'h' || e.key === 'H') { document.body.classList.toggle('bare'); size(); }
    else if (e.key === 's' || e.key === 'S') saveSVG();
    else if (e.key === 'g' || e.key === 'G') generate();
  });
  addEventListener('resize', size);
  rebuild();
  requestAnimationFrame(tick);
})();
