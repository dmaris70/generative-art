// 038 — the oil stroke, copied from 036 (Oil Landscape v1): makeOilStroke and oilStroke,
// unchanged except that impasto is read from OP and the wet pickup is optional.

// A stroke: body colour from the underpainting at its middle, a second colour from its
// far end for the bristle streaks (wet-into-wet), both with a little broken-colour jitter.
function makeOilStroke(O, x, y, a, len, w, opts) {
  opts = opts || {};
  const ca = Math.cos(a), sa = Math.sin(a);
  const x0 = x - (ca * len) / 2, y0 = y - (sa * len) / 2;
  const bend = opts.angular ? 0 : random(-1, 1) * OP.bend * len;
  const P = [];
  const pr = opts.angular ? [1, 1, 1, 0.95] : [0.85, 1.1, 1.0, 0.7];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3;
    const bo = bend * Math.sin(Math.PI * t);
    P.push([x0 + ca * len * t - sa * bo, y0 + sa * len * t + ca * bo, pr[k]]);
  }
  const jitter = (c, amt) => {
    const v = 1 + random(-amt, amt);
    return [c[0] * v * (1 + random(-0.03, 0.03)), c[1] * v * (1 + random(-0.03, 0.03)), c[2] * v * (1 + random(-0.03, 0.03))];
  };
  const samp = opts.sample || O.under;
  const body = opts.color || jitter(samp(x, y), OP.jitterC);
  const far = opts.color2 || jitter(samp(x + ca * len * 0.5, y + sa * len * 0.5), OP.jitterC * 1.8);
  return {
    P, w, body, far,
    relief: (opts.relief || 0) * OP.impasto,
    angular: !!opts.angular,
    soft: !!opts.soft,
    scumble: !!opts.scumble,
    crisp: !!opts.crisp,
    lean: opts.lean || 1,
    pickup: !!opts.pickup,
  };
}

// An oil stroke, drawn natively with ordinary "over" blending: oil body paint is opaque,
// whereas p5.brush mixes spectrally (Kubelka–Munk), the right optics for watercolour
// glazes but one that darkens with every overlap. The stroke is a tapered body along a
// cubic path, then a comb of bristle streaks, each its own mix of the two loaded colours,
// starting late, breaking where the brush runs dry, and lifting early. Relief adds the
// ridge of paint under the room light: a shadow strip on the far side and a specular edge
// on the near side. A scumble is bristles only — dry paint dragged over what is there.
function oilStroke(st) {
  const [p0, p1, p2, p3] = st.P;
  if (st.pickup && WET && OP.pickup > 0) {
    // wet into wet: the brush lands in wet paint and drags it along — the bristles carry
    // the colour already on the canvas where the stroke starts, the body a trace of it
    const w0 = WET(p0[0], p0[1]);
    st.far = mixRGB(st.far, w0, OP.pickup);
    st.body = mixRGB(st.body, w0, OP.pickup * 0.15);
  }
  const N = 9;
  const C = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const seg = Math.min(2, Math.floor(t * 3));
    const pr = st.P[seg][2] + (st.P[seg + 1][2] - st.P[seg][2]) * (t * 3 - seg);
    // angular strokes end square (a flat brush laid and lifted); others taper
    const taper = st.angular ? (t < 0.04 || t > 0.96 ? 0.85 : 1) : Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.4);
    C.push([x, y, st.w * 0.5 * pr * taper]);
  }
  const normals = C.map((_, i) => {
    const a = C[Math.max(0, i - 1)];
    const b = C[Math.min(N - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    return [-ty / d, tx / d];
  });
  const strip = (dx, dy, col, alpha, wk) => {
    fill(col[0], col[1], col[2], alpha);
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i < N; i++) {
      const [x, y, hw] = C[i];
      const [nx, ny] = normals[i];
      vertex(X(x + dx + nx * hw * wk), Y(y + dy + ny * hw * wk));
      vertex(X(x + dx - nx * hw * wk), Y(y + dy - ny * hw * wk));
    }
    endShape();
  };
  noStroke();
  const rel = st.relief;
  if (rel > 0.02 && !st.scumble) {
    // the ridge's shadow, cast away from the room light; on near-white paint (the sun's
    // core, snow) a half-value shadow read as grey scribbles — a face in the sun — so the
    // lighter the paint, the lighter its shadow
    const off = st.w * 0.16 * rel;
    const lum = 0.3 * st.body[0] + 0.59 * st.body[1] + 0.11 * st.body[2];
    strip(-OP.light[0] * off, -OP.light[1] * off, shadeRGB(st.body, 0.5 + 0.35 * clamp01((lum - 170) / 70)), 60 + 120 * Math.min(1, rel), 1);
  }
  if (!st.scumble) strip(0, 0, st.body, st.crisp ? 255 : 255 * OP.body * (st.soft ? 0.85 : 1) * (st.lean || 1), 1);

  // bristles
  const wpx = st.w * U;
  const nb = Math.max(2, Math.min(OP.bristles, Math.round(wpx / 1.6)));
  const dry = st.dry !== undefined ? st.dry : st.scumble ? Math.min(0.9, OP.dry + 0.25) : OP.dry;
  const aLo = (st.scumble ? 70 : st.soft ? 40 : 120) * OP.bristleA;
  const aHi = Math.min(255, (st.scumble ? 160 : st.soft ? 90 : 215) * OP.bristleA);
  strokeWeight(Math.max(0.5, (wpx / nb) * (st.scumble ? 0.55 : 0.7)));
  beginShape(LINES);
  for (let b = 0; b < nb; b++) {
    const off = -0.42 + (0.84 * b) / Math.max(1, nb - 1);
    const m = random(0.15, 1) * OP.wet;
    const v = 1 + random(-0.1, 0.1);
    const col = mixRGB(st.body, st.far, m);
    stroke(col[0] * v, col[1] * v, col[2] * v, random(aLo, aHi));
    const t0 = random(0, 0.3);
    const t1 = random(0.6, 1);
    const ph = random(100);
    for (let i = 0; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < t0 || t > t1 || noise(ph + i * 0.7) < dry) continue; // dry-brush breaks
      const a = C[i], c = C[i + 1];
      const na = normals[i], nc = normals[i + 1];
      vertex(X(a[0] + na[0] * a[2] * off * 2), Y(a[1] + na[1] * a[2] * off * 2));
      vertex(X(c[0] + nc[0] * c[2] * off * 2), Y(c[1] + nc[1] * c[2] * off * 2));
    }
  }
  // specular: the lit flank of the ridge, on whichever side faces the room light
  // (no specular on strokes under 4 px: a ridge that small can't catch a visible light,
  // and a 1 px highlight on a 3 px dab reads as a white dot)
  if (rel > 0.05 && !st.scumble && wpx >= 4) {
    const spec = mixRGB(st.body, [255, 252, 244], (0.35 + 0.35 * Math.min(1, rel)) * OP.nightK);
    stroke(spec[0], spec[1], spec[2], (90 + 150 * Math.min(1, rel)) * (0.5 + 0.5 * OP.nightK));
    strokeWeight(Math.max(0.5, wpx * 0.09));
    for (let i = 1; i < N - 2; i++) {
      const facing = normals[i][0] * OP.light[0] + normals[i][1] * OP.light[1] > 0 ? 1 : -1;
      const a = C[i], c = C[i + 1];
      const na = normals[i], nc = normals[i + 1];
      vertex(X(a[0] + na[0] * a[2] * 0.72 * facing), Y(a[1] + na[1] * a[2] * 0.72 * facing));
      vertex(X(c[0] + nc[0] * c[2] * 0.72 * facing), Y(c[1] + nc[1] * c[2] * 0.72 * facing));
    }
  }
  endShape();
  noStroke();
}

