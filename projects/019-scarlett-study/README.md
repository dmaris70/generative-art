# 018 — Study after Scarlett

A transcription study, in code, of an untitled gouache-and-watercolour sheet by
Rolph Scarlett (1889–1984). **Not an original work and not a collection entry** —
it is a copy made to learn how to get a natural paint surface out of p5.js.

- Composition: hand-transcribed into polygons in the source's 1200 × 893 space
  (the harlequin fan is two line families — rays from a vanishing point crossed by
  a second set — the checker an affine grid on a triangle).
- Ground: wet-in-wet washes from `assets/watercolor.js`, softened, then granulated.
- Shapes: opaque gouache = flat body colour + streaky brushwork + pooled/thinned
  patches + dried rim + paper tooth, with wandering two-pass graphite outlines.
- Stipple passages: loaded-brush dabs.

The seed changes the *hand* (wobble, brushwork, blooms), never the composition.
The signature is deliberately not reproduced. p5.brush was not needed: it requires
WEBGL, and the 2D-canvas pipeline above reuses the repo's watercolour module.

Keys: `R` new hand · `S` save PNG.
