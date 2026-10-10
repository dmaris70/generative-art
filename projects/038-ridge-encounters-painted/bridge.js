// 038 — the bridge from 028 (Ridge, encounters) to the painters.
//
// 028's engine (parts.js + compose.js, frozen at v1.4) is loaded unchanged from its own folder
// and decides everything about the place, the body, the weather and the two gazes; the same
// seed gives the same scene as 028. The bridge reads, for each of the two sheets, what that
// engine knows per pixel — the developed tone (028's finished values), depth, the light on the
// land, rock or snow, how much air and cloud lie in front — and turns it into colour for a
// painter. Colour never changes a value: every pixel's colour is matched to 028's tone, so the
// tonal composition measured against the source stays exactly as 028 left it.

const RIDGE = '../028-ridge-encounters/';
// 028's own weather budgets (compose.js, not exported) — used to re-solve the cloud density so
// the air in front of each pixel is the same as in 028's develop()
const RIDGE_BUDGET = { exposure: 0.78, looming: 0.84, whiteout: 0.9, passage: 0.55, clearing: 0.3 };

// the surveyed ranges (dem/index.json + gzipped delta-coded tiles), loaded once — as 028's worker does
let DEM_READY = null;
function loadDEMs() {
  if (DEM_READY) return DEM_READY;
  const undelta = (a, n) => {
    for (let y = 0; y < n; y++) for (let x = 1; x < n; x++) a[y * n + x] += a[y * n + x - 1];
    return a;
  };
  DEM_READY = fetch(RIDGE + 'dem/index.json')
    .then((r) => r.json())
    .then((ix) => {
      return Promise.all(ix.places.map((m) => fetch(RIDGE + 'dem/' + m.slug + '.dem')
        .then((r) => new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
        .then((b) => Compose.setDEM(m.slug, m, undelta(new Uint16Array(b), m.size)))));
    })
    .catch((e) => console.warn('ridge: the surveyed places could not be loaded; invented ground only', e && e.message));
  return DEM_READY;
}

// The scene for a seed, as two sheets of buffers (each the picture at half resolution).
function ridgeScene(seed, opt) {
  const o = Object.assign({ seed }, opt);
  const sh = Compose.sheets(PARTS, o);
  const S = Compose._scene(PARTS, seed >>> 0 || 1, o.regime | 0, o.place || 0, null, o.event | 0, o.pair || '');   // cached by sheets()
  const one = S.frames.length === 1, hw = PARTS.sheet.pic[0] >> 1, h = S.h;
  const TP = Compose.temper(seed >>> 0 || 1);
  for (const k in TP) if (o[k] != null) TP[k] = o[k];
  const kds = S.frames.map((fr) => solveCloud(fr, S, TP));
  const sheets = [0, 1].map((k) => {
    const fi = one ? 0 : k, fr = S.frames[fi], F = fr.F, w = fr.w, x0 = one ? k * hw : 0, kd = kds[fi];
    const n = hw * h;
    const B = {
      w: hw, h, k,
      tone: new Float32Array(n), depth: new Float32Array(n), light: new Float32Array(n), rock: new Float32Array(n),
      air: new Float32Array(n), sky: new Uint8Array(n),
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < hw; x++) {
      const i = y * hw + x, j = y * w + x + x0;
      B.tone[i] = sh[k].tone[i];
      B.depth[i] = F.depth[j];
      B.sky[i] = F.depth[j] > 1e8 ? 1 : 0;
      B.light[i] = F.tone[j];
      B.rock[i] = F.rock[j];
      // the land's transmittance, exactly as 028 develops it (cloud solved to the budget, plus haze)
      B.air[i] = B.sky[i] ? 1 : 1 - Math.exp(-F.tau[j] * kd - F.haze[j]);
    }
    const sm = fr.smear;
    return Object.assign(B, {
      box: sh[k].box, W: sh[k].W, H: sh[k].H, mat: sh[k].mat,
      screen: fr.screen ? [fr.screen[0] - x0, fr.screen[1]] : null,          // where the sun (or moon) is, in this sheet
      smear: { kind: sm.kind, sign: sm.sign, vx: w / 2 - x0, vy: sm.horizon },
      nearAt: fr.nearAt, gaze: sh[k].gaze,
    });
  });
  return {
    sheets, regime: sh[0].regime, light: sh[0].light, key: sh[0].tonalKey, weather: sh[0].weather, event: sh[0].event,
    pair: sh[0].pair, place: sh[0].place, placeLabel: sh[0].placeLabel, temper: TP,
  };
}

// 028's develop() solves the cloud density so the land left visible meets the register's
// budget; the same bisection, so the air in front of each pixel is 028's.
function solveCloud(fr, S, TP) {
  const F = fr.F, w = fr.w, h = S.h;
  const target = Math.max(0.03, Math.min(0.97, RIDGE_BUDGET[S.regime] * TP.reveal * (fr.revealK || 1)));
  let lo = 0, hi = 40;
  for (let it = 0; it < 22; it++) {
    const k = (lo + hi) / 2;
    let s = 0, n = 0;
    for (let i = 0; i < w * h; i += 7) if (F.depth[i] < 1e8) { s += Math.exp(-k * F.tau[i] - F.haze[i]); n++; }
    if (n && s / n > target) lo = k;
    else hi = k;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------
// A palette per light (028 decides the light per seed): the sky between its darkest and its
// lit cloud, the glow round the sun, rock and snow each from their shaded to their lit colour,
// and the air. 'mono' is 028's own monochrome as a warm ink on paper.
const LIGHTS = {
  against: { skyDark: [98, 102, 124], skyLit: [252, 238, 210], glow: [255, 214, 156], rockShade: [56, 60, 78], rockLit: [178, 150, 118], snowShade: [148, 166, 206], snowLit: [252, 240, 222], lichen: [168, 140, 92], air: [200, 196, 206] },
  side: { skyDark: [108, 122, 146], skyLit: [242, 241, 236], glow: [255, 236, 202], rockShade: [66, 72, 94], rockLit: [196, 168, 130], snowShade: [144, 164, 210], snowLit: [250, 246, 236], lichen: [172, 150, 96], air: [190, 200, 214] },
  overcast: { skyDark: [124, 130, 138], skyLit: [234, 236, 234], glow: [240, 240, 236], rockShade: [78, 80, 86], rockLit: [152, 148, 140], snowShade: [172, 182, 196], snowLit: [238, 240, 240], lichen: [146, 138, 104], air: [200, 204, 206] },
  front: { skyDark: [92, 118, 160], skyLit: [228, 236, 246], glow: [246, 242, 230], rockShade: [88, 84, 96], rockLit: [206, 180, 142], snowShade: [166, 182, 216], snowLit: [252, 248, 238], lichen: [180, 156, 98], air: [196, 208, 224] },
  moon: { skyDark: [26, 34, 58], skyLit: [168, 180, 208], glow: [214, 222, 240], rockShade: [22, 26, 42], rockLit: [100, 108, 138], snowShade: [66, 84, 128], snowLit: [196, 206, 232], lichen: [84, 92, 112], air: [72, 84, 112] },
};
const MONO = { dark: [44, 38, 34], light: [246, 240, 228] };

const lumOf = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
// give colour c the luminance t (0–255) without changing its hue; what would overflow white
// is pulled toward the grey of that luminance
function toLum(c, t) {
  const L = Math.max(1, lumOf(c));
  let r = (c[0] * t) / L, g = (c[1] * t) / L, b = (c[2] * t) / L;
  const m = Math.max(r, g, b);
  if (m > 255) {
    const s = (255 - t) / Math.max(1e-3, m - t);
    r = t + (r - t) * s; g = t + (g - t) * s; b = t + (b - t) * s;
  }
  return [r, g, b];
}

// The colour of each pixel of a sheet: Float32Array of r, g, b.
// mode 'colour' | 'mono'; light: 028's light mode for the seed.
function colourise(B, light, mode, warmth) {
  const n = B.w * B.h, out = new Float32Array(n * 3);
  if (mode === 'mono') {
    for (let i = 0; i < n; i++) {
      const t = B.tone[i] / 255, c = mixRGB(MONO.dark, MONO.light, t), cc = toLum(c, B.tone[i]);
      out[i * 3] = cc[0]; out[i * 3 + 1] = cc[1]; out[i * 3 + 2] = cc[2];
    }
    return out;
  }
  const P = LIGHTS[light] || LIGHTS.side;
  const sun = B.screen;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const i = y * B.w + x, t = B.tone[i];
    let c;
    // the cloud: its own dark-to-lit colour, the glow round the sun when it is in the sheet
    const cloud = mixRGB(P.skyDark, P.skyLit, Math.min(1, t / 230));
    let glowK = 0;
    if (sun) {
      const dx = (x - sun[0]) / (B.w * 0.55), dy = (y - sun[1]) / (B.h * 0.5);
      glowK = Math.exp(-(dx * dx + dy * dy)) * (light === 'against' ? 0.75 : 0.4) * warmth;
    }
    const sky = mixRGB(cloud, P.glow, glowK);
    if (B.sky[i]) c = sky;
    else {
      // the land: snow or rock, shaded to lit by the light on it; rock varied with lichen and
      // weathering in broad patches
      const L = Math.max(0, Math.min(1, B.light[i] * 1.2));
      const snow = mixRGB(P.snowShade, P.snowLit, L);
      const nz = noise(x * 0.012, y * 0.012, 3.7);
      const rockLit = mixRGB(P.rockLit, P.lichen, Math.max(0, nz - 0.45) * 1.4);
      const rock = mixRGB(P.rockShade, rockLit, L);
      const land = mixRGB(snow, rock, Math.max(0, Math.min(1, B.rock[i])));
      // the air between: land colour giving way to the cloud's colour as 028's transmittance falls
      c = mixRGB(land, sky, Math.min(1, B.air[i]) * 0.9);
    }
    const cc = toLum(c, t);
    out[i * 3] = cc[0]; out[i * 3 + 1] = cc[1]; out[i * 3 + 2] = cc[2];
  }
  return out;
}

// Bilinear sample of a sheet buffer at data coordinates.
function sampleBuf(A, B, x, y) {
  x = Math.max(0, Math.min(B.w - 1.001, x));
  y = Math.max(0, Math.min(B.h - 1.001, y));
  const xi = x | 0, yi = y | 0, a = x - xi, b = y - yi, o = yi * B.w + xi;
  return (A[o] * (1 - a) + A[o + 1] * a) * (1 - b) + (A[o + B.w] * (1 - a) + A[o + B.w + 1] * a) * b;
}
function sampleRGB(C, B, x, y) {
  x = Math.max(0, Math.min(B.w - 1.001, x));
  y = Math.max(0, Math.min(B.h - 1.001, y));
  const xi = x | 0, yi = y | 0, a = x - xi, b = y - yi, o = (yi * B.w + xi) * 3, o2 = o + B.w * 3;
  const r = [0, 1, 2].map((c) => (C[o + c] * (1 - a) + C[o + 3 + c] * a) * (1 - b) + (C[o2 + c] * (1 - a) + C[o2 + 3 + c] * a) * b);
  return r;
}
