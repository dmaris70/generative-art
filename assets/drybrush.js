/*
 * drybrush.js — a monochrome dry-brush painter that works in a float buffer, not on a canvas.
 *
 * Given a tonal reading (a small greyscale map) it PAINTS the picture the way a hand would:
 * big loaded strokes first, then smaller and smaller brushes, each stroke placed where the
 * sheet is still most wrong, pulled along the grain of the form (the isophote direction), and
 * lifted when the tone under the brush stops agreeing with the paint on it. Bristles streak,
 * pressure tapers, a dry brush skips. Finally the emulsion/paper grain is re-grown from a
 * measured law (strength per tone band, neighbour correlation).
 *
 * Everything is arithmetic on Float32Arrays with a seeded PRNG, so a seed gives the same sheet
 * in every browser and in node (no canvas anti-aliasing differences).
 *
 *   const out = DryBrush.paint(SHEET, { seed, scale, detail, bristle, wobble, streak, grain });
 *   out → { w, h, rgba: Uint8ClampedArray, strokes }
 */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function b64bytes(s) {
    if (typeof s !== 'string') return s;                     // already bytes (a composed sheet)
    if (typeof atob === 'function') {
      const b = atob(s), u = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return u;
    }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  // bilinear resample of a w0×h0 map to w×h
  function resample(src, w0, h0, w, h) {
    const out = new Float32Array(w * h), sx = w0 / w, sy = h0 / h;
    for (let y = 0; y < h; y++) {
      let fy = (y + 0.5) * sy - 0.5; if (fy < 0) fy = 0; if (fy > h0 - 1) fy = h0 - 1;
      const y0 = fy | 0, y1 = Math.min(h0 - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        let fx = (x + 0.5) * sx - 0.5; if (fx < 0) fx = 0; if (fx > w0 - 1) fx = w0 - 1;
        const x0 = fx | 0, x1 = Math.min(w0 - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * w0 + x0] * (1 - tx) + src[y0 * w0 + x1] * tx;
        const b = src[y1 * w0 + x0] * (1 - tx) + src[y1 * w0 + x1] * tx;
        out[y * w + x] = a * (1 - ty) + b * ty;
      }
    }
    return out;
  }

  // gaussian ≈ three box blurs, edges clamped
  function boxH(src, dst, w, h, r) {
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[o + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        dst[o + x] = acc / n;
        acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const n = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = acc / n;
        acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
      }
    }
  }
  function blur(src, w, h, sigma) {
    const a = Float32Array.from(src);
    if (sigma < 0.4) return a;
    const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma * 12 / 3 + 1) / 2 - 0.5));
    const b = new Float32Array(w * h);
    for (let i = 0; i < 3; i++) { boxH(a, b, w, h, r); boxV(b, a, w, h, r); }
    return a;
  }

  // isophote direction (unit vector along the form) + coherence, from the structure tensor
  function flow(ref, w, h, s, spread) {
    const g = blur(ref, w, h, 1.2 * s);
    const jxx = new Float32Array(w * h), jyy = new Float32Array(w * h), jxy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
      jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
    }
    const a = blur(jxx, w, h, spread * s), b = blur(jyy, w, h, spread * s), c = blur(jxy, w, h, spread * s);
    const ux = new Float32Array(w * h), uy = new Float32Array(w * h), coh = new Float32Array(w * h), mag = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const th = 0.5 * Math.atan2(2 * c[i], a[i] - b[i]) + Math.PI / 2;   // ⟂ to the gradient
      ux[i] = Math.cos(th); uy[i] = Math.sin(th);
      const d = Math.sqrt((a[i] - b[i]) * (a[i] - b[i]) + 4 * c[i] * c[i]);
      const e = Math.max(0, a[i] + b[i]);                                  // running-sum blurs can dip a hair below zero on flat ground
      coh[i] = Math.min(1, d / (e + 1e-3)); mag[i] = Math.sqrt(e) / s;
    }
    return { ux, uy, coh, mag };
  }

  function paint(sheet, opt) {
    opt = opt || {};
    const S = opt.scale || 1, seed = (opt.seed >>> 0) || 1;
    const detail = opt.detail === undefined ? 1 : opt.detail;
    const bristle = opt.bristle === undefined ? 1 : opt.bristle;
    const wobble = opt.wobble === undefined ? 1 : opt.wobble;
    const grainK = opt.grain === undefined ? 1 : opt.grain;
    const bite = opt.bite === undefined ? 1 : opt.bite;
    const streak = opt.streak === undefined ? 1 : opt.streak;
    const R = mulberry32(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(6.283185307 * R());

    const w = Math.round(sheet.box[2] * S), h = Math.round(sheet.box[3] * S), N = w * h;
    const ref = resample(Float32Array.from(b64bytes(sheet.tone)), sheet.tw, sheet.th, w, h);
    const F = flow(ref, w, h, S, 5);
    // taking the grain out also took some bite out of the small forms: give it back before painting
    const soft = blur(ref, w, h, 3 * S);
    for (let i = 0; i < N; i++) ref[i] += (ref[i] - soft[i]) * 0.3 * bite;

    // toned ground: a thin uneven wash of the picture's own average light
    const buf = new Float32Array(N);
    const wash = blur(Float32Array.from({ length: N }, () => R()), w, h, 40 * S);
    for (let i = 0; i < N; i++) buf[i] = 222 + (wash[i] - 0.5) * 60;

    const radii = [26, 13, 6.5, 3.2, 1.7].map(r => r * S);
    const tol = [0, 8, 6, 4, 2.6].map(t => t / Math.max(0.25, detail));
    let strokes = 0, scratch = new Float32Array(1), side = new Float32Array(1);

    for (let L = 0; L < radii.length; L++) {
      const rad = radii[L], last = L === radii.length - 1;
      const target = last ? ref : blur(ref, w, h, rad * 0.45);
      const step = Math.max(1, Math.round(rad * (L === 0 ? 0.9 : 1.1)));
      const gw = Math.ceil(w / step), gh = Math.ceil(h / step);
      const order = new Uint32Array(gw * gh);
      for (let i = 0; i < order.length; i++) order[i] = i;
      for (let i = order.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0, t = order[i]; order[i] = order[j]; order[j] = t; }
      const opac = L === 0 ? 0.96 : 0.9 - 0.04 * L;

      for (let oi = 0; oi < order.length; oi++) {
        const cx = (order[oi] % gw) * step, cy = ((order[oi] / gw) | 0) * step;
        // where in this cell is the sheet most wrong?
        let worst = -1, wx = 0, wy = 0, sum = 0, cnt = 0;
        for (let y = cy; y < Math.min(h, cy + step); y++) for (let x = cx; x < Math.min(w, cx + step); x++) {
          const e = Math.abs(buf[y * w + x] - target[y * w + x]); sum += e; cnt++;
          if (e > worst) { worst = e; wx = x; wy = y; }
        }
        if (L > 0 && sum / cnt < tol[L]) continue;

        // pull the stroke along the form until the paint stops agreeing with what is under it
        const tone = target[wy * w + wx] + gauss() * (L === 0 ? 2.5 : 1.2) * wobble;
        const coh0 = F.coh[wy * w + wx];
        const maxSeg = Math.round((L === 0 ? 5 : 3) + 14 * coh0), seg = Math.max(1.5, rad * 0.9);
        const px = [wx], py = [wy];
        let x = wx, y = wy, dx = 0, dy = 0, bend = gauss() * 0.06 * wobble;
        for (let dirPass = 0; dirPass < 2; dirPass++) {
          x = wx; y = wy; dx = 0; dy = 0;
          const sgn = dirPass ? -1 : 1, n = dirPass ? maxSeg >> 1 : maxSeg - (maxSeg >> 1);
          for (let k = 0; k < n; k++) {
            const i = (y | 0) * w + (x | 0);
            let vx = F.ux[i], vy = F.uy[i];
            if (k === 0) { vx *= sgn; vy *= sgn; } else if (vx * dx + vy * dy < 0) { vx = -vx; vy = -vy; }
            const c = F.coh[i], jit = (1 - c) * 0.5 * wobble * gauss() + bend;
            const ca = Math.cos(jit), sa = Math.sin(jit);
            dx = vx * ca - vy * sa; dy = vx * sa + vy * ca;
            const nx = x + dx * seg, ny = y + dy * seg;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
            const j = (ny | 0) * w + (nx | 0);
            if (k > 0 && Math.abs(target[j] - tone) > Math.abs(target[j] - buf[j]) + 1.5) break;
            x = nx; y = ny;
            if (dirPass) { px.unshift(x); py.unshift(y); } else { px.push(x); py.push(y); }
          }
        }

        // stamp it: one coverage mask for the whole stroke, then a single lay of paint
        let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
        for (let k = 0; k < px.length; k++) {
          bx0 = Math.min(bx0, px[k] - rad - 2); bx1 = Math.max(bx1, px[k] + rad + 2);
          by0 = Math.min(by0, py[k] - rad - 2); by1 = Math.max(by1, py[k] + rad + 2);
        }
        bx0 = Math.max(0, bx0 | 0); by0 = Math.max(0, by0 | 0); bx1 = Math.min(w - 1, Math.ceil(bx1)); by1 = Math.min(h - 1, Math.ceil(by1));
        const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
        if (scratch.length < bw * bh) { scratch = new Float32Array(bw * bh * 2); side = new Float32Array(bw * bh * 2); }
        scratch.fill(0, 0, bw * bh);
        const nb = Math.max(3, Math.round(rad * 1.2)), hairs = new Float32Array(nb);
        const dry = Math.min(0.85, (0.18 + 0.1 * L + R() * 0.25) * bristle);
        for (let k = 0; k < nb; k++) hairs[k] = 1 - dry * R() * R() * 1.6;
        const total = Math.max(1, px.length - 1), skip = R() * 100, soft = Math.max(0.8, rad * (L === 0 ? 0.5 : 0.3));
        const segs = px.length === 1 ? 1 : px.length - 1;
        for (let k = 0; k < segs; k++) {
          const ax = px[k], ay = py[k], ex = px.length === 1 ? ax + 0.01 : px[k + 1], ey = px.length === 1 ? ay : py[k + 1];
          const sx = ex - ax, sy = ey - ay, sl = sx * sx + sy * sy, len = Math.sqrt(sl);
          const y0 = Math.max(by0, Math.floor(Math.min(ay, ey) - rad - 1)), y1 = Math.min(by1, Math.ceil(Math.max(ay, ey) + rad + 1));
          const x0 = Math.max(bx0, Math.floor(Math.min(ax, ex) - rad - 1)), x1 = Math.min(bx1, Math.ceil(Math.max(ax, ex) + rad + 1));
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
            let t = ((xx - ax) * sx + (yy - ay) * sy) / sl; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = xx - ax - sx * t, qy = yy - ay - sy * t, d = Math.sqrt(qx * qx + qy * qy);
            if (d >= rad) continue;
            let cov = (rad - d) / soft; if (cov > 1) cov = 1;
            const u = (qx * -sy + qy * sx) / (len * rad);                     // −1…1 across the brush
            const hair = hairs[Math.min(nb - 1, ((u * 0.5 + 0.5) * nb) | 0)];
            const s = (k + t) / total;                                         // 0…1 along the stroke
            const press = Math.min(1, 0.35 + 3.2 * Math.min(s, 1 - s) + (total < 2 ? 1 : 0));
            const a = cov * (1 - (1 - hair) * (0.4 + 0.6 * s)) * press;       // the brush dries as it travels
            const m = (yy - by0) * bw + (xx - bx0);
            if (a > scratch[m]) scratch[m] = a;
          }
        }
        for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
          const a = scratch[yy * bw + xx] * opac; if (a <= 0) continue;
          const i = (yy + by0) * w + xx + bx0;
          buf[i] += (tone - buf[i]) * a;
        }
        strokes++;
      }
    }

    // the drag: a nearly dry, hair-thin brush pulled along the form wherever the reading says the passage is streaked
    if (streak > 0 && sheet.tex) {
      const tex = resample(Float32Array.from(b64bytes(sheet.tex)), sheet.xw, sheet.xh, w, h);
      const cell = Math.max(2, Math.round(2.5 * S)), hw = Math.max(1, Math.round(S));
      const form = F.mag, Fd = flow(ref, w, h, S, 22);   // the drag follows the broad sweep, not every eddy — and only where there is form
      if (opt.debug) opt.debug.form = form;
      for (let cy = 0; cy < h; cy += cell) for (let cx = 0; cx < w; cx += cell) {
        const x0 = Math.min(w - 1, cx + R() * cell), y0 = Math.min(h - 1, cy + R() * cell);
        const i0 = (y0 | 0) * w + (x0 | 0), e = Math.max(0, tex[i0] / 8 - 1.6) * Math.min(1, Math.max(0, (form[i0] - 0.45) / 0.45));
        if (R() > e / 5) continue;
        const off = gauss() * (e + 2) * 1.7 * streak, n = Math.round((3 + R() * 6 + 6 * Fd.coh[i0]) * S);
        let x = x0, y = y0, dx = Fd.ux[i0], dy = Fd.uy[i0];
        if (R() < 0.5) { dx = -dx; dy = -dy; }
        for (let k = 0; k < n; k++) {
          const i = (y | 0) * w + (x | 0);
          let vx = Fd.ux[i], vy = Fd.uy[i]; if (vx * dx + vy * dy < 0) { vx = -vx; vy = -vy; }
          const j = (1 - Fd.coh[i]) * 0.35 * wobble * gauss(); dx = vx - vy * j; dy = vy + vx * j;
          const a = off * Math.sin(Math.PI * (k + 0.5) / n);
          for (let yy = -hw; yy <= hw; yy++) for (let xx = -hw; xx <= hw; xx++) {
            const qx = (x | 0) + xx, qy = (y | 0) + yy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
            const kx = 1 - Math.abs(qx + 0.5 - x) / (hw + 0.5), ky = 1 - Math.abs(qy + 0.5 - y) / (hw + 0.5);
            if (kx > 0 && ky > 0) buf[qy * w + qx] += a * kx * ky * 0.55;
          }
          x += dx; y += dy; if (x < 0 || y < 0 || x >= w || y >= h) break;
          strokes += k === 0 ? 1 : 0;
        }
      }
    }

    // the grain, re-grown from its measured law
    if (grainK > 0) {
      const gw0 = sheet.box[2], gh0 = sheet.box[3];
      let n0 = new Float32Array(gw0 * gh0);
      for (let i = 0; i < n0.length; i++) n0[i] = gauss();
      const rho = sheet.grainRho, k = rho > 0.01 ? (1 - Math.sqrt(Math.max(0, 1 - 2 * rho * rho))) / (2 * rho) : 0;
      const t = new Float32Array(n0.length);
      for (let y = 0; y < gh0; y++) for (let x = 0; x < gw0; x++) {
        const o = y * gw0; t[o + x] = n0[o + x] + k * (n0[o + Math.max(0, x - 1)] + n0[o + Math.min(gw0 - 1, x + 1)]);
      }
      for (let y = 0; y < gh0; y++) for (let x = 0; x < gw0; x++) {
        n0[y * gw0 + x] = t[y * gw0 + x] + k * (t[Math.max(0, y - 1) * gw0 + x] + t[Math.min(gh0 - 1, y + 1) * gw0 + x]);
      }
      const n = S === 1 ? n0 : resample(n0, gw0, gh0, w, h);
      let v = 0; for (let i = 0; i < N; i++) v += n[i] * n[i]; v = Math.sqrt(v / N);
      const Ls = sheet.grainL, SD = sheet.grainSD;
      for (let i = 0; i < N; i++) {
        const f = Math.min(Ls.length - 1.001, Math.max(0, (buf[i] - Ls[0]) / (Ls[1] - Ls[0])));
        const j = f | 0, sd = SD[j] + (SD[j + 1] - SD[j]) * (f - j);
        buf[i] += n[i] / v * sd * 1.08 * grainK;
      }
    }

    // mount it on the mat
    const OW = Math.round(sheet.W * S), OH = Math.round(sheet.H * S), rgba = new Uint8ClampedArray(OW * OH * 4);
    for (let i = 0; i < OW * OH; i++) { rgba[i * 4] = sheet.mat[0]; rgba[i * 4 + 1] = sheet.mat[1]; rgba[i * 4 + 2] = sheet.mat[2]; rgba[i * 4 + 3] = 255; }
    const ox = Math.round(sheet.box[0] * S), oy = Math.round(sheet.box[1] * S);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = ((y + oy) * OW + x + ox) * 4, v = buf[y * w + x];
      rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v;
    }
    return { w: OW, h: OH, rgba, strokes };
  }

  const api = { paint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.DryBrush = api;
})(typeof window !== 'undefined' ? window : globalThis);
