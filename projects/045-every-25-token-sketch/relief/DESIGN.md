# The relief: a machine reading a library — design

Stage 3 of Every 25-Token Sketch in the room. A black steel panel. The panel
carries the machine: flip-dot fields that show the programs as they are read, a counter that
names the program, a printer that keeps the found, a ruler that places the reading in the
library. Beside the slot a tray takes the cut tickets, and a plate lists the library's
lengths.

Everything on the panel is driven by the unchanged `babel.js`, the same enumeration as the
screen and the receipt, at one program a second. The relief, the screen and the receipt can
run side by side on one clock and show the same program.

## The decision the simulator forced

Flip-dots have no grey. `tile-test.png` renders eight of the found at 14, 21, 28 and 56 dots,
thresholded and dithered. Dithered tiles below 56 dots read as noise; thresholded tiles read
as pictures from 28 dots, as marks at 14. So the conveyor is **the last five programs at
28 × 28 dots, thresholded**, not twenty-five at 14 × 14: five legible pictures over twenty-five
illegible ones. The slow lane is **56 × 56 dots, ordered-dithered**, where grey returns. The
simulator (`simulator.html`) runs both; `?tiles=25` shows the rejected layout.

## The panel, 2000 × 1500 mm

| element | what it is | size |
|---|---|---|
| the conveyor | five flip-dot fields of 28 × 28 dots, the last five programs, oldest left, one new program a second; thresholded | five × 280 × 280 mm at 10 mm pitch, 20 mm apart |
| the slow lane | one flip-dot field of 56 × 56 dots, the champion, dithered; changes hands when a better unrepeated picture arrives, its claim fading by 0.9999 a program | 560 × 560 mm |
| the program | 28 electromechanical digit wheels showing the program number with leading zeros; the last 24 wheels never turn | 504 × 30 mm |
| the receipt | the stage-2 printer behind the panel, its slot in the face, a steel tray beneath; the printer cuts, the ticket drops, whoever is there takes it | 58 mm slot, 140 × 100 × 50 mm tray |
| the plate | engraved steel at the bottom right of the grid, a square of the slow lane's size: the 25 lengths, their counts, the day or year each begins to print | 560 × 560 mm |
| the library | a brass bar engraved with the 25 shelves on a log scale, a pointer on a lead screw at the current program; it advances by a hair a day and sits at the far left for all time | 1840 mm travel |
| engraving | the element names, in the panel's own voice: "THE CONVEYOR . THE LAST FIVE PROGRAMS, ONE A SECOND", "THE PROGRAM . 28 WHEELS . THE LAST 24 NEVER TURN" | 13 pt, filled white |

Layout, on the conveyor's grid of 280 mm squares: the conveyor across the top; below it the
slow lane at the left and the plate at the right, each a square of two tiles; between them the
counter and the receipt slot with its tray; the ruler along the foot. See `elevation.svg`.

## The plate and the tray, in place of a bookcase

The tickets leave the room: the printer cuts, the ticket drops into a steel tray under the
slot, and whoever is there takes it. So there is no archive to shelve. What the bookcase was to
say — that the library has 25 lengths, each about ten times the last, and that the machine
will print from only the first few — is said by an engraved steel plate, 560 × 560 mm, the
slow lane's size, at the bottom right of the grid where the slow lane is at the bottom left:
the 25 lengths, their counts, and the day or year each begins to print at one program a
second, 6.5 hours a day. The picture the machine holds and the list of what it will never
reach face each other across the panel.

| tokens | programs | begins to print |
|---|---|---|
| 1 | 5 | DAY 1 |
| 2 | 25 | DAY 1 |
| 3 | 250 | DAY 1 |
| 4 | 2,500 | DAY 1 |
| 5 | 28,125 | DAY 1 |
| 6 | 328,125 | DAY 2 |
| 7 | 3,984,375 | DAY 16 |
| 8 | 5.0 x 10^7 | DAY 186 |
| 9 | 6.3 x 10^8 | YEAR 6 |
| 10 | 8.2 x 10^9 | YEAR 80 |
| 11 | 1.1 x 10^11 | 1.0 x 10^3 YEARS |
| 12 | 1.4 x 10^12 | 1.4 x 10^4 YEARS |
| 13 | 1.9 x 10^13 | 1.8 x 10^5 YEARS |
| 14 | 2.6 x 10^14 | 2.4 x 10^6 YEARS |
| 15 | 3.5 x 10^15 | 3.2 x 10^7 YEARS |
| 16 | 4.7 x 10^16 | 4.4 x 10^8 YEARS |
| 17 | 6.5 x 10^17 | 6.0 x 10^9 YEARS |
| 18 | 9.0 x 10^18 | 8.2 x 10^10 YEARS |
| 19 | 1.2 x 10^20 | 1.1 x 10^12 YEARS |
| 20 | 1.7 x 10^21 | 1.6 x 10^13 YEARS |
| 21 | 2.4 x 10^22 | 2.2 x 10^14 YEARS |
| 22 | 3.4 x 10^23 | 3.1 x 10^15 YEARS |
| 23 | 4.8 x 10^24 | 4.3 x 10^16 YEARS |
| 24 | 6.7 x 10^25 | 6.0 x 10^17 YEARS |
| 25 | 9.5 x 10^26 | 8.5 x 10^18 YEARS |

Six lines of the plate will ever be true for a visitor. The rest are the point.

## Behaviour

- One program a second: flip-dots settle in about 30 ms, but one a second is what a person can
  follow, and the sound of five fields flipping at once is the enumeration heard.
- At one a second a 6.5 h day reads 23,400 programs, into the fifth shelf. The relief's
  selector fades the champion's claim by 0.9999 a program (the screen's is 0.9992), so the
  lane changes hands 33 to 50 times a day instead of 100 to 160; the printer keeps only a
  champion that held the lane 200 programs or more: 16 and 21 tickets, 1.5 and 1.9 m of paper
  on the first two days (measured).
  Under the screen's rule the sixth shelf would need 15 m of shelving within a month; under
  the room's rule it holds a year.
- The slow lane changes with a visible flip of 3,136 dots; the printer fires at the same moment.
- The counter steps once a second; the pointer moves 0.15 mm an hour at the current shelf.
- The seventh shelf begins to print on day 16, the eighth on day 186, the ninth in year 6.
- Outside the room's hours the machine rehearses from program 1, as the screen does.
- Maintenance is a roll of paper every two months and a spare printer on a shelf; see
  `../receipt/BUILD.md`.

## Bill of materials

| part | quantity | spec | cost band |
|---|---|---|---|
| flip-dot modules | 36 | AlfaZeta XY5 or equivalent, 28 × 7 dots, 10 mm pitch, RS-485; 20 for the conveyor (four a tile), 16 for the slow lane (two across, eight down) | high: the largest line |
| digit wheels | 28 | electromechanical or stepper-driven 18 mm wheels, 0 to 9, white on black; the last 24 can be fixed wheels showing 0 | mid |
| printer | 1 | the stage-2 unit, mounted behind the slot | low |
| ruler | 1 | brass bar 1840 × 12 mm, engraved; lead screw, stepper, limit switch | mid |
| controller | 1 | Linux box with Node, an RS-485 adapter, a stepper board | low |
| panel | 1 | folded 2 mm steel, 2000 × 1500 mm, black, with cut-outs and a rear frame; wall-hung on a French cleat; about 60 kg with modules | mid |
| plate and tray | 1 each | engraved 3 mm steel plate 560 × 560 mm; folded steel tray 140 × 100 × 50 mm, deep enough for a ticket to lie flat | low |
| power | 1 | 24 V for the modules, 24 V for the printer, 12 V for the steppers, one mains cable | low |

The module count is the budget. Halving the conveyor to three tiles saves eight modules and
keeps the pictures; dropping the conveyor altogether and keeping the slow lane, the counter,
the receipt and the ruler is a 16-module relief that still reads as the machine.

## Software

- `controller.js` runs the enumeration and drives the modules: `--serial /dev/ttyUSB0` for
  the RS-485 bus, `--simulate` for a text rendering, `--start 10:00` to lock to the clock. It
  prints the counter and pointer targets each second for the motion board.
- `simulator.html` is the relief on a screen, at one millimetre a unit, driven by the same
  code; `?at=N` stills, `?rate=8` for a day's pace.
- The stage-2 `receipt.js` runs beside it with the same `--start`.
- Address map for the modules is in `controller.js`; set the panels' DIP switches to match.
  Verify the frame command bytes against the datasheet of the modules bought.

## Fabrication, in order

1. Buy two flip-dot modules and run `controller.js --serial` against them: the frame format,
   the refresh rate, the sound. Two weeks.
2. Print the conveyor and slow lane at 1:1 on paper and pin them to a wall at the panel's
   height; look from three metres. Adjust the tile count. One day.
3. Order the modules, the wheels, the steel. Six to eight weeks' lead.
4. Assemble on the rear frame; wire the bus; run a day on the bench with the printer. Two weeks.
5. The plate, engraved; the tray; the wall label.

Four to six months. Risks: module lead time and price; the panel's weight on the wall; the
wheels' sourcing (stepper-driven wheels from a signage maker are the fallback).

## The wall label

> Every 25-Token Sketch — a machine reading a library. A fifteen-symbol pixel language defines
> a library of programs of one to twenty-five tokens. The machine reads it in order, shortest
> first, one program a second, and shows the last five. A selector with a stated preference
> holds one picture longer; when it lets go of one it kept long enough, the printer prints it
> and lets it go: take it. The counter names the program; its last twenty-four wheels will
> never turn. The pointer on the ruler marks the reading's place in the library and will not
> leave the left end. The plate lists the twenty-five lengths of the library and the day or
> year each begins to print; six of its lines will ever be true for you. Nothing here is a
> signal from outside: every dot is a count from inside the machine.
