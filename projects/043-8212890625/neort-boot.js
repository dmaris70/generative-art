// boot for the neort.io bundle: ink on paper, a row every 0.4 s; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = {};
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['beat', 'pause', 'size', 'hand', 'header', 'at'].forEach(num);
  if (q.get('ground')) o.ground = q.get('ground');
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : (Math.random() * 4294967296) >>> 0;
  Receipt.create(document.getElementById('view'), o);
})();
