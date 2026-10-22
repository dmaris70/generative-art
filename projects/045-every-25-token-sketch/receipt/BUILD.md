# The receipt of the found — build sheet

Stage 2 of Every 25-Token Sketch in the room. A thermal till printer in a steel housing prints
each dethroned champion as it happens: the field dithered to the paper's dots, the code, the
number, the time. The paper runs to the floor. The printer's clatter marks each takeover.

## What it does

`receipt.js` runs the same enumeration as the screen (the unchanged `babel.js`, loaded without
a browser) and prints a ticket every time the slow lane changes hands. With `--start 10:00` it
is locked to the clock, so a screen started at the same minute shows the same program number.

A ticket, 58 mm paper, 384 dots across:

```
[ the 64 × 64 field, 6 × 6 dots a pixel, Floyd–Steinberg dithered, 48 mm tall ]
x / cos(y)                              ← bold
library: x y cos /
program 339 . 4 tokens
structure 0.890 . no t
held the lane 450 programs
found 10 . 11:36:05 JST
EVERY 25-TOKEN SKETCH . PCDTOKYO2026
```

About 85 mm of paper a ticket (image 48 mm, seven lines of text, the feed).

## The room's rule, and how much it prints

The screen's selector fades the champion's claim by 0.9992 a program; under that rule the
machine at one program a second prints about 100 tickets an exhibition day (measured: 100,
161, 106, 106, 120, 98 on six consecutive days), 9 m of paper a day, a roll a week, 39,000
tickets a year. The room's rule is stricter, so that each ticket means more and the shelves
hold the year: the claim fades by 0.9999 a program (`--fade`), and a ticket is printed only
for a champion that held the lane 200 programs or more (`--minhold`). Measured at one
program a second: day 1, 33 takeovers, 16 tickets, 1.5 m of paper; day 2, 50 takeovers, 21
tickets, 1.9 m. A ticket is 90.75 mm;
a roll lasts about two months; a year is about 6,000 tickets and 540 m, seven rolls. On 80 mm
paper (576 dots, 9 × 9 dots a pixel) a ticket is about 115 mm. `--fade 0.9992 --minhold 0`
prints as the screen selects.

## Practical, cheap, nothing to service

A thermal till printer has no ink, no toner, no ribbon: heat marks the paper. The only
consumable is the roll. The print head is rated by Epson for 150 km of paper; at the room's
rule that is three centuries. The cutter is rated for 1.5 million cuts; at 6,000 tickets a year
that is 250 years. Maintenance is a roll every two months and a wipe of the head with
isopropyl alcohol once a year. The service plan is a second printer on a shelf: if one fails,
swap the USB cable and the roll, ten minutes, no repair.

## Bill of materials

| part | spec | cost band | note |
|---|---|---|---|
| printer | Epson TM-T20III (USB + Ethernet, auto-cutter, 203 dpi) or any ESC/POS till printer with a cutter; set the paper guide to 58 mm, or run 80 mm with `--width 576` | low, about 200 EUR | the most common receipt printer in shops: parts, rolls and replacements everywhere |
| spare printer | the same model | low | the service plan |
| controller | Raspberry Pi 4, Node 18+, `receipt.js` as a systemd service with `Restart=always` | low | no moving parts; a reboot resumes at the right program from the clock |
| paper | 58 mm thermal rolls, 80 m, top-coated archival grade (fade-resistant), phenol-free | low | one roll about two months; keep four; a day's run on a new paper first, thermal stocks differ |
| tray | a folded steel tray under the slot, 120 × 80 × 40 mm, open to the front | low | the ticket drops into it; whoever is there takes it |
| power | the printer's own 24 V supply, 5 V for the controller, one cable to the wall | low | |

Nothing else. No display, no keyboard, no network needed except for a network printer.

## The registry

Every ticket is logged as it prints (`--log`): its number among the found, its program, its
code, its score, how long it held, and the time. With `--sign <secret>` a six-character
verification code computed from the program number is printed on the ticket and logged, so a
ticket presented later can be checked against the log offline in a second. What a ticket is
good for is decided elsewhere; the printer only makes it checkable.

## Running it

```
# a test strip, no hardware: the first 15 tickets as PNGs
node receipt.js --replay 2780 --png /tmp/strip

# a USB printer, locked to the room's clock, 58 mm paper, cut tickets, the registry beside the script
node receipt.js --device /dev/usb/lp0 --start 10:00 --sign "the foundation's secret"

# a network printer, 80 mm paper
node receipt.js --tcp 192.168.1.50:9100 --width 576 --start 10:00

# a day's receipt as bytes, to print later or elsewhere
node receipt.js --replay 187200 --out day.bin ; cat day.bin > /dev/usb/lp0
```

A systemd unit on the controller:

```
[Unit]
Description=Every 25-Token Sketch: the receipt of the found
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/receipt/receipt.js --device /dev/usb/lp0 --start 10:00 --log /var/lib/receipt/registry.jsonl
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

The piece's time is wall-clock time, so a restart mid-day resumes at the right program; the
tickets printed before the restart are not reprinted (the service only knows what it printed
since it started, so a restart prints the takeovers from the restart on).

## The screen beside it

Start the screen (`neort.html`, or the gallery page) at the same minute the service's
`--start` names. Both run the prologue in 4.7 s and then 8 a second from the same clock, so
they show the same program within a second of each other all day; the screen's found column
and the paper on the floor are the same list.

## What is not decided

- **58 or 80 mm.** 58 mm is the till-roll register the work wants and fits a day on one roll;
  80 mm gives a 72 mm image and a more legible ticket. Print both test strips before choosing.
- **Cut.** Decided: the printer cuts, the ticket drops into the tray, and whoever is there
  takes it. `--nocut` keeps the continuous strip for a showing where nothing leaves the room.
- **Black or steel.** The housing in the Takis register is black; raw steel reads as kiosk
  hardware, which may be the more honest surface for a till printer.
