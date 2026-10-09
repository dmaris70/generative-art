# 020 — Crescent study (copy)

A transcription study, in code, of an abstract oil on linen: green ground, a black
crescent that runs out into a scroll and ball, two red discs, a navy crescent, cream
forms with age cracks. **Not an original work and not a collection entry** — a copy
made to learn how to get an oil-on-canvas surface out of p5.js. The source's artist
and title were not supplied and are not asserted here.

- Composition: source space 2000 × 1429. Straight-edged forms, the discs and the navy
  crescent are hand-measured; the black tail, the cream blob and the yellow horn were
  traced from the source by contour extraction (OpenCV) and re-splined. Checked by
  50 % overlay against the source — registration is within a few pixels.
- Palette: sampled from the source, averaged over 17 × 17 px patches.
- Surface (all 2D canvas, no WEBGL): scumbled ground dragged mostly vertically with a
  fresher green cut in around the forms → opaque passages = flat body colour + tonal
  drift + scumble blotches + flow-following brush strokes + darker turned edge →
  craquelure, yellowed stains and grime in the lead whites → ultramarine dry-brushed
  along the navy crescent → varnish vignette → a per-pixel linen pass (independent
  slubbed warp and weft thread profiles, grain, thread tops wearing pale through the
  blacks).

The seed changes the *hand* (edge wobble, brushwork, cracks), never the composition.
p5.brush was not used: it requires WEBGL, and its watercolour/marker model is a poorer
fit for opaque oil than the pipeline above.

Keys: `R` new hand · `S` save PNG. `?seed=…` pins a hand.
