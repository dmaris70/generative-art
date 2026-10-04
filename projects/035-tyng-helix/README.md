# 035 — Tyng Helix

**Mechanism (one sentence):** one complex multiplication, `z → (i/q)·z`, repeated on a single
vector produces the whirling squares; each square is raised into a box whose height shrinks
by a second ratio; and the quarter-arc through each box, rising from a bottom corner to the
diagonally opposite top corner, is the helix.

This is a study after Anne Griswold Tyng, *Spiral Extension of Helix*, plate in
*Form Finds Symmetry in Geometry* (1969). The plate is reconstructed from its own
geometry. No image or text is copied from it. The sketch is a generator, **not a
collection entry**, and it is not in `projects.json`.

## Reading the plate

The plate states three equal ratios:

| plate | meaning | in this construction |
|---|---|---|
| vertical turns `X/Y = Y/Z = φ` | each box (turn) is φ times taller than the next | `h_k = qv^-k` |
| horizontal turns `AB/BC = BC/CD = φ` | the chord of each quarter turn shrinks by φ | `|P_k P_k+1| ∝ q^-k` |
| radius of turns `OA/OB = OB/OC = φ` | the distance from the pole O shrinks by φ per quarter turn | `|P_k| ∝ q^-k` |

The plate has two parts. At the bottom is the golden rectangle in plan: whirling squares
spiral into the pole O, and two diagonals cross at O at right angles. Above it is the same
spiral rising in space, with each square extruded into a cube that stands on top of the
previous one. The tower converges to a point vertically above O.

## The mathematics

**1. Whirling squares as one complex map.** Treat the plan as the complex plane, with the
pole O at 0. Let `s = i/q`, which is a quarter turn combined with a shrink by 1/q. The spiral
corners are

    P_k = s^k · v

where `v` is chosen so that `P_1 − P_0` points at 135°:
`v = d0 / (s − 1)` and `d0 = √2·e^{i3π/4}`. Each difference `P_{k+1} − P_k` is the previous
one turned 90° and scaled, so every difference lies on a 45° diagonal. Square *k* is the
axis-aligned square that has `P_k P_{k+1}` as its diagonal. Its side is `s_k = q^-k`.

**2. The arcs.** The plan spiral is made of quarter circles. Each one runs from `P_k` to
`P_{k+1}` and is centred on the square's corner nearest the pole. Self-similarity puts the
two adjacent centres and the shared point on one line, so successive arcs always join
tangentially (G¹), for any `q`. The arcs approximate the logarithmic spiral
`r = r0·q^(−2θ/π)`, which runs through all the `P_k`.

**3. Why φ, and what changes with other ratios.** The squares tile the rectangle exactly only
when removing a square leaves a similar rectangle: `q = 1 + 1/q`, so `q² − q − 1 = 0` and
`q = φ`. For any other ratio the construction still closes as a spiral, but the squares
overlap (`q < φ`, for example √φ or the plastic number) or leave gaps (`q > φ`, for example
φ² or the silver ratio). The sheet prints this misfit as `TILE ERROR Q2−Q−1`. This is the
plate's remark that "other proportional series" can define "a wide variety of spiral forms",
made visible.

**4. The pole diagonals.** `s² = −1/q²`, so `P_k`, `O` and `P_{k+2}` are collinear. The lines
`P_0P_2` and `P_1P_3` therefore both pass through O, and they are perpendicular. These are
the plate's two crossing construction lines.

**5. The helix.** Box *k* stands on square *k*, with `z ∈ [Z_k, Z_k + h_k]` and
`Z_k = Σ_{j<k} h_j`. The total height converges to `qv/(qv − 1)` (`φ²` for φ). The curve
inside box *k* follows the plan arc and rises by `h_k`, from the bottom corner `P_k` to the
top corner `P_{k+1}`. Both the arc length (`π s_k / 2`) and the rise (`h_k`) shrink by the
same factor when `qv = q`. The linear-lift curve therefore has a constant pitch angle,
`atan(2/π) ≈ 32.5°`. It is a conical spiral with equal angles in plan and in elevation, the
3-D counterpart of the logarithmic spiral. The *S-lift* option alternates sine and
one-minus-cosine profiles from turn to turn. That keeps the tangent continuous while the
curve flattens and steepens, like the S-sweep in the plate.

**6. Projection.** The projection is oblique: `screen = (x + r·cosθ·y, −(z + r·sinθ·y))`.
The plate uses about θ = 68° and r = 0.4 for the tower. Tyng draws the ground plan with a
deeper shear than the tower, which is a draughtsman's licence. Here the plan and the tower
share one projection, so the tower truly stands on its plan.

**7. "Any of the 5 solids may be substituted for the cube."** Each box can carry a Platonic
solid normalised to it:
- the tetrahedron, from alternate vertices of the cube;
- the octahedron, from the face centres;
- the dodecahedron, the cube plus twelve points at `(0, ±1/φ, ±φ)`;
- the icosahedron, three orthogonal golden rectangles.

Edges are the vertex pairs at minimum distance. The frame turns 90° with every turn, so the
tetrahedron alternates with its dual: "polarity within rotation". When a solid other than
the cube is used, the governing cube stays visible in sepia.

## Variation (seed → version)

The seed (mulberry32 over the integer, with an FNV-1a hash for string seeds) chooses:
- the series: φ (weighted heavily), φ², √φ, plastic, √2, silver;
- whether the vertical ratio is equal to the horizontal ratio or is another member of the
  φ family;
- the number of turns, set by convergence to about 5% of the base;
- handedness and plan rotation;
- the oblique angle and the recession;
- the solid (or all five in turn);
- the lift profile;
- the direction: decreasing upward, or increasing upward ("the Divine Proportion
  progression occurs in the increase or decrease in size of units");
- the number of outward turns in the plan.

The seed of the work id, `hash("035-tyng-helix") = 3492064139`, which is the default view,
is the reading of the 1969 plate. Every slider at its sentinel value (1, 0 or −1) leaves the
choice to the seed. Any other value overrides it.

## v2 — the chain (`structures n`, 1–1000)

The point where one structure ends becomes the point where the next one starts.
- **Exit and entry.** A structure's *exit* is the high end of its helix: the apex for a
  decreasing tower, the outer top corner for a growing one. Its *entry* is the low end.
  Structure *j + 1* is translated so that its entry sits exactly on structure *j*'s exit. The
  curve is continuous in position at every joint.
- **Its own values.** Each further structure has its own stream,
  `mulberry32(hash(seed + ":" + j))`. From it the structure draws a new series, vertical
  ratio, number of turns, solid, handedness, plan rotation, lift profile, growth direction,
  number of outward turns, and a scale of 0.4–1.15 × the first structure.
- **Climb or hang.** With `chain = 1`, each further structure has an even chance to climb
  from the joint or to hang from it (z mirrored). A hanging structure carries its plan as a
  ceiling. Mixing the two keeps a long chain wandering like a random walk instead of
  stacking into a needle. `chain = 0` makes every structure rise.
- **What stays fixed.** Structure 0 keeps the sheet's own stream, so n = 1 is identical to v1
  and the work-id seed still opens on the plate reading. The whole sheet shares structure
  0's oblique view. Sliders left at their sentinel let every structure choose for itself.
  A slider set to a value forces that value on every link of the chain.
- **Plans.** `plans` is 0 for none, 1 for the first structure only, and 2 for every
  structure (the default). Letters and the ratio legend describe structure 0. The legend
  adds `CHAIN OF n` with the next ratios.

## v3 — rotation (`rotate`, `rotation deg/s`)

The chain is built once in 3-D and cached. It is rebuilt only when the seed or a parameter
changes. Each frame turns the cached world about the centre of its 3-D bounding box, then
applies the sheet's oblique projection.
- `rotate 1`, **horizontal**: yaw about the vertical axis. The tower turns on its own base.
- `rotate 2`, **vertical**: pitch about the horizontal x axis. The chain tumbles end over end,
  and the plans swing through edge-on.
- `rotate 3`, **both**: yaw at the set speed, with pitch at 1/φ of it. φ is irrational, so the
  two rotations never return to the same orientation together and the motion never closes
  into a loop.
- Speed runs from 1 to 120°/s. **Space** pauses and resumes the rotation.
- While the chain turns, the scale is fixed for the whole cycle and the pivot stays at the
  centre of the sheet. The fixed scale is the largest projected half-extent over 24 sampled
  orientations, plus 4%. The drawing therefore does not pulse or drift. `rotate 0` keeps the
  exact still-sheet fit and stops the animation loop.
- PNG and SVG export capture the current frame.
- Frame rate on the test machine: 60 fps at n = 2 and about 22 fps at n = 300. At n = 1000,
  expect about 4 fps.

## v4 — viewing on the helix (`view`, `show`)

The panel's choice controls are dropdowns. Two of them decide what you see, and they combine
freely with each other and with `rotate`.

**`show`** filters every polyline by what it belongs to: plan, solid or helix.
- **all**: everything.
- **helix only**: the curve of the whole chain. Letters are hidden; the legend stays.
- **plans + helix**: the ground plans (squares, arcs, pole diagonals, O) and the helix. The
  boxes and solids are hidden, together with X, Y and Z, which sit on box edges. A, B, C, D
  and O stay.

The still sheet fits whatever is shown. A rotating sheet keeps one scale per combination of
rotation and `show`.

**`view`**:
- **sheet**: the oblique drawing.
- **ride the helix**: a perspective camera travels along the helix (details below).

Links from before `show` existed used `view 1` for the helix alone. They open as sheet +
helix only, and the URL is rewritten in the new form.

**Ride the helix**, in detail:
  - **Camera frame.** The eye sits on the curve, raised 0.09 of the local turn above it so the
    curve below reads as a rail. It looks at a point 8 samples ahead along the curve. The
    world vertical stays up; when the camera faces straight up or down it falls back to the
    y axis.
  - **Scale invariance.** The camera advances a fixed number of samples per second
    (`ride turns/s`). Every quarter turn has 65 samples whatever its size, so each turn
    takes the same time even though the turns shrink geometrically. The tower never empties
    out as the camera nears the apex. The near plane (0.004 of a local turn) and the rail
    height shrink with it.
  - **Clipping.** Polylines are split where they cross the near plane, so lines passing
    behind the camera are cut cleanly instead of wrapping around. The view is drawn through
    a sepia window and clipped to it.
  - **Controls.** `ride start` (0–1) sets where along the chain the ride begins, and also
    gives a still frame when paused with Space. `ride field of view` runs from 30° to 120°.
    At the end of the chain the ride wraps to the start. The catalogue line shows
    `RIDE TURN k/total`.
  - **Rotation while riding.** `rotate` turns the camera's gaze while the camera travels.
    Mode 1 pans: the frame yaws about the world vertical, so you look sideways and behind
    from the rail. Mode 2 tilts: it pitches about the camera's right axis, looking up the
    tower and down to the plan. Mode 3 does both, with the tilt at 1/φ of the pan.
    `rotation deg/s` sets the speed, and Space pauses travel and gaze together.
  - **Limits.** The canvas clip does not reach the SVG. A ride frame saved as SVG still
    holds full-length perspective lines beyond the window.

## Material

The output is polylines only, with two pens. **Sepia** draws the construction: the plan
squares, the pole diagonals, the governing cube and the ratio legend. **Ink** draws the
forms: the arcs, the solids, the helix, the letters and the catalogue line. Weight comes from
passes, and the plan arcs get 2.

**Each helix has its own weight.** With `helix passes = 0` (the default), every structure
in the chain draws its own pen weight from its own seed stream:
- a pass count of 1–6, weighted towards 2–3;
- its own set of pass offsets, placed at seeded angles within a spread of 0.8–2.4 sheet
  units.

These draws come after all other choices, so they never change a structure's geometry.
- **The plate reading** keeps 3 passes on its first helix, at the original offsets.
- **Setting `helix passes` to 1–6** forces one weight on every helix, still at each one's own
  offsets.
- **In a chain**, a hairline helix can hang from a heavily inked one: the weight is part of
  each structure's identity.

Lettering uses `assets/strokefont.js`. `Save SVG (V)` exports by pen colour for vpype.

## Algorithmic philosophy — *Proportional Ascent*

A spiral is a rule about memory. Each step remembers the last only as a ratio, turned a
quarter and made smaller. Tyng's plate shows that one rule, applied in three directions at
once (across the ground, up the vertical, out from the pole), is enough to build an
architecture. Nothing in the drawing is placed. Everything is *implied* by the first square
and the ratio.

The system keeps that discipline. A single complex number generates the whole plan. A second
real number generates the whole elevation. The solids are prescribed by the box they occupy.
Randomness never touches a line directly. It only chooses which law to obey, how many times
to obey it, and from where the law is seen. Every seed is a member of one species: a tower
that closes on a point above its own pole.

The controlled risk is the departure from φ. Under the golden law the squares lock together
without remainder. Under any other law the same procedure still converges, but it leaves
evidence: overlaps that thicken the plan into a lattice, or gaps that open it into stepping
stones. The tile-error figure states the distance from the ideal. The drawing shows what that
distance looks like.
