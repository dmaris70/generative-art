# 036 — Aerial Recession

**Mechanism (one sentence):** one camera over one ground plane, one low sun, and one
transmittance term `1 − e^(−k·z)` decide the size, colour, contrast, detail and edge of
every mark, so the classical rules of landscape depth are computed rather than painted.

Original composition, painted with [p5.brush](https://github.com/acamposuribe/p5.brush)
(2.2.3, p5 2.x WEBGL). Not a copy of any painting. Two media: **oil** (default) and
**watercolour** — the same scene, the same seed, painted two ways.

![seed 7, golden hour, oil](preview.png)

Watercolour version (`p_medium=0`): [`preview-watercolour.png`](preview-watercolour.png).

## Philosophy — *Aerial Recession*

A landscape painting is a flat surface pretending to be miles deep. The masters did not
draw that depth; they obeyed a handful of optical laws so consistently that the eye could
not refuse them. This piece takes those laws literally. Nothing is placed "far away" by
taste: it is given a depth `z`, and depth alone decides how large it is, how much air
stands between it and the viewer, how many octaves of detail survive that air, and
whether its edge is drawn or dissolved.

**Space.** A pinhole camera stands one unit above a ground plane, its horizon on the lower
third. Fields, hedgerows, trees, the river and the cloud ceiling are all world objects
projected through it (`y = HY + F/z`, `x = CX + F·x/z`), so they shrink and converge
without being told to. The river is a straight world line whose projection is solved to
vanish exactly on the focal third, plus a sinusoid in `log z` that perspective compresses
into tightening S-curves — a leading line from the bottom edge into the distance. Clouds
on a ceiling above the camera grow smaller, flatter and lower as they recede.

**Air.** Every colour is `mix(local, haze, 1 − e^(−k·z))`. The haze itself is warmer and
brighter toward the sun. The same term reduces contrast between lit and shadowed faces,
lowers the number of noise octaves in a ridgeline (far ranges are smooth, near ones are
broken), thins slope strokes, and decides edgework: ranges beyond ~55 % haze are wash
only (lost edges); nearer ridges are inked, and even then the ink breaks wherever a noise
field says mist is lying on the crest (lost-and-found). Mist pools in each valley floor
as a bleeding watercolour band.

**Light.** One sun, on the vertical third opposite the focal point, low in the sky. Each
summit with real prominence is split about a jittered spur into a lit face and a cool
shadow face on the side away from the sun; a warm glaze rides the sunward ridges. Trees
cast long shadows away from the light — the lower the sun, the longer — and cloud
shadows dapple the plain, flattened by the same ground-plane projection. The water mirrors
the sky at the reflected angle and carries a glitter path under the sun. The dark
foreground silhouette catches a thin warm rim only on edges facing the light.

**Frame.** A repoussoir — a dark bank rising toward the shadow side and a tree at that
edge whose limbs arch over the top of the picture —
pushes the lit middle distance back. The tree grows recursively, but around a keep-clear
zone (the sun, the focal third, the middle distance): a limb heading into it bends up and
back toward the edge, and stops only if it cannot. The dominant peak and the river's
vanishing point share the focal third; the sun holds the other; the horizon holds the
lower third line.

**Mood.** A limited palette per mood sets temperature and therefore emotion: *golden
hour* (warm nostalgia), *after the storm* (slate with a gold break, heavier cloud, stronger
rays), *dawn mist* (cool, pale, low contrast). The painting assembles itself back to front
over several seconds — sky, far ranges, mist, nearer ranges, fields, river, trees,
repoussoir, paper — the order a painter would work in.

## Oil — the same scene, repainted

The oil medium paints the scene the way a tonalist works from an underpainting. The
whole watercolour pipeline runs first and is read back into memory; then the surface is
repainted in opaque, bristle-streaked strokes. Nothing about the scene changes — the seed
builds identical geometry — only the paint. Colour comes from the underpainting under
each stroke; every other decision is read from the scene's geometry.

| principle | how the oil engine does it |
|---|---|
| **Directional rhythm — sky** | every sky stroke follows a (slightly flattened) circle centred exactly on the sun, lengthening outward: a vortex that winds the eye to the light |
| **— mountains** | near ranges in short, straight, square-ended facets in three directions (fall line, a crossing facet, the crest), chosen per stroke — craggy geology rather than gradients |
| **— field** | long, sweeping, nearly level strokes (3× longer than elsewhere) — the stable base under the moving sky; their size ∝ `1/√z` and density ∝ `1/size²`, so the brushwork itself recedes |
| **Impasto hierarchy** | each stroke carries a relief value, drawn as a ridge of paint under a fixed *room* light from the upper left: a shadow strip on the far side, a specular edge on the near side. The sun's core is the thickest paint (relief 1.0), its halo steps down ring by ring (0.85 → 0.22), the foreground tree and grasses are high (0.5–0.6), the rest low (0.1–0.25), the far ranges flat |
| **Lost edges** | far ranges are painted in soft, level strokes and get no edge pass; a wet-on-wet blend band of strokes straddling each far crest, loaded with the sky above and the mountain below, melts them into the haze |
| **Found edges** | the framing tree is redrawn last as a hard near-black silhouette with a thin warm rim on the sun side; grass blades are crisp, opaque, unblended |
| **Broken colour** | 2,600 sparse micro-strokes of violet (in shadows), olive (mid-tones), ochre and dull orange (lights), each only half-mixed with the paint beneath, laid unblended into the field and mountains |
| **Scumbling** | dry-brush passes — bristles only, lighter opaque paint, broken often — dragged over the plain (more toward the distance) and through the sun's halo, leaving the darker layer showing |
| **Value: glow vs gloom** | the sun's core goes to near-white; the halo is five discrete tonal rings stepping down to the sky, painted outside-in so each brighter ring sits on the one outside it; the silhouette is pushed 40 % toward black so the meadow reads luminous against it |
| **Canvas** | a fine twill of light and dark threads over everything |

Each stroke is two colours loaded on one brush — the paint under its middle and under its
far end — and its bristles streak a mix of the two, starting late, breaking where the
brush runs dry, lifting early.

Why the oil strokes are native rather than p5.brush strokes: p5.brush mixes colour
spectrally (Kubelka–Munk, via spectral.js), which is the right optics for transparent
watercolour glazes — the underpainting uses it throughout — but it darkens with every
overlap (measured: a sky sampled at `[118,123,133]` came back `[82,84,86]` after the
layers built up). Oil body paint is opaque, so the strokes are drawn with ordinary "over"
blending.

## How each technique is implemented

| technique | where | rule |
|---|---|---|
| atmospheric perspective | `buildScene` → `s.aerial`, `s.seen`, `s.hazeAt` | colour = `mix(local, haze(x), 1 − e^(−0.0125·haze·z))` |
| linear perspective / scale | `s.gx`, `s.gy`, `buildRiver`, `buildFields`, `buildTrees`, `buildClouds` | projection with `F = REF_H − HY` (ground at `z = 1` meets the bottom edge) |
| detail falloff | `buildRanges` | octaves = `2 + round(5·(1 − aerial(z)))`; far ridged, near rolling |
| chiaroscuro | `findPeaks`, `paintRangeLight`, `paintTreeShadow`, `paintRim` | shadow face on `−sunSide`; shadow length ∝ `1 + 3.2·(1 − sun height)` |
| leading line | `buildRiver` | world line `x = a + b·z` solved so `u(1) = uStart`, `u(zN) = focal`; meander `∝ sin(2π·log z / λ)` with zero envelope at both ends |
| rule of thirds | `buildScene` | horizon ≈ 0.645·H; sun and focal on opposite vertical thirds |
| repoussoir | `buildRepoussoir`, `paintBank`, `paintTrunk`, `paintLeafClump`, `paintRim` | on the side opposite the sun; opaque wash silhouettes; limbs steered around a keep-clear zone; warm rim only on outer edges facing the sun |
| scale cues | `paintHedge`, `paintTreeShadow`, `paintCloudShadows` | hedge bushes spaced in world units (size and spacing ∝ 1/z); cast-shadow thickness ∝ 1/z² |
| lost & found edges | `paintRangeEdge`, `paintRiver` (banks), `paintMist` | ink only where `aerial < 0.55` and a noise gate is open; banks inked only for `z < 14` |
| colour harmony | `MOODS` | five-to-eight-colour palette per mood; all other colours are mixes of these |

## Parameters

| param | effect |
|---|---|
| medium | 1 oil (default) · 0 watercolour |
| mood | palette and cloud / ray weighting (0 golden hour · 1 after the storm · 2 dawn mist) |
| sun height | sun elevation; lower = warmer glow, longer shadows, stronger sunward glaze |
| atmosphere | `k` in the transmittance term — how fast distance dissolves into haze |
| mountain ranges | 3–7 layers at geometric depths 230 → 11 |
| mist | height and opacity of the valley-floor mist bands |
| clouds | number of clouds on the ceiling |
| river meander | world amplitude of the meander |
| trees | density of copses and bank-side trees |
| repoussoir | height of the dark bank and presence/size of the framing tree |
| paper / canvas grain | paper grain (watercolour) or canvas weave (oil) |
| oil: impasto | strength of the impasto ridge shadows on highlight strokes (oil only) |

The seed fixes everything else: which third the sun takes, ridge noise, field layout,
tree positions, the framing tree's growth, and every brush jitter.

Keys: `R` new seed · `S` save PNG. `?seed=…` (plus the `p_…` params the panel writes into
the URL) reproduces a picture exactly. `?profile` records per-pass timings in
`window.PROFILE`; `?stop=N` halts after pass N to inspect an intermediate state.

Note: painting is progressive — the underpainting, then the oil passes (tens of thousands
of strokes) — and takes a while; save the PNG after the last pass (canvas/grain and mat)
has landed.
