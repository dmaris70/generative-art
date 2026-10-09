#!/usr/bin/env node
// Freeze 027 — record exactly what makes a seed's picture, and check it later.
//   node tools/ridge-freeze.mjs write   → projects/028-ridge-encounters/FREEZE.json (hashes of engine, painter, parts, every DEM, the place
//                                          list, the deal weights; plus 8 witness seeds with a checksum of their painted sheets)
//   node tools/ridge-freeze.mjs check   → re-hashes everything, repaints the witnesses, and says whether the piece still produces the same pixels
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), P = path.join(root, 'projects/028-ridge-encounters');
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const files = ['compose.js', 'parts.js', 'worker.js', 'index.html', '../../assets/drybrush.js'];
const ix = JSON.parse(fs.readFileSync(path.join(P, 'dem/index.json')));
const record = { frozen: new Date().toISOString(), version: '1.4', files: {}, dems: {}, places: ix.places.map(m => m.slug), witnesses: {} };
for (const f of files) record.files[f] = sha(fs.readFileSync(path.join(P, f)));
for (const m of ix.places) record.dems[m.slug] = sha(fs.readFileSync(path.join(P, 'dem', m.slug + '.dem')));
// the deal, read out of the engine text so a change to the weights is a change to the record
const src = fs.readFileSync(path.join(P, 'compose.js'), 'utf8');
record.deal = { moods: (src.match(/\(m => m < \d+ \? 'exposure'[^)]*\)/) || [''])[0], events: (src.match(/er < 0\.05 \? '\w+' : er < 0\.09[^;]*;/) || [''])[0], pairs: (src.match(/pr < 0\.3 \? 'panorama'[^;]*;/) || [''])[0], temper: (src.match(/const TEMPER = \{[^}]*\}/) || [''])[0] };
// witnesses: paint eight seeds and checksum the pixels
const DB = require(path.join(root, 'assets/drybrush.js')), C = require(path.join(P, 'compose.js')), PARTS = require(path.join(P, 'parts.js'));
for (const m of ix.places) { const b = zlib.gunzipSync(fs.readFileSync(path.join(P, 'dem', m.slug + '.dem'))), a = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), n = m.size; for (let y = 0; y < n; y++) for (let x = 1; x < n; x++) a[y * n + x] += a[y * n + x - 1]; C.setDEM(m.slug, m, a); }
const WITNESS = [3300023, 2555193, 1320403, 636848, 221429, 3928425, 2130774, 1718125];
for (const seed of WITNESS) { const sh = C.sheets(PARTS, { seed }); const h = crypto.createHash('sha256'); sh.forEach((s, i) => h.update(DB.paint(s, { seed: seed + i, bristle: s.temper.bristle, streak: s.temper.streak, grain: s.temper.grain }).rgba)); record.witnesses[seed] = { place: sh[0].place, register: sh[0].regime, pixels: h.digest('hex').slice(0, 16) }; }
const out = path.join(P, 'FREEZE.json');
if (process.argv[2] === 'write') { fs.writeFileSync(out, JSON.stringify(record, null, 1)); console.log('frozen →', out, Object.keys(record.dems).length, 'places,', WITNESS.length, 'witnesses'); }
else {
  const F = JSON.parse(fs.readFileSync(out)); let ok = true;
  for (const k in F.files) if (F.files[k] !== record.files[k]) { console.log('CHANGED file', k); ok = false; }
  for (const k in F.dems) if (F.dems[k] !== record.dems[k]) { console.log('CHANGED dem', k); ok = false; }
  if (JSON.stringify(F.places) !== JSON.stringify(record.places)) { console.log('CHANGED place list'); ok = false; }
  for (const k in F.deal) if (F.deal[k] !== record.deal[k]) { console.log('CHANGED deal:', k); ok = false; }
  for (const s in F.witnesses) if (F.witnesses[s].pixels !== record.witnesses[s].pixels) { console.log('CHANGED pixels for witness', s); ok = false; }
  console.log(ok ? 'FROZEN: every witness paints the same pixels as at the freeze (' + F.frozen + ')' : 'NOT the frozen piece — the kept seeds may no longer mean what they meant');
  process.exit(ok ? 0 : 1);
}
