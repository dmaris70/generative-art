// 049 — Grass Nocturne: the score. When a glitch, a colour or a measurement happens, and which.
//
// Nothing here is random at run time and nothing is accidental. The events fall where number
// theory puts them, and the choice among them comes from a hash of the date and the minute:
//   · a glitch in every minute of the day (0 … 1439) that is a prime number — 227 a day, about
//     9.5 an hour, at irregular gaps of 1 to 14 minutes; not in the minute after a colour minute
//   · a colour minute whenever the clock read as a number, HHMM, is prime (14:23 → 1423)
//   · a measurement every 30 seconds, without break: all twenty-one kinds every 10.5 minutes, shuffled
//   · in a storm where the journey is, extra glitch minutes, up to twice as many (see glitchMinute)
// Every screen computes the same events at the same second, and any day's log can be listed.
(function (global) {
  'use strict';

  const GLITCHES = ['', 'time slice', 'echo', 'sorting', 'transposition', 'quantisation', 'one bit', 'identity', 'mirror', 'inversion', 'recursion'];
  const LOUD = [8, 9];                      // mirror and inversion: a few times a day, not every hour
  const QUIET = [1, 2, 3, 4, 5, 6, 7, 10];
  const COLOURS = ['', 'hue by hash', 'hue by depth', 'hue by time', 'hue by cluster', 'complement', 'prime colour', 'gust in colour', 'dichroic'];
  const MEASURES = ['', 'blade', 'probability', 'census', 'frame', 'next prime', 'phase', 'repeat', 'wind', 'entropy', 'today', 'place', 'wind there', 'air', 'sky', 'condition', 'ground', 'nearest', 'travelled', 'crossing', 'antipode', 'sea'];
  const NM = MEASURES.length - 1;

  function ih(x) {
    x >>>= 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
    return x >>> 0;
  }
  function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
  }
  const local = (ms) => ms - new Date(ms).getTimezoneOffset() * 60000;
  const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const minuteOf = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
  const secondOf = (ms) => { const d = new Date(ms); return d.getSeconds() + d.getMilliseconds() / 1000; };
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const envelope = (p, a) => smooth(p / a) * smooth((1 - p) / a);

  // boost: the day after the journey crosses a tropic, HHMM + 2400 being prime also counts
  function colourMinute(day, m, boost = false) {
    if (m < 0) return null;
    const hhmm = Math.floor(m / 60) * 100 + (m % 60);
    if (!isPrime(hhmm) && !(boost && isPrime(hhmm + 2400))) return null;
    const h = ih((day * 1441 + m) ^ 0xc0104e);
    return { mode: 1 + (h % 8), hue: (ih(h) % 3600) / 3600, hhmm, m };
  }
  // storm (0…1) from the weather where the journey is: also the minutes m for which m + 1440,
  // m + 2880 or m + 4320 is prime, kept with probability `storm` — about twice as many in a gale
  function glitchMinute(day, m, storm = 0) {
    const extra = storm > 0 && (isPrime(m + 1440) || isPrime(m + 2880) || isPrime(m + 4320)) && (ih((day * 1441 + m) ^ 0x57) % 1000) / 1000 < storm;
    if ((!isPrime(m) && !extra) || colourMinute(day, m - 1)) return null;
    const h = ih((day * 1441 + m) ^ 0x6117c4);
    let kind = 1 + (h % 10);
    if (LOUD.includes(kind) && ih(h) % 8 !== 0) kind = QUIET[ih(h ^ 7) % QUIET.length];
    return { kind, start: 5 + (ih(h ^ 1) % 35), dur: 6 + (ih(h ^ 2) % 15), m };
  }
  function glitchAt(ms, storm = 0) {
    const g = glitchMinute(dayKey(ms), minuteOf(ms), storm), s = secondOf(ms);
    if (!g || s < g.start || s >= g.start + g.dur) return null;
    const p = (s - g.start) / g.dur;
    return Object.assign({}, g, { p, e: envelope(p, 0.15), name: GLITCHES[g.kind] });
  }
  function colourAt(ms, boost = false) {
    const c = colourMinute(dayKey(ms), minuteOf(ms), boost);
    if (!c) return null;
    const p = secondOf(ms) / 60;
    return Object.assign({}, c, { p, e: envelope(p, 4 / 60), name: COLOURS[c.mode] });
  }
  // every 7.5 minutes, each of the fifteen measurements once, in a shuffled order; a block never
  // opens with the kind that closed the one before
  function block(b) {
    const order = Array.from({ length: NM }, (_, i) => i + 1);
    for (let i = NM - 1; i > 0; i--) { const j = ih((b * 11 + i) ^ 0x3e45) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  function measureKind(k) {
    const b = Math.floor(k / NM), i = k - b * NM, order = block(b);
    if (order[0] === block(b - 1)[NM - 1]) [order[0], order[1]] = [order[1], order[0]];
    return order[i];
  }
  function measureAt(ms) {
    const t = local(ms) / 1000, k = Math.floor(t / 30), within = t - k * 30;
    const p = Math.min(1, within / 28), kind = measureKind(k);
    return { kind, k, p, e: within < 28 ? envelope(p, 2 / 28) : 0, h: ih(k ^ 0x5a17), name: MEASURES[kind] };
  }
  // the next prime minute after this one, and the next prime clock time
  function nextPrimes(ms) {
    const m = minuteOf(ms);
    let a = m + 1; while (!isPrime(a % 1440)) a++;
    let b = m + 1; while (!isPrime(Math.floor((b % 1440) / 60) * 100 + ((b % 1440) % 60))) b++;
    return { minute: a % 1440, inSeconds: Math.round((a - m) * 60 - secondOf(ms)), clock: b % 1440 };
  }
  // everything that happens on a day, or up to a moment on it: the piece's logbook
  function eventsFor(ms, upTo = Infinity) {
    const day = dayKey(ms), out = [], until = upTo === Infinity ? 1440 : minuteOf(upTo) + 1;
    for (let m = 0; m < until; m++) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      const g = glitchMinute(day, m), c = colourMinute(day, m);
      if (c) out.push({ at: hh + ':00', type: 'colour', name: COLOURS[c.mode], why: c.hhmm + ' is prime' });
      if (g) out.push({ at: hh + ':' + String(g.start).padStart(2, '0'), type: 'glitch', name: GLITCHES[g.kind], seconds: g.dur, why: 'minute ' + m + ' is prime' });
    }
    return out;
  }
  function todaySoFar(ms) {
    const ev = eventsFor(ms, ms), measures = Math.floor((minuteOf(ms) * 60 + secondOf(ms)) / 30) + 1;
    const glitches = ev.filter((e) => e.type === 'glitch').length, colours = ev.length - glitches;
    return { glitches, colours, measures, events: glitches + colours + measures };
  }

  const api = { GLITCHES, COLOURS, MEASURES, isPrime, ih, dayKey, minuteOf, glitchAt, colourAt, measureAt, nextPrimes, eventsFor, todaySoFar, glitchMinute, colourMinute };
  global.Score = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
