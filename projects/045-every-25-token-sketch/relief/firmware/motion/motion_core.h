// The motion board's core — stage 3 of Every 25-Token Sketch in the room.
//
// Five stepper axes: the counter's four motorised drums (digits 25 … 28 of the program number)
// and the ruler's pointer on a belt axis. This header has no hardware in it: it parses the
// controller's lines, plans each axis's steps, and runs the homing state machines against
// callbacks, so it compiles and runs on a host (test_core.cpp) as well as on the ESP32
// (motion.ino), which supplies the pins, the timer and the TMC2209 UART.
//
// Units: drums in microsteps, 3200 a turn (200 steps × 16 microsteps), 320 a digit; the ruler
// in microsteps, 160 a millimetre (400 steps × 16 microsteps on a 40 mm belt pulley).
#pragma once
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

namespace motion {

// ── calibration ──
constexpr int   N_DRUMS = 4;
constexpr int   AXES = N_DRUMS + 1;                 // 0 … 3 the drums (drum 25 … 28 of the counter), 4 the ruler
constexpr int   RULER = 4;
constexpr long  STEPS_PER_TURN = 3200;              // drum: 1.8° motor, 1/16 microsteps
constexpr long  STEPS_PER_DIGIT = STEPS_PER_TURN / 10;
constexpr double RULER_STEPS_PER_MM = 160.0;        // 0.9° motor, 1/16 microsteps, GT2 20-tooth pulley (40 mm a turn)
constexpr double RULER_TRAVEL_MM = 1840.0;          // x = 80 … 1920 on the panel; 0 here is the pointer's tip at x = 80
constexpr double RULER_HOME_OFFSET_MM = 2.0;        // the home switch trips 2 mm before position 0; set after measuring
constexpr long   DRUM_INDEX_OFFSET[N_DRUMS] = {0, 0, 0, 0};   // microsteps from the index edge to the centre of digit 0, per drum; set after measuring
constexpr uint32_t TICK_HZ = 20000;                 // the step timer

// speeds and ramps, in microsteps per second (and per second²)
constexpr double DRUM_RATE = STEPS_PER_DIGIT / 0.25;        // one digit in 0.25 s
constexpr double DRUM_ACCEL = DRUM_RATE / 0.05;             // up to speed in 50 ms
constexpr double DRUM_HOME_RATE = STEPS_PER_TURN / 2.0;     // a turn in 2 s while looking for the index
constexpr double RULER_SERVICE_RATE = RULER_STEPS_PER_MM * 1.0;     // 1 mm/s: the pointer in service never needs more
constexpr double RULER_HOME_RATE = RULER_STEPS_PER_MM * 20.0;       // 20 mm/s toward the switch
constexpr double RULER_HOME_SLOW = RULER_STEPS_PER_MM * 2.0;        // the second, slow approach
constexpr double RULER_ACCEL = RULER_STEPS_PER_MM * 200.0;          // 200 mm/s²
constexpr double RULER_TEST_RATE = RULER_STEPS_PER_MM * 30.0;       // for the acceptance test only

// ── one axis: a target in microsteps, a current position, a rate with a linear ramp ──
struct Axis {
  volatile long position = 0;       // microsteps, counted by the ISR
  volatile long target = 0;
  volatile double rate = 0;         // microsteps per second, signed; written by plan(), read by the ISR
  volatile double acc = 0;          // the ISR's DDA accumulator
  double maxRate = 0, accel = 0;
  bool forwardOnly = false;         // drums advance like an odometer; they never step back
  bool homed = false;
  bool enabled = true;

  // called at 1 kHz from the loop: ramp the rate toward what the remaining distance allows
  void plan(double dt) {
    long rem = target - position;
    if (rem == 0) { rate = 0; acc = 0; return; }                 // on the target: stop dead (the last steps are taken at a few a second)
    double dir = rem > 0 ? 1 : -1;
    if (forwardOnly && rem < 0) { rate = 0; return; }           // never happens if targets are set with nextForward()
    double dist = fabs((double)rem);
    double allowed = sqrt(2.0 * accel * dist);                  // the speed from which we can still stop at the target
    double want = fmin(maxRate, fmax(allowed, 2.0)) * dir;      // at least 2 steps/s so the last steps are taken
    double r = rate;
    if (want > r) r = fmin(want, r + accel * dt); else r = fmax(want, r - accel * dt);
    rate = r;
  }
  // called from the ISR at TICK_HZ: returns +1 / −1 when a step is due, else 0
  int tick() {
    double r = rate; if (r == 0) return 0;
    acc += fabs(r);
    if (acc >= TICK_HZ) { acc -= TICK_HZ; int s = r > 0 ? 1 : -1; position += s; return s; }
    return 0;
  }
  bool idle() const { return position == target && rate == 0; }
};

// the drum's next forward target for a digit: the counter only ever counts up, and 9 rolls to 0
inline long nextForward(long position, int digit) {
  long t = (long)digit * STEPS_PER_DIGIT;
  long turns = position / STEPS_PER_TURN;
  long cand = turns * STEPS_PER_TURN + t;
  while (cand < position) cand += STEPS_PER_TURN;
  return cand;
}
inline long rulerSteps(double mm) {
  if (mm < 0) mm = 0;
  if (mm > RULER_TRAVEL_MM) mm = RULER_TRAVEL_MM;
  return lround(mm * RULER_STEPS_PER_MM);
}

// ── homing: a state machine per axis, fed with the sensor's state each millisecond ──
// drums: turn forward at DRUM_HOME_RATE until the index sensor's rising edge, then declare that
// position minus the offset to be digit 0's centre (the sensor's slot is cut at digit 0);
// ruler: run toward the switch, back off 2 mm, approach slowly, and declare the trip point.
enum class Home { Idle, DrumSeek, DrumDone, RulerSeek, RulerBackoff, RulerSlow, Done, Failed };

struct Homing {
  Home state = Home::Idle;
  long startPos = 0; bool lastSensor = false; int ms = 0;
  void begin(Axis& a, bool isRuler) {
    a.homed = false; a.rate = 0; a.acc = 0; startPos = a.position; ms = 0; lastSensor = false;
    if (isRuler) { state = Home::RulerSeek; a.maxRate = RULER_HOME_RATE; a.target = a.position - rulerSteps(RULER_TRAVEL_MM) - 1000; }
    else { state = Home::DrumSeek; a.maxRate = DRUM_HOME_RATE; a.target = a.position + 2 * STEPS_PER_TURN + 100; }
  }
  // sensor: the index slot seen (drum) or the switch pressed (ruler). Call every millisecond.
  void step(Axis& a, bool sensor, int axisIndex) {
    ms++;
    bool rising = sensor && !lastSensor; lastSensor = sensor;
    switch (state) {
      case Home::DrumSeek:
        if (rising && ms > 20) {                                                // ignore the first 20 ms: the slot may start under the sensor
          long zero = a.position - DRUM_INDEX_OFFSET[axisIndex];
          a.position = a.position - zero;                                       // renumber so that digit 0's centre is 0
          a.target = nextForward(a.position, 0); a.maxRate = DRUM_RATE; a.accel = DRUM_ACCEL;
          a.homed = true; state = Home::DrumDone;
        } else if (a.position - startPos > 2 * STEPS_PER_TURN) { a.target = a.position; state = Home::Failed; }
        break;
      case Home::DrumDone: if (a.idle()) state = Home::Done; break;
      case Home::RulerSeek:
        if (sensor) { a.target = a.position + rulerSteps(RULER_HOME_OFFSET_MM); a.maxRate = RULER_HOME_RATE; state = Home::RulerBackoff; }
        else if (startPos - a.position > rulerSteps(RULER_TRAVEL_MM) + 800) { a.target = a.position; state = Home::Failed; }
        break;
      case Home::RulerBackoff:
        if (a.idle()) { a.maxRate = RULER_HOME_SLOW; a.target = a.position - rulerSteps(RULER_HOME_OFFSET_MM) - 400; state = Home::RulerSlow; }
        break;
      case Home::RulerSlow:
        if (sensor) {                                                           // the slow trip point is position −HOME_OFFSET
          a.position = -rulerSteps(RULER_HOME_OFFSET_MM); a.target = 0; a.maxRate = RULER_SERVICE_RATE; a.accel = RULER_ACCEL;
          a.homed = true; state = Home::Done;
        } else if (a.idle()) { state = Home::Failed; }
        break;
      default: break;
    }
  }
  bool running() const { return state != Home::Idle && state != Home::Done && state != Home::Failed; }
};

// ── the controller's line: "program 0000…0397 | pointer 298.123 mm | …" ──
struct Command { bool hasProgram = false; int digits[N_DRUMS] = {0, 0, 0, 0}; bool hasPointer = false; double pointerMm = 0; };

inline bool parseControllerLine(const char* line, Command& c) {
  const char* p = strstr(line, "program ");
  if (p) {
    p += 8; const char* q = p; while (*q >= '0' && *q <= '9') q++;
    int n = (int)(q - p);
    if (n >= N_DRUMS) { for (int i = 0; i < N_DRUMS; i++) c.digits[i] = p[n - N_DRUMS + i] - '0'; c.hasProgram = true; }
  }
  const char* r = strstr(line, "pointer ");
  if (r) { c.pointerMm = atof(r + 8); c.hasPointer = true; }
  return c.hasProgram || c.hasPointer;
}

// the whole board, hardware-free
struct Board {
  Axis axis[AXES];
  Homing homing[AXES];
  Board() {
    for (int i = 0; i < N_DRUMS; i++) { axis[i].forwardOnly = true; axis[i].maxRate = DRUM_RATE; axis[i].accel = DRUM_ACCEL; }
    axis[RULER].maxRate = RULER_SERVICE_RATE; axis[RULER].accel = RULER_ACCEL;
  }
  bool allHomed() const { for (int i = 0; i < AXES; i++) if (!axis[i].homed) return false; return true; }
  bool homingAny() const { for (int i = 0; i < AXES; i++) if (homing[i].running()) return true; return false; }
  void homeAll() { for (int i = 0; i < AXES; i++) homing[i].begin(axis[i], i == RULER); }
  void homeDrums() { for (int i = 0; i < N_DRUMS; i++) homing[i].begin(axis[i], false); }
  void homeRuler() { homing[RULER].begin(axis[RULER], true); }
  // apply a controller command; ignored for axes not yet homed
  void apply(const Command& c) {
    if (c.hasProgram) for (int i = 0; i < N_DRUMS; i++) if (axis[i].homed && !homing[i].running()) axis[i].target = nextForward(axis[i].position, c.digits[i]);
    if (c.hasPointer && axis[RULER].homed && !homing[RULER].running()) { axis[RULER].maxRate = RULER_SERVICE_RATE; axis[RULER].target = rulerSteps(c.pointerMm); }
  }
  // the 1 kHz service: sensors in, homing and planning
  void service(const bool sensors[AXES], double dt) {
    for (int i = 0; i < AXES; i++) { if (homing[i].running()) homing[i].step(axis[i], sensors[i], i); axis[i].plan(dt); }
  }
  int drumDigit(int i) const { long p = ((axis[i].position % STEPS_PER_TURN) + STEPS_PER_TURN) % STEPS_PER_TURN; return (int)((p + STEPS_PER_DIGIT / 2) / STEPS_PER_DIGIT) % 10; }
  double pointerMm() const { return axis[RULER].position / RULER_STEPS_PER_MM; }
};

} // namespace motion
