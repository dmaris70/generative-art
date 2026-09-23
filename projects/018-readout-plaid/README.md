# Readout Plaid

**Mechanism.** A hidden plaid of column and row faults is read out as pixel-sort
smears along the fault direction; block clusters are where the readout stalls,
and the scribbles are the reading head drifting free of the grid.

Freestanding study built from a reference image, outside the DMCF four-pen canon:
the palette is the reference's (orange, teal, lime, black, greys, white).
Not listed in `projects.json`; release status open.

## Decomposition of the reference

Nine mark families, in paint order:

| # | family | what it is | how it is generated |
|---|--------|------------|---------------------|
| 0 | paper | warm off-white with low-frequency mottle, faint grey patches | two-octave noise thresholded into 6 px grey cells; ~36 translucent rectangles |
| 1 | tiles | translucent mid-grey squares 6–30 px | uniform scatter, half of them biased onto the columns |
| 2 | v-smears | 1–3 px strips, 10–300 px tall, interrupted along their length | a loose field sampled against the column profile, plus ~34 dense columns (a few wide "curtains") where 2–4 pens interleave |
| 3 | h-smears | dash rows every 1–2 px, stacked into bands with torn edges | a loose field against the row profile, plus 5 bands: two solid slabs owned by one pen, the rest fainter echoes |
| 4 | slabs | solid colour rectangles 10–70 px | ~34, placed on the columns |
| 5 | clusters | black block-noise masses with teal/orange/white inclusions | random walk pulled back to an ellipse; blocks snapped to a 3 px grid; one dominant mass low-centre, some clusters are 1–3 px dot-matrix instead |
| 6 | speckle | gaussian clouds of 1–2 px dots, one pen each | ~44 clouds, some stretched horizontally |
| 7 | dashes | long dashed rulings, mostly horizontal | 9 lines of 3–14 px dashes |
| 8 | scribbles | hairline pen lines, sweeping, with rare loops and kinks | ~210 noise-steered walks, 0.45–0.9 px, loop episodes with a turn bias, rare heading kinks, reflected at the sheet edge |
| 9 | confetti | 4–14 px squares in greys, black, white with a 1 px shadow | ~520 uniform |

The plaid itself is two one-dimensional profiles (sums of gaussians along x and
along y). Every fault-aligned family samples its position by rejection against
the relevant profile, so columns and bands agree across layers without any layer
knowing about another. Pen choice per region comes from a low-frequency noise
field with a `warmth` bias (orange ↔ teal); lime rides a second, finer field.

## Determinism

Seed → `mulberry32` via the gallery harness (`?seed=`), plus p5 `noiseSeed`.
Every count, position and pen is drawn from that stream; the same seed and
parameters always give the same sheet. The sheet is 1080 × 1500, rendered at
pixel density 2 for a 2160 × 3000 export (`S`).

## Parameters

columns · bands · v-smear density · h-smear density · block clusters ·
scribbles · confetti · speckle clouds · orange ↔ teal.
