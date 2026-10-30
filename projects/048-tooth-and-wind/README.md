# 048 — Tooth and Wind

An animated charcoal drawing of a reedbed that never finishes. Stalks are drawn up from the
ground and lean in a moving wind; grey plumes are scumbled with the side of the stick, rubbed
smooth with a finger, lit from inside with an eraser and edged in black; dabs are thrown down
the wind. When the sheet fills, an eraser takes a region back, and the drawing grows again
over what is left of it.

![seed 7, bone ground, ~90 s in: two erasures, plumes, stalks, flicks](preview.png)

**Mechanism (one sentence):** a simulated sheet — a paper height map plus charcoal and chalk
fields — is worked one footprint at a time by four tools (stick, chalk, finger, eraser) whose
gestures are bent by a seeded, turning wind field crossed by gusts, and the eraser burnishes
the paper so every erasure stays in the sheet as a place that takes less charcoal.

## Point of departure

A charcoal study of reeds or grasses: long broken diagonals, flame-shaped grey masses with
striated interiors and dark edges, tapered dabs, scumbled hatching, and white streaks drawn
out with an eraser. The piece takes that vocabulary as grammar — each kind of mark is a rule,
not a picture — and adds what a still drawing cannot have: time, wind and loss.

## What departs from the source

| In the source | Here |
|---|---|
| marks laid once | marks drawn live, one footprint a frame, so the drawing is watched being made |
| one wind, implied by the lean | a wind field that turns over minutes, gusts that cross the sheet as fronts, and a lean that follows it while a stroke is still being drawn |
| the eraser makes the lights | the eraser also manages time: when the sheet passes a fill threshold it sweeps the darkest region back |
| paper is a surface | paper is a material: its tooth decides where charcoal catches, and erasing polishes it |
| one sheet | the viewer's drag is a finger in the charcoal and a breath of wind; three grounds (bone, toned with white chalk, night) |

## The sheet

Three fields, one value per pixel (internal resolution capped at ~1.35 Mpx):

- **T — tooth.** Per-pixel fibre noise + value-noise octaves at ~2, 5 and 15 px + faint laid
  lines, normalized to [0, 1]. High = a peak of the paper.
- **C — charcoal**, **K — chalk**, both in [0, 1].

Rendering: paper colour shaded slightly by T, mixed toward charcoal by C, then toward chalk
by K. Night inverts the result.

## The tools (one footprint each)

- **Stick** (charcoal or chalk). Deposit = `pressure · falloff · grit − (1 − T) · tooth`;
  only the positive part lands, saturating. Light pressure catches on the peaks and breaks into
  grain; hard pressure fills the valleys. Laid on its side (`ell` > 1) the footprint is narrow
  along the stroke and broad across it, and a per-stroke grit table pulls it into parallel
  striations — the texture of the plumes. Chalk also partly buries the charcoal under it.
- **Finger.** Carries a load: each footprint lays its load down (independent of the tooth, so
  smudges are smooth) and picks up a weighted average of what is under it. Pigment is moved,
  not added.
- **Eraser.** Lifts C (and half as much K) with a crisp kneaded edge and lowers T. Burnished
  paper takes less charcoal later: the ghost of every erasure is in the paper, not a layer.

A gesture (a *hand*) advances a few footprints a frame along a heading. Its pressure and
radius follow attack/release tapers; a two-octave noise along its length drops pressure to
zero where a dry stick skips; its heading curls on its own noise and is pushed by the wind,
limited to a maximum deviation from where it started, so a stalk leans rather than lies down.

## The grammars

| Grammar | Built from |
|---|---|
| **Stalk** | a long thin broken charcoal stroke from below, leaning with the wind; may shed leaf flicks to one side |
| **Tuft** | 2–6 stalks fanned from one root |
| **Plume** | 18–34 side-of-stick strokes converging upward to jagged tips, 2–6 spikes, then 3–8 finger passes, 1–5 eraser lights (with chalk on toned), and 1–5 broken black edge strokes on one side |
| **Hatch** | 4–13 near-parallel light strokes at a diagonal set by the wind |
| **Splatter** | 4–16 flicks thrown down the wind: a heavy landing tapering to a point |
| **Long line** | a reed crossing the whole sheet |
| **Gust** | a front sweeping across in the wind's direction, smearing charcoal along itself and throwing dabs and light streaks |
| **Sweep** | 4–9 broad eraser strokes (and finger passes) over the darkest of 12 probed sites, triggered when sampled charcoal coverage exceeds *fill* |

Hands are spawned around 2–5 **stands** — drifting centres with their own fan direction and
mix of grammars, each living 10–35 s before being replaced — on a slow sinusoidal breath, so
activity rises and falls.

## Controls

| | |
|---|---|
| gestures a second · pace · weight of the plumes | the hands |
| wind · gustiness | the weather |
| tooth · smudge · eraser · fill before erasing · ground · caption | the sheet |

Only the seed (and a window resize) rebuilds the sheet; every other setting changes the
weather over the drawing already there.

Keys: **R** new seed · **S** save PNG · **G** gust · **E** erase · **Space** pause.
Drag to smudge and blow; double-click to throw a splatter. `?gui=0` (contact-sheet tile)
develops 1,800 frames (30 s) off-screen and holds still.

Determinism: same seed and settings → same sequence, frame for frame, until the viewer
touches it.
