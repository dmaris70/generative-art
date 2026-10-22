# The motion board

Firmware for the relief's counter drums and ruler pointer: an ESP32 with five TMC2209 drivers.
It homes the five axes at power-up and then follows the controller's lines. The logic is in
`motion_core.h` and runs on a host for testing; `motion.ino` is the hardware.

## Files

| file | what |
|---|---|
| `motion_core.h` | the axes, the step planner, the homing state machines, the line parser; no hardware |
| `test_core.cpp` | a host test with a simulated machine: `g++ -std=c++17 -o test_core test_core.cpp && ./test_core` |
| `motion.ino` | the ESP32 sketch: pins, the 20 kHz step timer, the TMC2209 UART set-up, the serial commands |
| `platformio.ini` | build and upload with PlatformIO; or open `motion.ino` in the Arduino IDE with the ESP32 core 2.x and the TMCStepper library |

## Wiring

| signal | ESP32 pin | note |
|---|---|---|
| STEP drum 25, 26, 27, 28 | 18, 19, 21, 22 | to each TMC2209's STEP |
| DIR drum 25, 26, 27, 28 | 23, 5, 13, 14 | to DIR |
| STEP ruler | 27 | |
| DIR ruler | 32 | |
| ENABLE, all drivers | 33 | active low, shared |
| UART1 TX / RX | 17 / 16 | to the four drum drivers' PDN_UART through the usual 1 kΩ; addresses 0 … 3 by MS1/MS2 |
| UART2 TX / RX | 25 / 26 | to the ruler driver's PDN_UART; address 0 |
| index drum 25, 26, 27, 28 | 34, 35, 36, 39 | input-only pins: fit 10 kΩ pull-ups to 3V3 on the carrier; the slot sensor pulls low when the slot is under it |
| home switch | 4 | to GND, internal pull-up; pressed = low |
| drivers VM | 24 V | from the 5 A branch, 100 µF per driver |
| drivers VIO, ESP32 | 3.3 V | from the ESP32 board's regulator; feed the board 5 V from a 24 → 5 V buck |

If an axis runs the wrong way, flip its entry in `DIR_INVERT` rather than rewiring. The
transmissive index sensor (slot type) is mounted so its slot is cut in each drum's rim at
digit 0; the home switch sits at the left end of the axis so it trips 2 mm before the
pointer's tip is at x = 80.

## Calibration, once, on the bench

1. Power up. The board homes. `status` shows positions and the sensors' state.
2. For each drum: `drum N 0`, then look at the digit face. If 0 is not centred, measure the
   error in microsteps (320 a digit, so 32 a millimetre of rim at the 30 mm drum) and put it in
   `DRUM_INDEX_OFFSET[N-1]` in `motion_core.h`. Rebuild, home, check.
3. For the ruler: `pointer 303.6` (shelf 5's tick). Measure the tip against the engraved tick
   and adjust `RULER_HOME_OFFSET_MM`. Check `pointer 1840` at the far end.
4. Record the offsets in the handover.

## Commands

Over USB serial at 115200, one line each: `home`, `home drums`, `home ruler`, `status`,
`drum N D`, `pointer X`, `test`, `stop`. A line beginning `program ` is a controller line and
is followed only when all axes are homed. The board answers `ok …` or `err …`.

## Currents

Run current 0.6 A for the drums, 1.2 A for the ruler; hold current 8 % and 10 % of run.
`CONSTRUCTION.md` once said zero hold current; a small hold is right, because a drum with no
current can be nudged off its digit and a belt axis with none can creep. The drivers run in
stealthChop so the motors are silent; the flip-dots are the relief's sound.

## Service behaviour

- One controller line a second. The units drum takes one forward digit in 0.25 s; the others
  when their digit changes; 9 rolls forward to 0, never backward.
- The pointer follows the millimetre value at up to 1 mm/s. On the first day it moves about
  46 mm an hour; after that, a hair.
- A controller line before homing is answered `err not homed`; the controller resends every
  second, so the board catches up as soon as homing ends.
- `stop` halts everything; `home` is required before service resumes.
