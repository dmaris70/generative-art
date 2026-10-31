# 048 — Plotted Field

A grass field drawn by a pen plotter, one stroke per blade. One seed makes one field: the
ground, the tufts, how tall the grass is and where each blade stands. That field has 25 views,
each a camera placed somewhere in it, from lying in the grass to standing on a roof. An instant
(the number of seconds into the hour) fixes the wind. Moonlight is shown where the pen lifts: a
blade turned so that it would catch the light is left as a gap in its line.

![field 7, view 1 of 25, A3](preview.png)

**How it works, in one sentence:** blades and patches of ground are sorted from near to far;
each blade's centreline is drawn only where nothing nearer has covered the paper; then the
blade's own width is marked on an occlusion map, so nothing behind it gets drawn.

## Where it comes from

This piece takes one idea from Leander Herzog's *Field* (2026) and goes the other way with
it. *Field* is a live, glowing grass field on the graphics card, where each token is a camera
and the touches people leave fade after seven seconds. Here the same kind of subject becomes
one moment fixed in ink, with no server, no special browser and nothing that changes once
plotted. **No code was taken from *Field*:** I read its source for analysis only, and
everything here (terrain, tufts, wind, cameras, hidden-line removal, light) was written for
this repository from scratch.

## The rules

- **The field depends on the seed and nothing else.** Blades are placed per 1 m world cell, with
  random numbers drawn from a hash of that cell and always in the same order. So view 3 and
  view 17 of a seed show the same blades from different places.
- **The ground:** layered sine waves plus value noise, about ±1.5 m, with no cliffs. **The
  meadow:** low-frequency noise sets grass height (0.18–1.18 m) and how thick it grows.
  **The tufts:** blades group around nearby centre points (cell size 0.85 m). Each tuft has
  its own height, and its blades lean outward from the centre.
- **The wind at an instant:** gusts cross the field as bands along a direction set by the
  seed, slightly warped by noise. The parameter `instant` (0–3599 s) is the moment that gets
  frozen. Each blade is a curve whose bend combines its own lean with the local wind.
- **The 25 views:** placed in order around the field's centre, each pointing roughly at it.
  Eye heights run from 0.3 m to 9 m on a log scale and are shuffled across view numbers, so
  neighbouring views differ in height. Each view looks down far enough to see some ground.
- **Light means the pen lifts:** for every sample along a blade, the engine checks how
  strongly the blade's direction would reflect the moon toward the viewer (a sheen model like
  the one used for hair), weighted toward the tip. Where that exceeds `1 − moonlight`, the
  stroke breaks.
- **Hidden lines:** the occlusion map has a resolution of `grain` mm (0.2 mm by default). A
  blade covers its real width (4–8 mm at the base, tapering to 15% at the tip) times `body`,
  as seen from the camera. Where that is narrower than one map pixel, it covers the pixel at
  random, in proportion to its width. Patches of ground also block what is behind them, so a
  rise hides what lies beyond it.
- **Recession:** blades smaller than `cutoff` mm on paper are skipped. Beyond `haze` m, the
  share of blades kept falls as (haze/distance)², which keeps the number of marks per square
  millimetre of paper constant, and then falls further exponentially with `hazeLength`.
  Distance shows as fewer lines, not as grey. Skipped blades block nothing.

## Measured (A3, default settings, all 25 views)

| Field | Strokes (min / median / max) | Line drawn | Estimated plot time | Build time in the browser |
|---|---|---|---|---|
| 7 | 3,379 / 12,045 / 21,637 | 18 / 36 / 64 m | 40 / 115 / 202 min | 0.1–1.1 s |
| 2026 | 2,972 / 16,689 / 33,421 | 19 / 52 / 94 m | 36 / 163 / 313 min | 0.4–1.6 s |

The plot-time estimate assumes the pen draws at 25 mm/s and spends 0.45 s per stroke on
lifting, moving and lowering. It has not been checked against a real machine yet. Low views,
inside the grass, give the fewest strokes; views from about 2–5 m give the most.

Same settings, same file: two builds of field 7, view 24 produce identical SVGs (same
SHA-1). Changing `instant` changes the file.

## Using it

- **URL:** `?seed=7&p_view=24&p_instant=1800`. Every setting in the panel has a `p_` name
  and is written into the URL as you change it.
- **Keys:** `[` and `]` step through the views, `V` saves the SVG, `S` saves a PNG, `R` picks
  a new field.
- **SVG:** paper size in millimetres, with two Inkscape layers: `1 grass` and `2 caption`.
  The caption uses the single-stroke font in `assets/strokefont.js`, so the plotter draws it
  too.
- **Plotting:** run `tools/plot.sh plotted-field-7-view-24.svg a3 23mm` (for A3, the margin
  is 5.5% of the sheet width). The `linemerge` and `linesort` steps in that script do most of
  the work of cutting pen travel. *I have not run vpype on these files, because it is not
  installed in this environment.*

## Known limits

- The occlusion brush is square, not round. At a 0.2 mm grain this does not show in a plot.
- A patch of ground blocks what is behind it only once all blades up to its farthest corner
  are drawn. A blade just behind a 1 m crest can occasionally show through by a few
  millimetres.
- Each blade is drawn as a single centreline, so the line weight is the pen's. Blade width
  affects only what gets hidden, not how thick anything looks.

## Files

- `field.js`: the engine. It is pure geometry with no drawing library, runs in a browser or
  in Node, and builds strokes in millimetres and the SVG.
- `sketch.js`: the panel, the on-screen sheet and the PNG/SVG export.
- `index.html`, `preview.png`.
