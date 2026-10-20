// boot: defaults, plus whatever the query string says
(function () {
  // the exhibition pacing: the guidelines ask for works made with about a minute in mind, so a
  // step every 2.5 s (≈ 24 steps in the first minute, both passes in ≈ 8 min) and a short rest
  const q = new URLSearchParams(location.search), o = { tempo: 2.5, hold: 20 };
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['reach', 'passes', 'tempo', 'hold', 'xMin', 'xMax', 'yMax', 'textSize', 'rayAlpha', 'lattice', 'caption'].forEach(num);
  ['mode', 'format', 'ground', 'labels'].forEach((k) => { if (q.get(k)) o[k] = q.get(k); });
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : (Math.random() * 4294967296) >>> 0;
  o.instant = q.get('still') === '1';
  const M = Mordell.create(document.getElementById('view'), o);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); M.togglePause(); }
    else if (e.key === 'ArrowRight') M.stepNow();
  });
})();
