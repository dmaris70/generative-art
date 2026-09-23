# 022 — Horses under a crescent moon (copy)

A transcription study, in code, of a watercolour-and-pencil sheet: a herd of pale and dark
horses in a green night wood, an eclipse-like crescent moon, a white tree. **Not an original
work and not a collection entry** — a copy made to learn how to get a natural watercolour
surface out of p5.js. The source's artist and title were not supplied and are not asserted here.

- Composition: `trace.py` (OpenCV) reads the 2000 × 1457 source into `data.js` — 11 216 colour
  passages (bilateral smoothing → 48-colour Lab k-means → connected components ≥ 16 px →
  contour), each with its median pigment and an edge hardness 0–9 measured from the source's
  gradient along that contour, plus 303 graphite polylines (black-hat → skeleton → walk).
  The source image is not shipped and is never displayed; the sheet is repainted from data.
- Surface (2D canvas, no WEBGL): flat first wash → every passage laid again *wet*, blurred as
  far as its edge dried soft (off-sheet shadow trick, works in every browser) → pooled-pigment
  rims, clipped inside the wet-on-dry shapes, broken along the perimeter → per-pixel paper pass
  (drifting wash density, granulation in the tooth scaled by pigment load, dry sparkle) →
  pencil that catches on the same tooth.
- Check: headless-Chrome render vs source, mean absolute difference 6.8 / 255 at 500 px.

The seed changes the *hand* (edge wobble, pooling, grain, pencil pressure), never the composition.
p5.brush was not used: it needs WEBGL and lays generic washes; an exact copy needs each passage's
own pigment and edge behaviour, which the pipeline above takes from the sheet itself.

Keys: `R` new hand · `S` save PNG (full sheet). `?seed=…` pins a hand. → decomposed and recomposed in 023.
