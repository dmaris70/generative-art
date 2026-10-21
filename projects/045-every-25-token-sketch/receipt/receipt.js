#!/usr/bin/env node
// The receipt of the found — stage 2 of Every 25-Token Sketch in the room.
//
// Runs the same enumeration as the screen (babel.js, unchanged, loaded here without a browser)
// and, each time the slow lane changes hands, prints the dethroned champion on a thermal till
// printer: the 64 × 64 field dithered to the paper's dots, the code as people read it and as
// the library writes it, the program number, the score, how long it held the lane, the time.
// A day's run is one roll on the floor; the printer's clatter marks each takeover.
//
//   node receipt.js [--device /dev/usb/lp0 | --tcp host:9100 | --out file.bin | --png dir]
//                   [--width 384|576] [--rate 8] [--start HH:MM] [--replay N] [--cut]
//                   [--fade 0.9999] [--minhold 200]
//
// The room's selector is stricter than the screen's: the champion's claim fades by 0.9999 a
// program (the screen's 0.9992), and a ticket is printed only for a champion that held the lane
// 200 programs or more — the ones that lasted. Measured at one program a second, that is about
// a dozen tickets an exhibition day instead of a hundred. --fade 0.9992 --minhold 0 prints as
// the screen selects.
//
// --device   write ESC/POS bytes to a printer device (USB: /dev/usb/lp0; serial: /dev/ttyUSB0)
// --tcp      send to a network printer on port 9100
// --out      append the bytes to a file instead (a day's receipt, to print later)
// --png      also render each ticket as a PNG strip into this directory (the simulator)
// --width    dots across the paper: 384 for 58 mm paper, 576 for 80 mm (default 384)
// --rate     programs a second, as the screen (default 8)
// --start    lock the enumeration to the clock: program 1 at HH:MM JST today, so the printer and
//            a screen started at the same minute agree on the program number
// --replay   do not run live: print the found through program N at once (e.g. 30905), then exit
// --cut      partial cut after each ticket (printers with a cutter); default: feed only
// --fade     the champion's fade per program (default 0.9999; the screen uses 0.9992)
// --minhold  print only a champion that held the lane at least this many programs (default 200)
//
// No dependencies. Tested with the ESC/POS raster command GS v 0, which Epson TM-T20/T88 and the
// common 58 mm kiosk printers accept.
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), vm = require('vm'), zlib = require('zlib');

// ───────────────────────── arguments ─────────────────────────
const A = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k.startsWith('--')) { const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k.slice(2)] = v; } }
const WIDTH = +(A.width || 384), RATE = +(A.rate || 8), PROLOGUE = 280, FADE = +(A.fade || 0.9999), MINHOLD = +(A.minhold === undefined ? 200 : A.minhold);
const COLS = Math.floor(WIDTH / 12);          // characters a line in the printer's font A (12 dots wide): 32 on 58 mm, 48 on 80 mm
if (!A.device && !A.tcp && !A.out && !A.png) { console.error('nothing to print to: give --device, --tcp, --out or --png'); process.exit(2); }

// ───────────────────────── the piece, loaded without a browser ─────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'babel.js'), 'utf8');
const noop = () => {};
const ctx2d = () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 1 }) }, { get: (t, k) => (k in t ? t[k] : noop) });
const canvas = () => ({ width: 0, height: 0, clientWidth: 1400, clientHeight: 1000, getContext: ctx2d, toDataURL: () => '' });
let rafCb = null;
const sandbox = { window: { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1 }, document: { createElement: canvas }, requestAnimationFrame: (cb) => { rafCb = cb; return 1; }, cancelAnimationFrame: noop, performance: { now: () => Date.now() }, console };
vm.runInNewContext(src + '; this.Babel = Babel;', sandbox);
const Babel = sandbox.Babel;
const order = [...Array(15).keys()];
const RES = 64;
const D = (a, b) => (Math.abs(b) < 1e-9 ? (a < 0 ? -1e9 : 1e9) : a / b);
const M = (a, b) => (Math.abs(b) < 1e-9 ? 0 : a - b * Math.floor(a / b));
function field(k, t) {                       // the 64 × 64 tones of program k at time t, as the screen draws them
  const fn = Babel.render(Babel.program(k, order).tokens).fn, out = new Float32Array(RES * RES);
  let i = 0;
  for (let py = 0; py < RES; py++) { const y = -2 + (4 * (py + 0.5)) / RES; for (let px = 0; px < RES; px++) { const x = -2 + (4 * (px + 0.5)) / RES; let v = fn(x, y, t, D, M); if (!isFinite(v)) v = 0; out[i++] = 0.5 + 0.5 * Math.sin(v); } }
  return out;
}

// ───────────────────────── the ticket ─────────────────────────
const ESC = 0x1b, GS = 0x1d;
const bytes = [];
const put = (...b) => { for (const x of b) bytes.push(x); };
const text = (s) => { for (const ch of Buffer.from(s + '\n', 'latin1')) bytes.push(ch); };
const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ascii = (s) => s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/·/g, '.').replace(/[^\x20-\x7e]/g, '?');
// the field, each pixel a block of WIDTH/64 dots, Floyd–Steinberg dithered on the dot grid
function raster(vals) {
  const S = WIDTH / RES, W = WIDTH, H = WIDTH, g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = vals[Math.floor(y / S) * RES + Math.floor(x / S)];
  const bits = Buffer.alloc((W / 8) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, old = g[i], v = old < 0.5 ? 0 : 1, err = old - v;   // 1 = white paper, 0 = ink
    if (!v) bits[y * (W / 8) + (x >> 3)] |= 0x80 >> (x & 7);
    if (x + 1 < W) g[i + 1] += err * 7 / 16;
    if (y + 1 < H) { if (x) g[i + W - 1] += err * 3 / 16; g[i + W] += err * 5 / 16; if (x + 1 < W) g[i + W + 1] += err * 1 / 16; }
  }
  return bits;
}
// the lines of a ticket, each within the printer's columns; the code is the only line allowed to wrap
function lines(f, no, when) {
  const fit = (s) => (s.length > COLS ? s.slice(0, COLS - 1) + '~' : s);
  return [
    { s: ascii(f.code), bold: true },
    { s: fit(ascii('library: ' + f.postfix)) },
    { s: fit('program ' + grp(f.k + 1) + ' . ' + f.n + (f.n === 1 ? ' token' : ' tokens')) },
    { s: fit('structure ' + f.peak.toFixed(3) + ' . ' + (f.moves ? 'uses t' : 'no t')) },
    { s: fit('held the lane ' + grp(f.held) + (f.held === 1 ? ' program' : ' programs')) },
    { s: fit('found ' + grp(no) + ' . ' + when) },
    { s: fit('EVERY 25-TOKEN SKETCH . PCDTOKYO2026') },
  ];
}
function ticket(f, no, when) {
  bytes.length = 0;
  put(ESC, 0x40);                                                     // initialise
  put(ESC, 0x61, 0x00);                                               // left
  const bits = raster(field(f.k, f.until));
  put(GS, 0x76, 0x30, 0x00, (WIDTH / 8) & 0xff, (WIDTH / 8) >> 8, WIDTH & 0xff, WIDTH >> 8);   // GS v 0: raster, normal size
  for (const b of bits) bytes.push(b);
  put(ESC, 0x64, 0x01);                                               // feed 1
  for (const l of lines(f, no, when)) { if (l.bold) put(ESC, 0x45, 0x01); text(l.s); if (l.bold) put(ESC, 0x45, 0x00); }
  put(ESC, 0x64, A.cut ? 0x03 : 0x05);                                // feed
  if (A.cut) put(GS, 0x56, 0x01);                                     // partial cut
  return Buffer.from(bytes);
}

// ───────────────────────── outputs ─────────────────────────
let tcp = null;
function send(buf) {
  if (A.out) fs.appendFileSync(A.out, buf);
  if (A.device) fs.appendFileSync(A.device, buf);
  if (A.tcp) { if (!tcp) { const [h, p] = A.tcp.split(':'); tcp = net.createConnection(+p || 9100, h); tcp.on('error', (e) => console.error('printer:', e.message)); } tcp.write(buf); }
}
// the simulator: the same ticket as a PNG strip (one bit per dot, as the paper would show it)
function png(f, no, when, dir) {
  const bits = raster(field(f.k, f.until));
  const rows = [];                                                    // the printer wraps at COLS; so does the simulator
  for (const l of lines(f, no, when)) for (let i = 0; i < l.s.length; i += COLS) rows.push({ s: l.s.slice(i, i + COLS), bold: l.bold });
  const LH = 24, pad = 16, W = WIDTH, H = WIDTH + pad * 2 + rows.length * LH + 40;
  const img = Buffer.alloc(W * H, 0xf2);                              // paper
  for (let y = 0; y < WIDTH; y++) for (let x = 0; x < W; x++) if (bits[y * (W / 8) + (x >> 3)] & (0x80 >> (x & 7))) img[(y + pad) * W + x] = 0x10;
  for (let l = 0; l < rows.length; l++) glyphs(img, W, 0, WIDTH + pad * 2 + l * LH, rows[l].s, rows[l].bold);
  const scan = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) { scan[y * (W + 1)] = 0; img.copy(scan, y * (W + 1) + 1, y * W, (y + 1) * W); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path.join(dir, String(no).padStart(4, '0') + '-program-' + (f.k + 1) + '.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]));
}
let CRC; function crc32(b) { if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
// a minimal 3 × 5 dot font for the simulator's text, enough to read the ticket (the printer uses its own)
function glyphs(img, W, x0, y0, s, bold) {
  const F = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101011', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', '(': '010100100100010', ')': '010001001001010', '+': '000010111010000', '-': '000000111000000', '*': '101010111010101', '/': '001001010100100', '=': '000111000111000', '?': '111001011000010', ' ': '000000000000000' };
  const sc = 3, adv = 4 * sc;
  s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = F[s[i]] || F['?'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1')
      for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc + (bold ? 1 : 0); dx++) { const x = x0 + i * adv + c * sc + dx, y = y0 + r * sc + dy; if (x < W) img[y * W + x] = 0x10; }
  }
}

// ───────────────────────── running ─────────────────────────
const JST = 9 * 60;
const jst = (ms) => { const d = new Date(ms + JST * 60000); return d.toISOString().slice(11, 19) + ' JST'; };
if (A.png) fs.mkdirSync(A.png, { recursive: true });
const seen = new Set();
let printed = 0;
function flush(M, when) {                      // print every found not yet printed, oldest first
  const list = M.found().slice().reverse();
  for (const f of list) {
    if (seen.has(f.k)) continue;
    seen.add(f.k);
    const held = Math.round((f.until - f.since) * RATE);
    if (held < MINHOLD) continue;                                  // it did not last: no ticket
    printed++;
    const entry = Object.assign({}, f, { held });
    const w = when || jst(Date.now());
    send(ticket(entry, printed, w));
    if (A.png) png(entry, printed, w, A.png);
    console.log('found ' + printed + ': program ' + grp(f.k + 1) + '  ' + f.code + '  held ' + grp(held) + '  ' + w);
  }
}
if (A.replay) {
  const n = +A.replay;
  const M = Babel.create(canvas(), { at: n, rate: RATE, prologue: PROLOGUE, fade: FADE });
  flush(M, 'replay through program ' + grp(n));
  const s = M.stats();
  console.log('replay done: ' + grp(s.next) + ' programs, ' + grp(s.distinct) + ' distinct pictures, ' + grp(s.dups) + ' repeats, ' + grp(printed) + ' tickets');
  if (tcp) tcp.end();
} else {
  // live: the piece's own frame loop, driven at 20 Hz; with --start, locked to the clock
  let from = 0;
  if (A.start) {
    const [h, m] = A.start.split(':').map(Number);
    const now = new Date(Date.now() + JST * 60000), startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0) - JST * 60000;
    const elapsed = (Date.now() - startMs) / 1000;
    from = elapsed <= 0 ? 0 : elapsed < PROLOGUE / 60 ? Math.floor(elapsed * 60) : PROLOGUE + Math.floor((elapsed - PROLOGUE / 60) * RATE);
    if (elapsed < 0) console.log('starts at ' + A.start + ' JST, in ' + Math.round(-elapsed) + ' s');
    else console.log('locked to ' + A.start + ' JST: beginning at program ' + grp(from + 1));
  }
  const M = Babel.create(canvas(), { rate: RATE, prologue: PROLOGUE, from, fade: FADE });
  console.log('live: ' + RATE + ' programs a second, ' + WIDTH + ' dots across, fade ' + FADE + ', a ticket for a hold of ' + MINHOLD + ' or more. Ctrl-C to stop.');
  setInterval(() => { if (rafCb) { const cb = rafCb; rafCb = null; cb(Date.now()); } flush(M); }, 50);
}
