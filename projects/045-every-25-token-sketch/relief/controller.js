#!/usr/bin/env node
// The relief's controller — stage 3 of Every 25-Token Sketch in the room.
//
// Runs the unchanged babel.js without a browser at one program a second and drives the flip-dot
// modules: the conveyor (the last five programs at 28 × 28 dots, thresholded) and the slow lane
// (56 × 56 dots, ordered-dithered). Frames go out as the AlfaZeta XY5 serial protocol over
// RS-485 (0x80, command, address, column bytes, 0x8F), one address per 28 × 7 module; verify the
// command bytes against the datasheet of the panels bought. The digit counter and the ruler's
// pointer are stepper axes; this controller prints the targets they should hold (the program
// number; the pointer's position in mm) on a line a second, for the motion board to follow.
//
//   node controller.js [--serial /dev/ttyUSB0] [--simulate] [--start HH:MM] [--rate 1] [--fade 0.9999]
//
// The relief's selector is stricter than the screen's: the champion's claim fades by 0.9999 a
// program, not 0.9992, so the lane changes hands about a third as often. The receipt printer
// beside it (receipt.js) adds its own rule: a ticket only for a hold of 200 programs or more.
//
// --serial    the RS-485 adapter the panels hang off (115200 8N1, the XY5 default)
// --simulate  no hardware: print the fields as text once a second
// --start     lock the enumeration to the clock: program 1 at HH:MM JST today
// --rate      programs a second (default 1; flip-dots settle in about 30 ms, so 8 is possible
//             but unreadable)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k.startsWith('--')) { const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k.slice(2)] = v; } }
const RATE = +(A.rate || 1), FADE = +(A.fade || 0.9999);
if (!A.serial && !A.simulate) { console.error('give --serial <device> or --simulate'); process.exit(2); }

// ── the piece, loaded without a browser ──
const src = fs.readFileSync(path.join(__dirname, '..', 'babel.js'), 'utf8');
const noop = () => {};
const ctx2d = () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 1 }) }, { get: (t, k) => (k in t ? t[k] : noop) });
const canvas = () => ({ width: 0, height: 0, clientWidth: 1400, clientHeight: 1000, getContext: ctx2d, toDataURL: () => '' });
let rafCb = null;
const sandbox = { window: { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1 }, document: { createElement: canvas }, requestAnimationFrame: (cb) => { rafCb = cb; return 1; }, cancelAnimationFrame: noop, performance: { now: () => Date.now() }, console };
vm.runInNewContext(src + '; this.Babel = Babel;', sandbox);
const Babel = sandbox.Babel;
const order = [...Array(15).keys()];
const D = (a, b) => (Math.abs(b) < 1e-9 ? (a < 0 ? -1e9 : 1e9) : a / b);
const M = (a, b) => (Math.abs(b) < 1e-9 ? 0 : a - b * Math.floor(a / b));
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const cache = new Map();
function fn(k) { if (!cache.has(k)) cache.set(k, Babel.render(Babel.program(k, order).tokens).fn); return cache.get(k); }
// a program on an n × n dot field at time t: 1 = dot shown, thresholded or ordered-dithered
function dots(k, n, t, dither) {
  const f = fn(k), out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) { const y = -2 + (4 * (j + 0.5)) / n; for (let i = 0; i < n; i++) { const x = -2 + (4 * (i + 0.5)) / n; let v = f(x, y, t, D, M); if (!isFinite(v)) v = 0; const tone = 0.5 + 0.5 * Math.sin(v); out[j * n + i] = tone > (dither ? (BAYER[j & 3][i & 3] + 0.5) / 16 : 0.5) ? 1 : 0; } }
  return out;
}

// ── the modules: AlfaZeta XY5, 28 columns × 7 rows each, one byte a column, bit 0 the top row ──
// address map: the conveyor's five 28 × 28 tiles are four modules each (addresses 0x00 … 0x13,
// top to bottom); the slow lane's 56 × 56 is two modules across by eight down (0x20 … 0x2F,
// left column then right). Set the DIP switches of the panels to match.
const CONVEYOR = [...Array(5)].map((_, tile) => [...Array(4)].map((_, row) => ({ addr: tile * 4 + row, tile, row })));
const LANE = [...Array(16)].map((_, i) => ({ addr: 0x20 + i, col: Math.floor(i / 8), row: i % 8 }));
function frame(addr, columns, refresh) {               // one module's frame
  return Buffer.from([0x80, refresh ? 0x83 : 0x84, addr & 0xff, ...columns.map((c) => c & 0x7f), 0x8f]);
}
function moduleColumns(bits, n, x0, y0) {              // 28 column bytes from an n × n field at (x0, y0)
  const cols = [];
  for (let c = 0; c < 28; c++) { let b = 0; for (let r = 0; r < 7; r++) if (bits[(y0 + r) * n + x0 + c]) b |= 1 << r; cols.push(b); }
  return cols;
}
const REFRESH_ALL = Buffer.from([0x80, 0x82, 0x8f]);

// ── outputs ──
let port = null;
if (A.serial) port = fs.openSync(A.serial, 'w');
const out = (buf) => { if (port !== null) fs.writeSync(port, buf); };
function show(bits, n) {
  const rows = [];
  for (let j = 0; j < n; j++) { let s = ''; for (let i = 0; i < n; i++) s += bits[j * n + i] ? '●' : '·'; rows.push(s); }
  return rows;
}

// ── running ──
const JST = 9 * 60;
let from = 0;
if (A.start) {
  const [h, m] = A.start.split(':').map(Number);
  const now = new Date(Date.now() + JST * 60000), startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0) - JST * 60000;
  from = Math.max(0, Math.floor(((Date.now() - startMs) / 1000) * RATE));
  console.log('locked to ' + A.start + ' JST: beginning at program ' + (from + 1));
}
const P = Babel.create(canvas(), { rate: RATE, prologue: 0, from, fade: FADE });
const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const total = Math.log10(Number(Babel.CUM[25]));
const RULER_MM = 1180;                                  // the ruler's travel on the panel, 110 … 1290 mm
let lastNext = -1;
setInterval(() => {
  if (rafCb) { const cb = rafCb; rafCb = null; cb(Date.now()); }
  const s = P.stats(), champ = P.champion(), t = Date.now() / 1000;
  if (s.next === lastNext && !champ) return;
  lastNext = s.next;
  // the conveyor: the last five programs
  const tiles = [];
  for (let i = 0; i < 5; i++) { const k = s.next - 5 + i; tiles.push(k >= 0 ? dots(k, 28, t, false) : new Uint8Array(28 * 28)); }
  for (const tile of CONVEYOR) for (const m of tile) out(frame(m.addr, moduleColumns(tiles[m.tile], 28, 0, m.row * 7), false));
  // the slow lane
  const lane = champ ? dots(champ.k, 56, t, true) : new Uint8Array(56 * 56);
  for (const m of LANE) out(frame(m.addr, moduleColumns(lane, 56, m.col * 28, m.row * 7), false));
  out(REFRESH_ALL);
  // the axes: the counter's 28 wheels and the ruler's pointer, for the motion board
  const pointer = (RULER_MM * Math.log10(Math.max(1, s.next))) / total;
  const line = 'program ' + String(s.next).padStart(28, '0') + ' | pointer ' + pointer.toFixed(3) + ' mm | lane ' + (champ ? 'program ' + grp(champ.k + 1) + ' ' + champ.code : 'empty') + ' | found ' + grp(s.found) + ' | distinct ' + grp(s.distinct);
  if (A.simulate) {
    const rows = show(lane, 56), tileRows = tiles.map((b) => show(b, 28));
    const lines = [];
    for (let r = 0; r < 28; r++) lines.push(tileRows.map((tr) => tr[r]).join('  '));
    console.log('\x1b[2J\x1b[H' + lines.join('\n') + '\n\n' + rows.join('\n') + '\n\n' + line);
  } else console.log(line);
}, 1000 / Math.max(1, Math.min(RATE, 20)));
