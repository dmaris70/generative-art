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
//   - paint sets on its own schedule (thin and lean fast, thick and fat slowly, on a painting
//     clock): fresh it is picked up and blended, setting less so, dry it is glazed over or
//     covered; lean laid over fat keeps a strain that cracks it as it ages.
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
// Time is a painting clock in minutes: each stroke, each dip into the palette, each new mix
// takes its time, and a session's end lets the paint stand overnight. Each pixel's wet layer
// dries on its own schedule: thin and lean (little oil) dries fast, thick and fat slowly.
// While fresh it is picked up and blended by the next brush; as it sets it is picked up less;
// once dry it joins the dried layers, and what is painted over it glazes or covers.
const DRY_BASE = 360; // minutes for a layer of 1 at fat 0.4 to reach touch-dry
class PaintCanvas {
  constructor(w, h, PG, rng, o = {}) {
    this.w = w; this.h = h; this.PG = PG; this.P = PG.length;
    const n = w * h;
    this.dry = new Float32Array(n * 3); // reflectance of the dried layers (linear)
    this.dryH = new Float32Array(n); // height of the dried paint
    this.wet = new Float32Array(n * this.P); // the wet layer: volume of each pigment and of medium
    this.vol = new Float32Array(n); // its total thickness
    this.fatAcc = new Float32Array(n); // its oil: Σ volume × the fatness of the paint laid
    this.tPaint = new Float32Array(n); // the clock (minutes) when paint was last laid here
    this.stroke = new Int32Array(n).fill(-1); // the stroke that last touched it
    this.dryFat = new Float32Array(n).fill(0.05); // fatness of the top dried layer (the ground is lean)
    this.dryOil = new Float32Array(n); // oil in all the dried layers (yellows with age)
    this.crack = new Float32Array(n); // lean laid over fat: the strain that cracks it as it ages
    this.tooth = new Float32Array(n); // the weave of the linen, 0 (hollow) … 1 (top of a thread)
    this.time = 0;
    this.strokeId = 0;
    this.dryMul = o.dryMul ?? 1; // drying speed
    this.ageing = null;
    // a linen weave: warp and weft threads ~3 px apart at 1× (the same threads at any
    // resolution), each thread a little irregular
    const per = 3.1 * (o.res ?? 1);
    const hash = (x, y) => { let t = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x / per + 0.25 * Math.sin(y * 0.05 / (o.res ?? 1) + hash(0, Math.floor(y / per * 0.35)) * 6), py = y / per + 0.25 * Math.sin(x * 0.043 / (o.res ?? 1) + hash(Math.floor(x / per * 0.35), 0) * 6);
      const over = ((Math.floor(px) + Math.floor(py)) & 1) === 0;
      const tx = 0.5 - 0.5 * Math.cos(2 * Math.PI * px), ty = 0.5 - 0.5 * Math.cos(2 * Math.PI * py);
      this.tooth[y * w + x] = Math.min(1, Math.max(0, (over ? 0.55 * ty + 0.45 * tx * ty : 0.55 * tx + 0.45 * tx * ty) + 0.08 * (hash(x, y) - 0.5)));
    }
    this.rng = rng;
    this.res = o.res ?? 1;
  }

  // a ground of colour (sRGB) over the whole canvas, dry
  ground(srgb) {
    const r = srgbToLin(srgb[0]), g = srgbToLin(srgb[1]), b = srgbToLin(srgb[2]);
    for (let i = 0; i < this.w * this.h; i++) { this.dry[i * 3] = r; this.dry[i * 3 + 1] = g; this.dry[i * 3 + 2] = b; }
  }

  // minutes for pixel i's wet layer to dry: thickness and oil slow it
  dryTime(i) {
    const v = this.vol[i], fat = v > 1e-5 ? this.fatAcc[i] / v : 0.1;
    return (DRY_BASE * (0.3 + v) * (0.2 + 2 * fat)) / this.dryMul;
  }
  // how workable the wet paint at i still is (1 fresh … 0 set): the bristles pick up less as it sets
  workable(i) {
    if (this.vol[i] < 1e-5) return 0;
    return Math.exp(-(this.time - this.tPaint[i]) / (0.3 * this.dryTime(i)));
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

  // the wet paint at i sets: its colour joins the dried layers, its thickness the relief, its
  // oil the dried oil; a layer leaner than the one under it (lean over fat) dries stiffer than
  // its ground moves, and keeps that strain
  setPixel(i, c3) {
    const v = this.vol[i];
    this.colourAt(i, c3);
    this.dry[i * 3] = c3[0]; this.dry[i * 3 + 1] = c3[1]; this.dry[i * 3 + 2] = c3[2];
    const fat = this.fatAcc[i] / v;
    if (fat < this.dryFat[i] - 0.06) this.crack[i] += (this.dryFat[i] - fat) * Math.min(1, v);
    this.dryFat[i] = fat;
    this.dryOil[i] += this.fatAcc[i];
    this.dryH[i] += v;
    this.vol[i] = 0; this.fatAcc[i] = 0;
    this.wet.fill(0, i * this.P, (i + 1) * this.P);
  }
  // let whatever has had its time dry; returns the rect that changed (or null)
  sweep() {
    const c3 = [0, 0, 0], w = this.w;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let i = 0; i < this.w * this.h; i++) {
      if (this.vol[i] < 1e-5) continue;
      if (this.time - this.tPaint[i] < this.dryTime(i)) continue;
      this.setPixel(i, c3);
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 >= 0 ? [x0, y0, x1 + 1, y1 + 1] : null;
  }
  // let it stand for `minutes`
  wait(minutes) {
    this.time += minutes;
    return this.sweep();
  }

  // Age the painting `years` (0 = fresh): it dries through, the oil yellows (more where there
  // is more of it, and the varnish over everything), and it cracks — an all-over craquelure
  // of islands that comes with age and the stiffening of the paint, and early, wider drying
  // cracks wherever lean was laid over fat.
  age(years) {
    if (years <= 0) { this.ageing = null; return; }
    this.wait(1e7);
    const w = this.w, h = this.h, n = w * h, cell = 9 * this.res, map = new Float32Array(n);
    const hash = (x, y, k) => { let t = (x * 73856093) ^ (y * 19349663) ^ (k * 83492791); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    const natural = Math.min(1, Math.max(0, (years - 30) / 150)), early = Math.min(1, years / 15);
    // smooth value noise, for the irregularity of real craquelure
    const vn = (x, y, k) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // islands: a jittered grid of sites in warped space (so the islands are irregular; one
      // cell size, since a size varying pixel by pixel broke them into hatching), the crack
      // where the two nearest sites are equally near
      const wx = x + 0.6 * cell * (vn(x / (2.5 * cell), y / (2.5 * cell), 3) - 0.5) * 2, wy = y + 0.6 * cell * (vn(x / (2.5 * cell), y / (2.5 * cell), 4) - 0.5) * 2;
      const sc = cell, gx = Math.floor(wx / sc), gy = Math.floor(wy / sc);
      let d1 = 1e9, d2 = 1e9;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const sx = (gx + k + 0.05 + 0.9 * hash(gx + k, gy + j, 1)) * sc, sy = (gy + j + 0.05 + 0.9 * hash(gx + k, gy + j, 2)) * sc;
        const d = Math.hypot(wx - sx, wy - sy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const e = (d2 - d1) / 2, i = y * w + x;
      const thick = Math.min(1, this.dryH[i] / 3);
      // it opens in patches (where the paint is thicker, and as chance has it), not everywhere
      const open = Math.max(0, Math.min(1, (vn(x / (4 * cell), y / (4 * cell), 6) - 0.35) * 2.5));
      const sNat = natural * (0.3 + 0.7 * thick) * open, sEarly = early * Math.min(1, this.crack[i] * 6);
      const wid = (0.3 + 0.35 * vn(x / cell, y / cell, 7) + 1.2 * sEarly) * this.res;
      map[i] = Math.max(0, 1 - e / wid) * Math.min(1, 0.75 * sNat + sEarly);
    }
    this.ageing = { years, map, yellow: 0.3 * (1 - Math.exp(-years / 60)), varnish: 0.14 * (1 - Math.exp(-years / 80)) };
  }

  // Render a rect into RGBA bytes: the colour of the paint, lit by a raking light across its
  // relief (the ridges of the strokes, the weave where the paint is thin) with a little sheen
  // on paint that is still wet; aged if it has been.
  renderRect(out, x0, y0, x1, y1, relief) {
    const w = this.w, h = this.h, c3 = [0, 0, 0], A = this.ageing, R = this.res;
    // the height of the paint, compressed: thick stacks of wet paint read as craters under the
    // light at their own height
    const H = (i) => { const h = this.dryH[i] + this.vol[i]; return h / (1 + 0.4 * h) + 0.06 * this.tooth[i]; };
    const sp = Math.max(2, Math.round(2 * R));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      this.colourAt(i, c3);
      // the slope over 2 px (at 1×) each way: paint laid partly, pixel by pixel, makes bumps
      // one pixel across that glittered under the light at their own scale
      const xl = y * w + Math.max(0, x - sp), xr = y * w + Math.min(w - 1, x + sp), yu = Math.max(0, y - sp) * w + x, yd = Math.min(h - 1, y + sp) * w + x;
      const dx = ((H(xr) - H(xl)) / (2 * sp)) * R, dy = ((H(yd) - H(yu)) / (2 * sp)) * R;
      // light from the upper left; a slope toward it is lit, away from it shaded
      const lam = Math.max(-0.5, Math.min(0.5, (-dx * 0.62 - dy * 0.78) * relief));
      const wet = this.vol[i] > 1e-5 ? 1 : 0.4;
      let shade = 1 + 0.55 * lam;
      const sheen = Math.max(0, lam - 0.18) * 0.15 * wet;
      let r = c3[0], g = c3[1], b = c3[2];
      if (A) {
        // the oil yellows where there is more of it; the varnish over everything
        const yl = A.yellow * Math.min(1, this.dryOil[i] / 1.5 + 0.2), vv = A.varnish;
        r *= (1 - 0.15 * yl) * (1 - 0.1 * vv); g *= (1 - 0.35 * yl) * (1 - 0.3 * vv); b *= (1 - 0.9 * yl) * (1 - 0.75 * vv);
        // a crack: a dark groove of grime, its lip catching the light
        const m = A.map[i];
        if (m > 0) { shade *= 1 - 0.7 * m; r = r * (1 - m) + 0.02 * m; g = g * (1 - m) + 0.016 * m; b = b * (1 - m) + 0.01 * m; }
      }
      const o = i * 4;
      out[o] = linToSrgb(r * shade + sheen);
      out[o + 1] = linToSrgb(g * shade + sheen);
      out[o + 2] = linToSrgb(b * shade + sheen);
      out[o + 3] = 255;
    }
  }

  // linear colour of every pixel (for the painter's eye)
  renderLin(out) {
    const c3 = [0, 0, 0];
    for (let i = 0; i < this.w * this.h; i++) { this.colourAt(i, c3); out[i * 3] = c3[0]; out[i * 3 + 1] = c3[1]; out[i * 3 + 2] = c3[2]; }
    return out;
  }

  // what the painter no longer needs once the sheet is finished (the display keeps the image)
  release() {
    this.wet = null; this.fatAcc = null; this.tPaint = null; this.stroke = null;
  }
}

// ---------------------------------------------------------------------------------
// The brush
// ---------------------------------------------------------------------------------
// A bristle brush `w` px wide, its bristles side by side, each with its own load and its own
// stiffness (some touch harder than others, which streaks the stroke). Three shapes, as a
// painter keeps them, which differ in how the footprint answers pressure:
//   flat     square-ended, nearly the same width whatever the pressure: blocks, planes
//   filbert  flat but oval-ended: it lands narrow and opens as it is pressed (rounded ends)
//   round    pointed: a touch is a thin line, pressed it swells; lifted, it leaves a tail
const BRUSH_KINDS = {
  flat: { w0: 0.88, edge: 6, land: 0.4, lift: 0.3 },
  filbert: { w0: 0.5, edge: 2.4, land: 0.6, lift: 0.7 },
  round: { w0: 0.18, edge: 1.6, land: 0.35, lift: 1.3 },
};
class Brush {
  constructor(w, P, rng, o = {}) {
    this.w = w; this.P = P;
    this.kind = BRUSH_KINDS[o.kind] ? o.kind : 'flat';
    this.nb = Math.max(5, Math.min(48, Math.round(w / 1.3)));
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
  // the paint the brush holds (volumes per pigment)
  meanMix() {
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
    const tmp = new Float32Array(P);
    for (let b = 0; b < this.nb; b++) {
      const room = Math.max(0, this.cap - this.sum[b]);
      if (room <= 0) continue;
      let s = 0;
      for (let p = 0; p < P; p++) { tmp[p] = f[p] > 0 ? (f[p] / tot) * (1 + streak * (this.rng() - 0.5) * 2) : 0; s += tmp[p]; }
      for (let p = 0; p < P; p++) { const q = (tmp[p] / s) * room; this.load[b * P + p] += q; }
      this.sum[b] += room;
    }
  }
}

// ---------------------------------------------------------------------------------
// The stroke
// ---------------------------------------------------------------------------------
// Lay `brush` along `path` (points in canvas px). o.pressure 0…1; o.pick: how much wet paint a
// bristle takes up; o.dry: how readily a spent bristle skips over the hollows of the weave;
// o.fat: how much oil is in the paint laid; o.minutes: how long the stroke takes.
const STEP = 0.7;
function layStroke(cv, brush, path, o) {
  const w = brush.w, half = w / 2, nb = brush.nb, P = cv.P, W = cv.w, Hh = cv.h, K = BRUSH_KINDS[brush.kind];
  const load = brush.load, sum = brush.sum, cap = brush.cap, wet = cv.wet, vol = cv.vol, tooth = cv.tooth, fatAcc = cv.fatAcc, tPaint = cv.tPaint, sid = cv.stroke;
  const id = cv.strokeId, pick = o.pick, rate = brush.rate, dryK = o.dry, fat = o.fat ?? 0.3;
  // total length, for the pressure: the brush lands, presses, lifts
  let L = 0;
  for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  if (L < 1) return null;
  // the stroke takes its time, so its own end is laid a little after its start
  const t0 = cv.time, dt = o.minutes ?? 0;
  // smooth 1-D noise per bristle along the stroke (runs of ~5 px at 1×)
  const ph = brush.phase, run = 5 * cv.res;
  const hs = (b, k) => { let t = Math.imul((b + 1) * 2654435761 + k * 40503 + ph, 2246822519); t ^= t >>> 13; return ((Math.imul(t, 3266489917) ^ (t >>> 16)) >>> 0) / 4294967296; };
  const skip = (b, s) => { const u = s / run, k = Math.floor(u), f = u - k, e = f * f * (3 - 2 * f); return hs(b, k) * (1 - e) + hs(b, k + 1) * e; };
  const landL = K.land * w + 1, liftL = K.lift * w + 1, ek = K.edge;
  let s = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [cx, cy] = path[k];
    const sl = Math.hypot(cx - ax, cy - ay);
    if (sl < 1e-6) continue;
    const tx = (cx - ax) / sl, ty = (cy - ay) / sl, nx = -ty, ny = tx;
    for (let t = 0; t < sl; t += STEP, s += STEP) {
      const px = ax + tx * t, py = ay + ty * t;
      const env = Math.min(1, s / landL, (L - s) / liftL);
      const press = o.pressure * Math.max(0, env) * (0.82 + 0.18 * Math.max(0, env));
      // the footprint: as wide as the shape of the brush lets the pressure open it, the
      // bristles wavering a little
      const hw = half * (K.w0 + (1 - K.w0) * Math.min(1, press / Math.max(0.05, o.pressure))) * (1 + 0.1 * (skip(nb + 7, s) - 0.5));
      const now = t0 + dt * (s / L);
      for (let u = -hw; u <= hw; u += STEP) {
        const qx = Math.round(px + nx * u), qy = Math.round(py + ny * u);
        if (qx < 0 || qy < 0 || qx >= W || qy >= Hh) continue;
        const i = qy * W + qx;
        let b = Math.floor((u / w + 0.5) * nb);
        b = b < 0 ? 0 : b >= nb ? nb - 1 : b;
        const r = Math.abs(u / hw), edge = 1 - Math.pow(r, ek);
        const c = press * edge * brush.stiff[b];
        if (c <= 0.01) continue;
        const bo = b * P, io = i * P;
        // 1) the bristle drags through wet paint and takes some up — the fresher, the more
        // (not paint this same stroke has just laid: that only travels with it as its load)
        if (vol[i] > 1e-5 && sid[i] !== id) {
          const wk = cv.workable(i);
          if (wk > 0.02) {
            const f = Math.min(0.6, pick * c * wk);
            let taken = 0;
            for (let p = 0; p < P; p++) { const m = wet[io + p] * f; if (m) { wet[io + p] -= m; load[bo + p] += m; taken += m; } }
            vol[i] -= taken; fatAcc[i] *= 1 - f; sum[b] += taken;
          }
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
            const kk = dep / sum[b];
            for (let p = 0; p < P; p++) { const m = load[bo + p] * kk; if (m) { load[bo + p] -= m; wet[io + p] += m; } }
            sum[b] -= dep; vol[i] += dep; fatAcc[i] += dep * fat;
            tPaint[i] = now;
          }
        }
        sid[i] = id;
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      }
    }
  }
  cv.strokeId++;
  cv.time = t0 + dt;
  return bx0 <= bx1 ? [bx0, by0, bx1 + 1, by1 + 1] : null;
}

if (typeof module !== 'undefined') module.exports = { PIGMENT_DEFS, makePigments, kmLayer, mixRInf, oklab, oklabToLin, srgbToLin, linToSrgb, PaintCanvas, Brush, layStroke, rInf, ksOf, BRUSH_KINDS };
