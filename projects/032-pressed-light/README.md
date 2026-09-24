# 032 — Pressed Light (copy)

A transcription study, in code, of a supplied photograph: pressed wildflowers —
umbellifers, a dense bloom, ferny leaflets, a curling bare tendril — exposed onto
warm paper in the anthotype/cyanotype family of photograms. **Not an original
composition and not a collection entry** — a copy made to learn how to get that
medium's particular soft-edged, multi-tone print out of p5.js. The source's
photographer and title were not supplied and are not asserted here.

- Composition: source 720 × 1080, reference space 900 × 1350. Traced, not invented
  — `trace.py` (Python + OpenCV, kept for the record, not loaded by the page) reads
  the source at twelve brightness thresholds, blurring the image more heavily
  before each lighter threshold, then contours each mask (`findContours` →
  `approxPolyDP`) into `data.js`. A shape's softness there is therefore a direct
  record of how faint it was in the print — the "lift" of a specimen off the
  paper — not a filter added afterward. Palette (paper cream, ink near-black) is
  sampled from the source's corners and its darkest core. The source photograph
  itself is not in this repo, matching the other trace studies.
- Surface (WEBGL, for p5.brush): each of the twelve traced levels is redrawn as
  several jittered, slightly grown passes of ink — repetition standing in for
  tone, the way a plotter has no stroke-weight — drawn palest/largest first,
  darkest/smallest last. The six darkest, most legible levels also get a
  hand-inked p5.brush (HB) contour, so the readable silhouettes carry a graphite
  edge rather than a vector-smooth one. Paper grain and a soft contact-print
  vignette sit on top.

The seed changes the *hand* — edge wobble, ink bleed, brush pressure, grain —
never the composition, which is fixed by the trace.

Keys: `R` new hand · `S` save PNG. `?seed=…` pins a hand; the parameters panel
exposes exposure, edge bleed, ink-pass count and grain.
