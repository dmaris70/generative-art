// 049 — Grass Nocturne: the logbook. One A3 sheet per week of the homage, in single strokes for a
// pen plotter: the two crossings, their sixteen milestone terms, where each term was first danced.
// Everything is computed from the same functions the wall uses (weather.js, lexicon.js), so the
// sheet records what the meadow showed that week.
(function () {
  'use strict';
  const Wx = window.Weather, Geo = window.Geography, Lx = window.Lexicon;
  const cfg = Wx.parseSettings(new URLSearchParams(location.search));
  const WEEK = 7 * 864e5, PW = 420, PH = 297;           // A3 landscape, millimetres
  const $ = (id) => document.getElementById(id);
  let LEX = null, week = Math.max(0, Math.floor((Date.now() - cfg.start) / WEEK));
  const f1 = (v) => v.toFixed(2);

  // single-stroke text as one path
  function textPath(str, x, y, size, drop) {
    return Lx.text(str, x, y, size, drop).map((pl) => 'M' + pl.map((q) => f1(q.x) + ' ' + f1(q.y)).join('L')).join('');
  }
  const path = (d, w, extra) => `<path d="${d}" fill="none" stroke="#1d1e22" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra || ''}/>`;

  function sheet() {
    const trips = [2 * week, 2 * week + 1].map((n) => ({ n, path: Wx.tripPath(n, cfg.homes), ms: LEX.milestones(n), start: LEX.tripStart(n) }));
    // the frame of the map: both homes and both routes
    const pts = cfg.homes.map((h) => [h.lat, h.lon]);
    trips.forEach((t) => { for (let i = 0; i <= 80; i++) { const q = Wx.alongPath(t.path, i / 80); pts.push([q.lat, q.lon]); } });
    let la0 = Math.min(...pts.map((p) => p[0])), la1 = Math.max(...pts.map((p) => p[0])), lo0 = Math.min(...pts.map((p) => p[1])), lo1 = Math.max(...pts.map((p) => p[1]));
    if (lo1 - lo0 > 180) { lo0 = -180; lo1 = 180; }
    const mx0 = 15, my0 = 32, mw = 255, mh = 230;
    const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
    let wDeg = (lo1 - lo0) * k * 1.3 + 2, hDeg = (la1 - la0) * 1.3 + 2;
    if (wDeg / hDeg < mw / mh) wDeg = hDeg * mw / mh; else hDeg = wDeg * mh / mw;
    const cLat = (la0 + la1) / 2, cLon = (lo0 + lo1) / 2;
    const X = (lon) => mx0 + mw / 2 + ((lon - cLon) * k) / wDeg * mw, Y = (lat) => my0 + mh / 2 - (lat - cLat) / hDeg * mh;
    const inMap = (x, y) => x > mx0 && x < mx0 + mw && y > my0 && y < my0 + mh;
    const out = [];
    // coastlines: marching squares on the piece's own land mask
    const nx = 240, ny = Math.round(nx * mh / mw), L = [], segs = [];
    for (let j = 0; j <= ny; j++) { L.push([]); for (let i = 0; i <= nx; i++) { const lon = cLon + (i / nx - 0.5) * wDeg / k, lat = cLat + (0.5 - j / ny) * hDeg; L[j].push(Geo.isLand(Math.max(-89.9, Math.min(89.9, lat)), ((lon + 540) % 360) - 180) ? 1 : 0); } }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = L[j][i], b = L[j][i + 1], c = L[j + 1][i + 1], d = L[j + 1][i], e = [];
      if (a !== b) e.push([i + 0.5, j]); if (b !== c) e.push([i + 1, j + 0.5]); if (c !== d) e.push([i + 0.5, j + 1]); if (d !== a) e.push([i, j + 0.5]);
      const P = (p) => f1(mx0 + p[0] / nx * mw) + ' ' + f1(my0 + p[1] / ny * mh);
      if (e.length >= 2) segs.push('M' + P(e[0]) + 'L' + P(e[1])); if (e.length === 4) segs.push('M' + P(e[2]) + 'L' + P(e[3]));
    }
    out.push(path(segs.join(''), 0.18, ' opacity="0.55"'));
    out.push(path(`M${mx0} ${my0}h${mw}v${mh}h${-mw}Z`, 0.3));
    // the two crossings: there solid, back dashed
    trips.forEach((t, ti) => {
      let d = '', px = null;
      for (let i = 0; i <= 200; i++) { const q = Wx.alongPath(t.path, i / 200), x = X(q.lon), y = Y(q.lat); d += (px === null || Math.abs(x - px) > mw / 2 ? 'M' : 'L') + f1(x) + ' ' + f1(y); px = x; }
      out.push(path(d, 0.45, ti ? ' stroke-dasharray="2.2 1.6"' : ''));
      // the milestones: a numbered tick on the route, a thin line to where the term was first danced
      t.ms.forEach((m, i) => {
        const x = X(m.lon), y = Y(m.lat), lab = (ti ? 'B' : 'A') + (i + 1);
        out.push(path(`M${f1(x - 1.2)} ${f1(y)}L${f1(x + 1.2)} ${f1(y)}M${f1(x)} ${f1(y - 1.2)}L${f1(x)} ${f1(y + 1.2)}`, 0.35));
        out.push(path(textPath(lab, x + 1.6, y - (ti ? -1.2 : 3.6), 2.2), 0.22));
        const ox = X(m.term.lon), oy = Y(m.term.lat);
        if (inMap(ox, oy)) out.push(path(`M${f1(x)} ${f1(y)}L${f1(ox)} ${f1(oy)}M${f1(ox)} ${f1(oy - 1)}L${f1(ox + 1)} ${f1(oy)}L${f1(ox)} ${f1(oy + 1)}L${f1(ox - 1)} ${f1(oy)}Z`, 0.15, ' opacity="0.6"'));
      });
    });
    // the homes
    cfg.homes.forEach((h) => {
      const x = X(h.lon), y = Y(h.lat);
      out.push(path(`M${f1(x + 2)} ${f1(y)}A2 2 0 1 0 ${f1(x - 2)} ${f1(y)}A2 2 0 1 0 ${f1(x + 2)} ${f1(y)}`, 0.4));
      out.push(path(textPath((h.short ? h.short + ' - ' : '') + h.name, x + 3, y - 1.4, 2.8), 0.28));
    });
    // the title and the lists
    const d0 = new Date(cfg.start + week * WEEK), iso = d0.toISOString().slice(0, 10);
    out.push(path(textPath('THE LEXICON OF THE JOURNEY - WEEK ' + (week + 1) + ' - FROM ' + iso, 15, 14, 5), 0.4));
    out.push(path(textPath('GRASS NOCTURNE - A HOMAGE TO THE ROYAL BALLET SCHOOL AND THE CENTRE FOR DANCE STUDIES', 15, 23, 2.6), 0.25));
    let y = 32;
    trips.forEach((t, ti) => {
      out.push(path(textPath((ti ? 'B - ' : 'A - ') + t.path.from.name + ' TO ' + t.path.to.name + ' - ' + Math.round(t.path.km).toLocaleString('en') + ' KM - ' + t.path.label, 282, y, 2.8), 0.3)); y += 6;
      out.push(path(textPath(new Date(t.start).toISOString().slice(0, 16).replace('T', ' ') + ' UTC, 12 HOURS', 282, y, 2.1), 0.2)); y += 5.5;
      t.ms.forEach((m, i) => {
        const T = m.term;
        out.push(path(textPath((i + 1) + ' ' + T.t, 282, y, 2.8), 0.28));
        out.push(path(textPath(T.gr, 350, y + 0.6, 2.2), 0.22)); y += 4.4;
        out.push(path(textPath(T.place + ', ' + Lx.yearWords(T.year) + ' - ' + T.status.toUpperCase(), 286, y, 1.9), 0.18)); y += 5.2;
      });
      y += 4;
    });
    out.push(path(textPath('DRAFT LEXICON FOR REVIEW BY BOTH SCHOOLS - PLOTTED IN SINGLE STROKES', 15, 282, 2.2), 0.2));
    out.push(path(textPath('A ROUTE THERE, B ROUTE BACK (DASHED) - CROSS: A MILESTONE - DIAMOND: WHERE THE TERM WAS FIRST DANCED', 15, 287, 2.2), 0.2));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#f4f1ea"/>${out.join('')}</svg>`;
  }
  function draw() {
    if (!LEX || !Geo.ready()) return;
    $('sheet').innerHTML = sheet();
    $('day').value = new Date(cfg.start + week * WEEK).toISOString().slice(0, 10);
    $('status').textContent = 'week ' + (week + 1) + ' of the homage';
  }
  $('day').addEventListener('change', () => { const t = Date.parse($('day').value + 'T12:00:00Z'); if (!isNaN(t)) { week = Math.max(0, Math.floor((t - cfg.start) / WEEK)); draw(); } });
  $('prev').onclick = () => { week = Math.max(0, week - 1); draw(); };
  $('next').onclick = () => { week++; draw(); };
  $('save').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('sheet').innerHTML], { type: 'image/svg+xml' }));
    a.download = 'grass-nocturne-logbook-week-' + (week + 1) + '.svg'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  Promise.all([Geo.fetchData(new URL('data/', location.href).href), fetch('data/lexicon.json').then((r) => r.json())])
    .then(([, d]) => { LEX = Lx.create(d, { Wx, cfg }); draw(); })
    .catch((e) => { $('status').textContent = 'could not load: ' + e.message; });
})();
