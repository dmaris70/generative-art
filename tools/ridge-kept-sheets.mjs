#!/usr/bin/env node
// Builds labelled contact sheets from the already-painted pair images referenced by kept-*.json,
// for a curation pass over the whole kept pool (no repainting).
//   node tools/ridge-kept-sheets.mjs --out projects/028-ridge-encounters/edition/kept-review
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), P = path.join(root, 'projects/028-ridge-encounters');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('out', path.join(P, 'edition/kept-review')));
fs.mkdirSync(out, { recursive: true });

function readGrayPng(file) {
  const buf = fs.readFileSync(file);
  let off = 8, w = 0, h = 0, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const g = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) raw.copy(g, y * w, y * (w + 1) + 1, y * (w + 1) + 1 + w);
  return { g, w, h };
}
const crcT = new Int32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(8 + d.length + 4); o.writeUInt32BE(d.length, 0); b.copy(o, 4); o.writeUInt32BE(crc(b), 8 + d.length); return o; };
function png(gray, w, h) {
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) gray.copy(raw, y * (w + 1) + 1, y * w, y * w + w);
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const FONT = { '0': '75557', '1': '26227', '2': '71747', '3': '71717', '4': '55711', '5': '74717', '6': '74757', '7': '71111', '8': '75757', '9': '75717', a: '25755', b: '65656', c: '34443', d: '65556', e: '74647', f: '74644', g: '34553', h: '55755', i: '72227', j: '11152', k: '55655', l: '44447', m: '57755', n: '65555', o: '25552', p: '65644', q: '25563', r: '65655', s: '34216', t: '72222', u: '55557', v: '55552', w: '55775', x: '55255', y: '55222', z: '71247', ' ': '00000', '/': '11244', '-': '00700', '.': '00002' };
function label(buf, W, x, y, text) {
  for (const ch0 of text) { const ch = ch0.toLowerCase(), g = FONT[ch] || null;
    if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((+g[r] >> (2 - c)) & 1) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) buf[(y + r * 2 + a) * W + x + c * 2 + b] = 210;
    x += g ? 8 : 0; }
}

let items = [];
for (const f of ['kept.json', 'kept-v1.1.json', 'kept-v1.2.json', 'kept-v1.3.json', 'kept-v1.4.json']) {
  const d = JSON.parse(fs.readFileSync(path.join(P, 'edition', f)));
  items.push(...d.kept);
}
console.log('total kept items:', items.length);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(items, null, 1));

const tiles = [];
for (const it of items) {
  const file = path.join(P, it.img);
  if (!fs.existsSync(file)) { console.log('MISSING', it.img); continue; }
  const { g, w, h } = readGrayPng(file);
  tiles.push({ g, w, h, it });
}
console.log('loaded', tiles.length, 'images');

for (let s = 0; s * 12 < tiles.length; s++) {
  const group = tiles.slice(s * 12, s * 12 + 12);
  const TW = group[0].w >> 1, TH = group[0].h >> 1, W = 3 * (TW + 10), H = 4 * (TH + 22), sheet = Buffer.alloc(W * H, 11);
  group.forEach((t, i) => { const ox = (i % 3) * (TW + 10), oy = ((i / 3) | 0) * (TH + 22), CW = t.w;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) sheet[(oy + y) * W + ox + x] = (t.g[y * 2 * CW + x * 2] + t.g[y * 2 * CW + x * 2 + 1] + t.g[(y * 2 + 1) * CW + x * 2] + t.g[(y * 2 + 1) * CW + x * 2 + 1]) >> 2;
    label(sheet, W, ox + 4, oy + TH + 5, String(t.it.seed) + ' ' + t.it.place + ' ' + t.it.register + ' b' + t.it.batch + ' v' + t.it.version); });
  fs.writeFileSync(path.join(out, `sheet-${s + 1}.png`), png(sheet, W, H));
}
console.log('wrote', Math.ceil(tiles.length / 12), 'sheets to', out);
