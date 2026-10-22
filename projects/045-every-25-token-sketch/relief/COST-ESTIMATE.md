# Cost estimate for the relief

Indicative, before any quote, in EUR excluding VAT, shipping and duties. Not part of the
contractor's pack (`tools/relief-pack.sh` leaves it out), so that quotes are not anchored on it.
Sources: the pack's bill of materials; flip-dot module prices from public posts (an AlfaZeta
14 × 28 at about 500 EUR incl. VAT, so a 28 × 7 at about half); the Epson TM-T20III at
140 to 300 depending on market; everything else at catalogue prices. Labour at 65 to 95 EUR
an hour, the range between a metal fabricator and a kinetic-art studio.

## Parts

| item | low | high | basis |
|---|---|---|---|
| flip-dot modules, 36 | 7,200 | 9,000 | 200 to 250 each; the one price that decides the total |
| the lane's rim | 300 | 3,000 | option (c) a steel frame, or (a) custom one-dot strips |
| spare modules, 2 | 400 | 500 | |
| steel: 2 mm sheet, angle, rails, sub-frame, hatches, cleat | 500 | 800 | material and laser cutting |
| powder coat, face with returns, sub-frame, hatches, chute, pocket | 500 | 900 | |
| engraving, face and brass bar, filled white | 600 | 1,200 | laser; the bar 80 in brass |
| counter: 28 drums machined and anodised, shaft, bearings, couplings, 4 steppers, 4 index sensors | 1,500 | 2,100 | 40 to 60 a drum |
| ruler axis: 2 m V-slot kit, NEMA 17, home switch, pointer | 250 | 400 | |
| printer, adapter, 58 mm guide; a spare; four rolls | 450 | 650 | |
| controller: Pi Zero 2 W, card, case, hub, RS-485 adapter | 100 | 140 | |
| motion board: carrier PCB, ESP32, 5 drivers, buck, connectors, assembly | 150 | 250 | |
| power: 24 V and 5 V supplies, time switch, inlet, DIN, fuses, bus bar | 200 | 260 | |
| cable, connectors, labels, mounts, fasteners | 250 | 400 | |
| **parts** | **12,400** | **19,600** | |

## Labour, about 300 hours

| step | hours | low | high |
|---|---|---|---|
| step 1: two modules driven, protocol verified, standby measured, rim quoted | 20 | 1,300 | 1,900 |
| shop drawings, carrier PCB layout, engraver's files | 30 | 2,000 | 2,900 |
| panel: cut, fold, weld, rear frame, sub-frame, hatches, cleat | 50 | 3,300 | 4,800 |
| counter mechanism built and aligned to ±0.3 mm | 40 | 2,600 | 3,800 |
| modules mounted, addressed, bus and power wired | 40 | 2,600 | 3,800 |
| axis, printer, chute, pocket, sensor, electrics bay | 40 | 2,600 | 3,800 |
| firmware built and loaded, bring-up, calibration, software commissioning | 30 | 2,000 | 2,900 |
| the ten acceptance tests, documentation, as-built | 30 | 2,000 | 2,900 |
| crate, delivery, hanging, tests on the wall | 20 | 1,300 | 1,900 |
| **labour** | **300** | **19,700** | **28,700** |

## Total

| | low | high |
|---|---|---|
| parts and labour | 32,100 | 48,300 |
| contractor's overhead and margin, 15 % | 4,800 | 7,200 |
| contingency, 10 % (the rim, the module price, the wall) | 3,700 | 5,600 |
| **estimate, ex VAT** | **40,600** | **61,100** |

A single figure for planning: **about 50,000 EUR ex VAT**, of which the flip-dot modules are a
fifth and labour three fifths. A kinetic-art studio quoting turnkey is likely at the top of the
range or above it; a fabricator with an electronics partner nearer the bottom.

Not included: VAT; shipping and duties on the modules (Poland to the venue); the venue's
wall and mains; insurance; a crate for storage between showings (about 1,500); the artist's
time.

## Where the money can move

| change | saving | cost to the piece |
|---|---|---|
| rim option (c), the 56 × 56 core in a frame | up to 2,700 | a 10 mm black frame around the lane instead of a continuous dot field |
| drop the conveyor: 16 modules, the lane, counter, receipt and ruler only | 5,500 in modules, about 40 hours | the five changing pictures are gone; the screen beside it shows them |
| three conveyor tiles instead of five | 1,900 in modules, 15 hours | three pictures |
| the 24 fixed drums as printed cylinders, not machined anodised | 700 | the fixed digits differ in surface from the moving four |
| one contractor for metal and electronics | 10 to 15 % of labour | fewer firms able to quote |

## Operating cost, a year

Electricity about 35 EUR at the room's hours; paper about 20 EUR for seven rolls; no ink, no
service. Under 60 EUR. The spare printer and two spare modules are in the build price.
