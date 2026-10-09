# Plotting — drawing this gallery with a pen

A practical guide to taking generative sketches off the screen and onto paper with a
computer-controlled drawing machine: what to buy, how to get plotter-ready SVG out of
p5.js, how to prepare the file so the machine draws it well, and where the good
resources live.

Written against **this** repo — the code recipes plug straight into the `GenArt`
harness in [`assets/genart.js`](../assets/genart.js) — but everything except §4 is
tool-agnostic.

**Contents**

1. [What changes when the output is a pen](#1-what-changes-when-the-output-is-a-pen)
2. [The pipeline](#2-the-pipeline)
3. [Hardware — what to buy](#3-hardware--what-to-buy)
4. [Getting SVG out of p5.js](#4-getting-svg-out-of-p5js)
5. [Designing for the pen](#5-designing-for-the-pen)
6. [vpype — the post-processor you will actually live in](#6-vpype--the-post-processor-you-will-actually-live-in)
7. [Driving the machine](#7-driving-the-machine)
8. [Pens, ink, paper](#8-pens-ink-paper)
9. [At the machine — workflow and troubleshooting](#9-at-the-machine--workflow-and-troubleshooting)
10. [Adapting the nine pieces in this gallery](#10-adapting-the-nine-pieces-in-this-gallery)
11. [Resources](#11-resources)

---

## 1. What changes when the output is a pen

A plotter is a robot that holds a real pen and moves it over real paper. That single
fact removes most of what a screen gives you for free:

| On screen | On the plotter |
|---|---|
| `fill()` | **Gone.** Solid areas must be *drawn* — hatching, stippling, spirals, scribble fill. |
| `alpha` / opacity | **Gone.** Tone comes from line *density*, not transparency. Ink does darken where lines cross, which is its own effect. |
| Blend modes, shaders, filters, `pixels[]` | Gone. Nothing raster survives. |
| Overdraw is free | Overdraw costs **time** and shreds the paper and the nib. |
| 4000 particles is nothing | 4000 short strokes can be a two-hour plot with pen-up travel between each one. |
| Colour is continuous | Colour = one pen per layer, plotted in separate passes, with registration error between them. |

What you get back is worth the trade: a physical line with pressure, bleed, and
absorption; visible machine time; and one-of-a-kind objects. The medium rewards
**line-native** thinking — flow fields, contours, hatching, differential growth,
truchet tiles, isolines, spirograph/harmonograph curves, maze and space-filling
algorithms — over anything built from filled shapes and soft gradients.

The practical rule: **your sketch should be a list of polylines.** If you can name the
polylines your algorithm produces, it will plot. If your image only exists as pixels,
you have work to do first.

---

## 2. The pipeline

```
p5.js sketch
    │  export (stroke-only geometry)
    ▼
SVG  ──►  vpype  ──►  plotter-ready SVG / G-code
              (crop, merge, sort, simplify, layout, occlude, layer)
    │
    ▼
axicli / NextDraw CLI / saxi / Inkscape ext / GRBL sender
    │
    ▼
pen on paper
```

Three stages, three separable concerns:

1. **Generate** geometry (this repo).
2. **Optimize** the geometry for a machine (vpype). This is not optional — a
   naive export can plot 3× slower and look worse.
3. **Drive** the machine (vendor CLI or G-code sender).

---

## 3. Hardware — what to buy

**Pen-holding XY machines (the mainstream choice)**

| Machine | Notes |
|---|---|
| **AxiDraw V3 / SE-A3** (Evil Mad Scientist / Bantam Tools) | The reference machine. Rock-solid, superb docs, huge community. A3 and larger variants exist. ~$475+. |
| **NextDraw** (Bantam Tools) | The successor line to AxiDraw — brushless pen-lift, auto-homing, refreshed electronics. Same software family (`nextdraw` CLI, Inkscape extension). |
| **iDraw 2.0 / UUNA TEK** | The credible budget clone family, ~$300–$600 by size. Runs the same AxiDraw-derived software and Inkscape workflow; laser heads available. Best price/performance for a first machine. |
| **EleksDraw / generic "XY plotter"** | Cheapest entry, GRBL-based, needs more fiddling and gives you G-code rather than the AxiDraw ecosystem. |

**Other geometries**

- **Polargraph / vertical wall plotters** — two motors, a gondola on a belt. Huge
  drawings, cheap, non-linear distortion is part of the charm. (`polargraph`, `Sandy Noble`'s designs.)
- **Line-us / Brachiograph** — tiny arm plotters, toy-scale, delightful wobble.
- **CNC / 3D printer + pen mount** — you probably already own one. A pen holder with a
  spring and a G-code post-processor gets you plotting for the price of a bracket.
- **Vintage HP** — HP 7475A / 7550 and Roland DXY series still turn up cheap on eBay.
  They speak **HP-GL** over serial, use real drafting pens, and have a beautiful sound.
  A USB-serial adapter plus `chiplotle`/`hp2xx` gets them running.

**If you want one recommendation:** an iDraw/UUNA TEK A3 to learn on, or an
AxiDraw/NextDraw if you would rather pay once and never debug the machine.

---

## 4. Getting SVG out of p5.js

### 4a. The recommended library: `p5.plotSvg`

[`p5.plotSvg`](https://github.com/golanlevin/p5.plotSvg) (Golan Levin) is purpose-built
for this: it records p5 drawing calls into **clean, path-based SVG** aimed at pen
plotters, not at faithful screen reproduction. It filters degenerate paths, keeps
real-world units via a DPI setting, and can group paths into Inkscape layers by name
or by stroke colour for multi-pen work.

Add to the sketch's `index.html`, after p5:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/p5.plotsvg@latest/lib/p5.plotSvg.js"></script>
```

(For p5.js **v2**, use `.../p5.plotsvg@latest/dist/p5.plotSvg.js` instead.)

It records: `line()`, `rect()`, `ellipse()`, `arc()`, `beginShape()/vertex()/endShape()`,
curves, and transforms. It does **not** record fills, alpha, blend modes, images,
filters, shaders, gradients, or clipping — which is exactly the constraint from §1,
enforced by the tooling.

### 4b. The recipe for this repo

This repo ships a small helper, [`assets/plotter.js`](../assets/plotter.js), that wires
`p5.plotSvg` into the `GenArt` panel — you get a **Save SVG** button and the **V** key,
and the export re-runs your `reset()` with the RNG rewound so the SVG is byte-for-byte
the same artwork as the seed on screen.

In `index.html`, after `genart.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/p5.plotsvg@latest/lib/p5.plotSvg.js"></script>
<script src="../../assets/plotter.js"></script>
```

In `sketch.js`, after creating the harness:

```js
G = GenArt.create({ title: 'My Piece', params: { … }, onReset: reset });
Plotter.attach(G, { dpi: 96 });   // adds “Save SVG (V)” to the panel
reset();
```

That is the whole integration. `Plotter.attach()` is a no-op with a console warning if
`p5.plotSvg` isn't loaded, so it is safe to leave in a sketch you haven't decided to
plot yet.

**Do not skip this:** the export replays your drawing code, so only the *stroked*
geometry lands in the SVG. A sketch that paints with `fill()` and `background()` will
export an empty or near-empty file. Section 5 is about writing the sketch so that
doesn't happen.

### 4c. Alternatives

- **[`p5.js-svg`](https://github.com/zenozeng/p5.js-svg)** — a full SVG *renderer* for
  p5 (`createCanvas(w, h, SVG)`). More faithful to screen output (it will happily emit
  fills and alpha), which is why it is the *worse* choice for plotting: it lets you
  export things the pen can't draw. Good when you want SVG for print/web generally.
- **Roll your own** — often the cleanest option. If your algorithm already holds an
  array of polylines, skip the recorder entirely and serialise them:

  ```js
  function polylinesToSvg(lines, w, h) {
    const paths = lines.map(pts =>
      `<path d="M ${pts.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}"/>`
    ).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm"
      viewBox="0 0 ${w} ${h}" fill="none" stroke="black" stroke-width="0.3">
      ${paths}</svg>`;
  }
  ```

  Serialising in **millimetres** with a matching `viewBox` means the file arrives at the
  machine at true size, with no scaling guesswork.
- **[canvas-sketch](https://github.com/mattdesl/canvas-sketch)** (Matt DesLauriers) — a
  Node/browser framework with a first-class `polylines`/SVG export path
  (`canvas-sketch-util`, `penplot` templates). Worth it if you want a build step,
  frame-accurate exports, and print-size presets.
- **[vsketch](https://github.com/abey79/vsketch)** — if you are willing to leave
  JavaScript. Python-native plotter-art framework built on vpype: live-reloading
  sketches, seed/param sweeps, batch export of a whole grid of variations, and vpype's
  optimizations built in. It is the most complete plotter-art environment that exists.
- **[Turtletoy](https://turtletoy.net/)** — minimal JS turtle-graphics playground with
  SVG export; a very fast way to sketch a plotter idea.
- **[p5plotter.com](https://www.p5plotter.com/)** — browser IDE for p5 aimed at plotters.

### 4d. If you're using the `algorithmic-art` skill viewer

The skill's `templates/viewer.html` gives you a sidebar with **Regenerate / Reset /
Download PNG**. To make its output plottable, add the `p5.plotSvg` CDN tag to the
`<head>`, and add one more action button next to Download PNG:

```html
<button onclick="exportSvg()">Download SVG</button>
```
```js
function exportSvg() {
  beginRecordSvg(`plot-${params.seed}.svg`);
  regenerate();          // whatever function paints one full artwork
  endRecordSvg();
}
```

Same caveat: the artwork has to be drawn with strokes for anything to come out.

---

## 5. Designing for the pen

### Stroke-only, from the start

```js
noFill();
stroke(0);
strokeWeight(1);   // screen weight; the real weight is the nib you load
background(255);   // screen only — never exported, and that's correct
```

Design in black on white. Colour choices happen later, at the pen cup.

### Tone without alpha

- **Hatching** — parallel lines; density and angle carry value. Cross-hatch for darker.
  The [`hatched`](https://github.com/abey79/hatched) vpype plug-in converts an image to
  hatch lines if you want a reference-driven approach.
- **Stippling / weighted Voronoi** — dots; classic Secord/Lloyd-relaxation stippling.
- **Spiral and scribble fills** — a single continuous path filling a region; fast to
  plot because the pen never lifts.
- **Line-width modulation by repetition** — draw the same path 2–3× with tiny offsets
  for a heavier line without changing pens.

### Lettering

Never plot text in a normal font: an outline font makes the pen trace each letter's
*contour*, which then has to be filled to read as solid. Use a **single-stroke**
(engraving) font, where each glyph is a centreline the pen simply follows — `vpype-text`
supplies the Hershey set, and this repo carries a small one in
[`assets/strokefont.js`](../assets/strokefont.js):

```js
for (const poly of StrokeFont.text('LT1 PN1 CN5', x, y, 14)) {
  beginShape(); for (const p of poly) vertex(p.x, p.y); endShape();
}
```

### Occlusion (hidden-line removal)

The pen has no z-buffer. If a shape is "in front", you must actively delete the parts of
the lines behind it, or the plot will look like an x-ray. Either handle it in your
algorithm (keep a painter's-order list of occluding polygons and clip each new segment
against them), or run [`vpype occult`](https://github.com/LoicGoulefert/occult)
afterwards, which removes lines hidden by later-drawn closed shapes.

The [studio](../studio.html) does this at composition time: every layer may declare a
silhouette (a hatch patch's outline, a heavy bar's rectangle, the box behind a type
column), and each layer deletes what earlier layers drew behind it. Clipping is exact,
segment against polygon edge — sampling points would leak, because a long dash can cross
a shape with neither endpoint inside it.

Two things to know. First, ink is additive: a bar drawn over dots does not erase them, so
occlusion is a **compositional decision**, not physics — it is what makes a stack of
layers read as depth instead of transparency. Second, it is measured in *length*, never
stroke count: clipping one line in half leaves two strokes and less ink. On the studio's
*Weave* preset it removes 5% of the ink and half a metre of drawing.

### Margins, size, units

Decide paper first, then compose. Useful numbers:

| Paper | mm |
|---|---|
| A6 | 105 × 148 |
| A5 | 148 × 210 |
| A4 | 210 × 297 |
| A3 | 297 × 420 |
| A2 | 420 × 594 |
| Letter | 216 × 279 |

Leave **10–20 mm** of margin: clamps and tape live there, machines lose accuracy at the
extremes of travel, and framing needs it. Clip geometry to the margin box in code
(`vpype crop` is the safety net, not the plan).

### Path count and plot time

Plot time is dominated by **pen-up travel** and **pen lifts**, not by drawn length. Two
sketches with identical ink can differ 3× in duration. Therefore:

- Prefer **long continuous polylines** to many short segments.
- Merge collinear/adjacent endpoints (`vpype linemerge`).
- Sort for travel (`vpype linesort`).
- Budget: a busy A3 fineliner plot is typically **20–90 minutes**. Anything over ~2 hours,
  reconsider — pens dry and nibs wear.

### Layers = pens

One SVG layer (or one stroke colour) per pen. Plot layer 1, swap the pen, plot layer 2
without moving the paper. `p5.plotSvg`'s `setSvgGroupByStrokeColor()` /
`setSvgMergeNamedGroups()` produce Inkscape-compatible layers, and vpype treats layers
as first-class throughout.

The [studio](../studio.html) works this way: each layer carries one of four pens, the
Pens panel reports how many marks each pass will draw, and its SVG export comes out
already grouped — `axicli plot.svg --mode layers --layer 1`, swap, `--layer 2`.

Be sparing. Every extra pen is another pass, another chance to knock the paper, and a
visible registration error if you do. Two pens — one for the drawing, one for annotation
— carries most of the value.

### Determinism

The whole point of the seed in this repo: the SVG you plot must be the artwork you saw.
`Plotter.attach()` rewinds the PRNG before re-drawing for exactly this reason. Record
the seed in the filename and in pencil on the back of the sheet — `?seed=` in the URL
reproduces it forever.

---

## 6. vpype — the post-processor you will actually live in

[vpype](https://github.com/abey79/vpype) (Antoine Beyeler) is the Swiss-army knife of
plotter vector graphics: a CLI that reads SVG, applies a *pipeline* of operations, and
writes plotter-ready SVG or hands off to a plug-in.

```bash
pipx install vpype        # or: pip install "vpype[all]"
```

A representative pipeline:

```bash
vpype \
  read plot.svg \
  linemerge --tolerance 0.5mm \
  linesimplify --tolerance 0.1mm \
  linesort \
  reloop \
  crop 10mm 10mm 277mm 400mm \
  layout --fit-to-margins 15mm a3 \
  write --page-size a3 plot-ready.svg
```

What each does:

| Command | Why |
|---|---|
| `linemerge` | Joins paths whose endpoints nearly touch → fewer pen lifts, and each lift saved is worth far more than the travel (see the measurements below). |
| `linesort` | Reorders paths to minimise pen-up travel. |
| `linesimplify` | Drops redundant points; smaller files, smoother motion. |
| `reloop` | Randomises where closed loops start, so seams don't line up into a visible scar. |
| `splitall` / `filter --min-length` | Break apart, then drop specks below a length threshold. |
| `crop` / `layout` | Clip to the drawable area; centre and fit to the page with margins. |
| `scaleto`, `translate`, `rotate` | Position on the sheet. |
| `linemerge --tolerance` + `multipass -n 2` | Draw each line twice for a darker, more even stroke. |
| `show` | Fast built-in viewer — check before committing paper. |
| `write --page-size a3` | Emit with correct physical size. |

Plug-ins worth installing:

- **[occult](https://github.com/LoicGoulefert/occult)** — hidden-line removal.
- **[hatched](https://github.com/abey79/hatched)** — image → hatch lines.
- **[vpype-text](https://github.com/abey79/vpype-text)** — Hershey/stroke fonts for
  titles and signatures (real single-stroke fonts, not outlines).
- **[vpype-gcode](https://github.com/plottertools/vpype-gcode)** — write G-code for
  GRBL-class machines.
- **[deduplicate](https://github.com/LoicGoulefert/deduplicate)** — remove lines drawn
  twice (very common at shared edges of tiles/cells).
- **[vpype-perspective](https://github.com/abey79/vpype-perspective)**,
  **vpype-flow-imager**, **vpype-pixelart** — situational, all fun.

Two habits that pay off immediately: always `vpype show` before plotting, and keep your
pipeline in a shell script next to the sketch so a re-plot is one command — this repo
ships one at [`tools/plot.sh`](../tools/plot.sh):

```sh
tools/plot.sh drawing.svg a4 15mm     # → drawing-ready.svg, with before/after stats
```

### What optimization actually buys — measured

Run on a real export from this repo's [studio](../studio.html): the *Interrupt* preset,
A4 landscape, two pens, 3,794 paths. Lengths via `vpype stat`, in metres.

| | ink drawn | pen-up travel | paths |
|---|---|---|---|
| raw export | 4.64 | **28.00** | 3,794 |
| `linemerge` + `linesort` | 4.73 | 9.60 | 3,333 |
| + `--two-opt` | 4.73 | **7.93** | 3,333 |

**Travel falls by 72%.** The pipeline costs 1.3 seconds to run. Always do it.

But converting that to time is where the surprise is — at 40 mm/s drawing, 130 mm/s
travel, and 0.3 s per pen up-down cycle:

| | drawing | moving | lifting | total |
|---|---|---|---|---|
| raw export | 1.9 min | 3.6 min | 19.0 min | **24.5 min** |
| optimized | 2.0 min | 1.0 min | 16.7 min | **19.7 min** |

Optimization saves five minutes of a twenty-five-minute plot, because **travel was never
the bottleneck — pen lifts are 85% of it**. Three thousand dashes cost three thousand
servo cycles no reordering can remove.

So the lesson for dotted, dashed and stippled work is the opposite of the usual advice:
**to make it faster, draw fewer and longer marks.** Raising the dash length in a sketch
does more than any post-processing. Optimization is still mandatory — it is nearly free —
but do not expect it to rescue a composition made of ten thousand specks.

(Note `linemerge` slightly *increases* ink: joining two paths within tolerance turns a
short pen-up hop into a drawn segment. 9 cm of extra ink here, in exchange for 461 fewer
pen lifts — an excellent trade.)

How lopsided this is depends entirely on the style. The same measurement on the *Terrain*
preset — long continuous rings instead of dashes, 1,785 paths — gives 6.1 min drawing,
0.8 min moving, 8.3 min lifting: still lift-dominated, but 55% rather than 85%. Long
paths are cheap; specks are expensive. That ratio is the single most useful thing to know
about a composition before committing paper.

The studio shows it live: each pen reports its mark count and estimated plot time, with
the pen-lift share called out. Its estimate uses the same greedy nearest-neighbour
ordering `linesort` does, and matched the two vpype measurements above to within 12% and
5% — erring conservative both times.

---

## 7. Driving the machine

**AxiDraw / NextDraw**

- **Inkscape extension** — the official GUI route. Open the SVG, `Extensions → AxiDraw
  Control`, set pen-up/down heights and speed, plot. Good for one-offs and for the
  interactive setup/height tuning.
- **CLI** — `axicli` (AxiDraw) / `nextdraw` (NextDraw). The scriptable route:

  ```bash
  axicli plot-ready.svg --model 2 --speed_pendown 25 --pen_pos_down 40 --pen_pos_up 60
  axicli plot-ready.svg --mode layers --layer 1     # multi-pen: one layer at a time
  axicli --mode align                               # release motors to reposition by hand
  axicli --mode toggle                              # pen up/down, for setting height
  ```
- **[saxi](https://github.com/nornagon/saxi)** — a much nicer third-party driver for
  AxiDraw: a browser UI, live preview, accurate time estimates, and
  constant-acceleration motion planning that is noticeably smoother and quicker than
  the stock software. `npm i -g saxi && saxi`.

**GRBL / CNC / 3D-printer-based machines**

Convert to G-code — `vpype-gcode`, or [`juicy-gcode`](https://github.com/domoszlai/juicy-gcode)
— then send with [LaserGRBL](https://lasergrbl.com/), [Universal Gcode Sender](https://winder.github.io/ugs_website/),
`bCNC`, or your printer's own host. Pen up/down becomes a Z move or a servo `M3`/`M5`;
that mapping is the only fiddly part, and it is configurable in both converters.

**Vintage HP-GL machines**

`vpype write --format hpgl --device hp7475a` writes HP-GL directly (vpype ships device
configs); push it down a serial port with `chiplotle` or plain `cat > /dev/ttyUSB0` with
correct flow control.

HP-GL is worth being able to read — it is two-letter mnemonics with comma-separated
numeric parameters, terminated by `;`, in **plotter units of 1/40 mm** with the origin at
bottom-left (y up, unlike a canvas):

| | |
|---|---|
| `IN;` `SP1;` `SP0;` | initialize · select pen 1 · put the pen away |
| `PU`x,y`;` `PD`x,y`;` | move there pen-up · draw there pen-down — the two commands that make every mark |
| `IP`x1,y1,x2,y2`;` `SC`…`;` | set the scaling points P1/P2 · map your own units onto them |
| `IW`…`;` | clip window — nothing outside it is drawn |
| `LT`n,len`;` | line type n, pattern length as a % of the P1–P2 diagonal (this is how a plotter draws a dotted line) |
| `PT`w`;` `WU0;` | pen thickness for fills, in mm · declare width units metric |
| `TL`a,b`;` `XT;` `YT;` | tick length, then draw an x- or y-axis tick |
| `EA`x,y`;` `CI`r`;` `AA`…`;` | edge a rectangle to that corner · circle · arc absolute |
| `LB`text`;` `DI`run,rise`;` | print a label · set label direction |

[010 Plotter Interrupt](../projects/010-plotter-interrupt/) uses these for real: its menu
column is a valid HP-GL program whose values are measured off its own drawing.

---

## 8. Pens, ink, paper

**Pens** (roughly in order of how often they get used)

- **Sakura Pigma Micron** (005–08) — archival pigment, the community default. Reliable,
  huge size range, dries fast.
- **Staedtler Pigment Liner** / **Uni Pin Fine Line** — same category, slightly
  different line character; both very consistent.
- **Rotring Rapidograph / Isograph** — refillable technical pens, the classic plotter
  instrument. Beautiful line, but they clog if you look away; best for long runs where
  you'll clean them properly afterwards.
- **Sakura Gelly Roll / Uni-ball Signo** — gel; opaque white and metallics on dark
  paper. Watch the drying time.
- **Posca / paint markers** — thick opaque colour, chunky lines, needs a spring mount
  and a slower speed.
- **Fountain pens** — genuine line-width variation with speed; wonderful and messy. Use
  a flexible mount, and be ready to blot.
- **Brush pens** — pressure-sensitive character; requires very careful pen-down height.
- **Ballpoints / Sharpies** — cheap and cheerful for tests; not archival, and Sharpie
  bleeds.

Always keep a **test pen** you don't mind ruining for the first pass of a new design.

**Paper**

- **Cheap copier paper** — every test plot. Never test on good stock.
- **Bristol board (smooth/plate, 250 gsm)** — the workhorse for fineliner work. Crisp
  lines, no bleed, no feathering.
- **Stonehenge / Rives BFK / Fabriano Artistico** — printmaking papers, cotton, lovely
  tooth; ink sinks slightly and the line softens. This is where plots start to look like
  *objects*.
- **Canson XL Mixed Media, Strathmore 400** — good mid-price sketchbook stock.
- **Coloured / black stock** — with gel or metallic pens; a completely different palette.

Rules of thumb: **≥ 160 gsm** so the sheet doesn't cockle or shift; smooth surfaces for
fine nibs, toothy for broad; and give pigment ink real drying time before the next pen
layer or you will drag it.

**Mounting**

Low-tack painter's tape or washi at the corners, or a couple of small magnets on a steel
bed. The sheet must not move between layers — that is your registration.

---

## 9. At the machine — workflow and troubleshooting

A working loop that avoids wasted paper:

0. Compose it in the [studio](../studio.html) if you're starting from nothing — its
   elements (rulings, hatch, flow, rings, grid, void) are the vocabulary of §5, already
   stroke-only, and it exports plotter-ready SVG directly. Then: choose the seed
   *before* you export. Paper and pen time are the expensive part, so
   pick from a contact sheet ([`variations.html`](../variations.html) — the **⊞ Contact
   sheet** button in any piece's panel) rather than plotting the first seed you see.
1. `vpype show` the final file. Look for stray lines outside the margin, and for
   ludicrous path counts.
2. Plot on copier paper first, with a cheap pen, at high speed. This is a **proof**, not
   a print — you're checking composition and time, not line quality.
3. Set pen height with `--mode toggle`: pen down should just kiss the paper. Too low
   splays the nib and bleeds; too high skips.
4. Load the real paper and pen, drop the speed, and plot. Stay in the room for the first
   few minutes.
5. Let it dry. Sign and number in pencil, with the **seed**.

Common problems:

| Symptom | Usually |
|---|---|
| Skipping / broken lines | Pen too high, or ink starved (shake/prime it), or drawing too fast for the nib. |
| Blobs at line starts and ends | Pen too low, or dwelling too long at pen-down; reduce pen-down delay, raise the pen a touch. |
| Wobbly diagonals | Belt tension, or acceleration too high for the machine. |
| Plot takes forever | You skipped `linemerge`/`linesort`, or your algorithm emits thousands of two-point segments. |
| Second colour is misregistered | Paper moved. Tape harder, and never re-home between layers. |
| Torn paper / grey smear | Too many overdraws in one spot, or a pigment pen dragging through wet ink. |
| Lines darker where they cross | Correct and unavoidable — design with it. |

---

## 10. Adapting the nine pieces in this gallery

| Piece | Plots as-is? | What to do |
|---|---|---|
| [001 Flow Field](../projects/001-flow-field/) | **Yes — best starting point.** | Particle trails *are* polylines. Emit one path per particle instead of per-step `line()` calls, drop the alpha-based ink density in favour of particle count, and set `noFill()`. Classic plotter output. |
| [002 Particle Life](../projects/002-particle-life/) | With work | Plot the *trajectories*, not the frame. Record each particle's path over N steps as a polyline; the clustering reads beautifully as tangled line. |
| [003 Watercolor](../projects/003-watercolor/) | No | Fill- and alpha-native. Reinterpret: plot the deformed polygon *outlines* only — the same evolution algorithm, drawn as nested contour lines, gives a topographic version of the same idea. Or hatch each blob with density ∝ intended opacity. |
| [004 Flow Ribbons](../projects/004-flow-ribbons/) | **Yes** | Ribbons already have crisp polygon edges. Plot outlines, then hatch the interiors at an angle derived from the flow direction. Occlusion matters here — run `vpype occult`. |
| [005 Differential Growth](../projects/005-differential-growth/) | **Yes — ideal** | It is literally a single closed polyline. One path, one pen-down, zero travel waste. Freeze at a chosen frame count and export. |
| [006 Grid Collapse](../projects/006-grid-collapse/) | **Yes** | Grid work is native to the medium. Watch for duplicated cell edges — `vpype deduplicate` or `linemerge`. |
| [007 Watercolor Landscape](../projects/007-watercolor-landscape/) | Partly | The shape-trees, sun disc and ridge lines are all outline geometry — those plot directly. Drop the washes, or render them as hatch bands. |
| [008 Watercolor Tree](../projects/008-watercolor-tree/) | Partly | The line drawing underneath is the plot. Export the branch structure; keep the watercolour for the screen version, or paint the plot by hand afterwards (a legitimate and lovely hybrid). |
| [009 Watercolor Painter](../projects/009-watercolor-painter/) | No | Raster/region-fill by nature. If you want a plotter cousin, plot the region *boundaries* as a colouring-book sheet — then paint it with real watercolour. |
| [010 Plotter Interrupt](../projects/010-plotter-interrupt/) | **Yes — built for it** | Written stroke-only from the start: dotted rulings, multipass bars, single-stroke lettering, no fill anywhere. Press **V**. It emits ~4–5k short marks, so run `linemerge`/`linesort` before plotting (§6) or you'll spend most of the plot travelling. |

The general move for the watercolour pieces: **plot the structure, add the wash by hand.**
That hybrid is a well-trodden and rewarding path, and it is what plotter artists do when
they want colour without twelve pen changes.

---

## 11. Resources

**Start here**

- **[awesome-plotters](https://github.com/beardicus/awesome-plotters)** — the curated
  master list: machines, software, algorithms, communities. If you read one link, this.
- **[drawingbots.net](https://drawingbots.net/)** — categorised directory (SVG
  generators, plotter control software, algorithms, supplies, vintage machines) plus an
  active **Discord** that is the best place to ask a hardware question.
- **[penplotterartwork.com](https://penplotterartwork.com/)** — blog with practical
  build/plot writeups.

**Software docs**

- [vpype](https://vpype.readthedocs.io/) · [vsketch](https://vsketch.readthedocs.io/)
- [p5.plotSvg](https://github.com/golanlevin/p5.plotSvg)
- [AxiDraw docs](https://axidraw.com/doc/) · [Bantam Tools / NextDraw](https://www.bantamtools.com/)
- [saxi](https://github.com/nornagon/saxi)
- [Turtletoy](https://turtletoy.net/) · [p5plotter.com](https://www.p5plotter.com/)

**Algorithms worth implementing (all plot well)**

Flow fields · differential growth · circle packing · Voronoi/Lloyd relaxation ·
weighted stippling · Truchet tiles · space-filling curves (Hilbert, Gosper) ·
maze generation · isolines/contours of a noise field · harmonograph and epicycloid
curves · Wave Function Collapse · L-systems · Delaunay triangulation ·
Perlin-warped grids · 3D-to-2D projection with hidden-line removal.

Michael Fogleman's [notes and repos](https://www.michaelfogleman.com/) (`ln`, `pt`,
`primitive`, hidden-line 3D) and Anders Hoff's [inconvergent](https://inconvergent.net/)
writeups are the two best free educations in this specific craft.

**History worth knowing**

The plotter *is* the original medium of computer art. **Vera Molnár**, **Manfred Mohr**,
**Frieder Nake**, **Georg Nees**, **Roman Verostko**, **Charles Csuri**, **Harold Cohen**
(AARON) and **Desmond Paul Henry** all made their central work on drawing machines from
the mid-1960s on. Studying their constraint-driven, rule-based approach is the fastest
way to get good at this — the machine hasn't changed nearly as much as you'd think.
Study the *method*, make your own work.

**Contemporary practitioners to follow** (for technique, not to copy): Licia He, Paul
Butler, Antoine Beyeler (vpype's author), Loïc Goulefert, Sasha Trubetskoy, Julien
Gachadoat, and the plotter channel on the drawingbots Discord.

---

*Questions this guide doesn't answer are almost always answered in
[awesome-plotters](https://github.com/beardicus/awesome-plotters) or by asking on the
drawingbots Discord.*
