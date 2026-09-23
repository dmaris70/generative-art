# 021 — Overlap Law

**Mechanism (one sentence):** a form has no colour of its own — pigment is assigned by
what the form overlaps — so taking the same twelve parts apart, deforming them and
re-anchoring them repaints them.

Derived from `021-crescent-study` (a copy of an abstract oil on linen; source artist
and title not supplied). This is a generator, **not a collection entry**; it is not in
`projects.json`.

## Decomposition — the twelve parts
plate (a rectangle with an internal split) · lobe · sail · beaked crescent · great disc ·
small disc · hidden quadrilateral · horn · dome · shadow spike · blade · scroll.
`parts sheet = 1` shows each alone, in the colour it has when it overlaps nothing.

## The overlap rules read off the source
- black turns warm brown inside the plate;
- the small disc is orange outside the plate and oxblood inside it; the great disc exists
  only inside the plate and on the far side of the beak's lower edge;
- the bright sector is never a shape in its own right: it is a quadrilateral that becomes
  visible only where it meets a disc inside the plate;
- the shadow spike turns green where its own circle crosses it;
- the dome exists only inside the plate; the lobe always sits flush to a plate edge;
- whites are lead white: they crack.

## Morph and recomposition
- **morph** — continuous: the plate changes proportion (it stays a rectangle — the
  invariant everything else pushes against); each part gets its own rotation, scale and
  drift; the hub cluster (beak, discs, quadrilateral) moves as one body about the hub; one
  slow warp field bends every outline.
- **recompose** — discrete: parts make quarter turns about the plate; edge-attached parts
  migrate to another edge and stay flush; the scroll is re-tied to another tip (either end
  of the blade, or the beak) and leaves in the direction that costs the landscape canvas
  least; mirror; one of four colour regimes, assigned by ROLE.
- **explode** — parts retreat from the plate along their own radii; the overlap colours
  switch off one by one.
- `morph 0 · recompose 0` reassembles the source arrangement.

Composition has its own rng stream, so brushwork / weave / cracks / wobble never move a
form. Same seed → bit-identical canvas (checked headless).

Surface: `assets/oil.js` (oil-on-linen functions extracted from 020: `oil`, `craquelure`,
`ground`, `halo`, `linen`). URL params use GenArt's `p_` prefix, e.g.
`?seed=24&p_morph=0.8&p_recompose=1`. Keys: `R` new seed · `S` save PNG.
