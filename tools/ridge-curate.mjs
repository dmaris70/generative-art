#!/usr/bin/env node
// Curation harness for 027 — paints a batch of seeds exactly as the browser does, measures each pair, flags the
// recurring failures, and lays out a labelled contact sheet for a human (or a vision model) to read.
//   node tools/ridge-curate.mjs --each 3 --event 1 --out …/review/<run>     every place, 3 seeds each (one place per row), with a per-place table
//     (add --places a,b,c to restrict --each to a shortlist)
//   node tools/ridge-curate.mjs --n 24 --start 1000 [--step 7919] [--place 0] [--regime 0] [--out projects/028-ridge-encounters/review/run]
// Writes <out>/sheet-*.png (12 pairs each), <out>/pairs/<seed>.png, <out>/report.json. No dependencies.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), P = path.join(root, 'projects/028-ridge-encounters');
const DB = require(path.join(root, 'assets/drybrush.js')), C = require(path.join(P, 'compose.js')), PARTS = require(path.join(P, 'parts.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const n = +arg('n', 24), start = +arg('start', 1000), step = +arg('step', 7919), place = isNaN(+arg('place', 0)) ? arg('place', 0) : +arg('place', 0), regime = +arg('regime', 0), event = +arg('event', 0), out = path.resolve(arg('out', path.join(P, 'review/run')));
for (const m of JSON.parse(fs.readFileSync(path.join(P, 'dem/index.json'))).places) { const b = zlib.gunzipSync(fs.readFileSync(path.join(P, 'dem', m.slug + '.dem'))), a = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), n = m.size; for (let y = 0; y < n; y++) for (let x = 1; x < n; x++) a[y * n + x] += a[y * n + x - 1]; C.setDEM(m.slug, m, a); }
fs.mkdirSync(path.join(out, 'pairs'), { recursive: true });
const each = +arg('each', 0), jobs = [];
const only = arg('places', '') ? arg('places', '').split(',') : null;
if (each) C.places().filter(pl => !only || only.includes(pl)).forEach((pl, pi) => { for (let k = 0; k < each; k++) jobs.push({ seed: start + k * step + pi * 101, place: pl }); }); else for (let k = 0; k < n; k++) jobs.push({ seed: start + k * step, place });

const crcT = new Int32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(8 + d.length + 4); o.writeUInt32BE(d.length, 0); b.copy(o, 4); o.writeUInt32BE(crc(b), 8 + d.length); return o; };
function png(gray, w, h) {
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) gray.copy(raw, y * (w + 1) + 1, y * w, y * w + w);
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
// 5×7 digits and a few letters, enough for "seed register/place FLAGS"
const FONT = { '0': '75557', '1': '26227', '2': '71747', '3': '71717', '4': '55711', '5': '74717', '6': '74757', '7': '71111', '8': '75757', '9': '75717', a: '25755', b: '65656', c: '34443', d: '65556', e: '74647', f: '74644', g: '34553', h: '55755', i: '72227', j: '11152', k: '55655', l: '44447', m: '57755', n: '65555', o: '25552', p: '65644', q: '25563', r: '65655', s: '34216', t: '72222', u: '55557', v: '55552', w: '55775', x: '55255', y: '55222', z: '71247', ' ': '00000', '/': '11244', '-': '00700', '.': '00002' };
const glyph = ch => FONT[ch] || null;
function label(buf, W, x, y, text) {
  for (const ch0 of text) { const ch = ch0.toLowerCase(), g = glyph(ch);
    if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((+g[r] >> (2 - c)) & 1) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) buf[(y + r * 2 + a) * W + x + c * 2 + b] = 210;
    x += g ? 8 : 0; }
}

const CW = 1100, CH = 675, PW = 1080, PH = 1350, results = [], tiles = [];
for (const job of jobs) {
  const seed = job.seed, t0 = Date.now(), sh = C.sheets(PARTS, { seed, place: job.place, regime, event, pair: arg('pair', '') }), imgs = sh.map((s, i) => DB.paint(s, { seed: seed + i, bristle: s.temper.bristle, streak: s.temper.streak, grain: s.temper.grain }));
  const g = Buffer.alloc(CW * CH, 11), vals = [];
  imgs.forEach((im, side) => { for (let y = 0; y < CH; y++) for (let x = 0; x < PW / 2; x++) { let v = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) v += im.rgba[((y * 2 + a) * PW + x * 2 + b) * 4]; g[y * CW + x + side * (PW / 2 + 20)] = v >> 2; } });
  sh.forEach((s, side) => imgs[side].rgba && (() => { const [bx, by, bw, bh] = s.box; for (let y = by; y < by + bh; y += 3) for (let x = bx; x < bx + bw; x += 3) vals.push(imgs[side].rgba[(y * PW + x) * 4]); })());
  vals.sort((a, b) => a - b); const pc = q => vals[(vals.length * q) | 0], sky = sh[0].skyline, land = sh[0].land;
  // shape of a skyline: its overall slope, and whether a summit stands whole inside it
  const shape = k => { let sx = 0, sy = 0, sxx = 0, sxy = 0; k.forEach((v, i) => { const x = i / k.length; sx += x; sy += v; sxx += x * x; sxy += x * v; }); const m = k.length, slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
    const mi = k.indexOf(Math.min(...k)), l = Math.max(...k.slice(0, mi + 1)) - k[mi], r = Math.max(...k.slice(mi)) - k[mi], in_ = mi > k.length * 0.2 && mi < k.length * 0.8;
    return { slope, wedge: Math.abs(slope) > 0.45 && Math.min(l, r) < 0.08, horn: in_ && Math.min(l, r) > 0.22 }; };
  const tells = k => k.filter(v => v > 0.03).length >= k.length * 0.3;   // a frame that is all land (looking down, a wall) has no skyline to judge or compare
  // one view cut in two is judged as one skyline; two gazes are judged sheet by sheet, and only the sheets that have a skyline
  const parts_ = sh[0].pair === 'panorama' ? [sky] : [sky.slice(0, 24), sky.slice(24)].filter(tells), shapes = parts_.filter(tells).map(shape), slope = shapes.length ? shapes[0].slope : 0;
  const flags = [];
  if (pc(0.02) > 85 && sh[0].regime !== 'whiteout') flags.push('TIMID');   // a whiteout is pale on purpose if (pc(0.98) - pc(0.02) < 95) flags.push('FLAT');
  if (land[0] + land[1] < 0.16) flags.push('EMPTY'); if (shapes.some(q => q.horn)) flags.push('HORN');
  if (shapes.length && shapes.every(q => q.wedge)) flags.push('WEDGE');
  const twin = tells(sky) && results.find(o => { if (!tells(o.skyline)) return false; let d = 0; o.skyline.forEach((v, i) => d += Math.abs(v - sky[i])); return d / sky.length < 0.035; }); if (twin) flags.push('TWIN-' + twin.seed);
  const rec = { seed, register: sh[0].regime, place: sh[0].place, light: sh[0].light, key: sh[0].tonalKey, weather: sh[0].weather, pair: sh[0].pair, event: sh[0].event, temper: sh[0].temper, light2: sh[0].light, p02: pc(0.02), p50: pc(0.5), p98: pc(0.98), black: +(vals.filter(v => v < 70).length / vals.length).toFixed(3), landL: +land[0].toFixed(2), landR: +land[1].toFixed(2), slope: +slope.toFixed(2), flags, ms: Date.now() - t0, skyline: sky };
  results.push(rec); fs.writeFileSync(path.join(out, 'pairs', (each ? rec.place + '-' : '') + seed + '.png'), png(g, CW, CH)); tiles.push(g);
  console.log(String(seed).padEnd(9), rec.register.padEnd(9), rec.place.padEnd(12), (rec.light + '/' + rec.key).padEnd(14), rec.weather.padEnd(28), rec.pair.padEnd(9), rec.event.padEnd(5), `p02 ${rec.p02} p98 ${rec.p98} black ${rec.black} land ${rec.landL}/${rec.landR}`, flags.join(' '));
}
for (let s = 0; s * 12 < jobs.length; s++) {
  const TW = CW >> 1, TH = CH >> 1, W = 3 * (TW + 10), H = 4 * (TH + 22), sheet = Buffer.alloc(W * H, 11);
  tiles.slice(s * 12, s * 12 + 12).forEach((g, i) => { const ox = (i % 3) * (TW + 10), oy = ((i / 3) | 0) * (TH + 22), r = results[s * 12 + i];
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) sheet[(oy + y) * W + ox + x] = (g[y * 2 * CW + x * 2] + g[y * 2 * CW + x * 2 + 1] + g[(y * 2 + 1) * CW + x * 2] + g[(y * 2 + 1) * CW + x * 2 + 1]) >> 2;
    label(sheet, W, ox + 4, oy + TH + 5, (each ? r.place + ' ' : '') + String(r.seed) + '  ' + r.p02 + '-' + r.p98 + '  ' + r.register + ' ' + r.flags.join(' ').replace(/-\d+/g, '')); });
  fs.writeFileSync(path.join(out, `sheet-${s + 1}.png`), png(sheet, W, H));
}
let target = null; try { target = JSON.parse(fs.readFileSync(path.join(P, 'review/source-measurements.json'))).pair; } catch (e) {}
const med = k => { const v = results.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
const count = f => results.filter(r => r.flags.some(x => x.startsWith(f))).length;
const byPlace = {}; for (const r of results) { const b = byPlace[r.place] = byPlace[r.place] || { n: 0, clean: 0, p02: 0, p50: 0, black: 0, flags: {} }; b.n++; if (!r.flags.length) b.clean++; b.p02 += r.p02; b.p50 += r.p50; b.black += r.black; for (const f of r.flags) { const k = f.replace(/-\d+/, ''); b.flags[k] = (b.flags[k] || 0) + 1; } }
for (const k in byPlace) { const b = byPlace[k]; b.p02 = Math.round(b.p02 / b.n); b.p50 = Math.round(b.p50 / b.n); b.black = +(b.black / b.n).toFixed(3); }
if (each) { console.log('\nplace          clean  p02  p50  black  flags'); for (const [k, b] of Object.entries(byPlace).sort((a, c) => c[1].clean - a[1].clean)) console.log(k.padEnd(14), (b.clean + '/' + b.n).padEnd(6), String(b.p02).padEnd(4), String(b.p50).padEnd(4), String(b.black).padEnd(6), Object.entries(b.flags).map(e => e[0] + '×' + e[1]).join(' ')); }
const summary = { n: jobs.length, clean: results.filter(r => !r.flags.length).length, TIMID: count('TIMID'), FLAT: count('FLAT'), EMPTY: count('EMPTY'), HORN: count('HORN'), WEDGE: count('WEDGE'), TWIN: count('TWIN'), reachBlack: results.filter(r => r.p02 < 60).length,
  median: { p02: med('p02'), p50: med('p50'), p98: med('p98'), black: med('black') }, source: target && { p02: target.p02, p50: target.p50, p98: target.p98, black: target.black } };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ byPlace, made: new Date().toISOString(), args: { n, start, step, place, regime }, summary, results }, null, 1));
console.log('\n', summary, '\n→', out);
