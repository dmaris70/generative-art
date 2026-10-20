#!/usr/bin/env sh
# Bundle a harness-free piece into one self-contained HTML for posting on neort.io (no panel,
# no CDN): the core file(s) and the project's neort-boot.js inlined into a minimal page.
#   tools/neort-bundle.sh <slug> "<title>" <core.js> [more.js…] > projects/<slug>/neort.html
# e.g.
#   tools/neort-bundle.sh 041-between-a-square-and-a-cube "Between a Square and a Cube" mordell.js
#   tools/neort-bundle.sh 042-every-25-pixel-image "Every 25-Pixel Image, Exhausted in One Day" icons.js
# The result still reads its query string (?seed=… and whatever the boot accepts). BG=#f4f0e8
# in the environment sets the page colour behind the sheet (default #0b0b0e).
set -eu
cd "$(dirname "$0")/.."
SLUG=$1; TITLE=$2; shift 2
P=projects/$SLUG
cat <<HEAD
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>$TITLE</title>
<style>html,body{margin:0;height:100%;background:${BG:-#0b0b0e};overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head>
<body>
<canvas id="view"></canvas>
<script>
HEAD
for f in "$@"; do cat "$P/$f"; done
cat "$P/neort-boot.js"
cat <<'TAIL'
</script>
</body>
</html>
TAIL
