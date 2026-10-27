# Isometric Strata v2 — the second line of the engine

Opened 2026-10-27 from the frozen v1.0 (`projects/011-isometric-strata`, tag `v1.0`).
This folder is where the engine moves again. The first series does not: v1.0's 26 fingerprinted
files, its rarity table, its edition of 256 and its archived assets stay exactly as recorded, and
every token's `external_url` keeps pointing at the v1.0 page. Nothing here may edit `011-`.

## 1. What carries over

Everything, as a copy: the core (`core.js`), footprints (`plan.js`), the hand (`render.js`),
paper, sheet chrome, the six sites, the twelve styles with their eight dogmas-as-predicates,
the facade (`strata.js`), the token layer (`traits.js`), the sheet client and the portfolio
board. Two things change on day one:

- **Version and series.** `Strata.VERSION` is `2.0-dev` and the series reads `ISOMETRIC STRATA II`
  until this line is named. No rarity table, no edition, no freeze are loaded: every sheet
  prints `GENERATOR V2.0-DEV`, traits show as `UNRANKED`, metadata names tokens by seed.
- **A vendored harness.** `vendor/genart.js` and `vendor/strokefont.js` are copies of the shared
  `assets/` files. v1.0's fingerprint included the shared files, and a later piece's edit to one
  of them broke the freeze check on `main` without touching a drawing. v2's freeze set will be
  self-contained: nothing outside this folder can change what it draws.

## 2. Rules of the line

1. `011-isometric-strata` is read-only. A v2 idea that would improve v1.0 is still a v2 idea.
2. Every change to a drawing-path file is a change to the future v2 fingerprint; the freeze
   comes last, after selection, as in v1.0 (`DESIGN.md` §11 there).
3. The tools in `tools/strata-*.mjs` are bound to `011-`. They are generalised with a project
   argument when v2 needs them (sampler, selector, audit, freeze, export, publish), not before.
4. Dogmas stay predicates: a new style ships with five tenets checked over the drawn scene.

## 3. Candidate scope

Listed, not chosen. Each is a bounded study with a visible result on the sheet.

**New dogmas** (one file each in `lib/styles/`, five tenets each):
Kahn (served and servant spaces, the plan reads as rooms around hollow piers); Loos (Raumplan:
split levels, the section is the drawing); Terragni (rationalist frame, the half-open grid);
Aalto (fan plans, one free curve against orthogonal wings); Wright Prairie (long low roofs, the
hearth as anchor, bands of windows); Bawa (tropical modernism: courtyards, verandas, deep eaves);
Ando (concrete planes and one slot of light); Constructivism (Leonidov and Melnikov: a sphere, a
mast, a cylinder clashing); Scarpa (the joint drawn at the larger scale).

**New sheet types** (alongside axonometric and plan-and-section):
the elevation sheet (four elevations on one sheet, shadows cast); the exploded axonometric (the
building lifted in layers, dashed leaders); the worm's-eye axonometric after Choisy (plan and
underside of the structure in one view); the site plan at a smaller scale (block, trees, roads,
north arrow, the building a roof); the detail sheet (one wall section at 1:20 with notes); the
drawing set (one seed, several sheets, numbered A-01, A-02 ... as a working set).

**Rendering studies:**
diazo and blueprint papers (white line on blue, brown line); coloured pencil and marker fills
with bleed; line-weight hierarchy by depth and by cut; a second lettering hand; title-block
variants by period; the scale figure and the parked car as scale cues; interior furniture in
cut plans; landscape with ground contours.

**Scene studies:**
interiors seen through cutaways; a second building type per style (civic versus domestic);
terrain with retaining walls; water with reflections drawn as hatching.

## 4. Steps taken

A step is done when it renders in the sheet client and the board, its tenets (if a dogma) are
reported, and the headless smoke test passes.

**2026-10-27 — the drawing set.** One seed is now a numbered set of five sheets, chosen first
because it changes what a collector receives and forces the orthographic sheet types to exist:

| Sheet | Content | Fit |
|---|---|---|
| A-01 SITE PLAN | the block around the plot from above, no cut; plot boundary dashed; section marks A-A and B-B; nominal 1:500 | plot plus 1.25 × its size each way, or the site if smaller |
| A-02 PLANS | the ground floor cut a little above the building's own datum, and a typical upper floor (or the roof plan for a single storey), one above the other; section marks on both | plot plus a 30 % margin, one scale for both bands |
| A-03 SECTIONS | A-A through the plot's centre along x looking at +y, B-B along y looking at +x; cut edges heavy; ground line with hatched earth; datum label | plot plus 4 m each side; the building's height, a tall neighbour may clip |
| A-04 ELEVATIONS | south, north, east, west, in four cells, nothing cut, the far things drawn first; ground lines | as the sections, per cell |
| A-05 AXONOMETRIC | the v1.0 sheet | as v1.0 |

`Strata.build({ sheet })` takes 1–5 (0 lets the seed choose, the axonometric most often; the
v1.0 `view` option still maps: 1 axon, 2 plans). The title block prints `SHEET A-0k / 05`,
the scale bar the sheet's nominal scale, and the floor scale in the margin keys to the first
section or elevation. The orthographic projections are the same half-space clip v1.0 used
for its plan-and-section sheet (`Hand.renderView`), with the projection and the depth key
chosen per view: an elevation from the south projects x and draws the larger y first; from
the north it mirrors x and draws the smaller y first; east and west likewise on y. Keys 1–5
pick the sheet in the client; the board's `sheets` set lays the five out for one seed.
Verified on seeds 940 (Mexican modern, plaza), 7 (Metabolism tower, city) and 12 (Cycladic,
hillside): no console errors, the tower's twelve floors align with the margin scale, the
hillside's contours read in the site plan and the terrain steps in section B-B.

**2026-10-27 — the volumetric model (solids, structure, spaces, quantities).** The drawing set
was first drawn by re-projecting the axonometric's faces, which cannot show a true cut. The
engine now holds a model beneath the drawings, in three layers:

1. *Solids.* `Scene.box` records every box as a solid (`scene.solids`); the orthographic
   renderer (`lib/ortho.js`) draws plans, sections and elevations from those solids with true
   faces, poché where the cut passes through mass (thin members hatch instead), structural-grid
   bubbles, overall and level dimensions, and level marks.
2. *Declarations.* Each style declares through `ctx.M` (`lib/model.js`): a structural grid,
   spaces (name, kind, footprint, level, height) and structural prisms. The recorder has its own
   rng so declaring never moves a style's random stream.
3. *Derivation.* `Model.derive` classifies solids (core, stair, base, column, wall, slab,
   mass, ornament) and measures: footprint, plan fill, envelope and solid/envelope ratio,
   slenderness, open ground, column count and bay, wall length, floor area, programme, open
   space. Structure is decided from the measured shares: FRAME, CORE, MASS, WALL or HYBRID.

Honesty rule: every figure in the schedule's QUANTITIES block and in `properties.model` is
measured from the drawn model, never asserted. Plans label each room with its name and area,
sections label the spaces the cut passes through, and the schedule gains five architectural
traits (structure, massing, proportion, ground, plan), unranked while v2 carries no rarity.

Checks: 600-paint sweep (seed × style × sheet) with zero failures and zero page errors; the
quantity survey separates the twelve styles as expected (Mies, Corbusier, Brutalist, Decon,
Geodesic read FRAME; Metabolism CORE; Cycladic and Rossi MASS; De Stijl WALL; Mexican and
Palladio split WALL/MASS; Archigram FRAME/MASS). Room labels place small spaces first and step
larger ones to a free corner rather than overprint. Known limit: a label can still touch a core
outline on very small plans.

**2026-10-27 — architectural risograph (paper and print).** v2 prints as a risograph on grey
grid stock instead of pencil on vintage paper. The stock follows the supplied reference: pale
grey, a ruling every 10 sheet units with a heavier line every 50, and a registration cross every
150 across and down, each on a heavy line. `lib/riso.js` holds the stock, the inks and the print.

Process, per sheet: the drawing is made as before in dark and warm colours on a white buffer
(supersampled 2x on 1x displays so hairlines survive), then separated into two drums.
- *Key drum* (cool ink: blue, federal blue, teal, indigo, black, steel): linework, text, chrome,
  hatching, dark and cool tones.
- *Accent drum* (warm ink: fluorescent orange or pink, sunflower, bright red, orange, yellow):
  warm hues, plus wide areas of mid-tone shading and fill. Wide means it survives a morphological
  opening, so strokes and text stay in the key ink and fills do not fringe the linework.
- Each drum is screened at its own angle (15 and 75 degrees), the accent drum is misregistered a
  few pixels in a seeded direction, and the two multiply onto the stock with density wander,
  edge roughness and speckle dropout.
- A colour bar of tint steps and the overprint, and a printer's slug naming the inks, print in the
  bottom margin.

Ink pair is a trait (`Inks`), chosen from six pairs by a hash of the seed alone so it moves no
other draw; `p_inks` in the client and the board's `papers` set (now six ink pairs) override it.
The pencil papers remain reachable by name. Checks: 600-paint sweep, zero failures and zero page
errors (about 58 s against 36 s before, the cost of the print); 12-style board and six-pair board
read as one family. Known limit: warm-less palettes put their colour only in the accent shading,
so a few seeds read near one-ink.

**2026-10-27 — Phase B: diagrams, circulation, model dogmas.** Three additions that use the
model rather than the drawing.

1. *Sheet A-06 DIAGRAMS* (`lib/diagrams.js`; the set is now six sheets, key 6, board of six). Six
   panels, each read from `state.model`: D1 structure at the ground cut (columns in the accent ink,
   walls and shells in the key ink, cores crossed, masses hatched, the grid); D2 solid and void
   (figure-ground, with enclosed voids tinted and open voids hatched); D3 circulation; D4 the
   levels exploded in axonometric, every body split across the levels it spans; D5 floor area by
   programme group; D6 floor area by level beside the measured proportions. Plans fit the built
   extent, not the plot.
2. *Circulation and vocabulary* (`lib/model.js`). Verticals are clusters of core and stair
   solids plus cores and stairs a style only declared as spaces; entry steps (low stair clusters)
   mark the way in, else the south edge of the plot. On each level the spaces present at
   mid-height, with courts and loggias at that level and the verticals serving it, are nodes, and
   the route is their minimum spanning tree (edge length the centre-to-centre distance; a gap over
   3 m is drawn dashed). Depth is the longest hop count from the entry. This is a diagram of
   access, not a layout of doors, and the sheet says so. Every room name belongs to a group
   (living, sleeping, work, service, sacred, open, circulation) through `Model.groupOf`. Derived
   quantities gain `groups`, `circ` and `bayCV` (the spread of column spacing).
3. *Model dogmas* (`lib/dogmas.js`). Two or three per style, tested over the measured model and
   appended to the style's own tenets (so the tally on a sheet is now 7/8, not 5/5), each with a
   stated test that the metadata carries. First drafts that every seed passed were replaced or
   tightened, since a dogma that always holds measures nothing. Pass rates over 40 seeds per
   style now run between about 10 and 90 per cent. Examples: Palladio's room ratios against the
   Quattro Libri set, Mies's universal space (few rooms, one dominant), Corbusier's true grid and
   free ground, Metabolism's twin cores and thirty replaceable capsules.

Checks: 864 paints (12 styles, 12 seeds, six sheets), zero failures, zero page errors; four-style
montage of A-06 read for overprint, clipping and caption fit. Known limits: styles that draw their
stairs as glyphs rather than solids (Mexican modern) report no verticals; dogma thresholds are
set from a 40-seed survey and will want revisiting when rarity is loaded.
