# 041 — Fog Thicket

**Mechanism (one sentence):** plants are grown in metres, in 3-D, on a ground planted once and
projected through a camera, and fog is a single law, p = exp(−distance · mean σ over the altitudes
the sight line crosses), read as the chance that a stretch of line is inked at all. Nothing is shaded and nothing hides anything: the dark band is where the
twig zones of every depth project onto the same height of the sheet, and the pale is where the air
has taken the ink.

This is a **study and reconstruction of a system**, built on 2026-10-12 (as 039, renumbered 041 on
2026-10-13 because 039 and 040 were taken on main) from one black-and-white
photograph supplied in conversation: bare saplings in fog over snow. The photographer and title are
**not known and are not asserted**. No image is copied. It is listed in the gallery index
(`projects.json`) from 2026-10-13; `thumb.jpg` is a 16:10 crop of the source reading.

The default seed, `hash("041-fog-thicket")` = 2083401616, is the **source reading**: two strata as
read from the photograph. Every other seed is a new landscape under the same law.

## Deconstruction: what the photograph is made of

| observed in the photograph | rebuilt as |
|---|---|
| a near-black horizontal band across the middle, no single tree legible in it | a **thicket** stratum spread over depth 3.8–26 m; each clump is bare below and twigged above a zone (~46% of its height). Near and far zones project onto the same band of the sheet near eye height, so the band is pure overlap |
| a soft, ragged top to the band; a fairly level bottom | clump heights vary ±30%; the bottom is the far clumps' bases converging on the horizon |
| thin stems reaching down into the white, longer and thicker toward the bottom of the frame | the near clumps: their bases sit low on the sheet (perspective) and their bare lower stems show against snow; thickness is passes, not stroke width |
| tall pale poles above, branching higher up, fading toward the top | an **aspen** stratum behind (13–32 m, 13.5 m tall) under fog that thickens with altitude ("fog aloft"), so the tops lose ink first |
| fine twigs vanish in the fog before trunks do | inking probability is p^(1 + 0.5·(order − 1)): thin orders fade faster; a trunk's outer passes fade before its centre pass |
| the snow is just paper | the ground is not drawn |
| film grain | `tooth`: paper grain where ink skips (PNG only; the SVG is clean line) |

## Reconstruction: the generator

1. **Plan** (seeded): horizon height, fog mode (aloft / ground / bank / clear) and its constants,
   ground (snow / drift / water / roots), hills, 1–4 strata and an optional event.
2. **Strata.** Each is a species with an arrangement over a depth range: `scatter` (density uniform
   per square metre of ground), `clump` (patches with clearings in between, from a noise mask) or
   `row` (planted lines). Species: thicket clumps, aspen poles, forked crowns, spruce spires,
   weeping trees whose strands rise, arch and hang, reed tufts.
3. **Growth** happens in metres and in 3-D: a turtle that knows only wiggle, pull toward vertical,
   droop, curl and wind walks each branch in its own vertical plane, whose compass direction is
   near its parent's; limbs and whorls go round the stem by the golden angle.
4. **The world and the cameras.** The world is fixed before any camera looks at it. The reference
   eye, 1.6 m above the snow and looking level, defines it: each stand is planted across a wedge
   1.7 times as wide as that eye's gaze. Five pinhole cameras (pitch only) look at the same world:
   **eye** (the reading), **low** (0.35 m), **raised** (7 m, behind the eye), **aerial** (42 m),
   **overhead** (150 m, nearly straight down). Raised and aerial are sized by the width of the
   nearer stand and let the rest run off the sheet; overhead is fitted to the whole plan. From
   above, the wedge is the shape of the forest: the stand is exactly as wide as the eye's gaze.
   One sight line per 1.5-unit cell of the field is traced through a 0.45 m height field of the
   ground; a point is dropped when its sight line meets the ground first, so ground forms show only
   by what they cut off, from any camera.
   - **Ground form** (`ground form`): flat, rolling, high, **valley** (a floor and walls that steepen
     away from it; width is an angle from the eye and height grows with distance, so the walls keep
     their slope on the sheet) or **ridge** (one crest across the view, nearer on one side, a long fall
     behind it).
   - **Snow banks** (`snow bank`): every form carries one or two banks across the view, up to about a
     metre high, plus low drifts. From 1.6 m a bank hides the ground for some metres behind it, so the
     stand there loses its base along the crest. That cut is the **snow line**: it is not drawn, it is
     what the bank hides. (Drifts of a few decimetres were tried first and hid almost nothing: 2% of
     low points.)
5. **Fog along the sight line.** τ = distance × the mean of σ over the altitudes the sight line
   crosses (six samples). Fog aloft thickens with height up to a top at 22 m, above which the air is
   nearly clear, so a camera above it looks down through it.
6. **Fog as inking.** Each line is walked in 1.4-unit chunks; a chunk is inked when a coherent noise
   along the line falls below p. At p = 1 the line is whole, at p = 0 it is gone, in between it breaks.
   If the fog would leave less than a tenth of the source reading's ink, the air is thinned by half
   (at most three times) and the sheet is inked again.
   Every line's inking noise is keyed by its plant, branch, pen pass and kind, never by drawing
   order; plants are drawn one after another from their stratum's stream. So more density only adds
   plants: every existing plant keeps exactly its lines (checked: 0 of ~95 000 lines changed for
   scattered and clumped strata; planted rows re-space by design).
7. **Ground.** `drift`: a few broken level contours. `water`: plants stand beyond a shore and their
   mirror images are drawn only on the water, in level bands that are kept or lost and slide sideways.
   `roots`: the same plants grown down into the ground, fading with depth.
8. **Events.** `clearing`: an ellipse of ground where nothing is planted. `lone tree`: one large plant
   near the eye, off-centre, cut so its crown stays on the sheet.

## Monument scale

`scale: monument` keeps every law and changes the world: a landscape at the scale of kilometres.

- **The eye stands at the lip of an escarpment** 40–120 m above a valley (the drop is steepest at its
  lip and eases onto the floor, so no shoulder hides the slope below). Standing even 20 m back from
  the edge hides the whole valley floor; that was tried and failed.
- **Three to six ranges** stand at 1.5–24 km. Each is taller in proportion to its distance, by a
  slope that grows with its rank, so every range shows over the one before by about the same angle:
  the ranges stack.
- **The forest is planted over the whole landform by zone and altitude**: reed tufts on the ledge
  underfoot (the photograph's thin stems, reaching down), reeds and scrub at the water, stands of
  spruce and aspen on the valley floor, spruce forest with aspen groves on the slopes, a ragged
  treeline, bare summits. A lake fills the valley floor when the ground is water, with the
  mirror-image law of the stand scale.
- **Density is true out to 600 m and thins as (600 / distance)² beyond**, so the far forest keeps a
  constant density on the sheet: each far mark stands for (distance / 600)² trees. This keeps the
  sheet to a few thousand trees (3 000–4 000 typical) instead of millions.
- **Near trees are grown in full; trees under 40 sheet units tall are drawn as the distant mark** —
  each species reduced to what survives at a few units (a spruce is a stem and a few pairs of
  drooping strokes). Trees that would stand over 120 units are made rarer in proportion, so the view
  from the edge stays open; one giant (a forked tree or a spruce) may stand just below the lip at
  one side and frame the view.
- **Nothing about a range is drawn but its crest** (the silhouette from this camera: along each
  range, the point of its face highest above the camera's line of sight) **and, above the treeline,
  its fall lines**: short strokes down the steepest descent of each bare face, as dense as the face
  is steep, stopping where the forest begins. The fog inks all of it, so the ranges pale in order.
- **The fogs are the same law at valley scale**: valley fog (pooled below a fraction of the
  escarpment's height), cloud ceiling (thick above an altitude, summits in cloud), fog belt (along
  the slopes), haze.
- **Formats**: portrait, landscape, panorama (lens 36°, 46°, 62° across), for both scales.
- **Cameras** at monument scale: vantage (the lip), valley floor, raised 300 m, aerial 3 000 m, plan.
- The ground is traced on three grids (2 m near, 12 m to 4 km, 90 m to the far ranges); the first
  render of a monument takes about 1.3 s, later ones (fog, density, register) about 0.6 s.

## Registers

- **line** (default) — the plotter drawing: fog breaks the line; one ink, no fills.
- **tone** — the same law read as luminance. A line at survival p is drawn at ink·p + air·(1 − p),
  never broken, split only where its grey step (of 24) changes. The ground is washed by walking each
  column of the field outward from the eye: every stretch of sheet a depth newly shows is filled with
  snow (or water) seen through that much air; what no ground covers is air. Hills, valleys, ridges and
  banks wash themselves by the same walk. Film grain replaces paper tooth. One air colour, no hues.
  The SVG of the tone register groups strokes by grey and omits the wash; use the line register for
  the plotter.

The fog floor (step 5) tests the *expected* ink (length × p), so both registers make the same decision
and a seed is the same landscape in both.

## Provenance of the 2026-10-12 additions

**Second round (3-D world, cameras, stable ink keys).** Taken, as ideas, from a second version of
the same alternative solution ("DMCF / WINTER STUDY / V2", author not stated): a fixed world sampled
by a camera, 3-D branch geometry, several elevations, and keying thinning by tree rather than by
drawing order. No code was copied. Where V2's raised views are parallel projections with no hidden
ground and fog keyed to depth (they read as texture), here every camera is a perspective camera,
the ground is traced from each one, and fog follows the sight line through altitude.

**First round.**

Ground forms (valley, ridge), the snow line and the tone register were taken, as ideas, from an
alternative p5.js solution the user shared for comparison (author not stated). No code was copied:
there, rows are painted back to front, each covering the roots of the row behind with a filled snow
shelf, and tone is a per-row blend toward a fog colour with gradient veils. Here the same three effects
come out of the existing law (occlusion by ground, survival by air).

## Views

- **drawing** — the sheet.
- **strata** — the drawing taken apart: each stratum alone, the ground marks, the fog law as a field
  (depth across, altitude up, ink = what the fog takes, strata as sepia bars), and the whole.
- **construction** — a thinned drawing; in sepia the eye line, the ground at 4/6/10/20/40/80 m, each
  stratum's band of ground, the clearing, the shore, and the survival curve p(altitude) at 20 m.

## Controls

`register`; `scale` (stand, monument); `format` (portrait, landscape, panorama); `camera` (eye, low,
raised, aerial, overhead); `fog` (aloft / low / bank / clear; at monument scale: ceiling / valley /
belt / haze), `ground`, `ground form`, `event`, `strata` (0 = from the seed); `snow bank`
(metres, −1 = from the seed); `fog amount` (multiplies σ), `density`, `horizon` (0 = from the seed),
`wind`, `pen` (sheet units), `tooth` (paper tooth, or film grain in tone), `output`.
Keys: **R** new seed + new parameters · **C** next view · **E** next camera · **T** line / tone · **S** save PNG · **V** save SVG.

## Material

Line register: ink `#1a1a1a` only in the drawing; sepia `#8a6a3d` only for construction annotations. Every mark is
a polyline clipped to the field; stems are 1–7 parallel passes that end one by one along the stem
(the taper). The SVG has one group per pen and is plottable as it stands.
