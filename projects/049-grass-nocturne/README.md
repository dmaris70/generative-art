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

## Drawing quality and dichroic colour

- **Creased blades:** each blade folds along its middle, so its two halves catch the light
  differently. It narrows to a real point.
- **Light through the blades:** when a blade is lit from behind, its edges and tip glow.
- **No blinking at distance:** the last blade kept in a thinned-out cell is drawn in proportion
  to how far it is kept, so the far field fades smoothly instead of flickering.
- **Thin blades stay lines:** a blade narrower than a pixel is widened to one and made fainter
  by the same ratio, so it does not break into dots.
- **Dichroic film:**
  - **How it works:** each blade carries an imagined thin film whose thickness varies a little
    from blade to blade. The colour it reflects depends on the angles to the viewer and to the
    light, and light passing through shows the complementary colour. As blades bend and the
    camera drifts, the colours shift.
  - **Always on:** at 18% strength, as a shimmer on the grey.
  - **Full strength:** in the score's colour mode 8.
  - **The pair changes through the day,** crossing over in the last half hour of each block:
    - 00–06: cyan and magenta
    - 06–12: gold and blue
    - 12–18: green and violet
    - 18–24: copper and teal
  - **Settings:** `?dichroic=0` turns it off; `?dichroic=2` doubles the shimmer.

## The journey and its weather (`weather.js`)

The meadow travels once round the earth in a year, and its weather is the live weather of
wherever it has got to.

- **Where it is:** longitude moves east 0.9856° a day (360° in a year) from a starting meridian
  (`?from=`, default 0°). Latitude swings between 60°N and 45°S over a year and a half, so the
  track does not repeat for three years. Day 1 is 1 Nov 2026. The place follows from the date
  alone, so every screen is in the same place.
- **The reading:** Open-Meteo (free, no key) is asked every 15 minutes for the place rounded
  to 0.1°. Each new reading eases in over 5 minutes. With no reading for an hour (offline,
  refused, over the limit), the piece falls back to its own built-in weather and says so in
  a measurement. It never stops.
- **What each reading does:**

| Reading there | In the meadow |
|---|---|
| Sun's height and bearing | The light's height and bearing. By night there, a low stand-in light from the opposite side, and the field darker but readable. `?light=local` keeps the office's own day instead. |
| Temperature | The dichroic pair: below −10 °C cyan/violet, 5 °C cyan/magenta, 15 °C green/violet, 24 °C gold/blue, above 34 °C copper/magenta, blended in between |
| Wind speed and direction | The gusts' strength and direction; also the direction and speed of the cloud shadows |
| Gusts (over the mean wind) | How hard the gusts pulse, and extra glitch minutes: up to 1.64× as many in a gale |
| Cloud cover | How much of the field is in cloud shadow |
| Humidity, visibility, fog | Haze: dry air sharp to the trees, fog closing the field in to about 10 m |
| Rain | Falling lines in three depths, slanted by the wind across the view; the meadow darker |
| Snow | Slow short marks; motion slowed by 60%; greys lighter; colour drained |
| Pressure | The camera's height: low pressure keeps the eye in the grass |
| Pressure over 3 hours | The horizon tilts, up to 2°, falling one way and rising the other |
| Thunderstorm | Single inverted frames, at random-looking but reproducible moments |
| Night there | Colour at half strength |

- **Five more measurements** join the 30-second cycle, so 15 kinds every 7.5 minutes:
  - the place and the solar time there, with the sun's height and the day of the journey
  - wind and gusts
  - pressure and its trend, humidity, temperature
  - cloud, visibility, precipitation
  - the weather code with its name, or "no reading" and the reason
- **Network:** the wall needs outgoing access to `api.open-meteo.com`. That is 96 requests a
  day per screen, far below the service's free limit. The preview link on claude.ai cannot
  reach it, so there the piece shows its built-in weather.

## Where the meadow is: choosing the place (`setup.html`)

`setup.html` is a world map drawn from the piece's own geography data. Click to choose; it
shows the circuit, where the meadow is now, the share of the circuit at sea, its length, and
the countries crossed in order. It writes the address for the wall's browser, with a button to
copy it. Four ways to choose:

| Mode | Address | What happens |
|---|---|---|
| **Start here, travel the world** (recommended: the office) | `?from=lat,lon` | Day 1 is the place's own weather and ground. The meadow leaves eastward, goes once round the earth, its latitude swinging between 60°N and 45°S, and is home again after one circuit. |
| One fixed place | `?place=lat,lon` | The meadow stays at one place: its live weather, sun and ground, permanently. |
| A route between places | `?route=lat,lon;lat,lon;…` | Along great circles from place to place and back to the first, once per circuit. |
| Along one latitude | `?lat=…&from=lat,lon` | Once round the earth on one parallel, so the sun and seasons stay alike while the ground changes. |

- **Common settings:** `?days=` is the length of one circuit (365 by default); `?start=YYYY-MM-DD`
  is day 1 (1 Nov 2026 by default).
- **The old setting still works:** `?from=<longitude>` starts at that meridian, with the
  latitude cycle of a year and a half.
- **Synchronised:** the place follows from the date and the settings alone, so every screen with
  the same address is in the same place.
- **Example:** starting at Athens, the circuit is 40,080 km, 54% at sea, through 16 countries:
  Greece, Turkey, Russia, Ukraine, Mongolia, China, North Korea, Japan, Chile, Argentina, Brazil,
  Sierra Leone, Guinea, Mali, Algeria and Libya.

## The ground under the journey (`geography.js`, `data/`)

The piece knows the earth offline. It reads a 0.25° grid (1440 × 720 cells) built by
`data/build_geo.py` from public data:

| Layer | Source | License |
|---|---|---|
| Country of each land cell; sea or ocean name of every cell; 2,512 cities (population ≥ 150,000, or a capital) | Natural Earth, 1:50m and 1:10m | Public domain |
| Elevation on land | ETOPO 2022, NOAA National Centers for Environmental Information, sampled every 0.5° | Public domain |
| Distance to the coast | Computed from the land mask (shortest path over the grid, in km) | — |
| Climate zone (not yet added; see below) | Köppen-Geiger V3, Beck et al. (2023), *Scientific Data* 10, 724, 1991–2020, 0.5° | CC BY 4.0 |

Country names and borders are Natural Earth's, which show de facto boundaries. Names appear
only as text in the measurements, never as a picture of a map.

**What the ground does.**

| Fact | In the meadow |
|---|---|
| **Sea or land** | A place on land is always land, however close to the coast. Off the coast the sea comes in gradually and is full by 40 km offshore. The meadow stays and moves with the sea's waves (see The sea). |
| **Elevation and roughness** | The ground's relief grows with height and with how much the land varies nearby, up to three times. Air is thinner higher up: less haze and slightly brighter. |
| **Latitude** | Grass is up to 35% shorter toward 60° and up to 15% taller at the equator. |
| **Climate zone** | Once added: tropical is dense and tall; desert is sparse, short and pale; steppe is tufted and combed by wind (more charcoal); temperate is today's meadow; cold is shorter; tundra is low; ice is almost bare. |
| **At sea, at night** | Brighter exposure, so the sparse reeds still read. |

**Crossings.**
- The **equator** mirrors the image for an hour.
- The **date line** gives ten minutes of time slice.
- A **tropic** brings a day with half as many colour minutes again (304 instead of 211).
- Coastlines, borders, seas and every 15° of longitude are logged; a measurement reads the
  most recent.

**Five more measurements** (20 kinds, all every 10 minutes):
- the ground (country or sea, distance to the coast, height, climate)
- the nearest city, its distance and bearing
- distance travelled, and the next landfall or departure to sea
- the last thing crossed and when
- the antipode, and whether it is land or sea

**The first year** (from 0° on 1 Nov 2026): 60% of the time at sea; 11 countries (Italy, France,
Croatia, Bosnia and Herzegovina, Serbia, Hungary, Romania, Ukraine, Russia, Chile, Argentina);
33,600 km.

**The climate map is not in yet.** figshare, which hosts it, answers automated downloads with a
bot challenge, so it could not be fetched from here. To add it:
1. Download `koppen_geiger_tif.zip` from https://doi.org/10.6084/m9.figshare.21789074.
2. Put its 0.5° 1991–2020 map, `koppen_geiger_0p5.tif`, in the source folder as
   `koppen_0p5.tif`.
3. Run `python3 data/build_geo.py <sources> data`.

The engine picks it up without other changes. Until then the measurement says
`CLIMATE MAP NOT YET ADDED`, and the meadow ignores climate. `?geo=0` ignores the ground
altogether.

## The homage: Athens and London (the default)

With no settings in the address, the piece is a homage to the cooperation between the Royal
Ballet School and the Centre for Dance Studies. The meadow keeps a week between two homes: a
place in Athens (37.9704 N, 23.7011 E) and Covent Garden in London (51.5132 N, 0.1232 W). It
shows the real look.

- **The week** (from 1 Nov 2026, UTC): three days in residence in Athens, half a day crossing,
  three days in London, and half a day back. Light, weather and ground are always those of where
  the meadow is.
- **Every crossing different:** each trip's route is fixed by its number.
  - About 3 in 10 go nearly direct (2,391 km), or bend a few hundred km off the line.
  - About 5 in 10 make a detour through one to three points, 300 to 2,500 km to either side.
  - About 1 in 6 are extreme, by way of one or two places anywhere on earth at least 2,500 km
    from either home: tens of thousands of km in the same half day.
  - Departure and arrival are eased, slow at either end.
- **Glimpses:** in about one five-minute slot in four, a sudden cut of 2–7 seconds to a home.
  - At a home, it cuts to the other home; while travelling, to both in turn.
  - Each glimpse brings that home's own meadow, its sun and its live weather (each home has its
    own reader).
  - The cuts tear with a moment of datamosh, as do arrivals and departures.
  - About 3.5 an hour, at the same second on every screen. `?glimpses=0` turns them off.
- **The dance:**
  - **Tempo:** follows the place: allegro (120 beats a minute) in Athens, adagio (66) in London,
    blending on the way.
  - **Phrasing:** gusts are phrased in counts of eight, the strongest on 1 and again on 5.
  - **Unison and canon:** in about one minute in three the whole field sways as one, swelling
    and fading over the minute. Otherwise the movement passes across the field as a canon.
  - **The révérence:** for the first minute after arriving, every blade and flower bows toward
    the viewer and the wind drops.
  - **Stage light:** while in residence, and during glimpses, a soft light falls on the centre
    of the field.
  - **Each place its own meadow:** each home has its own meadow, and the journey another. The
    change happens under the arrival's datamosh.
- **Where:** for thirty seconds of every two minutes, and through every glimpse, a panel at the
  top right shows where the meadow is:
  - a small line-drawn map, its coastlines traced from the piece's own geography;
  - the Centre for Dance Studies in Athens and the Royal Ballet School in London, each marked and
    labelled;
  - the route, solid when travelling and dashed for the next crossing when in residence;
  - the meadow as a ringed dot;
  - underneath: the coordinates, the place in words ("in Athens, Greece", "over the Adriatic
    Sea", "near Trieste, Italy"), and each school with its city and its distance, or "here".
  - The map frames both schools and the whole route, so an extreme trip zooms out to the world.
    `?where=0` hides the panel.
- **The homage measurement** (22 kinds now):
  - in residence: the home, the day of three, the count and tempo, unison or canon, the other
    home's distance, and time until leaving;
  - travelling: the trip number, the route kind, its length, how far along, and the city nearest
    its farthest point.
- **The dedication:** *For the Royal Ballet School and the Centre for Dance Studies*, lettered for
  forty seconds at the start of each hour, with the agreement of the Royal Ballet School. Names
  only: no logos or institutional colours. `?dedication=0` hides it.
- **Other settings:** `?homes=lat,lon;lat,lon` changes the two homes. `?journey=1`, `?from=`,
  `?place=`, `?route=` or `?lat=` give the earlier tracks. `?look=lines` gives the line-drawn
  meadow.

## The real look (`?look=real`)

The same meadow, rendered in colour instead of as line-drawn blades. Everything else stays
unchanged: the clock, the journey, the weather, the geography, the score and the
measurements.

- **Grass:** each blade is green varying from blade to blade, drying to straw toward the tip, in
  dry tufts and in dry, hot or pale-climate weather. It is dark at the root, lit as a canopy from
  above and on its faces, and glows where the light passes through.
- **Flowers:** in drifts, on stems among the grass, moving with the same wind: pink, white, red,
  orange and violet, with yellow centres. They appear in the warm half of the year where the
  journey is (all year in the tropics), fewer in dry or cold climates, none under snow.
  `?flowers=0…3` sets how many.
- **Light:** the sun's colour and the sky's colour follow the sun's height where the journey is:
  white at midday, gold low down, a moonlit blue at night, greyer under cloud. The sky runs from a
  pale horizon to a deeper zenith with a glow round the sun. The ground is earth and the tree line
  a dark wood. Aerial haze is gentle near and pale toward the horizon.
- **Off in this look, unless asked for:** the paper, wash and charcoal registers and the dichroic
  shimmer. The faded near field, automatic exposure, glitches and colour minutes still apply.

**A new glitch, datamosh** (glitch 11, in both looks):
- columns smeared upward from one row into vertical streaks;
- horizontal bars displaced sideways, some flooded with a flat blue;
- 16-pixel blocks replaced by an earlier frame.

The technique is taken from a datamoshed meadow photograph shared as a reference; its
composition is not copied.

## The sea

Where the journey is over the sea, every element of the piece stays intact: the meadow, its
ground, the tree line, the mist, the score and the registers. The sea shows through the meadow's
movement. Its waves and swell roll through the grass as moving crests, with the sea's real periods
and directions, and where crests would whiten the blades turn pale.

`?sea=surface` adds a separate sea surface instead: a field of strokes lying along the crests and
riding the waves, which replaces the meadow at sea. It is off by default.

**Where the conditions come from.** Every 15 minutes the piece asks Open-Meteo's marine service
for the waves where the journey is: significant wave height, period and direction, and the swell's
height, period and direction. Where there is no reading, it uses the sea a wind of that speed
raises when fully developed (wave height ≈ 0.0214 × wind², period ≈ 0.73 × wind speed). The
measurement says which.

**The sea states** (the Douglas scale) and what they look like:

| State | Waves | In the piece (the meadow's movement; the surface with `?sea=surface`) |
|---|---|---|
| 0 Calm, glassy | under 0.03 m | Barely moving; strokes long, aligned and still |
| 1 Calm, rippled | to 0.1 m | Fine ripples only |
| 2 Smooth | to 0.5 m | Low, regular wavelets |
| 3 Slight | to 1.25 m | Waves; the first white crests |
| 4 Moderate | to 2.5 m | Longer waves; many white crests |
| 5 Rough | to 4 m | Swell and wind sea crossing; crests curl and whiten |
| 6 Very rough | to 6 m | Heavy rolling surface; the camera rides higher |
| 7 High | to 9 m | Streaks of foam along the wind |
| 8–9 Very high, phenomenal | above 9 m | The whole surface moving; foam streaks everywhere |
| Frozen | below −1.8 °C, above 50° latitude | Motion stops; no white crests |

**How it is drawn.**
- **Wave trains:** four of them (the wind sea, a shorter sea beside it, the swell from its own
  direction, and a ripple), summed as moving sine waves.
- **Periods are true,** so a 9-second sea has 9-second waves. Wavelengths are shortened to a
  third so that waves fit the 46 m view.
- **Height on screen:** grows with the square root of the real wave height, so a 14 m sea is
  dramatic without swallowing the view.
- **White crests:** appear from about 4 m/s of wind, on the steep tops.
- **Foam streaks:** from about 14 m/s, some strokes turn to lie along the wind.
- **The camera** rides above the highest crests when the surface is drawn.
- **No reflection at sea** in either case.

## Four registers, borrowed as techniques

Four ways of making marks are layered over the meadow, and the weather where the journey is
decides how much of each. They come from references for ink wash, high-key photography of
reeds in water, and charcoal drawing. Only the techniques are taken; no composition is copied.

| Register | What it does | Driven by |
|---|---|---|
| **Paper and ink** | The night becomes paper and the light becomes ink, mostly where there is drawing: a blade or a crest brighter than what surrounds it. Areas that are merely bright, such as fog or haze, stay close to paper, as they do in daylight. Colour turns to its complement, as a dichroic film shows by transmitted light. | Daylight where the journey is (the sun from 4° below the horizon to 10° above). `?paper=0` never uses paper. |
| **Wash** | Tone bleeds, pigment pools at the edge of a wash, and granulation runs through the paper. | Humidity, rain and fog |
| **Charcoal** | Tone is dragged a short way along the wind's direction across the screen, and a dry brush skips over the paper's tooth. | Wind strength |
| **Water** | Below a waterline the meadow is seen reflected in moving water. The ripples are a continuous field: fine and quick near the horizon, broad and slow near the eye, drifting with the wind. When it is wet, a few thin, broken threads of light hang from the line like ink lines in a wash. | **Only where the journey is over the sea:** none on land, whatever the weather. It comes in from 20 km inland and is full by 40 km offshore, where the waterline sits just below the horizon. Ripples follow the wind; threads appear only at sea with humidity, rain or fog. |

**Automatic exposure.** Every second the piece measures its own frame's brightness (the 90th
percentile of a 320 × 180 copy). A dark frame (night, storm, rain, open sea) is lifted, up to
4×, until that reaches 0.32. Bright frames are left alone, and the change eases in over a few
seconds. Night stays darker than day but never becomes a black wall.

**The near field, faded.** Grass within about 4 m of the eye dissolves into soft, mottled,
grainy pools of washed-out light and loses its contrast. *Field* has a faded quality in its
near grass too; here it is done as a wash and grain rather than as lens blur. It is stronger
when the air is wet where the journey is. The grass and ground write their nearness into the
scene's alpha channel, and the finishing pass reads it. `?near=0` turns it off, `?near=1.5`
strengthens it.

`?style=nocturne|ink|wash|charcoal|water` holds one register for checking. The weather
measurement now also gives the four weights.

## The score: glitches, colour and measurements

Over the meadow runs a score of abstract events (`score.js`). Nothing in it is random at run
time and nothing is accidental: the moments come from prime numbers, the choices from a hash of
the date and minute. Every screen shows the same event at the same second.

| Layer | When | Rate |
|---|---|---|
| **Glitch** | Every minute of the day (0–1439) that is prime, starting 5–40 s into it and lasting 6–20 s; never in the minute after a colour minute | 227 a day, about 9.5 an hour |
| **Colour** | Every minute whose clock time read as a number is prime (14:23 → 1423); the whole minute, fading in and out over 4 s; eight modes | 211 a day, about 8.8 an hour |
| **Measurement** | Every 30 s without break; all fifteen kinds every 7.5 minutes, in a shuffled order, never the same twice in a row | 2,880 a day |

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
8. Dichroic at full strength.

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
- **Weather:** `?weather=0` uses the built-in day instead of the journey; `?from=<longitude>`
  sets where the journey starts; `?light=local` keeps the office's own day.
- **Holding one event:** `?glitch=1…10`, `?colour=1…8` and `?measure=1…15` hold a single event on
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
