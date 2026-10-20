// boot for the neort.io bundle: the edition of the current minute, locked to Tokyo time in the room's hours; the query string overrides
(function () {
  const q = new URLSearchParams(location.search), o = {};
  const num = (k) => { const v = parseFloat(q.get(k)); if (isFinite(v)) o[k] = v; };
  ['radius', 'rate', 'fade', 'qr', 'caption', 'at'].forEach(num);
  if (q.get('ground')) o.ground = q.get('ground');
  if (q.get('clock')) o.clock = q.get('clock');
  if (q.get('m')) o.m = Math.max(0, Math.min(389, parseInt(q.get('m'), 10) - 1));   // ?m=<1 … 390> fixes the edition
  Edition.create(document.getElementById('view'), o);
})();
