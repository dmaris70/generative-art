# Loop Engine

A seeded generator of seamlessly looping pixel GIFs.

## Scene

- **Cards:** rectangles with a different colour on each side. Each card spins a whole number
  of turns per loop, nods, and drifts. Cards are drawn by intersecting each pixel's
  perspective ray with the card's plane, so they shrink to slivers when seen edge-on.
- **Ink streams:** chains of metaballs that follow a closed 3D curve. The base orbit is
  an ellipse plus harmonics at integer frequencies. Each ball lags the head by a fixed
  phase, and its radius swells and shrinks. The field uses a compact kernel and is
  thresholded. A partial "grain" turns the soft edge into speckle.
- **Specks:** particles born at trail balls that fly on ballistic paths. Each speck's age
  is `(t − birth) mod 1`, which makes them loop as well.
- **Occlusion:** cards, ink and specks share one z-buffer, so ink passes in front of and
  behind the cards.

## Why it loops exactly

Every time-dependent quantity is a function of the phase `t = frame / frames` built from
`sin(2π·k·t)` with integer `k`, or from `mod 1`. Speck grain is hashed on
`frame mod frames`. As a result, `renderFrame(scene, frames)` is identical to
`renderFrame(scene, 0)`.

## Files

| file | role |
|---|---|
| `engine.js` | scene generation, rasterizer and GIF encoder. It has no DOM or p5 dependency and runs in both the browser and Node. |
| `sketch.js` | live view, GenArt panel and export |
| `../../tools/loopgif.mjs` | batch CLI |

Palettes: RGB primaries, CMY on paper, Bauhaus, Phosphor, Signal, Mono.
