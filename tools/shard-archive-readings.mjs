#!/usr/bin/env node
// Split a legacy single-file archive/readings.json into the per-artist shards the studio loads.
//
// The studio fetches one artist's readings with that artist's works, so a reading lives beside
// the work file it belongs to: archive/readings/<artist-id>.json, plus archive/readings/index.json
// naming the artists that have any. read_works.py writes the shards directly; this tool is for a
// readings.json left over from before the split, or produced by an older checkout mid-run.
//
//   node tools/shard-archive-readings.mjs [path/to/readings.json]
//
// It never deletes the legacy file: it writes the shards, verifies that every record survives the
// round trip, and says what to remove.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs'), path = require('path');
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground/archive');
const legacy = process.argv[2] || path.join(DIR, 'readings.json');
if (!fs.existsSync(legacy)) { console.error('no such file: ' + legacy); process.exit(1); }

const artists = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).artists.slice().sort((a, b) => a.o - b.o);
const owner = (n) => {                      // the artist whose works hold flat index n
  let lo = 0, hi = artists.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (artists[mid].o <= n) lo = mid; else hi = mid - 1; }
  return artists[lo];
};
const all = JSON.parse(fs.readFileSync(legacy, 'utf8'));
const shards = new Map();
let orphans = 0;
for (const [id, rec] of Object.entries(all)) {
  const n = Number(id) - 1000, a = owner(n);
  if (!a || n < a.o || n >= a.o + a.n) { orphans++; continue; }
  if (!shards.has(a.id)) shards.set(a.id, {});
  shards.get(a.id)[id] = rec;
}
const out = path.join(DIR, 'readings');
fs.mkdirSync(out, { recursive: true });
let written = 0;
for (const [id, recs] of shards) {
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(recs) + '\n');
  written += Object.keys(recs).length;
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify([...shards.keys()].sort()) + '\n');

// every record must survive the round trip, or the legacy file is not safe to remove
let back = 0;
for (const id of [...shards.keys()]) {
  const m = JSON.parse(fs.readFileSync(path.join(out, id + '.json'), 'utf8'));
  for (const [k, v] of Object.entries(m)) {
    if (JSON.stringify(v) !== JSON.stringify(all[k])) { console.error('record differs: ' + k); process.exit(1); }
    back++;
  }
}
console.log(Object.keys(all).length + ' readings → ' + shards.size + ' shards, ' + written + ' written, ' + back + ' verified, ' + orphans + ' orphaned');
if (back + orphans !== Object.keys(all).length) { console.error('records lost'); process.exit(1); }
console.log('shards are complete; ' + legacy + ' can now be removed');
