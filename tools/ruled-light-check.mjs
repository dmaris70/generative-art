#!/usr/bin/env node
// Checks the claims 055 Ruled Light makes about itself, against the engine the wall plays.
//   1. Exact loop: segments at t = 1 (frame N of N) equal segments at t = 0 bit for bit, for
//      several seeds, walls and option sets.
//   2. Determinism: the same seed and options give identical scenes and segments.
//   3. Seed identity: changing a slider does not change which random draws a bundle gets.
//   4. Rule: every emitted mark is a straight segment with finite endpoints.
//   5. Motion: with motion > 0 the frame actually changes over the loop; with motion 0 it doesn't.
// Usage: node tools/ruled-light-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RL = require('../projects/055-ruled-light/engine.js');

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('FAIL', msg); } };

function emit(scene, t, W, H, look) {
  const out = new Float32Array(scene.capacity * RL.STRIDE);
  const n = RL.segments(scene, t, W, H, look, out);
  return out.subarray(0, n * RL.STRIDE);
}
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

const walls = [[7680, 1080], [5760, 2160], [3840, 1080], [1920, 1080]];
const optionSets = [
  {},
  { motion: 1.5, crossing: 0.2, warp: 1, ascent: 1, ground: 0.5 },
  { bundles: 20, filaments: 40, spread: 1.1, accent: 0.6 },
];
const seeds = [1, 1955, 61, 4294967295, 123456789];

for (const [W, H] of walls) for (const o of optionSets) for (const seed of seeds) {
  const opts = Object.assign({ aspect: W / H }, o);
  const look = { palette: 1, intensity: 0.07 };
  const s = RL.makeScene(seed, opts);
  const tag = `seed ${seed} ${W}x${H} ${JSON.stringify(o)}`;

  const f0 = emit(s, 0, W, H, look);
  ok(same(f0, emit(s, 1, W, H, look)), `loop t=1 ≠ t=0 · ${tag}`);

  ok(same(f0, emit(RL.makeScene(seed, opts), 0, W, H, look)), `non-deterministic · ${tag}`);

  let finite = true;
  for (let i = 0; i < f0.length; i++) if (!Number.isFinite(f0[i])) { finite = false; break; }
  ok(finite, `non-finite coordinate · ${tag}`);

  const mid = emit(s, 0.37, W, H, look);
  ok(!same(f0, mid), `no motion across the loop · ${tag}`);
}

// motion 0 → static
{
  const s = RL.makeScene(7, { aspect: 64 / 9, motion: 0 });
  const look = { palette: 0, intensity: 0.07 };
  ok(same(emit(s, 0, 7680, 1080, look), emit(s, 0.61, 7680, 1080, look)), 'motion 0 still moves');
}

// seed identity under slider changes: bundle 0's draws are the same whatever the options
{
  const a = RL.makeScene(1955, { aspect: 64 / 9, spread: 0.3, warp: 0.1 }).bundles[0];
  const b = RL.makeScene(1955, { aspect: 64 / 9, spread: 1.0, warp: 0.9 }).bundles[0];
  ok(a.x === b.x && a.y === b.y && a.ang0 === b.ang0 && a.kc === b.kc && a.pc === b.pc, 'slider changed seed identity');
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
