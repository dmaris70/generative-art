# 049 — Two Observers

A marbling bath in one bit, watched by two observers. A seeded collage of stripes, lattices, bands
and contour fields is floated on the bath; then a score of gestures works it — ink dropped in
concentric stones, combs dragged back and forth, waves, swirls — until the paper goes down and a
print is taken. Every ink is seen by one of two observers. The **Eulerian** observer looks through
a fixed screen on the glass. The **Lagrangian** observer's screen is printed on the ink itself, so
its dots and lines are combed, stretched and folded with the material. Where the ink is squeezed
finer than the eye can resolve, the fixed observer takes over.

![seed 9, bath 1, the print: 52 gestures, 6 eulerian and 5 lagrangian inks](preview.png)

**Mechanism (one sentence):** every gesture is an exact, invertible map of the plane, so the bath
at time *t* is found by pulling each pixel back through the gestures that have started, newest
first, until it lands in a drop's ink or on the ground — nothing is simulated or stored between
frames, and any moment of any bath can be rendered directly from (seed, bath, t).

## Foundation and departure

The starting point was a 24-second loop posted by the creative coder loackme
([@loackme_](https://x.com/loackme_/status/2112194803622441179), 19 October 2026), read frame by
frame: a 1-bit, ordered-dither render (a dither cell of about 4 px at 1040 × 1280) of a
grayscale collage — diagonal bands with white and black edges, vertical stripes in a rotated
window, a diamond lattice, nested contour rings — being folded by a slow continuous flow, inside a
thin ruled frame. The post names no tools and its code is not public; that reading is inference
from the pixels.

Kept: the collage of procedural fields in rigid windows, folding motion, contour rings, coarse
1-bit dithering, the ruled plate. Departures:

| | foundation (as read) | Two Observers |
|---|---|---|
| motion | a smooth flow field, warping | the craft of paper marbling: drops, combs, waves, swirls, each an exact, area-preserving map with a closed-form inverse |
| time | a loop, presumably integrated | stateless: frame *t* is computed from the score alone, so time can be scrubbed, linked and printed at any instant |
| dither | one screen for the whole frame | two observers per ink: fixed screens (Bayer 8 × 8, void-and-cluster blue noise) and material screens (dots, lines) carried by the ink, with a resolvability hand-off between them |
| rings | contour bands of a field | also the real thing: stones of concentric drops, deposited one inside another |
| form | an endless loop | sessions: each bath is scored, worked, settled and *printed*, then the print peels away and the next bath is floated |
| record | the video | the score: every bath exports as JSON (ground, inks, observers, gestures, times) — the print is fully described by it |

## The bath

- **Plate:** 4 : 5, coordinates in plate units (1 × 1.25), origin at the centre, y down.
- **Ground (t = 0):** a background field (wavy bands or a smooth noise field) and three to five
  rigid windows — rectangles or diamonds — of hard stripes, a diamond lattice, a contour field
  (iso-lines of fBm) or bands at the cross angle.
- **Inks:** black, white, two greys, a ringed ink and a striped ink, each assigned an observer at
  random with probability *lagrangian share* (0.5 by default).
- **Gestures** (Lu, Jaffer et al., *Mathematical Marbling*, IEEE CG&A 2012), each with a start, a
  duration and smooth-step progress *s*:
  - *drop* at *c*, radius *r*: outside points move out, `p' = c + (p − c)·√(1 + r²s/|p − c|²)`;
    pulled back by `√(1 − r²s/|p' − c|²)`, and a point inside the disc is that drop's ink;
  - *comb* of *n* tines, spacing δ, along direction *M*: `p' = p + z s α/(d + α) · M`, *d* the
    distance to the nearest tine — the shift is along *M*, so *d* is unchanged and the inverse
    is a subtraction;
  - *wave* along *M*: a shift along the normal by `A s sin(ω u + φ)`, *u* the position along *M*;
  - *swirl* about *c*: a rotation by `z s α/(|r − R| + α) / r`, radius preserved.
- **Movements:** six seeded orders of stones, scatters, combs (gel-git, back and forth), a fine
  comb, waves and swirls, always ending on drops — clean ink laid on the worked field before the
  paper goes down. Over 900 scores (seeds 1 – 300, baths 1 – 3, default density): 32 – 71
  gestures (5th – 95th percentile, median 51) and 26 – 44 s of work a bath, then a six-second
  hold on the print.

## The two observers

- **Eulerian:** threshold from the pixel, not the ink — Bayer 8 × 8 or a 64 × 64 blue-noise screen
  generated at load by void-and-cluster (Ulichney 1993).
- **Lagrangian:** threshold from the ink's own coordinates — an AM dot screen or a line screen at
  55 – 95 lines per plate unit and a seeded angle, so it deforms with the ink.
- **Hand-off:** the shader measures how many ink units one pixel spans (screen-space
  derivatives of the pulled-back coordinate). When the material screen's period falls below
  *resolvable period* (2.5 px by default), that pixel is read through the blue-noise screen. The
  border between the two readings is a contour of compression; it shows where the hands squeezed
  the bath.
- **Tone:** a pixel is paper when the ink's tone exceeds its observer's threshold; stripes and
  edges are already 0 or 1 and pass through any screen unchanged.

## Prints and scores

- **P** — the print: the screen's own bits enlarged by a whole factor to about 4,000 px tall, on
  the paper with its rule and caption. No resampling, no new pixels: the print is what the
  observer saw.
- **J** — the score as JSON: seed, bath, session seed, movement, ground windows, every ink with its
  observer and screen, every gesture with its times and parameters.
- **S** — the whole sheet as shown.

## Controls

Space pause / play · ← → scrub one second (Shift: five) · N / B next / previous bath · O the score
drawn over the plate (gestures in progress, in red) · P print · J score · S sheet · R new seed.
Panel: *cell* (css px per dither cell, 2 by default — about the foundation's grain), *speed*,
*lagrangian share*, *gesture density*, *resolvable period*. URL: `?seed=…&bath=…&t=…&pause=1`
reproduces a moment; the panel writes its own parameters to the link.

## Files

- `marble.js` — score generator, blue-noise screen, the pull-back and both observers on the CPU,
  packing for the shader, the JSON record. Runs in Node.
- `sketch.js` — the WebGL2 fragment shader (the same arithmetic per pixel), the sheet, the bath
  life cycle, exports. Without WebGL2 it falls back to the CPU path.

## Verification

- GPU against CPU, headless Chromium (SwiftShader), grid 336 × 420: the shader's bits agree with
  `marble.js` on 98.53 % (seed 7, t 20), 99.66 % (seed 21, t 30) and 99.22 % (seed 404, the
  print) of cells. The remainder are pixels whose tone sits on a threshold (float32 against
  float64) or whose derivative crosses a material edge. Frame time there: 200 – 220 ms.
- Page life cycle: score overlay, print download (3780 × 4830), score download, auto-advance to
  the next bath with the peel, 0 page errors.
- Composition was tuned on CPU renders of six seeds: the first scores ended on a fine comb and
  shredded the field to grain; every movement now ends on drops, and comb displacements were
  roughly halved.

## Known limits

- Bits are reproducible from (seed, bath, t, parameters) to the agreement above; another GPU can
  differ on threshold pixels. The JSON score is the exact record.
- Material screens are fixed in plate units, so a small window shows a coarser material grain and
  more hand-off to the fixed screen than a large one.
- Cost grows with the number of gestures started (up to 160 per pixel per frame). Frame times
  were measured only under SwiftShader (200 – 320 ms at 336 × 420, CPU-emulated); not profiled
  on hardware GPUs here.
- A comb's progress scales its displacement; a real stylus front travelling along the stroke is
  not modelled.
- The caption is antialiased text; the plate alone is strictly two colours.
- At *gesture density* 1.5 some scores reach the 160-gesture cap; gestures past it are dropped,
  closing drops included.
- The contact-sheet button opens one WebGL context per tile; browsers cap live contexts, untested.
