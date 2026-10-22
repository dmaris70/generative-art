# Every 25-Token Sketch — a machine reading a library

## Construction specification for the relief

Issue 1. For a fabrication contract. Read with the drawings `elevation.svg`,
`section-a-a.svg`, `detail-pocket.svg`, `wiring.svg` and `address-map.svg` in this folder, and
with `DESIGN.md` (the design intent) and `../receipt/BUILD.md` (the printer). Where this
specification and those documents differ, this specification governs.

All dimensions in millimetres. Panel coordinates are measured from the top left corner of the
panel's face, x to the right, y downward, z toward the room.

---

## 1. The work in one paragraph

A black steel wall panel, 2000 × 1500 × 80 mm, carrying a machine: five flip-dot fields across
the top that show the last five programs of an enumeration, one a second; a larger flip-dot
field at the bottom left that holds the best picture found; a row of 28 digit wheels that
names the program; a thermal printer behind a slot that prints a ticket of each picture that
lasted into a pocket where it stands for a visitor to take; a brass ruler along the foot with a
pointer that marks the reading's place in the library; and a list of the library's 25 lengths
engraved in the face at the right. Everything is driven by one small computer behind the
panel, from software supplied by the artist.

## 2. Scope

**The contractor fabricates, assembles, wires, tests and installs:**

- the steel panel, its rear frame, its wall fixing and its finish, with all cut-outs and all
  engraving;
- the mounting of 36 flip-dot modules (supplied by the contractor against the specification in
  section 6, or free-issued by the artist if agreed) and the rim of the slow lane;
- the digit counter: 4 motorised and 24 fixed drums on a common axis;
- the receipt: printer bracket, chute, slot, pocket, sensor, roll access;
- the ruler: brass bar, pointer, belt axis, stepper, home switch;
- the controller bay: power supplies, time switch, controller, RS-485 adapter, motion board,
  all wiring to section 9;
- commissioning to the acceptance tests in section 12, in the contractor's workshop and again
  on the wall.

**The artist supplies:**

- the software: `controller.js`, `receipt.js`, their systemd units, and the Raspberry Pi
  image with them installed;
- the motion board firmware (ESP32), in `firmware/motion/` with its wiring table, calibration
  procedure and host test, to the serial protocol in section 8.5;
- the engraving artwork as vector files, generated from this specification;
- the wall label.

**Not in this contract:** the gallery wall's structural adequacy (to be confirmed by the
venue for 70 kg on a cleat), mains supply to the wall, the thermal paper beyond the first four
rolls, the spare printer.

## 3. General arrangement

| item | value |
|---|---|
| panel face | 2000 wide × 1500 high, 2 mm mild steel, folded 80 mm returns on all four sides |
| depth | the slab is 80 mm deep. Behind it a rear sub-frame 100 mm deep, inset 150 mm from the slab's edges on all sides, carries the cleat and the printer box, so the slab reads as an 80 mm slab with a 100 mm shadow gap to the wall; total projection 180 mm |
| rear frame | 40 × 40 × 3 steel angle, welded: a perimeter frame and two verticals at x = 700 and x = 1300, making three bays; 20 × 20 × 2 rails where the modules mount. The rear sub-frame: 40 × 40 × 3 angle, 1700 × 1200 × 100, welded to the rear frame, closed with 1.5 mm steel on its sides, open to the slab |
| wall fixing | French cleat, 3 mm steel, 1500 long on the sub-frame's rear face; the wall half on M8 anchors at 400 mm centres; two M6 anti-lift screws through the sub-frame's lower rail into blind nuts |
| weight | about 80 kg assembled (slab 40, sub-frame 10, modules 20, the rest 10) |
| finish | powder coat, matt black RAL 9005, fine texture, all visible steel inside and out; the brass bar clear-lacquered |
| engraving | laser-engraved into the coated face, 0.3 mm, filled white (two-part filler), or CNC-engraved 1 mm before coating and filled after: the list, the title, the ruler's numbers, "TAKE ONE" |
| hanging height | the panel's lower edge 900 mm above the floor (the ruler at 1,026 mm, the pocket at 1,728 mm, the lane's centre at 1,700 mm) |

See `elevation.svg` for the arrangement and `section-a-a.svg` for the depth.

## 4. Element schedule, with coordinates

| element | field or part | position (x, y of the top left corner) | cut-out in the face |
|---|---|---|---|
| conveyor tile 1 | 28 × 28 dots, 280 × 280 | 80, 80 | 292 × 292 at 74, 74 |
| conveyor tile 2 | 28 × 28 dots | 380, 80 | 292 × 292 at 374, 74 |
| conveyor tile 3 | 28 × 28 dots | 680, 80 | 292 × 292 at 674, 74 |
| conveyor tile 4 | 28 × 28 dots | 980, 80 | 292 × 292 at 974, 74 |
| conveyor tile 5 | 28 × 28 dots | 1280, 80 | 292 × 292 at 1274, 74 |
| slow lane | 58 × 58 dots, 580 × 580 | 80, 420 | 592 × 592 at 74, 414 |
| counter | 28 drums, 520 × 46 recess | 712, 452 | 520 × 46 at 712, 452 |
| receipt slot | 120 × 14 | 720, 560 | 120 × 14 at 720, 560, edges radiused 1 mm |
| pocket | 67 wide outside, 22 high, 8 deep | floor at y = 672, centred on x = 780 | two 3.2 mm holes for M3 countersunk at (752, 690) and (808, 690) |
| "TAKE ONE" | engraved, 11 pt | baseline y = 716, starting x = 762 | |
| the list | engraved block 560 × 560 | 1360, 780 (right edge at x = 1920) | |
| ruler bar | brass 1840 × 12 × 3 | 80, 1374 | the pointer's slot 1840 × 6 at 80, 1360 |
| ruler numbers 1 … 25 | engraved, 11 pt, centred under each tick | baseline y = 1404 | |
| title | engraved, 13 pt: EVERY 25-TOKEN SKETCH . A MACHINE READING A LIBRARY | baseline y = 1460, starting x = 80 | |

Dot pitch is 10 mm throughout; a 28-dot tile is 280 mm, the gap between tiles 20 mm; the lane,
58 dots, is exactly two tiles and their gap wide and flush with them.

## 5. The panel

1. Laser-cut the face from one sheet of 2 mm mild steel with all cut-outs of section 4, the
   pointer's slot, and 4.5 mm holes for the counter's bearing blocks, the pocket, the chute,
   and the earth stud. Fold the 80 mm returns; weld and dress the corners.
2. Fabricate the rear frame from 40 × 40 × 3 angle; weld it to the returns at 300 mm
   centres. Add 20 × 20 × 2 rails behind each module field at the module maker's hole pattern.
3. Fabricate the rear sub-frame, 1700 × 1200 × 100, from 40 × 40 × 3 angle and weld it to the rear frame inset 150 mm from the slab's edges; clad its four sides with 1.5 mm steel. Weld the panel half of the cleat to its rear face at y = 300 from the slab's top. The printer, the time switch, the supplies and the controller live in the sub-frame's depth; the modules, the counter, the chute, the pocket and the axis in the slab's.
4. Weld an M6 earth stud to the rear frame.
5. Provide a removable rear service hatch of 2 mm steel, 400 × 400, behind the printer bay
   (centred on x = 780, y = 620) on six M5 screws, for the paper roll. Provide a second hatch,
   400 × 300, behind the controller bay (x = 1600, y = 1200).
6. Powder coat the whole panel, the hatches, the chute and the pocket after all welding and
   drilling. Mask the earth stud.
7. Engrave the face after coating (laser, filled white) or before (CNC, filled after coating).
   The artwork is supplied as vector files: the list (section 10), the title, the ruler's
   numbers at the positions in section 7, and "TAKE ONE".

## 6. The flip-dot fields

**Modules.** AlfaZeta XY5 flip-dot modules, 28 × 7 dots, 10 mm pitch, white discs on black,
24 V DC, RS-485, or an equivalent with the same dot pitch, disc, and a documented serial
protocol. 36 modules:

- the conveyor: 20 modules, four per tile stacked vertically (28 wide × 28 high);
- the slow lane: 16 modules, two across by eight down (56 × 56), the core of the 58 × 58 field.

**The lane's rim.** The field is 58 dots square; the core of standard modules is 56. The outer
ring, one dot wide on each side (228 dots), is to be resolved with the module maker at the
first order, in this order of preference: (a) custom one-dot strips with the same disc and
drive, supplied by the module maker; (b) fixed discs in the same housing, set white or black by
hand to a pattern the artist supplies; (c) the 56 × 56 core centred in the 592 cut-out with a
10 mm black steel frame. The contractor quotes (a) and (c) and the artist decides.

**Mounting.** Every module sits with its disc plane 1 mm behind the face, on the rails,
through the module maker's fixing holes, so the dots fill the cut-out with no visible edge.
Tiles are aligned to ±0.5 mm so the dot grid is continuous across each tile.

**Addressing.** Set each module's DIP switches to the address in `address-map.svg`:
conveyor tile *i* (1 … 5), row *r* (0 at the top … 3): address = 4 (i − 1) + r, so 0x00 … 0x13;
lane column *c* (0 left, 1 right), row *r* (0 … 7): address = 0x20 + 8 c + r, so 0x20 … 0x2F.
Label each module's rear with its address.

**Bus.** One RS-485 daisy chain in address order, shielded twisted pair 24 AWG, A/B/GND, with
a 120 Ω terminator at the last module. Shield earthed at the adapter end only.

**Power.** 24 V DC, two branches (conveyor, lane), each from the bus bar on 1.5 mm² through a
10 A blade fuse, to each module on the maker's connector. The software refreshes one module at
a time, so the peak current stays under 4 A; the supply is sized for 14 A regardless.

## 7. The ruler

**Bar.** Brass, 1840 × 12 × 3 mm, engraved with 25 ticks (a 1.5 × 12 mm line each) at the
positions below, clear-lacquered, fixed to the face with M3 countersunk brass screws at 200 mm
centres so its top edge is at y = 1374. The numbers 1 … 25 are engraved in the face under the
ticks, centred, baseline y = 1404.

**Ticks.** Logarithmic: tick *n* at 1840 × log10(P<sub>n</sub>) / log10(P<sub>25</sub>) from the
bar's left end, where P<sub>n</sub> is the count of programs of 1 to *n* tokens:

| shelf | programs through this shelf | tick, mm from the bar's left end | mm from the panel's left edge |
|---|---|---|---|
| 1 | 5 | 47.7 | 127.7 |
| 2 | 25 | 95.4 | 175.4 |
| 3 | 250 | 163.6 | 243.6 |
| 4 | 2,500 | 231.9 | 311.9 |
| 5 | 28,125 | 303.6 | 383.6 |
| 6 | 328,125 | 376.4 | 456.4 |
| 7 | 3,984,375 | 450.4 | 530.4 |
| 8 | 4.98 x 10^07 | 525.3 | 605.3 |
| 9 | 6.33 x 10^08 | 600.6 | 680.6 |
| 10 | 8.17 x 10^09 | 676.4 | 756.4 |
| 11 | 1.07 x 10^11 | 752.7 | 832.7 |
| 12 | 1.41 x 10^12 | 829.1 | 909.1 |
| 13 | 1.88 x 10^13 | 905.8 | 985.8 |
| 14 | 2.52 x 10^14 | 982.8 | 1062.8 |
| 15 | 3.40 x 10^15 | 1059.9 | 1139.9 |
| 16 | 4.63 x 10^16 | 1137.3 | 1217.3 |
| 17 | 6.33 x 10^17 | 1214.8 | 1294.8 |
| 18 | 8.72 x 10^18 | 1292.5 | 1372.5 |
| 19 | 1.21 x 10^20 | 1370.5 | 1450.5 |
| 20 | 1.68 x 10^21 | 1448.4 | 1528.4 |
| 21 | 2.34 x 10^22 | 1526.5 | 1606.5 |
| 22 | 3.28 x 10^23 | 1604.7 | 1684.7 |
| 23 | 4.60 x 10^24 | 1683.0 | 1763.0 |
| 24 | 6.49 x 10^25 | 1761.4 | 1841.4 |
| 25 | 9.19 x 10^26 | 1840.0 | 1920.0 |

**Pointer.** A white-painted aluminium cone, 12 mm diameter at the base, 14 mm high, pointing
down, its tip 8 mm above the bar's top edge, carried on a 4 mm stem through the 6 mm slot at
y = 1360 … 1366.

**Axis.** A belt-driven linear axis behind the face, 2000 mm long: 20 × 40 aluminium V-slot
profile, a gantry plate on wheels, GT2 belt, NEMA 17 stepper (0.9°, 1.5 A), a microswitch at
the home end (x = 80). Travel 1840 mm from x = 80 to x = 1920, measured at the pointer's tip.
The stem is clamped to the gantry plate. Speed never exceeds 60 mm per minute in service; the
axis is homed at every power-up and then driven open loop, so repeatability of ±0.3 mm at the
tip is required and backlash is to be measured and reported.

## 8. The counter

**Drums.** 28 drums, 30 mm diameter × 16 mm wide, black anodised aluminium, the digits 0 … 9
around each rim 10 mm high in white, on a common axis at y = 475, z = 60, the drums at 18 mm
centres from x = 729 (drum 1, leftmost) to x = 1215 (drum 28). The visible face of each drum
shows through the 520 × 46 recess, one digit at a time, with 2 mm black spacers between drums.

**The 24 fixed drums** (1 … 24) are keyed to the shaft showing 0 and never turn.

**The 4 motorised drums** (25 … 28) each sit on a NEMA 11 stepper (1.8°, 0.67 A) through a
1 : 1 coupling, with an optical index (a slot in the drum's rim read by a transmissive sensor)
at the 0 position. Drum 28 steps once a second; drum 27 once in ten; drum 26 once in a hundred;
drum 25 once in a thousand. One step is 36° (a tenth of a turn), taken in 0.25 s.

**Shaft and bearings.** A 10 mm ground steel shaft in two flanged bearing blocks bolted
through the face at the recess's ends, the fixed drums pinned to it; the four motorised drums on
their own stub shafts, in line, their steppers on a bracket off the rear frame. Alignment of all
28 digit faces to ±0.3 mm in y.

### 8.5 The motion board and its protocol

An ESP32-DevKitC and five TMC2209 StepStick modules in sockets on a passive carrier PCB,
120 × 100 mm, specified net by net in `firmware/motion/carrier/README.md` and drawn in
`carrier.svg`: the terminals for the five motors, the 24 V input with its fuse, a 24 → 5 V buck
module, the four index headers with their pull-ups and the home switch header. The contractor
lays the board out from the netlist (any board house makes it) and the artist approves the
layout with the shop drawings; every active part is a stock module in a socket. The firmware
is in `firmware/motion/`; its README gives the pin assignment, the
driver addressing (drums on one UART at addresses 0 … 3, the ruler on a second), the pull-ups
the carrier must fit, and the calibration of the index and home offsets. It receives from the
controller, over USB serial at 115200 baud, one line per second of the form

```
program 0000000000000000000000000397 | pointer 298.123 mm | lane program 339 x / cos(y) | found 16 | distinct 7,265
```

and moves drums 25 … 28 to the last four digits of the program number (forward only, 9 rolling
to 0, one digit in 0.25 s) and the pointer to the millimetre position (at up to 1 mm/s), homing
all five axes at power-up. The firmware sets the driver currents over UART (run 0.6 A for the
drums, 1.2 A for the ruler; hold 8 % and 10 % of run, enough to keep a drum on its digit and the
belt still) and runs the drivers in stealthChop so the motors are silent. The contractor wires
the board to the README's table, builds and loads the firmware, and uses its `home`, `drum`,
`pointer`, `status` and `test` commands for acceptance tests 4 and 5; the measured index and
home offsets are entered in the firmware's calibration constants and recorded in the handover.

## 9. The receipt

**Printer.** Epson TM-T20III, USB model, 58 mm paper guide fitted, with its PS-180 24 V
adapter. It is 140 × 199 × 146 mm and does not fit the 80 mm slab: it sits on a shelf in the
rear sub-frame behind the slot, its mouth at z = 0 (the slab's rear plane), 78 mm behind the
face, at y = 552 … 566, the paper exiting horizontally toward the face into the chute. Roll access through the
rear hatch. Two spare rolls on clips inside the bay.

**Chute.** 1 mm folded mild steel, 62 mm inside width, 78 mm long from the printer's mouth at the slab's rear plane to the slot,
turning the paper 60° downward so that it leaves the slot heading down. All paper-touching
edges rolled or deburred. See `detail-pocket.svg`.

**Slot.** 120 × 14 in the face at 720, 560, edges radiused 1 mm.

**Pocket.** 1.5 mm folded mild steel: floor 67 × 8, front 67 × 22, sides 8 × 22, fixed to the
face with two M3 countersunk screws from the front and nuts behind, so that its floor is at
y = 672 (98 mm below the slot's lower edge). Its inside width is 64 mm. It holds one ticket
standing.

**Sensor.** A TCRT5000 reflective sensor module, lens up, let into the pocket's floor at
x = 800 through a 5 mm hole, wired to the controller (3.3 V, GND, DO to GPIO 17). Its trimmer
is set so DO is low with one sheet of thermal paper 3 mm above the lens and high with none.

**Paper.** 58 mm thermal rolls, 80 m, top-coated archival grade, phenol-free. Load the roll so
the paper curls toward the face.

## 10. The engraved list

Engraved in the face as a block 560 × 560 at x = 1360 … 1920, y = 780 … 1340, in a monospaced
face (IBM Plex Mono or equivalent), right-aligned to x = 1920; the header at 13 pt, baseline
y = 804; 25 rows at 14 pt, 18.2 mm apart, baselines from y = 846; the three columns right-aligned
at x = 1560, 1710 and 1920; the last line at 13 pt, baseline y = 1316.

```
THE LIBRARY . TOKENS . PROGRAMS . BEGINS TO PRINT
 1            5                DAY 1
 2           25                DAY 1
 3          250                DAY 1
 4        2,500                DAY 1
 5       28,125                DAY 1
 6      328,125                DAY 2
 7    3,984,375               DAY 16
 8   5.0 x 10^7              DAY 186
 9   6.3 x 10^8               YEAR 6
10   8.2 x 10^9              YEAR 80
11  1.1 x 10^11     1.0 x 10^3 YEARS
12  1.4 x 10^12     1.4 x 10^4 YEARS
13  1.9 x 10^13     1.8 x 10^5 YEARS
14  2.6 x 10^14     2.4 x 10^6 YEARS
15  3.5 x 10^15     3.2 x 10^7 YEARS
16  4.7 x 10^16     4.4 x 10^8 YEARS
17  6.5 x 10^17     6.0 x 10^9 YEARS
18  9.0 x 10^18    8.2 x 10^10 YEARS
19  1.2 x 10^20    1.1 x 10^12 YEARS
20  1.7 x 10^21    1.6 x 10^13 YEARS
21  2.4 x 10^22    2.2 x 10^14 YEARS
22  3.4 x 10^23    3.1 x 10^15 YEARS
23  4.8 x 10^24    4.3 x 10^16 YEARS
24  6.7 x 10^25    6.0 x 10^17 YEARS
25  9.5 x 10^26    8.5 x 10^18 YEARS
SIX OF THESE LINES WILL EVER BE TRUE FOR YOU
```

The artist supplies this as a vector file at 1 : 1.

## 11. Power, control and wiring

See `wiring.svg`.

| item | specification |
|---|---|
| mains inlet | IEC C14 with switch and fuse holder, fuse T6.3A, in the lower return at x = 1900; PE to the earth stud on 2.5 mm² green/yellow |
| time switch | DIN-rail digital time switch, 16 A, set to the venue's opening hours; it switches the 24 V supply and the printer's adapter; the 5 V supply and the controller stay on |
| 24 V supply | Mean Well LRS-350-24, set to 24.0 V, on the DIN rail; output to a bus bar; two 10 A blade-fused branches to the modules, one 5 A branch to the motion board |
| printer supply | the printer's own Epson PS-180 adapter, mains through the time switch |
| 5 V supply | Mean Well RS-15-5, always on, to the controller's USB power input |
| controller | Raspberry Pi Zero 2 W (or Pi 4 if the artist's image requires it) in a vented case on the DIN rail; USB hub (powered from the 5 V supply) to: the RS-485 adapter, the printer, the motion board |
| RS-485 adapter | FTDI-based USB to RS-485, isolated, with the bus's 120 Ω termination at the far end only |
| motion board | ESP32 with five TMC2209 drivers on a carrier, 24 V in, USB to the controller |
| sensor | TCRT5000 module: 3.3 V, GND, DO to GPIO 17 (BCM) on 3 × 0.25 mm² |
| cabling | 24 V on 1.5 mm²; steppers on 4 × 0.5 mm²; sensors on 0.25 mm²; RS-485 on shielded twisted pair 24 AWG; all on adhesive mounts in the rear bays, kept 100 mm from the module coil sides; a service loop at the printer |
| labels | every cable labelled at both ends with the schedule's reference; every module with its address |

**Energy.** The relief idles at about 50 W with the modules powered and draws about 65 W while
the conveyor flips; it draws nothing but the controller's 1 W outside opening hours. The
contractor measures and reports the actual standby draw of the modules as part of acceptance
test 9.

## 12. Acceptance tests

Performed in the workshop with the artist's software running, and repeated on the wall.

1. **Every dot.** Each of the 7,420 dots (plus the rim) flips to white and to black on
   command; no dead, stuck or slow disc. A test pattern of all-white, all-black, and a
   checkerboard on every module, photographed.
2. **Addresses.** Each module responds to its address only; the test pattern walks the
   addresses 0x00 … 0x2F in order and the fields fill in the sequence of `address-map.svg`.
3. **A day.** The enumeration runs 8 hours at one program a second with no missed frame and no
   module dropping off the bus; the controller's log shows one frame per second throughout.
4. **The counter.** At program 397 the drums read 0 … 0 3 9 7; a step takes 0.25 s; the drums
   home to 0 … 0 at power-up; the digits align to ±0.3 mm.
5. **The pointer.** Homed, then driven to the positions in section 7 for ticks 5, 7, 9 and 25;
   each within ±0.5 mm of the engraved tick; repeat after 10 cycles.
6. **The receipt.** Ten tickets printed from `receipt.js --taken 20`: each is fully cut, drops
   into the pocket, stands picture up and face out, and is legible; the sensor reports present
   with a ticket and empty without; the next prints 3 s after the ticket is removed; no ticket
   jams in the chute in 100 consecutive prints.
7. **Sound.** The panel is heard but not loud: the lane's flip measured under 70 dB(A) at 1 m.
8. **Time switch.** The 24 V supply and the printer switch off at the set hour; the dots hold
   their state; the controller resumes at the right program at opening.
9. **Power.** Draw measured at the inlet: idle with modules on, flipping, and after hours;
   reported with the module maker's standby figure.
10. **Finish and safety.** No sharp edges; earth continuity from the inlet PE to the face
    under 0.1 Ω; the cleat loaded to 150 kg on the test wall; the finish without runs or thin
    spots at 1 m.

## 13. Materials and equipment

| item | qty | specification | indicative source |
|---|---|---|---|
| mild steel sheet | 1 | 2 mm, 2200 × 1700 for the face; 2 mm for hatches | stock |
| steel angle | 12 m | 40 × 40 × 3 | stock |
| steel box section | 8 m | 20 × 20 × 2 rails | stock |
| flip-dot modules | 36 | AlfaZeta XY5 28 × 7, 10 mm pitch, white on black, RS-485 | AlfaZeta, Łódź; or Flipdots |
| lane rim | 1 set | per section 6, option (a), (b) or (c) | the module maker |
| brass bar | 1 | 1840 × 12 × 3, engraved | engraver |
| digit drums | 28 | 30 × 16 aluminium, black anodised, white digits; 24 fixed, 4 with index slot | machined |
| shaft and bearings | 1 set | 10 mm ground shaft, 2 flanged bearing blocks, 4 stub shafts, couplings | Misumi or equivalent |
| steppers, counter | 4 | NEMA 11, 1.8°, 0.67 A | stock |
| index sensors | 4 | transmissive optical, slot type | stock |
| linear axis | 1 | 2000 mm 20 × 40 V-slot, gantry plate, GT2 belt and pulleys, idler | OpenBuilds or equivalent |
| stepper, ruler | 1 | NEMA 17, 0.9°, 1.5 A | stock |
| home switch | 1 | microswitch with roller lever | stock |
| pointer | 1 | aluminium cone 12 × 14, white, 4 mm stem | machined |
| printer | 1 | Epson TM-T20III USB, with PS-180 adapter, 58 mm guide | Epson reseller |
| thermal paper | 4 rolls | 58 mm × 80 m, archival, phenol-free | paper merchant |
| chute | 1 | 1 mm folded steel, 62 inside | with the panel |
| pocket | 1 | 1.5 mm folded steel, 64 inside, 8 deep, 22 front | with the panel |
| sensor | 1 | TCRT5000 reflective module | stock |
| controller | 1 | Raspberry Pi Zero 2 W, 32 GB card, vented case | stock |
| USB hub | 1 | powered, 4 port | stock |
| RS-485 adapter | 1 | USB to RS-485, FTDI, isolated | stock |
| motion board | 1 | the carrier PCB of `firmware/motion/carrier/README.md` with ESP32-DevKitC, 5 × BIGTREETECH TMC2209 V1.3, Pololu D24V22F5 buck, terminals, headers; under 60 EUR in parts plus the board | board house + stock |
| 24 V supply | 1 | Mean Well LRS-350-24 | stock |
| 5 V supply | 1 | Mean Well RS-15-5 | stock |
| time switch | 1 | DIN digital, 16 A, battery backed | stock |
| mains inlet | 1 | IEC C14 with switch and fuse holder, T6.3A fuse | stock |
| DIN rail, bus bar, fuses | 1 set | 35 mm rail 400 mm, 24 V bus bar, 10 A and 5 A blade fuses and holders | stock |
| cable | 1 set | 1.5 mm², 0.5 mm², 0.25 mm², shielded twisted pair 24 AWG, labels, mounts | stock |
| cleat | 1 | 3 mm steel, two halves, M8 anchors × 5, M6 anti-lift × 2 | with the panel |
| powder coat | 1 | RAL 9005 matt fine texture | coater |
| engraving | 1 | laser, filled white: the list, title, numbers, "TAKE ONE" | engraver |

The flip-dot modules are the largest cost line by far; the rim's option decides the second.
Everything else is stock.

## 14. Programme

| step | duration | note |
|---|---|---|
| 1. two modules bought and driven with `controller.js`; the rim option quoted; standby current measured | 2 weeks | the one step with uncertainty; the artist attends |
| 2. shop drawings for the panel and the counter, approved by the artist | 2 weeks | |
| 3. modules, axis, printer, drums ordered | 6 to 8 weeks lead | |
| 4. panel fabricated, coated, engraved | 4 weeks | overlaps step 3 |
| 5. assembly, wiring, bench run with the artist's software; motion firmware loaded | 3 weeks | |
| 6. acceptance tests in the workshop | 1 week | |
| 7. delivery, hanging, tests on the wall, handover | 1 week | |

About 16 to 20 weeks. The risks are the module lead time and price, the rim, and the panel's
weight on the venue's wall.

## 15. Handover

The contractor delivers with the work: the as-built drawings, the wiring schedule as installed,
the module addresses as set, the measured figures from tests 5, 7 and 9, the printer's and the
module maker's documentation, two spare modules if the maker's minimum order allows, and the
keys to the hatches. The artist delivers the software, the firmware source, and the wall label.
