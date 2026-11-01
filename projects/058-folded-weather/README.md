# Folded Weather

*Five studies on one engine.* The engine is the fold-and-inversion density march from Yohei
Nishitsuji's twigl cloud shader (transcribed in [057 After Nishitsuji](../057-after-nishitsuji/)).
What is built on it here is new: a decomposition of the output into three fields, a screened seed
space over the fold constants, four gradings and two exact loops.

## The decomposition

The original adds, over 98 steps, `o += .01 - hsv(h, sat_i, v_i)`. Because
`hsv(h, s, v) = v · mix(1, H, s)` is linear in `v` and `v·s`, the sum collapses to

```
o = 0.98 − W + S · (1 − H)        W = Σ v_i   (density)      S = Σ v_i·sat_i   (sky weight)
```

With `h = .1`, `1 − H = (0, .4, 1)`: the blue. So two scalar fields reproduce the original exactly,
and a third, `g` (where each ray stops), works as a height map. Measured at t = 3 on 160×160 px:

| field | 5th pct | median | 95th pct | reads as |
|---|---|---|---|---|
| W | 0.11 | 0.34 | 0.63 | cloud shade: 0 is lit cloud, toward 1 is deep shadow and gaps |
| S | 0.03 | 0.18 | 0.33 | how much sky shows through |
| g | 39.5 | 53.0 | 66.4 | depth; rises toward the horizon |

Every study grades these three fields. None of them changes the march.

## Studies

| key | study | grading of W, S, g | time |
|---|---|---|---|
| 1 | **Hours** | Sunlight × (0.98 − W), lit across from the sun's side at low sun; S × a sky colour that runs night → dusk violet → day blue; haze rising with g; stars through the gaps at night (high S, low W) | 96 s day, exact loop |
| 2 | **Drift** | the original grading with a seeded hue; the fold constants travel a closed path | 60 s, exact loop |
| 3 | **Sumi** | W as ink load on paper, S as a dilute grey-blue wash, paper grain, ink pooled where the load changes fast | free running |
| 4 | **Strata** | contours of g + 5W every unit, index line every fifth; a fill tinted by S and W; steep ground merges into hatch | free running |
| 5 | **Atlas** | nine seeds side by side; choose a tile to open it in Drift | still |

Seed 0 is always the original constants. Arrow keys step seeds, `0` returns to the original,
space pauses, `H` hides the panel. URL: `?study=hours|drift|sumi|strata|atlas&seed=N&t=s&q=lo|md|hi`
(`t` freezes the clock, used for the preview).

## The seed space, and why it is screened

A sweep of each constant (±0.05 to ±0.4; ±0.005 to ±0.04 for anisotropy) showed:

- **off.y and box.y must stay equal.** Either one alone moved by 0.05 collapses the field (W goes
  negative, or up to 43% of rays never land). Moved together they hold from 3.7 to 5.
- off.x, off.z, box.x, box.z, anisotropy x and z, and the inversion scale all keep the field
  valid, but the response is chaotic: mean W swings between 0.05 (blown out) and 0.65 (murky)
  with no monotone trend.
- anisotropy y has no visible effect.

So a seed ties the y pair (3.7–4.8), perturbs the rest (off.x ±0.25, off.z ±0.35, box.x/z ±0.3,
anisotropy x/z ±0.03, scale ±0.3) and picks a hue (blue ×4, ultramarine, gold, teal).
`tools/folded-weather-screen.mjs` then renders each raw seed with the page's own shader, at the
still frame and at 12 points round its drift loop, and keeps it only if every frame has mean W in
[0.15, 0.62], W standard deviation ≥ 0.08 and ≤ 2% unusable pixels. About 1 raw seed in 11 passes;
the first 48 are shipped as `KEPT`, and visible seed *n* maps to `KEPT[n−1]`.

```
node tools/folded-weather-screen.mjs 48 800     # rewrites KEPT in sketch.js
```

## Loops

Drift moves its five constants by `A·sin(2π·k·u + φ)` with integer `k`, and drives the camera with
`tc = 10π·u`, so `sin(tc)` and `cos(0.2·tc)` both close at `u = 1`. Hours uses the same camera
clock over its 96 s day. Both loops are exact.

## Files

| file | role |
|---|---|
| `sketch.js` | engine, gradings, seed space, loops, panel; exposes `window.FoldedWeather.probe` for screening |
| `index.html` | page and panel |
| `../../tools/folded-weather-screen.mjs` | seed screening (headless Chromium) |
| `preview.png` | Hours at 16:33 (seed 7), Sumi (seed 3), Strata (seed 6), Drift (seed 5) |

## Credit

The march engine (the fold, the inversion, the step rule and the original colour line) is
Yohei Nishitsuji's. The gradings, the decomposition, the seed space and its screening, and the
loops are this project's.
