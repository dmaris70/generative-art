# 038 — Ridge, encounters — painted

**Mechanism (one sentence):** the scene of [028 — Ridge, encounters](../028-ridge-encounters/)
(a place, a body standing on it, the weather, two gazes cut into a diptych) is taken unchanged
from its own engine. It is then painted with the oil engine of
[036](../036-aerial-recession/) and the watercolour toolkit of
[037](../037-watercolor-landscape/), in colour or in 028's own monochrome.

The same seed gives the same scene as 028 (v1.4). Any of the pairs kept in 028's edition can be
repainted here: `?seed=<the 028 seed>`, and `place=…`, `p_regime`, `p_event` as in 028.
028 is derived from a study of someone else's photograph-like diptych; its scenes are 028's,
so this variation inherits that note: a study, not a collection entry.

## How it is built

| Layer | Source | Notes |
|---|---|---|
| Scene: place (invented or one of 44 surveyed ranges), standpoint search, weather, light, the two gazes, the cut | `../028-ridge-encounters/parts.js` + `compose.js`, **loaded from 028's folder, not copied** | 028 is frozen by file hashes (`FREEZE.json`); nothing in it is touched. Its elevation data (`dem/*.dem`) is loaded the way 028's worker loads it. |
| Bridge: per-pixel buffers and colour | `bridge.js` (new) | See below |
| Watercolour | `tools.js` (037's `wfill`, `wwash`, `wsoft`, `wdry`, verbatim) + `regions.js` + `wc.js` (new) | p5.brush fills and washes |
| Oil | `oilcore.js` (036's `makeOilStroke` + `oilStroke`, verbatim but for two lines) + `oil.js` (new driver) | native strokes over a colour underpainting |
| App, panel, diptych and mats | `sketch.js` | GenArt panel, Apply to repaint, 028's sheet geometry (1080 × 1350, picture 900 × 1193 against the inner edge) |

## The bridge

For each sheet, `ridgeScene()` reads from 028's engine:
- the **developed tone**: 028's finished values, from `Compose.sheets`;
- the frame's per-pixel **depth**, **light on the land**, **rock or snow**, **cloud density** and
  **haze** (`Compose._scene`, which `sheets()` has just cached).

The cloud density is solved to the register's budget exactly as 028's `develop()` does (the same
bisection), so the air in front of each pixel matches 028's.

**Colour** (`colourise`) is chosen per 028 light mode (against, side, overcast, front, moon):
- the cloud runs from its dark to its lit colour, with a glow round the sun when the sun is in
  the sheet;
- rock and snow each run from shaded to lit by the light on them; rock is varied with lichen in
  broad patches;
- the air gives way to the cloud's colour as 028's transmittance falls.

Then **every pixel's colour is set to 028's tone** (hue kept, luminance matched). Colour never
changes a value, so the tonal composition measured against the source stays 028's.

**Monochrome** maps 028's tone to a warm ink on paper.

## Watercolour (`wc.js`)

The watercolourist's order from 037: paper, then light to dark and far to near.
1. **Sky:** seven value levels, each a wet wash round the paper the last one left. Washes bleed
   and granulate; the biggest are real wet fills.
2. **Land:** split into four depth bands from 028's depth, farthest first. Each band gets a body
   wash, then glazes for up to nine darker levels:
   - far bands are wet and soft-edged;
   - near bands are glazes on dry paper with pigment at the edge;
   - the nearest band's bleed runs in the direction the body moves (028's smear).
3. **Regions** (`regions.js`) are traced by marching squares from smoothed masks. Each hole is
   bridged into its outline, so a wash goes round its lights. Outlines have their corners cut
   twice (Chaikin), except where they meet the picture's edge, which they run just past.
4. **The colour of a glaze** is the mean of the pixels it is the *last* layer over (tone between
   its level and the next), laid darker by a value curve (t′ = 255·(t/255)^1.6) because
   p5.brush glazes dry lighter than they are laid. A level with no pixels of its own is skipped.
5. **Each wet fill gets an even body wash** (60 % of its opacity) under the same outline: a wet
   fill gathers its pigment at the edge and thins inside.
6. **Low-key sheets** (median tone below 140: the moon, dark weather) are painted on a toned
   ground, as a nocturne is: one wash over the whole sheet in the colour of its lighter values,
   then the lights (the moon) lifted back out.
7. **Then:**
   - the crest is found and lost in rigger runs where land meets sky in contrast;
   - dry brush is dragged along the form (across the gradient of the light): dark and broken on
     rock, soft blue-grey shadow strokes on snow;
   - the paper's tooth is added last.

## Oil (`oil.js`)

036's method:
1. The colourised frame is laid as the underpainting.
2. Three layers of opaque bristle strokes are painted over it, sampling it, coarse to fine:
   - a block-in that simplifies (2.2 × stroke width, laid ~2.4 deep, so about 9 % of the ground
     shows through);
   - a body layer only where something happens (economy);
   - an edge layer laid along every edge.
3. **Directions come from 028's buffers:**
   - **Cloud** follows the isophotes of its tone (structure tensor), flattening toward level where
     the cloud has no structure.
   - **Land** follows the isophotes of the light, the form of the rock, leaning to the fall line
     where the form is weak.
   - **Far land** gets soft level strokes.
   - **Near ground** turns toward the body's movement (028's smear).
4. **Stroke size follows depth.** Relief (the ridge of paint under the room light) is kept for
   near rock and snow and removed in the cloud.
5. **Palette-knife lights** go on the lit snow last.

## Measured and fixed while building

**Value fidelity.** Each watercolour render is compared with 028's own frame for the same seed
(`?under`): block luminance (12 px blocks at 1400 × 860), per sheet.

| Seed (register, light) | Before | After |
|---|---|---|
| 20833364 (clearing, side) | mean +11 / +21, MAE 20 / 25, r 0.63 / 0.61 | mean 0 / −1, MAE 17 / 16, r 0.89 / 0.92 |
| 221429 (against) | mean +26 / +33, MAE 27 / 33, r 0.59 / 0.78 | mean −5 / +6, MAE 17 / 11, r 0.76 / 0.92 |
| 22262986, monochrome | — | mean −1 / −4, MAE 11 / 11, r 0.85 / 0.92 |
| 22414005 (moon) | mean +45 / +42, MAE 46 / 43, r 0.71 / 0.79 | mean +10 / +4, MAE 18 / 11, r 0.80 / 0.77 |

What moved it, each found by measuring rather than by eye:
- **Glaze colour.** Each glaze was the mean of everything darker than its level, so the first
  glaze over a slope was already its mid-grey and buried the lit edge.
- **Spread.** `wsoft`'s rings scale about the shape's centre and p5.brush's bleed is a fraction of
  the shape, so on a slope 400 units across a wash ran 60–90 units into the sky. Both are now
  capped by the radius (`SPREAD_R`).
- **Pale centres.** A logged pixel under four wet fills of luminance 106–131 came out ~220: the
  fills' pigment sits at their rims. Hence the body wash.
- **Dark keys** stopped ~40 levels short on white paper. Hence the toned ground.
- **Rejected:** drops of lighter and darker paint inside each wet wash (variegation) read as
  regular polka dots; removed.

- **Opacity:**
  - p5.brush washes come out far lighter than their opacity, so glazes are laid strong enough
    that the last one over a pixel nearly carries its colour.
  - Oil coverage is counted in expected layers of paint. A layer of c leaves e^−c of the ground
    bare; 036's figure of ~1 left 37 % of the underpainting showing as a veil here.
- **Lint:** the repository's ESLint setup has `no-undef` switched off. A stricter pass with
  p5's real globals found one missing helper here (`pts`); 036 and 037 are clean under it.
- **Test serving:** 028's elevation data loads by `fetch`, so the page must be served over HTTP;
  `file://` falls back to invented ground only.

## Known gaps (v1)

- **Watercolour:**
  - 028's fine ripples in snow survive only partly.
  - 028's smooth sky gradients become a few flat-edged shapes (seven levels); strongest in the
    moonlit sky.
  - Hairline paper gaps can remain where two depth bands meet.
  - Dry brush on rock reads a little mechanical.
- **Oil:** there is no wet-into-wet pickup; 036 read its wet block-in back from the canvas.
- **Render time** (software GL test container, 1400 × 860): watercolour ≈ 4 min, oil ≈ 25 s.

## Controls

| Group | Parameter (default) | Effect |
|---|---|---|
| Painting | medium (watercolour), palette (colour / monochrome), glow of the light (1) | |
| Scene | register (by seed), rare event (by seed), movement of the body, painted (1) | register and event as in 028 |
| Watercolour | wetness (0.5), pigment load (1.15), granulation (0.5), hard edges (0.6), dry brush (0.6), rigger (0.7) | |
| Oil | stroke width (8), coverage (1), bristles (9), dry-brush breaks (0.3), impasto (1), knife lights (260) | |

Other controls:
- **Apply changes** repaints.
- `R` makes a new seed and `S` saves a PNG.
- `?under` shows the colourised frame alone, which is what the painters work from.
