# construction drawings for the relief: a section, the pocket and chute detail, the wiring
# schematic, the module address map. python3 tools/relief-drawings.py <outdir>
import math, sys, os
out = sys.argv[1] if len(sys.argv) > 1 else '.'
F = 'font-family="ui-monospace,Menlo,monospace"'
CUM = [0] + [5, 25, 250, 2500, 28125, 328125, 3984375, 4.98e7, 6.33e8, 8.17e9, 1.07e11, 1.41e12, 1.88e13, 2.52e14, 3.4e15, 4.63e16, 6.33e17, 8.72e18, 1.21e20, 1.68e21, 2.34e22, 3.28e23, 4.6e24, 6.49e25, 9.19e26]

class D:
    def __init__(s, W, H, title):
        s.o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', f'<rect width="{W}" height="{H}" fill="#141418"/>']
        s.T(30, 36, title, sz=15, c='#e8e6df')
    def T(s, x, y, t, a='start', sz=12, c='#9a9890', s_=None):
        s.o.append(f'<text x="{x}" y="{y}" {F} font-size="{s_ or sz}" fill="{c}" text-anchor="{a}">{t}</text>')
    def R(s, x, y, w, h, f='#101014', st='#777', sw=1.5): s.o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{f}" stroke="{st}" stroke-width="{sw}"/>')
    def L(s, x1, y1, x2, y2, c='#777', w=1.5, dash=None): s.o.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}"' + (f' stroke-dasharray="{dash}"' if dash else '') + '/>')
    def P(s, pts, f='none', st='#777', w=1.5): s.o.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="{f}" stroke="{st}" stroke-width="{w}"/>')
    def dim(s, x1, y1, x2, y2, t, off=0):
        s.L(x1, y1, x2, y2, '#c9b797', 1)
        if y1 == y2: s.L(x1, y1 - 5, x1, y1 + 5, '#c9b797', 1); s.L(x2, y1 - 5, x2, y1 + 5, '#c9b797', 1); s.T((x1 + x2) / 2, y1 - 6 + off, t, 'middle', 12, '#c9b797')
        else: s.L(x1 - 5, y1, x1 + 5, y1, '#c9b797', 1); s.L(x1 - 5, y2, x1 + 5, y2, '#c9b797', 1); s.T(x1 + 10 + off, (y1 + y2) / 2 + 4, t, 'start', 12, '#c9b797')
    def note(s, x, y, t, c='#e8e6df'): s.o.append(f'<circle cx="{x}" cy="{y}" r="2.5" fill="{c}"/>'); s.T(x + 8, y + 4, t, c=c)
    def done(s, name): s.o.append('</svg>'); open(os.path.join(out, name), 'w').write('\n'.join(s.o))

# ── 1. section A-A through the slot, scale 2:1 (1 mm = 2 px); the wall at the left, the room at the right ──
d = D(1500, 820, 'SECTION A-A THROUGH THE RECEIPT SLOT, X = 780 . SCALE 2:1 . THE WALL AT THE LEFT, THE ROOM AT THE RIGHT . MM')
S = 2; ox, oy = 480, 90                      # origin: the wall face at x = ox, the panel top at y = oy; y runs down, z (depth, toward the room) runs right
X = lambda z: ox + z * S; Y = lambda y: oy + (y - 420) * S   # the section shows y = 420 … 760 of the panel
d.R(X(-100) - 40, Y(420) - 20, 40, (760 - 420) * S + 40, '#1c1c20', '#444')     # the wall, 100 mm behind the slab's rear plane
d.T(X(-100) - 20, Y(420) - 28, 'WALL', 'middle', c='#777')
d.R(X(-100), Y(420), 100 * S, 3 * S, '#2a2a30', '#aaa'); d.R(X(-100), Y(757), 100 * S, 3 * S, '#2a2a30', '#aaa')   # the sub-frame's cladding, top and bottom of the bay
d.R(X(-100), Y(420), 40 * S, 40 * S, 'none', '#888'); d.R(X(-100), Y(720), 40 * S, 40 * S, 'none', '#888')          # the sub-frame angle
d.T(X(-50), Y(405), 'REAR SUB-FRAME 100 DEEP, INSET 150', 'middle', 10, '#888')
# the panel: face 2 mm at z = 78 … 80, returns 80 deep, rear frame 40 × 40 × 3 angle
d.R(X(78), Y(420), 2 * S, 340 * S, '#2a2a30', '#aaa')                                 # the face
d.R(X(0), Y(420), 78 * S, 3 * S, '#2a2a30', '#aaa'); d.R(X(0), Y(757), 78 * S, 3 * S, '#2a2a30', '#aaa')   # returns (shown at the section's edges)
d.R(X(0), Y(440), 40 * S, 40 * S, 'none', '#888'); d.R(X(0), Y(720), 40 * S, 40 * S, 'none', '#888')       # rear frame angle, top and bottom of the counter bay
d.T(X(20), Y(438), 'REAR FRAME 40x40x3', 'middle', 10, '#888')
# the French cleat: 18 mm plywood or 3 mm steel, 45°
d.P([(X(-100), Y(430)), (X(-100), Y(470)), (X(-114), Y(456))], '#3a3a40', '#aaa'); d.P([(X(-114), Y(456)), (X(-114), Y(500)), (X(-100), Y(486)), (X(-100), Y(470))], '#3a3a40', '#aaa')
d.T(X(-116), Y(520), 'FRENCH CLEAT, 3 MM STEEL, ON THE SUB-FRAME,', 'end', 10, '#aaa'); d.T(X(-116), Y(532), 'WALL HALF ON M8 ANCHORS AT 400', 'end', 10, '#aaa')
# the counter bay: drums 30 dia at y = 475, axis at z = 60
d.o.append(f'<circle cx="{X(60)}" cy="{Y(475)}" r="{15 * S}" fill="#1b1b20" stroke="#aaa" stroke-width="1.5"/>'); d.L(X(60) - 10, Y(475), X(60) + 10, Y(475), '#aaa', 1); d.L(X(60), Y(475) - 10, X(60), Y(475) + 10, '#aaa', 1)
d.R(X(78), Y(452), 2 * S, 46 * S, '#141418', '#aaa')                                   # the counter cut-out in the face
d.T(X(60), Y(475) - 36, 'DRUM 30 DIA x 16, AXIS Z = 60', 'middle', 10)
# the printer behind the slot: TM-T20III on its side, mouth at the chute; body 140 × 140 × 199 shown as a box
d.R(X(-96), Y(545), 96 * S, 146 * S, '#1b1b20', '#aaa'); d.T(X(-48), Y(610), 'EPSON TM-T20III', 'middle', 11, '#e8e6df'); d.T(X(-48), Y(624), '140 x 199 x 146, ON A SHELF IN THE', 'middle', 9)
d.T(X(-48), Y(638), 'SUB-FRAME, MOUTH AT Z = 0; ROLL', 'middle', 9); d.T(X(-48), Y(652), 'THROUGH THE SIDE HATCH', 'middle', 9)
d.R(X(-96), Y(691), 96 * S, 3 * S, '#2a2a30', '#aaa'); d.T(X(-48), Y(706), 'SHELF', 'middle', 9)
# the chute: 1 mm folded steel from the mouth (z = 0, y = 560) turning 60° down to the slot (z = 78, y = 560 … 574)
d.P([(X(0), Y(552)), (X(30), Y(552)), (X(78), Y(560))], 'none', '#e8e6df', 2); d.P([(X(0), Y(566)), (X(30), Y(566)), (X(78), Y(574))], 'none', '#e8e6df', 2)
d.T(X(20), Y(548), 'CHUTE, 1 MM STEEL, 62 WIDE', 'middle', 10, '#e8e6df')
d.R(X(78), Y(560), 2 * S, 14 * S, '#141418', '#aaa')                                   # the slot
d.T(X(84), Y(566), 'SLOT 120 x 14', 'start', 10, '#aaa')
# the ticket, leaving the slot and hanging to the pocket
d.P([(X(80), Y(574)), (X(84), Y(600)), (X(84), Y(665))], 'none', '#e8e6df', 1.5)
d.T(X(90), Y(620), 'TICKET 58 x 90.75', 'start', 10, '#e8e6df')
# the pocket: floor at y = 672, 8 deep, 22 front, 1.5 mm steel
d.P([(X(80), Y(672)), (X(89.5), Y(672)), (X(89.5), Y(650))], 'none', '#e8e6df', 3)
d.R(X(80), Y(672), 9.5 * S, 1.5 * S, '#e8e6df', '#e8e6df')
d.T(X(94), Y(652), 'POCKET: FLOOR 8, FRONT 22, 1.5 MM', 'start', 10, '#e8e6df'); d.T(X(94), Y(664), 'TCRT5000 IN THE FLOOR AT X = 800', 'start', 10, '#e8e6df')
d.T(X(94), Y(676), 'FIXED WITH 2 x M3 CSK THROUGH THE FACE', 'start', 10, '#aaa')
d.dim(X(80), Y(574), X(80), Y(672), '98', -70)
d.dim(X(0), Y(430) - 30, X(80), Y(430) - 30, '80')
d.dim(X(-100), Y(430) - 30, X(0), Y(430) - 30, '100')
d.note(X(100), Y(720), 'THE FACE: 2 MM STEEL, FOLDED 80, POWDER COATED MATT BLACK RAL 9005, FINE TEXTURE')
d.note(X(100), Y(735), 'THE REAR FRAME: 40 x 40 x 3 ANGLE, 3 BAYS; MODULE RAILS 20 x 20 x 2; THE SUB-FRAME 1700 x 1200 x 100 CARRIES THE CLEAT, THE PRINTER AND THE ELECTRICS')
d.note(X(100), Y(750), 'EARTH: M6 STUD ON THE REAR FRAME, 2.5 MM2 G/Y TO THE INLET PE')
d.done('section-a-a.svg')

# ── 2. the pocket and chute detail, front and side, scale 4:1 ──
d = D(1300, 760, 'DETAIL: THE CHUTE, THE SLOT, THE POCKET, THE SENSOR . SCALE 4:1 . MM')
S = 4; ox, oy = 120, 110
X = lambda x: ox + (x - 700) * S; Y = lambda y: oy + (y - 550) * S     # front view, panel x = 700 … 860, y = 550 … 720
d.T(ox, oy - 30, 'FRONT, SEEN FROM THE ROOM', c='#e8e6df')
d.R(X(700), Y(550), 160 * S, 170 * S, '#0b0b0e', '#444')
d.R(X(720), Y(560), 120 * S, 14 * S, '#141418', '#aaa'); d.T(X(780), Y(567) + 4, 'SLOT 120 x 14, EDGES DEBURRED, 1 MM RADIUS', 'middle', 10, '#aaa')
d.R(X(751), Y(578), 58 * S, 72 * S, '#e8e6df', '#e8e6df'); d.T(X(780), Y(614), 'TICKET', 'middle', 11, '#111')
d.R(X(746.5), Y(650), 67 * S, 22 * S, '#1b1b20', '#e8e6df', 2); d.T(X(780), Y(663), 'POCKET FRONT 67 x 22 (64 INSIDE)', 'middle', 10, '#e8e6df')
d.o.append(f'<circle cx="{X(800)}" cy="{Y(676)}" r="6" fill="none" stroke="#e8e6df" stroke-dasharray="3 2"/>'); d.T(X(808), Y(680), 'SENSOR UNDER THE FLOOR', 'start', 9)
d.o.append(f'<circle cx="{X(752)}" cy="{Y(690)}" r="3" fill="#aaa"/><circle cx="{X(808)}" cy="{Y(690)}" r="3" fill="#aaa"/>'); d.T(X(780), Y(700), 'M3 CSK x 2 THROUGH THE FACE, NUTS BEHIND', 'middle', 9)
d.T(X(762), Y(716), 'TAKE ONE', 'start', 11, '#9a9890'); d.T(X(810), Y(716), 'ENGRAVED, 11 PT, FILLED WHITE', 'start', 9)
d.dim(X(720), Y(555), X(840), Y(555), '120'); d.dim(X(746.5), Y(680), X(813.5), Y(680), '67', 16); d.dim(X(846), Y(574), X(846), Y(672), '98', 4)
# side
ox2 = 820
X2 = lambda z: ox2 + z * S; Y2 = Y
d.T(ox2 - 40, oy - 30, 'SIDE, SECTION AT X = 780', c='#e8e6df')
d.R(X2(78), Y2(550), 2 * S, 170 * S, '#2a2a30', '#aaa'); d.T(X2(78) + 4, Y2(553) + 8, 'FACE', 'start', 9)
d.R(X2(78), Y2(560), 2 * S, 14 * S, '#141418', '#aaa')
d.P([(X2(0), Y2(552)), (X2(30), Y2(552)), (X2(78), Y2(560))], 'none', '#e8e6df', 2); d.P([(X2(0), Y2(566)), (X2(30), Y2(566)), (X2(78), Y2(574))], 'none', '#e8e6df', 2)
d.T(X2(2), Y2(548), 'PRINTER MOUTH', 'start', 9); d.T(X2(34), Y2(586), 'CHUTE 1 MM, 62 INSIDE, 60 DEG', 'start', 9, '#e8e6df')
d.P([(X2(80), Y2(574)), (X2(83), Y2(600)), (X2(84), Y2(670))], 'none', '#e8e6df', 1.5); d.T(X2(88), Y2(620), 'TICKET, CURL TOWARD THE FACE', 'start', 9)
d.P([(X2(80), Y2(672)), (X2(89.5), Y2(672)), (X2(89.5), Y2(650))], 'none', '#e8e6df', 4)
d.T(X2(94), Y2(656), 'FRONT 22', 'start', 9, '#e8e6df'); d.T(X2(94), Y2(676), 'FLOOR 8 x 1.5', 'start', 9, '#e8e6df')
d.R(X2(82), Y2(672), 6 * S, 3 * S, '#333', '#e8e6df', 1); d.T(X2(94), Y2(688), 'TCRT5000, LENS UP, DO LOW WITH PAPER', 'start', 9)
d.dim(X2(78), Y2(700), X2(89.5), Y2(700), '11.5'); d.dim(X2(0), Y2(545) - 10, X2(78), Y2(545) - 10, '78')
d.note(ox, 690, 'THE CHUTE AND THE POCKET ARE ONE FOLDED PART EACH, 1 MM AND 1.5 MM MILD STEEL, POWDER COATED WITH THE FACE; ALL PAPER-TOUCHING EDGES ROLLED OR DEBURRED')
d.note(ox, 710, 'LOAD THE ROLL SO THE PAPER CURLS TOWARD THE FACE; THE LEADING EDGE THEN DROPS INTO THE POCKET')
d.note(ox, 730, 'SET THE SENSOR TRIMMER SO DO IS LOW WITH ONE SHEET 3 MM ABOVE THE LENS AND HIGH WITH NONE')
d.done('detail-pocket.svg')

# ── 3. wiring schematic ──
d = D(1400, 900, 'WIRING SCHEMATIC . ONE MAINS INLET; 24 V FOR THE MODULES AND THE MOTION; THE PRINTER ON ITS OWN ADAPTER; 5 V ALWAYS ON FOR THE CONTROLLER')
box = lambda x, y, w, h, t1, t2='': (d.R(x, y, w, h, '#1b1b20', '#aaa'), d.T(x + w / 2, y + 22, t1, 'middle', 12, '#e8e6df'), d.T(x + w / 2, y + 40, t2, 'middle', 10))
wire = lambda pts, t, c='#c9b797': (d.P(pts, 'none', c, 2), d.T(pts[-1][0] + 6, pts[-1][1] - 6, t, 'start', 10, c))
box(40, 80, 180, 60, 'MAINS INLET', 'IEC C14, SWITCH, FUSE T6.3A'); box(260, 80, 180, 60, 'TIME SWITCH', 'DIN, 16 A, OPENING HOURS')
box(500, 60, 200, 60, 'PSU 24 V 14.6 A', 'MEAN WELL LRS-350-24'); box(500, 150, 200, 60, 'PRINTER ADAPTER', 'EPSON PS-180, 24 V')
box(260, 240, 180, 60, 'PSU 5 V 3 A', 'MEAN WELL RS-15-5, ALWAYS ON')
wire([(220, 110), (260, 110)], 'L N PE'); wire([(440, 110), (470, 110), (470, 90), (500, 90)], 'L N'); wire([(470, 110), (470, 180), (500, 180)], 'L N'); wire([(240, 110), (240, 270), (260, 270)], 'L N')
d.T(130, 160, 'PE -> M6 STUD, PANEL', 'middle', 10, '#3c3')
box(780, 40, 220, 60, '24 V BUS, 2 BRANCHES', 'EACH FUSED 10 A BLADE, 1.5 MM2'); wire([(700, 90), (780, 70)], '+24 -')
box(1060, 20, 300, 50, 'CONVEYOR MODULES x 20', 'ADDR 0x00-0x13, BRANCH A'); box(1060, 90, 300, 50, 'LANE MODULES x 16 (+RIM)', 'ADDR 0x20-0x2F, BRANCH B')
wire([(1000, 60), (1060, 45)], ''); wire([(1000, 80), (1060, 115)], '')
box(780, 130, 220, 60, 'MOTION BOARD', 'CARRIER: ESP32 DEVKIT + 5 x TMC2209'); wire([(700, 100), (740, 100), (740, 160), (780, 160)], '+24 -')
box(1060, 170, 140, 50, 'COUNTER STEPPERS x 4', 'NEMA 11, WHEELS 25-28'); box(1220, 170, 140, 50, 'RULER STEPPER', 'NEMA 17, BELT AXIS')
box(1060, 240, 140, 50, 'WHEEL INDEX x 4', 'OPTICAL, ONE PER DRUM'); box(1220, 240, 140, 50, 'RULER HOME', 'MICROSWITCH AT X = 80')
wire([(1000, 160), (1060, 195)], '4 x A B'); wire([(1000, 170), (1220, 195)], 'A B'); wire([(1000, 180), (1060, 265)], ''); wire([(1000, 185), (1220, 265)], '')
box(260, 340, 220, 70, 'CONTROLLER', 'RASPBERRY PI ZERO 2 W'); wire([(350, 300), (350, 340)], '5 V')
box(560, 320, 180, 50, 'USB-RS485', 'FTDI, ISOLATED'); wire([(480, 360), (560, 345)], 'USB')
wire([(740, 345), (770, 345), (770, 230), (1040, 230), (1040, 70), (1060, 70)], 'RS-485 A B GND, DAISY CHAIN', '#6cf'); d.T(1080, 150, '120 OHM AT THE LAST MODULE', 'start', 10, '#6cf')
wire([(480, 375), (780, 175)], 'USB SERIAL: PROGRAM N | POINTER X MM', '#6cf')
box(560, 400, 180, 50, 'PRINTER TM-T20III', 'USB'); wire([(480, 390), (560, 425)], 'USB', '#6cf'); wire([(700, 210), (650, 210), (650, 400)], '24 V DC JACK')
box(560, 480, 180, 50, 'POCKET SENSOR', 'TCRT5000 MODULE'); wire([(480, 400), (520, 400), (520, 505), (560, 505)], '3V3 GND GPIO17', '#6cf')
d.note(40, 600, 'RS-485: ONE SHIELDED TWISTED PAIR 24 AWG, A/B/GND, MODULE TO MODULE IN ADDRESS ORDER; TERMINATE 120 OHM AT THE LAST MODULE; SHIELD TO PE AT THE ADAPTER END ONLY')
d.note(40, 620, '24 V: 1.5 MM2 TO EACH BRANCH, STAR FROM THE BUS BAR; EACH MODULE ON ITS MAKER\'S CONNECTOR; CHECK POLARITY BEFORE POWER')
d.note(40, 640, 'STEPPERS: 4 x 0.5 MM2 TO EACH MOTOR; TMC2209 IN UART MODE, HOLD CURRENT UNDER 10 %; INDEX AND HOME SENSORS 3 x 0.25 MM2')
d.note(40, 660, 'THE TIME SWITCH CUTS THE 24 V PSU AND THE PRINTER ADAPTER OUTSIDE HOURS; THE 5 V PSU AND THE CONTROLLER STAY ON')
d.note(40, 680, 'SET THE 24 V PSU TO 24.0 V; THE MODULES REFRESH ONE AT A TIME UNDER SOFTWARE, SO PEAK CURRENT STAYS UNDER 4 A')
d.note(40, 700, 'ALL CABLES IN THE REAR BAYS ON ADHESIVE MOUNTS, 100 MM FROM THE MODULE COIL SIDES; A SERVICE LOOP AT THE PRINTER')
d.done('wiring.svg')

# ── 4. the address map: which module is where, seen from the front ──
d = D(1200, 700, 'MODULE ADDRESS MAP, SEEN FROM THE FRONT . ALFAZETA XY5 28 x 7 . DIP SWITCHES TO MATCH . CONTROLLER.JS SENDS 0x80 CMD ADDR 28 BYTES 0x8F')
S = 0.5; ox, oy = 60, 80
for i in range(5):
    for r in range(4):
        x, y = ox + (80 + i * 300) * S, oy + (80 + r * 70) * S; d.R(x, y, 280 * S, 70 * S, '#1b1b20', '#aaa', 1); d.T(x + 140 * S, y + 22, f'0x{i * 4 + r:02X}', 'middle', 12, '#e8e6df')
    d.T(ox + (220 + i * 300) * S, oy + 60 * S, f'TILE {i + 1}', 'middle', 10)
for c in range(2):
    for r in range(8):
        x, y = ox + (90 + c * 280) * S, oy + (430 + r * 70) * S; d.R(x, y, 280 * S, 70 * S, '#1b1b20', '#aaa', 1); d.T(x + 140 * S, y + 22, f'0x{0x20 + c * 8 + r:02X}', 'middle', 12, '#e8e6df')
d.R(ox + 80 * S, oy + 420 * S, 580 * S, 580 * S, 'none', '#c9b797', 1)
d.T(ox + 370 * S, oy + 1020 * S, 'THE LANE: 56 x 56 CORE OF 16 MODULES INSIDE THE 58 x 58 FIELD; THE RIM PER DESIGN.MD', 'middle', 10, '#c9b797')
d.note(700, 300, 'ADDRESS = TILE x 4 + ROW FOR THE CONVEYOR, ROW 0 AT THE TOP')
d.note(700, 320, 'ADDRESS = 0x20 + COLUMN x 8 + ROW FOR THE LANE, LEFT COLUMN FIRST')
d.note(700, 340, 'COLUMN BYTE: BIT 0 = TOP DOT OF THE 7; 28 BYTES LEFT TO RIGHT')
d.note(700, 360, 'ONE FRAME PER MODULE PER SECOND, THEN 0x80 0x82 0x8F REFRESH ALL')
d.note(700, 380, 'MOUNT EVERY MODULE DOT SIDE FLUSH 1 MM BEHIND THE FACE CUT-OUT')
d.note(700, 400, 'VERIFY THE COMMAND BYTES AGAINST THE DATASHEET OF THE MODULES BOUGHT')
d.done('address-map.svg')

# ── 5. the motion board carrier: the ESP32, the five driver sockets, the terminals, the nets ──
d = D(1500, 900, 'THE MOTION BOARD CARRIER . ESP32-DEVKITC + 5 x TMC2209 STEPSTICK IN SOCKETS . 120 x 100 MM, 2 LAYERS . NETS BY NAME; SEE CARRIER/README.MD FOR THE NETLIST')
box = lambda x, y, w, h, t1, t2='': (d.R(x, y, w, h, '#1b1b20', '#aaa'), d.T(x + w / 2, y + 20, t1, 'middle', 12, '#e8e6df'), d.T(x + w / 2, y + 36, t2, 'middle', 10))
d.R(40, 70, 1420, 760, 'none', '#555')
d.T(50, 90, 'PCB 120 x 100, M3 HOLES ON 110 x 90', 'start', 10, '#555')
# the drivers along the top
names = ['D1 DRUM 25', 'D2 DRUM 26', 'D3 DRUM 27', 'D4 DRUM 28', 'D5 RULER']
addr = ['AD0=0 AD1=0', 'AD0=1 AD1=0', 'AD0=0 AD1=1', 'AD0=1 AD1=1', 'AD0=0 AD1=0']
steps = ['STEP 18 / DIR 23', 'STEP 19 / DIR 5', 'STEP 21 / DIR 13', 'STEP 22 / DIR 14', 'STEP 27 / DIR 32']
uart = ['UART_DRUMS', 'UART_DRUMS', 'UART_DRUMS', 'UART_DRUMS', 'UART_RULER']
for i in range(5):
    x = 70 + i * 270
    box(x, 120, 230, 150, names[i], 'TMC2209 STEPSTICK, R_SENSE 0.110')
    d.T(x + 115, 180, steps[i], 'middle', 10, '#6cf'); d.T(x + 115, 198, 'EN_ALL 33 . ' + uart[i] + ' pin 4', 'middle', 10, '#6cf')
    d.T(x + 115, 216, addr[i] + ' . CLK to GND', 'middle', 10); d.T(x + 115, 234, '100 uF 35 V AT VM/GND . VIO 3V3', 'middle', 10)
    d.R(x + 60, 80, 110, 30, '#101014', '#aaa'); d.T(x + 115, 99, 'T%d  2B 2A 1A 1B' % (i + 1), 'middle', 10, '#e8e6df')
    d.L(x + 115, 110, x + 115, 120, '#aaa', 1)
# the 24 V input and the bus
box(70, 320, 230, 60, 'T6  24 V IN', '5.08 MM TERMINAL; F1 5 A; SMBJ33A; 22 uF')
d.L(300, 350, 1420, 350, '#c9b797', 2); d.T(860, 342, 'VM, 1.5 MM TRACE, TO PIN 10 OF D1 … D5', 'middle', 10, '#c9b797')
for i in range(5): d.L(70 + i * 270 + 115, 270, 70 + i * 270 + 115, 350, '#c9b797', 1)
box(340, 320, 230, 60, 'U2  BUCK 24 V -> 5 V', 'POLOLU D24V22F5 . TO THE DEVKIT 5V PIN')
# the ESP32 along the bottom
box(400, 520, 700, 120, 'U1  ESP32-DEVKITC V4, 38 PINS', 'USB AT THE BOARD EDGE, TO THE CONTROLLER')
pins = [('18 19 21 22 27', 'STEP'), ('23 5 13 14 32', 'DIR'), ('33', 'EN_ALL'), ('17 via 1k to UART_DRUMS', '16 from UART_DRUMS'), ('25 via 1k to UART_RULER', '26 from UART_RULER'), ('34 35 36 39', 'INDEX 1 … 4, 10k TO 3V3'), ('4', 'HOME, INTERNAL PULL-UP')]
for i, (a, b) in enumerate(pins):
    x = 410 + i * 98; d.T(x, 590, a, 'start', 9, '#6cf'); d.T(x, 604, b, 'start', 9)
d.L(750, 520, 750, 350, '#6cf', 1); d.T(760, 440, 'STEP / DIR / EN / UART TO THE SOCKETS', 'start', 10, '#6cf')
# the sensor headers along the left
for i in range(4): box(70, 420 + i * 60, 230, 50, 'J%d  INDEX DRUM %d' % (i + 1, 25 + i), 'JST-XH 3: 3V3 GND SIG . 10k PULL-UP')
box(70, 660, 230, 50, 'J5  HOME SWITCH', 'JST-XH 2: SIG GND')
d.L(300, 445, 400, 580, '#6cf', 1); d.L(300, 685, 400, 600, '#6cf', 1)
# the EN jumper and the LEDs
box(1150, 520, 200, 50, 'JP1  EN_ALL TO GND', 'BENCH TEST WITHOUT THE ESP32'); box(1150, 590, 200, 50, 'LED 5V . LED 3V3', 'TP VM')
d.note(60, 760, 'ALL ACTIVE PARTS ARE STOCK MODULES IN SOCKETS; THE PCB IS PASSIVE: SOCKETS, TERMINALS, CAPACITORS, PULL-UPS, STRAPS, FUSE, TVS')
d.note(60, 782, 'MOTOR CURRENTS ARE SET BY THE FIRMWARE OVER UART; THE MODULES\' VREF TRIMMERS ARE IGNORED')
d.note(60, 804, 'VERIFY THE STEPSTICK HEADER AGAINST THE MODULE VENDOR\'S DRAWING BEFORE ORDERING THE PCB')
d.done('carrier.svg')

# ── the ruler's tick positions, for the engraver ──
total = math.log10(CUM[25])
with open(os.path.join(out, 'ruler-ticks.md'), 'w') as f:
    f.write('| shelf | programs through this shelf | tick, mm from the bar\'s left end | mm from the panel\'s left edge |\n|---|---|---|---|\n')
    for n in range(1, 26):
        x = 1840 * math.log10(CUM[n]) / total
        cnt = f'{int(CUM[n]):,}' if CUM[n] < 1e7 else f'{CUM[n]:.2e}'.replace('e+', ' x 10^')
        f.write(f'| {n} | {cnt} | {x:.1f} | {80 + x:.1f} |\n')
print('drawings written to', out)
