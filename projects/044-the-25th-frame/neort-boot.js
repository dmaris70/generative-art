// boot for the neort.io bundle: live, light on dark; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = {};
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['cell', 'take', 'gap', 'size', 'wander', 'contrast', 'expose', 'caption'].forEach(num);
  ['figure', 'ground'].forEach((k) => { if (q.get(k)) o[k] = q.get(k); });
  o.seed = q.get('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : (Math.random() * 4294967296) >>> 0;
  Frame25.create(document.getElementById('view'), o);
})();
