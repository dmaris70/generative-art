# 027 — Ridge, encounters

The second recomposition of the 024/025 study, after 026 was judged too tame: its peaks flattened into
mesas, its strata echoed the skyline like a plinth, and every sheet drew a whole, centred mountain — a
pictogram, not a place. The source never shows the mountain; it shows a shoulder, from a body standing on
it, in weather. 027 rebuilds the generator around that. **Derived from a copy of someone else's image — a
study, not a collection entry.**

1. **A place** — a 1024² heightfield. One spine whose *plan* is the source skyline (`parts.js`), ridged
   warped ground around it, gullies cut by real flow accumulation down the fall lines, light weathering.
   Tilted bedding planes cut the surface, so strata cross slopes obliquely instead of echoing the skyline.
   One low sun, cast shadows, cloud shadow lying on the land (the source's dark hollow), pale scree where
   the ground lies gently (the source's pale flank).
2. **A body** — the seed searches 64 places to stand and scores what each would see: land covering the
   register's share of the frame, a diagonal skyline, an imbalance between the two sheets, the summit
   leaving the frame — and heavy penalties for a whole centred peak or a wall against the lens. The camera
   is tilted. The frame is a voxel-space perspective render, cut in the middle into the two sheets.
3. **Weather** — a cloud deck set against the land actually in view, hugging smoothed ground, banking up
   where air climbs and thinning in the lee. Its density is *solved* so the land left visible meets the
   register's budget. Thick cloud goes dark, as the source's middle band does.
4. **Movement** — smear through depth: near ground streaks, far ground and cloud hold (fall, advance,
   turn, or the shove of wind through a col).

Five registers, named for what they do to you: **exposure** (the ground leaves), **looming** (a wall, no
sky to speak of), **whiteout** (you are inside it; a track is all there is), **passage** (a col near the
cut, cloud coming through at you), **clearing** (veiled land and one tear onto far lit ground). The track —
a human trace — appears in about one seed in five, always in whiteout. See `registers.png`.

Kept from the source system: tones, grain law, mat and cut, the dry-brush painter (`assets/drybrush.js`),
smear and track measurements, and the 026 interface (seed generator, deal six, visited, `?seed=…&p_…`).
Params: reveal (scales the weather's budget), drama, movement, plus the hand sliders. Terrain and camera are
cached per seed, so sliders repaint in ~2 s; a new seed takes ~2.5 s. Pure arithmetic: node = browser.

## Tooling added 2026-09-21

- **Real ground** — `tools/ridge-dem-fetch.py` pulls open AWS Terrain Tiles (Mapzen "terrarium", z=12, natively ~30 m; sources
  SRTM/GMTED/national surveys — https://registry.opendata.aws/terrain-tiles/) for six ranges chosen for ridge character and
  writes `dem/<slug>.bin` (512² Uint16, decimetres) + `dem/index.json`: Black Cuillin, Eiger–Mönch, Tre Cime, Fitz Roy,
  Trollveggen, Tymfi–Astraka. The seed takes the quarter of a tile with the most relief, turns/mirrors it, brings it up ×4,
  and grows back what a 30 m survey cannot see. **Place** in the interface: by seed / invented / one of the six.
- **Water** — droplet erosion (after Hans Beyer) + angle-of-repose shedding on every terrain, real or invented; where the
  debris came to rest is the pale scree. ~0.4 s.
- **Curation harness** — `node tools/ridge-curate.mjs --n 24 --start 1000 --out …/review/<run>`: paints seeds exactly as the
  browser does, writes labelled contact sheets, per-pair PNGs and `report.json` (tone percentiles, black share, land share
  per sheet, skyline), flags TIMID / FLAT / EMPTY / HORN / WEDGE / TWIN, and sets the batch median beside the source's own
  numbers. No dependencies. The contact sheet is what a person — or a vision model — then reads; the flags only cull.
- **Source measurements** — `python3 tools/ridge-measure.py` → `review/source-measurements.json` (tone percentiles: p02 56,
  p50 141, p98 208, 6.7 % black; contrast falling from ~10 in the darks to 2 in the cloud; smear ≈ 136–150°, 11–18 px).
- **Live view** — `preview.js`: the same land raymarched in WebGL2. Walk the place (drag, W/A/S/D, wheel, Q/E), then
  **Paint from here** hands the standpoint to the CPU engine (`?cam=x,z,eye,yaw,pitch,roll,focal`). The GPU view is a sketch;
  the painted sheets remain the canonical, bit-reproducible render.

## Snow, bedding, light, key (2026-09-21)

- **Bedding as relief** — the tilted planes now terrace the heightfield before the water runs: hard beds stand as ledges,
  soft ones recess, and the beds come and go across the range.
- **Snow** — three seasons by seed (bare / lodged patches / deep). It lies above a wandering snowline, only where the ground
  is gentle enough, is blown off windward convex ground, and lodges in gullies, debris cones and hollows. Snow has an edge.
- **Light is decided after the standpoint** — *against* (sun ahead and low: the land goes black in layered silhouettes, the
  cloud is lit from behind), *side* (raking light models the rock), *overcast*, *front*. Cast shadows and cloud shadow as before.
- **Key** — the printer's choice per seed: low, full, high.
- **Camera scoring** rewards what a skyline does beyond merely rising, and cares less for the plain wedge.

Harness, 24 seeds from 5000: clean 2/12 → 11/24; median darkest-2 % tone 88 → 64 (source 56); black share 2 % → 4.6 %
(source 6.7 %); half the seeds now reach true black. Still open: WEDGE in 11/24, median tone 175 vs 141 (too much pale
sky/cloud), smooth near ground, cotton cloud, the cut as mere halving, true whiteout.

## Directional weather (2026-09-21)

The wind now does things, per seed (shown under the seed as e.g. `spindrift+pouring`, or `still`):
- **combed cloud** — the deck's structure is stretched along the wind;
- **pouring** — just behind a crest the deck does not stop: it drapes down the lee slope before it thins (always in *passage*);
- **spindrift / banner** — every proud crest sheds a plume downwind that lofts, spreads and streaks (more likely when there is snow); it is
  outside the reveal budget, so the solver cannot thin it away;
- **curtains** — precipitation hanging from a ragged cloud base, slanted by the wind, darker than the cloud, veiling sky and land alike.
All three keep clear of the lens (they fade in with distance), so they never wash out the near blacks. The painter's strokes follow them.

## The pair as two gazes (2026-09-21)

The two sheets are no longer always one view cut in half. After the standpoint is found, the seed chooses how the pair relates:
- **one view, cut** (≈ 1 in 4) — the original panorama;
- **turned** — the head turns: the best of nine other directions from the same feet, scored like the first;
- **looking back** — the way you came;
- **down, at your feet** — the drop, the stones, the snow (half of all whiteouts); near ground now has grit and stones, and the
  smear eases off so they hold;
- **the same gaze, later** — a few steps further on, the cloud carried along the wind, the deck risen or fallen, the weather's
  budget much tighter or much looser. Only chosen when there is cloud in view for time to move.
One sky serves both gazes (same deck, wind, light and weather), so turning your head also turns you toward or away from the sun.
Which gaze hangs left is the seed's choice. A hand-chosen standpoint (live view) always paints as one view, cut.
Internally: `scene()` builds `frames` through `gaze(cam, width, drift)`; `sheets()` develops each frame (budget solve, tone, smear)
and hangs them. Harness, 24 seeds: WEDGE 11 → 6, clean 10–11, strongest pairs 187137, 115866, 131704 (down), 171299 (later),
92109, 147542, 155461, 179218 (turned).

## Whiteout, foreground, tone (2026-09-21)

- **Tone rebalance** — measured against the source with the harness. Land takes more of the frame (camera scoring targets),
  the weather's budgets are looser, aerial haze is lighter, and the sky has a **mood** per seed: bright / banded (the source's
  own dark band lying across it) / heavy (darkening toward the top or the bottom). 24-seed medians now: darkest-2 % tone 54
  (source 56), median tone 148 (141), lightest 211 (208), black share 7.8 % (6.7 %). Before: 73 / 174 / 214 / 1.3 %.
- **Foreground out of focus** — about one frame in four has something close to the lens that the eye reads past: a low wide
  bank, dark rock or (with snow) pale, soft-edged. Never in a whiteout, never when looking down.
- **True whiteout** — no view is searched for: you stand beside the way, a few units up, looking along it. Visibility is a
  *distance* (60–150 units, noisy), not a budget; light is overcast, key high, everything rimed; the trodden way is a thin
  shadow in the snow, cairns stand beside it every few hops, sastrugi and stones mark the near ground. Pairs are one view cut
  in two, or the same gaze later with the cloud thinner or thicker. **Still the weakest register**: the voxel renderer has no
  geometry below one ground unit, so close ground stays smooth and steep near slopes streak; the forward gaze works, anything
  else does not. A proper fix is a second, finer heightfield around the standpoint.
- What counts as "near" for the movement smear now depends on eye height, so a low standpoint no longer blurs everything.

## The ground at your feet (2026-09-21)

The land is surveyed (or invented) at one unit; a body stands much closer to it than that. `nearGround()` grows a second, finer
ground around each standpoint — 768² cells of 1/8 unit (a 96-unit patch): the coarse land brought up smoothly (Catmull-Rom), then
roughened, strewn with stones and the odd block (more on scree, none underfoot), drifted and wind-ridged where there is snow, with
the trodden way cut into it as a shallow trench cleared of stones, and cairns built beside it as real geometry. It is lit by the
same sun with its own small cast shadows, and folded into the coarse light as a ratio so the big shadows still hold. The renderer
blends into it over the patch's outer 7 units and steps 0.07 instead of 0.35 inside it. The camera's feet are put on the fine ground.
With real near geometry, standpoints came down to body height (eye 0.5–7 units, was 3–14), which is what changed the pictures most:
foreground rock now has form, and depth reads from an arm's length to the far range.
Whiteout: faces where the way runs level or falls (rising ground this low is a wall in your face).
Harness, same 24 seeds: clean 13 → 16, TIMID 4 → 1, WEDGE 6 → 5; medians p02 52 / p50 141 / p98 208 against the source's 56 / 141 / 208.
Open: black share 15.8 % vs 6.7 % — a low standpoint beside a wall gives whole sheets of near-black (12919, 68352, 76271).

## The black bias (2026-09-21)

Two causes, two fixes. (1) Standing low beside a wall filled one whole sheet with ground within arm's reach — a slab, not a view:
the camera score now measures near cover per sheet and penalises more than 55 %. (2) What is still dark is **dodged by the printer**:
each sheet is measured before it is developed, and if more than about a third of it would come up as unbroken black its shadows are
opened (gamma and a small lift, in proportion) until the form in them shows. One seed in eight is left alone — the black sheet stays a
possibility, not a habit. Same 24 seeds: black share 15.8 % → 9.2 % (source 6.7 %), pairs more than half black 6 → 2, medians
p02 53 / p50 138 / p98 209 (source 56 / 141 / 208).

## The way and its cairns (2026-09-21)

- **The way** is now a line, not a wander: from a ridge point it always goes on to the ridge point most nearly straight ahead (best of
  six tries), and its corners are cut three times (Chaikin) — feet do not turn on a point. The old hop-to-nearest route looped back on
  itself as a jagged polygon.
- In the fine ground the way is a **bench** levelled into the slope (1.5 units wide), a shallow trench cleared of stones, and a line of
  alternating **footprints** every 0.36 units; rime is trodden off it, snow is darker in it.
- **Cairns** are dark piled stone — the one thing the rime has not closed over. In a whiteout three are placed from where you stand:
  one close, one at the edge of seeing, one that is only a guess, on alternating sides of the way.
- **Whiteout standpoint**: beside the way where it runs level or gently down and the ground beside it is not a precipice, at a standing
  body's eye height, aimed at a point 12–22 units along the way, so the line enters at your feet and runs into the cloud.
- **Scale fixed**: a trodden way 0.64 units wide means a unit is under a metre, so a standing eye is ~2 units (was 0.5 — lying on the
  ground). All registers now stand at 1.6 units or more.
- Stones no longer show the noise grid (warped coordinates, summed octaves); the coarse light under the fine ground is bilinear (no stripes).
Bugs met: the whiteout gaze was turned *away* from the way (sign of the side offset); cairn marker written with `Math.max(0, -1)`.
Standard 24 seeds unchanged in tone (p02 56 / p50 140 / p98 211, black 7.4 %; source 56 / 141 / 208, 6.7 %); ~3.6 s per pair in node.

## Rare events (2026-09-21)

About one seed in five carries one (tarn 5 %, hut 4 %, bird 6 %, moon 6 %), drawn from its **own** generator so every seed without an
event paints exactly as before. **Rare event** in the interface: by seed / none / tarn / hut / bird / moon (`p_event`); harness `--event`.
- **Tarn** — a basin where water gathers and the ground lies easy, filled to a level and held behind a low moraine dam (an eroded
  heightfield has no closed basins of its own). Flat, textureless, holding the sky: pale by day, a white glare against the light, dull
  pewter by moonlight. No stones or snow are strewn on it in the fine ground.
- **Hut** — something built, on a shoulder rather than a summit, 7 × 5 units, dark walls, snow on the roof when there is snow.
- For both, the body **came upon it**: standpoints are drawn 50–120 (hut) or 90–330 (tarn) units away, aimed at it, rewarded if the line
  of sight is clear; the pair is never "one view, cut", so it cannot fall on the cut.
- **Bird** — two tapered strokes in clear sky in one of the two sheets: suddenly the mountain has a size.
- **Moon** — night: the sky is the dark thing (tones 44–68), the moon a small hard disc when it is in frame, cloud near it lit; land
  under weak directional light in low key, snow luminous; blacks are left alone (no dodging). Never in a whiteout, nor tarn or hut there.
Standard 24: five carry an event (44595 moon; 68352, 115866, 163380 tarn; 139623 hut). Weak point: the hut reads as a dark rounded lump —
a heightfield interpolates a box into a mound; a proper hut needs drawing as a separate object.

## More places (2026-09-21)

Twenty real ranges now (`dem/`, 10 MB): the first six plus Liathach, Matterhorn, Grandes Jorasses, Piz Badile, Triglav, Picu Urriellu,
Olympus, Stetind, Trango Towers, Ama Dablam, Alpamayo, Aoraki, Torres del Paine and the Drakensberg Amphitheatre — chosen for ridge
character, not geography. To add one: a line in `PLACES` in `tools/ridge-dem-fetch.py` (slug, label, lat, lon), run it, reload.
A place is now named by its **slug** (`?place=stetind`; harness `--place stetind`), because a position in the list shifts whenever the
list grows. **Consequence of growing the list:** "by seed" spreads seeds over 21 grounds instead of 7, so most seeds without a pinned
place now land somewhere else than before. Pin `place=` in any link you want to keep. Place is a dropdown in the interface.
Also: the moon's disc is drawn only in sky (it showed through haze on land), and moonlit land is a little less dark.

## Forty-eight places, measured (2026-09-21)

`tools/ridge-dem-fetch.py --probe` downloads a candidate list and measures each tile for what this piece needs — **crest**: smoothed
ground standing > 25 m proud of its 360 m surroundings and a local maximum across some direction (`crest_km`), and the part of it on
broad ground gentler than 30° (`walk_km`). 49 candidates were probed beside the 20 already in; 28 were taken, for three reasons rather
than one score (crest length scales with tile area, so low latitudes always "win"): **sharp** — a third or more of the crest is not
walkable (K2, Darrans, Denali, Machapuchare, Robson, Ushba, Meije); **mixed** (Watzmann, Civetta, Brenta, Lyskamm, Tetons, Monte
Perdido, Huayhuash, Hotaka, Nā Pali, Cinto, Prokletije, Toubkal, Cerro Castillo); **long and gentle, with a character of their own**
(Western Arthurs, Besseggen, Ben Nevis, Taygetos, Simien, Roraima, Hua Shan, Kinabalu). Not taken, and kept in `CANDIDATES` with the
reason: rounded to nothing at 30 m (Helvellyn, Crib Goch, Mount Kenya), too finely dissected (Rwenzori, Carstensz), mostly sea (Reine),
near twins of one kept (Aonach Eagach, Tsurugi, Palisades…). `index.json` now records `crest_km` and `walk_km` for every place.
- **Files** are `.dem`: rows delta-coded, gzipped (13 MB for 48; raw would be 25 MB). The worker decodes with `DecompressionStream`.
- **The survey's own water**: large dead-flat patches low in a tile are lakes, fjords or sea, and are now water (flat again after the
  weathering, holding the sky, no stones or snow) — the Königssee under the Watzmann, the lakes below Robson and the Brenta. Flat patches
  high in a tile (flattened glaciers, voids) are left as land.
- **By seed**: the invented ground keeps one seed in six; the rest are dealt across the real ranges. (This re-deals unpinned seeds again.)

## Batch across all places (2026-09-21)

`node tools/ridge-curate.mjs --each 3 --start 3100 --step 977 --event 1` → `review/2026-09-21-all-places/` (147 pairs, 13 sheets, one
place per row, `report.json` with a per-place table). Medians: darkest-2 % 55, median 140, lightest 212, black 8.4 % — the source is
56 / 141 / 208 / 6.7 %. 77 of 147 pairs carry no flag; WEDGE 30, TWIN 20, HORN 19, TIMID 12. TWIN is inflated: frames that are all land
(looking down, or a wall) have an empty skyline and "match" each other across places. Three seeds are too few to drop a place on.

## Clearing tear and looming (2026-09-21)

- **Tear**: it was a small round window placed on the single brightest far *point*, with the contrast inside it boosted — on dark textured
  rock it came up as a speckled smudge. Now the site is judged over a whole patch (mean light × how far), must clear a threshold or there
  is no tear at all, and the opening is wide (12–21 % of the width), longer than tall, ragged (noise-warped) with a soft lit lip; haze
  thins inside it and the contrast boost is halved.
- **Looming**: a gentle slope underfoot could fill both sheets. The skyline pass now records how far away each column's skyline is; looming
  rewards a skyline that belongs to something at a distance (median > 40–180 units), more for a skyline that does something, and
  penalises frames with no sky at all (> 95 % land).

## Shortlist batch (2026-09-21)

`--each 10 --places <24 slugs>` → `review/2026-09-21-shortlist/` (240 pairs, 20 sheets). Medians p02 58 / p50 135 / p98 211 / black 5.9 %
(source 56 / 141 / 208 / 6.7 %). Clean 139/240. By place: Darrans 9/10, Eiger 8, then seven at 7 (Ama Dablam, Astraka, Liathach, Nevis,
Perdido, Urriellu); bottom: Paine 2/10, then invented, Robson, Toubkal, Tre Cime, Ushba at 4. By mood (clean/total): whiteout 41/44,
exposure 24/38, looming 29/60, passage 20/42, clearing 25/56. By pair: one view 52/76, later 27/38, back 9/15, turned 47/92, down 4/19.
Known defects seen: the clearing tear still comes up as a dark speckled oval when the far ground is dark (Nevis 25817, 27043); tower
terrain (Paine) renders as smeared vertical slabs — a heightfield cannot hold a tower at 30 m.

## Tear (again) and looking down (2026-09-21)

- **Tear** must now open onto ground that is *lit* (patch mean light > 0.4) and mostly far; otherwise there is no tear. What shows through it
  is lifted a little. Dark ground seen through a hole in pale cloud was a stain, not a clearing (Nevis 25817, 27043 — now clean veils).
- **Looking down** is rarer (12 % → 6 % of pairs) and chosen: of seven ways of looking down (yaw ±1.2, pitch −0.5 … −0.95) the one whose
  ground holds the most — varied tone, varied depth, some light — from a 60 × 80 test render. Less steep than before, so the drop and
  what lies below it get into the frame.
- **Harness**: a pair of two gazes is judged sheet by sheet, and only sheets that have a skyline; one view cut in two is still judged as one
  skyline. Near-duplicates are compared only between skylines that exist. `--pair down|turn|back|later|panorama` forces a pair type for review.
  With this, 72 seeds by seed: 57 clean (79 %), medians 53 / 140 / 212, black 9.8 %. Earlier clean-rates are not comparable.

## The other 25 places, and all 47 on one scale (2026-09-21)

Paine dropped (moved to `CANDIDATES`): towers render as smeared slabs. `review/2026-09-21-rest/` = ten seeds on each of the 25 places not in
the shortlist (250 pairs): 161 clean, medians 56 / 140 / 211, black 7.3 % (source 56 / 141 / 208 / 6.7 %). The shortlist was re-judged from
its saved skylines under the per-sheet rule; the merged table is `review/2026-09-21-all-47-rejudged.txt`. Top: invented 10/10; Ama Dablam,
Aoraki, Badile, Darrans, Liathach, Prokletije, Roraima 9/10. Bottom: Watzmann 3/10; La Meije, Robson, Taygetos 4/10. NB Paine re-judges to
8/10 — its flags never justified the drop; the visible slab artefact did. Trango, checked for the same artefact, is fine (the towers are small
in a large tile). Near-duplicate counts are per batch (each batch reuses the same ten seed offsets across places, which inflates them).

## Temper by seed, and the rating procedure (2026-09-21)

- **Weather, body and hand are drawn by the seed.** `Compose.temper(seed)` draws reveal 0.7–1.5, drama 0.8–1.45, movement 0.25–1.9, dry
  bristle 0.5–1.9, dry drag 0.4–1.9, grain 0.8–1.2 (own generator, middle-weighted). The sliders show what the seed drew; moving one pins it
  (◆, saved in the link as `p_…`); a new seed unpins everything. The harness paints with the same values, so ratings match the interface.
- **Rating** — `rate.html` + `ratings/`. Claude rates pairs 1–5 with a reason (`ratings/round-NN.json`); Dimitris gives his own number and a
  note per pair in the page (kept in the browser, `Download ratings` → `round-NN-user.json`; Claude can also read them from the Browser pane
  via `window.ridgeRatings()`). `ratings/RUBRIC.md` holds the rubric and is revised from the corrections after each round.
  Round 1: 16 places × 3 pairs. A new round = a harness run into `ratings/round-NN/`, Claude's JSON, and the round's name in `ROUNDS`.

## Six changes drawn from the ratings (2026-09-21)

After three rounds (141 pairs, `ratings/`), changes made because of Dimitris's numbers, not Claude's taste: (1) movement smear drawn from
0.1–1.1 (was 0.25–1.9); (2) moods weighted — exposure 25 %, passage 25 %, clearing 24 %, looming 17 %, whiteout 9 %; overcast light 5 %
(was 10 %); high key 10 % (was 20 %), low key 35 %; (3) curtains 16 % (was 30 %) and never all three weathers together; (4) cairns are
small piles — a broad base, stepped courses of stones, a blunt top — not spikes; (5) pairs: one view 30 %, turned 40 %, later 23 %, back
4 %, down 3 %; (6) a *preference* in the standpoint score for what his 5s share: a skyline that belongs partly to something near and
partly to something far or to open sky, and stays simple. Round 4 (`ratings/round-04`, 48 fresh seeds, all by seed) tests whether his mean rises
above 3.20. Round-4 medians: darkest 50, median 128, black 14.5 % — darker than the source (56 / 141 / 6.7 %), a consequence of (2) and (6).

## After round 4 (2026-09-21)
Round 4: his mean 3.38 vs 3.20 before (+0.18, SE 0.12); ratings ≤ 2 fell from 20 % to 8 %. Four follow-ups: the near-and-far preference is
weakened (0.7, was 1.6) because "dark diagonal against veil" was becoming a formula; **looming** reworked from what he rated low (rock
pattern or dark-on-dark filling the frame) and high (something lit against the dark): more sky (land target 72 %, was 88 %), never overcast,
the crevice pattern on rock roughly halved everywhere; blacks pulled back (low key 30 %, earlier shadow dodging, a little more ambient light):
round-5 medians 53 / 137 / 213, black 8.6 % (source 56 / 141 / 208, 6.7 %). Round 5 = 48 fresh seeds, `ratings/round-05`.

## Looming dropped; choosing between pairs (2026-09-21)
- **Looming is no longer dealt by seed** (exposure 30 %, passage 30 %, clearing 30 %, whiteout 10 %). It rated lowest in all five rounds
  (2.67–3.03) and a rework did not help. It can still be chosen by hand in the interface. This re-deals the mood of most seeds.
- **`choose.html`** + `ratings/choices-NN.json`: two pairs side by side, click the one to keep (or "no preference"), optional note.
  Claude's prediction and reason are stored in the set but shown only *after* the choice. Export: `choices-NN-user.json`, or
  `window.ridgeChoices()` from the Browser pane. Set 1: 30 matchups drawn at random from pairs Dimitris rated 3 or 4 in rounds 4–5 (looming
  excluded). 14 of the 30 put two pairs he scored the *same* against each other — that is the real test, since five rounds showed Claude
  cannot sort his 3s from his 4s. On the other 16 Claude's picks match his higher score 16 of 16, but Claude had seen those scores.

## Batch → cull → select (2026-09-21)
The rating procedure ended with a plain result (`ratings/RUBRIC.md`): Claude can recognise the pairs Dimitris rates 2 (of 36 Claude scored
≤ 2 across five rounds, he scored 25 ≤ 2 and only one ≥ 4) but cannot sort his 3s from his 4s (pairwise, equal-score matchups: 29 of 54).
Simple image measures cull worse than Claude's eye (34 culled, 14 truly low, 5 of his 4s lost). So the loop is:
1. **Batch** — `node tools/ridge-curate.mjs --n 96 --start <seed> --step <prime> --out projects/028-ridge-encounters/edition/batch-NN`.
2. **Cull** — Claude reads the contact sheets and removes only what it recognises reliably: pattern, murk, dead black, nothing there,
   rendering faults. Reasons are written per pair in `edition/batch-NN.json`.
3. **Select** — `select.html`: click to keep; culled pairs sit at the bottom with their reason and can be rescued (a rescue is recorded,
   so the cull itself is checked). Export `selection-batch-NN.json`, or `window.ridgeSelection()` from the Browser pane.
Batch 1: 96 seeds, 15 culled, 81 offered. Tones on the source (56/141/208/6.7 % vs 55/144/212/6.6 %).
Faults seen while culling: **night is too dark** (3 of the batch's moonlit pairs are near-black with no form); a **mirror seam** in rock
texture (317846; the DEM window reflects at its edge); **white rectangular blocks** (474970; probably the hut's snow roof seen close).

## Three faults fixed; batch 2 (2026-09-22)
- **Night**: ambient 0.2 (was 0.1), direct 1.0, sky base 70 (was 44), full key rather than low, and moonlit sheets are dodged like any
  other. Six forced moonlit pairs all hold form now.
- **Mirror seam**: standpoints keep ≥ 200 cells from the grid edge (was 88), and land beyond the edge (the reflection) dissolves into
  haze in proportion to how far past the edge it lies. Bug met on the way: `up.hy` still held terrain height from the render pass, so
  `+=` fogged everything flat — assign first, then add.
- **Hut**: seen from 110–220 units (was 50–120), so its box never fills the frame as blocks.
Batch 2: 96 seeds, 13 culled, 83 offered; medians 57 / 152 / 212, black 6.6 %. New faults seen: white vertical streaks like dripping
paint on rock (677778), a row of blocks under a cone (771917 — probably the hut again, from a "later" gaze that moved closer), a black-and-
white seam (939730).

## Batch 3 (2026-09-22)
The three faults were not what they looked like. **Blocks under a cone** (771917) was Stetind's fjord: water detected on the raw 30 m survey
gave a 4-cell stepped shore and a surface varying by decimetres → now one level per body (median of the survey's flat cells) and a shore
that follows the upsampled ground. **Dripping streaks** (677778) was the mirror seam 400–800 units off, beyond the haze → the world no
longer reflects at the grid edge; it ends there in cloud. **The black-and-white seam** (939730) was a real lake rendered brighter than the
sky against the light → water is now never brighter than the cloud it mirrors, and takes half its tone from the sky. Also: no snow or
stones on ground steeper than ~45° (resampled faces had stretched them into ribbons). Batch 3: 96 seeds, 15 culled, 81 offered; medians
54 / 141 / 210, black 10.1 %. Faults still seen: **vertical comb / hanging marks in cloud or along a ridge** (1488670, 1560056, 1575353,
1626343, 1697729 — five in one batch, the most frequent fault now; looks like the curtain/spindrift streaks drawn at the wrong scale close
up), blotches floating on snow (1753818), and night still too dark twice.

## Batch 4 (2026-09-22)
The comb marks were the **rain curtains**: their streak noise at a fixed world scale projected as bars at middle distance, and every
softer version left hard-edged dark patches hanging in the sky (the curtain volume is cut by a coarse cloud-cell mask). Curtains also
rated slightly negative across 141 ratings. **Removed** from the weather (the seed draw is kept so other seeds do not move). **Night**
lifted again (sky base 82, ambient 0.28) and moonlit "clearing" disallowed — veiled land under a dark sky is nothing. Batch 4: 96 seeds,
11 culled, 85 offered; medians 56 / 144 / 208, black 8.4 %. No comb marks and no dead nights in the batch. Faults seen: a stepped
white lake with dripping edges (2266096 — a lake seen from very close, the shore in the fine patch), a white striped block on a ridge
(2179982), one striped-comb sheet not from curtains (2456777 — spindrift?), a striped tower (2672062).

## Batch 5 (2026-09-22)
The close lake and the striped block were both the **tarn**: on this eroded ground no closed basin exists, so a tarn perches on a shelf and
its flat surface, seen from below, renders as a striped wall or a cylinder. Three placements tried (contained flood, narrow-exit dam, low
smoothed dam) — none survives. **Tarn is no longer dealt by seed**; the code stays and it can be forced. The **tower** was the fine near
patch stretching a cliff of the invented ground: the patch now blends out on very steep ground, and crevice streaks are not drawn on
near-vertical faces (that also removed the last comb-like sheet). Batch 5: 96 seeds, 9 culled, 87 offered — the smallest cull yet;
medians 53 / 154 / 211, black 8.7 %. Faults seen: a dark notch on a ridge (3380400), a striped waterfall-like face (3650759), a blocky
shape with a stepped shore (3862662 — survey water seen from close), pale towers with dark seams (3979574).

## His selection, batches 1–5 (2026-09-22)
Dimitris kept **107 of 417** offered pairs (26 %) and **rescued none** of the 63 Claude culled — the cull is safe at this rate. Kept share rose
across the batches (19 %, 17 %, 23 %, 34 %, 34 %) as the fault fixes landed. What he kept, against what was offered: **clearing 39 %**,
passage 22 %, whiteout 19 %, exposure 18 %; one view cut in two 34 %, later 26 %, turned 21 %; moon 36 %, against the light 29 %, front
17 %; low key 30 %, high 20 %; pouring 34 %, spindrift 19 %. None of the hand/temper values differ between kept and not kept. Places
(≥ 6 offered): Besseggen 6/10, Darrans 4/7, Stetind 4/7, Huayhuash 5/11; invented 27/84 (32 %); none kept from Kinabalu 0/8,
Lyskamm, Eiger, Prokletije, Trollveggen (0/6 each). `edition/kept.json` lists the 107 with their seeds.
**Warning**: the kept seeds depend on the current place list and mood weights; any later change re-deals them. Freeze the generator
(a version stamp, the DEM set, the weights) before this list is treated as an edition.

## Frozen: v1.0 (2026-09-22)
`FREEZE.json` records what makes a seed's picture: hashes of `compose.js`, `parts.js`, `worker.js`, `index.html` and `assets/drybrush.js`;
a hash of every `.dem` and the place list in order; the deal (mood weights, event odds, pair odds, temper ranges) read out of the engine
text; and eight witness seeds with a checksum of their painted pixels. `node tools/ridge-freeze.mjs check` re-hashes and repaints the
witnesses; it exits non-zero if anything moved. The browser paints witness 221429 to the same hash as node (`75f7404b…`), so the interface
and the harness are the same piece. **From here, any change to the engine, painter, places or deal is a new version**: bump `version`,
re-run `write`, and treat the kept lists as belonging to the version they were selected under (`edition/kept.json` = v1.0).
Nothing here is in git yet: the repository is 32 commits behind GitHub and slot 011 collides (see the project examination); the freeze is a
file-level record until that is reconciled and 027 is committed.

## Batch 6 (2026-09-22) — first batch under v1.0
The freeze check passed before painting. 96 seeds, 11 culled, 85 offered; medians 58 / 148 / 211, black 6.2 % (source 56 / 141 / 208 /
6.7 %). Faults seen, all known kinds: striped towers on a steep face of the invented ground (4792468, 5144864 — the cliff blend does not
catch every one), blotched snow with a striped shore (4592243, survey water seen close), marbled rock (4560207, 4808486).

## Batch 7 (2026-09-22) — v1.0
Freeze check passed. 96 seeds, 11 culled, 85 offered; medians 58 / 143 / 210, black 7.3 %. Faults, all known kinds: survey water seen
close as a flat white slab (5760341), striped or rippled steep faces (5569447, 5977266), ray-like pale streaks (6298315), ribbed pattern
(6228899).

## Batch 8 (2026-09-22) — v1.0
Freeze check passed. 96 seeds, 11 culled, 85 offered; medians 58 / 142 / 211, black 7.6 %. Faults, all known kinds: two dead dark sheets
(6712129, 6824221), ribbed or marbled pattern (6814880, 7160497, 7422045), a row of thin vertical strokes on a ridge (7132474).

## Batch 9 (2026-09-22) — v1.0
Freeze check passed. 96 seeds, 14 culled, 82 offered; medians 53 / 135 / 210, black 9.8 %. Faults, all known kinds: striped towers on
steep invented ground (7849636, 8108934, 8218637, 8577665 — four this batch, the most frequent kind left), glossy whiteout blur (four),
a near-dead dark sheet (7749906).

## Batch 10 (2026-09-23) — v1.0
Freeze check passed. 96 seeds, 13 culled, 83 offered; medians 55 / 143 / 210, black 7.0 %. Faults, all known kinds: striped towers on
steep invented ground (8980169, 9080239, 9240351, 9260365), blank pale sheets (four), survey water seen close (9630624), a dead dark sheet.
Ten batches painted: 960 seeds, 832 offered.

## Batch 11 (2026-09-23) — v1.0
Freeze check passed. 96 seeds, 11 culled, 85 offered; medians 54 / 139 / 210, black 8.9 %. Faults, all known kinds: striped or smeared
steep faces (10259112, 10361702, 10577141, 10638695, 10761803, 10874652 — six this batch), glossy whiteout blur (two), one dead dark sheet.
Eleven batches: 1 056 seeds, 917 offered.

## Batch 12 (2026-09-23) — v1.0
Freeze check passed. 96 seeds, 11 culled, 85 offered; medians 61 / 154 / 211, black 3.8 % — the palest batch so far (the seed draw).
Faults, all known kinds: striped or dripping steep faces (11127409, 11424573, 11477638, 11796028, 11880932), glossy whiteout blur (three),
blank pale sheets (three). Twelve batches: 1 152 seeds, 1 002 offered.

## Batch 13 (2026-09-23) — v1.0
Freeze check passed. 96 seeds, 14 culled, 82 offered; medians 62 / 143 / 210, black 4.3 %. Faults, all known kinds: glossy whiteout blur
(six — the whiteout dome seen too close), striped or ribbed faces and plains (12198492, 12515665, 12592224, 12625035), survey water seen
close (12920334), a blocky cut-out shape (12231303). Thirteen batches: 1 248 seeds, 1 084 offered.

## Batch 14 (2026-09-23) — v1.0
Freeze check passed. 96 seeds, 14 culled, 82 offered; medians 57 / 140 / 210, black 6.9 %. Faults, all known kinds: white drips on
steep faces (13481037, 13967410, 14250185), striped or ribbed slopes (13390549, 13899544), stepped terraces (13628080), marbled pattern,
glossy blur, one dead dark sheet. Fourteen batches: 1 344 seeds, 1 166 offered.

## His selection, batches 1–14 (2026-09-23)
**210 of 1 171** offered pairs kept (18 %); **0 of 173** culls rescued. `edition/kept.json` lists all 210 with seeds (batches 1–5 pre-date the
freeze but were painted under the identical deal; all re-derive under v1.0). The kept rate fell after batch 5 (34 % → 4–27 %, mean 14 %):
either the later batches are weaker (nothing in the generator changed after batch 5 except the tarn/curtain removals and the cliff fix) or the
selection tightened as the pool grew — most likely the latter. Kept share by kind, 14 batches: **clearing 31 %** vs passage 12 %, exposure
12 %, whiteout 13 %; one view cut 24 % vs turned 15 %; against the light 22 % vs front 8 %; low key 21 % vs high 13 %; still weather 23 %.
Places (≥ 15 offered): Besseggen 10/19, Western Arthurs 8/16, Liathach 6/16, Darrans 7/21; invented 46/214 (21 %); zero from Prokletije 0/19,
Eiger 0/17, Roraima 0/16; near-zero Meije 1/30, Robson 1/19, Civetta, Fitz Roy, K2 1/18.

## v1.1, and batch 15 (2026-09-23)
**v1.1** — the deal shifted from his 1 171 selections: moods clearing 52 % / exposure 20 % / passage 20 % / whiteout 8 % (was 30/30/30/10);
pairs one view 50 % / turned 26 % / later 18 % / back 3 % / down 3 % (was 30/40/23/4/3); light against 50 % / side 38 % / overcast 8 % /
front 4 % (was 42/40/8/10); high key 6 % (was 10 %). Prokletije, Eiger and Roraima dropped (0 kept from 52 offered) → 44 places. Nothing
else changed. `FREEZE-v1.0.json` keeps the v1.0 record; `FREEZE.json` is v1.1 (check passes). `edition/kept.json` is a v1.0 list.
**Batch 15** (first v1.1): dealt as intended — clearing 55, exposure 18, passage 16, whiteout 7; one view 38, turned 31, later 22; against
49, side 32. 96 seeds, 16 culled, 80 offered; medians 62 / 143 / 209, black 4.6 % (paler than the source: clearings are veiled). The
larger cull is mostly steep-face faults (drips, stripes, terraces), which the shift toward clearing and against-the-light does not reduce.

## Batch 16 (2026-09-23) — v1.1
Freeze check passed. 96 seeds, 17 culled, 79 offered; medians 58 / 148 / 211, black 6.5 %. The cull is the largest yet, and it is almost all
one kind: **steep faces** — white drips (16700071), striped or smeared faces (16798079, 17092103, 17386127, 17827163), striped pillars
(17398378), stepped terraces (17239115), a jagged seam (16736824), a cut-out (16994095). Two v1.1 batches: 33 of 192 culled (17 %), against
12 % under v1.0. Clearing at 52 % puts more standpoints low beside walls, where the cliff artefacts live. A v1.2 fix of steep-face
rendering (a proper blend-out of the fine patch and the crevice/snow streaks on faces steeper than ~50°) is now the obvious next version.

## v1.2 — walls (2026-09-23)
Under v1.1 the cull rose to 17 % and was almost all steep-face artefacts. Four causes, four changes, nothing else touched:
1. **The body floated.** The passage and target searches set the eye from the col or the target height, not the ground under the feet;
   eyes of 85–107 units were found. Every candidate standpoint now stands on the ground (1.4–12 units) *before* it is scored, and each
   gaze re-seats the camera on the fine ground. A cliff seen from mid-air strobed; this alone changes which standpoints win.
2. **Walls strobed.** A face seen from below is magnified 30× and the cast-shadow test flickers cell to cell on steep ground. The shadow
   test is softened by slope, and the light on ground steeper than ~50° is smoothed with a wide blur.
3. **Snow lay on walls** (the white "drips"): none is written where the slope is a face, and none is drawn there at render time.
4. **Fine texture on faces**: crevices, grain, near-field stones and the fine ground patch all blend out on a face; a wall is drawn by its
   light alone.
`FREEZE-v1.1.json` keeps the v1.1 record; `FREEZE.json` is v1.2. Gentle ground is unchanged (checked on four v1.1 keeps: two identical,
one close, one re-seated to a new standpoint because it had been floating). Two smooth walls filling the frame remain possible — that is a
cull, not a fault.

## Batch 17 (2026-09-23) — first under v1.2
Freeze check passed. 96 seeds, 19 culled, 77 offered; medians 60 / 152 / 210, black 4.1 %. The steep-face stripes, drips-on-walls and
striped pillars of batches 15–16 are gone. What replaced them in the cull: **blotched snow** — dark blotches on snow slopes in the near
field (18442352, 18555851, 18871126, 19047680; the snow gate at the face threshold leaves a mottled edge zone), **blank pale sheets**
(seven — v1.1's 52 % clearing shows more of them), two smooth walls beside blank veil, glossy whiteout blur. So v1.2 traded one fault for
a smaller one at the snow edge; the cull did not fall. A v1.3 would feather the snow gate and blank-sheet-aware camera scoring.

## His selection, batches 15–16 (v1.1) — 2026-09-23
**18 of 159** kept (11 %): batch 15 12/80, batch 16 6/79; 0 of 33 culls rescued. `edition/kept-v1.1.json`. The v1.1 deal shift did **not**
raise the kept rate: 11 % against 18 % over the fourteen v1.0 batches and 14 % over batches 6–14. By kind: clearing 13/89 (15 %),
passage 5/31 (16 %), exposure 0/30, whiteout 0/9; one view cut 9/65 (14 %), turned 5/54 (9 %). The deal put 55 % of the batch into
clearing, but he kept clearing at the same rate as before (15 % vs 31 % over v1.0 — lower, in fact); the extra clearings were not extra
keeps. Reading: what he kept under v1.0 was not "clearings" but particular clearings, and a deal weighted toward the mood produces more of
the ordinary ones. The place drops and pair weights cannot be judged on 159 pairs. **v1.1's shift should be treated as not supported.**

## Batch 17 selection, and v1.3 (2026-09-23)
**Batch 17 (first v1.2): 21 of 77 kept (27 %)** — the best rate since batch 5, with the same deal as v1.1's 11 %. So the v1.1 deal was not
what lowered the kept rate; the walls were. `edition/kept-v1.2.json`. The deal is therefore left as it is.
**v1.3** — two fault fixes, nothing else: (1) **snow on steep ground**: snow is decided from a smoothed slope and, on faces steeper than
~40°, lies as a sheet following the snowline instead of a patchwork of every hollow; stones in the fine patch no longer punch dark holes
through deep snow (the "blotched snow" of batch 17); the wall threshold for shedding snow and texture rises to ~63°. (2) **near-empty
sheets**: the standpoint score now penalises a frame whose either half holds under 12 % land. What remains on steep snow at thumbnail
scale — dark furrows under a raking sun — is the ridged micro-relief of the invented ground, real form, left alone.
`FREEZE-v1.2.json` keeps the v1.2 record; `FREEZE.json` is v1.3.

## Batch 18 (2026-09-23) — first under v1.3
Freeze check passed. 96 seeds, 17 culled, 79 offered; medians 66 / 156 / 211, black 2.8 % — the palest batch yet. **The blotched-snow
fix did not hold**: dark blotches on snow slopes recur in eight pairs (19303819, 19407555, 19589093, 19744697, 20042938, 20328212,
20354146 and one more), as many as batch 17. The blank-sheet penalty worked (one near-blank pair, was seven). Two things follow. First,
the blotches were not the fine-patch stones nor the per-cell snow decision; the test seeds I checked improved, but the fault is general and
its cause is still unfound — most likely the cast-shadow test on the coarse light (shadow tested per cell against a heightfield with
ridged micro-relief under a low sun). Second, v1.1's 52 % clearing under against-the-light now gives batches with black under 3 % — far
from the source's 6.7 %.

## The blotched snow, diagnosed; v1.4 (2026-09-23)
Method: the composed tone of one blotched seed (20328212) rendered six times with one candidate cause switched off each time — coarse
cast shadow, fine-patch cast shadow, the fine patch itself, near-field stones, the movement smear. Only two removed the streaks: the fine
patch as a whole, and **its own cast-shadow test**. That test marched up to 7 cells (≈ 2 units) from every cell of the patch and treated
every ripple of the resampled surface as an occluder; under a low sun each ripple threw a hard dark streak. The earlier "fixes" (v1.3)
touched the snow map and the stones, which were never the cause — the three test seeds happened to improve for other reasons.
**v1.4**: in the fine patch, only relief the patch itself added — stones and cairns — casts a shadow; plain ground gets one short, soft
test for a stone's shadow falling on it. Nothing else changed. `FREEZE-v1.3.json` keeps the v1.3 record; `FREEZE.json` is v1.4.

## Batch 18 selection (v1.3) — 2026-09-23
**23 of 79 kept (29 %)**, the best rate of any batch; 0 of 17 culls rescued. `edition/kept-v1.3.json`. Clearing 18/50 (36 %). With batch
17's 27 %, the two post-wall-fix batches average 28 % against 18 % over v1.0 — so the wall fixes, not the deal, are what raised the rate;
and the blotched-snow pairs were all culled before he saw them, so the batch tells nothing about the blotches. Across 18 batches:
1 486 offered, 272 kept (18 %), 0 rescued of 273 culled.

## Batch 19, and the second cause (2026-09-23)
Batch 19 was painted under v1.4's first fix alone: 96 seeds, 17 culled, 79 offered; the streaked snow recurred (six pairs). A second
switch-off diagnosis on 20726716 found a **second, independent cause**: the *diffuse shading* of the coarse surface normal. On snow the
albedo is near white, so every facet of the ridged micro-relief prints as a dark band once a low standpoint magnifies it; the wall-light
smoothing did not reach it because these slopes are 30–50°, below the wall threshold. (The first cause, the fine patch's cast-shadow
test, was real too — it produced the hard aligned streaks of 20328212 — but was not the only one.)
**v1.4, second fix**: the shading normal comes from a slope-smoothed height on steep ground, and on snow at any slope (drifts smooth
small relief). Re-frozen; `FREEZE.json` is v1.4 with both fixes. Batch 19's manifest records that it predates the second fix.

## Batch 20 (2026-09-23) — first true test of v1.4
Freeze check passed. 96 seeds, **12 culled**, 84 offered; medians 65 / 154 / 210, black 3.4 %. **Blotched snow: one pair** (22798417,
against 8, 8 and 6 in batches 17–19). The two-cause diagnosis holds. The cull is the smallest since batch 5 and is now the ordinary
residue: glossy whiteout blur (five), blank sheets, one striped wall, one flat grey pair, one survey-water cut-out.

## Batches 19–20 selection (2026-09-23)
Batch 19 (v1.4 first fix): **21 of 79 kept (27 %)**; batch 20 (full v1.4): **15 of 84 (18 %)**; 0 rescued of 29 culled. `edition/kept-v1.4.json`.
Batch 20's lower rate is not explained by anything I changed — the blotch fix removed faults that were culled before he saw them — so it is
batch-to-batch variation (the range since the wall fixes is 18–29 %). Across twenty batches: **1 649 offered, 308 kept (19 %), 0 rescued of
271 culled.** Kept lists by version: v1.0 210 · v1.1 18 · v1.2 21 · v1.3 23 · v1.4 36.

## Batch 21 (2026-09-23) — v1.4
Freeze check passed. 96 seeds, 14 culled, 82 offered; medians 64 / 149 / 210, black 4.5 %. No blotched snow. Cull: glossy whiteout
blur (six), blank domes and sheets (four), a survey-water shore (23550759), two rendering faults on faces (23142352, 23945083), one
ribbed pattern. Twenty-one batches: 2 016 seeds, 1 731 offered.

## Batch 22 (2026-09-23) — v1.4
Freeze check passed. 96 seeds, 17 culled, 79 offered; medians 64 / 149 / 209, black 3.7 %. No blotched snow. Cull: striped or smeared
steep faces (four — the v1.2 wall fix reduced but did not remove these; they are faces of 50–63°, below the wall threshold), glossy
whiteout blur (three), blank or smeared sheets (five), survey-water cut-outs (two), one striped block. Twenty-two batches: 2 112 seeds,
1 810 offered.

## Batches 21–22 selection (2026-09-23)
Batch 21: **20 of 82 (24 %)**; batch 22: **9 of 79 (11 %)**; 0 rescued of 31 culled. `edition/kept-v1.4.json` now holds 65 (batches 19–22).
Across twenty-two batches: **1 810 offered, 337 kept (19 %), 0 rescued of 302 culled.**

## Renumbering (2026-09-23/24)
The project's own slug moved from `027-ridge-encounters` to `028-ridge-encounters` (and 024/025/026 to 025/026/027) to clear a
collision with unrelated work added upstream at `011`. Every path inside this project, the harness scripts, the freeze record and
the root convenience symlink were rewritten to match; the freeze check passed unchanged before and after (v1.4's witness pixels did
not move). The first pass missed `tools/ridge-curate.mjs`, `ridge-freeze.mjs`, `ridge-dem-fetch.py` and `ridge-measure.py` — caught
before batch 23 ran, fixed, freeze re-checked clean.

## Batch 23 (2026-09-24) — v1.4
Freeze check passed after the renumbering. 96 seeds, 18 culled, 78 offered; medians 62 / 147 / 210, black 4.4 %. Cull: 8 rendering
faults (two dead flat panels, a hard streak artifact, a smeared/striped face, a hard wall bar, a second streak+smear pair, a flat
near-lens wall wedge), 9 blank or featureless panels, 1 flat pictogram wedge. This pass, more of the softer "clearing"-register pairs
that are hazy but still show a ridge were left in rather than culled for mood alone — only faults and genuine blanks came out. Twenty-
three batches: 2 208 seeds, 1 888 offered.

## Batch 23 selection (2026-09-24)
**29 of 78 kept (37 %)**, the best rate since batch 18; 0 of 18 culls rescued. `edition/kept-v1.4.json` now holds 94 (batches 19–23).
The higher rate lines up with the lighter cull above — leaving the soft-but-structured clearing pairs in for him to judge, rather than
pre-cutting them for mood, put more of what he actually keeps in front of him. Across twenty-three batches: **1 888 offered, 366 kept
(19 %), 0 rescued of 320 culled.**

## Batch 24 (2026-09-24) — v1.4
96 seeds, 10 culled, 86 offered — the lightest cull since the wall fixes. Cull: 4 rendering faults (a dead flat panel, an unreadable
near-ground blur, a streak artifact, a radial/starburst artifact), 1 repeating tiger-stripe pattern, 2 flat pictogram wedges, 3 blank
panels. Kept the batch-23 recalibration: soft-but-structured clearing pairs left in, only faults and genuine blanks cut. Twenty-four
batches: 2 304 seeds, 1 974 offered.

## Batch 24 selection (2026-09-24)
**36 of 86 kept (42 %)**, the best rate yet; 0 of 10 culls rescued. `edition/kept-v1.4.json` now holds 130 (batches 19–24). Two batches
running now at 37 % and 42 %, against 11–29 % before the recalibration — this is no longer noise; culling only what I recognise
reliably (faults, blanks, pattern) instead of also cutting soft "clearing" pairs for mood puts far more of what he actually keeps in
front of him. Across twenty-four batches: **1 974 offered, 402 kept (20 %), 0 rescued of 330 culled.**

## Batch 25 (2026-09-24) — v1.4
96 seeds, **4 culled**, 92 offered — the lightest cull yet. Cull: 2 rendering faults (a dead flat panel, a hard repeating grid
artifact), 1 unreadable near-ground blur, 1 pair both blank. Held the line from batch 24: near-lens walls and hazy domes with any
visible ridge stayed in. Twenty-five batches: 2 400 seeds, 2 066 offered.

## Batch 25 selection (2026-09-24)
**36 of 92 kept (39 %)**, 0 of 4 culls rescued. `edition/kept-v1.4.json` now holds 166 (batches 19–25). Three batches at 37 / 42 / 39 %
confirms the recalibration held even as the cull itself shrank to 4 % — going lighter did not let weak pairs back in, it just stopped
removing pairs he wanted to see. Across twenty-five batches: **2 066 offered, 438 kept (21 %), 0 rescued of 334 culled.**

## Batch 26 (2026-09-24) — v1.4
96 seeds, **4 culled**, 92 offered. Cull: 2 rendering faults (a hard geometric shard, an unusual terraced/blocky artifact), 1 pair
both blank. Same light touch as batch 25. Twenty-six batches: 2 496 seeds, 2 158 offered.

## Batch 26 selection (2026-09-24)
**32 of 92 kept (35 %)**, 0 of 4 culls rescued. `edition/kept-v1.4.json` now holds 198 (batches 19–26). Four batches running at
37 / 42 / 39 / 35 % since the recalibration — stable, not drifting either way. Across twenty-six batches: **2 158 offered, 470 kept
(22 %), 0 rescued of 338 culled.**
