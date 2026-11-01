#!/usr/bin/env node
// Batch-render Loop Engine GIFs (projects/053-loop-engine) without a browser.
// Output is byte-identical to the in-browser export for the same seed + options.
//
//   node tools/loopgif.mjs [seed ...] [--count N] [--out DIR] [--palette primaries] [--cards 1]
//        [--streams 1] [--trail 18] [--body 1] [--debris 40] [--grain 0.35] [--spin 1]
//        [--cells 160] [--aspect 16:9] [--frames 96] [--delay 4] [--zoom 1] [--scale 6]
//
// No seeds and no --count → one random seed. --count N → N random seeds.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const E = require(join(here, '../projects/053-loop-engine/engine.js'));

const args = process.argv.slice(2);
const opts = {};
const seeds = [];
let out = 'loopgif-out', count = 0;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) { seeds.push(a); continue; }
  const k = a.slice(2), v = args[++i];
  if (k === 'out') out = v;
  else if (k === 'count') count = +v;
  else if (k === 'palette' || k === 'aspect') opts[k] = v;
  else if (k in E.DEFAULTS || k === 'scale') opts[k] = +v;
  else { console.error(`unknown option --${k}`); process.exit(1); }
}
for (let i = 0; i < count; i++) seeds.push(String((Math.random() * 4294967296) >>> 0));
if (!seeds.length) seeds.push(String((Math.random() * 4294967296) >>> 0));

mkdirSync(out, { recursive: true });
for (const s of seeds) {
  const t0 = Date.now();
  const { scene, bytes } = E.renderGIF(s, opts);
  const file = join(out, `loop-${scene.seed}.gif`);
  writeFileSync(file, bytes);
  console.log(`${file}  ${scene.W}x${scene.H} cells · ${scene.frames} frames · ${(bytes.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms`);
}
