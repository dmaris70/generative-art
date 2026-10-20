// boot for the neort.io bundle: Tokyo time, 10:00 → 16:12:49 JST; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = {};
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['rate', 'hold', 'caption', 'at'].forEach(num);
  ['clock', 'start', 'order', 'ground'].forEach((k) => { if (q.get(k)) o[k] = q.get(k); });
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : 1;
  Icons.create(document.getElementById('view'), o);
})();
