#!/usr/bin/env bash
# plot.sh — turn an exported SVG into a plotter-ready one, and show what changed.
#
#   tools/plot.sh drawing.svg                 → drawing-ready.svg, A4 landscape
#   tools/plot.sh drawing.svg a3 20mm         → A3, 20mm margins
#
# Requires vpype:  pipx install vpype   (or: pip install "vpype[all]")
#
# The pipeline, in order:
#   linemerge     join paths whose ends nearly touch      → fewer pen lifts
#   linesimplify  drop redundant points                   → smaller file, smoother motion
#   linesort      reorder to minimise pen-up travel       (--two-opt: a second pass)
#   reloop        randomise where closed loops start      → no visible seam scar
#   layout        centre and fit to the page with margins
#
# Layers are preserved, so one SVG layer per pen survives to the machine:
#   axicli plot-ready.svg --mode layers --layer 1     # then swap the pen
set -euo pipefail

SRC="${1:?usage: plot.sh input.svg [page-size] [margin]}"
PAGE="${2:-a4}"
MARGIN="${3:-15mm}"
OUT="${SRC%.svg}-ready.svg"

VPYPE="${VPYPE:-vpype}"
command -v "$VPYPE" >/dev/null || { echo "vpype not found — pipx install vpype"; exit 1; }

echo "── before ───────────────────────────────"
"$VPYPE" read "$SRC" stat | grep -E "Layer [0-9]|  Length|Pen-up length|Path count"

"$VPYPE" \
  read "$SRC" \
  linemerge --tolerance 0.5mm \
  linesimplify --tolerance 0.1mm \
  linesort --two-opt \
  reloop \
  layout --fit-to-margins "$MARGIN" --landscape "$PAGE" \
  write "$OUT"

echo
echo "── after ────────────────────────────────"
"$VPYPE" read "$OUT" stat | grep -E "Layer [0-9]|  Length|Pen-up length|Path count"

echo
echo "wrote $OUT"
echo "preview:  $VPYPE read '$OUT' show"
echo
echo "Note: on dotted/dashed work the pen-lift count, not travel, usually dominates"
echo "the plot time — see docs/plotter-guide.md §6."
