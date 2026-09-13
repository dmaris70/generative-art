# Isometric Strata — design notes

How the four reference sheets were taken apart, and how the code puts them back
together generatively.

## 1. Analysis of the reference sheets

Four sheets, one family. Every sheet is a portrait page (3:4) with the same
fixed chrome around a variable drawing:

| region | what is there | varies by seed? |
|---|---|---|
| **paper** | mottled off-white or grey stock, fine blue-grey graph ruling over the whole page, working marginalia: pencil scribble loops, dither/halftone test squares, hatch swatches, faint construction lines | tone (VINTAGE / STANDARD / ROUGH), ruling pitch (LARGE / SMALL), marginalia placement |
| **title block** | two-line title (a big outlined technical face, then the style / type or floor count), DWG id, sheet number; a second box with VIEW / DETAIL / DENSITY / SITE; the palette's swatches; a north arrow | all text and the swatches |
| **drawing frame** | a ruled rectangle; floor levels F1…Fn ticked up the left margin at the building's floor pitch | frame fixed, floor scale from the building |
| **the drawing** | a true 30° axonometric of one or two buildings on a site that runs past the frame | everything |
| **footer** | LEGEND: ten symbol + `NAME(COUNT)` entries in two columns; PROJECT #NNNN with a scale bar and the building type; a specification box with a style header and ten key/values (STYLE, FLOORS, SHAPE, GRID, PALETTE, INK, PAPER, STRUCT or CIRC, BLDGS, MODE) | counts, values |

The drawings share a rendering hand — lines wobble slightly, are sometimes laid
twice, overshoot at corners; colour is translucent and grainy like coloured pencil;
tone in the monochrome sheet is ruled hatching whose direction follows the face —
and a site vocabulary: an isometric ground with a paving grid, roads as double
kerbs with a dashed centre line, small scribbled trees on stalks, neighbouring
blocks as outline boxes with window rows, plaza panels (hatched, diamonds, a
fountain octagon), a hatched hillside escarpment.

What differs is the **building grammar**:

- *Emotional Architecture / Patio Mat* — Barragán: a mat of thin tall coloured wall
  planes on a grid, patios, a pool, slit openings, a tower with a roof mesh, stairs,
  a lattice. Legend: MURO, PATIO, AGUA, CELOSIA, LUZ, TORRE, MASA, GRADA, PIEDRA, VANO.
- *Decon Diagram / Crystalline* — a sheared prism densely hatched, a bundle of tall
  thin columns, floating tilted planes and ramps on a spine, cantilevers, frames.
  Legend: GRID, SHARDS, PLANES, RAMPS, FRAMES, VOLUMES, CANTLVR, BRACING, SCREENS, FLOORS.
- *Geodesic Diagram / Expo Sphere* — stepped mast clusters crowned by geodesic
  hemispheres, rings, hexagonal decks, footings, orange hubs and dimension notes.
  Legend: LATTICE, PANELS, DOMES, DECKS, SHELTERS, HUBS, RINGS, FOOTINGS, MASTS, PATTERNS.
- *Brutalist Diagram / Mosaic* — coloured outline structure: slabs, cores with
  x-bracing, walkways, a field of pilotis, a mosaic of hundreds of unit cubes.
  Legend: GRID, PILOTIS, BRISE, PARAPET, WALKS, SLABS, CORES, REVEALS, UNITS, FLOORS.

The legend counts are large and specific (`VANO(15)`, `UNITS(522)`), which is the
tell that they are tallied from the geometry rather than written — so the generator
must count what it places.

## 2. Decomposition

```
sheet
├── paper            texture, ruling, marginalia                      lib/paper.js
├── chrome           title block, north, swatches, frame, floor       lib/sheet.js
│                    scale, legend, scale bar, specification
└── drawing
    ├── projection   30° isometric, painter's depth                   lib/core.js
    ├── scene        faces / lines / custom glyphs, depth-sorted      lib/core.js
    ├── plan         footprint masks, rectilinear outlines            lib/plan.js
    ├── site         ground, roads, paving, trees, neighbours,        lib/site.js
    │                plaza panels, escarpment, water
    ├── styles       one generator per building grammar              lib/styles/*.js
    └── hand         wobbling strokes, dashes, clipped pencil /       lib/render.js
                     hatch fills, single-stroke lettering
```

Every layer is data until the hand draws it: styles and the site emit 3-D
primitives into a `Scene`; the scene knows nothing about p5; the renderer knows
nothing about buildings.

## 3. Pipeline

1. **seed → spec.** One seeded PRNG (`ISO.rng`) picks the style, then everything
   the specification box lists: substyle, type, footprint shape, site (weighted per
   style), detail level, site density, paper, ruling, ink weight, floors, floor
   height, building count, palette. Forked streams (`rng.fork('style')`,
   `'annex'`, `'site'`, `'hand'`) keep the generators independent, so a parameter
   that adds an annex does not reshuffle the main building.
2. **spec → scene.** `style.size()` sets the footprint; `style.build(ctx)` places
   parts and calls `scene.count(tag)` for each; an annex is the same generator on a
   smaller plot with fewer floors; `Site.build()` surrounds the union of the plots.
3. **fit.** The projected box of the building sets the scale (about half the frame
   wide); the site runs on and is clipped by the frame, as on a real sheet.
4. **render.** Paper texture → ruling → marginalia → the scene, back to front
   (`layer`, then `x+y+z`), clipped to the frame → the chrome → the paper's own
   texture multiplied back over everything for pencil tooth.

## 4. The hand

`Hand.line` resamples each segment, bows it with two random sine terms, jitters the
ends and extends them by the overshoot; a second pass, when asked for, is a
separate wobble at lower alpha, so edges read as drawn twice. Dashes are cut by
length before wobbling. `Hand.poly` clips to the polygon (canvas `clip`) and then
either flat-fills, lays a flat base plus two families of near-parallel strokes
(**pencil**), or rules lines at a spacing and angle (**hatch** / **cross**); the
angle can be a number or `'edge'` / `'side'`, which follow the projected face —
that is what makes the decon prism's hatching lean with its shear. Lettering is the
repo's single-stroke font, run through the same line renderer with a small wobble;
bold is the text drawn twice with a shift.

One subtlety: canvas `save`/`restore` around a clip resets the context's fill
colour behind p5's back, and p5 caches the last style it set — so `unclip` re-syncs
with a sentinel colour.

## 5. Dogma as predicate

A style can carry a doctrine as well as a vocabulary. `styles/corbusier.js`
builds Le Corbusier's Five Points and then runs each tenet as a predicate over
the finished scene — no wall below the first floor, partitions off the column
grid, a façade standing clear of the columns, ribbon glazing over most of the
façade length, a planted roof behind a parapet — and returns `TENETS n/5` for
the specification box. The count comes from what was drawn (items are tagged
as they are placed), so a sheet that fails a tenet says so. `styles/destijl.js` does the same
for Van Doesburg's plastic architecture: every tagged face axis-aligned, no plan
corner closed by two planes at one level, no mirror axis (a plane counts as
mirrored when its reflection is also a plane), no primary-coloured face larger
than a door, every slab overrunning the volume. `styles/metabolism.js` carries a growth rule
rather than a composition rule: every capsule attaches to a shaft face, no
capsule touches another, at least an eighth of the slots stay vacant, capsules
on consecutive levels of a face do not stack in one lane, and every capsule has
a service branch — so the legend's MODULE minus CAPSULE is the number the
structure could still accept. `styles/palladio.js` is the first classical
grammar: the plan mask is mirrored (`plan.mirror`), and the symmetry tenet is
stated for a culled drawing — every drawn face whose mirror image would face
the viewer must have that image drawn — alongside the portico on the axis, an
ABA bay rhythm, wings lower than the block, and a block proportioned to one of
Palladio's ratios. Writing it exposed a renderer defect: prism sides were culled
by their plan normal alone, so a hipped roof's far slopes, which face upward,
were dropped; `geom.prism` now tests the true face normal. `styles/archigram.js` inverts
the Metabolist shaft: the envelope is a volume (the rig's footprint up to its
height), every mast, truss and tie must lie on it, every duct, escalator and
tank outside it, nothing but decks and pods within it, every pod resting on a
deck or a pod, and a crane with a pod in the air — the drawing has to show the
city changing. `styles/mies.js` is the
series' stress test — the one grammar that succeeds by removing parts — and its
module tenet caught two set-out errors on the first run: column bays that were
not whole modules, and a glass line set half a module in from the columns.
Both are now on the module, which is what the tenet is for. `styles/cycladic.js` is the
first grammar built from a settlement rule rather than a building rule — the
tenets are about the aggregate: no house above two storeys over its own
ground, one connected cluster (a flood fill over the occupied cells), every
flat roof behind a parapet, ground rising row by row, blue on doors, shutters
and the dome only. `styles/rossi.js` is typology: only
archetypes may stand in the court, windows are one square repeated and set out
symmetrically on each face, every façade keeps its window share small, the
whole leans off the court's centre, and every solid casts a hatched shadow —
the hull of its footprint and its footprint carried up and over — from the one
sun; the shadows' directions are the fifth predicate. The silent-façade tenet
caught a bookkeeping error (glazing split evenly across two faces of unequal
size) on the first run. The same pattern fits any dogma that states itself as
rules: Kahn (served and servant spaces), Hejduk (masques).

## 6. A second sheet type

Because the scene is pure data, a second projection costs one function and a
layout. `Hand.renderView` clips every face and line to a half-space (Sutherland–
Hodgman for polygons, segment clipping for polylines), sorts by a depth key the
view supplies, draws the surviving geometry through the view's projection, and
then draws every edge where the cut passed through a face as a heavy line. The
plan keeps `z ≤ datum + 1.2…1.6` and sorts by z (a roof plan of what is left,
which is the ground floor with its walls cut); the section keeps `y ≤ cut` and
sorts by y so the far half draws as elevation. Custom glyphs carry an optional
`alt(hand, P, view)` — a tree is a circle in plan and a lollipop in section.
Styles on a podium or a plinth return a `datum` so the plan is cut above their
own ground floor, not the site's.

## 7. The portfolio board

`lib/strata.js` is the facade: `build(opts)` turns a seed and a few overrides
(style, view, floors, detail, density, buildings, site, paper) into a state —
spec, scene, legend, both fits, tenets — and `paint(g, state)` draws that state
as a sheet scaled to any renderer's width. The sketch is one client; the
portfolio board (`portfolio.js`) is another: it plans a set of build specs, paints
each into its own graphics buffer one per frame, and lays the buffers on a board
under a shared title strip with captions. Nothing in the styles or the site knows
which client is calling.

## 8. The token layer

`lib/traits.js` makes each sheet self-describing for a minted series. Seventeen
traits are read off the state (never off the drawing). Their rarity is measured:
`tools/strata-rarity.mjs` runs `Strata.build` for thousands of seeds in Node —
the build never touches p5 — tallies every value's frequency, computes each
sample's information score (the sum of −log2 p over its traits) and writes a
thinned quantile ladder of those scores to `lib/rarity.js`. A token's score is
placed on that ladder to give its rank ("TOP 12%") and overall tier; each trait
carries its own frequency and tier. The schedule column draws all of it in the
chrome's idiom, and `Strata.metadata` emits the same as ERC-721 JSON. Because
the table is empirical, a generator change that moves the distribution means a
re-run and a version bump; the sheet prints the basis it was ranked against.

## 9. The edition

Seeds are unlimited; looks are not. A look — style, substyle, view, palette — is
what a collector sees before the schedule, and the generator holds about 360 of
them (measured: 400 seen in 30,000 seeds, 363 effective by entropy). Drawn at
random, half of a 256 edition would share a look with another token; curated,
none does. `tools/strata-select.mjs` is that curation as a deterministic
procedure with every rule written down and every rejection counted, so the
edition is reproducible from the pool and the rules, and the sheet prints the
edition number it was given.

## 10. Objective curation

A curatorial pass without a curator: two filters, both written down and both
measured. The state gates run over the whole pool before selection — part count
and ink load banded per style at the 10th and 90th percentiles, the building's
projected proportion, the site's share of the scene, empty legend entries, the
geometry a section cut actually meets. The rendered audit then measures the
selected sheets from their pixels — ink coverage relative to the sheet's own
paper luminance (so vintage and rough stock are judged alike), colour presence
against the same palette, the ink centroid's offset on axonometric sheets — and
flags outliers against the style's median. Two calibration lessons are worth
keeping: measure at full sheet width, since half-pixel lines vanish at half
size, and never count a flat colour field as ink, or a bold slab reads as mud.
Flags become exclusions with their measurements attached; the selector replaces
each excluded seed with the next candidate of its look; audit and selection
alternate until no sheet is flagged.

## 11. Extending it

- **A new style** is one file in `lib/styles/` exporting `{ key, header, titles,
  substyles, types, palettes, sites, shapes, floors, legend, size(), build(ctx) }`.
  `build` places geometry through `scene.box / face / line / faces / custom` and
  tallies with `scene.count`; the ten legend tags are whatever it counts.
- **A new site** is a recipe in `Site.build` composed from the existing vocabulary.
- **A new palette** is an entry in `PALETTES` in `sketch.js`; styles list which
  palettes suit them.
- **A new paper** is an entry in `Paper.KINDS`.
