// boot for the neort.io bundle: the canonical shelving, 8 programs a second; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = {};
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['rate', 'from', 'fade', 'at'].forEach(num);
  if (q.get('ground')) o.ground = q.get('ground');
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : 1;
  Babel.create(document.getElementById('view'), o);
})();
