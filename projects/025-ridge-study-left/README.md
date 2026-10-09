# 024 — Ridge in cloud, left sheet (copy)

Left half of a two-sheet transcription study, in code, of a grainy monochrome diptych: a cloud
bank over a dark hollow, a pale track, a slope rising to the right edge — where sheet
[025](../026-ridge-study-right/) takes over (the two pictures are one view cut in the middle;
each sheet pushes its half against the inner edge of its mat, exactly as the source does).
**Not an original work and not a collection entry** — a copy made to learn a natural
monochrome brush surface. The source's author and title were not supplied and are not asserted.

- Reading: `trace.py` (OpenCV) finds the mat colour and the picture box (900 × 1193 in a
  1080 × 1350 sheet), removes the grain (non-local means) and keeps a half-resolution tonal
  reading; measures the grain law (σ per tone band from the quiet floor, neighbour correlation
  ≈ 0.35–0.37); and maps where the source holds fine streaking beyond both the reading and pure
  grain (band-pass σ1.5–3 excess, calibrated on the quietest tenth). The source is not shipped.
- Painting: `assets/drybrush.js`, shared by both sheets. Float-buffer painter, no canvas calls:
  toned ground → five brushes (26 → 1.7 px), each stroke started where the sheet is most wrong,
  pulled along the isophote from a structure tensor, lifted when its paint stops agreeing with
  the tone under it; bristle streaks, pressure taper, a brush that dries as it travels → a
  hair-thin dry drag along the broad sweep where the streak map asks for it → grain re-grown
  from the law. ≈ 60 k strokes (left), ≈ 130 k (right), under a second.
- Check (seed 1, vs source): mean abs difference 7.9 / 255 per pixel — at the floor two
  independent grains of this strength allow — and 2.0 / 255 once both are blurred past the grain
  (σ 2). Band energies (σ 1/2/4/8) in cloud and rock within ~8 % of the source. Browser and
  node renders are bit-identical for a seed.

The seed changes the *hand* (stroke order, bristles, wobble, every grain), never the composition.
p5.brush was not used: it needs WEBGL, its result differs across GPUs, and an exact copy needs
every stroke's tone, direction and length taken from the sheet; p5.js hosts the page and controls.

Keys: `R` new hand · `S` save PNG (2×, 2160 × 2700). `?seed=…` pins a hand; `p_grain=0` shows the bare painting.
