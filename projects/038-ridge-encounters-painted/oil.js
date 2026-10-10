// 038 — the oil painter for a sheet of 028's scene.
//
// 036's method: the scene is laid down as an underpainting (here the colourised frame, its
// values 028's own), then repainted in opaque, bristle-streaked strokes, coarse to fine —
// a block-in that simplifies, a body layer that goes only where something happens, and an
// edge layer laid along every edge the underpainting has. Directions are read from the scene,
// never random:
//   cloud      along the isophotes of its tone (the way the vapour lies), flattening off
//              toward level where the cloud has no structure
//   land       along the isophotes of the light on it — the form of the rock — leaning to the
//              fall line (upright) where the form is weak; far land in soft level strokes
//   near       the body's movement (028's smear): the strokes run the way the ground streaks
//   snow       lights laid on with the knife: short, square, loaded strokes in the lit snow
// Stroke size follows depth: broad near, fine far; the far crest is lost in a wet band.

let OP = null;
let WET = null; // no wet-into-wet pickup sampler in 038 (036 read the wet block-in back)
function oilParams() {
  const P = (k) => G.param(k);
  const la = (-123 * Math.PI) / 180;
  return {
    w: P('strokeSize'), l: 3.1, coverage: P('coverage'), edge: 10, bend: 0.2, jitterA: 0.1, jitterC: 0.05, body: 0.95,
    bristles: P('bristles'), bristleA: 1, dry: P('oilDry'), wet: 1, impasto: P('impasto'), economy: 0.7, blockIn: 0.6,
    fol: 0.6, pickup: 0, knife: P('knife'), lost: 0.9, light: [Math.cos(la), Math.sin(la)], nightK: 1,
  };
}

// the direction field of a sheet: isophote angle and its coherence from the structure tensor
// of 028's tone, smoothed so the strokes follow masses and not grain
function toneField(Bs) {
  const w = Bs.w, h = Bs.h, n = w * h;
  const jxx = new Float32Array(n), jyy = new Float32Array(n), jxy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, t = Bs.tone;
    const gx = (t[i + 1 - w] + 2 * t[i + 1] + t[i + 1 + w] - t[i - 1 - w] - 2 * t[i - 1] - t[i - 1 + w]) / 8;
    const gy = (t[i + w - 1] + 2 * t[i + w] + t[i + w + 1] - t[i - w - 1] - 2 * t[i - w] - t[i - w + 1]) / 8;
    jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
  }
  const blur = (A, r) => {
    const o = new Float32Array(n), tmp = new Float32Array(n);
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += A[y * w + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += A[y * w + Math.min(w - 1, x + r + 1)] - A[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    return o;
  };
  const a = blur(jxx, 5), c = blur(jyy, 5), b = blur(jxy, 5);
  const ang = new Float32Array(n), coh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ang[i] = 0.5 * Math.atan2(2 * b[i], a[i] - c[i]) + Math.PI / 2; // along the isophote
    const tr = a[i] + c[i];
    coh[i] = tr > 1e-3 ? Math.sqrt((a[i] - c[i]) ** 2 + 4 * b[i] * b[i]) / tr : 0;
  }
  return { ang, coh };
}

// blend two angles (of undirected lines) by weight t
function mixAngle(a, b, t) {
  const ca = Math.cos(2 * a), sa = Math.sin(2 * a), cb = Math.cos(2 * b), sb = Math.sin(2 * b);
  return 0.5 * Math.atan2(sa * (1 - t) + sb * t, ca * (1 - t) + cb * t);
}

function oilSheetTasks(Bs, C, st) {
  const T = [];
  const s2d = Bs.box[2] / Bs.w; // sheet units per data pixel
  const toD = (x, y) => [(x - Bs.box[0]) / s2d, (y - Bs.box[1]) / s2d];
  let TF = null;
  const idx = (x, y) => {
    const [dx, dy] = toD(x, y);
    return Math.max(0, Math.min(Bs.h - 1, dy | 0)) * Bs.w + Math.max(0, Math.min(Bs.w - 1, dx | 0));
  };
  const under = (x, y) => {
    const [dx, dy] = toD(x, y);
    return sampleRGB(C, Bs, dx, dy);
  };
  // a wide sample for the block-in: the colour of the mass, not of the detail
  const underWide = (x, y, r) => {
    let acc = [0, 0, 0];
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const c = under(x + ox, y + oy);
      acc = [acc[0] + c[0] / 5, acc[1] + c[1] / 5, acc[2] + c[2] / 5];
    }
    return acc;
  };
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const sm = Bs.smear;
  const smearAngle = (dx, dy) => {
    if (sm.kind === 'fall') return Math.atan2(1, 0.25 * sm.sign);
    if (sm.kind === 'turn') return Math.atan2(0.15 * sm.sign, 1);
    if (sm.kind === 'shove') return Math.atan2(-0.35, sm.sign);
    return Math.atan2(dy - sm.vy, dx - sm.vx);
  };
  const O = {
    under, lum,
    field(x, y) {
      const i = idx(x, y), [dx, dy] = toD(x, y);
      const ang = TF.ang[i], coh = Math.min(1, TF.coh[i] * 1.6);
      if (Bs.sky[i]) return { kind: 'cloud', a: mixAngle(0, ang, 0.35 + 0.5 * coh), k: 1.5 };
      const d = Bs.depth[i], near = Math.min(1, Bs.nearAt / Math.max(1, d));
      const far = Bs.air[i] > 0.55 || d > 500;
      const k = Math.max(0.35, Math.min(1.6, 1.6 * Math.exp(-d / 260) + 0.35));
      if (far) return { kind: 'far', a: mixAngle(0, ang, 0.3 * coh), k: Math.max(0.4, k) };
      let a = mixAngle(-Math.PI / 2 + 0.25 * Math.sin(dx * 0.05), ang, 0.25 + 0.7 * coh); // the form, leaning to the fall line
      if (near > 0.3 && st.smear > 0) a = mixAngle(a, smearAngle(dx, dy), Math.min(0.85, near * st.smear * 0.8));
      return { kind: Bs.rock[i] < 0.4 ? 'snow' : 'rock', a, k };
    },
  };
  // ridge of paint under the room light: none in the cloud and far off (a lit edge on every
  // dab there read as grains of rice), most on the near rock and snow
  const relief = { cloud: 0.03, far: 0, rock: 0.24, snow: 0.3 };
  const W0 = OP.w;
  const layer = (scale, cover, edges, li, out) => {
    const leanRel = [1 - 0.6 * OP.fol, 1 - 0.25 * OP.fol, 1][li];
    const w0 = W0 * scale, g = w0 * 0.8;
    const [bx, by, bw, bh] = Bs.box;
    for (let gy = by - g; gy < by + bh + g; gy += g) for (let gx = bx - g; gx < bx + bw + g; gx += g) {
      const x = gx + random(-0.5, 0.5) * g, y = gy + random(-0.5, 0.5) * g;
      const f = O.field(x, y);
      let a = f.a;
      if (edges || li === 1) {
        const hh = 4;
        const gxv = lum(under(x + hh, y)) - lum(under(x - hh, y)), gyv = lum(under(x, y + hh)) - lum(under(x, y - hh));
        const mag = Math.hypot(gxv, gyv);
        if (edges) {
          if (f.kind === 'far' || mag < OP.edge) continue;
          a = Math.atan2(gyv, gxv) + Math.PI / 2;
        } else if (random() < OP.economy * (1 - Math.min(1, mag / 14))) continue; // the block-in stands where nothing happens
      }
      const w = w0 * f.k, len = w * OP.l * (f.kind === 'cloud' ? 1.1 : f.kind === 'far' ? 1.0 : 0.85);
      const p = (cover * g * g) / (w * len), n = Math.floor(p) + (random() < p - Math.floor(p) ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const sx = x + (k ? random(-0.5, 0.5) * g : 0), sy = y + (k ? random(-0.5, 0.5) * g : 0);
        const sample = li === 0 ? (px, py) => mixRGB(under(px, py), underWide(px, py, W0 * 1.4), OP.blockIn) : null;
        out.push(makeOilStroke(O, sx, sy, a + random(-1, 1) * OP.jitterA, len * random(0.75, 1.2), w * random(0.85, 1.1), {
          relief: relief[f.kind] * leanRel, lean: li === 0 ? 1 - 0.1 * OP.fol : 1, sample, pickup: false,
          angular: f.kind === 'rock' && li > 0, soft: f.kind === 'far',
        }));
      }
    }
  };
  // the underpainting: the colourised frame, laid in the picture box
  T.push(() => {
    TF = toneField(Bs);
    const img = createImage(Bs.w, Bs.h);
    img.loadPixels();
    for (let i = 0; i < Bs.w * Bs.h; i++) {
      img.pixels[i * 4] = C[i * 3]; img.pixels[i * 4 + 1] = C[i * 3 + 1]; img.pixels[i * 4 + 2] = C[i * 3 + 2]; img.pixels[i * 4 + 3] = 255;
    }
    img.updatePixels();
    image(img, X(Bs.box[0]), Y(Bs.box[1]), Bs.box[2] * U, Bs.box[3] * U);
  });
  // three layers, coarse to fine; each queued as strokes and drawn in chunks
  // coverage is in expected layers of paint at each point: with random placement a layer of
  // c leaves e^-c of the ground bare, so the block-in is laid ~2.4 deep (≈ 9 % bare, where the
  // underpainting glows through), the body over it where something happens, then the edges
  const passes = [[2.2, 2.4, false], [1.1, 1.4, false], [0.55, 1.0, true]];
  passes.forEach(([scale, cover, edges], li) => {
    let strokes = null, at = 0;
    T.push(() => {
      if (!strokes) { strokes = []; layer(scale, cover * OP.coverage, edges, li, strokes); }
      const t0 = performance.now();
      while (at < strokes.length && performance.now() - t0 < 24) oilStroke(strokes[at++]);
      return at < strokes.length ? YIELD_AGAIN : undefined;
    });
  });
  // the knife: loaded light paint laid flat on the lit snow and the brightest rock
  T.push(() => {
    const n = Math.round(OP.knife);
    for (let k = 0; k < n; k++) {
      const x = Bs.box[0] + random(Bs.box[2]), y = Bs.box[1] + random(Bs.box[3]), i = idx(x, y);
      if (Bs.sky[i] || Bs.air[i] > 0.5 || Bs.tone[i] < 170) continue;
      const f = O.field(x, y), w = OP.w * 0.6 * f.k;
      const c = mixRGB(under(x, y), [255, 252, 244], 0.25);
      oilStroke(makeOilStroke(O, x, y, f.a, w * 1.6, w, { color: c, color2: c, relief: 0.55, angular: true, crisp: true }));
    }
  });
  return T;
}
