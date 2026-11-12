// Streaming PNG writer for print files larger than a canvas can hold.
// Rows are filtered (Sub) and pushed through CompressionStream('deflate') — which emits the
// zlib format PNG requires — strip by strip, so memory holds one strip plus compressed output.
// Writes IHDR, sRGB (perceptual), pHYs (true dpi, so RIPs and Photoshop open it at print size),
// tEXt provenance, IDAT×n, IEND. Truecolour RGB, 8 or 16 bit.
(function (global) {
  'use strict';
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c >>> 0;
  }
  function crc32(bufs) {
    let c = 0xffffffff;
    for (const b of bufs) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function u32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function chunk(type, data) {
    const t = new TextEncoder().encode(type);
    return [u32(data.length), t, data, u32(crc32([t, data]))];
  }
  // tEXt is Latin-1. The punctuation we write prose with is not, and turning an em dash into '?'
  // makes the provenance read as though something went wrong, so the usual typographic characters
  // are transliterated rather than lost. Anything else above U+00FF still becomes '?'.
  const TRANSLIT = { 0x2013: '-', 0x2014: '-', 0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"',
                     0x2026: '...', 0x2192: '->', 0x2194: '<->', 0x00a0: ' ', 0x2212: '-', 0x2032: "'" };
  function latin1(s) {
    let t = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      t += c < 256 ? s[i] : (TRANSLIT[c] !== undefined ? TRANSLIT[c] : '?');
    }
    const out = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); out[i] = c < 256 ? c : 63; }
    return out;
  }

  // opts: { width, height, bitDepth (8|16), dpi, text: {key: value} }
  // returns { writeRows(Uint8Array|Uint16Array rows, nRows), finish() → Promise<Blob> }
  function createWriter(opts) {
    const W = opts.width, H = opts.height, bd = opts.bitDepth === 16 ? 16 : 8;
    const bpp = bd === 16 ? 6 : 3, stride = W * bpp + 1;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    const ihdr = new Uint8Array(13);
    ihdr.set(u32(W), 0); ihdr.set(u32(H), 4);
    ihdr[8] = bd; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    parts.push.apply(parts, chunk('IHDR', ihdr));
    parts.push.apply(parts, chunk('sRGB', new Uint8Array([0])));
    const ppm = Math.round(opts.dpi / 0.0254), phys = new Uint8Array(9);
    phys.set(u32(ppm), 0); phys.set(u32(ppm), 4); phys[8] = 1;
    parts.push.apply(parts, chunk('pHYs', phys));
    const text = opts.text || {};
    for (const k in text) {
      const kb = latin1(k), vb = latin1(String(text[k]));
      const d = new Uint8Array(kb.length + 1 + vb.length);
      d.set(kb, 0); d.set(vb, kb.length + 1);
      parts.push.apply(parts, chunk('tEXt', d));
    }

    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    const idat = [];
    const pump = (async function () {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        idat.push.apply(idat, chunk('IDAT', r.value));
      }
    })();

    // rows: interleaved RGB samples, top row first; 16-bit as Uint16Array (native order)
    async function writeRows(rows, n) {
      const out = new Uint8Array(stride * n);
      for (let y = 0; y < n; y++) {
        const o = y * stride;
        out[o] = 1; // filter: Sub
        if (bd === 8) {
          const s = y * W * 3;
          for (let i = 0; i < W * 3; i++) {
            const v = rows[s + i], left = i >= 3 ? rows[s + i - 3] : 0;
            out[o + 1 + i] = (v - left) & 255;
          }
        } else {
          const s = y * W * 3;
          // big-endian bytes, Sub filter on bytes with bpp = 6
          for (let i = 0; i < W * 3; i++) {
            const v = rows[s + i];
            out[o + 1 + i * 2] = v >>> 8;
            out[o + 2 + i * 2] = v & 255;
          }
          for (let i = W * 6 - 1; i >= 6; i--) out[o + 1 + i] = (out[o + 1 + i] - out[o + 1 + i - 6]) & 255;
        }
      }
      await writer.write(out);
    }
    async function finish() {
      await writer.close();
      await pump;
      const all = parts.concat(idat, chunk('IEND', new Uint8Array(0)));
      return new Blob(all, { type: 'image/png' });
    }
    return { writeRows: writeRows, finish: finish };
  }

  global.PNGStream = { createWriter: createWriter, crc32: crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
