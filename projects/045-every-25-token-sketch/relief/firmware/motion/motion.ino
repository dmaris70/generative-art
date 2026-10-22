// The motion board — stage 3 of Every 25-Token Sketch in the room. ESP32 (Arduino core 2.x).
//
// Drives the counter's four motorised drums and the ruler's pointer on five TMC2209 drivers,
// homes them at power-up, and follows the controller's lines over USB serial:
//
//   program 0000000000000000000000000397 | pointer 298.123 mm | lane … | found … | distinct …
//
// The last four digits go to drums 25 … 28 (one forward digit each, 9 rolling to 0); the
// millimetres go to the pointer. Test commands for the acceptance tests (type them into the
// serial monitor at 115200):
//
//   home            home all five axes            status      positions, digits, homed flags
//   home drums      home the drums only           drum N D    turn drum N (1 … 4) forward to digit D
//   home ruler      home the ruler only           pointer X   move the pointer to X mm (0 … 1840)
//   test            the acceptance sequence: each drum 0 … 9 and back to 0, the pointer to the
//                   ticks for shelves 5, 7, 9 and 25 and home, at the test speed
//   stop            stop every axis where it is (then home before service)
//
// Wiring (see README.md): STEP/DIR per axis, one shared ENABLE, two UARTs for the drivers
// (drums 0 … 3 on UART1 at addresses 0 … 3 by MS1/MS2; the ruler on UART2 at address 0), four
// optical index inputs on the input-only pins with external 10 k pull-ups, the home switch
// on GPIO 4 with its internal pull-up. The core logic is in motion_core.h and is tested on a
// host by test_core.cpp; this file is the hardware.
#include <Arduino.h>
#include <TMCStepper.h>
#include "motion_core.h"

using namespace motion;

// ── pins ──
static const int STEP_PIN[AXES] = {18, 19, 21, 22, 27};
static const int DIR_PIN[AXES]  = {23, 5, 13, 14, 32};
static const int EN_PIN = 33;                                  // active low, shared
static const int INDEX_PIN[N_DRUMS] = {34, 35, 36, 39};        // input only: 10 k pull-ups to 3V3 on the board
static const int HOME_PIN = 4;                                 // the ruler's switch to GND, internal pull-up
static const bool INDEX_ACTIVE_LOW = true;                     // a transmissive slot sensor pulls low when the slot lets light through
static const bool HOME_ACTIVE_LOW = true;
static const bool DIR_INVERT[AXES] = {false, false, false, false, false};   // flip any axis that runs the wrong way

// ── the TMC2209s over UART ──
HardwareSerial DrumUart(1);                                    // RX 16, TX 17
HardwareSerial RulerUart(2);                                   // RX 26, TX 25
static const float R_SENSE = 0.11f;
TMC2209Stepper drv[AXES] = {
  TMC2209Stepper(&DrumUart, R_SENSE, 0b00), TMC2209Stepper(&DrumUart, R_SENSE, 0b01),
  TMC2209Stepper(&DrumUart, R_SENSE, 0b10), TMC2209Stepper(&DrumUart, R_SENSE, 0b11),
  TMC2209Stepper(&RulerUart, R_SENSE, 0b00),
};
static const uint16_t RUN_mA[AXES] = {600, 600, 600, 600, 1200};
static const uint8_t  HOLD_PCT[AXES] = {8, 8, 8, 8, 10};        // hold current, percent of run: enough to keep a drum on its digit and the belt still, little heat

Board board;
hw_timer_t* timer = nullptr;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t ticks = 0;

void IRAM_ATTR onTick() {
  portENTER_CRITICAL_ISR(&mux);
  for (int i = 0; i < AXES; i++) {
    int s = board.axis[i].tick();
    if (s) {
      digitalWrite(DIR_PIN[i], ((s > 0) != DIR_INVERT[i]) ? HIGH : LOW);
      digitalWrite(STEP_PIN[i], HIGH);
      delayMicroseconds(2);                                    // TMC2209 minimum step high time is 100 ns
      digitalWrite(STEP_PIN[i], LOW);
    }
  }
  ticks++;
  portEXIT_CRITICAL_ISR(&mux);
}

static void setupDriver(int i) {
  drv[i].begin();
  drv[i].toff(4); drv[i].blank_time(24);
  drv[i].rms_current(RUN_mA[i]);
  drv[i].ihold((uint8_t)(31 * HOLD_PCT[i] / 100)); drv[i].iholddelay(8);   // hold current as a fraction of run; 8 × 2^18 clocks to decay
  drv[i].microsteps(16);
  drv[i].pwm_autoscale(true); drv[i].en_spreadCycle(false);  // stealthChop: the drums and the belt must be quiet; the flip-dots are the sound
  drv[i].TPOWERDOWN(20);
}

static void readSensors(bool s[AXES]) {
  for (int i = 0; i < N_DRUMS; i++) { int v = digitalRead(INDEX_PIN[i]); s[i] = INDEX_ACTIVE_LOW ? v == LOW : v == HIGH; }
  int h = digitalRead(HOME_PIN); s[RULER] = HOME_ACTIVE_LOW ? h == LOW : h == HIGH;
}

static void printStatus() {
  Serial.print("status");
  for (int i = 0; i < N_DRUMS; i++) { Serial.printf(" | drum%d %d (%ld) %s", i + 25, board.drumDigit(i), (long)board.axis[i].position, board.axis[i].homed ? "homed" : "unhomed"); }
  Serial.printf(" | pointer %.3f mm (%ld) %s", board.pointerMm(), (long)board.axis[RULER].position, board.axis[RULER].homed ? "homed" : "unhomed");
  bool s[AXES]; readSensors(s);
  Serial.printf(" | index %d%d%d%d home %d\n", s[0], s[1], s[2], s[3], s[RULER]);
}

// the acceptance sequence runs as a small script, one step per call, so the loop keeps servicing
static int testStep = -1; static uint32_t testWait = 0;
static const double TEST_TICKS_MM[] = {303.6, 450.4, 600.4, 1840.0, 0.0};   // shelves 5, 7, 9, 25 (from CONSTRUCTION.md), then home
static void runTest() {
  if (testStep < 0) return;
  bool busy = false; for (int i = 0; i < AXES; i++) if (!board.axis[i].idle()) busy = true;
  if (busy || millis() < testWait) return;
  if (testStep < 44) {                                                      // 0 … 43: each drum 0 → 9 → 0, one digit at a time
    int drum = testStep / 11, k = testStep % 11, digit = k == 10 ? 0 : k;
    board.axis[drum].target = nextForward(board.axis[drum].position, digit);
    Serial.printf("test: drum %d to %d\n", drum + 25, digit); testWait = millis() + 400;
  } else if (testStep < 49) {
    double mm = TEST_TICKS_MM[testStep - 44];
    board.axis[RULER].maxRate = RULER_TEST_RATE; board.axis[RULER].target = rulerSteps(mm);
    Serial.printf("test: pointer to %.1f mm — check against the engraved tick, then press enter\n", mm); testWait = millis() + 1500;
  } else { board.axis[RULER].maxRate = RULER_SERVICE_RATE; Serial.println("test: done"); testStep = -1; return; }
  testStep++;
}

static void handleLine(char* line) {
  while (*line == ' ') line++;
  size_t n = strlen(line); while (n && (line[n - 1] == '\r' || line[n - 1] == ' ')) line[--n] = 0;
  if (!n) return;
  Command c;
  if (strncmp(line, "program ", 8) == 0 && parseControllerLine(line, c)) { if (board.allHomed()) { board.apply(c); } else Serial.println("err not homed"); return; }
  if (strcmp(line, "home") == 0) { board.homeAll(); Serial.println("ok homing all"); return; }
  if (strcmp(line, "home drums") == 0) { board.homeDrums(); Serial.println("ok homing drums"); return; }
  if (strcmp(line, "home ruler") == 0) { board.homeRuler(); Serial.println("ok homing ruler"); return; }
  if (strcmp(line, "status") == 0) { printStatus(); return; }
  if (strcmp(line, "stop") == 0) { for (int i = 0; i < AXES; i++) { board.axis[i].target = board.axis[i].position; board.axis[i].rate = 0; board.homing[i].state = Home::Idle; } testStep = -1; Serial.println("ok stopped"); return; }
  if (strcmp(line, "test") == 0) { if (!board.allHomed()) { Serial.println("err home first"); return; } testStep = 0; Serial.println("ok test"); return; }
  int d, digit; double mm;
  if (sscanf(line, "drum %d %d", &d, &digit) == 2 && d >= 1 && d <= N_DRUMS && digit >= 0 && digit <= 9) {
    if (!board.axis[d - 1].homed) { Serial.println("err drum not homed"); return; }
    board.axis[d - 1].target = nextForward(board.axis[d - 1].position, digit); Serial.printf("ok drum %d to %d\n", d, digit); return;
  }
  if (sscanf(line, "pointer %lf", &mm) == 1) {
    if (!board.axis[RULER].homed) { Serial.println("err ruler not homed"); return; }
    board.axis[RULER].maxRate = RULER_TEST_RATE; board.axis[RULER].target = rulerSteps(mm); Serial.printf("ok pointer to %.3f mm\n", mm); return;
  }
  Serial.printf("err unknown: %s\n", line);
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < AXES; i++) { pinMode(STEP_PIN[i], OUTPUT); pinMode(DIR_PIN[i], OUTPUT); digitalWrite(STEP_PIN[i], LOW); }
  pinMode(EN_PIN, OUTPUT); digitalWrite(EN_PIN, HIGH);          // disabled until the drivers are configured
  for (int i = 0; i < N_DRUMS; i++) pinMode(INDEX_PIN[i], INPUT);
  pinMode(HOME_PIN, INPUT_PULLUP);
  DrumUart.begin(115200, SERIAL_8N1, 16, 17); RulerUart.begin(115200, SERIAL_8N1, 26, 25);
  delay(100);
  for (int i = 0; i < AXES; i++) setupDriver(i);
  digitalWrite(EN_PIN, LOW);
  timer = timerBegin(0, 80, true);                             // 80 MHz / 80 = 1 MHz
  timerAttachInterrupt(timer, &onTick, true);
  timerAlarmWrite(timer, 1000000 / TICK_HZ, true);              // 50 µs: the 20 kHz step tick
  timerAlarmEnable(timer);
  Serial.println("motion board: every 25-token sketch. homing.");
  board.homeAll();
}

static char lineBuf[256]; static size_t lineLen = 0;
static uint32_t lastService = 0; static bool wasHoming = true;

void loop() {
  // the 1 kHz service: sensors, homing, planning
  uint32_t now = micros();
  if (now - lastService >= 1000) {
    double dt = (now - lastService) / 1e6; lastService = now;
    bool s[AXES]; readSensors(s);
    portENTER_CRITICAL(&mux); board.service(s, dt); portEXIT_CRITICAL(&mux);
    bool homingNow = board.homingAny();
    if (wasHoming && !homingNow) {
      bool failed = false; for (int i = 0; i < AXES; i++) if (board.homing[i].state == Home::Failed) { failed = true; Serial.printf("err homing failed on axis %d\n", i); }
      if (!failed && board.allHomed()) Serial.println("ok homed");
    }
    wasHoming = homingNow;
    runTest();
  }
  // lines from the controller or the tester
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { lineBuf[lineLen] = 0; handleLine(lineBuf); lineLen = 0; }
    else if (lineLen < sizeof(lineBuf) - 1) lineBuf[lineLen++] = ch;
    else lineLen = 0;                                           // an overlong line is dropped
  }
}
