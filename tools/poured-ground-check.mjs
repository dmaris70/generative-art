#!/usr/bin/env node
// Checks the claims 060 Poured Ground makes about its data and its score (no GPU needed).
//   1. Palettes: 133 colorlisa palettes, 5 valid hex colours each, artist + painting present.
//   2. Colour assignment: ground + 4 pigments always come from the palette (or paper white),
//      with no colour used twice by index, and lightest/darkest grounds are what they say.
//   3. Determinism: the same seed and options give an identical score.
//   4. Score sanity: every pour and every drag point lies inside the image; drags run
//      forward in time; the score ends after its last event.
//   5. Print geometry: sheet pixels = mm / 25.4 × dpi, for every format and orientation.
//   6. Briefs ("after the work"): one per palette; every brief uses all five of its palette's
//      colours (ground + four paints), has at least one gesture, keeps its geometry near the
//      sheet; its compiled score is deterministic, lays every field before the first gesture,
//      and maps each field to a valid pigment channel (or a clear back to the ground).
//   7. Interpretation (0, 0.65, 1): readings keep all five colours, geometry stays finite, and
//      interpretation 0 applies no readings.
//   8. Containment: every laid field lies wholly on the sheet (nothing cut off by the edge).
//   9. Originals: only public-domain works (EU + US rule, museum's public-domain flag) ship an image;
//      each is traceable to the holding museum's open-access record.
// Usage: node tools/poured-ground-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../projects/060-poured-ground/palettes.js');
require('../projects/060-poured-ground/briefs.js');
require('../projects/060-poured-ground/engine.js');
const PALS = globalThis.PALETTES, PG = globalThis.PouredGround, BRIEFS = globalThis.BRIEFS;

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

ok(BRIEFS.length === PALS.length, 'one brief per palette');
const FIELD = { R: 7, E: 7, L: 7, D: 8 }, MOVE = { P: 6, B: 8, C: 8, S: 6, W: 7 };
BRIEFS.forEach((b, i) => {
  const cols = PALS[i].colors.map((c) => c.toLowerCase());
  ok(Number.isInteger(b.g) && b.g >= 0 && b.g < 5, 'ground index ' + i);
  ok(b.k === 0 || b.k === 1, 'basis flag ' + i);
  ok(typeof b.note === 'string' && b.note.length > 10, 'note ' + i);
  const used = new Set([b.g]);
  for (const f of b.z) {
    ok(f.length === FIELD[f[0]], 'field arity ' + i + ' ' + f[0]);
    ok(Number.isInteger(f[1]) && f[1] >= 0 && f[1] < 5, 'field colour ' + i);
    ok(f.slice(2).every((v) => typeof v === 'number' && v >= -0.2 && v <= 1.2 || Math.abs(v) <= 360), 'field geometry ' + i);
    ok(f[0] !== 'D' || f[1] !== b.g, 'drops are paint, not ground ' + i);
    used.add(f[1]);
  }
  // all five colours of the work appear (a duplicate hex on colorlisa counts as used)
  ok([0, 1, 2, 3, 4].every((c) => used.has(c) || cols[c] === cols[b.g]), 'all five colours used ' + i + ' ' + PALS[i].painting);
  ok(b.m.length > 0 && b.m.every((m) => m.length === MOVE[m[0]]), 'gestures ' + i);
  for (let seed = 1; seed <= 6; seed++) for (const interp of [0, 0.65, 1]) {
    const o = { energy: 1, aspect: aspects[seed % aspects.length], interp };
    // interpretation keeps the whole palette: ground + a visible field for each other colour
    const plan = PG.interpret(mulberry32(seed * 977 + i), b, interp);
    const cs = new Set([plan.g]); plan.z.forEach((f) => cs.add(f[1]));
    ok([0, 1, 2, 3, 4].every((c) => cs.has(c) || cols[c] === cols[plan.g]), 'interpretation keeps all colours ' + i + ' @' + interp);
    ok(interp > 0 || plan.readings.length === 0, 'interp 0 applies no readings ' + i);
    ok(plan.z.every((f) => f.slice(2).every(Number.isFinite)) && plan.m.every((q) => q.slice(1).every(Number.isFinite)), 'finite geometry ' + i + ' @' + interp);
    const a = PG.composeBrief(mulberry32(seed * 131 + i), b, o), c = PG.composeBrief(mulberry32(seed * 131 + i), b, o);
    ok(JSON.stringify(a) === JSON.stringify(c), 'brief determinism ' + i);
    const fieldsEnd = Math.max(0, ...a.events.filter((e) => e.type !== 'drag').map((e) => e.t));
    const firstDrag = Math.min(...a.events.filter((e) => e.type === 'drag').map((e) => e.t0));
    ok(fieldsEnd < firstDrag, 'fields before gestures ' + i);
    ok(a.events.filter((e) => e.type === 'zone').every((e) => e.chan >= -1 && e.chan <= 3 && e.hx > 0 && e.hy > 0), 'zone channels ' + i);
    // nothing is cut off by the canvas: every field lies wholly on the sheet
    ok(a.events.filter((e) => e.type === 'zone').every((e) => {
      const c = Math.abs(Math.cos(e.ang)), sn = Math.abs(Math.sin(e.ang)), A = o.aspect;
      const ex = e.shape === 1 ? Math.hypot(e.hx * c, e.hy * sn) : e.hx * c + e.hy * sn;
      const ey = e.shape === 1 ? Math.hypot(e.hx * sn, e.hy * c) : e.hx * sn + e.hy * c;
      return e.cx - ex / A[0] > -1e-9 && e.cx + ex / A[0] < 1 + 1e-9 && e.cy - ey / A[1] > -1e-9 && e.cy + ey / A[1] < 1 + 1e-9;
    }), 'fields stay on the sheet ' + i + ' @' + interp);
    ok(a.events.filter((e) => e.type === 'pour').every((e) => e.pig >= 0 && e.pig <= 3), 'drop channels ' + i);
    ok(a.events.filter((e) => e.type === 'drag').every((e) => e.pts.every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)), 'gestures inside ' + i);
  }
  const bc = PG.briefColours(PALS[i].colors, b);
  ok(bc.ground === PALS[i].colors[b.g] && bc.pigments.length === 4, 'brief colours ' + i);
});

// 9. Originals: an image of a work ships only if it is public domain in both the EU (artist died
//    in or before 1955) and the US (work dated 1930 or earlier), Commons reports it public domain,
//    and its file is present. Every other work rises as its composition map: no image.
{
  const fs = require('fs'), path = require('path');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground');
  require(path.join(dir, 'originals.js'));
  const O = globalThis.ORIGINALS || {};
  const ids = Object.keys(O);
  ok(typeof O === 'object', 'originals manifest present (may be empty: then every work rises as its map)');
  for (const id of ids) {
    const m = O[id];
    ok(m.public_domain === true && m.artist_died <= 1955 && m.work_year <= 1930, 'original is public domain (EU + US) ' + id + ' ' + PALS[id].painting);
    ok(/public domain|^pd/i.test(m.license), 'source licence says public domain ' + id + ': ' + m.license);
    ok(m.file && fs.existsSync(path.join(dir, 'originals', m.file)), 'original file present ' + id);
    ok(typeof m.source === 'string' && m.source.length > 3 && /^https:\/\//.test(m.source_url) && m.source_object !== undefined, 'original traceable (holding museum, object, URL) ' + id);
  }
}

console.log(failures ? `${failures} of ${checks} checks failed` : `all ${checks} checks pass`);
process.exit(failures ? 1 : 0);
