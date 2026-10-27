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

## 4. First steps

The first step is chosen with the principal, from §3, and recorded here with the date.
A step is done when it renders in the sheet client and the board, its tenets (if a dogma) are
reported, and the headless smoke test passes.
