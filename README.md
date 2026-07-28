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
