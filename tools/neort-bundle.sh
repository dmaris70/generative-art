#!/usr/bin/env sh
# Bundle 041 into one self-contained HTML for posting on neort.io (no harness, no panel, no CDN):
#   tools/neort-bundle.sh > projects/041-between-a-square-and-a-cube/neort.html
# Query string still works on the result: ?seed=… ?tempo=… ?reach=… ?ground=paper ?mode=web ?still=1
set -eu
cd "$(dirname "$0")/.."
P=projects/041-between-a-square-and-a-cube
cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Between a Square and a Cube</title>
<style>html,body{margin:0;height:100%;background:#0b0b0e;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head>
<body>
<canvas id="view"></canvas>
<script>
HEAD
cat "$P/mordell.js"
cat <<'TAIL'
// boot: defaults, plus whatever the query string says
(function () {
  const q = new URLSearchParams(location.search), o = {};
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
</script>
</body>
</html>
TAIL
