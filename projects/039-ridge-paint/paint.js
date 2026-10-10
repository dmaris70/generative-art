// 039 — the paint: pigments, the canvas, the brush and the stroke.
//
// Everything a stroke does happens while it is laid, one bristle and one canvas pixel at a
// time, against the state the earlier strokes left:
//   - each pixel holds a wet layer (volumes of each pigment and of medium), the dried layers
//     under it (their colour), the height of the paint, and when it was last touched;
//   - each bristle of the brush holds its own load of paint;
//   - where the bristle meets wet paint it picks some up (and carries it on: blending,
//     smearing, a dirty brush), then deposits from what it now holds, in proportion to how
//     loaded it still is (the stroke runs out); a nearly empty bristle touches only the tops
//     of the canvas weave (dry brush);
//   - paint left long enough stops being picked up (it is setting); a session's end dries it.
// Colour is never blended on screen. A pixel's colour is computed from its pigments by
// Kubelka–Munk theory (two-constant, three channels): absorption K and scattering S per unit
// thickness, a layer of thickness d over the dried colour beneath. So blue and yellow make a
// green, white makes a tint, a thin transparent layer is a glaze over what is under it, a
// thick opaque one covers it.

// ---------------------------------------------------------------------------------
// Pigments
// ---------------------------------------------------------------------------------
// Each pigment is measured as a painter would: its masstone (thick, alone) and its tint (one
// part to four of white). With white's constants fixed, those two give K and S per channel
// (the standard two-constant method). Index 0 is the medium (oil): no absorption, no
// scattering, it only thins.
const PIGMENT_DEFS = [
  { name: 'medium' },
  { name: 'titanium white', mass: [246, 245, 240] },
  { name: 'ivory black', mass: [28, 27, 28], tint: [120, 119, 121] },
  { name: 'ultramarine', mass: [30, 32, 95], tint: [110, 125, 200] },
  { name: 'cerulean', mass: [45, 115, 165], tint: [140, 185, 215] },
  { name: 'burnt umber', mass: [62, 44, 34], tint: [150, 128, 112] },
  { name: 'burnt sienna', mass: [120, 52, 28], tint: [205, 145, 115] },
  { name: 'yellow ochre', mass: [190, 140, 60], tint: [228, 205, 160] },
  { name: 'cadmium red light', mass: [210, 55, 35], tint: [240, 150, 135] },
  { name: 'naples yellow', mass: [235, 205, 140], tint: [245, 230, 200] },
];
const WHITE_S = 6; // white's scattering per unit thickness: a layer of 1 nearly hides what is under it
const TINT_C = 0.2; // the tint is one part pigment in five

const srgbToLin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linToSrgb = (x) => {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
};
// K/S of an infinitely thick layer of reflectance R, and back
const ksOf = (R) => ((1 - R) * (1 - R)) / (2 * R);
const rInf = (ks) => 1 + ks - Math.sqrt(ks * ks + 2 * ks);

function makePigments(defs) {
  const lin = (c) => c.map((v) => Math.min(0.995, Math.max(0.003, srgbToLin(v))));
  const wR = lin(defs[1].mass);
  const Sw = [WHITE_S, WHITE_S, WHITE_S], Kw = wR.map((r, c) => Sw[c] * ksOf(r));
  return defs.map((d, i) => {
    if (i === 0) return { name: d.name, K: [0, 0, 0], S: [0, 0, 0] };
    if (i === 1) return { name: d.name, K: Kw, S: Sw };
    const m = lin(d.mass), t = lin(d.tint);
    // (cK + (1−c)Kw) / (cS + (1−c)Sw) = kt  and  K = km·S, solved per channel; then one S for
    // the pigment (the mean, weighted to the channels that absorb, where the solve is well
    // conditioned) — with S per channel a yellow over a dark ground turned green
    let sw = 0, ws = 0;
    for (let c = 0; c < 3; c++) {
      const km = ksOf(m[c]), kt = ksOf(t[c]);
      const s = ((1 - TINT_C) * (kt * Sw[c] - Kw[c])) / (TINT_C * Math.max(1e-4, km - kt));
      const wt = Math.max(1e-3, km - kt);
      sw += wt * Math.min(30, Math.max(0.05, s)); ws += wt;
    }
    const s = sw / ws;
    return { name: d.name, K: m.map((r) => ksOf(r) * s), S: [s, s, s] };
  });
}

// One channel of a layer of paint (K, S per unit thickness) of thickness d over a ground of
// reflectance Rg (Kubelka 1948).
function kmLayer(K, S, d, Rg) {
  if (d <= 1e-6) return Rg;
  const sd = S * d;
  if (sd < 1e-6) return Rg * Math.exp(-2 * K * d); // medium-rich, nothing to scatter: a pure glaze
  const a = 1 + K / S, b = Math.sqrt(a * a - 1), x = b * sd;
  let bc; // b·coth(x)
  if (x < 1e-3) bc = 1 / sd + (b * b * sd) / 3;
  else if (x > 18) bc = b;
  else {
    const e = Math.exp(-2 * x);
    bc = (b * (1 + e)) / (1 - e);
  }
  return (1 - Rg * (a - bc)) / (a - Rg + bc);
}

// The reflectance of a mixture (fractions f, any scale) as a thick layer: what the mix looks
// like on the palette.
function mixRInf(PG, f, out) {
  for (let c = 0; c < 3; c++) {
    let K = 0, S = 0;
    for (let p = 1; p < PG.length; p++) { K += f[p] * PG[p].K[c]; S += f[p] * PG[p].S[c]; }
    out[c] = S > 1e-9 ? rInf(K / S) : 0;
  }
  return out;
}

// OKLab (Björn Ottosson): a perceptual space for judging how far a colour is from another
function oklab(r, g, b, out) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return out;
}

// and back to linear RGB
function oklabToLin(L, A, B, out) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return out;
}

// ---------------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------------
class PaintCanvas {
  constructor(w, h, PG, rng) {
    this.w = w; this.h = h; this.PG = PG; this.P = PG.length;
    const n = w * h;
    this.dry = new Float32Array(n * 3); // reflectance of the dried layers (linear)
    this.dryH = new Float32Array(n); // height of the dried paint
    this.wet = new Float32Array(n * this.P); // the wet layer: volume of each pigment and of medium
    this.vol = new Float32Array(n); // its total thickness
    this.touch = new Float32Array(n).fill(-1e9); // the clock when it was last painted
    this.tooth = new Float32Array(n); // the weave of the linen, 0 (hollow) … 1 (top of a thread)
    this.clock = 0;
    // a linen weave: warp and weft threads ~3 px apart, each thread a little irregular
    const hash = (x, y) => { let t = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x / 3.1 + 0.25 * Math.sin(y * 0.05 + hash(0, y >> 3) * 6), py = y / 3.1 + 0.25 * Math.sin(x * 0.043 + hash(x >> 3, 0) * 6);
      const over = ((Math.floor(px) + Math.floor(py)) & 1) === 0;
      const tx = 0.5 - 0.5 * Math.cos(2 * Math.PI * px), ty = 0.5 - 0.5 * Math.cos(2 * Math.PI * py);
      this.tooth[y * w + x] = Math.min(1, Math.max(0, (over ? 0.55 * ty + 0.45 * tx * ty : 0.55 * tx + 0.45 * tx * ty) + 0.08 * (hash(x, y) - 0.5)));
    }
    this.rng = rng;
    this._K = new Float32Array(3);
    this._S = new Float32Array(3);
  }

  // a ground of colour (sRGB) over the whole canvas, dry
  ground(srgb) {
    const r = srgbToLin(srgb[0]), g = srgbToLin(srgb[1]), b = srgbToLin(srgb[2]);
    for (let i = 0; i < this.w * this.h; i++) { this.dry[i * 3] = r; this.dry[i * 3 + 1] = g; this.dry[i * 3 + 2] = b; }
  }

  // the colour (linear reflectance) of pixel i now
  colourAt(i, out) {
    const v = this.vol[i], d3 = i * 3;
    if (v < 1e-5) { out[0] = this.dry[d3]; out[1] = this.dry[d3 + 1]; out[2] = this.dry[d3 + 2]; return out; }
    const P = this.P, PG = this.PG, o = i * P;
    for (let c = 0; c < 3; c++) {
      let K = 0, S = 0;
      for (let p = 1; p < P; p++) { const q = this.wet[o + p]; if (q) { K += q * PG[p].K[c]; S += q * PG[p].S[c]; } }
      // per unit thickness: the medium in the layer dilutes it
      out[c] = kmLayer(K / v, S / v, v, this.dry[d3 + c]);
    }
    return out;
  }

  // the wet layer sets: its colour joins the dried layers, its thickness the dried relief
  dryAll() {
    const c3 = [0, 0, 0];
    for (let i = 0; i < this.w * this.h; i++) {
      if (this.vol[i] < 1e-5) continue;
      this.colourAt(i, c3);
      this.dry[i * 3] = c3[0]; this.dry[i * 3 + 1] = c3[1]; this.dry[i * 3 + 2] = c3[2];
      this.dryH[i] += this.vol[i];
      this.vol[i] = 0;
      this.wet.fill(0, i * this.P, (i + 1) * this.P);
    }
    this.touch.fill(-1e9);
  }

  // Render a rect into RGBA bytes: the colour of the paint, lit by a raking light across its
  // relief (the ridges of the strokes, the weave where the paint is thin) with a little sheen.
  renderRect(out, x0, y0, x1, y1, relief) {
    const w = this.w, h = this.h, c3 = [0, 0, 0];
    // the height of the paint, compressed: thick stacks of wet paint read as craters under the
    // light at their own height
    const H = (i) => { const h = this.dryH[i] + this.vol[i]; return h / (1 + 0.4 * h) + 0.06 * this.tooth[i]; };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      this.colourAt(i, c3);
      // the slope over 2 px each way: paint laid partly, pixel by pixel, makes bumps one pixel
      // across that glittered under the light at their own scale
      const xl = x > 1 ? i - 2 : y * w, xr = x < w - 2 ? i + 2 : y * w + w - 1, yu = y > 1 ? i - 2 * w : x, yd = y < h - 2 ? i + 2 * w : (h - 1) * w + x;
      const dx = (H(xr) - H(xl)) * 0.25, dy = (H(yd) - H(yu)) * 0.25;
      // light from the upper left; a slope toward it is lit, away from it shaded
      const lam = Math.max(-0.5, Math.min(0.5, (-dx * 0.62 - dy * 0.78) * relief));
      const shade = 1 + 0.55 * lam, sheen = Math.max(0, lam - 0.18) * 0.15;
      const o = i * 4;
      out[o] = linToSrgb(c3[0] * shade + sheen);
      out[o + 1] = linToSrgb(c3[1] * shade + sheen);
      out[o + 2] = linToSrgb(c3[2] * shade + sheen);
      out[o + 3] = 255;
    }
  }

  // linear colour of every pixel (for the painter's eye)
  renderLin(out) {
    const c3 = [0, 0, 0];
    for (let i = 0; i < this.w * this.h; i++) { this.colourAt(i, c3); out[i * 3] = c3[0]; out[i * 3 + 1] = c3[1]; out[i * 3 + 2] = c3[2]; }
    return out;
  }
}

// ---------------------------------------------------------------------------------
// The brush
// ---------------------------------------------------------------------------------
// A flat bristle brush `w` px wide: its bristles side by side, each with its own load and its
// own stiffness (some touch harder than others, which streaks the stroke).
class Brush {
  constructor(w, P, rng, o = {}) {
    this.w = w; this.P = P;
    this.nb = Math.max(5, Math.min(36, Math.round(w / 1.3)));
    this.load = new Float32Array(this.nb * P);
    this.sum = new Float32Array(this.nb);
    this.stiff = new Float32Array(this.nb);
    for (let b = 0; b < this.nb; b++) this.stiff[b] = 0.75 + 0.5 * rng();
    // how much a bristle holds: enough that a full brush lays `rate` of paint for about
    // `reach` brush-widths before it is spent
    this.rate = o.rate ?? 0.8;
    this.reach = o.reach ?? 6;
    this.cap = (this.rate * (w / this.nb) * this.reach * w) / 0.49;
    this.rng = rng;
    this.phase = Math.floor(rng() * 1e6);
  }
  // the colour of the paint the brush holds, as it would look on the palette
  meanMix(out) {
    const f = new Float32Array(this.P);
    for (let b = 0; b < this.nb; b++) for (let p = 0; p < this.P; p++) f[p] += this.load[b * this.P + p];
    return f;
  }
  fullness() {
    let s = 0;
    for (let b = 0; b < this.nb; b++) s += this.sum[b];
    return s / (this.nb * this.cap);
  }
  // wipe it on the rag, leaving `keep` of what it held
  wipe(keep) {
    for (let i = 0; i < this.load.length; i++) this.load[i] *= keep;
    for (let b = 0; b < this.nb; b++) this.sum[b] *= keep;
  }
  // load it from a mix on the palette (fractions f): each bristle takes it up unevenly, so a
  // loaded brush carries streaks of its components (the mix is never perfectly even)
  reload(f, streak) {
    const P = this.P;
    let tot = 0;
    for (let p = 0; p < P; p++) tot += f[p];
    for (let b = 0; b < this.nb; b++) {
      const room = Math.max(0, this.cap - this.sum[b]);
      if (room <= 0) continue;
      let s = 0;
      const tmp = new Float32Array(P);
      for (let p = 0; p < P; p++) { tmp[p] = f[p] > 0 ? (f[p] / tot) * (1 + streak * (this.rng() - 0.5) * 2) : 0; s += tmp[p]; }
      for (let p = 0; p < P; p++) { const q = (tmp[p] / s) * room; this.load[b * P + p] += q; }
      this.sum[b] += room;
    }
  }
}

// ---------------------------------------------------------------------------------
// The stroke
// ---------------------------------------------------------------------------------
// Lay `brush` along `path` (points in canvas px). o.pressure 0…1; o.open: how many strokes
// paint stays workable; o.pick: how much wet paint a bristle takes up; o.dry: how readily a
// spent bristle skips over the hollows of the weave.
const STEP = 0.7;
function layStroke(cv, brush, path, o) {
  const w = brush.w, half = w / 2, nb = brush.nb, P = cv.P, W = cv.w, Hh = cv.h;
  const load = brush.load, sum = brush.sum, cap = brush.cap, wet = cv.wet, vol = cv.vol, touch = cv.touch, tooth = cv.tooth;
  const clock = cv.clock, open = o.open, pick = o.pick, rate = brush.rate, dryK = o.dry;
  // total length, for the pressure: the brush lands, presses, lifts
  let L = 0;
  for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  if (L < 1) return null;
  // smooth 1-D noise per bristle along the stroke (runs of ~5 px)
  const ph = brush.phase;
  const hs = (b, k) => { let t = Math.imul((b + 1) * 2654435761 + k * 40503 + ph, 2246822519); t ^= t >>> 13; return ((Math.imul(t, 3266489917) ^ (t >>> 16)) >>> 0) / 4294967296; };
  const skip = (b, s) => { const u = s / 5, k = Math.floor(u), f = u - k, e = f * f * (3 - 2 * f); return hs(b, k) * (1 - e) + hs(b, k + 1) * e; };
  let s = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [cx, cy] = path[k];
    const sl = Math.hypot(cx - ax, cy - ay);
    if (sl < 1e-6) continue;
    const tx = (cx - ax) / sl, ty = (cy - ay) / sl, nx = -ty, ny = tx;
    for (let t = 0; t < sl; t += STEP, s += STEP) {
      const px = ax + tx * t, py = ay + ty * t;
      const land = Math.min(1, s / (0.5 * w + 1)), lift = Math.min(1, (L - s) / (0.35 * w + 1));
      const press = o.pressure * Math.min(land, lift) * (0.82 + 0.18 * Math.min(land, lift));
      for (let u = -half; u <= half; u += STEP) {
        const qx = Math.round(px + nx * u), qy = Math.round(py + ny * u);
        if (qx < 0 || qy < 0 || qx >= W || qy >= Hh) continue;
        const i = qy * W + qx;
        let b = Math.floor((u / w + 0.5) * nb);
        b = b < 0 ? 0 : b >= nb ? nb - 1 : b;
        const r = (2 * u) / w, edge = 1 - r * r * r * r;
        const c = press * edge * brush.stiff[b];
        if (c <= 0.01) continue;
        const bo = b * P, io = i * P;
        // 1) the bristle drags through wet paint and takes some up — the less set it is, the more
        // (not paint this same stroke has just laid: that only travels with it as its load)
        const age = clock - touch[i], wk = vol[i] > 1e-5 && touch[i] !== clock ? Math.exp(-age / open) : 0;
        if (wk > 0.02) {
          const f = Math.min(0.6, pick * c * wk);
          let taken = 0;
          for (let p = 0; p < P; p++) { const m = wet[io + p] * f; if (m) { wet[io + p] -= m; load[bo + p] += m; taken += m; } }
          vol[i] -= taken; sum[b] += taken;
        }
        // 2) it lays paint from what it now holds, in proportion to how loaded it is; a spent
        // bristle touches only the tops of the weave
        const lf = sum[b] / cap;
        if (lf > 1e-4) {
          // how deep into the weave the bristle reaches: a loaded, pressed bristle fills the
          // hollows (reach ≥ 1), a spent or light one only touches the tops of the threads
          const reach = c * Math.min(1.5, lf) * (5.5 - 2.5 * dryK);
          // a bristle that is running dry skips in runs along the stroke (each bristle its own),
          // so a spent stroke breaks into streaks the way it is dragged, not into the weave's dots
          const sk = skip(b, s);
          const gate = Math.min(1, Math.max(0, (0.55 * tooth[i] + 0.45 * sk - (1 - reach)) * 6));
          if (gate > 0) {
            const dep = Math.min(sum[b] * 0.5, rate * c * gate * Math.min(1.5, lf));
            const k = dep / sum[b];
            for (let p = 0; p < P; p++) { const m = load[bo + p] * k; if (m) { load[bo + p] -= m; wet[io + p] += m; } }
            sum[b] -= dep; vol[i] += dep;
          }
        }
        touch[i] = clock;
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      }
    }
  }
  cv.clock++;
  return bx0 <= bx1 ? [bx0, by0, bx1 + 1, by1 + 1] : null;
}

if (typeof module !== 'undefined') module.exports = { PIGMENT_DEFS, makePigments, kmLayer, mixRInf, oklab, oklabToLin, srgbToLin, linToSrgb, PaintCanvas, Brush, layStroke, rInf, ksOf };
