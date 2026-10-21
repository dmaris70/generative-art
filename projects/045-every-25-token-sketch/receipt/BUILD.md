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
for a champion that held the lane 200 programs or more (`--minhold`). Measured on the first
day at one program a second: 33 takeovers, 16 tickets, 1.5 m of paper. A ticket is 90.75 mm;
a roll lasts about two months; a year is about 6,000 tickets and 540 m, seven rolls. On 80 mm
paper (576 dots, 9 × 9 dots a pixel) a ticket is about 115 mm. `--fade 0.9992 --minhold 0`
prints as the screen selects.

## Bill of materials

| part | spec | note |
|---|---|---|
| printer | ESC/POS thermal, 58 mm (384 dots) or 80 mm (576 dots), 203 dpi, USB or Ethernet; e.g. Epson TM-T20III (80 mm) or a 58 mm kiosk mechanism with an ESC/POS board | a cutter is optional; without it the paper is one continuous strip, which is the point |
| controller | Raspberry Pi 4 or any small Linux box with Node ≥ 18 | runs `receipt.js` from boot (systemd unit below) |
| paper | thermal roll, 58 × 80 m or 80 × 80 m, phenol-free | one roll a day at 58 mm; print a test strip first: thermal papers differ in how they take a dither |
| housing | folded 2 mm steel, black, about 200 × 160 × 120 mm, open slot at the front for the paper, the printer's power and data at the back; wall bracket or plinth | the paper should fall freely to the floor; no tray, no basket |
| power | the printer's 24 V supply and a 5 V supply for the controller, one cable to the wall | |
| optional | a small amplifier and speaker if the room swallows the printer's own sound | the mechanism is usually loud enough |

## Running it

```
# a test strip, no hardware: the first 15 tickets as PNGs
node receipt.js --replay 2780 --png /tmp/strip

# a USB printer, locked to the room's clock, 58 mm paper
node receipt.js --device /dev/usb/lp0 --start 10:00

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
ExecStart=/usr/bin/node /opt/receipt/receipt.js --device /dev/usb/lp0 --start 10:00
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
- **Cut or continuous.** Continuous is the stronger object: one strip, the day's length. A cutter
  turns the found into separable tickets a visitor could take, which is a different work.
- **Black or steel.** The housing in the Takis register is black; raw steel reads as kiosk
  hardware, which may be the more honest surface for a till printer.
