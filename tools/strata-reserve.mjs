#!/usr/bin/env node
// strata-reserve.mjs — pick the edition's reserves by rule and record them.
//
// Two per style from edition/edition-256.json: the artist proof is the
// highest-scoring token of the style (ties: lower seed); the institutional
// reserve is the lowest-numbered plan-and-section token of the style that is
// not the artist proof. Writes edition/reserves-256.json. The edition record
// itself is never modified (its hash is in the freeze).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'projects', '011-isometric-strata', 'edition');
const ed = JSON.parse(fs.readFileSync(path.join(dir, 'edition-256.json'), 'utf8'));
const styles = [...new Set(ed.tokens.map((t) => t.style))];
const reserves = [];
for (const style of styles) {
  const ts = ed.tokens.filter((t) => t.style === style);
  const ap = ts.slice().sort((a, b) => b.bits - a.bits || a.seed - b.seed)[0];
  const inst = ts.filter((t) => t.view === 'PLAN + SECTION' && t !== ap).sort((a, b) => a.edition - b.edition)[0];
  reserves.push({ edition: ap.edition, seed: ap.seed, style, kind: 'ARTIST PROOF', rule: 'highest score in style', bits: ap.bits });
  reserves.push({ edition: inst.edition, seed: inst.seed, style, kind: 'INSTITUTIONAL', rule: 'lowest-numbered plan and section in style', bits: inst.bits });
}
reserves.sort((a, b) => a.edition - b.edition);
const out = { size: ed.size, reserved: reserves.length, offered: ed.size - reserves.length, rules: ['two per style', 'artist proof: highest score in style, lower seed on ties', 'institutional: lowest-numbered plan-and-section token in style not already the artist proof'], reserves };
fs.writeFileSync(path.join(dir, 'reserves-256.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${reserves.length} reserved, ${out.offered} offered: ` + reserves.map((r) => `${r.edition}${r.kind === 'ARTIST PROOF' ? 'AP' : 'I'}`).join(' '));
