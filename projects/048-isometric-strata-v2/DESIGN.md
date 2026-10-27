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
