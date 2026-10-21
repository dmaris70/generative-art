# The relief: a machine reading a library — design

Stage 3 of Every 25-Token Sketch in the room. A black steel panel and a bookcase. The panel
carries the machine: flip-dot fields that show the programs as they are read, a counter that
names the program, a printer that keeps the found, a ruler that places the reading in the
library. The bookcase holds what the printer keeps, shelf by shelf, and stays mostly empty.

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
| the slow lane | one flip-dot field of 56 × 56 dots, the champion, dithered; changes hands when a better unrepeated picture arrives, its claim fading as on the screen | 560 × 560 mm |
| the program | 28 electromechanical digit wheels showing the program number with leading zeros; the last 24 wheels never turn | 504 × 30 mm |
| the receipt | the stage-2 printer behind the panel, its slot in the face, the paper falling free to the floor | 58 mm slot |
| the library | a brass bar engraved with the 25 shelves on a log scale, a pointer on a lead screw at the current program; it advances by a hair a day and sits at the far left for all time | 1840 mm travel |
| engraving | the element names, in the panel's own voice: "THE CONVEYOR . THE LAST FIVE PROGRAMS, ONE A SECOND", "THE PROGRAM . 28 WHEELS . THE LAST 24 NEVER TURN" | 13 pt, filled white |

Layout: the conveyor across the top; the slow lane below it at the left; the counter, the
receipt slot and the paper to its right; the ruler along the foot. See `elevation.svg`.

## The bookcase, 600 × 1500 × 250 mm

Twenty-five shelves, labelled 1 to 25 with each shelf's count of programs (5, 25, 250, 2,500,
28,125, 328,125, 3,984,375, …, 9.5 × 10²⁶). The printed found from the receipt are torn off and
filed on the shelf of their length. Shelves 1 to 6 fill during an exhibition day. Shelf 7 is
labelled "fills in the 7th day", shelf 8 "in the 3rd month", 9 "in 7 years", 10 "in 89
years", 25 "in 2.9 × 10¹⁷ years". Shelves 7 to 25 stay empty. The bookcase is the piece's
claim as furniture.

## Behaviour

- One program a second: flip-dots settle in about 30 ms, but one a second is what a person can
  follow, and the sound of five fields flipping at once is the enumeration heard.
- At one a second a 6.5 h day reads 23,400 programs, into the fifth shelf; about 100 takeovers.
- The slow lane changes with a visible flip of 3,136 dots; the printer fires at the same moment.
- The counter steps once a second; the pointer moves 0.15 mm an hour at the current shelf.
- Outside the room's hours the machine rehearses from program 1, as the screen does.

## Bill of materials

| part | quantity | spec | cost band |
|---|---|---|---|
| flip-dot modules | 36 | AlfaZeta XY5 or equivalent, 28 × 7 dots, 10 mm pitch, RS-485; 20 for the conveyor (four a tile), 16 for the slow lane (two across, eight down) | high: the largest line |
| digit wheels | 28 | electromechanical or stepper-driven 18 mm wheels, 0 to 9, white on black; the last 24 can be fixed wheels showing 0 | mid |
| printer | 1 | the stage-2 unit, mounted behind the slot | low |
| ruler | 1 | brass bar 1840 × 12 mm, engraved; lead screw, stepper, limit switch | mid |
| controller | 1 | Linux box with Node, an RS-485 adapter, a stepper board | low |
| panel | 1 | folded 2 mm steel, 2000 × 1500 mm, black, with cut-outs and a rear frame; wall-hung on a French cleat; about 60 kg with modules | mid |
| bookcase | 1 | steel or black-stained oak, 600 × 1500 × 250, 25 shelves, engraved labels | mid |
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
5. The bookcase, engraved; the wall label.

Four to six months. Risks: module lead time and price; the panel's weight on the wall; the
wheels' sourcing (stepper-driven wheels from a signage maker are the fallback).

## The wall label

> Every 25-Token Sketch — a machine reading a library. A fifteen-symbol pixel language defines
> a library of programs of one to twenty-five tokens. The machine reads it in order, shortest
> first, one program a second, and shows the last five. A selector with a stated preference
> holds one picture longer; when it lets go, the printer keeps it, and it is filed on the shelf
> of its length. The counter names the program; its last twenty-four wheels will never turn.
> The pointer on the ruler marks the reading's place in the library and will not leave the
> left end. The shelves above the sixth are empty, and labelled with the year they would begin
> to fill. Nothing here is a signal from outside: every dot is a count from inside the machine.
