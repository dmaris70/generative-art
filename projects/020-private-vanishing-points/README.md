# 019 — Private Vanishing Points

**Mechanism (one sentence):** transparent wash is space and opaque gouache is object;
every object is a solid extruded toward a vanishing point of its own, and one of those
points is promoted to a *sun* whose corridor to the central *portal* is filled by two
opposed sheaves — a patterned fan opening from the sun, blades closing toward it.

The system was obtained by reverse-engineering the sheet transcribed in
`019-scarlett-study` (Rolph Scarlett, untitled gouache and watercolour, c. 1940). It
reproduces the sheet's *rules*, not its picture: no coordinate of the source survives
except as a proportion.

## 1 · The logic of the source sheet

What follows is analysis of the image (judgment), checked against the measured
transcription in 018 (fact where a number is given).

1. **Two media, two ontologies.** The ground is wet-in-wet watercolour in three hues
   (cerulean, pale yellow, magenta) with paper reserved as light; it is never outlined.
   Everything else is opaque gouache and is *always* outlined in graphite. Transparency
   means space, opacity means thing. The washes keep to the margins, a warm halo sits
   behind the small forms, a floor colour runs along the bottom, and the paper is left
   bare around the largest mass.
2. **No shared perspective.** Each solid is a small polygon (its cap) extruded toward its
   own vanishing point. Nothing agrees with anything else, so objects float rather than
   stand. Faces follow a three-tone habit: cap = accent, one side = tint, other side =
   dark or a complementary.
3. **One point is a sun.** A single vanishing point right of centre (≈ 0.88 w, 0.58 h in
   the source) organises half the sheet. From it a fan opens *toward* the central mass.
4. **The corridor holds two opposed families.** Between the central mass and the sun:
   (a) the fan — rays from the sun crossed by transversals; both families are spaced
   almost linearly along the fan's own edges (measured: 0.16→0.92 and 0.17→0.94 of edge
   length), which is what makes the cells shrink toward the point; (b) a counter-sheaf —
   bands that are *broad on the central mass's flank and close to points gathered just
   under the sun*. One family diverges, the other converges; the push-pull is the
   picture's engine. A flat field colour fills what is left of the corridor.
5. **The near edge of the fan is the back of an arrow** driven into the tower of the
   central mass. Interpenetration is the only relation objects are allowed.
6. **Pattern is a surface property, ranked.** One harlequin in perspective (the fan), one
   two-tone checker on an *affine* grid (no vanishing point — deliberately flat beside
   the fan), one chevron set seen through a window, and three stipple passages. Flat
   colour everywhere else.
7. **The portal.** The central mass is a dark frame round a window, with a tower, two
   receding faces (one stippled) and chevrons inside. It is the only form that is both
   object and opening.
8. **The great beam and the bar.** The largest saturated plane leaves the portal's flank
   and runs under the sun; its underside dissolves into the wash (the one place object
   becomes space), and a black bar ties its far end back to the portal's foot — the
   only "shadow" in the sheet.
9. **Counterweight.** Small solids drift on the side away from the sun; a long pyramid
   aims from the bottom corner at the portal, opposing the corridor's diagonal.
10. **Accents.** One dot in the field; a few ink flecks.

## 2 · The system

Invariants (the species): rules 1–10, the order of painting, the portal template
(control points in units of the portal's own scale, each jittered), the material
language (wash / gouache / graphite / dab).

Freedoms (the seed): portal position, scale, tilt and tower height; sun position; fan
reach; ray and transversal counts; cell colouring (no repeat against left or upper
neighbour, tints toward the sun); blade kinds and tips; beam end; satellite count, kind,
place and private vanishing points; wash placement; mirror reading of the whole sheet.

**Themes are regimes, not recolourings.** Each sets the paper, the *behaviour* of the
ground, the colour roles, the densities and the line:

| # | Theme | Ground | What changes structurally |
|---|-------|--------|---------------------------|
| 1 | Non-Objective | wet wash on white | the source regime: 5×8 harlequin, 3 chevrons, 3–5 satellites |
| 2 | Nocturne | pale paint *scumbled* over indigo paper | chalk line instead of graphite, the beam becomes a beam of light, 7 star dots, small many satellites |
| 3 | Fresco | heavy granulating earth washes on buff | bigger portal, coarse 4×5 fan, nested window instead of chevrons, 2–3 large satellites, rough hand |
| 4 | Glacier | faint cold washes, mostly reserve | 60 % of fan cells left white, striped window, thin steady line, one signal red |
| 5 | Carnival | strong violet/pink/mint washes | 6×10 fan, 5 blades, 6–8 satellites, heavy stipple |
| 6 | Constructor | *dry* flat translucent planes, no wash | the frame turns red, the fan obeys a strict three-value checker, ruled line, striped window |

Determinism: seed → `mulberry32` via the repo's GenArt harness; same seed + theme + params
→ same sheet. Keys: `1`–`6` theme · `T` next theme · `R` new seed · `S` PNG. The panel's
*Contact sheet* opens many seeds of the current theme.

## 3 · Relation to the house grammar

This is outside the DMCF corpus and outside its plotter-native, four-pen material law
(it is fills, alpha and brushwork throughout). What it keeps from the house: a rule that
can be said in one sentence, one grammar for every sheet, deterministic identity. It is
not entered in `projects.json`.
