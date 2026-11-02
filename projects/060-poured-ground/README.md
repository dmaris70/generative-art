# Poured Ground

*Liquid paint poured onto a sheet and spread by a hand, simulated on the GPU and rendered as a
giclée-ready file. Each generation follows one of the 133 works on [colorlisa.com](https://colorlisa.com/),
in both its colours and its composition.*

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

## After the work

By default (`composition: after the work`) each generation chooses one of the 133 colorlisa
palettes at random. It takes that work's five colours, and also its **composition**. Every
palette has a brief in `briefs.js`, which is a short description of the painting's layout as
data:

- **Fields:** rectangles, ellipses and bands in that work's palette colours, placed as the
  painting places them. They are laid first, each covering what lies beneath, the way a painter
  blocks in. The brief's ground colour is the sheet.
- **Gestures:** pulls, bursts, combs, swirls and scribbles that echo the painting's own marks.
  The poured paint then moves under the hand.

For example, *A Bigger Splash* lays the sky as the ground, then the flat house with dark windows
and a pale roof line, two thin palms, the pink terrace, the dark pool edge and the tilted diving
board. A burst of pale strokes rises from the water where the splash is. *The Starry Night* gets
a dark cypress, a village under hills, a moon and stars, and swirls through bands of paint in the
sky. *Broadway Boogie Woogie* gets a yellow street grid studded with red and blue blocks.

The seed varies the geometry slightly, where drops land, and the hand: each gesture's angle,
reach and count, and whether it is made at all. Every generation of the same work therefore
differs but keeps that work's layout.

**Basis, stated per work:**
- 71 briefs follow a well-documented composition (`k: 1`).
- 62 are *inferred* from the title and the artist's typical structure (`k: 0`), mostly
  lesser-known works whose layout could not be confirmed.

The studio shows which basis applies, and the exported file records it in its provenance.
Correct or refine any brief in `briefs.js`; the check script validates it.

No image of any painting is used: only its five colorlisa hex codes and a description of its
layout. The output is an abstracted interpretation, not a reproduction.

### From starting point to interpretation

The brief is only the **starting point**. The `interpretation` setting (0–1, default 0.65) sets
how far each generation travels from it. As it rises, the seed applies one to three
**readings** to the layout:

| reading | what it does |
|---|---|
| detail | zooms into one region of the work, enlarged 1.4–3×, so a fragment becomes the whole |
| turn | rotates the composition |
| fragment | cuts fields into strips and shards and displaces the pieces |
| drift | carries each field on a slow current, stretched and turned |
| distil | keeps only the main mass of each colour, enlarged |
| echo | repeats the work's own gestures elsewhere, turned and rescaled |
| exchange | swaps ground and figure: the largest field's colour becomes the ground |

Separately, the hand goes further: longer, stronger and more numerous gestures, extra pulls
through the fields, and looser placement.

Fixed at every level:
- **All five colours are kept.** A colour that a reading pushes off the sheet returns as traces.
- **Readings are stated.** Those applied are named in the studio card, the caption and the
  PNG's provenance (for example, *starting point: …; interpretation 0.65: fragmented; drifted;
  the hand pushed further*).
- **Interpretation 0** reproduces the close version.

`composition: free gestures` keeps the earlier behaviour: palette colours with the seeded
gesture styles below.

## Composition

A seed writes a **score**: timed pours and finger drags on a fixed 60 Hz clock (`engine.js`, no
DOM). There are four gestures: **Spread** (pours near one to three centres, pushed outward),
**Sweep** (long knife pulls through each pour, at one shared angle), **Swirl** (arcs around a
centre) and **Scatter** (many small pours, short flicks). **Mixed** picks one per pour. You can
add your own marks: drag to push paint, shift-click to pour, and 1–4 choose the pigment. The
exported file then records that it is *hand-touched* and cannot be reproduced from its URL.

## Motion: the animated version

Every sheet also has an animated version (**M**, the studio's *Motion* section, or
`?motion=1`). Its movement is the wind from **048 Plotted Field**: bands of gust crossing the
sheet along a seeded wind direction, bent by a slow warp, using 048's own law
`gust = ½ + ½·sin(along − t·1.25 + warp)`, `force = 0.25 + 0.75·gust²`. That is one gust every
2π/1.25 = 5.03 s.

| phase of the loop | what happens |
|---|---|
| creation (0–0.42) | the painting is made again **in the order the paint actually arrived**. During the pour, each pigment's first-arrival time is recorded per cell; on replay, paint swells into place in that order, the front shimmering as gusts pass |
| breathing (0.42–0.58) | the paint surface sways with each gust, and its sheen leans like light over a field in wind |
| dissolution (0.58–1) | the wind takes the paint, upwind first: it thins, streams downwind and leaves the sheet, until the ground is empty again |

- **Exact loop:** the animation is a pure function of the loop phase, rendered over the
  finished painting, so it costs no simulation and closes exactly. The empty sheet at the end is
  bit-identical to the first frame. The loop is a whole number of gusts (*loop*, default
  6 = 30.2 s), and *sway* scales the movement.
- **Prints of an instant:** pause anywhere and *Export print PNG* to print that instant at full
  resolution. The file's provenance records the loop phase.
- **Video:** *Record loop* saves one exact loop as WebM (1080 px). Frames are drawn at exact
  phases, but the browser timestamps them in real time, so the machine must draw faster than the
  frame rate. If it cannot, the recorder says so.

## Label

The work's title, with the artist's name beneath it, is written in **Cedarville Cursive** at
the bottom right, like a signature line.

- **Font:** Kimberly Geswein's Cedarville Cursive, under the SIL Open Font License. It is served
  from `assets/fonts/cedarville-cursive/` with its licence, so exports never depend on a font
  CDN, and export waits for the font to load.
- **Sharpness:** the text is drawn at the output's own resolution and composited in the render
  pass, so it is as sharp at 360 dpi as on screen.
- **Settings:** `label` (*work and artist* or *off*); `label position` (*in the border* by default,
  right-aligned under the image and centred in the bottom margin, falling back to the image
  when the border is too shallow; or *on the image*, inset from the corner); and `label size`, which is
  relative to the sheet's short side, so the label keeps its proportion on every format.
- **Ink:** on the image, the palette colour that contrasts most with the ground. In the border,
  a warm black.
- **Provenance:** the label's text and position are written into the PNG's provenance.

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

## Print studio

`studio.html` is a dedicated interface for making prints, running the same engine as the piece.

- **Composition:** *after the work* or *free gestures*, an **interpretation** slider, and a card naming the starting work, its layout note, the readings applied and the basis.
- **Palette browser:** all 133 colorlisa palettes as swatch strips, searchable by artist or painting. The first row, *Chosen by seed*, shows which palette the seed picks.
- **Colours in use:** the resolved ground and four paints with their hex codes. Click a paint to draw with it.
- **Composition:** the gesture, number of pours, hand speed and momentum. Seed controls step back, forward or to a random seed. **Generate** makes a new composition and keeps your print setup.
- **Surface:** relief, gloss and paper tooth re-render live, and levelling re-runs the pour.
- **Print setup:** format, orientation, border, dpi, bit depth and simulation detail. A live spec shows sheet and image size, output pixels, raw data size and simulation cells per inch, and warns when the grid is too coarse for the print size.
- **Motion:** still or animated, play/pause, a loop-phase scrubber naming the phase, loop length in gusts, sway, and *Record loop*.
- **Label:** on or off, on the image or in the border, and its size (applied live).
- **Export:** a print PNG, a preview PNG, or a copy of the link. The URL always holds the full recipe, and *open as piece* opens the same recipe full screen.

## Files

| file | role |
|---|---|
| `palettes.js` | 133 colorlisa palettes (artist, painting, 5 hex) |
| `briefs.js` | One composition brief per palette: fields, gestures, basis flag |
| `engine.js` | Colour assignment, the seeded score, print formats and geometry. Runs in browser and Node |
| `sketch.js` | WebGL2 solver, paint layers, renderer, panel, pointer and print export |
| `png.js` | Streaming PNG writer (8/16-bit, sRGB, pHYs, tEXt) |
| `studio.html`, `studio.js` | Print studio: palette browser, composition, print setup and export, over the same engine |
| `../../tools/poured-ground-check.mjs` | Palette, colour assignment, determinism, score bounds, print geometry and brief checks (every brief uses all five colours) |

Needs WebGL2 with `EXT_color_buffer_float`, which any current desktop GPU supports.
Keys: **R** new seed · **G** new composition (keeps print setup) · **P** print · **S** preview PNG ·
**M** motion · **space** play/pause · **1–4** pigment.

Palettes © their compiler at colorlisa.com. Paintings belong to their artists and estates. No image
from a painting is used, only five colours from each. If prints are sold, do not use an artist's
name in the title or marketing without clearance. The colour credit belongs in the provenance
line, as the file metadata already records it.
