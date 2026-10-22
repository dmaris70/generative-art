# Handing the relief to a contractor

How to give the work to a fabrication company: what to send, in what order, what to ask for,
what to approve, and what to hold back. The pack itself is the folder structure below, zipped
by `tools/relief-pack.sh`.

## 1. The pack

| folder | file | what it is | who uses it | status |
|---|---|---|---|---|
| 00 | `HANDOVER.md` (this file), section 4 as the cover letter | the instructions to tenderers | the contractor's estimator | ready |
| 01 | `CONSTRUCTION.md` | the specification; it governs over everything else | everyone | Issue 1, ready to tender; Issue 2 after step 1 |
| 02 | `elevation.svg` | the face, 1:1, every element dimensioned | metalwork | ready |
| 02 | `section-a-a.svg` | the depth: slab, sub-frame, cleat, chute, pocket | metalwork | ready |
| 02 | `detail-pocket.svg` | the chute, slot, pocket and sensor at 4:1 | metalwork, electronics | ready |
| 02 | `wiring.svg` | the power and signal schematic | electronics | ready |
| 02 | `address-map.svg` | which flip-dot module goes where, with its address | electronics | ready |
| 02 | `carrier.svg` + `firmware/motion/carrier/README.md` | the motion board PCB: sockets, netlist, parts | electronics, the board house | ready; the layout is the contractor's, approved by you |
| 02 | the same five as `.png` | for reading on screen | everyone | ready |
| 03 | `engraving-face.svg` | the engraved text on the face, 1:1, as text with the font named | the engraver | ready; the engraver converts to outlines and returns a proof |
| 03 | `engraving-ruler.svg` | the 25 ticks on the brass bar, 1:1 | the engraver | ready |
| 04 | `DESIGN.md` | the design intent and the reasoning behind each decision | everyone, for understanding; it does not govern | ready |
| 04 | `model.png`, `model-receipt.png`, `model-plate.png`, `simulator.png` | what it should look like | everyone | ready |
| 04 | `model.html` | the 3D model, opens in a browser, runs the real enumeration with sound | the contractor's designer | ready |
| 05 | `../babel.js`, `controller.js`, `simulator.html` | the enumeration and the flip-dot driver; used in step 1 on the bench | electronics | ready; the frame bytes to be verified against the module datasheet |
| 05 | `../receipt/receipt.js`, `../receipt/BUILD.md` | the printer software and its build sheet | electronics | ready |
| 06 | `firmware/motion/` | the motion board firmware, its host test, its README | electronics | ready; compiled by the contractor on the ESP32 toolchain |

What is deliberately not in the pack: prices, the venue's name, the ticket's function, the
wall label's final text, and the signing secret for the tickets. The first is the
contractor's to supply, the rest are yours and come later.

## 2. The procedure

**A. Choose whom to ask.** A company that does both folded-steel fabrication and electronics
integration, or two: a metal fabricator (signage and exhibition builders do this well) and an
electronics integrator (a kinetic-art or interactive-installation studio). Two or three quotes.
Ask each to name the person who will build it, not the person who sells it.

**B. Send the pack with the cover letter** (section 4) and a date for the quote, three weeks
out. Make the pack private: it describes the work before it exists.

**C. Hold a one-hour call with each tenderer after they have read it.** The questions that
matter are in section 5. Listen for whether they have driven flip-dot modules before, and
whether they want to change the design to suit their shop (they may propose; you decide).

**D. Commission step 1 on its own, before the main contract**, at a fixed price: two flip-dot
modules bought and driven with `controller.js`, the frame format verified, the standby current
measured, the lane's rim quoted in its three options, the module lead time and price confirmed
in writing. Two weeks. You attend the bench session. The result is Issue 2 of the
specification with the vendor's numbers in it, and a price the contractor can stand behind.

**E. The main contract.** Scope as CONSTRUCTION.md section 2; acceptance as section 12; the
specification as a contract document, with the drawings and the firmware; a programme per
section 14 with dates. Payment against milestones: 30 % on order, 30 % when the modules are
delivered to the contractor's shop, 30 % on workshop acceptance, 10 % on acceptance on the
wall. Twenty-four months' warranty on workmanship; the modules and the printer on their
makers' terms. Two spare modules and a spare printer in the price. The software and firmware
licensed to the contractor for building and commissioning only. The contractor certifies the
mains assembly to the applicable electrical safety rules for the venue's country and earths
the panel as drawn. Insurance in transit and on site.

**F. Your approvals, in order.** The shop drawings (step 2 of the programme): the panel,
the sub-frame, the counter, the carrier PCB layout. The engraver's proof. The powder-coat
sample. A visit at the bench run (step 5) before the acceptance tests. Keep each approval to
a written yes with a date.

**G. Acceptance.** The ten tests of section 12, performed in the workshop with you present,
then again on the wall. The handover documents of section 15 are a condition of the final
payment.

## 3. What the contractor may and may not change

**Fixed:** every coordinate in the element schedule; the dot pitch and the field sizes; one
program a second; the engraved text and its positions; the panel's outer size and the 80 mm
slab; the black; the brass; the pocket's behaviour (one ticket, standing, picture up, the next
when taken); the ruler's log scale and travel.

**The contractor may propose, for your decision:** the sub-frame's exact depth and fixings;
the module maker (if equivalent in pitch, disc and protocol); the counter's drum mechanism
(stepper drums as specified, or a signage maker's wheels of the same face); the belt axis
hardware; the chute's fold; the board house for the carrier; the fasteners and finishes
inside; the order of assembly.

**The contractor must not:** change the software or firmware without sending the change back;
substitute a non-thermal printer; add any visible fixing, label, vent or logo to the face;
leave any cable visible; hang the panel on anything but the cleat as drawn.

## 4. The cover letter

> Subject: Every 25-Token Sketch — a machine reading a library: invitation to quote
>
> Please find attached the construction pack for a wall-hung kinetic relief, 2000 × 1500 mm,
> in folded black steel, carrying 36 flip-dot modules, a 28-wheel digit counter, a thermal
> printer with a ticket pocket, a brass ruler with a motorised pointer, and engraved text. The
> specification (01/CONSTRUCTION.md) governs; the drawings (02), the engraving artwork (03),
> the design notes and model (04), the software (05) and the motion board firmware (06)
> support it.
>
> We ask for, by [date]:
> 1. a price broken down by the sections of the specification's bill of materials
>    (section 13), with labour shown separately from parts;
> 2. a separate fixed price for step 1 of the programme (section 14): two flip-dot modules
>    bought and driven with our software, the standby current measured, the lane's rim quoted
>    in its three options, the module maker's lead time and price confirmed;
> 3. your programme against section 14, with the module lead time as you have it from the
>    maker;
> 4. your exclusions and assumptions, and anything in the specification you would change and
>    why;
> 5. the name and experience of the person who would build it, and one reference for a
>    comparable piece with motors or displays in it;
> 6. confirmation that you will certify the mains assembly for use in [country].
>
> The pack is confidential. Please do not forward it beyond those who need it to quote.
> Questions in writing to [contact]; a one-hour call will be offered to each tenderer after
> the pack has been read.

## 5. Questions for the call

1. Have you driven flip-dot modules before? Which maker? Over what bus?
2. Who lays out the carrier PCB, and which board house do you use?
3. How will you hold the 28 digit faces to ±0.3 mm in a line?
4. How will you guarantee the paper never jams in the chute: what will you test, and how many
   tickets?
5. What is your powder coater's largest bed, and will the 2000 × 1500 face with its returns
   fit in one piece?
6. Who at the venue will you need, and when, for the wall and the mains?
7. What would you change, and what would it save?

## 6. After the contract

Keep the repository as the record: every approved shop drawing, the engraver's proof, the
measured offsets, the as-built wiring schedule and the module addresses go into
`relief/as-built/` as they arrive. Issue 2 of the specification is written after step 1;
Issue 3 as built, at handover.
