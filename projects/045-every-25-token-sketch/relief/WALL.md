# The relief on a wall screen

`wall.html` draws the relief for an LED wall or any screen: the panel at the screen's size,
flip-dots turning, the counter rolling, tickets printing into the pocket, the pointer creeping.
It runs the same enumeration as the room at one program a second, locked to the clock, so a
restart resumes where the day is. `wall-standalone.html` is the same file with `babel.js`
inlined, for a player that opens one file with no folder beside it.

## Three ways to show it, in order of preference

**1. A browser in kiosk mode, live.** Any small computer with an HDMI output into the wall's
processor: a Mac mini, a Windows mini PC, a Raspberry Pi 4 or 5, or the wall's own media
player if it runs Chrome. Copy `wall-standalone.html` to the machine and start Chrome with:

```
chrome --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars \
       "file:///path/to/wall-standalone.html?start=09:00&sound=1"
```

On a Raspberry Pi: `chromium-browser` with the same flags, from an autostart entry, with the
screen blanking off (`xset s off; xset -dpms`). The page is 2 % of a laptop's processor at
1080p; a Pi 4 is enough.

**2. The wall's own HTML player.** Signage processors (BrightSign, Novastar with a player,
Samsung Tizen, LG webOS) usually accept an HTML5 asset. Upload `wall-standalone.html` as the
asset and set it full screen; the query options go in the asset's URL. The page needs no
network and no fonts beyond the system's monospace.

**3. A video loop, as a fallback.** For a player that takes only video, `wall-loop-1080p.mp4`
(in the pack sent with this file) is a recording of the page. It loops, so the same programs
return every few minutes and the clock is not real; it looks right from across a room and is
wrong up close. Use it only where 1 or 2 is impossible. To record a longer or larger one:

```
chrome --headless=new --window-size=3840,2160 "file:///path/wall.html?record=600"
```

saves `wall.webm` after 600 s; convert with `ffmpeg -i wall.webm -c:v libx264 -crf 18 -pix_fmt yuv420p wall-loop.mp4`.

## Fitting the wall

The panel is 4 : 3. On a 16 : 9 wall it sits centred with black at the sides, which on an LED
wall is the wall's off state and invisible. The dots are 10 mm on the panel; at 1080p they are
7 pixels across, at 4K 14. On an LED wall with a coarse pitch (2.5 mm and more) set the player
to the wall's native resolution, not a scaled one, so a dot is a whole number of LEDs.

If the wall is very bright for the room, `?dim=0.7`.

## Options

| option | default | what |
|---|---|---|
| `start=HH:MM` | 09:00 | program 1 at this local time today; the number follows the clock from there |
| `rate=N` | 1 | programs a second; 8 is the screen piece's pace |
| `fade=F&minhold=N` | 0.9999, 200 | the room's selector; `fade=0.9992&minhold=0` prints every takeover as the screen piece does |
| `hold=S` | 45 | seconds a ticket stands before an imagined visitor takes it |
| `sound=1` | off | the flip-dots, the wheels, the printer |
| `dim=D` | 1 | brightness |
| `record=N` | off | record N seconds and save `wall.webm` |

Keys: F full screen, S sound, Space pause the drawing (the clock keeps running).

## What it is not

It is a picture of the relief, not the relief. Nothing is printed and no one takes a ticket,
so the pocket shows each found for 45 s and lets it go. The screen piece on neort.io is the
other digital form of the work: the same enumeration at eight a second with its own found
column. The wall version is the relief's rehearsal.
