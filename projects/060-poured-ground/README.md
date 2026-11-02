# Poured Ground

*Liquid paint poured onto a sheet and spread by a hand, simulated on the GPU and rendered as a
giclée-ready file. The colours come from the 133 painting palettes on [colorlisa.com](https://colorlisa.com/).*

## Method

The technique follows mofu-dev's
[*Spreading Liquid with three.js*](https://mofu-dev.com/en/blog/fluid-foundation/) ("foundation"),
which runs on top of the same author's [*Stable Fluids*](https://mofu-dev.com/en/blog/stable-fluids/)
solver. This is a WebGL2 reimplementation without three.js. It follows the articles' published
steps and constants. No code was copied beyond the shader expressions the articles quote.

| Stage | From mofu | Here |
|---|---|---|
| Velocity | Stable Fluids: force → semi-Lagrangian advection → divergence → Jacobi pressure → projection, walls at the edges | Same order. The force pulls velocity toward the finger's velocity inside a capsule (segment) so fast strokes leave no gaps. Momentum decays by `flow` per step. Velocity is measured in image short-side units per second, so behaviour does not depend on grid size |
| Paint | Height map. Paint leaves a cell in proportion to its own flow strength and arrives from the backtraced source: `removed = min(h, s·0.3·h)`, `added = min(hₛ, sₛ·0.3·hₛ)`, `s = smoothstep(threshold, |v|)` | Same rule on **four pigments at once** (RGBA32F). Optional *levelling* acts only where paint is moving, so a resting film keeps its edge |
| Pour | `initialHeight.frag` profile `√((1−s²)/12)`, shaped by `smoothstep(0, .025)` × 0.66 | Same profile, added into one pigment channel at each pour |
| Trace | Alpha history keeps the maximum coverage, and the render uses 0.5·history + 0.5·current, `step(0.1)` | Same, per pigment. Each level is thresholded on a smooth field and anti-aliased over **one output pixel** (`fwidth`), so edges are sharp at 300 dpi rather than one sim cell wide |
| Shading | Normals from the height map, Matcap texture | Normals from a **cubic B-spline** of the height (value and analytic gradient, C2), so a 1k grid prints smoothly at 10k px. A procedural key light plus gloss stands in for the Matcap and is normalised so flat paint renders **exactly its palette colour** |
| Colour mix | Simplified Kubelka–Munk weighted by thickness, alpha history where thin | Single-constant Kubelka–Munk in linear light: K/S = (1−R)²/2R per pigment, mixed by thickness, R = 1 + K/S − √((K/S)² + 2K/S). Thin films let the ground show through |

Like the original, it is tuned by eye and does not conserve volume.

## Colour

Each palette is five hex colours taken verbatim from colorlisa.com (`palettes.js` records artist,
painting and hex codes). `ground` picks one colour as the sheet: the lightest, the darkest, or a
neutral paper white. With paper white, the seed chooses which four of the five colours become
paint. The other four are pigments in a seeded order and with seeded weights, so one or two
colours lead. Palette `— chosen by seed —` draws one of the 133 from the seed.

## Composition

A seed writes a **score**: timed pours and finger drags on a fixed 60 Hz clock (`engine.js`, no
DOM). There are four gestures: **Spread** (pours near one to three centres, pushed outward),
**Sweep** (long knife pulls through each pour, at one shared angle), **Swirl** (arcs around a
centre) and **Scatter** (many small pours, short flicks). **Mixed** picks one per pour. You can
add your own marks: drag to push paint, shift-click to pour, and 1–4 choose the pigment. The
exported file then records that it is *hand-touched* and cannot be reproduced from its URL.

## Giclée output

**🖨 Export print PNG (P)** renders the finished state at the chosen format and dpi. Formats run
from A3 to A0, plus 16×20, 24×30, 30×40, 40×50 in and square 24 or 36 in, with an optional paper
border in mm. Settings:

- **16-bit RGB** (default) or 8-bit with triangular dither. 16-bit avoids banding in smooth
  gradients after the print lab's colour conversion.
- **Tiles and streaming**: the GPU renders strips that are compressed as they arrive
  (`png.js`, `CompressionStream`). Files larger than any canvas still export, for example 40×50 in
  at 300 dpi (12000×15000 px).
- **Embedded**: `pHYs` stores the real dpi, so the file opens at print size. `sRGB` sets the
  colour space with perceptual intent. `tEXt` chunks record the seed, palette source and hex
  codes, ground and pigments, sheet and border, and the share URL. Any print can be traced back
  to its recipe.
- **Paper tooth** is set in millimetres, so it prints at the same physical scale at any dpi.

The preview and the print come from the same simulation textures. Only the final render pass
changes resolution, so what you see is what prints. A finer *sim long side* (1536 or 2048) adds
detail to large prints.

**For the print lab:** the file is sRGB. Soft-proof it against the printer and paper ICC profile.
Saturated palettes such as Warhol, Geiger and Klee's *Fire Evening* can fall outside matte
cotton-rag gamuts. Use perceptual intent for those and relative colorimetric for the rest.

## Files

| file | role |
|---|---|
| `palettes.js` | 133 colorlisa palettes (artist, painting, 5 hex) |
| `engine.js` | Colour assignment, the seeded score, print formats and geometry. Runs in browser and Node |
| `sketch.js` | WebGL2 solver, paint layers, renderer, panel, pointer and print export |
| `png.js` | Streaming PNG writer (8/16-bit, sRGB, pHYs, tEXt) |
| `../../tools/poured-ground-check.mjs` | Palette, colour assignment, determinism, score bounds and print geometry checks |

Needs WebGL2 with `EXT_color_buffer_float`, which any current desktop GPU supports.
Keys: **R** new seed · **G** new composition (keeps print setup) · **P** print · **S** preview PNG ·
**1–4** pigment.

Palettes © their compiler at colorlisa.com. Paintings belong to their artists and estates. No image
from a painting is used, only five colours from each. If prints are sold, do not use an artist's
name in the title or marketing without clearance. The colour credit belongs in the provenance
line, as the file metadata already records it.
