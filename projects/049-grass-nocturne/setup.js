// 049 — Grass Nocturne: the setup page. A world map from the piece's own data; click to choose.
(function () {
  'use strict';
  const Wx = window.Weather, Geo = window.Geography;
  const $ = (id) => document.getElementById(id);
  const cv = $('map'), cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const HELP = {
    journey: 'Click the place it starts from — the office, for example. It leaves eastward, goes once round the earth, and is home again after one circuit.',
    place: 'Click one place. The meadow stays there: its live weather, its sun, its ground, permanently.',
    route: 'Click places in order. The meadow travels between them along great circles and back to the first, once per circuit.',
    parallel: 'Click a place: the meadow circles the earth along that latitude, starting there. Its sun and seasons stay alike; the ground changes.',
  };
  let mode = 'journey', pts = [], base = null;
  // the piece beside this page, or the gallery's copy when this page is opened elsewhere
  const PIECE = /049-grass-nocturne\/[^/]*$/.test(location.pathname) ? new URL('./', location.href).href
    : 'https://dmaris70.github.io/generative-art/projects/049-grass-nocturne/';

  const toXY = (lat, lon) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  const toLL = (x, y) => ({ lat: Math.round((90 - y / H * 180) * 100) / 100, lon: Math.round((x / W * 360 - 180) * 100) / 100 });

  // ── the map, drawn once from the grid: land by height, sea by depth from the coast, borders
  function drawBase() {
    const img = cx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const lat = 90 - (y + 0.5) / 4, lon = (x + 0.5) / 4 - 180, g = Geo.at(lat, lon), o = (y * W + x) * 4;
      let r, gg, b;
      if (g.land) {
        const e = Math.min(1, g.elev / 3500); r = 58 + 90 * e; gg = 60 + 80 * e; b = 56 + 64 * e;
        const right = Geo.at(lat, lon + 0.25), down = Geo.at(lat - 0.25, lon);
        if ((right.land && right.country !== g.country) || (down.land && down.country !== g.country)) { r = gg = b = 30; }
      } else { const k = Math.min(1, -g.coastKm / 600); r = 18 - 6 * k; gg = 26 - 8 * k; b = 34 - 6 * k; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    base = img;
  }
  function settings() {
    const q = new URLSearchParams(), days = Math.max(1, +$('days').value || 365), start = $('start').value;
    const f = (p) => p.lat.toFixed(2) + ',' + p.lon.toFixed(2);
    if (mode === 'journey' && pts[0]) q.set('from', f(pts[0]));
    if (mode === 'place' && pts[0]) q.set('place', f(pts[0]));
    if (mode === 'route' && pts.length) q.set('route', pts.map(f).join(';'));
    if (mode === 'parallel' && pts[0]) { q.set('lat', pts[0].lat.toFixed(2)); q.set('from', f(pts[0])); }
    if (mode !== 'place') { if (Math.abs(days - 365) > 0.5) q.set('days', String(days)); if (start && start !== '2026-11-01') q.set('start', start); }
    if (!$('hud').checked) q.set('hud', '0');
    if (!$('paper').checked) q.set('paper', '0');
    return q;
  }
  function render() {
    $('help').textContent = HELP[mode];
    $('undo').hidden = mode !== 'route';
    $('coords').value = pts.map((p) => p.lat.toFixed(2) + ',' + p.lon.toFixed(2)).join(';');
    if (base) cx.putImageData(base, 0, 0);
    const q = settings(), T = Wx.track(Wx.parseSettings(q)), cfg = T.cfg, days = cfg.days;
    // the circuit
    let sea = 0, n = 0, km = 0, prev = null, last = '';
    const seen = [];
    cx.lineWidth = 2; cx.strokeStyle = 'rgba(127, 201, 214, 0.9)'; cx.beginPath();
    const N = cfg.mode === 'place' ? 1 : 1200;
    for (let i = 0; i <= N; i++) {
      const p = T(cfg.start + (i / N) * days * 864e5);
      const [x, y] = toXY(p.lat, p.lon);
      if (prev && Math.abs(p.lon - prev.lon) < 180) cx.lineTo(x, y); else cx.moveTo(x, y);
      if (prev) km += Geo.haversine(prev.lat, prev.lon, p.lat, p.lon);
      if (base && i < N) { const g = Geo.at(p.lat, p.lon); n++; if (!g.land) sea++; else if (g.country !== last) { if (!seen.includes(g.country)) seen.push(g.country); last = g.country; } if (!g.land) last = ''; }
      prev = p;
    }
    cx.stroke();
    // the chosen points and where it is now
    for (const [i, p] of pts.entries()) {
      const [x, y] = toXY(p.lat, p.lon);
      cx.fillStyle = '#d8b48a'; cx.beginPath(); cx.arc(x, y, 7, 0, Math.PI * 2); cx.fill();
      if (mode === 'route') { cx.fillStyle = '#101113'; cx.font = 'bold 10px ui-sans-serif, system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(i + 1), x, y + 0.5); }
    }
    const now = T(Date.now()), [nx, ny] = toXY(now.lat, now.lon);
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(nx, ny, 10, 0, Math.PI * 2); cx.stroke();
    // the numbers
    if (base) {
      const g = Geo.at(now.lat, now.lon);
      $('sNow').textContent = g.land ? g.country : g.sea;
      $('sSea').textContent = cfg.mode === 'place' ? (g.land ? 'land' : 'sea') : Math.round(sea / n * 100) + '%';
      $('sKm').textContent = cfg.mode === 'place' ? '0' : Math.round(km).toLocaleString();
      $('sCount').textContent = cfg.mode === 'place' ? '–' : String(seen.length);
      $('countries').textContent = cfg.mode === 'place' ? '' : seen.length ? 'In order: ' + seen.join(' · ') : 'Only sea on this circuit.';
    }
    // the address
    const url = new URL(PIECE); url.search = q.toString();
    const href = url.href.replace(/%2C/g, ',').replace(/%3B/g, ';');
    $('url').textContent = href; $('open').href = href;
  }

  // ── input
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { mode = r.value; if (mode !== 'route') pts = pts.slice(0, 1); render(); }));
  function eventLL(e) { const r = cv.getBoundingClientRect(); return toLL((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H); }
  cv.addEventListener('click', (e) => { const p = eventLL(e); if (mode === 'route') pts.push(p); else pts = [p]; render(); });
  cv.addEventListener('mousemove', (e) => {
    const p = eventLL(e), g = base ? Geo.at(p.lat, p.lon) : null;
    $('hover').textContent = p.lat.toFixed(2) + ', ' + p.lon.toFixed(2) + (g ? ' · ' + (g.land ? g.country + ' · ' + Math.round(g.elev) + ' m' : g.sea) : '');
  });
  $('coords').addEventListener('change', () => {
    pts = $('coords').value.split(';').map((s) => s.split(',').map(Number)).filter((a) => a.length === 2 && a.every(isFinite)).map(([lat, lon]) => ({ lat, lon }));
    if (mode !== 'route') pts = pts.slice(0, 1);
    render();
  });
  for (const id of ['days', 'start', 'hud', 'paper']) $(id).addEventListener('change', render);
  $('undo').addEventListener('click', () => { pts.pop(); render(); });
  $('clear').addEventListener('click', () => { pts = []; render(); });
  $('copy').addEventListener('click', () => {
    const t = $('url').textContent, done = () => { $('copied').hidden = false; setTimeout(() => { $('copied').hidden = true; }, 1500); };
    navigator.clipboard ? navigator.clipboard.writeText(t).then(done, () => { getSelection().selectAllChildren($('url')); }) : getSelection().selectAllChildren($('url'));
  });

  // start from the address this page was opened with, if any
  const q0 = new URLSearchParams(location.search), c0 = Wx.parseSettings(q0);
  if (q0.has('from') || q0.has('place') || q0.has('route') || q0.has('lat')) {
    mode = c0.mode; document.querySelector('input[name=mode][value=' + mode + ']').checked = true;
    pts = c0.mode === 'place' ? [c0.place] : c0.mode === 'route' ? c0.route : c0.from ? [c0.from] : c0.mode === 'parallel' ? [{ lat: c0.lat, lon: c0.fromLon }] : [];
    if (q0.has('days')) $('days').value = q0.get('days');
    if (q0.has('start')) $('start').value = q0.get('start');
  }
  render();
  Geo.fetchData(new URL('data/', location.href).href).then(() => { drawBase(); render(); $('hover').textContent = 'click to choose'; })
    .catch((e) => { $('hover').textContent = 'map data missing — ' + e.message; });
})();
