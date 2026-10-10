# 039 — Ridge, encounters — stroke by stroke

**Mechanism (one sentence):** the scene of [028 — Ridge, encounters](../028-ridge-encounters/)
(coloured by [038](../038-ridge-encounters-painted/)'s bridge) is painted in oil one stroke
after another. A painter looks at the canvas before every stroke and chooses where, which mix
and which way to go. Paint behaves as paint while each stroke is laid: it mixes as pigment,
blends into wet paint, covers dry paint, runs out and breaks into dry brush.

The same seed gives the same scene as 028 (v1.4) and 038. 028's engine and 038's bridge are
loaded from their folders, not copied. 028 is frozen; **039 depends on 038's `bridge.js` and
`tools.js`** (for `mixRGB`), so a change there changes 039's subject.

## Why

036–038 plan every stroke up front from the target picture and blend colours on screen. The
brush never runs out, nothing smears, and no stroke sees the ones before it. 039 asks what
changes when the order and state of the paint are real.

## The paint (`paint.js`)

- **Pigments.** Nine oil colours plus medium:
  - titanium white, ivory black, ultramarine, cerulean, burnt umber, burnt sienna, yellow
    ochre, cadmium red light, Naples yellow;
  - each defined as a painter would test it: masstone (thick) and tint (1 : 4 with white);
  - absorption **K** and scattering **S** are solved from those two by the two-constant
    Kubelka–Munk method, with one S per pigment. With S per channel, a yellow over a dark
    ground turned green.
- **Colour is computed, never blended.** A pixel's colour is its wet layer's K and S at its
  thickness over the dried colour beneath (Kubelka's layer formula). So:
  - ultramarine and ochre make green; black and ochre make olive;
  - a medium-rich layer is a transparent glaze;
  - a thick white-rich layer hides what is under it.
- **The canvas, per pixel:**
  - the wet layer (volume of each pigment and of medium);
  - the dried layers' colour;
  - paint height;
  - when it was last painted;
  - a linen weave (tooth).
- **The brush:** a flat bristle brush, each bristle with its own load and stiffness. Loading
  it is uneven (a brushful is never perfectly mixed).
- **A stroke, bristle by bristle and pixel by pixel:**
  1. the bristle picks up wet paint that earlier strokes left, the more the fresher it is
     (open time), and carries it on;
  2. it then lays paint from what it holds, in proportion to how loaded it still is, so a
     stroke runs out;
  3. a spent or lightly pressed bristle reaches only the tops of the weave and skips in runs
     along the stroke (dry brush).
- **Brush shapes**, as a painter keeps them, differ in how the footprint answers pressure:
  - **flat:** square-ended, nearly the same width whatever the pressure (blocks, planes);
  - **filbert:** lands narrow and opens as it is pressed (oval ends);
  - **round:** a touch is a thin line, pressed it swells, lifted it leaves a pointed tail.

  The bristles waver a little across the footprint. (v1's single flat brush left the finest
  strokes as small rectangles.)
- **Time and drying.**
  - **Clock.** There is a painting clock in minutes. Each stroke takes about half a second plus
    a second per 200 px. Each dip into the palette, each wipe and each new mix takes its time.
  - **Drying.** Each pixel's wet layer dries on its own schedule: about 6 h × (0.3 +
    thickness) × (0.2 + 2 × fatness), divided by the drying speed. Thin lean paint dries in
    hours, thick fat paint in a day or more.
  - **Setting.** As paint sets, the brush picks up less of it, falling with time over about
    a third of its drying time.
  - **When it dries.** Every quarter hour of painting, whatever has had its time dries: it
    joins the dried colour and relief, and what goes over it glazes or covers instead of
    mixing in.
  - **Sessions.** The painting stands overnight (18 h) after the block-in. (v1 dried
    everything at once at a session's end and counted open time in strokes.)
- **Fat over lean.**
  - Each session's paint carries more oil than the one under it: block-in 0.08 (turpentine),
    body 0.25, detail 0.35, lights 0.42.
  - A layer that dries leaner than the one under it keeps a strain, recorded per pixel.
  - The `layers` control can break the rule (lean over fat), and the painting then cracks
    early.
- **Age.** The age control (years) dries the painting through, then ages it:
  - **Yellowing:** the oil yellows where there is more of it, and the varnish yellows over
    everything.
  - **Craquelure:** islands on a warped jittered grid, opening in patches and more in thick
    paint, from about 30 years.
  - **Early drying cracks:** wide and dark, wherever lean was laid over fat, within years.
- **Display:** a raking light over the paint's height (stroke ridges, impasto, the weave where
  paint is thin), with a sheen on paint that is still wet.
- **Resolution.** Each sheet is painted at its picture size × the canvas resolution. On auto,
  that is as many pixels as the screen shows, in 0.5 steps from 1× to 1.5×.
  - Brushes, the weave and the light scale with it, so a 1.5× painting is the same painting,
    finer.
  - While a sheet is painted, its state takes about 120 MB at 1× and 250 MB at 1.5×. 2× can be
    chosen and takes about 700 MB.
  - When a sheet is finished, only its image is kept.

## The painter (`painter.js`)

**Sessions**, as an alla prima oil is painted:
1. Toned ground: white-primed linen with a thin warm imprimatura (umber, sienna, ochre).
2. Block-in: one broad brush, lean paint over everything; it is let dry.
3. Body: two brushes, wet into wet.
4. Detail: a fine brush, wet into wet.
5. Loaded lights: thick paint in the lightest places.

**For each brush** (after Hertzmann 1998):
- the subject is softened to the brush's scale;
- the canvas is compared with it in OKLab;
- a stroke starts at the worst pixel of every cell whose error is above the tolerance.

**Order:** a painter mixes a colour and lays it everywhere it belongs, so places are taken by
colour, darkest first and lights last.

**Each stroke:**
- **Look again:** if the place has been put right since the pass began, it is skipped.
- **Mix:** the nearest mix on the palette to the subject there. Its value is pushed past the
  subject by how far the canvas is off (the paint will mix with what is wet under it). Hue is
  not pushed: pushing it cancelled an orange canvas with teal, and back.
- **The palette is kept as a painter keeps it.** Piles of mixed paint stay on it while the
  painting goes on (up to 14; the least recently used is scraped off):
  - a wanted colour is taken from a pile within ΔE 0.012;
  - failing that, the nearest pile within 0.12 is worked toward it with touches of tube paint,
    so the colours of a painting come out of one another;
  - failing that, it is mixed fresh from the tubes;
  - a brush dipped in a pile while it still holds other paint leaves some there (the
    `dirty palette` control), so the piles drift together;
  - a fresh pile is not yet worked smooth, so a brush loaded from it carries more streaks.

  On 221429's left sheet this gave 21 fresh piles, 149 derived ones and 1,491 reloads from
  existing piles.
- **The tube mixes** tint the way paint allows: one to three colours in relative proportions
  (1, 2, 4, 8), with white from none to 64 times their amount. That is about 20,000 mixes;
  the scene's colours are reached within ΔE 0.005–0.009 (OKLab). Mixes in eighths could not
  make a muted tint: a sky beige became salmon, a warm grey green-grey.
- **The brush:**
  - carried on with while its paint is close and it is not spent;
  - topped up when the new colour is near (the brush stays dirty: contamination);
  - wiped on the rag first when the new colour is far.
- **Direction:** along the subject's isophotes where it has structure; level in the sky and far
  off; the fall line on near ground, turned toward the body's movement (038's rules on 028's
  buffers).
- **Length:** the stroke goes on while its colour is closer to the subject than the canvas is.

## Results (v2, 1×)

Each render is compared with 028's own frame for the same seed (038's `?under`): block
luminance (12 px blocks at 1400 × 860) and colour (mean OKLab ΔE ×100 per block), per sheet.

| Seed (register, light) | Mean (vs 028) | Block MAE | r | ΔE ×100 |
|---|---|---|---|---|
| 221429 (clearing, against) | 144 / 157 (146 / 159) | 2.8 / 2.7 | 0.99 / 0.99 | 1.2 / 1.1 |
| 20833364 (clearing, side) | 162 / 133 (163 / 135) | 2.7 / 2.2 | 0.99 / 1.00 | 1.1 / 0.9 |
| 22262986, grisaille | 185 / 172 (186 / 173) | 2.1 / 2.3 | 0.99 / 1.00 | 0.9 / 1.0 |
| 22414005 (passage, moon) | 87 / 98 (89 / 99) | 2.4 / 1.9 | 1.00 / 0.99 | 1.0 / 0.9 |

v1's figures were within ±0.2 of these: the new palette, brushes and drying cost nothing in
fidelity.
- 221429 is painted in 22.4 hours on the clock: 0.8 h of block-in, 18 h standing, 3.6 h of
  body, detail and lights.
- A diptych takes about 50 s at 1× and 150 s at 1.5× in the test container.

For reference:
- **038's oil** on 221429 scores MAE 2.4 / 2.7, r 0.99, ΔE 0.9 / 1.0. Its strokes take their
  colour straight from the target.
- **039 never copies a pixel**: every colour is a palette mix, laid physically.
- **038's watercolour** scores MAE 10.6–17.8.

**What looks different from 038** (`compare.png`: 028's frame, 038's oil, 039, right sheet of
221429):
- 038 lays strokes of even density and jittered colour everywhere.
- 039 lays broad, blended strokes where the subject is smooth (wet into wet) and marks only
  where it corrected. It does this with far fewer strokes: about 9,400 for this diptych.
- The toned ground glints through breaks in the paint; the lights stand in impasto.
- **The dark moonlit scene needed nothing special.** In 038's watercolour it needed a toned
  ground, because transparent washes on white paper could not reach it; dark oil paint is
  opaque.

**Render time** (test container, CPU-only browser): about 50–65 s for a diptych. Each sheet is
5–10 s of painting; the rest is lighting the paint for display.

### Found by measuring while building

- **Palette resolution.** Mixes in eighths could not make muted tints. The nearest to a beige
  was a salmon and to a warm grey a green-grey, so the sky came out orange and teal.
  - The colours were wrong per stroke but averaged right per block (mean b +0.8, not a
    visible bias).
  - Seen only side by side with the target.
- **Hue compensation oscillated.** Choosing a mix by how it would look over the current canvas
  cancelled orange with teal and teal with orange. Value is still corrected; hue is not.
- **Tolerance.** At 0.045 (OKLab), an orange patch 0.04 off a beige counted as right. Default
  is now 0.03.
- **Dry-brush onset.** Breaks began at 40 % load and stippled the whole picture. They now start
  below about 20 %.
- **Lights.** "Lights" were anything lighter than 0.8, which in a whiteout is the whole sky.
  They are now the sheet's own lightest tenth.
- **Value push** is capped at 0.08 lightness; a strong correction alternated light and dark
  dabs.
- **Relief.** Lighting per pixel made partly laid paint glitter. The slope is now taken over
  2 px, and paint height is compressed.
- **Name clash.** `painter.js` declared `PARTS`, which is 028's global. The page failed
  silently and a render "ran" for twenty minutes. The lint pass now checks redeclarations.

## Known gaps (v2)

v1's gaps (resolution, rectangular strokes, no palette mixing, all-or-nothing drying, no fat
over lean or ageing) are addressed above. What remains:
- **Oil only.** Watercolour needs water flow on the paper (pigment carried and deposited at
  the edges); it comes next.
- **Simplified drying.** Drying is a per-pixel clock, not the chemistry of oxidation: a layer
  is wet or dry, with no skin over a wet interior.
- **Craquelure is a pattern, not a stress simulation.** It follows age, paint thickness and
  recorded fat-over-lean strain, but the islands come from a warped grid.
- **Short strokes.** The shortest detail strokes (four steps) can read as pills in smooth areas.
- **Auto resolution stops at 1.5×** for memory. 2× must be chosen.

## Controls

| Group | Parameter (default) |
|---|---|
| Painting | palette (full / grisaille: white, black, umber), glow of the light (1) |
| Scene | register, rare event (as 028), movement of the body (1) |
| The painter | finest brush (7 px), tolerance (0.03 OKLab), correction in the mix (0.4), wipe the brush past (ΔE 0.12) |
| The paint | pickup of wet paint (0.3), a brushful lasts (6 widths), unevenly mixed brushful (0.12), dry brush (0.5), loaded lights (1), relief under the light (0.45), dirty palette (0.5), drying speed (1×), layers (fat over lean), age (0 years), canvas resolution (auto) |

Other controls:
- **Apply changes** repaints.
- **🔀 shuffle everything** (or `X`) draws all settings at random, with limits:
  - finest brush 5.5–12 px;
  - tolerance 0.025–0.06;
  - correction 0.2–0.6;
  - a forced rare event only half the time;
  - aged 40 % of the time;
  - lean over fat 20 % of the time;
  - resolution left on auto.
- `R` makes a new seed and `S` saves a PNG.
- The status line shows the session, brush, clock and stroke count; when done, the hours at the easel and the resolution.
