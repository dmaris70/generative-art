#!/usr/bin/env node
// strata-select.mjs — curate an Isometric Strata edition from a seed pool.
//
// Builds every seed in the pool through the engine (build only, p5-free),
// then selects an edition under explicit, auditable rules:
//   1. tenets must pass in full where a style has them (4/5 is rejected);
//   2. no two tokens share a look (style + substyle + view + palette);
//   3. styles take equal quotas (256 = 8 × 21 + 4 × 22);
//   4. within a style, substyles, views and palettes are filled round-robin so
//      every substyle and palette appears and views keep about a 2:1 ratio;
//   5. within a look, the candidate whose site and paper are least used in its
//      style wins; the rarity score in bits breaks ties, never overrides diversity.
// Writes edition/edition-<size>.json (the record) and edition/edition-<size>.js
// (what the sheet and the board load). Deterministic for a given pool and rules.
//
//   6. quality gates computed from the generative state, banded per style over
//      the pool: part count and ink load within the 10th–90th percentile, the
//      building's projected proportion between 0.45 and 2.2, the site neither
//      barren nor dominant, at most one empty legend entry, and for a plan and
//      section sheet enough geometry through the cut;
//   7. an exclusion list (edition/exclusions.json) from the rendered audit:
//      an excluded seed is replaced by the next candidate of its look.
//
//   node tools/strata-select.mjs [size=256] [poolSize=60000] [firstSeed=1]

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const proj = path.join(root, 'projects', '011-isometric-strata');
const SIZE = Number(process.argv[2]) || 256;
const POOL = Number(process.argv[3]) || 60000;
const FIRST = Number(process.argv[4]) || 1;
const VIEW_RATIO = 2 / 3; // share of axonometric sheets within a style

globalThis.window = globalThis;
const files = [
  'assets/strokefont.js',
  ...['core', 'plan', 'render', 'paper', 'sheet', 'site'].map((f) => `projects/011-isometric-strata/lib/${f}.js`),
  ...fs.readdirSync(path.join(proj, 'lib', 'styles')).map((f) => 'projects/011-isometric-strata/lib/styles/' + f),
  'projects/011-isometric-strata/lib/strata.js', 'projects/011-isometric-strata/lib/traits.js', 'projects/011-isometric-strata/lib/rarity.js',
];
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const Strata = globalThis.Strata, ISO = globalThis.ISO;
const exclFile = path.join(proj, 'edition', 'exclusions.json');
const exclusions = fs.existsSync(exclFile) ? JSON.parse(fs.readFileSync(exclFile, 'utf8')) : { seeds: {} };

// ---- state-based quality metrics ----
function metrics(st) {
  const sc = st.scene, sp = st.spec, L = globalThis.Sheet.layout({ schedule: true });
  let parts = 0;
  for (const k in sc.counts) parts += sc.counts[k];
  // projected extent of the building's own items, and their ink length
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ink = 0;
  for (let i = 0; i < st.stats.buildingItems; i++) {
    const it = sc.items[i];
    if (!it.pts) continue;
    const P = it.pts.map(ISO.proj);
    for (const q of P) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const n = it.kind === 'face' ? P.length : P.length - 1;
    for (let k = 0; k < n; k++) { const a = P[k], b = P[(k + 1) % P.length]; ink += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  }
  const aspect = (y1 - y0) / Math.max(1e-6, x1 - x0);
  const inkLoad = (ink * st.fit.s) / (L.frame.w * L.frame.h) * 1000; // sheet units of line per 1000 sheet units² of frame
  const siteRatio = st.stats.siteItems / Math.max(1, st.stats.buildingItems);
  const zeroLegend = st.meta.legend.filter((l) => l.count === 0).length;
  let cutFaces = 0;
  if (sp.view !== 'AXONOMETRIC') {
    const cy = st.ortho.cutY;
    for (const it of sc.items) if (it.kind === 'face' && it.layer !== 0) { const c = ISO.geom.centroid(it.pts); if (c[1] <= cy && c[2] > 0.5) cutFaces++; }
  }
  return { parts, aspect: Math.round(aspect * 100) / 100, inkLoad: Math.round(inkLoad * 10) / 10, siteRatio: Math.round(siteRatio * 100) / 100, zeroLegend, cutFaces };
}

// ---- the pool ----
const t0 = Date.now();
const pool = [];
const rejected = { tenets: 0 };
for (let i = 0; i < POOL; i++) {
  const seed = (FIRST + i) >>> 0;
  const st = Strata.build({ seed });
  const tr = {};
  for (const t of Strata.traits(st)) tr[t.trait_type] = t.value;
  if (tr.Tenets !== 'NA' && tr.Tenets !== '5/5') { rejected.tenets++; continue; }
  const r = Strata.rarity(st);
  const m = metrics(st);
  pool.push({
    m,
    seed, style: tr.Style, substyle: tr.Substyle, view: tr.View, palette: tr.Palette, site: tr.Site, paper: tr.Paper,
    floors: Number(tr.Floors), buildings: Number(tr.Buildings), shape: tr.Shape, type: tr.Type, tenets: tr.Tenets, parts: tr.Parts,
    bits: Math.round(r.bits * 100) / 100, rank: r.rank, tier: r.tier, dwg: st.spec.dwg,
    hash: ('00000000' + ISO.hash32(Strata.VERSION + ':' + seed).toString(16)).slice(-8).toUpperCase(),
    look: [tr.Style, tr.Substyle, tr.View, tr.Palette].join('|'),
  });
  if (i % 10000 === 9999) process.stderr.write(`${i + 1}/${POOL}\n`);
}
process.stderr.write(`pool built: ${pool.length} tenet-eligible of ${POOL} in ${Date.now() - t0} ms\n`);

// ---- quality gates, banded per style ----
const pct = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const bands = {};
for (const style of new Set(pool.map((c) => c.style))) {
  const cs = pool.filter((c) => c.style === style);
  bands[style] = {
    parts: [pct(cs.map((c) => c.m.parts), 0.10), pct(cs.map((c) => c.m.parts), 0.90)],
    inkLoad: [pct(cs.map((c) => c.m.inkLoad), 0.10), pct(cs.map((c) => c.m.inkLoad), 0.90)],
  };
}
const GATES = {
  parts: (c) => c.m.parts >= bands[c.style].parts[0] && c.m.parts <= bands[c.style].parts[1],
  inkLoad: (c) => c.m.inkLoad >= bands[c.style].inkLoad[0] && c.m.inkLoad <= bands[c.style].inkLoad[1],
  aspect: (c) => c.m.aspect >= 0.45 && c.m.aspect <= 2.2,
  site: (c) => c.m.siteRatio >= 0.15 && c.m.siteRatio <= 2.0,
  legend: (c) => c.m.zeroLegend <= 1,
  section: (c) => c.view === 'AXONOMETRIC' || c.m.cutFaces >= 15,
  excluded: (c) => !exclusions.seeds[String(c.seed)],
};
for (const g in GATES) rejected[g] = 0;
const eligible = pool.filter((c) => {
  for (const g in GATES) if (!GATES[g](c)) { rejected[g]++; return false; }
  return true;
});
process.stderr.write(`gates passed: ${eligible.length} of ${pool.length}\n`);

// ---- the selection ----
const styles = Strata.STYLE_KEYS.map((k) => ISO.styles[k].key);
const base = Math.floor(SIZE / styles.length), extra = SIZE - base * styles.length;
const quota = {};
styles.forEach((s, i) => { quota[s] = base + (i < extra ? 1 : 0); });

const byStyle = {};
for (const c of eligible) (byStyle[c.style] = byStyle[c.style] || []).push(c);

const chosen = [];
const usedLook = new Set();
for (const style of styles) {
  const cands = byStyle[style] || [];
  const substyles = [...new Set(cands.map((c) => c.substyle))].sort();
  const palettes = [...new Set(cands.map((c) => c.palette))].sort();
  const count = { view: {}, palette: {}, site: {}, paper: {}, substyle: {} };
  const bump = (k, v) => { count[k][v] = (count[k][v] || 0) + 1; };
  const n = (k, v) => count[k][v] || 0;
  let picked = 0, guard = 0;
  while (picked < quota[style] && guard++ < 10000) {
    // the substyle least used so far
    const substyle = substyles.slice().sort((a, b) => n('substyle', a) - n('substyle', b) || a.localeCompare(b))[0];
    // the view that keeps the ratio, then the palette least used
    const axon = n('view', 'AXONOMETRIC'), plan = n('view', 'PLAN + SECTION');
    const wantAxon = (axon + 1) / (axon + plan + 1) <= VIEW_RATIO + 1e-9;
    // every open (view, palette) look of this substyle, ranked: palette balance
    // first, then the view the ratio wants, then name — so palettes stay even
    const pairs = [];
    for (const view of ['AXONOMETRIC', 'PLAN + SECTION']) for (const palette of palettes) pairs.push({ view, palette });
    pairs.sort((a, b) => n('palette', a.palette) - n('palette', b.palette)
      || ((a.view === 'AXONOMETRIC') === wantAxon ? 0 : 1) - ((b.view === 'AXONOMETRIC') === wantAxon ? 0 : 1)
      || a.palette.localeCompare(b.palette));
    let pick = null;
    for (const pr of pairs) {
      const look = [style, substyle, pr.view, pr.palette].join('|');
      if (usedLook.has(look)) continue;
      const cs = cands.filter((c) => c.look === look);
      if (!cs.length) continue;
      // least-used site and paper in this style, then the higher score, then the lower seed
      cs.sort((a, b) => (n('site', a.site) + n('paper', a.paper)) - (n('site', b.site) + n('paper', b.paper)) || b.bits - a.bits || a.seed - b.seed);
      pick = cs[0];
      break;
    }
    if (!pick) {
      // this substyle is exhausted at every view and palette; retire it
      const idx = substyles.indexOf(substyle);
      if (idx >= 0) substyles.splice(idx, 1);
      if (!substyles.length) break;
      continue;
    }
    usedLook.add(pick.look);
    chosen.push(pick);
    bump('view', pick.view); bump('palette', pick.palette); bump('site', pick.site); bump('paper', pick.paper); bump('substyle', pick.substyle);
    picked++;
  }
  if (picked < quota[style]) process.stderr.write(`warning: ${style} filled ${picked}/${quota[style]}\n`);
}

// edition numbers: by style order, then by seed
chosen.sort((a, b) => styles.indexOf(a.style) - styles.indexOf(b.style) || a.seed - b.seed);
chosen.forEach((c, i) => { c.edition = i + 1; });

const dist = (k) => { const d = {}; for (const c of chosen) d[c[k]] = (d[c[k]] || 0) + 1; return d; };
const out = {
  series: Strata.SERIES, generator: Strata.VERSION, size: chosen.length, target: SIZE,
  pool: { firstSeed: FIRST, count: POOL, tenetEligible: pool.length, eligible: eligible.length, rejected, bands, exclusions: Object.keys(exclusions.seeds).length },
  rules: [
    'tenets must pass in full where a style has them',
    'quality gates from the generative state, banded per style over the pool: parts and ink load within the 10th-90th percentile, projected proportion 0.45-2.2, site ratio 0.15-2.0, at most one empty legend entry, a plan-and-section sheet with at least 15 faces through the cut',
    'seeds in edition/exclusions.json (from the rendered audit) are replaced by the next candidate of their look',
    'no two tokens share a look (style + substyle + view + palette)',
    `equal style quotas (${base} or ${base + 1} per style)`,
    `within a style: substyles, views (about ${Math.round(VIEW_RATIO * 100)}% axonometric) and palettes filled round-robin`,
    'within a look: least-used site and paper in the style, then the higher rarity score, then the lower seed',
  ],
  generatedAt: new Date().toISOString(),
  distribution: { style: dist('style'), view: dist('view'), site: dist('site'), paper: dist('paper'), tier: dist('tier'), floors: dist('floors'), buildings: dist('buildings') },
  bits: { min: Math.min(...chosen.map((c) => c.bits)), max: Math.max(...chosen.map((c) => c.bits)), mean: Math.round(chosen.reduce((s, c) => s + c.bits, 0) / chosen.length * 100) / 100 },
  tokens: chosen,
};
fs.mkdirSync(path.join(proj, 'edition'), { recursive: true });
fs.writeFileSync(path.join(proj, 'edition', `edition-${SIZE}.json`), JSON.stringify(out, null, 1) + '\n');
const js = `// generated by tools/strata-select.mjs — the curated edition; do not edit\nwindow.STRATA_EDITION = ${JSON.stringify({ series: out.series, generator: out.generator, size: out.size, seeds: Object.fromEntries(chosen.map((c) => [c.seed, c.edition])) })};\n`;
fs.writeFileSync(path.join(proj, 'edition', `edition-${SIZE}.js`), js);
console.log(`edition of ${chosen.length} selected from ${eligible.length} eligible seeds in ${Date.now() - t0} ms; rejected ${JSON.stringify(rejected)}`);
for (const k of ['style', 'view', 'site', 'paper', 'tier']) console.log(k + ': ' + Object.entries(out.distribution[k]).sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v} ${c}`).join(' · '));
console.log('bits: ' + JSON.stringify(out.bits) + '   distinct looks: ' + new Set(chosen.map((c) => c.look)).size + '   distinct identities: ' + new Set(chosen.map((c) => c.look + '|' + c.site)).size);
