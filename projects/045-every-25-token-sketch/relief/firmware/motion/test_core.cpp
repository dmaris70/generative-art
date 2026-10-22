// Host test for the motion core: simulate the drums' index slots and the ruler's switch, home,
// feed controller lines, and check the drums read the digits and the pointer the millimetres.
//   g++ -std=c++17 -O1 -o test_core test_core.cpp && ./test_core
#include "motion_core.h"
#include <stdio.h>

using namespace motion;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("FAIL: " __VA_ARGS__); printf("\n"); } } while (0)

// a simulated machine: the drum's slot is seen for 40 microsteps around position 0 (mod a turn);
// the ruler's switch is pressed at and below position −HOME_OFFSET
struct Sim {
  Board b;
  long drumTrue[N_DRUMS] = {1234, 2000, 777, 3100};   // where each drum physically is at power-up, in microsteps from its slot
  long rulerTrue = 90000;                            // the pointer at 562 mm at power-up
  void run(double seconds, const char* line = nullptr) {
    if (line) { Command c; if (parseControllerLine(line, c)) b.apply(c); }
    const long ticks = (long)(seconds * TICK_HZ); double dt = 1.0 / 1000;
    for (long t = 0; t < ticks; t++) {
      for (int i = 0; i < AXES; i++) { int s = b.axis[i].tick(); if (s) { if (i == RULER) rulerTrue += s; else drumTrue[i] += s; } }
      if (t % (TICK_HZ / 1000) == 0) {
        bool sensors[AXES];
        for (int i = 0; i < N_DRUMS; i++) { long m = ((drumTrue[i] % STEPS_PER_TURN) + STEPS_PER_TURN) % STEPS_PER_TURN; sensors[i] = m < 20 || m > STEPS_PER_TURN - 20; }
        sensors[RULER] = rulerTrue <= -rulerSteps(RULER_HOME_OFFSET_MM);
        b.service(sensors, dt);
      }
    }
  }
  int trueDigit(int i) const { long m = ((drumTrue[i] % STEPS_PER_TURN) + STEPS_PER_TURN) % STEPS_PER_TURN; return (int)((m + STEPS_PER_DIGIT / 2) / STEPS_PER_DIGIT) % 10; }
};

int main() {
  Sim s;
  // 1. parsing
  Command c; CHECK(parseControllerLine("program 0000000000000000000000000397 | pointer 298.123 mm | lane program 339 x / cos(y) | found 16 | distinct 7,265", c), "parse");
  CHECK(c.hasProgram && c.digits[0] == 0 && c.digits[1] == 3 && c.digits[2] == 9 && c.digits[3] == 7, "digits %d%d%d%d", c.digits[0], c.digits[1], c.digits[2], c.digits[3]);
  CHECK(c.hasPointer && fabs(c.pointerMm - 298.123) < 1e-6, "pointer %f", c.pointerMm);
  Command c2; CHECK(!parseControllerLine("hello", c2), "non-line rejected");
  // 2. a command before homing is ignored
  s.run(1.0, "program 0000000000000000000000001234 | pointer 100 mm");
  for (int i = 0; i < AXES; i++) CHECK(s.b.axis[i].target == 0 && s.b.axis[i].position == 0, "axis %d moved before homing", i);
  // 3. homing: drums find their slots, the ruler its switch
  s.b.homeAll(); s.run(45.0);                        // the ruler starts 562 mm out: 28 s to the switch at 20 mm/s, then the slow approach
  CHECK(s.b.allHomed(), "all homed");
  for (int i = 0; i < N_DRUMS; i++) CHECK(s.trueDigit(i) == 0 && s.b.drumDigit(i) == 0, "drum %d at 0 after homing: true %d read %d", i, s.trueDigit(i), s.b.drumDigit(i));
  CHECK(fabs(s.rulerTrue - 0) <= 2 && fabs(s.b.pointerMm()) < 0.02, "ruler at 0 after homing: true %ld steps, read %.3f mm", s.rulerTrue, s.b.pointerMm());
  // 4. the counter counts up; 9 rolls over to 0 forward
  s.run(3.0, "program 0000000000000000000000000397 | pointer 298.123 mm");   // nine digits forward on drum 27 at 0.25 s each: 2.25 s
  int want[4] = {0, 3, 9, 7}; for (int i = 0; i < N_DRUMS; i++) CHECK(s.trueDigit(i) == want[i], "drum %d reads %d, want %d", i, s.trueDigit(i), want[i]);
  long before = s.drumTrue[3];
  s.run(1.0, "program 0000000000000000000000000398 | pointer 298.128 mm"); CHECK(s.trueDigit(3) == 8 && s.drumTrue[3] > before, "units drum stepped forward one digit");
  s.run(1.0, "program 0000000000000000000000000399 | pointer 298.133 mm");
  before = s.drumTrue[3];
  s.run(1.0, "program 0000000000000000000000000400 | pointer 298.138 mm");
  CHECK(s.trueDigit(3) == 0 && s.drumTrue[3] - before == STEPS_PER_DIGIT, "9 to 0 is one forward step, not nine back (moved %ld)", s.drumTrue[3] - before);
  CHECK(s.trueDigit(2) == 0 && s.trueDigit(1) == 4, "tens and hundreds rolled: %d%d", s.trueDigit(1), s.trueDigit(2));
  // 5. the pointer follows to the millimetre, slowly; at 1 mm/s the 298 mm journey takes about 5 minutes
  s.run(320.0, "program 0000000000000000000000000400 | pointer 298.138 mm");
  CHECK(fabs(s.rulerTrue - rulerSteps(298.138)) <= 1, "pointer at 298.138 mm: %ld steps vs %ld", s.rulerTrue, rulerSteps(298.138));
  s.run(10.0, "program 0000000000000000000000000401 | pointer 298.141 mm");
  CHECK(fabs(s.rulerTrue - rulerSteps(298.141)) <= 1, "a 3 micron ask moves 0 or 1 microstep: %ld vs %ld", s.rulerTrue, rulerSteps(298.141));
  // 6. out-of-range pointer is clamped
  s.run(2.0, "program 0000000000000000000000000401 | pointer 5000 mm"); CHECK(s.b.axis[RULER].target == rulerSteps(RULER_TRAVEL_MM), "clamped to travel");
  // 7. the step rate never exceeds the service rate: measured over one second
  long p0 = s.rulerTrue; s.run(1.0); CHECK(labs(s.rulerTrue - p0) <= (long)RULER_SERVICE_RATE + 1, "ruler rate %ld steps/s", labs(s.rulerTrue - p0));
  printf(failures ? "%d failures\n" : "all checks passed\n", failures);
  return failures ? 1 : 0;
}
