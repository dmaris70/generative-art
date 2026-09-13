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
as they are placed), so a sheet that fails a tenet says so. The same pattern
fits any dogma that states itself as rules: De Stijl (no two planes meet at a
corner), Palladio (mirror symmetry), Metabolism (capsules attach only to the
spine).

## 6. Extending it

- **A new style** is one file in `lib/styles/` exporting `{ key, header, titles,
  substyles, types, palettes, sites, shapes, floors, legend, size(), build(ctx) }`.
  `build` places geometry through `scene.box / face / line / faces / custom` and
  tallies with `scene.count`; the ten legend tags are whatever it counts.
- **A new site** is a recipe in `Site.build` composed from the existing vocabulary.
- **A new palette** is an entry in `PALETTES` in `sketch.js`; styles list which
  palettes suit them.
- **A new paper** is an entry in `Paper.KINDS`.
