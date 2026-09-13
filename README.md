# Generative Art

A gallery of algorithmic / generative sketches, each running live in the browser.
The landing page (`index.html`) builds itself from `projects.json`, so publishing a
new piece is just: drop a folder + add one manifest entry.

Every sketch shares a tiny harness (`assets/genart.js`) that gives it a
**live parameter panel**, a **deterministic seed**, and **shareable URLs** — the
same seed and params always reproduce the same artwork.

**Live site:** https://dmaris70.github.io/generative-art/

## Structure

```
.
├── index.html            # gallery landing page (reads projects.json)
├── studio.html           # compose artworks from stackable mark elements
├── variations.html       # contact sheet — one piece, many seeds, side by side
├── projects.json         # manifest — one entry per piece
├── assets/
│   ├── genart.js         # shared harness: seed + params + GUI + share links
│   ├── marks.js          # plotter-native mark generators (used by the studio)
│   ├── plotter.js        # optional: SVG export for pen plotters
│   └── strokefont.js     # optional: single-stroke font for plotter lettering
├── tools/
│   └── plot.sh           # SVG → plotter-ready SVG via vpype, with before/after stats
├── projects/
│   ├── 001-flow-field/   # a self-contained sketch
│   │   ├── index.html
│   │   └── sketch.js
│   └── 002-particle-life/
├── _template/            # copy this to start a new piece
└── assets/               # shared fonts, images, etc.
```

## The harness — `GenArt`

`assets/genart.js` is a small, dependency-light layer (its parameter/seed model is
inspired by [thi-ng/genart-api](https://github.com/thi-ng/genart-api), reimplemented
from scratch — no upstream code). In a sketch:

```js
let G;
function setup() {
  createCanvas(windowWidth, windowHeight);
  G = GenArt.create({
    title: 'My Piece',
    params: {
      count: { value: 1000, min: 100, max: 4000, step: 100, label: 'particles' },
    },
    onReset: reset,          // called on seed change / randomize / param tweak
  });
  reset();
}
function reset() {
  randomSeed(G.seed);        // make p5's random()/noise() deterministic too
  noiseSeed(G.seed);
  const n = G.param('count');
  const r = G.rng();         // deterministic float in [0, 1)
  // ...
}
```

What you get automatically:

- **Live GUI panel** (top-right, via [lil-gui](https://github.com/georgealways/lil-gui))
  with a slider per declared param, an editable **seed** field, a **🎲 randomize**
  button, **Copy share link**, and **Save PNG**.
- **Reproducibility** — `?seed=12345` in the URL reproduces the exact artwork.
  Seeds can be numbers or words (`?seed=sunset`).
- **Shareable state** — the seed and all params are written into the URL as you
  tweak, so "Copy share link" captures the exact frame's recipe.
- **Keys** — every sketch binds **R** (randomize) and **S** (save PNG).
- **Contact sheet** — the panel's **⊞ Contact sheet** button opens
  [`variations.html`](variations.html) with the piece's current parameters, laying out
  many seeds at once.

## Studio

[`studio.html`](studio.html) is an interface for making artworks without writing a
sketch. You stack **elements** — each one a generator of plotter-native polylines — and
tune them live:

| | |
|---|---|
| **Rulings** | families of irregular dotted lines, vertical and diagonal |
| **Heavy bars** | thick fragmented bars scattered along an axis |
| **Flow lines** | polylines advected through a noise field |
| **Grid** | a ruled grid whose cells recursively subdivide |
| **Rings** | concentric irregular loops, whole or broken |
| **Hatch patch** | a shape filled with ruled lines — tone without alpha |
| **Void** | a mask: a region the pen never entered, clipping every other layer |
| **HP-GL program** | a command column whose values are measured off the drawing |
| **Frame & marks** | registration marks, border, ruled gutter with ticks |
| **Label** | single-stroke type you can set yourself |

Layers reorder, toggle and delete; **✨ Generate artwork** rolls a whole new composition;
**Versions** renders eight seeds as thumbnails to pick from. Paper ratio, margin and a
reserved left column are global. Everything exports as **PNG** or plotter-ready
stroke-only **SVG**, and the entire composition — layers, parameters, pens, seed — is
encoded in the URL, so *Copy link* shares the exact artwork.

### Occlusion

Layers hide what falls behind them. A hatch patch, a heavy bar and a type column each
carry a silhouette, and everything drawn earlier is clipped against it — exact
segment-against-edge clipping, so a long dash crossing a shape is cut rather than left to
run through it. Toggle it globally in the panel, or per layer with each element's
**hides behind** switch.

Ink is additive on paper, so this is a compositional choice rather than physics: it's the
difference between a stack of layers reading as depth and reading as an x-ray. The badge
reports how much ink it removed as a percentage — measured by *length*, since clipping a
line in half leaves two strokes and less ink.

### Plot time

Each pen reports its mark count and an estimated plot time, with the pen-lift share
called out — because on dotted work the lifts, not the travel, are most of the plot
(measured: 85% of a 20-minute plot). The estimate uses the same greedy nearest-neighbour
path ordering `vpype linesort` does, so it reflects an optimized plot, and it came within
~12% of real `vpype stat` figures. Assumes A4, 40 mm/s drawing, 130 mm/s travel, 0.3 s
per pen cycle.

### Pens

Every layer is assigned one of four pens, and the **Pens** panel shows each pen's colour
and how many marks it carries — i.e. how long that pass will take. The canvas draws pen
by pen, in pen order, exactly as the machine will.

The SVG export groups by stroke colour, so each pen becomes its own **Inkscape layer**
(`1_stroke-color-group--1a1a1a`, `2_stroke-color-group--a83b2c`, …). Plot one pass per
pen without moving the paper:

```sh
axicli plot.svg --mode layers --layer 1   # then swap the pen
axicli plot.svg --mode layers --layer 2
```

One pen per layer is the honest model: a plotter holds one pen at a time, so colour costs
a pen change and a registration risk — which is why the generator keeps most compositions
to one or two pens.

Keys: **R** new seed · **G** generate · **S** PNG · **V** SVG.

The elements live in [`assets/marks.js`](assets/marks.js) as pure functions returning
`{pts, passes}` strokes, with no p5 dependency — usable from any sketch, not just the
studio.

## Canon — the listening drawings

[`canon.html`](canon.html) associates every work in the DMCF music collection
([`data/dmcf-v1.csv`](data/dmcf-v1.csv), 143 works) with a generative drawing. The
association is total and deterministic — the same piece always produces the same
drawing:

| collection field | what it drives |
|---|---|
| `work_id` | the **seed** (hashed) — the piece's identity is the drawing's identity |
| `system` (SYS-001…020) | the **visual grammar** — each musical system's generative principle re-stated as a drawing principle |
| `phase` | one **grammatical transformation**: early = the sketch (sparser, sepia) · peak = the statement (full ink) · diffusion = the spread (a void opens, one layer blue) · revival = the re-reading (first layer redrawn in sanguine on top) |
| `year` | the **diagonal** of the sheet — 1900 shallow, 2020s steep |

The system grammars (defined with the caption texts in
[`assets/canon.js`](assets/canon.js)): chance = seeded scatter, serialism = permuted
grid, process music = two ruling families interfering, graphic scores = unfinished
prompts, computed sound = plotted traces, musique concrète = splices, field recording =
contours with a walked path, tape loops = drifting near-parallels, sound poetry = the
title's own syllables permuted in stroke type, speech melody = pitch-trace rulings with
the title's words, drawn sound = a literal graphic score, drone = beating rulings,
modal court music = nested cycles, groove = ranked pulse bars, oral lineage = the same
melodic line carried three ways, resonance = rings from source points.

Each caption states what the musical system does and why it was made, how the drawing
re-states it, the phase note, and the work's source in the collection — and renders the
work's **research note** from [`data/notes/`](data/notes/): one sourced markdown file
per work (143/143, ~370 words each, 678 distinct sources across the collection) covering
how and why the piece was made, its technique, premiere and afterlife. The note format
is specified in [`data/notes/FORMAT.md`](data/notes/FORMAT.md);
[`data/notes/ERRATA.md`](data/notes/ERRATA.md) indexes the catalogue discrepancies the
research surfaced (misattributions, unverifiable releases, date conflicts). Everything is
stroke-only and exports as plotter-ready SVG (V), so any piece's drawing can be plotted.
Deep-linkable: `canon.html?w=REC-121`.

System identities are inferred from the works filed under them — if the collection's
own definitions differ, correct the texts in `canon.js`. v1 of the list carries 16 of
the 20 systems.

## Reserve — the endangered spools

[`reserve.html`](reserve.html) is the canon's dark counterpart: the works whose
catalogued recording **cannot be bought new** — derived live from
[`data/acquisition-guide.csv`](data/acquisition-guide.csv) (currently 9 second-hand-only,
1 stream-only, 1 never released). Where the canon is ink on paper, the reserve is
phosphor on near-black: each piece is one **spool** — the spiral groove that carried its
recording — with a deliberately different grammar from the canon's:

- the **system** modulates the groove (chance jitters it, computed sound runs
  high-frequency, loops drift in phase copies, drone doubles into beats, drawn sound
  dashes into notation, the carried song wanders);
- the **year** sets the revolutions — older works, longer spools;
- the **status** is the erosion: *second-hand* = dropout eats the groove, amber splice
  scars, broken flange · *stream* = the whole groove immaterial, fine cyan dashes ·
  *none* = the spool barely begins, a red cross where it stops.

Seed is the hash of the work id, as in the canon — same piece, same spool, forever.
Captions carry the system's principle, the research note, and the last-known source
link. Exports stroke-only SVG in two colour groups — these plot as **white/metallic gel
pen on black stock** (guide §8).

## Isometric Strata — the drawing sheets

[`projects/011-isometric-strata/`](projects/011-isometric-strata/) turns every seed into a
complete architectural working drawing: a title block, a north arrow, the palette's own
swatches, a framed hand-drawn axonometric of a building on its site with the floor levels
scaled up the margin, and a footer carrying a legend, a scale bar and the sheet's
specification. Nothing on the sheet is decorative text — the legend's counts are tallied
from the geometry actually drawn (`MURO(43)` means forty-three walls were placed), and the
specification lists the choices the seed made.

The building is one of twelve **styles**, each a vocabulary of parts recombined by the seed:

| style | parts |
|---|---|
| **Mexican modern** — the patio mat | walls on a cell grid as tall coloured planes, some running past the plan as freestanding screens · patios · pools · openings (vano) and light slits (luz) · slabs with a roof mesh · a tower · stairs · stone plinths · a lattice screen · solid masses |
| **Deconstructivist** — the crystalline tower | a sheared prism hatched along its shear · a column bundle · a spine of tilted planes and screens · ramps · cantilevers · braced frames · leaning shards · dashed floor plates |
| **Geodesic** — the expo mast | stepped mast clusters · geodesic hemispheres strut by strut with hubs in the accent ink · rings and bracing · hexagonal decks with shelters · footings · ground patterns · dimension notes at TECHNICAL detail |
| **Brutalist** — the mosaic block | slabs following an L, T or stepped outline · parapets, reveals, brise-soleil · braced cores · walkways · a field of pilotis · a mosaic of hundreds of unit cubes stacked to a noise field |
| **De Stijl** — the sliding planes | at every corner one plane runs on and the other stops short, leaving a void or a pane of glass · slabs overrun the volume · free posts rising past the roof · balconies, rails and black joints carrying the primaries · counter-construction planes floating off the volume. Van Doesburg's tenets (elementary, anti-cubic, asymmetric, colour as element, overrun) are checked over the drawn scene as `TENETS n/5` |
| **Metabolism** — the capsule tower | a permanent service shaft with pipes running its height · capsules plugged onto its faces in a staggered spiral, each with a porthole, four bolts and a service branch · vacant slots left as room to grow · cantilevered decks · trussed bridges between two shafts · a helical stair. Tenets: permanent spine, discrete capsules, growth reserve, staggered, serviced, checked over the drawn scene as `TENETS n/5` |
| **Palladian** — the villa on its axis | a raised, mirror-symmetric block with hipped roofs · a temple front on the axis (giant-order columns, entablature, pediment) with a broad flight of steps · windows in an ABA rhythm with little pediments · lower wings joined by colonnaded arms and hollowed with niches · a drum and dome over the hall · parterres and an avenue mirrored about the axis. Tenets: symmetry (every drawn face whose mirror would be visible has it), portico on axis, ABA rhythm, hierarchy, harmonic ratio, checked as `TENETS n/5` |
| **Archigram** — the plug-in rig | an exoskeleton of latticed masts and trusses on the envelope with cable ties across its faces · every service outside it: ducts in pop colours, escalator tubes up the flanks, tanks on brackets · inside only open decks and the pods plugged onto them, stacked pod on pod · tower cranes on the corner masts lifting one more pod in. Tenets: exo-structure, exo-services, pods only within, plugged in, in transit, checked as `TENETS n/5` |
| **Miesian** — the glass box on its plinth | a travertine plinth with paving joints, a flight of steps and a reflecting pool · a regular grid of steel columns standing one module outside the glass · a glazed skin ruled by mullions on the module, spandrels and slabs on the taller boxes · a thin roof plane overhanging all round · one free-standing core and a few free-standing stone planes. Tenets: less is more (a part budget), on the module (every set-out coordinate a multiple), structure expressed, raised on a plinth, free plan, checked as `TENETS n/5` |
| **Cycladic** — the white village | terraces stepping up the slope behind stone retaining walls · a contiguous cluster of whitewashed cubes, one or two storeys, every flat roof a terrace behind a parapet with pergolas and chimneys · external stairs up the flanks · walled courts with a tree · a chapel with a blue dome and a bell wall of arched openings · barrel vaults · arches over the lanes · a windmill on the ridge · blue only on doors, shutters and the dome. Tenets: low-rise, contiguous, roof as terrace, stepped, blue on openings, checked as `TENETS n/5` |
| **Rossian** — the analogous city | a court enclosed by a long colonnade bar on plain square piers · inside it only archetypes: a red cube, a cylinder on a cube crowned with a cone, a gabled bar, a free cone · square, identical windows in silent rows centred on every face · every solid casting a hatched shadow from one sun · a row of trees along the open side. Tenets: archetypes, square windows, silent façades (a small window share of every wall), asymmetric whole, one sun, checked as `TENETS n/5` |
| **Five Points** — the purist villa | pilotis and air at ground level · a free plan of partitions off the grid · a free façade set outside the columns · ribbon windows · a roof garden with planters and a solarium wall · a ramp and a spiral-stair core. Each of Le Corbusier's five tenets is also a predicate run over the drawn scene, reported as `TENETS n/5` |

standing on one of six **sites** (city, city edge, plaza district, hillside, park,
waterfront) built from kerbs and dashed roads, paving grids, plaza panels, street trees,
neighbouring blocks with window rows, an escarpment, a quay and water.

Every sheet comes in two **views**. The axonometric is the default; about a third of
seeds (or `view` = 2 in the panel) draw the same scene as a **plan and section** sheet:
the plan is the scene cut a little above the building's own ground floor and seen from
above, with the cut edges drawn heavy and a section line A-A marked across it; the
section is the scene cut at the plot's centre line and seen from the front, with the far
half drawn as elevation over a heavy ground line and hatched earth. Both views share one
scale, the legend and tenets are unchanged (the scene is the same data), and the floor
scale up the margin keys to the section's ground line.

Every sheet is also a **token record**. A schedule column on the right of the drawing
carries the series, token number (the seed), DWG id, generator version and hash; the
seventeen **traits** (style, substyle, type, view, site, paper, grid, ink, palette,
detail, density, shape, floors, buildings, scale, tenets, parts) each with its measured
frequency and tier; the information **score** in bits, the token's **rank** in the sampled
population and its overall tier; the variables used (floor height, building height, plot,
plan cut, palette with hex codes); the tenets with PASS / FAIL; and the legend counts.
Rarity is measured, not declared: `tools/strata-rarity.mjs` builds thousands of seeds
through the engine in Node (the build is p5-free), tallies every trait value, and writes
`lib/rarity.js`; re-run it and bump `Strata.VERSION` after any generator change. **M**
(or the panel button) copies the token's ERC-721 metadata JSON — name, description,
attributes with rarity and tier, and properties with the seed, hash, variables, legend
and tenets. The column can be switched off with the `schedule` parameter.

The **edition** is curated, not drawn: `tools/strata-select.mjs` builds a large seed pool
(60,000 seeds by default) and selects under explicit rules — tenets must pass in full,
no two tokens share a look (style + substyle + view + palette), equal style quotas, and
within a style substyles, views (about two thirds axonometric) and palettes filled
round-robin, with the least-used site and paper winning inside a look and the rarity score
only breaking ties. Two more layers make the curation objective rather than a matter of taste: **quality
gates** computed from the generative state and banded per style over the pool (part count
and ink load within the 10th–90th percentile, projected proportion between 0.45 and 2.2, a
site neither barren nor dominant, at most one empty legend entry, enough geometry through a
section cut), and a **rendered audit** (`tools/strata-audit.mjs`) that renders every
selected token at full sheet width, measures ink coverage against the sheet's own paper,
colour presence and the ink centroid's offset, and flags outliers against the style's
median per view and the same palette's median. Flagged seeds go to `edition/exclusions.json`
with their measurements; the selector replaces each by the next candidate of its look, and
audit and select alternate until nothing is flagged. The record is `edition/edition-256.json` (pool, rules, rejections,
distribution, every token's seed, traits, score, tier, hash) and `edition/edition-256.js`
is what the sheet and the board load: a selected seed's schedule shows its
**EDITION n / 256**, its metadata is named by edition number, and the board's `set=edition`
pages through the edition twelve at a time (`page=`). Measured on 30,000 seeds, the
generator holds about 360 distinct looks, so 256 is the size at which every token is unique
at look level; above about 1,000 the series would eat itself.

The generator is **frozen at v1.0**: `tools/strata-freeze.mjs freeze` fingerprints every
file that can change a drawing (the engine, styles, token layer, stroke font, harness, the
vendored p5 and lil-gui, the sketch and page) and records the fingerprint, the git commit and
the hashes of the rarity table and the edition in `edition/freeze-1.0.json`; the pages load
`lib/freeze.js` so every schedule prints the fingerprint the sheet was drawn under, and
`verify` fails if anything has moved. The freeze was checked three ways: the rarity sampler
and the selector reproduce the committed table and edition byte for byte, and three edition
seeds rendered three times each gave identical PNG hashes. Nothing in the drawing path may
change without a new version, a new rarity table and a new selection.

**Launch decisions** are recorded in `edition/decisions.json` (platform: own ERC-721 via
Manifold; chain: Ethereum mainnet; licence: CC BY-NC 4.0 images, source-available code;
title: Isometric Strata; artist: 668 349, the isopsephy of the artist's name) and the **reserves** in
`edition/reserves-256.json`, picked by rule with `tools/strata-reserve.mjs`: two per
style, the highest-scoring token as artist proof and the lowest-numbered plan-and-section
as institutional reserve, 24 held and 232 offered. The export tool merges artist, licence,
platform and reserve status into every token's metadata.

**Assets** come from `tools/strata-export.mjs`: it verifies the freeze, renders each
requested token headlessly at 3000 × 4000 from the vendored libraries, writes the PNG and
the token's ERC-721 metadata JSON (image file name and hash included), checks that the page
reports the expected edition number and the frozen fingerprint, and records both files'
SHA-256 in `export/manifest.json` (`1`, `1-12` or `all`; the export folder is not committed).
Each token also gets its **companion drawing**, the same seed drawn through the other view
(plan and section for an axonometric token and vice versa) by the same frozen generator —
non-canonical, listed under the metadata's `properties.companion` and in the manifest with
its own hash. Re-runs skip tokens whose files already match the manifest, so a long export
can be resumed. The full edition renders in about 43 minutes of drawing time (10 s a token,
two drawings each) to 768 files and 6.5 GB, every hash re-verified after the run.

To regenerate the edition on any machine (Node 22, a checkout of the repo):

```
npm i playwright@1.56.1 && npx playwright install chromium
STRATA_EXPORT_DIR=/Volumes/SANDISK/isometric-strata node tools/strata-export.mjs all
```

The tool verifies the freeze first and refuses to run on a modified generator. The same
Playwright version gives the same Chromium build, so the files come out byte-identical to
the recorded manifest; a different Chromium may rasterise differently, in which case the
run is still a valid edition of the frozen generator, but its hashes are its own.

The **portfolio board** ([`projects/011-isometric-strata/portfolio.html`](projects/011-isometric-strata/portfolio.html),
or the ⊞ Portfolio button in the sheet's panel) lays many sheets on one board under a
shared title strip: one sheet per style at a fixed seed (`?set=styles`), one style across
the six sites (`set=sites`), one style across the three papers in both views
(`set=papers`), or one style across twelve seeds (`set=seeds`); `style=1..12` picks the
style, `seed` the seed. Each tile is a full sheet built and painted by the engine into its
own buffer, captioned with its style, site, paper, view, seed and tenets score. Sheets
draw one per frame; **S** saves the board as a PNG.

The pipeline is `seed → spec → scene → sort → hand`: the seed fixes a specification
(style, site, paper, palette, detail, density, floors…); the style and site generators
emit 3-D primitives into a scene; the scene is depth-sorted and drawn by a renderer that
lays every stroke down like a pencil — wobble, overshoot, a second pass that doesn't quite
register — with clipped fills that read as coloured pencil or ruled hatching on mottled
graph paper. The engine lives in the project's `lib/` (core, plan, render, paper, sheet,
site, one file per style, and `strata.js`, the facade whose `build(opts)` and
`paint(g, state)` both the sheet and the portfolio board call); [`DESIGN.md`](projects/011-isometric-strata/DESIGN.md)
records the analysis the design came from. Parameters force a style, floor count, detail,
site density or building count; **R** reseeds.

## Contact sheet

`variations.html` renders one piece across many seeds as a grid of live tiles — the
sketch itself in each cell, not a screenshot. Tune the parameters on a piece, hit
**⊞ Contact sheet**, and you get that exact recipe across 6–100 seeds; click any tile to
open it full size with its panel.

```
variations.html?p=010-plotter-interrupt&n=24&from=1&p_bars=20
```

`p` picks the piece, `n` the number of versions, `mode=seq|rand` and `from` choose the
seeds, and any `p_*` parameters are applied to every tile. Tiles load lazily, a few at a
time, so 100 versions won't stall the tab. Sketches loaded with `?gui=0` skip the
parameter panel — that's how the tiles stay clean.

## Add a new piece

1. Copy the template:
   ```sh
   cp -R _template projects/003-my-piece
   ```
2. Edit `projects/003-my-piece/sketch.js` — declare your `params`, write `reset()`
   and `draw()`. Edit the `<title>` in its `index.html`.
3. Add an entry to `projects.json`:
   ```json
   {
     "slug": "003-my-piece",
     "title": "My Piece",
     "year": 2026,
     "tools": ["p5.js"],
     "description": "One line about it.",
     "thumb": "thumb.png"
   }
   ```
4. Commit and push. The gallery updates automatically.

### Optional: thumbnails
Run a sketch, press **S** to save a PNG, drop it in the project folder as
`thumb.png`, and reference it via the `"thumb"` field. Without a thumb the card
shows the title on a gradient.

## Plotting on paper

Sketches can be drawn by a pen plotter (AxiDraw, NextDraw, iDraw…). Add the
`p5.plotSvg` CDN tag plus `assets/plotter.js` to a piece and call `Plotter.attach(G)`
— the panel gains a **Save SVG** button (and the **V** key) that exports the current
seed as stroke-only, plotter-ready SVG.

```html
<script src="https://cdn.jsdelivr.net/npm/p5.plotsvg@latest/lib/p5.plotSvg.js"></script>
<script src="../../assets/plotter.js"></script>
```

Full guide — hardware, the SVG → [vpype](https://github.com/abey79/vpype) → machine
pipeline, pens and paper, and which pieces here plot well:
**[docs/plotter-guide.md](docs/plotter-guide.md)**.

## Local preview

Because the gallery uses `fetch()`, open it through a local server rather than
`file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

Vanilla HTML + [p5.js](https://p5js.org) and [lil-gui](https://github.com/georgealways/lil-gui),
both from a CDN. No build step, no dependencies to install. Each piece lives in its
own folder and is fully self-contained, and may use a different library if you like.
