#!/usr/bin/env node
// Merge a legacy single-file archive/readings.json into the per-artist shards, adding only the
// records the shards do not already hold.
//
//   node tools/merge-archive-readings.mjs path/to/readings.json [--prefer-new]
//
// A reading read on an older checkout can be poorer than the one already here — it may carry no
// grain bins, for instance — so by default an id that already has a shard record is left alone and
// counted as held. --prefer-new reverses that, for when the incoming file is the better one.
//
// It never deletes the file it reads. Every record it writes is read back and compared before it
// reports success.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs'), path = require('path');
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground/archive');
const src = process.argv[2];
const preferNew = process.argv.includes('--prefer-new');
if (!src || !fs.existsSync(src)) { console.error('usage: node tools/merge-archive-readings.mjs path/to/readings.json [--prefer-new]'); process.exit(1); }

const artists = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).artists.slice().sort((a, b) => a.o - b.o);
const owner = (n) => {
  let lo = 0, hi = artists.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (artists[mid].o <= n) lo = mid; else hi = mid - 1; }
  return artists[lo];
};
const out = path.join(DIR, 'readings');
fs.mkdirSync(out, { recursive: true });
const shards = new Map();                       // artist id -> { reading id: record }
for (const f of fs.readdirSync(out)) {
  if (!f.endsWith('.json') || f === 'index.json' || f === 'failures.json') continue;
  shards.set(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')));
}
const before = [...shards.values()].reduce((n, m) => n + Object.keys(m).length, 0);

const incoming = JSON.parse(fs.readFileSync(src, 'utf8'));
let added = 0, held = 0, replaced = 0, orphans = 0;
const touched = new Set();
for (const [id, rec] of Object.entries(incoming)) {
  const n = Number(id) - 1000, a = owner(n);
  if (!a || n < a.o || n >= a.o + a.n) { orphans++; continue; }
  if (!shards.has(a.id)) shards.set(a.id, {});
  const m = shards.get(a.id);
  if (id in m) { if (preferNew) { m[id] = rec; replaced++; touched.add(a.id); } else held++; continue; }
  m[id] = rec; added++; touched.add(a.id);
}
for (const id of touched) fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(shards.get(id)) + '\n');
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify([...shards.keys()].filter((k) => Object.keys(shards.get(k)).length).sort()) + '\n');

// read every touched shard back and compare, so a partial write cannot pass for a merge
let verified = 0;
for (const id of touched) {
  const m = JSON.parse(fs.readFileSync(path.join(out, id + '.json'), 'utf8'));
  for (const [k, v] of Object.entries(shards.get(id))) {
    if (JSON.stringify(m[k]) !== JSON.stringify(v)) { console.error('record differs after writing: ' + k); process.exit(1); }
    verified++;
  }
}
const after = [...shards.values()].reduce((n, m) => n + Object.keys(m).length, 0);
console.log(`${before} readings held, ${Object.keys(incoming).length} offered → ${added} added, ${held} already held, ${replaced} replaced, ${orphans} orphaned`);
console.log(`${after} readings now, across ${[...shards.keys()].filter((k) => Object.keys(shards.get(k)).length).length} artists; ${verified} records verified in ${touched.size} shards written`);
const noGrain = [...shards.values()].reduce((n, m) => n + Object.values(m).filter((r) => !r.ebins).length, 0);
if (noGrain) console.log(`${noGrain} of them carry no grain bins (read before ebins existed)`);
