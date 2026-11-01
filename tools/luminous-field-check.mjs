#!/usr/bin/env node
// Checks the claims 056 Luminous Field makes about itself, against the engine the wall plays.
//   1. Exact loop: every canvas's uniform block at t = 1 equals t = 0 bit for bit, for several
//      seeds, walls and option sets.
//   2. Determinism: the same seed and options give identical blocks.
//   3. Seed identity: changing a slider does not change a canvas's random draws.
//   4. Layout: canvases stay inside the wall and do not overlap; fields stay inside their
//      canvas and do not overlap one another.
//   5. Motion: with motion > 0 the blocks change over the loop; with motion 0 they don't.
// Usage: node tools/luminous-field-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const LF = require('../projects/056-luminous-field/engine.js');

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('FAIL', msg); } };

function emit(scene, t, W, H) {
  const out = new Float32Array(LF.MAX_PANELS * LF.STRIDE);
  const n = LF.frame(scene, t, W, H, { intensity: 1 }, out);
  return out.subarray(0, n * LF.STRIDE);
}
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

const walls = [[7680, 1080], [5760, 2160], [3840, 2160], [1920, 1080], [2160, 2160]];
const optionSets = [
  {},
  { motion: 2, hang: 0, fields: 1, register: 4, series: 1 },
  { panels: 5, fields: 3, hang: 0.15, register: 6, feather: 3, scumble: 2 },
];
const seeds = [1, 1903, 1970, 4294967295, 123456789];

for (const [W, H] of walls) for (const o of optionSets) for (const seed of seeds) {
  const opts = Object.assign({ aspect: W / H }, o);
  const s = LF.makeScene(seed, opts);
  const tag = `seed ${seed} ${W}x${H} ${JSON.stringify(o)}`;

  const f0 = emit(s, 0, W, H);
  ok(same(f0, emit(s, 1, W, H)), `loop t=1 ≠ t=0 · ${tag}`);
  ok(same(f0, emit(LF.makeScene(seed, opts), 0, W, H)), `non-deterministic · ${tag}`);
  ok(f0.every(Number.isFinite), `non-finite value · ${tag}`);
  ok(!same(f0, emit(s, 0.37, W, H)), `no motion across the loop · ${tag}`);

  // layout
  const eps = 1e-6;
  let prevRight = -Infinity, inside = true, apart = true, fieldsOk = true;
  for (const P of s.panels) {
    if (P.x < -eps || P.y < -eps || P.x + P.w > opts.aspect + eps || P.y + P.h > 1 + eps) inside = false;
    if (P.x < prevRight - eps) apart = false;
    prevRight = P.x + P.w;
    let prevBottom = -Infinity;
    for (const R of P.layout) {
      if (R.x0 < 0 || R.x1 > P.aspect + eps || R.y0 < 0 || R.y1 > 1 + eps || R.y0 < prevBottom - eps || R.y1 <= R.y0) fieldsOk = false;
      prevBottom = R.y1;
    }
  }
  ok(inside, `canvas outside the wall · ${tag}`);
  ok(apart, `canvases overlap · ${tag}`);
  ok(fieldsOk, `field outside its canvas or overlapping · ${tag}`);
}

// motion 0 → static
{
  const s = LF.makeScene(7, { aspect: 16 / 9, motion: 0 });
  ok(same(emit(s, 0, 3840, 2160), emit(s, 0.61, 3840, 2160)), 'motion 0 still moves');
}

// seed identity under slider changes
{
  const a = LF.makeScene(1955, { aspect: 64 / 9, feather: 0.3, hang: 0.02, fields: 1 }).panels[0];
  const b = LF.makeScene(1955, { aspect: 64 / 9, feather: 2.0, hang: 0.18, fields: 3 }).panels[0];
  ok(a.hueShift === b.hueShift && a.noise[0] === b.noise[0] && a.fields[2].pH === b.fields[2].pH, 'slider changed seed identity');
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
