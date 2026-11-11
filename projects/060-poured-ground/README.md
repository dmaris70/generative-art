# Poured Ground

*Liquid paint poured onto a sheet and spread by a hand, simulated on the GPU and rendered as a
giclée-ready file. Each generation follows one of the 133 works on [colorlisa.com](https://colorlisa.com/),
in both its colours and its composition.*

## Method

The technique follows mofu-dev's
[*Spreading Liquid with three.js*](https://mofu-dev.com/en/blog/fluid-foundation/) ("foundation"),
which runs on top of the same author's [*Stable Fluids*](https://mofu-dev.com/en/blog/stable-fluids/)
solver. This is a WebGL2 reimplementation without three.js. It follows the articles' published
steps and constants. No code was copied beyond the shader expressions the articles quote.

| Stage | From mofu | Here |
|---|---|---|
| Velocity | Stable Fluids: force → semi-Lagrangian advection → divergence → Jacobi pressure → projection, walls at the edges | Same order. The force pulls velocity toward the finger's velocity inside a capsule (segment) so fast strokes leave no gaps. Momentum decays by `flow` per step. Velocity is measured in image short-side units per second, so behaviour does not depend on grid size |
| Paint | Height map. Paint leaves a cell in proportion to its own flow strength and arrives from the backtraced source: `removed = min(h, s·0.3·h)`, `added = min(hₛ, sₛ·0.3·hₛ)`, `s = smoothstep(threshold, |v|)` | Same rule on **four pigments at once** (RGBA32F). Optional *levelling* acts only where paint is moving, so a resting film keeps its edge |
| Pour | `initialHeight.frag` profile `√((1−s²)/12)`, shaped by `smoothstep(0, .025)` × 0.66 | Same profile, added into one pigment channel at each pour |
| Trace | Alpha history keeps the maximum coverage, and the render uses 0.5·history + 0.5·current, `step(0.1)` | Same, per pigment. Each level is thresholded on a smooth field and anti-aliased over **one output pixel** (`fwidth`), so edges are sharp at 300 dpi rather than one sim cell wide |
| Shading | Normals from the height map, Matcap texture | Normals from a **cubic B-spline** of the height (value and analytic gradient, C2), so a 1k grid prints smoothly at 10k px. A procedural key light plus gloss stands in for the Matcap and is normalised so flat paint renders **exactly its palette colour** |
| Colour mix | Simplified Kubelka–Munk weighted by thickness, alpha history where thin | Single-constant Kubelka–Munk in linear light: K/S = (1−R)²/2R per pigment, mixed by thickness, R = 1 + K/S − √((K/S)² + 2K/S). Thin films let the ground show through |

Like the original, it is tuned by eye. Engine v1 also shares its two limits: paint volume is not conserved, and results depend on the simulation grid. Engine v2 removes both.

### Engine v2 (default)

v1 is the method above, kept unchanged so that earlier prints and links can be reproduced
(`engine: v1`, or `p_engine=1` in a link). v2 changes four things:

| | v1 (original) | v2 |
|---|---|---|
| Pressure | 30 Jacobi iterations (16-bit float). Information travels about 30 cells, so a finer grid is less incompressible and the same seed spreads differently at 512 and 2048 | Multigrid V-cycles (two per step, weighted-Jacobi smoothing, 32-bit float). The solve converges at every grid size, so the flow is the same in sheet units |
| Walls | Velocity zeroed after advection, then re-introduced by the projection | Held at zero after the projection too, so no paint is drawn in from beyond the edge |
| Paint transport | mofu's rule: `removed` where the paint is, `added` from the backtraced source. Not conservative: circular motion adds liquid | Same `removed` (outflow). The arrivals are that outflow gathered from the backtraced source, and each step they are rescaled per pigment so they total exactly what left. Paint is neither made nor lost; resting paint is untouched |
| Levelling | Each moving cell blends toward its neighbours, one cell per step, so it is 16× weaker in sheet units at 2048 than at 512 | An exchange between neighbour pairs, so it conserves paint, scaled by (grid / 1024)² with stable sub-steps. It matches v1's strength at the default 1024 and is the same in sheet units at every size |

Everything mofu-specific is unchanged: the movement threshold (0.02–0.22), the 0.3 transfer
factor, the pour profile, the trace history and the rendering. The elastic memory of the
living phase still pulls toward the painting as poured (a deliberate force, not a leak). The
PNG's provenance records which engine made the file.

**Motion defaults for v2.** Because v2 conserves paint, the same wind moves it less than in v1,
where part of the visible motion was paint vanishing. v2 therefore applies the wind at 2.2×,
with memory unchanged (1). The *wind* setting still reads 1 by default, so v1 links are unchanged.
The value was chosen from a sweep over three works (seed 7, 30 s of living):

| setting | motion vs v1 | image still within 24/255 of the pour | paint volume |
|---|---|---|---|
| v1, wind 1 | 100% | 80–96% | −4 to −9% |
| v2, wind 1.0 | 25–38% | 95–99% | exact |
| v2, wind 1.8 | 55–71% | 89–98% | exact |
| **v2, wind 2.2 (default)** | **72–96%** | **85–98%** | **exact** |
| v2, wind 2.2, memory 0.5 | 85–117% | 79–97% | exact |

Memory 0.5 lets *Broadway Boogie Woogie*'s grid dissolve (79% held), so memory stays at 1.

### Engine v3 (default): keeping the eddies

v3 is v2 with three additions, which act in the **moving version only** (the living phase and the ending). The pour, and so every still print, is exactly v2's: a v3 still is pixel-identical to v2. Paint transport is v2's, so paint is still conserved exactly. v2 and
v1 stay selectable (`p_engine=2`, `p_engine=1`).

- **MacCormack velocity advection.** A second-order step: the forward semi-Lagrangian result is traced
  back, half the round-trip error is added back, and a limiter clamps it to the source texels so it
  never overshoots.
- **Vorticity confinement at the painting's scale.**
  - The flow's vorticity is smoothed over 1.5% of the short side.
  - A force along N × ω (N up the gradient of |ω|) then spins up the eddies numerical diffusion removes.
  - The force uses physical vorticity and a scale fixed in sheet units, so it is the same at every
    grid size.
  - Grid-scale confinement was tried first. It amplified cell noise into a pebbled texture, so it was
    replaced.
- **Wall memory.** Within ~5% of the walls the elastic memory is 8× stronger, so paint the wind piles
  against the frame dissolves back into the painting. The pull is zero-sum: its total is taken back
  in proportion to the paint present, so it adds no paint.

**Choosing ε.** The sweep applied the eddies to the pour as well, to make their effect easy to
see. It covered *The Starry Night* and *Broadway Boogie Woogie* (seed 7, 30 s of living). "Holds"
is the share of the image within 24/255 of the poured painting.

| | motion vs v2 | holds | volume | look |
|---|---|---|---|---|
| v2 | 100% | 85 / 98% | exact | smooth, eddies damped |
| v3, ε 0 (MacCormack only) | 87–92% | 86 / 98% | exact | nearly identical to v2 |
| **v3, ε 2 (default)** | **91–96%** | **86 / 99%** | **exact** | brush-scale curls in the sky and the red masses; no noise |
| v3, ε 5 | 96–112% | 85 / 98% | exact | pebbled texture begins; grid lines break |
| v3, ε 12 | 52–90% | 89 / 100% | exact | the painting dissolves |

**Why the moving version only.** With eddies throughout, the finished pour differed on 5.1% of
pixels between 256 and 1024 cells, against 2.5% for v2. That breaks the promise that a print matches
its preview at any sim detail. Eddies amplify small differences, as turbulence does.

**As shipped** (eddies in living and ending, ε 2; seed 7, 30 s of living):

| | motion /5 s | holds | volume | ink in the outer 3%, 30 s |
|---|---|---|---|---|
| *Broadway Boogie Woogie*, v2 | 8.3 | 85% | exact | +17% |
| *Broadway Boogie Woogie*, v3 | 8.5 | 86% | exact | +9% |
| *The Starry Night*, v2 | 2.3 | 98% | exact | – |
| *The Starry Night*, v3 | 2.1 | 99% | exact | – |

v3 adds curling forms as the painting lives: the red masses and the lower-left blue of *Broadway
Boogie Woogie*, and the moon in *The Starry Night*. The wall rim is halved. The moving version at
1024 cells costs about 1.7× v2's time.

## Colour

Each palette is five hex colours taken verbatim from colorlisa.com (`palettes.js` records artist,
painting and hex codes). `ground` picks one colour as the sheet: the lightest, the darkest, or a
neutral paper white. With paper white, the seed chooses which four of the five colours become
paint. The other four are pigments in a seeded order and with seeded weights, so one or two
colours lead. Palette `— chosen by seed —` draws one of the 133 from the seed.

## After the work

With `composition: after the work` (the default until 10 Nov 2026; now the fallback of *from the
reading* for works the painting reader has not read) each generation chooses one of the 133 colorlisa
palettes at random. It takes that work's five colours, and also its **composition**. Every
palette has a brief in `briefs.js`, which is a short description of the painting's layout as
data:

- **Fields:** rectangles, ellipses and bands in that work's palette colours, placed as the
  painting places them. They are laid first, each covering what lies beneath, the way a painter
  blocks in. The brief's ground colour is the sheet.
- **Gestures:** pulls, bursts, combs, swirls and scribbles that echo the painting's own marks.
  The poured paint then moves under the hand.

For example, *A Bigger Splash* lays the sky as the ground, then the flat house with dark windows
and a pale roof line, two thin palms, the pink terrace, the dark pool edge and the tilted diving
board. A burst of pale strokes rises from the water where the splash is. *The Starry Night* gets
a dark cypress, a village under hills, a moon and stars, and swirls through bands of paint in the
sky. *Broadway Boogie Woogie* gets a yellow street grid studded with red and blue blocks.

The seed varies the geometry slightly, where drops land, and the hand: each gesture's angle,
reach and count, and whether it is made at all. Every generation of the same work therefore
differs but keeps that work's layout.

**Basis, stated per work:**
- 71 briefs follow a well-documented composition (`k: 1`).
- 62 are *inferred* from the title and the artist's typical structure (`k: 0`), mostly
  lesser-known works whose layout could not be confirmed.

The studio shows which basis applies, and the exported file records it in its provenance.
Correct or refine any brief in `briefs.js`; the check script validates it.

No image of any painting is used: only its five colorlisa hex codes and a description of its
layout. The output is an abstracted interpretation, not a reproduction.

### From starting point to interpretation

The brief is only the **starting point**. The `interpretation` setting (0–1, default 0.65) sets
how far each generation travels from it. As it rises, the seed applies one to three
**readings** to the layout:

| reading | what it does |
|---|---|
| detail | zooms into one region of the work, enlarged 1.4–3×, so a fragment becomes the whole |
| turn | rotates the composition |
| fragment | cuts fields into strips and shards and displaces the pieces |
| drift | carries each field on a slow current, stretched and turned |
| distil | keeps only the main mass of each colour, enlarged |
| echo | repeats the work's own gestures elsewhere, turned and rescaled |
| exchange | swaps ground and figure: the largest field's colour becomes the ground |

Separately, the hand goes further: longer, stronger and more numerous gestures, extra pulls
through the fields, and looser placement.

Fixed at every level:
- **All five colours are kept.** A colour that a reading pushes off the sheet returns as traces.
- **Readings are stated.** Those applied are named in the studio card, the caption and the
  PNG's provenance (for example, *starting point: …; interpretation 0.65: fragmented; drifted;
  the hand pushed further*).
- **Interpretation 0** reproduces the close version.

`composition: free gestures` keeps the earlier behaviour: palette colours with the seeded
gesture styles below.

## From the reading: the painting reader

`composition: from the reading` (the default since 10 Nov 2026; earlier links carry `p_mode=0`
and reproduce as before) replaces the hand-written brief with a **reading of the work's
image** by the painting reader (`tools/painting-reader`, the measurement-only path of the
painting-reader handoff). Until now a brief described the painting's layout in words; here the
layout is *measured*, and the measurements become instructions to the pour. Nothing is traced: the
reader does not detect objects or edges to copy, it measures masses, and the hand reinterprets them.

**What the reader measures** (CPU, ~2 s per image; the optional vision model is not used, so no
subject is identified or described): six colour clusters with their shares and pixel centroids;
connected value masses (lighter, darker), colour islands and a sparse-detail field, each with its
box, centroid, principal axis, axis-variance ratio and occupancy; the configurations between them
(`value_opposition`, `cross_axes`, `detail_interval`, `color_recurrence`); the dominant edge
direction; and the detail in each cell of a 3 × 3 grid.

**How a reading becomes a composition** (`engine.js`, `readBrief`; deterministic, auditable from
the record):

| reader | Poured Ground |
|---|---|
| six colour clusters | five colours: the two closest in CIELAB are merged (ΔE < 12). Largest share first; the largest is the ground, as the painting's surface |
| lighter / darker mass | laid in a pigment by rank: the darkest of several dark masses takes the darkest pigment, the next the next, and the same from the light end. One dark mass keeps the darkest colour; five spread across the palette. The ground is never a candidate, so a measured mass is always laid |
| colour island | laid in its own cluster's colour |
| each mass | laid as its **own silhouette**: the reader's connected grid cells (32 × 22 on the long side), upsampled 4× and softened, so the contour is drawn rather than stepped. The silhouette keeps its own frame, so interpretation can move, scale and turn it |
| a record without masks | a rectangle of the box (a mass filling ≥ 55% of it) or an ellipse of its area, elongated by its axis-variance ratio and turned to its principal axis |
| sparse-detail field | nothing is laid: a calm interval the gestures avoid |
| a colour with no connected island | dabs around its pixel centroid, so every measured colour is present |
| `value_opposition` | one pull of the hand from the dark mass to the light one |
| `cross_axes` | a comb along each field's axis |
| `detail_interval` | a burst from the detailed field, aimed away from the sparse one |
| `color_recurrence` | a pull joining the two islands of one colour |
| a field shared by the principal configurations | a swirl on it |
| a configuration's **weight** | the reader orders configurations by the area they affect, and its selection weight is the summed area of the fields it names. The hand works them in that order, heaviest first, and scales each gesture's radius, reach and tooth count by 0.6 + 0.8 × (weight / heaviest weight), so the principal relation is made first and made hardest |
| the grain: the 8-bin histogram of edge directions | the strongest direction carrying at least 1.5 × an isotropic share (≥ 18.75%) is combed across the sheet with 2–4 teeth in proportion to its share; a second such direction is combed lightly across it, 2 narrow teeth. Two full combs were tried first and turned rectilinear works into drip curtains. A reading made before the grain was kept falls back to one comb along the single dominant direction when it holds ≥ 22% |
| the most detailed grid cell(s) | scribbles inside them |

Silhouettes are the reader's own evidence (`formal.json` `cells_xy`), not an interpretation of it: the
reader's handoff export drops them, so `read_works.py` reads them from the artifact and keeps each as
base64 bits in the record (`mask`, 16th field element; `grid` gives the cell counts). A brief field
`M(c, cx, cy, sx, sy, deg, mask)` lays one; the zone shader samples the softened mask in the field's
frame (`uShape` 2). Fragmentation treats a silhouette as its box.

The result is a brief in the same DSL as `briefs.js`, so the interpretation readings, containment,
the moving version and the label all apply unchanged. Its basis is `k: 2`, and the studio card, the
caption and the PNG's provenance say so: *layout read from the museum image by the painting reader:
measurements only, no subject identification*, with the reader version, the date, the image's
SHA-256 and the museum that holds the image. The five colours are credited as *measured by the
painting reader from the image held by …*.

**Which works have a reading.** Only works whose image we may use: the 8 public-domain originals
(`readings.js`, with each full `readings/<id>.handoff.json` kept for audit) and the Colorist
Archive's public-domain works whose image is served by a museum: 1,635 works, every one the
museum hosts hold — Google Arts & Culture 560, Tate 321, the Met 298, Cleveland 145, the Walters
80, the National Gallery of Art 71, SMK 52, the Getty 50, Europeana 35, the Smithsonian 6, the
National Gallery in London 5, the V&A 5, Culturalia 4 and DigitaltMuseum 3. Four more are listed
but their images have gone (two at the Met, two at the Getty), and the Art Institute of Chicago's
five refuse a scripted request. Wikimedia holds the remaining 16,112 and rate-limits a cloud
address — `tools/painting-reader/RUNNING-THE-ARCHIVE-READ.md` says how that read is run.

A reading is filed with its artist, as the archive's works are: `archive/readings/<artist-id>.json`,
with `archive/readings/index.json` naming the 193 artists that have one. The studio fetches the
index (3.8 kB) and the one artist's shard (14 kB at the median, 244 kB at the worst). Until
November 2026 the readings were a single `archive/readings.json` which it fetched whole before it
could show any archive work: 4.15 MB for 1,244 readings, and some 58 MB had the archive been read
out. A work without a reading says
so in the caption and falls back to its brief (colorlisa) or its palette (archive). Readings are
bound to their image by SHA-256; the check script verifies the held originals against theirs.

**Limits**, from the reader's own contract (`tools/painting-reader/INTEGRATION.md`): a colour
cluster is pixels, not an object; a principal axis is the extent of a distribution, not a line
anyone sees; occupancy and area describe a reproduction at 512 px. The reading is a starting point
the hand reinterprets, exactly as a brief is.

## Handling: how the hand works the sheet

Setting *handling* (`p_handling`), two values:

- **layered** (default). The masses are poured in up to three layers, largest first, and the hand
  works between them, so a small mass lands on paint that has already moved and is itself worked by
  fewer, later strokes. Every stroke also travels 0.62 of its full reach, keeping its place and
  direction: a pull is shortened about its middle, a burst's rays and a comb's teeth are shorter,
  and a scribble steps less far. The measured structure is still legible when the film settles.
- **sweeping** (`p_handling=0`). The earlier hand: every mass poured first, then every gesture at
  full reach. Reproduces prints made before November 2026.

**It applies to every work in the catalogue.** There are two composers. A work with a reading or a
brief is composed by `composeBrief` — 1,377 works: colorlisa's 133 and the 1,244 archive works the
reader has measured. The remaining 19,123 archive works have neither, and compose from their five
colours alone in `compose`, which until November 2026 ignored *handling* altogether: the control
was in the panel but inert on 93% of the catalogue. `compose` now takes the same hand. Layered, its
gestures are grouped into up to three layers; a layer's pours all land, the sheet is given eight
steps, and the hand works that layer before the next is poured onto paint that has already moved.
Every stroke travels 0.62 of its reach — measured over 50 seeds at 12 pours, 31.9% less travel.

The sweeping hand is unchanged to the step. Each gesture's geometry is built from the same random
draws in the same order as before, and only the scheduling differs, so `p_handling=0` reproduces
every palette-only print made before this change byte for byte; 120 recorded scores across four
seeds, five gestures, three pour counts and two formats are checked against their stored hashes.

*intervals* remains inert on the palette path, correctly: a reserve is a gap the reader measured
between two related fields, and a work with no reading has none.

## Intervals: keeping a gap open

Setting *intervals* (`p_reserve`), off by default.

Where a configuration names two fields whose boxes do not meet, the strip between their facing
edges is what separates them, and the gesture that configuration produces runs straight across it:
the pull of a colour recurrence joins two islands by dragging paint through the gap that made the
pair legible. With *intervals* on, that strip is a **reserve**. A stroke that would cross it is cut
at its edge and continues on the far side, and no dab lands inside, so the ground stays open there.

A reserve needs the two boxes to be at least 0.03 apart and to face each other over at least 0.15
of the sheet. Four of the eight read originals have one: Degas (a vertical strip at x 0.531–0.625,
between the dark island on the right and the one at the centre), Gauguin, Monet and Meissonier.
The other four have none, and are unchanged whatever the setting.

This exists because an outside critic, having seen each print beside its source, found that what
survives is the distribution of weight and what dies is whatever organises the eye, and asked for
one print in which a gap is held open and everything else left alone.

## Composition

A seed writes a **score**: timed pours and finger drags on a fixed 60 Hz clock (`engine.js`, no
DOM). There are four gestures: **Spread** (pours near one to three centres, pushed outward),
**Sweep** (long knife pulls through each pour, at one shared angle), **Swirl** (arcs around a
centre) and **Scatter** (many small pours, short flicks). **Mixed** picks one per pour. You can
add your own marks: drag to push paint, shift-click to pour, and 1–4 choose the pigment. The
exported file then records that it is *hand-touched* and cannot be reproduced from its URL.

## The Colorist Archive

Alongside colorlisa's 133 works, the piece draws on the **Colorist Archive** of
[meditationsincolor.com/colorists](https://meditationsincolor.com/colorists): 367 artists and
20,367 works.

- **What is taken:** facts only. Each work has its title, date and source link, plus a
  palette: the dominant colour and the four most distinct of up to eight. The archive's
  prose (artist biographies) is not copied.
- **Files:** `archive/index.json` lists the artists, and each artist's works are a small file
  loaded only when needed (7.8 MB in all).
- **Composition:** archive works compose from their palette, because they have no hand-written
  layout brief. The studio card says so and links to the work's source page, so the painting
  itself can always be viewed.
- **Images:** an image is referenced only for works that are public domain by our rule (artist
  died ≤ 1955 and work dated ≤ 1930). Wikimedia serves hotlinked thumbnails only at its standard
  widths, so the archive's Wikimedia image URLs are at 1280 px (its 600 and 960 px thumbnails
  were refused with HTTP 400 from 10 Nov 2026). Such a work can be shown with **O** and can rise in the
  animated version, loaded from its source; if the source refuses cross-origin use, it can
  still be viewed. For every other work no image is referenced, shown or requested. The check
  script verifies this across all 20,367 works.
- **Collection:** *both* (the seed picks colorlisa 1 time in 4), *colorlisa* or
  *Colorist Archive*. The studio browses the archive by artist, with search.

## Proportions of the original

When the physical size of a work is known, every generation keeps its **proportions**.

- **Sources**, in order:
  - **Wikidata's** recorded height × width.
  - Otherwise, the **holding museum's own collection record**:
    - APIs: The Met, Art Institute of Chicago, Cleveland Museum of Art, the V&A, SMK, and the Rijksmuseum's linked data.
    - Open datasets: Tate, National Gallery of Art, MoMA.
    - Each work is found by the object number in its source link. colorlisa works are matched on artist and title, and only exact matches are kept.
  - Otherwise, the dimensions on the work's **Wikimedia Commons** artwork record. These are kept only when the photograph's own proportions agree within 15%. The photo decides the orientation when the record does not state which figure is the height.
- **What is measured:** the support or painted surface (unframed). Frame, glazing and mat measurements are rejected.
- **Recorded per work:** archive files store the aspect as `a` and the source as `as`; no `as` means Wikidata. `proportions.js` names the museum and record for each colorlisa work. The studio card, the print spec and the PNG's provenance all name the source.
- **Fit:** the image area takes the original's width-to-height ratio and is fitted whole inside
  the chosen paper. The border grows on one axis only, so nothing is cropped and the paper keeps
  its size.
- **Orientation:** defaults to *as the original*.
- **Unknown size:** the work fills the format, and the studio says so.
- **Turning it off:** *proportions: fill the format*.
- **Provenance:** records the image size, the aspect and the borders.

## Motion: the animated version

Every sheet also has an animated version (**M**, the studio's *Motion* section, or
`?motion=1`). Its movement is the simulation itself, as in mofu's method. One velocity field
moves every pigment, and paint moves only where the flow passes the speed threshold. Pigments
mix by thickness, and colour stays where liquid has passed. Nothing appears to move that the
liquid does not actually do, and the canvas walls keep everything on the sheet.

| phase | what happens |
|---|---|
| creation | the pour itself, live, from the empty sheet: the seed's fields and hands |
| living | **048 Plotted Field's gusts** flow through the same velocity field as a gentle force. They follow 048's law: bands of gust bent by a slow warp, one gust every 5.03 s, force 0.25 + 0.75·gust². The gusts straddle mofu's threshold, so paint moves in the gusts and rests in the lulls, **mixing and reshaping**. The flow curls with a slow noise, dies near the walls so paint turns along them, and the wind veers through a full turn each cycle so nothing piles against one side. An elastic **memory** of the painting as poured (paint and traces, about 5 s) draws it gently back, so it breathes instead of collapsing into one colour |
| ending | the paper absorbs the paint where it lies, a little at a time. Pores at three scales set when each point drinks, thick paint lasts longest, each pigment soaks in at its own rate, and the sinking paint flattens and leaves a stain in its own hue that is drunk in turn. The liquid keeps moving as it is drunk |

- **Seamless cycle:** a cycle starts and ends on the empty sheet, so a recording loops
  seamlessly. It is deterministic: the same seed gives the same motion, step for step, on a
  given machine.
- **Controls:** *living* sets the length of the living phase in gusts (default 6 ≈ 30 s), *wind*
  its strength, and *memory* how firmly the liquid holds the painting's form.
- **Prints of an instant:** pause anywhere and *Export print PNG* to print that instant. The
  file's provenance records the phase and the time.
- **Video:** *Record cycle* saves one whole cycle as WebM (1080 px). The simulation advances a
  fixed 60 steps per second of video, so the content never depends on timing, but the browser
  timestamps frames in real time. If the machine draws more slowly than the frame rate, the
  recorder says so.
- **The original, before the absorption.** Over the last part of the living phase, the work
  this generation starts from rises in the paper beneath the paint. It surfaces through the
  pores, open pores first, and the paint thins to a veil so the two are seen together. From then
  on the same gusts that move the paint liquefy it, through mofu's threshold, so source and
  interpretation mix in one liquid. In the ending the paper drinks both.
  - **Public-domain works** show the **original itself**, fitted whole inside the canvas, never
    cropped. A work qualifies only if the artist died in or before 1955 (EU: life + 70) **and**
    the work dates from 1930 or earlier (US), **and** the holding museum's open-access record
    marks it public domain.
  - **Traceable sources:** each image comes from the museum's open-access collection (The Met,
    Art Institute of Chicago) and was checked visually against its title. It is recorded in
    `originals.js` with the museum, object number, source URL and licence. There are currently
    8: Gauguin *The Siesta*, Manet *Boating*, Degas *At the Milliner's*, Quidor
    *Leatherstocking's Rescue*, Homer *A Basket of Clams*, Hokusai *The Great Wave*, Monet
    *Water Lilies* (1906) and Seurat *A Sunday on La Grande Jatte*. *American Gothic* stays a
    map because its museum does not mark it public domain.
  - **Options:**
    - **Show the original** (key **O**, the studio card's button, or the panel) lays the
      public-domain original over the canvas, fitted whole inside the image area, to compare
      with the interpretation at any moment, still or animated. It is a view only: prints and
      recordings never include it.
    - For a work in copyright the toggle is unavailable and says so, and no image is requested.
    - **Original in motion** (*rises before the absorption* or *off*) controls whether the
      source rises in the animated version.
  - **View the painting, for every work:** the studio card and the piece's caption link to a
    page showing the painting itself, plus an image search for artist and title. Linking copies
    nothing, so it covers works in copyright too. The links (`links.js`, 133 of 133, all
    https) are colorlisa's own link for each painting (MoMA, WikiArt, Wikipedia, Google Arts &
    Culture, the Met, Tate and others). The 8 hosted originals use their museum record instead.
    Checked 2026-11-02: 63 open, 54 refuse automated checks but open in a browser, and 8 dead
    links were replaced (Wikipedia for the Mona Lisa, an image search for the other 7).
  - **Colour:** the original is decoded with the exact sRGB curve, the inverse of the one used for
    output, so its tones survive the round trip. Before 3 Nov 2026 a 2.2 power was used, which
    crushed its deepest shadows (sRGB 10 came out as 3, 20 as 12).
  - **Movement:** the original has its own elastic memory (about 1 s), so it ripples and
    liquefies with the gusts but stays legible. The memory releases in the ending, when the
    original is carried and absorbed with the paint.
  - **Unresolved works:** where the specific work cannot be identified unambiguously (a series,
    several versions, no exact item), no image is used.
  - **Works in copyright** (Hockney, Warhol, Rothko, Basquiat and the rest) and the unresolved
    ones rise as their **composition map**: the brief's own fields as written, softened, in the
    work's five colours. This is our description of the layout, never an image of the work.
  - The check script enforces the rule for every entry. The studio card and each exported
    file's provenance say which of the two rises.
- **Containment:** every laid field lies wholly on the sheet, whatever the interpretation.
  Nothing is cut off by the canvas edge, and the check script verifies it.

## Paint body

The paint has a physical body (setting *paint body*, on by default):

- **Ridges where colours meet, and a lip where a film ends.**
  - Each pigment's share of the paint, and the share of bare ground, changes sharply at a boundary.
    Half the sum of those changes marks every boundary once: between colours, and at a film's edge.
  - The ridge stands in proportion to the paint present there.
  - It is smoothed over 0.3% of the short side, so it is the same at every sim resolution.
  - It adds to the relief through the same cubic B-spline.
  - Its height is 0.8 × the local paint thickness, chosen from close-ups at 150 dpi (0.35, 0.8 and
    1.5 compared): at 0.35 the edges are easy to miss; at 1.5 they read as outlines.
- **Weight.** Each pigment has a seeded mobility (0.75–1.25×), so heavier paint spreads less. Engine
  v2 and later still conserve paint exactly.
- **Transparency.** Each pigment has a seeded hiding power (0.7–1.3×), so a glaze lets the ground
  glow through a thin film. A wider range (0.55–1.45) turned *Broadway Boogie Woogie*'s blue block
  pale, so it was narrowed.
- **Seeding.** Pigment properties come from their own seeded stream, so no other seeded choice
  changes.
- **Earlier prints.** *flat* (`p_body=0`) reproduces every earlier print, pixel for pixel. This was
  verified on three works.

## The film over the paper

Setting *film over the paper* (`p_film`), **on by default** since 11 Nov 2026. `p_film=0`
reproduces prints made before that.

A film of paint over the sheet is a layer of finite thickness over a background: light crosses the
paint, meets the ground, scatters back and crosses again, and that decides how much of the sheet
shows. The two-flux equations give it in closed form:

    a = 1 + K/S,  b = √(a² − 1)
    R = (1 − Rg·(a − b·coth(b·S·X))) / (a − Rg + b·coth(b·S·X))

with `Rg` the ground beneath and `X` the film's own thickness. At X = 0 it returns the ground
exactly, as X grows it returns the masstone, and with no scattering it reduces to Beer-Lambert.

It needs **S on its own**, which single-constant Kubelka-Munk cannot give, since that model knows
only the ratio K/S. The impurity index supplies it, so this became possible only once each pigment
had its own scattering.

Where it is on it replaces three terms that stood in for it: the blend between the masstone and the
ground, the per-pigment hiding power, and the small nudge that kept thin paint's hue. In the moving
version the ground already carries the original once it has risen, so the paint then sits over the
painting physically instead of being alpha-blended with it.

## Pigment mixing: the impurity index

Setting *pigment mixing* (`p_mixing`), **on by default** since 11 Nov 2026. `p_mixing=0`
reproduces prints made before that.

Colours mix by single-constant Kubelka-Munk: the mixture's K/S is the concentration-weighted mean
of each pigment's K/S. That simplification holds when a white substrate does the scattering and
every pigment scatters alike. These pigments are **masstones**, measured clusters applied pure, and
for masstones the assumption fails: a near-black with almost no scattering still counts for its
full share of the mixture and drags it down.

With the setting on, each pigment carries an **impurity index** p, its own spectrally non-selective
scattering, so K = Σ c·p·(K/S) and S = Σ c·p: the mean is weighted by c·p and the pigment that
scatters more carries the mixture. The extension is Moghareh Abed and Berns's (the 1p-KM model).

**p governs the mixture only.** How much of a film hides the ground keeps its own term. The two
were tried together first, and a pigment with a low p then stopped hiding as well as it mixed: the
Siesta's near-black, the lowest p of any pigment in the four read works at 0.20, came out warm grey
over the ground and the print no longer said what the reading measured.

p is taken from each cluster's own reflectance, `0.1 + 0.9·√Y` clamped to 1, so a pale cluster
scatters and a dark saturated one mostly absorbs. **These are not measured K and S.** A real
calibration needs a masstone and a tint of each pigment on a spectrophotometer, which no photograph
can supply, so this is a principled parameterisation and not a measurement.

Over the 24 pigment pairs of the four read originals, mixing half and half, the two models differ
by a mean of 3.1 ΔE and at most 13.6, against a just-noticeable difference near 2.3. The difference
concentrates where the theory says it should: pairs containing a low-scattering dark. Gauguin's
near-black has p 0.20, and mixed with the olive the result moves from L\* 17.5 to 25.8.

## The highlight, and the sheet's memory

Two settings in *surface*, both answering an outside critique of the prints:

- **The highlight carries the thickness.** A deep pool holds a smooth surface and takes a tight,
  bright sheen; a thin strand sits on the paper's tooth and takes a broad, dim one. The specular
  sharpness runs 14 to 90 and its strength 0.3 to 1.15 across a film thickness of 0.006 to 0.05.
  Before, one sharpness served both, so a filament and a pool wore the same slick highlight and the
  surface read as liquid plastic rather than as paint of varying body.
- **`trace`, the memory of the pour** (0 to 1, default 0.5). The render combines the present film
  with the record of everywhere paint has been. At 0 only the present film shows; at 1 the record
  holds the silhouettes as laid behind the moved paint, which is where the measured structure and
  the liquid meet on one surface. 0.5 is what every print before this setting was made with, so it
  changes nothing by default.

## Label

The work's title, with the artist's name beneath it, is written in **Cedarville Cursive** at
the bottom right, like a signature line.

- **Font:** Kimberly Geswein's Cedarville Cursive, under the SIL Open Font License. It is served
  from `assets/fonts/cedarville-cursive/` with its licence, so exports never depend on a font
  CDN, and export waits for the font to load.
- **Sharpness:** the text is drawn at the output's own resolution and composited in the render
  pass, so it is as sharp at 360 dpi as on screen.
- **Settings:** `label` (*work and artist* or *off*); `label position` (*in the border* by default,
  right-aligned under the image and centred in the bottom margin, falling back to the image
  when the border is too shallow; or *on the image*, inset from the corner); and `label size`, which is
  relative to the sheet's short side, so the label keeps its proportion on every format.
- **Ink:** on the image, the palette colour that contrasts most with the ground. In the border,
  a warm black.
- **Provenance:** the label's text and position are written into the PNG's provenance.

## Giclée output

**🖨 Export print PNG (P)** renders the finished state at the chosen format and dpi. Formats run
from A3 to A0, plus 16×20, 24×30, 30×40, 40×50 in and square 24 or 36 in, with an optional paper
border in mm. Settings:

- **16-bit RGB** (default) or 8-bit with triangular dither. 16-bit avoids banding in smooth
  gradients after the print lab's colour conversion.
- **Tiles and streaming**: the GPU renders strips that are compressed as they arrive
  (`png.js`, `CompressionStream`). Files larger than any canvas still export, for example 40×50 in
  at 300 dpi (12000×15000 px).
- **Embedded**: `pHYs` stores the real dpi, so the file opens at print size. `sRGB` sets the
  colour space with perceptual intent. `tEXt` chunks record the seed, palette source and hex
  codes, ground and pigments, sheet and border, and the share URL. Any print can be traced back
  to its recipe.
- **Paper tooth** is set in millimetres, so it prints at the same physical scale at any dpi.

The preview and the print come from the same simulation textures. Only the final render pass
changes resolution, so what you see is what prints. With engine v2, a finer *sim long side*
(1536 or 2048) adds detail to large prints while keeping the composition of the standard grid.

**For the print lab:** the file is sRGB. Soft-proof it against the printer and paper ICC profile.
Saturated palettes such as Warhol, Geiger and Klee's *Fire Evening* can fall outside matte
cotton-rag gamuts. Use perceptual intent for those and relative colorimetric for the rest.

## Print studio

`studio.html` is a dedicated interface for making prints, running the same engine as the piece.

- **Composition:** *after the work* or *free gestures*, an **interpretation** slider, and a card naming the starting work, its layout note, the readings applied and the basis.
- **Palette browser:** all 133 colorlisa palettes as swatch strips, searchable by artist or painting. The first row, *Chosen by seed*, shows which palette the seed picks.
- **Colours in use:** the resolved ground and four paints with their hex codes. Click a paint to draw with it.
- **Composition:** the gesture, number of pours, hand speed and momentum. Seed controls step back, forward or to a random seed. **Generate** makes a new composition and keeps your print setup.
- **Surface:** relief, gloss and paper tooth re-render live, and levelling re-runs the pour.
- **Print setup:** format, orientation, border, dpi, bit depth and simulation detail. A live spec shows sheet and image size, output pixels, raw data size and simulation cells per inch, and warns when the grid is too coarse for the print size.
- **Motion:** still or animated, play/pause, restart, a cycle bar naming the phase, living length in gusts, wind, memory, and *Record cycle*.
- **Label:** on or off, on the image or in the border, and its size (applied live).
- **Export:** a print PNG, a preview PNG, or a copy of the link. The URL always holds the full recipe, and *open as piece* opens the same recipe full screen.

## Files

| file | role |
|---|---|
| `palettes.js` | 133 colorlisa palettes (artist, painting, 5 hex) |
| `briefs.js` | One composition brief per palette: fields, gestures, basis flag |
| `engine.js` | Colour assignment, the seeded score, print formats and geometry. Runs in browser and Node |
| `sketch.js` | WebGL2 solver, paint layers, renderer, panel, pointer and print export |
| `png.js` | Streaming PNG writer (8/16-bit, sRGB, pHYs, tEXt) |
| `studio.html`, `studio.js` | Print studio: palette browser, composition, print setup and export, over the same engine |
| `../../tools/poured-ground-check.mjs` | Palette, colour assignment, determinism, score bounds, print geometry and brief checks (every brief uses all five colours) |

Needs WebGL2 with `EXT_color_buffer_float`, which any current desktop GPU supports.
Keys: **R** new seed · **G** new composition (keeps print setup) · **P** print · **S** preview PNG ·
**M** motion · **O** show the original (public-domain works) · **space** play/pause · **backspace** restart the cycle · **1–4** pigment.

Palettes © their compiler at colorlisa.com. Paintings belong to their artists and estates. No image
from a painting is used, only five colours from each. If prints are sold, do not use an artist's
name in the title or marketing without clearance. The colour credit belongs in the provenance
line, as the file metadata already records it.
