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
//  10. View links: every work links to a page showing the painting (https) and to an image search.
//  11. Proportions of the original: exact aspect, fits the paper, border grows on one axis only.
//  12. Colorist Archive: integrity, https links, and images only for public-domain works.
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
  // A work with neither a brief nor a reading (19,123 of the archive's 20,367) composes here. It
  // is now handled like a brief's: layered by default, the earlier sweeping hand under handling 0.
  const sweep = PG.compose(mulberry32(seed), Object.assign({}, o, { handling: 0 }));
  const lay = PG.compose(mulberry32(seed), Object.assign({}, o, { handling: 1 }));
  ok(JSON.stringify(a) === JSON.stringify(lay), 'palette: layered is the default ' + seed + '/' + style);
  ok(JSON.stringify(sweep) !== JSON.stringify(lay), 'palette: handling changes the score ' + seed + '/' + style);
  const pourTs = lay.events.filter((e) => e.type === 'pour').map((e) => e.t).sort((x, y) => x - y);
  const dragTs = lay.events.filter((e) => e.type === 'drag').map((e) => e.t0).sort((x, y) => x - y);
  ok(pourTs[0] < dragTs[0], 'palette: the hand never works a bare sheet ' + seed + '/' + style);
  const runs = pourTs.reduce((n, t, k) => n + (k && t - pourTs[k - 1] > 1 ? 1 : 0), 1);
  ok(runs >= 1 && runs <= 3, 'palette: poured in at most three layers ' + seed + '/' + style);
  ok(pourTs.every((t) => dragTs.every((d) => d !== t)), 'palette: a pour and a drag never share a step ' + seed + '/' + style);
  const travel = (sc) => sc.events.filter((e) => e.type === 'drag').reduce((s2, e) =>
    s2 + e.pts.reduce((u, q, i) => i ? u + Math.hypot((q[0] - e.pts[i - 1][0]) * aspect[0], (q[1] - e.pts[i - 1][1]) * aspect[1]) : 0, 0), 0);
  ok(travel(lay) < travel(sweep), 'palette: layered strokes travel less ' + seed + '/' + style);
  // the sweeping hand is unchanged: each pour is worked where it lands
  ok(Math.min(...sweep.events.filter((e) => e.type === 'pour').map((e) => e.t))
     < Math.min(...sweep.events.filter((e) => e.type === 'drag').map((e) => e.t0)), 'palette sweeping: a pour leads ' + seed + '/' + style);
}

// The sweeping hand, locked to the step. These are hashes of scores PG.compose produced before
// the layered hand was given to the palette path (November 2026); handling 0 must still produce
// them exactly, so that every palette-only print made before the change reproduces.
// [seed, style, pours, aspect[1], hash]
const SWEEP_GOLD = [
  [1,0,4,1,740896872],
  [1,0,4,1.4142,411349790],
  [1,0,12,1,2757939089],
  [1,0,12,1.4142,1309964357],
  [1,0,24,1,966531283],
  [1,0,24,1.4142,2006482647],
  [1,1,4,1,2728307026],
  [1,1,4,1.4142,3808839684],
  [1,1,12,1,294075592],
  [1,1,12,1.4142,2176035259],
  [1,1,24,1,1931137056],
  [1,1,24,1.4142,2712305110],
  [1,2,4,1,3715593349],
  [1,2,4,1.4142,530099072],
  [1,2,12,1,1528401081],
  [1,2,12,1.4142,357914817],
  [1,2,24,1,316083023],
  [1,2,24,1.4142,1280652418],
  [1,3,4,1,3977316450],
  [1,3,4,1.4142,3124622685],
  [1,3,12,1,1332544886],
  [1,3,12,1.4142,1169582451],
  [1,3,24,1,1106496008],
  [1,3,24,1.4142,981668039],
  [1,4,4,1,3416911185],
  [1,4,4,1.4142,1910273911],
  [1,4,12,1,1779968338],
  [1,4,12,1.4142,997144343],
  [1,4,24,1,1054371488],
  [1,4,24,1.4142,161665990],
  [2,0,4,1,1148911068],
  [2,0,4,1.4142,1608563461],
  [2,0,12,1,1376413364],
  [2,0,12,1.4142,2181493559],
  [2,0,24,1,1148446571],
  [2,0,24,1.4142,2682901156],
  [2,1,4,1,2482582820],
  [2,1,4,1.4142,4124043888],
  [2,1,12,1,157213304],
  [2,1,12,1.4142,3987737728],
  [2,1,24,1,3298949941],
  [2,1,24,1.4142,3614734316],
  [2,2,4,1,2176321898],
  [2,2,4,1.4142,1236318856],
  [2,2,12,1,1827881435],
  [2,2,12,1.4142,3168718786],
  [2,2,24,1,2824816059],
  [2,2,24,1.4142,2513950446],
  [2,3,4,1,2260128771],
  [2,3,4,1.4142,1628774807],
  [2,3,12,1,2902739546],
  [2,3,12,1.4142,3710328961],
  [2,3,24,1,694558719],
  [2,3,24,1.4142,1962037304],
  [2,4,4,1,3874849431],
  [2,4,4,1.4142,129491931],
  [2,4,12,1,1292973809],
  [2,4,12,1.4142,1976303161],
  [2,4,24,1,2607598156],
  [2,4,24,1.4142,535353767],
  [7,0,4,1,3060860565],
  [7,0,4,1.4142,2672699129],
  [7,0,12,1,1054126160],
  [7,0,12,1.4142,1984731834],
  [7,0,24,1,437742545],
  [7,0,24,1.4142,4193979454],
  [7,1,4,1,2209391466],
  [7,1,4,1.4142,2551414875],
  [7,1,12,1,3784774252],
  [7,1,12,1.4142,4066393911],
  [7,1,24,1,1165205543],
  [7,1,24,1.4142,1133808093],
  [7,2,4,1,2270606844],
  [7,2,4,1.4142,4064543440],
  [7,2,12,1,355081573],
  [7,2,12,1.4142,1466231969],
  [7,2,24,1,686804598],
  [7,2,24,1.4142,208762369],
  [7,3,4,1,1944407013],
  [7,3,4,1.4142,3684292059],
  [7,3,12,1,1152390469],
  [7,3,12,1.4142,1260712117],
  [7,3,24,1,3169118903],
  [7,3,24,1.4142,270820091],
  [7,4,4,1,876417674],
  [7,4,4,1.4142,2057341489],
  [7,4,12,1,1565625195],
  [7,4,12,1.4142,1231872825],
  [7,4,24,1,2289992974],
  [7,4,24,1.4142,3301347546],
  [11,0,4,1,3829608674],
  [11,0,4,1.4142,2360907841],
  [11,0,12,1,844737682],
  [11,0,12,1.4142,1534784679],
  [11,0,24,1,1610164458],
  [11,0,24,1.4142,344523616],
  [11,1,4,1,2150816134],
  [11,1,4,1.4142,895249123],
  [11,1,12,1,2300904349],
  [11,1,12,1.4142,1040880626],
  [11,1,24,1,3029460553],
  [11,1,24,1.4142,3510396998],
  [11,2,4,1,3789009615],
  [11,2,4,1.4142,3901917451],
  [11,2,12,1,1874842955],
  [11,2,12,1.4142,3509270249],
  [11,2,24,1,3596572637],
  [11,2,24,1.4142,2734990363],
  [11,3,4,1,983758095],
  [11,3,4,1.4142,462356687],
  [11,3,12,1,3638469945],
  [11,3,12,1.4142,386061521],
  [11,3,24,1,2060759545],
  [11,3,24,1.4142,1850335170],
  [11,4,4,1,3666749426],
  [11,4,4,1.4142,648394709],
  [11,4,12,1,2952855179],
  [11,4,12,1.4142,2664258236],
  [11,4,24,1,702687077],
  [11,4,24,1.4142,2329738031],
];
{
  // Hash the score with every number rounded to six decimals. Math.hypot, which polyLength calls
  // once per segment, and the trigonometry the arcs are built from are implementation-defined:
  // two engines may differ in the last bits, which an exact hash of the raw score turns into a
  // failure on someone else's machine. Six decimals absorb a difference of that size — about
  // 1e-16 — while still catching a real change: lowering the sweeping reach by 0.1%, four orders
  // of magnitude above the tolerance, fails every row.
  const quantised = (o) => JSON.stringify(o, (k, v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  const h = (s) => { let x = 7; for (let i = 0; i < s.length; i++) x = (Math.imul(x, 31) + s.charCodeAt(i)) >>> 0; return x; };
  for (const [seed, style, pours, ay, hash] of SWEEP_GOLD) {
    const o = { style, pours, energy: 1, aspect: [1, ay], handling: 0 };
    ok(h(quantised(PG.compose(mulberry32(seed), o))) === hash, 'sweeping hand unchanged ' + seed + '/' + style + '/' + pours + '/' + ay);
  }
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
    const fieldTs = a.events.filter((e) => e.type !== 'drag').map((e) => e.t).sort((x, y) => x - y);
    const firstDrag = Math.min(...a.events.filter((e) => e.type === 'drag').map((e) => e.t0));
    ok(fieldTs[0] < firstDrag, 'the hand never works a bare sheet ' + i);
    // layered handling pours in runs with the hand between them: at most three runs, and every
    // run is finished before the strokes that follow it begin
    const runs = fieldTs.reduce((n, t, k) => n + (k && t - fieldTs[k - 1] > 1 ? 1 : 0), 1);
    ok(runs >= 1 && runs <= 3, 'poured in at most three layers ' + i);
    const drags = a.events.filter((e) => e.type === 'drag').map((e) => e.t0).sort((x, y) => x - y);
    ok(fieldTs.every((t) => drags.every((d) => d !== t)), 'a pour and a drag never share a step ' + i);
    // the earlier sweeping hand still lays every field before any gesture
    const sweep = PG.composeBrief(mulberry32(seed * 131 + i), b, Object.assign({}, o, { handling: 0 }));
    ok(Math.max(0, ...sweep.events.filter((e) => e.type !== 'drag').map((e) => e.t))
       < Math.min(...sweep.events.filter((e) => e.type === 'drag').map((e) => e.t0)), 'sweeping: fields before gestures ' + i);
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

// 10. View links: every work has a link to view the painting itself (https) and an image search.
{
  const path = require('path');
  require(path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground/links.js'));
  const WL = globalThis.WORK_LINKS || {};
  ok(Object.keys(WL).length === PALS.length, 'a view link for every work (' + Object.keys(WL).length + ')');
  for (const p of PALS) {
    const l = WL[p.id];
    ok(l && /^https:\/\//.test(l.url) && /^https:\/\/www\.google\.com\/search\?tbm=isch&q=/.test(l.search) && l.site, 'view link + image search ' + p.id + ' ' + p.painting);
  }
}

// 11. Proportions of the original: the image area takes the work's aspect exactly, fits whole inside
//     the paper, and the border on each axis is at least the one asked for (it grows on one axis).
for (let f = 0; f < PG.FORMAT_KEYS.length; f++) for (const ar of [0.5, 0.75, 1, 1.333, 2.2]) for (const land of [false, true, 'auto']) {
  const s = PG.sheet(f, land, 30, 300, ar), b = s.borderMM;
  ok(Math.abs(s.imageMM[0] / s.imageMM[1] - ar) < 1e-9, 'image keeps the original aspect ' + s.name + ' ' + ar);
  ok(s.bx >= b - 1e-9 && s.by >= b - 1e-9 && Math.abs(s.bx - b) < 1e-9 || Math.abs(s.by - b) < 1e-9, 'border grows on one axis only ' + s.name + ' ' + ar);
  ok(Math.abs(s.aspect[0] / s.aspect[1] - ar) < 1e-9, 'simulation grid takes the aspect ' + s.name + ' ' + ar);
  if (land === 'auto') ok(s.landscape === (ar > 1), 'auto orientation follows the original ' + s.name + ' ' + ar);
}

// 12. The Colorist Archive (meditationsincolor.com/colorists): data integrity and the image rule.
{
  const fs = require('fs'), path = require('path');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground/archive');
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  ok(ix.total === ix.artists.reduce((n, a) => n + a.n, 0), 'archive total equals the sum of artists');
  let off = 0, works = 0, imgs = 0, badImg = 0, badPal = 0, badLink = 0, badAspect = 0, badSrc = 0, sized = 0;
  const SRC = new Set(['met', 'aic', 'cma', 'nga', 'rijks', 'tate', 'smk', 'va', 'commons']);   // absent = Wikidata
  for (const a of ix.artists) {
    ok(a.o === off, 'artist offsets are contiguous ' + a.id); off += a.n;
    const W = JSON.parse(fs.readFileSync(path.join(dir, a.id + '.json'), 'utf8'));
    ok(W.length === a.n, 'artist file has its works ' + a.id);
    for (const w of W) {
      works++;
      if (!(w.c && w.c.length === 5 && w.c.every((c) => /^#[0-9A-F]{6}$/.test(c)))) badPal++;
      if (w.u && !/^https:\/\//.test(w.u)) badLink++;
      if (w.a !== null && !(w.a > 0.15 && w.a < 7)) badAspect++;
      if (w.a) sized++;
      // a size names its record: Wikidata (no field) or a known museum / Commons source, and only when sized
      if (w.as !== undefined && !(w.a && SRC.has(w.as))) badSrc++;
      // an image is referenced only for public-domain works: artist died <= 1955, work dated <= 1930
      if (w.i) { imgs++; if (!(w.pd && a.died && a.died <= 1955 && w.y && w.y <= 1930)) badImg++; }
      if (w.pd && !(a.died && a.died <= 1955 && w.y && w.y <= 1930)) badImg++;
    }
  }
  ok(works === ix.total, 'archive works counted ' + works);
  ok(badPal === 0, 'every archive work has a 5-colour palette (' + badPal + ' bad)');
  ok(badLink === 0, 'archive links are https (' + badLink + ' not)');
  ok(badAspect === 0, 'archive proportions are plausible (' + badAspect + ' bad)');
  ok(badSrc === 0, 'archive sizes name a known source (' + sized + ' sized, ' + badSrc + ' bad)');
  ok(badImg === 0, 'images only for public-domain archive works (' + imgs + ' referenced, ' + badImg + ' violations)');
}

// 13. colorlisa proportions: each names its record (Wikidata item, or museum + record), and the
//     stored size agrees with the aspect.
{
  require('../projects/060-poured-ground/proportions.js');
  const R = globalThis.PROPORTIONS;
  for (const [id, r] of Object.entries(R)) {
    ok(PALS[+id] !== undefined, 'proportions refer to a colorlisa work ' + id);
    ok(r.aspect > 0.15 && r.aspect < 7, 'colorlisa proportions plausible ' + id);
    ok(Boolean(r.wikidata) || (Boolean(r.source) && Boolean(r.record)), 'colorlisa proportions name their record ' + id);
    ok(Math.abs(r.size_cm[1] / r.size_cm[0] - r.aspect) < 0.002, 'colorlisa size agrees with aspect ' + id);
  }
}

// 14. Readings by the painting reader: records are complete and bound to the image they describe,
//     and the brief derived from them (engine.js readBrief) is deterministic, uses the whole palette,
//     and keeps every field on the sheet at every format.
{
  const fs = require('fs'), path = require('path'), crypto = require('crypto');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../projects/060-poured-ground');
  require('../projects/060-poured-ground/readings.js');
  require('../projects/060-poured-ground/originals.js');
  const RD = globalThis.READINGS, OR = globalThis.ORIGINALS;
  // the archive's readings are filed per artist, as its works are, so the studio loads a work's
  // reading with its artist instead of fetching every reading in the archive first
  const shardDir = path.join(dir, 'archive/readings');
  ok(!fs.existsSync(path.join(dir, 'archive/readings.json')), 'no single-file archive readings left to drift');
  const shardIndex = fs.existsSync(path.join(shardDir, 'index.json'))
    ? JSON.parse(fs.readFileSync(path.join(shardDir, 'index.json'), 'utf8')) : [];
  const shardFiles = fs.existsSync(shardDir)
    ? fs.readdirSync(shardDir).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'failures.json') : [];
  ok(shardIndex.slice().sort().join() === shardFiles.map((f) => f.replace(/\.json$/, '')).sort().join(),
     'the reading index names exactly the artists that have a shard');
  const arts = JSON.parse(fs.readFileSync(path.join(dir, 'archive/index.json'), 'utf8')).artists;
  const byId = Object.fromEntries(arts.map((a) => [a.id, a]));
  const AR = {};
  for (const f of shardFiles) {
    const aid = f.replace(/\.json$/, ''), a = byId[aid];
    ok(!!a, 'a reading shard belongs to an artist in the archive: ' + aid);
    const recs = JSON.parse(fs.readFileSync(path.join(shardDir, f), 'utf8'));
    ok(Object.keys(recs).length > 0, 'a reading shard is not empty: ' + aid);
    for (const id of Object.keys(recs)) {
      const n = Number(id) - 1000;
      ok(a && n >= a.o && n < a.o + a.n, 'a reading is filed with the artist whose work it is: ' + id + ' in ' + aid);
      ok(!(id in AR), 'a reading appears in one shard only: ' + id);
      AR[id] = recs[id];
    }
  }
  const checkRecord = (id, rd, who) => {
    ok(String(rd.id) === String(id), 'reading id ' + who);
    ok(/^[0-9a-f]{64}$/.test(rd.sha256), 'reading sha256 ' + who);
    ok(rd.colors.length === 5 && rd.colors.every((h) => /^#[0-9a-f]{6}$/i.test(h)), 'reading has five colours ' + who);
    ok(rd.shares.length === 5 && rd.shares.every((x, i, a) => i === 0 || a[i - 1] >= x), 'reading shares by size ' + who);
    ok(rd.map6.every((k) => k >= 0 && k < 5), 'reading cluster map ' + who);
    ok(rd.fields.length > 0 && rd.fields.every((f) => (f.length === 15 || f.length === 16) && ['light', 'dark', 'color', 'sparse'].includes(f[1]) && f[2] > 0 && f[2] <= 1 && f.slice(3, 9).every((v) => v >= 0 && v <= 1) && (f[14] === null || (f[14] >= 0 && f[14] < 5))), 'reading fields ' + who);
    // a silhouette, when present, is a base64 mask of exactly the grid's cells, and it is not empty
    if (rd.grid) ok(rd.grid.length === 2 && rd.fields.every((f) => f.length < 16 || (Buffer.from(f[15], 'base64').length === Math.ceil(rd.grid[0] * rd.grid[1] / 8) && Buffer.from(f[15], 'base64').some((x) => x))), 'reading silhouettes ' + who);
    ok(rd.configs.every((c) => ['value_opposition', 'cross_axes', 'detail_interval', 'color_recurrence', 'subject_field'].includes(c[1])), 'reading configurations ' + who);
    ok(rd.cells.length === 9 && rd.edges.length === 3, 'reading edges and cells ' + who);
    // the grain, when kept: 8 bins over 180 degrees that sum to 1, the strongest agreeing with `edges`
    if (rd.ebins) {
      ok(rd.ebins.length === 8 && rd.ebins.every((v) => v >= 0 && v <= 1) && Math.abs(rd.ebins.reduce((a, b) => a + b, 0) - 1) < 0.01, 'reading grain bins ' + who);
      // `edges[0]` is the dominant bin's centre in whole degrees, so an odd multiple of 22.5 is
      // rounded (22.5 → 22, 67.5 → 68): read the bin back from the angle rather than comparing a
      // bin centre to it. Shares are kept to three decimals, which can tie two bins that differ
      // underneath, so the named bin has to be *a* maximum, not the first one `indexOf` finds.
      const bin = Math.round(rd.edges[0] / 22.5) % 8;
      ok(Math.abs(bin * 22.5 - rd.edges[0]) <= 0.5, 'the dominant direction is a bin centre ' + who);
      ok(Math.abs(rd.ebins[bin] - rd.edges[1]) <= 0.001, 'the dominant share is that bin\'s ' + who);
      ok(rd.ebins[bin] >= Math.max(...rd.ebins) - 0.001, 'grain agrees with the strongest direction ' + who);
    }
    ok(rd.reading === 'unavailable', 'no subject description is claimed ' + who);
  };
  for (const [id, rd] of Object.entries(RD)) {
    checkRecord(id, rd, 'colorlisa ' + id);
    const o = OR[id];
    ok(o && o.public_domain === true, 'reading is of a public-domain original ' + id);
    const file = path.join(dir, 'originals', o.file);
    ok(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === rd.sha256, 'reading is bound to the held image ' + id);
    ok(fs.existsSync(path.join(dir, 'readings', String(id).padStart(3, '0') + '.handoff.json')), 'full handoff kept ' + id);
  }
  for (const [id, rd] of Object.entries(AR)) {
    checkRecord(id, rd, 'archive ' + id);
    ok(+id >= 1000 && /^https:\/\//.test(rd.image), 'archive reading has its image url ' + id);
  }
  const all = Object.entries(RD).concat(Object.entries(AR).slice(0, 40));
  for (const [id, rd] of all) {
    for (const A of [[1, 1.25], [1.25, 1], [1, 1], [1.414, 1]]) {
      const b = PG.readBrief(rd, A), b2 = PG.readBrief(rd, A);
      ok(JSON.stringify(b) === JSON.stringify(b2), 'reading brief deterministic ' + id);
      ok(b.k === 2 && b.g === 0 && typeof b.note === 'string' && b.note.length > 10, 'reading brief basis ' + id);
      ok(b.z.length > 0 && b.m.length > 0, 'reading brief has fields and gestures ' + id);
      ok(b.z.every((f) => f.length === { R: 7, E: 7, L: 7, D: 8, M: 8 }[f[0]] && f[1] >= 0 && f[1] < 5), 'reading brief field arity ' + id);
      if (rd.grid) ok(b.z.some((f) => f[0] === 'M') && b.z.every((f) => f[0] !== 'M' || (f[7].cols === rd.grid[0] && f[7].rows === rd.grid[1] && typeof f[7].bits === 'string')), 'reading brief lays silhouettes ' + id);
      // the sheet is combed once per direction carrying 1.5x an isotropic share, at most three
      const sheetCombs = b.m.filter((x) => x[0] === 'C' && x[1] === 0.05 && x[2] === 0.05);
      if (rd.ebins) {
        const want = Math.min(2, rd.ebins.filter((v) => v >= 0.1875).length);
        ok(sheetCombs.length === want, 'grain combed once per strong direction ' + id);
        ok(sheetCombs.every((c) => c[6] >= 2 && c[6] <= 4), 'grain comb teeth in range ' + id);
        // the second direction is the lighter one
        ok(sheetCombs.length < 2 || (sheetCombs[1][6] === 2 && sheetCombs[1][7] < sheetCombs[0][7]), 'the second grain comb is lighter ' + id);
      }
      // the intervals the reading found: each is a strip between two fields whose boxes do not
      // meet, and with the reserve on, no stroke and no dab enters one
      ok(!b.r || b.r.every((g) => g.length === 4 && g[2] > g[0] && g[3] > g[1] && g.every((v) => v >= 0 && v <= 1)), 'reserves are strips on the sheet ' + id);
      if (b.r && b.r.length) {
        const sc = PG.composeBrief(mulberry32(id * 7 + 3), b, { energy: 1, aspect: A, interp: 0, reserve: 1 });
        const inside = (q, g, m2) => q[0] > g[0] - m2 && q[0] < g[2] + m2 && q[1] > 1 - g[3] - m2 && q[1] < 1 - g[1] + m2;
        ok(sc.events.filter((e) => e.type === 'drag').every((e) => e.pts.every((q) => !b.r.some((g) => inside(q, g, 0)))), 'no stroke enters an interval ' + id);
        ok(sc.events.filter((e) => e.type === 'pour').every((e) => !b.r.some((g) => inside([e.x, e.y], g, 0))), 'no dab lands in an interval ' + id);
        const off = PG.composeBrief(mulberry32(id * 7 + 3), b, { energy: 1, aspect: A, interp: 0, reserve: 0 });
        // The reserve changes the score exactly when the hand would have entered the strip. A
        // reading can name an interval that no stroke and no dab happens to cross at this seed —
        // 17,676 readings turn that from a theoretical case into a real one — and there the
        // reserve has nothing to remove, so the score must come back identical.
        const crossed = off.events.some((e) => e.type === 'drag'
          ? e.pts.some((q) => b.r.some((g) => inside(q, g, e.r * 0.5)))
          : b.r.some((g) => inside([e.x, e.y], g, e.r * 0.5)));
        ok(crossed === (JSON.stringify(off) !== JSON.stringify(sc)),
           'the reserve changes the score when, and only when, the hand crossed an interval ' + id);
      }
      // the hand follows the reader's own order: a configuration's weight is the summed area of
      // the fields it names, and the heaviest one is made first
      const areaOf = {}; rd.fields.forEach((f) => { areaOf[f[0]] = f[2]; });
      const LETTER = { value_opposition: 'P', cross_axes: 'C', detail_interval: 'B', color_recurrence: 'P' };
      const weighed = rd.configs
        .filter((c) => c[2].length >= 2 && c[2].every((fid) => areaOf[fid] !== undefined) && LETTER[c[1]])
        .map((c) => ({ kind: c[1], w: c[2].reduce((s2, fid) => s2 + areaOf[fid], 0) }))
        .sort((a, b2) => b2.w - a.w);
      if (weighed.length) ok(b.m.length > 0 && b.m[0][0] === LETTER[weighed[0].kind], 'the heaviest configuration is made first ' + id);
      ok(b.m.every((q) => q.length === { P: 6, B: 8, C: 8, S: 6, W: 7 }[q[0]] && q.slice(1).every(Number.isFinite)), 'reading brief gesture arity ' + id);
      for (const interp of [0, 0.65]) {
        const plan = PG.interpret(mulberry32(+id * 7 + 1), b, interp);
        const cs = new Set([plan.g]); plan.z.forEach((f) => cs.add(f[1]));
        ok([0, 1, 2, 3, 4].every((c) => cs.has(c) || rd.colors[c] === rd.colors[plan.g]), 'reading keeps all five colours ' + id + ' @' + interp);
        const sc = PG.composeBrief(mulberry32(+id * 13 + 5), b, { energy: 1, aspect: A, interp });
        ok(sc.events.filter((e) => e.type === 'zone').every((e) => {
          const c = Math.abs(Math.cos(e.ang)), sn = Math.abs(Math.sin(e.ang));
          const ex = e.shape === 1 ? Math.hypot(e.hx * c, e.hy * sn) : e.hx * c + e.hy * sn, ey = e.shape === 1 ? Math.hypot(e.hx * sn, e.hy * c) : e.hx * sn + e.hy * c;
          return e.cx - ex / A[0] > -1e-9 && e.cx + ex / A[0] < 1 + 1e-9 && e.cy - ey / A[1] > -1e-9 && e.cy + ey / A[1] < 1 + 1e-9;
        }), 'reading fields stay on the sheet ' + id + ' @' + interp);
        ok(sc.events.filter((e) => e.type === 'zone' && e.shape === 2).every((e) => e.scale > 0 && e.mask && e.m0.length === 2 && isFinite(e.scale)), 'silhouette zones carry their mask and scale ' + id + ' @' + interp);
        ok(sc.events.filter((e) => e.type === 'drag').every((e) => e.pts.every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)), 'reading gestures inside ' + id + ' @' + interp);
      }
    }
  }
  ok(Object.keys(RD).length >= 8, 'readings exist for the held originals (' + Object.keys(RD).length + ' colorlisa, ' + Object.keys(AR).length + ' archive)');
}

console.log(failures ? `${failures} of ${checks} checks failed` : `all ${checks} checks pass`);
process.exit(failures ? 1 : 0);
