# Ruled Light

*Straight lines of light; the curve is only where they agree.*

The rule comes from 031 Ruled Continuum, unchanged. A bundle is a pair of rails. Filament *k*
joins the point at *t<sub>k</sub>* on one rail to the point at
*t<sub>b</sub> = t<sub>k</sub>(1 − c) + (1 − t<sub>k</sub>)c* on the other. Only the straight
segment is emitted. Where the segments come close to tangent, they pile into a caustic: a
curve that nothing drew.

What changes is the medium and time:

- **Light, not ink.** Overlaps add up in linear light on true black. The densest crossings are
  the brightest, and empty wall is unlit.
- **The crossing moves.** *c* sweeps across the loop. At *c* = 0 the filaments are parallel
  (a band). At *c* = ½ they all pass through one point (a fan). At *c* = 1 they run in opposite
  phase (a parabolic envelope). Curves form and dissolve.
- **Bundles breathe.** About a third of the bundles are always present. The rest fade in and
  out at integer frequencies, so the composition changes across the loop without repeating
  inside it.

## Files

| file | role |
|---|---|
| `engine.js` | seeded scene and segment emission. No DOM, so it runs in the browser and in Node |
| `sketch.js` | GPU line renderer (instanced quads, box-filtered coverage), panel, clock, export |
| `../../assets/led.js` | LED-wall harness: native framebuffer, tone and black floor, fit / loupe / kiosk, master read-back |
| `../../tools/ruled-light-check.mjs` | loop, determinism, seed-identity and motion checks |

## Claims, and how they are checked

| Claim | Check |
|---|---|
| Frame N equals frame 0 bit for bit | `node tools/ruled-light-check.mjs` compares the emitted geometry at t = 0 and t = 1 across 5 seeds × 4 walls × 3 option sets. In the browser, the master frames at `?t=0` and `?t=1` produce identical PNG hashes. |
| Same seed and settings give the same frame | Same script: a rebuilt scene is compared value for value. The dither is seeded by frame index, not by time. |
| A slider does not change a seed's identity | Every bundle takes a fixed number of random draws whatever the options are |
| No codes 1 to floor−1 reach the wall | Histogram of a master frame (default floor 3): no channel uses codes 1–2 |

## Running it on a wall

1. Choose the wall preset (or a custom size) and the pixel pitch, and tune the piece in the
   panel. **Copy share link** captures the recipe.
2. On the playback PC, open the same link with `&kiosk=1` in a fullscreen Chromium
   (`--kiosk --start-fullscreen`). Map the top-left W×H region in the LED processor.
3. To play from a media server instead, export a PNG sequence from the panel and encode it
   with the ffmpeg lines written into `manifest.json`. The sequence loops seamlessly.

Not yet done: a test on a real panel (gamma, low-grey behaviour, uniformity) and a headless
CLI that renders the full loop straight to ProRes or HAP.
