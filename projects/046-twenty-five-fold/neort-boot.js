// boot for the neort.io bundle: a tile a frame from the centre, then the turn; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = { radius: 4 };
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['radius', 'rate', 'turn', 'hold', 'edges', 'caption', 'at'].forEach(num);
  if (q.get('ground')) o.ground = q.get('ground');
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : (Math.random() * 4294967296) >>> 0;
  Fold.create(document.getElementById('view'), o);
})();
