// 039 — watercolour: paper, water and pigment.
//
// After Curtis, Anderson, Seims, Fleischer & Salesin, "Computer-Generated Watercolor"
// (SIGGRAPH 1997), simplified to run in a browser. Each pixel of the paper holds:
//   - water standing on its surface, and how damp the paper itself is;
//   - pigment suspended in that water, and pigment deposited on the paper;
//   - the height of the paper's grain (cold-pressed: hills and hollows).
// Every tick of time:
//   - water flows from where there is more to where there is less, between wet pixels; dry
//     paper takes water only from a very wet neighbour, so a wash keeps its edge, while damp
//     paper takes it readily (wet into wet);
//   - suspended pigment travels with the water and diffuses through it;
//   - water evaporates, faster at a wash's edge (which has dry paper beside it): water flows
//     out to the edge to replace it, carrying pigment, which dries there darker — the hard,
//     dark edge of a dried wash;
//   - pigment settles out of the water as it thins, more into the hollows of the grain for a
//     granulating pigment; when the water is gone it all settles;
//   - water laid on paper that is still damp lifts pigment that had begun to settle (the less
//     staining the pigment, the more), and the water pushes it outward: a backrun.
// Colour is the pigments' Kubelka–Munk absorption and scattering (paint.js) as a thin
// transparent layer over the white of the paper: there is no white paint, the paper is the
// light.

// The watercolour palette: the oil palette's pigments that are made as watercolours, with how
// much each granulates and how much it stains (resists lifting).
const WC_PIGMENTS = [
  { oil: 3, name: 'ultramarine', gran: 0.85, stain: 0.2 },
  { oil: 4, name: 'cerulean', gran: 0.7, stain: 0.2 },
  { oil: 5, name: 'burnt umber', gran: 0.5, stain: 0.5 },
  { oil: 6, name: 'burnt sienna', gran: 0.3, stain: 0.7 },
  { oil: 7, name: 'yellow ochre', gran: 0.4, stain: 0.4 },
  { oil: 8, name: 'cadmium red light', gran: 0.2, stain: 0.5 },
  { oil: 2, name: 'ivory black', gran: 0.3, stain: 0.6 },
];
const WC_S = 0.25; // watercolour pigment in gum scatters little: the paper does the scattering
const PAPER_SRGB = [247, 243, 233];

// Two grids: water and the pigment suspended in it move over a coarse grid of cells (3 px at
// 1×: a wash's water spreads and levels over centimetres, and one pixel per step was both too
// short a reach and too slow); the paper's grain, the exact edge of what is wet and the
// pigment settled on the paper are kept per pixel. When water spreads, the wet edge grows
// pixel by pixel, more readily along the hills of the grain, which gives a bloom its ragged
// edge; settling pigment is shared among a cell's wet pixels, more into the hollows if it
// granulates.
class WaterCanvas {
  constructor(w, h, PG, rng, o = {}) {
    this.w = w; this.h = h; this.res = o.res ?? 1;
    const n = w * h, Q = WC_PIGMENTS.length;
    this.Q = Q;
    this.pig = WC_PIGMENTS.map((d) => ({ ...d, K: PG[d.oil].K, S: PG[d.oil].S.map((s) => s * WC_S) }));
    const C = (this.C = Math.max(2, Math.round(3 * this.res)));
    const cw = (this.cw = Math.ceil(w / C)), chh = (this.ch = Math.ceil(h / C)), m = cw * chh;
    this.W = new Float32Array(m); // water standing in each cell (depth)
    this.damp = new Float32Array(m); // the paper's own dampness 0…1, per cell
    this.g = new Float32Array(m * Q); // pigment suspended in each cell's water
    this.nWet = new Int32Array(m); // how many of the cell's pixels are wet
    this.driedAt = new Float32Array(m).fill(-1e9); // when each cell last dried (minutes)
    // how many pixels each cell really has (the last row and column are cut by the picture's
    // edge: water spread as if they were whole ran half as deep again there, and dried as a line)
    this.cellPix = new Uint8Array(m);
    for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) this.cellPix[cy * cw + cx] = (Math.min(w, (cx + 1) * C) - cx * C) * (Math.min(h, (cy + 1) * C) - cy * C);
    this.wet = new Uint8Array(n); // which pixels the water reaches
    this.d = new Float32Array(n * Q); // pigment settled on the paper, per pixel
    this.grain = new Float32Array(n); // the paper's grain 0 (hollow) … 1 (hill)
    this.time = 0; // minutes
    this.box = null; // the cells where there is water [cx0, cy0, cx1, cy1)
    this.paper = PAPER_SRGB.map(srgbToLin);
    // cold-pressed grain: two octaves of value noise, ~4 and ~12 px across at 1×
    const hash = (x, y, k) => { let t = (x * 73856093) ^ (y * 19349663) ^ (k * 83492791); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    const vn = (x, y, k) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (hash(ix, iy, k) * (1 - sx) + hash(ix + 1, iy, k) * sx) * (1 - sy) + (hash(ix, iy + 1, k) * (1 - sx) + hash(ix + 1, iy + 1, k) * sx) * sy;
    };
    const R = this.res;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      // (a third, finer octave on a rotated lattice: two octaves read as a regular pattern of flecks)
      this.grain[y * w + x] = 0.35 * vn(x / (4 * R), y / (4 * R), 1) + 0.45 * vn(x / (12 * R), y / (12 * R), 2) + 0.2 * vn((0.8 * x + 0.6 * y) / (2.3 * R), (-0.6 * x + 0.8 * y) / (2.3 * R), 3);
    this.rng = rng;
  }

  cellOf(x, y) { return Math.floor(y / this.C) * this.cw + Math.floor(x / this.C); }
  growCells(c0x, c0y, c1x, c1y) {
    const b = this.box;
    this.box = b ? [Math.min(b[0], c0x), Math.min(b[1], c0y), Math.max(b[2], c1x), Math.max(b[3], c1y)] : [c0x, c0y, c1x, c1y];
  }
  // the pixel rect of a cell rect
  pxRect(b) { return [b[0] * this.C, b[1] * this.C, Math.min(this.w, b[2] * this.C), Math.min(this.h, b[3] * this.C)]; }

  // settle `frac` of cell c's suspended pigment onto its wet pixels (all its pixels if none is
  // wet), shared more into the hollows for a granulating pigment
  settle(c, frac) {
    const Q = this.Q, C = this.C, w = this.w, cx = c % this.cw, cy = (c - cx) / this.cw;
    const x0 = cx * C, y0 = cy * C, x1 = Math.min(w, x0 + C), y1 = Math.min(this.h, y0 + C);
    const any = this.nWet[c] > 0;
    for (let q = 0; q < Q; q++) {
      const m = this.g[c * Q + q] * frac;
      if (m <= 0) continue;
      const gr = this.pig[q].gran;
      let tot = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (!any || this.wet[i]) tot += 1 + gr * (0.5 - this.grain[i]) * 1.8; }
      if (tot <= 0) continue;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (!any || this.wet[i]) this.d[i * Q + q] += (m * (1 + gr * (0.5 - this.grain[i]) * 1.8)) / tot; }
      this.g[c * Q + q] -= m;
    }
  }

  // One tick of `dt` minutes. Returns the pixel rect it touched.
  tick(dt, o) {
    const b = this.box;
    if (!b) return null;
    const cw = this.cw, chh = this.ch, Q = this.Q, W = this.W, g = this.g, damp = this.damp, nWet = this.nWet;
    const x0 = Math.max(0, b[0] - 1), y0 = Math.max(0, b[1] - 1), x1 = Math.min(cw, b[2] + 1), y1 = Math.min(chh, b[3] + 1);
    const EPS = 0.004, SPREAD = 0.6 / (o.hold ?? 1), kf = 0.22, kd = 0.2, rate = o.dryRate ?? 1;
    // 1) flow and carry between neighbouring cells (right, down), three times per tick (so the
    // water levels before it dries; uneven depth dried as rings, its deepest spots as dots)
    for (let sub = 0; sub < 3; sub++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * cw + x;
      for (let k = 0; k < 2; k++) {
        if ((k === 0 && x + 1 >= x1) || (k === 1 && y + 1 >= y1)) continue;
        const j = k === 0 ? i + 1 : i + cw;
        const wi = W[i], wj = W[j];
        if (wi < EPS && wj < EPS) continue;
        // into dry paper only from a very wet neighbour; into damp paper (still marked wet)
        // readily. (Paper that has dried does not take water back: it did, its pigment was
        // handed on to the wettest neighbour, tick after tick, into the last puddle — a dot.)
        if (wj < EPS && wi < SPREAD && (damp[j] < 0.25 || nWet[j] === 0)) continue;
        if (wi < EPS && wj < SPREAD && (damp[i] < 0.25 || nWet[i] === 0)) continue;
        const F = kf * (wi - wj);
        const wf = F > 0 ? wi : wj, share = wf > 1e-6 ? Math.min(0.5, Math.abs(F) / wf) : 0, mw = Math.min(wi, wj);
        for (let q = 0; q < Q; q++) {
          const gi = g[i * Q + q], gj = g[j * Q + q];
          let m = F > 0 ? gi * share : -gj * share;
          // diffusion through the water, all but none in a thin film (where water was drying, its
          // pigment was pushed into the last puddle, which dried as a dark dot)
          if (mw > EPS) m += kd * (gi / Math.max(wi, 1e-4) - gj / Math.max(wj, 1e-4)) * mw * 0.5 * ((mw * mw) / (mw * mw + 0.01));
          if (m > gi) m = gi; if (-m > gj) m = -gj;
          g[i * Q + q] -= m; g[j * Q + q] += m;
        }
        W[i] -= F; W[j] += F;
      }
    }
    // 2) evaporate (an edge — dry cells beside it — faster), soak the paper, settle the pigment
    // the wet edge stays where it is while the water thins (a wash does not shrink as it dries:
    // evaporating much faster at the edge, its front receded ring by ring and left a line at
    // each); the edge darkens because pigment that reaches it settles there faster
    const evap = 0.012 * dt * rate, edgeK = 0.4;
    let nx0 = Infinity, ny0 = Infinity, nx1 = -1, ny1 = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * cw + x;
      // paper with no water left on it dries within minutes (at 0.004 a minute it stayed "damp"
      // for hours, and every later stroke lifted what was under it: holes, and rings where the
      // lifted pigment settled again)
      damp[i] = Math.max(0, damp[i] - (W[i] < EPS ? 0.06 : 0.004) * dt * rate);
      if (W[i] < EPS) {
        // the last of the water: all that is in it settles; the paper there is no longer wet
        if (W[i] > 0 || nWet[i] > 0) { this.settle(i, 1); W[i] = 0; this.dryCell(i); this.driedAt[i] = this.time; }
        continue;
      }
      // the wash's edge is where it meets paper that was dry before it: not paper that has just
      // dried as the wash dries (counted, the shrinking wet area deposited a ring at every step
      // and a dot where it ended)
      const t = this.time, old = (j) => W[j] < EPS && t - this.driedAt[j] > 5;
      let dry = 0;
      if (x > 0 && old(i - 1)) dry++; if (x < cw - 1 && old(i + 1)) dry++;
      if (y > 0 && old(i - cw)) dry++; if (y < chh - 1 && old(i + cw)) dry++;
      // (against the pixels the cell really has: the last row and column are cut by the picture's
      // edge, and counted as part-dry they took extra pigment there, a line along the edge)
      const partial = Math.max(0, 1 - nWet[i] / this.cellPix[i]);
      const e = evap * (1 + edgeK * (dry / 4 + 0.5 * partial));
      W[i] = Math.min(1.5, Math.max(0, W[i] - e));
      damp[i] = Math.min(1, damp[i] + 0.5 * e + 0.02);
      // pigment settles slowly while the water is deep, fast as it thins (so the flow out to a
      // drying edge has time to carry it there)
      const th = 1 - Math.min(1, W[i] / 0.3), atEdge = dry / 4 + 0.5 * partial;
      this.settle(i, Math.min(1, 0.004 * (1 + 12 * th * th) * (1 + 5 * atEdge) * dt));
      if (x < nx0) nx0 = x; if (x > nx1) nx1 = x; if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
    }
    // 3) the wet edge creeps into the cells that water has reached, pixel by pixel along the grain
    this.creep(x0, y0, x1, y1);
    this.time += dt;
    const touched = this.pxRect([x0, y0, x1, y1]);
    this.box = nx1 >= 0 ? [nx0, ny0, nx1 + 1, ny1 + 1] : null;
    return touched;
  }
  dryCell(c) {
    const C = this.C, w = this.w, cx = c % this.cw, cy = (c - cx) / this.cw;
    for (let y = cy * C; y < Math.min(this.h, cy * C + C); y++) for (let x = cx * C; x < Math.min(w, cx * C + C); x++) this.wet[y * w + x] = 0;
    this.nWet[c] = 0;
  }
  creep(cx0, cy0, cx1, cy1) {
    const C = this.C, w = this.w, h = this.h, wet = this.wet, W = this.W, cw = this.cw;
    const x0 = cx0 * C, y0 = cy0 * C, x1 = Math.min(w, cx1 * C), y1 = Math.min(h, cy1 * C);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      if (wet[i]) continue;
      const c = Math.floor(y / C) * cw + Math.floor(x / C);
      if (W[c] < 0.05) continue;
      const nb = (x > 0 && wet[i - 1] === 1) || (x < w - 1 && wet[i + 1] === 1) || (y > 0 && wet[i - w] === 1) || (y < h - 1 && wet[i + w] === 1);
      if (!nb) continue;
      if (this.rng() < 0.35 + 0.5 * this.grain[i]) { wet[i] = 2; } // 2: wet as of this tick
    }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (wet[i] === 2) { wet[i] = 1; this.nWet[Math.floor(y / C) * cw + Math.floor(x / C)]++; } }
  }
  // let it all dry; returns the pixel rect that changed
  dryOut(o) {
    let R = null;
    for (let k = 0; k < 3000 && this.box; k++) {
      const r = this.tick(2.5, o);
      R = !R ? r : r ? [Math.min(R[0], r[0]), Math.min(R[1], r[1]), Math.max(R[2], r[2]), Math.max(R[3], r[3])] : R;
    }
    return R;
  }

  // colour (linear) of pixel i: the settled pigment, and its share of what is still suspended
  // in its cell's water (which will settle there), as a transparent layer over the paper
  colourAt(i, out) {
    const Q = this.Q, pig = this.pig, w = this.w, x = i % w, y = (i - x) / w;
    const c = Math.floor(y / this.C) * this.cw + Math.floor(x / this.C);
    const share = this.wet[i] && this.nWet[c] > 0 ? 1 / this.nWet[c] : 0;
    let tot = 0;
    for (let q = 0; q < Q; q++) tot += this.d[i * Q + q] + this.g[c * Q + q] * share;
    if (tot < 1e-6) { out[0] = this.paper[0]; out[1] = this.paper[1]; out[2] = this.paper[2]; return out; }
    for (let ch = 0; ch < 3; ch++) {
      let K = 0, S = 0;
      for (let q = 0; q < Q; q++) { const a = this.d[i * Q + q] + this.g[c * Q + q] * share; if (a) { K += a * pig[q].K[ch]; S += a * pig[q].S[ch]; } }
      out[ch] = kmLayer(K / tot, S / tot, tot, this.paper[ch]);
    }
    return out;
  }
  renderLin(out) {
    const c3 = [0, 0, 0];
    for (let i = 0; i < this.w * this.h; i++) { this.colourAt(i, c3); out[i * 3] = c3[0]; out[i * 3 + 1] = c3[1]; out[i * 3 + 2] = c3[2]; }
    return out;
  }
  // the paper and its paint, under a soft light across the grain; still-wet paint darker
  renderRect(out, x0, y0, x1, y1, relief) {
    const w = this.w, h = this.h, c3 = [0, 0, 0], gr = this.grain, sp = Math.max(1, Math.round(this.res));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      this.colourAt(i, c3);
      const dx = gr[y * w + Math.min(w - 1, x + sp)] - gr[y * w + Math.max(0, x - sp)], dy = gr[Math.min(h - 1, y + sp) * w + x] - gr[Math.max(0, y - sp) * w + x];
      const shade = 1 + Math.max(-0.12, Math.min(0.12, (-dx * 0.62 - dy * 0.78) * 0.8 * relief));
      const c = Math.floor(y / this.C) * this.cw + Math.floor(x / this.C);
      const wetK = this.wet[i] && this.W[c] > 0.004 ? 1 - Math.min(0.1, this.W[c] * 0.1) : 1;
      const o = i * 4;
      out[o] = linToSrgb(c3[0] * shade * wetK);
      out[o + 1] = linToSrgb(c3[1] * shade * wetK);
      out[o + 2] = linToSrgb(c3[2] * shade * wetK);
      out[o + 3] = 255;
    }
  }
  release() { this.g = null; this.W = null; this.damp = null; this.wet = null; }
}

// A watercolour brush: a round (or a flat wash brush) of half-width `r`, charged with water
// and pigment. `conc` is pigment per unit of water (per WC pigment). A full charge lasts about
// `reach` brush-widths of stroke at the nominal flow.
const WC_FLOW = 0.35, WC_STEP = 0.7;
class WaterBrush {
  constructor(r, kind, rng, reach = 8) {
    this.r = r; this.kind = kind; this.rng = rng;
    this.cap = WC_FLOW * ((2 * r) / WC_STEP) * ((reach * 2 * r) / WC_STEP) * 0.6 * 0.6;
    this.water = 0;
    this.conc = new Float32Array(WC_PIGMENTS.length);
  }
  // charge it (fill 0…1 of what it holds) with pigment at `conc` per unit water
  charge(conc, fill) {
    this.conc.set(conc);
    this.water = this.cap * fill;
  }
}

// Lay a watercolour stroke along `path`: water and pigment flow off the brush onto the paper
// in proportion to how charged it still is; a brush low on water touches only the hills of
// the grain (dry brush on rough paper); water laid on damp paper lifts settling pigment.
// o.mask(i) → false where the paper is reserved (the painter paints round its whites).
function layWater(cv, brush, path, o) {
  const W = cv.W, g = cv.g, d = cv.d, damp = cv.damp, grain = cv.grain, Q = cv.Q, pig = cv.pig, w = cv.w, h = cv.h, C = cv.C, cwn = cv.cw, wet = cv.wet, nWet = cv.nWet;
  const flat = brush.kind === 'flat', r = brush.r;
  let L = 0;
  for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  if (L < 1) return null;
  const flow = o.flow ?? WC_FLOW; // water laid per pass at full charge (depth over a pixel)
  let s = 0, bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  const step = WC_STEP;
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [cx, cy] = path[k];
    const sl = Math.hypot(cx - ax, cy - ay);
    if (sl < 1e-6) continue;
    const tx = (cx - ax) / sl, ty = (cy - ay) / sl, nx = -ty, ny = tx;
    for (let t = 0; t < sl; t += step, s += step) {
      const env = Math.max(0, Math.min(1, s / (0.5 * r + 1), (L - s) / ((flat ? 0.5 : 1.4) * r + 1)));
      const hw = flat ? r : r * (0.25 + 0.75 * env);
      const px = ax + tx * t, py = ay + ty * t;
      const charge = Math.min(1, brush.water / brush.cap);
      for (let u = -hw; u <= hw; u += step) {
        const qx = Math.round(px + nx * u), qy = Math.round(py + ny * u);
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const i = qy * w + qx;
        if (o.mask && !o.mask(i)) continue;
        const e = 1 - Math.pow(Math.abs(u / hw), flat ? 6 : 2);
        // low on water, the brush skips the hollows of the grain
        const reach = charge * 3;
        if (grain[i] < 1 - reach) continue;
        const wl = Math.min(brush.water, flow * e * (0.4 + 0.6 * charge) * step);
        if (wl <= 0) continue;
        const c = Math.floor(qy / C) * cwn + Math.floor(qx / C);
        // water on damp paper whose pigment has begun to settle lifts a little of it again
        if (damp[c] > 0.3 && W[c] < 0.05) {
          const lift = Math.min(0.15, 0.15 * wl * damp[c]);
          for (let q = 0; q < Q; q++) { const m = d[i * Q + q] * lift * (1 - pig[q].stain); d[i * Q + q] -= m; g[c * Q + q] += m; }
        }
        // the water (as depth over the cell) and its pigment go into the cell; the pixel is wet
        W[c] += wl / cv.cellPix[c];
        for (let q = 0; q < Q; q++) g[c * Q + q] += brush.conc[q] * wl; // pigment: total amount in the cell
        if (!wet[i]) { wet[i] = 1; nWet[c]++; }
        damp[c] = Math.min(1, damp[c] + 0.1 / cv.cellPix[c]);
        brush.water -= wl * 0.6; // part of what wets the paper is drawn on from the paper itself
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      }
    }
  }
  if (bx1 < 0) return null;
  cv.growCells(Math.floor(bx0 / C), Math.floor(by0 / C), Math.floor(bx1 / C) + 1, Math.floor(by1 / C) + 1);
  return [bx0, by0, bx1 + 1, by1 + 1];
}

// A wash: the shape `px` (pixel indices) flooded with water `depth` deep, carrying the mix `f`
// (fractions per WC pigment) at `amount[k]` of pigment for pixel px[k] — a wash graded as the
// painter goes, the pigment more where the shape must go darker. The water then does what water
// does: it levels, carries pigment out to the drying edge, granulates, blooms where it meets
// water still standing.
function layWash(cv, px, f, amount, depth) {
  const W = cv.W, g = cv.g, Q = cv.Q, w = cv.w, C = cv.C, cwn = cv.cw, wet = cv.wet, nWet = cv.nWet, damp = cv.damp;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let k = 0; k < px.length; k++) {
    const i = px[k], x = i % w, y = (i - x) / w, c = Math.floor(y / C) * cwn + Math.floor(x / C);
    W[c] += depth / cv.cellPix[c];
    for (let q = 0; q < Q; q++) if (f[q]) g[c * Q + q] += f[q] * amount[k];
    if (!wet[i]) { wet[i] = 1; nWet[c]++; }
    damp[c] = Math.min(1, damp[c] + 0.5 / cv.cellPix[c]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  cv.growCells(Math.floor(x0 / C), Math.floor(y0 / C), Math.floor(x1 / C) + 1, Math.floor(y1 / C) + 1);
  return [x0, y0, x1 + 1, y1 + 1];
}

// The glaze to lay over a colour `under` (linear) so that it reads as `want` (OKLab): the mix
// (one or two pigments) and how much pigment, found by bisection on the lightness for each mix
// and the mix nearest in colour kept. The painter's knowledge of how much a wash darkens.
function makeGlazer(PG, which) {
  const pig = WC_PIGMENTS.map((d) => ({ K: PG[d.oil].K, S: PG[d.oil].S.map((s) => s * WC_S) }));
  const Q = pig.length, mixes = [];
  const use = which === 'mono' ? [2, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const add = (parts) => {
    const f = new Float32Array(Q);
    let t = 0;
    for (const [q, n] of parts) { f[q] += n; t += n; }
    for (let q = 0; q < Q; q++) f[q] /= t;
    const K = [0, 1, 2].map((c) => { let s = 0; for (let q = 0; q < Q; q++) s += f[q] * pig[q].K[c]; return s; });
    const S = [0, 1, 2].map((c) => { let s = 0; for (let q = 0; q < Q; q++) s += f[q] * pig[q].S[c]; return s; });
    mixes.push({ f, K, S });
  };
  for (let a = 0; a < use.length; a++) {
    add([[use[a], 1]]);
    for (let b = a + 1; b < use.length; b++) for (const [i, j] of [[1, 3], [1, 1], [3, 1], [1, 7], [7, 1]]) add([[use[a], i], [use[b], j]]);
    for (let b = a + 1; b < use.length; b++) for (let c = b + 1; c < use.length; c++) add([[use[a], 1], [use[b], 1], [use[c], 1]]);
  }
  const t3 = [0, 0, 0], L = [0, 0, 0], L2 = [0, 0, 0], paper = PAPER_SRGB.map(srgbToLin);
  const over = (M, amt, under) => { for (let c = 0; c < 3; c++) t3[c] = kmLayer(M.K[c], M.S[c], amt, under[c]); return oklab(t3[0], t3[1], t3[2], L); };
  return {
    mixes,
    // the amount of mix M that brings `under` to lightness L
    amountFor(M, L, under) {
      let lo = 0, hi = 3;
      for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (over(M, m, under)[0] > L) lo = m; else hi = m; }
      return (lo + hi) / 2;
    },
    best(want, under) {
      let best = null, bd = Infinity, bamt = 0;
      for (const M of mixes) {
        let lo = 0, hi = 3;
        for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; if (over(M, m, under)[0] > want[0]) lo = m; else hi = m; }
        const amt = (lo + hi) / 2, Lr = over(M, amt, under);
        let dd = (Lr[0] - want[0]) ** 2 + (Lr[1] - want[1]) ** 2 + (Lr[2] - want[2]) ** 2;
        // …and by the colour the mix itself makes on clean paper: chosen only for where it
        // lands, it cancelled a warm under-colour with teal and a cool one with orange
        for (let c = 0; c < 3; c++) t3[c] = kmLayer(M.K[c], M.S[c], amt, paper[c]);
        oklab(t3[0], t3[1], t3[2], L2);
        // (weighted 0.35, not 1: fully anchored, layer on layer of a dark went bluer and bluer,
        // where a painter neutralises it with an earth)
        dd += 0.35 * ((L2[1] - want[1]) ** 2 + (L2[2] - want[2]) ** 2);
        if (dd < bd) { bd = dd; best = M; bamt = amt; }
      }
      return { mix: best, amount: bamt, err: Math.sqrt(bd) };
    },
  };
}

if (typeof module !== 'undefined') module.exports = { WaterCanvas, WaterBrush, layWater, layWash, makeGlazer, WC_PIGMENTS };
