#!/usr/bin/env node
// Checks the claims 060 Poured Ground makes about its data and its score (no GPU needed).
//   1. Palettes: 133 colorlisa palettes, 5 valid hex colours each, artist + painting present.
//   2. Colour assignment: ground + 4 pigments always come from the palette (or paper white),
//      with no colour used twice by index, and lightest/darkest grounds are what they say.
//   3. Determinism: the same seed and options give an identical score.
//   4. Score sanity: every pour and every drag point lies inside the image; drags run
//      forward in time; the score ends after its last event.
//   5. Print geometry: sheet pixels = mm / 25.4 × dpi, for every format and orientation.
// Usage: node tools/poured-ground-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../projects/060-poured-ground/palettes.js');
require('../projects/060-poured-ground/engine.js');
const PALS = globalThis.PALETTES, PG = globalThis.PouredGround;

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log('FAIL', m); } };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

ok(PALS.length === 133, 'palette count ' + PALS.length);
for (const p of PALS) {
  ok(p.artist && p.painting, 'names ' + p.id);
  ok(p.colors.length === 5 && p.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'colours ' + p.id);
}

for (const p of PALS) for (const ground of [0, 1, 2]) {
  const c = PG.assignColours(p.colors, ground, mulberry32(p.id * 7 + ground));
  ok(c.pigments.length === 4 && new Set(c.sourceIndex).size === 4, 'four distinct pigments ' + p.id);
  ok(c.pigments.every((h) => p.colors.includes(h)), 'pigments from palette ' + p.id);
  if (ground === 2) ok(c.ground === PG.PAPER, 'paper ground');
  else {
    const L = p.colors.map(PG.luminance), g = PG.luminance(c.ground);
    ok(ground === 0 ? g === Math.max(...L) : g === Math.min(...L), 'ground extreme ' + p.id + '/' + ground);
  }
}

const aspects = [[1, 1.25], [1.25, 1], [1, 1], [1, 1.414]];
for (let seed = 1; seed <= 40; seed++) for (const style of [0, 1, 2, 3, 4]) {
  const aspect = aspects[seed % aspects.length];
  const o = { style, pours: 4 + (seed % 20), energy: 0.4 + (seed % 5) * 0.4, aspect };
  const a = PG.compose(mulberry32(seed), o), b = PG.compose(mulberry32(seed), o);
  ok(JSON.stringify(a) === JSON.stringify(b), 'determinism ' + seed + '/' + style);
  let last = 0;
  for (const e of a.events) {
    if (e.type === 'pour') {
      ok(e.x > 0 && e.x < 1 && e.y > 0 && e.y < 1 && e.pig >= 0 && e.pig < 4, 'pour inside ' + seed);
      last = Math.max(last, e.t);
    } else {
      ok(e.t1 > e.t0, 'drag forward ' + seed);
      ok(e.pts.every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1), 'drag inside ' + seed + '/' + style);
      last = Math.max(last, e.t1);
    }
  }
  ok(a.steps > last, 'score ends after last event');
}

for (let f = 0; f < PG.FORMAT_KEYS.length; f++) for (const land of [false, true]) for (const dpi of [150, 300, 360]) {
  const s = PG.sheet(f, land, 40, dpi);
  ok(s.px[0] === Math.round(s.mm[0] / 25.4 * dpi) && s.px[1] === Math.round(s.mm[1] / 25.4 * dpi), 'px ' + s.name);
  ok(land ? s.mm[0] >= s.mm[1] : s.mm[0] <= s.mm[1], 'orientation ' + s.name);
  ok(Math.abs(s.aspect[0] / s.aspect[1] - s.imageMM[0] / s.imageMM[1]) < 1e-12, 'aspect ' + s.name);
}

console.log(failures ? `${failures} of ${checks} checks failed` : `all ${checks} checks pass`);
process.exit(failures ? 1 : 0);
