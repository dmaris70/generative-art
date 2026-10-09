# 023 — Herd, recomposed

The 022 copy study taken apart into its components, each morphed, and put back together as a
new synthesis per seed. **Derived from a copy of another artist's sheet — a study, not a
collection entry.**

1. **Decompose** — `decompose.py` splits the 022 trace into: ten horses / horse-groups (colt,
   white, trio, blue, spotted, cream, bay, black, runner), moon, white tree, forest band, two
   plants, and the ground that is left. Membership = hand-drawn catchment polygons + a pigment
   rule (meadow greens stay with the ground). The upper three horses overlap too tightly to
   separate and stay one component. Every lifted passage remembers the ground pigment that
   closes its hole; coat fragments no catchment claimed are lifted as `stray`.
2. **Morph** — per instance: flip, anisotropic stretch, shear, lean, a slow noise warp (bends
   necks and legs, keyed by source position so a component never tears), a small coat shift.
   The ground is mirrored and warped (pinned at the sheet edges); the world's greens move into
   one of five regimes (green night, blue hour, viridian deep, olive noon, indigo night).
3. **Recompose** — forest and tree take opposite sides, the moon hangs between them at a new
   size and phase angle, plants take the bottom corners, a herd of 6–12 (repeats allowed) is
   placed with stratified depth, scale growing toward the viewer, most heads turned to the
   moon; painted back to front with the 022 watercolour pipeline.

`recompose` = 0 returns the source arrangement (decomposed, unmoved); 1 is the new synthesis.
Keys: `R` new synthesis · `S` save PNG. Params: recompose, morph, herd size, regime, wetness,
edge pooling, granulation, pencil.
