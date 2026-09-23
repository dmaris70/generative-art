# 026 — Ridge, recomposed

The 024/025 copy study taken apart into its components, each morphed, and put back together
as a new two-sheet landscape per seed. **Derived from a copy of someone else's image — a study,
not a collection entry.**

1. **Decompose** — `parts.js`, every number measured on the two sheets: cloud (ground tone, the
   darker middle band, one bright knot) · the hollow (soft dark mass) · the skyline (one long
   rise, a knuckled crag, the summit leaving the sheet) · rock (body tone, strata running with
   the skyline, crevices with lit crests) · the dark spine falling from the crag · the pale
   flank beyond it · the movement smear growing toward one corner · the pale track · fog tongues
   eating the skyline · the grain law · the mat and the cut (each picture pushed against the
   inner edge of its sheet).
2. **Morph** — `compose.js`. No skyline is invented: every ridge is the *source* profile read
   through `reflect(x·scale + shift)`, lifted, flattened and roughened, so the one rise and its
   crag return as peaks, ranges and faces. Ridges get a distance (contrast and edge fall off
   with it); the hollow moves, flattens, or goes behind the summit as storm-dark; spine lean,
   smear corner/angle, cloud band and knot are re-drawn; the track lies on a new stretch of skyline.
3. **Recompose** — five regimes, chosen by the hashed seed: **massif** (one summit moved inward,
   dark sky behind), **range** (three receding reflections), **inversion** (crags out of a cloud
   sea), **pass** (two flanks and a saddle holding the hollow), **wall** (the rise steepened into
   a face). The panorama is cut in the middle and each half is painted by the same
   `assets/drybrush.js` engine, streak map and grain law as the copy. See `regimes.png`
   (top-left = recompose 0).

`recompose` = 0 returns the parts in their source arrangement; 1 is the new synthesis.

**Interface** (`index.html`, no p5 / lil-gui — the painter is pure arithmetic and runs in `worker.js`, so the desk
never freezes): the two sheets hang on a dark wall; the desk on the right holds the **seed** (large, grouped digits,
and the regime it fell into) with ‹ previous · **Random seed** (a fresh 32-bit draw from `crypto.getRandomValues`) ·
next ›, and a jump field that takes a number *or a word* (FNV-1a hashed, like the gallery's `?seed=`). **Deal six**
lays out six random seeds as small unpainted sketches (the composed tone only, ~0.15 s each) — click one to paint it.
**Visited** keeps the last twelve seeds as chips. Then regime (by seed / five regimes), composition sliders
(recompose, drama, fog tongues, movement smear), hand sliders (dry bristle, dry drag, grain), Reset, Copy link
(`?seed=…&p_name=…`), Download both sheets (PNG, 2×). Keys: `R`/space random · `←` `→` step · `D` deal · `S` download.
Same seed + parameters → bit-identical sheets (checked by checksum after leaving and returning to a seed).
Compose + paint ≈ 2 s.
