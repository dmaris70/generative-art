# Luminous Field

*Colour fields that breathe, on an LED wall: the classic format of Mark Rothko translated from
thin paint into light.*

The second piece on the LED-wall engine ([`assets/led.js`](../../assets/led.js), introduced by
055 Ruled Light). The format is generative, not copied: no painting is reproduced. A seed sets the
proportions and a register sets the colours.

## What is translated

| In the paintings | On the wall |
|---|---|
| A ground colour carrying one to three rectangles, stacked vertically, close to the edge | Seeded layout per canvas. 1 field (a tall block floating high), 2 or 3 stacked fields with uneven gaps |
| Feathered, irregular borders | A rounded-box distance field displaced by broad noise and fine horizontal strokes, then a soft feather |
| Thin layers: one colour seen through another | Two inks mixed by horizontal scumble noise; paint thinner at the border and toward the top, so the ground shows through |
| The edge that seems to glow | A seam of light just inside the edge, broken by noise and gathered at the foot, with a bleed out over the ground |
| Light that seems to come from behind | A slow core of light inside each field |
| Series and murals (rooms of related canvases) | On wide walls, a row of canvases sharing a register, each varying in hue and value (`series`) |
| "They breathe" | Field edges swell and contract by about 2%, the feather opens and closes, luminance rises and falls, the core wanders, and the brushed edge re-forms as the noise domain travels a closed circle |

## Registers

Colour families, not paintings. They are authored in sRGB and converted to linear light:
Nocturne (indigo, teal, violet; the default, matching the reference image), Ember, Saffron, Sea,
Maroon, Chapel, Black on grey. The dark registers have a tighter feather and a quieter seam.

## Files

| file | role |
|---|---|
| `engine.js` | Seeded layout and the per-canvas uniform block at each loop phase. No DOM, so it runs in the browser and in Node |
| `sketch.js` | Fragment-shader painter (one pass per canvas), panel, clock and export, on the shared LED harness |
| `../../tools/luminous-field-check.mjs` | Loop, determinism, seed-identity, layout and motion checks |

## Claims, and how they are checked

| Claim | Check |
|---|---|
| Frame N equals frame 0 bit for bit | `node tools/luminous-field-check.mjs`: every uniform block at t = 1 equals t = 0, across 5 seeds × 5 walls × 3 option sets. In the browser, `?t=0` and `?t=1` gave identical PNG hashes (SwiftShader, 600×600) |
| Same seed and settings give the same frame | Same script, which rebuilds the scene and compares value for value |
| A slider does not change a seed's identity | Every canvas and field takes a fixed number of draws, and 16 canvases are always drawn |
| Canvases stay on the wall, fields stay inside their canvas | Same script, which runs a layout check for every case |
| With `breath` at 0 the wall is still | Same script |

Black floor, dither, kiosk, loupe, master PNG and PNG-sequence export are inherited from the
harness unchanged. See 055 for how to run a wall.

**Reference look:** `?seed=1&p_preset=5&p_customW=2160&p_customH=2160&p_hang=0`

Not yet done: a test on a real panel. The dark registers (Maroon, Chapel) sit close to the black
floor and need checking on hardware for low-grey uniformity. GPU cost has not been measured
at 7680×1080. The shader runs 4-octave noise about 6 times per field per LED.
