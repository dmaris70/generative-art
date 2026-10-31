# 049 — Grass Nocturne

A live grass meadow for a large screen. It is lit by a single low light on black, never stops
moving, and is locked to the local clock. A camera drifts through the field slowly, a few
centimetres a second. The light's bearing and height follow the real day: high and flat at
noon, low and raking at night. Gusts of wind cross the field. Every screen running the piece
shows the same moment, and a restart comes back to it.

![06:40: dawn mist and the tree line, eye 0.73 m, light 21°](preview.png)

## How it relates to Herzog's *Field* (2026)

This piece is deliberately closer in look to Leander Herzog's *Field* than
[048](../048-plotted-field/) is: a live monochrome meadow on a dark ground. It is the same
genre, not a reproduction, and **no code was taken from *Field***.

| | *Field* (Herzog) | *Grass Nocturne* |
|---|---|---|
| Camera | 26 fixed viewpoints, each a token, plus a free orbit | One continuous drift whose path is set by the clock and repeats only every 20 days |
| Light | A moon orbiting every 60 s | Bearing and height follow the real time of day |
| People | Visitors' touches are shared live and bend the grass | No interaction; made for a wall |
| Ownership | On-chain: owners shown in the scene | None |
| Technology | WebGPU compute pipeline | WebGL2, every blade computed in the vertex shader; no blade buffers |
| Image | Blur and floating dust motes | Sharp, with distance fog to black |

## The rules

- **The meadow is the same wherever the camera goes.** Each blade comes from a hash of its
  world cell (0.28 m) and its index in the cell. Height comes from smooth noise (tall drifts
  and short lawns), and tufts share a height. Nothing is stored.
- **What gets drawn:** a 46 × 46 m window of cells, shifted ahead of the camera. Beyond 7 m
  fewer blades are drawn, each a little wider, so the field keeps its tone. There are 14
  blades per cell by default (about 380k blade slots), each a 6-segment curve.
- **The camera** (a function of seconds since local midnight): an hourly loop of about 26 ×
  18 m, a 19.5-minute swerve, and a 37-minute rise and fall in eye height from 0.32 m to
  5.5 m, mostly low. It looks 14 m ahead along its path. Top speed is 5.6 cm/s.
- **The light:** its bearing turns once a day, and its height runs from 7° at 01:00 to 38° at
  13:00. Exposure follows the light's height, so the night is darker as well as more raking.
- **The wind:** its direction wanders through the day, and its strength gusts on 97 s and
  411 s cycles. Gust fronts travel downwind across the field with a flutter on top, and each
  blade also has its own lean.
- **Gusts you can see:** a blade bending in the wind shows its paler side, so strong gusts
  appear as bright waves rolling across the field.
- **Cloud shadows:** soft dark shapes, roughly 30–60 m across, drift downwind at 1.8 m/s and
  darken the grass and the ground. The cover changes over 90 minutes, from broken cloud to
  mostly clear.
- **Horizon and mist:** a hedgerow with trees stands on a ring 70 m from the field's centre.
  The meadow fades out over the last 7 m of the drawn window instead of ending in a line, and
  distance fades into a mist lit from the light's side rather than into black. The mist is
  thickest around 06:30 and 19:00. A faint glow at the horizon keeps the tree line visible at
  night.
- **Shading:** a fraction of light that wraps round the blade, plus a sheen along the blade's
  length (strongest at the tip), a rim light, and darkening at the root. Distance fades to
  black, the image is tone-mapped to grayscale, and one step of noise is added to stop
  banding on 8-bit LED panels.

## The score: glitches, colour and measurements

Over the meadow runs a score of abstract events (`score.js`). Nothing in it is random at run
time and nothing is accidental: the moments come from prime numbers, the choices from a hash of
the date and minute. Every screen shows the same event at the same second.

| Layer | When | Rate |
|---|---|---|
| **Glitch** | Every minute of the day (0–1439) that is prime, starting 5–40 s into it and lasting 6–20 s; never in the minute after a colour minute | 227 a day, about 9.5 an hour |
| **Colour** | Every minute whose clock time read as a number is prime (14:23 → 1423); the whole minute, fading in and out over 4 s | 211 a day, about 8.8 an hour |
| **Measurement** | Every 30 s without break; all ten kinds every 5 minutes, in a shuffled order, never the same twice in a row | 2,880 a day |

**Glitches, each an idea.**
1. *Time slice*: each column is a different second, from now (left) to 40 s ago (right).
2. *Echo*: a band showing the field 60 s ago.
3. *Sorting*: blades slide across the screen to the place their height ranks them.
4. *Transposition*: the wind turns a quarter.
5. *Quantisation*: positions snap to a grid that halves six times.
6. *One bit*: no greys.
7. *Identity*: each blade drawn as the bits of its own hash.
8. *Mirror* (rare).
9. *Inversion* (rare).
10. *Recursion*: the view nested inside itself.

Mirror and inversion pass only one time in eight, about six times a day between them.

**Colour, as something encoded.**
1. Each blade's colour from its hash.
2. Distance as hue: near warm, far cool.
3. The time of day as a point on the colour wheel.
4. Each tuft one colour.
5. A colour and its complement, split down the middle of the screen.
6. A single primary.
7. Colour carried by the wind.

**Measurements.** All are drawn in the single-stroke letters of 048 and read the same functions
that draw the image:
- A blade's cell, hash, height and distance.
- The probability that a blade at that distance is drawn.
- The census of blades and triangles in the frame.
- Frames since 1 Nov 2026 at 60 fps.
- The next prime minute and the next prime clock time.
- The phases of the camera's three cycles.
- Time until the path repeats.
- The wind as a vector, drawn as an arrow in the field.
- The entropy of the frame's brightness.
- Today's count of events.

While a glitch or a colour is on, its cause is lettered low on the left, for example
`GLITCH 7 - IDENTITY - MINUTE 853 IS PRIME`.

**The logbook.** `NocturneLog('2026-11-02')` in the browser console lists every glitch and colour
minute of a day, with its time and the reason for it.

**How it is drawn.** The scene is rendered with 4× antialiasing into a texture, then a
finishing pass applies the whole-image glitches and colours. One frame a second is kept at
320 × 180 in a ring of 64, which feeds the time slice and the echo.

## On a wall

- **Dimming:** to 60% from 19:00 to 22:00 and 35% from 22:00 to 07:00
  (`?dim=19-22:0.6,22-7:0.35`; `?dim=` turns it off).
- **Settings:** `?blades=4…24` (blades per cell) and `?scale=0.5…2` (render resolution) adjust
  it to the GPU. `?hud=0` hides the status line, `?seed=N` gives a different meadow.
- **Diagnostics:** `?show=clouds` and `?show=gusts` display the cloud shadows or the gust
  waves on their own, for checking at installation.
- **Holding one event:** `?glitch=1…10`, `?colour=1…7` and `?measure=1…10` hold a single event on
  screen for checking. `?score=0` turns the score off.
- **Rehearsal:** `?at=2026-11-02T21:40&speed=60` starts the clock at that time and runs it 60
  times faster. `?still=1` holds the clock and draws a single frame, for thumbnails.
- **Running it:** a full-screen browser in kiosk mode, set to start on boot. It needs no
  network once loaded, and asks the browser to keep the screen awake.

## Verified

- **The schedule in Node:** eye height stays between 0.32 and 5.52 m over 24 hours. Light
  height is 7° at 01:00, 22.5° at 07:00 and 19:00, and 38° at 13:00. Top camera speed is
  0.056 m/s.
- **Headless Chromium on software WebGL2:** it renders at 08:05, 14:20, 17:12 and 21:40 with no
  console errors. Two frames 2 s apart differ in 32% of their bytes, so the grass is moving.
- **Not checked:** frame rate on a real GPU and on the wall's own computer. The software
  renderer is too slow to measure that. Before installing, find a `blades`/`scale` setting
  that holds 60 fps at the wall's resolution, then run it for 72 hours.
