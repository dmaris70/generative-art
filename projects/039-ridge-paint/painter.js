// 039 — the painter: decides every stroke by looking at the canvas.
//
// It works as a painter at the easel does, in sessions (a thin block-in that is let dry, then
// the body and the details alla prima, wet into wet, then the loaded lights), and within each
// session with brushes from broad to fine. For each brush it looks over the canvas, compares
// it with the subject (028's scene, coloured by 038's bridge), and paints where they differ
// by more than it will tolerate at that brush's scale (after Hertzmann 1998). For each stroke:
//   - it mixes on the palette a colour for what it sees there, pushed a little past it where
//     the canvas has gone wrong (the paint will mix with what is wet under it);
//   - it keeps painting with what is on the brush while that is close enough and the brush is
//     not spent; tops it up from the new mix (a dirty brush) when the colour is near; wipes it
//     on the rag first when the colour is far;
//   - it draws the stroke along the form (038's directions from 028's buffers) and stops where
//     going on would no longer make the canvas closer to the subject.
// Every stroke then happens physically in paint.js.

// ---------------------------------------------------------------------------------
// The palette. A painter tints the way paint allows: a touch of a strong pigment in a lot of
// white. So the mixes are one to three of the palette's colours in relative proportions
// (1, 2, 4, 8 of each), with white from none to 64 times their amount. (Mixes in eighths could
// not make a muted tint: the nearest to a sky beige was one part sienna in seven of white, a
// salmon; to a warm grey, white with cerulean and cadmium, a green-grey.) The nearest mix to a
// wanted colour (in OKLab, as it looks thick on the palette) is looked up once per cell of a
// 32³ grid of sRGB and kept.
// ---------------------------------------------------------------------------------
const PALETTES = {
  colour: [2, 3, 4, 5, 6, 7, 8, 9], // with white (1) added to every mix in its proportions
  mono: [2, 5], // ivory black and burnt umber with white: 028's monochrome as a warm grisaille
};
const WHITE_RATIOS = [0, 0.5, 1, 2, 4, 8, 16, 32, 64];
const MIX_PARTS = [1, 2, 4, 8];
function makePalette(PG, which) {
  const use = PALETTES[which] || PALETTES.colour, P = PG.length, mixes = [], seen = new Set();
  const add = (parts) => {
    let sc = 0;
    for (const [, n] of parts) sc += n;
    for (const wr of WHITE_RATIOS) {
      const f = new Float32Array(P);
      for (const [p, n] of parts) f[p] = n;
      f[1] = wr * sc;
      let tot = 0;
      for (let p = 0; p < P; p++) tot += f[p];
      for (let p = 0; p < P; p++) f[p] /= tot;
      const key = Array.from(f, (v) => v.toFixed(4)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const lin = mixRInf(PG, f, [0, 0, 0]);
      mixes.push({ f, lin, lab: oklab(lin[0], lin[1], lin[2], [0, 0, 0]) });
    }
  };
  const n = use.length;
  for (let a = 0; a < n; a++) {
    add([[use[a], 1]]);
    for (let b = a + 1; b < n; b++) {
      for (const i of MIX_PARTS) for (const j of MIX_PARTS) add([[use[a], i], [use[b], j]]);
      for (let c = b + 1; c < n; c++)
        for (const i of MIX_PARTS) for (const j of MIX_PARTS) for (const k of MIX_PARTS) add([[use[a], i], [use[b], j], [use[c], k]]);
    }
  }
  { const f = new Float32Array(P); f[1] = 1; const lin = mixRInf(PG, f, [0, 0, 0]); mixes.push({ f, lin, lab: oklab(lin[0], lin[1], lin[2], [0, 0, 0]) }); }
  const lut = new Int32Array(32768).fill(-1), lab = [0, 0, 0];
  return {
    mixes,
    // the mix nearest to a linear colour
    nearest(r, g, b) {
      const q = ((linToSrgb(r) >> 3) << 10) | ((linToSrgb(g) >> 3) << 5) | (linToSrgb(b) >> 3);
      if (lut[q] >= 0) return mixes[lut[q]];
      const cr = srgbToLin(((q >> 10) << 3) + 4), cg = srgbToLin((((q >> 5) & 31) << 3) + 4), cb = srgbToLin(((q & 31) << 3) + 4);
      oklab(cr, cg, cb, lab);
      let best = 0, bd = Infinity;
      for (let m = 0; m < mixes.length; m++) {
        const L = mixes[m].lab, d = (L[0] - lab[0]) ** 2 + (L[1] - lab[1]) ** 2 + (L[2] - lab[2]) ** 2;
        if (d < bd) { bd = d; best = m; }
      }
      lut[q] = best;
      return mixes[best];
    },
  };
}

// separable box blur, three passes (≈ gaussian), of an n×3 float image
function blur3(src, w, h, r) {
  if (r < 1) return src.slice();
  r = Math.round(r);
  let a = src.slice(), b = new Float32Array(src.length);
  const pass = (A, B, horiz) => {
    const n = horiz ? w : h, m = horiz ? h : w, d = 2 * r + 1;
    for (let j = 0; j < m; j++) for (let c = 0; c < 3; c++) {
      const at = (k) => (horiz ? (j * w + Math.max(0, Math.min(n - 1, k))) : (Math.max(0, Math.min(n - 1, k)) * w + j)) * 3 + c;
      let s = 0;
      for (let k = -r; k <= r; k++) s += A[at(k)];
      for (let k = 0; k < n; k++) {
        B[(horiz ? j * w + k : k * w + j) * 3 + c] = s / d;
        s += A[at(k + r + 1)] - A[at(k - r)];
      }
    }
  };
  for (let it = 0; it < 3; it++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

// blend two (undirected) angles
function mixAng(a, b, t) {
  const ca = Math.cos(2 * a), sa = Math.sin(2 * a), cb = Math.cos(2 * b), sb = Math.sin(2 * b);
  return 0.5 * Math.atan2(sa * (1 - t) + sb * t, ca * (1 - t) + cb * t);
}

// the direction of the strokes over a sheet, at data resolution, for a brush of `wd` data px:
// along the isophotes of the subject's tone where it has structure; level in the sky and far
// off where it has none; the fall line on the near ground, turned toward the body's movement
// (038's rules on 028's buffers)
function strokeField(Bs, wd, smearK) {
  const w = Bs.w, h = Bs.h, n = w * h, t = Bs.tone;
  const jxx = new Float32Array(n * 3);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = (t[i + 1 - w] + 2 * t[i + 1] + t[i + 1 + w] - t[i - 1 - w] - 2 * t[i - 1] - t[i - 1 + w]) / 8;
    const gy = (t[i + w - 1] + 2 * t[i + w] + t[i + w + 1] - t[i - w - 1] - 2 * t[i - w] - t[i - w + 1]) / 8;
    jxx[i * 3] = gx * gx; jxx[i * 3 + 1] = gy * gy; jxx[i * 3 + 2] = gx * gy;
  }
  const J = blur3(jxx, w, h, Math.max(2, wd * 0.6));
  const ang = new Float32Array(n);
  const sm = Bs.smear;
  const smearAngle = (x, y) =>
    sm.kind === 'fall' ? Math.atan2(1, 0.25 * sm.sign) : sm.kind === 'turn' ? Math.atan2(0.15 * sm.sign, 1) : sm.kind === 'shove' ? Math.atan2(-0.35, sm.sign) : Math.atan2(y - sm.vy, x - sm.vx);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = J[i * 3], c = J[i * 3 + 1], b = J[i * 3 + 2], tr = a + c;
    const iso = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
    const coh = Math.min(1, (tr > 1e-3 ? Math.sqrt((a - c) ** 2 + 4 * b * b) / tr : 0) * 1.6);
    let v;
    if (Bs.sky[i]) v = mixAng(0, iso, 0.35 + 0.5 * coh);
    else if (Bs.air[i] > 0.55 || Bs.depth[i] > 500) v = mixAng(0, iso, 0.3 * coh);
    else {
      v = mixAng(-Math.PI / 2 + 0.25 * Math.sin(x * 0.05), iso, 0.25 + 0.7 * coh);
      const near = Math.min(1, Bs.nearAt / Math.max(1, Bs.depth[i]));
      if (near > 0.3 && smearK > 0) v = mixAng(v, smearAngle(x, y), Math.min(0.85, near * smearK * 0.8));
    }
    ang[i] = v;
  }
  return ang;
}

// ---------------------------------------------------------------------------------
// The painter of one sheet
// ---------------------------------------------------------------------------------
// Bs: 028's sheet buffers (bridge.js); C: its colour (sRGB floats, data resolution);
// o: settings. Returns { cv, step(ms) → dirty rect or null, done, stats, stage }.
function makePainter(Bs, C, PG, pal, o, rng) {
  const s2d = Bs.box[2] / Bs.w, cw = Math.round(Bs.box[2]), ch = Math.round(Bs.box[3]), n = cw * ch, P = PG.length;
  const cv = new PaintCanvas(cw, ch, PG, rng);
  // the subject at canvas resolution, linear
  const T = new Float32Array(n * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = sampleRGB(C, Bs, x / s2d, y / s2d), i = (y * cw + x) * 3;
    T[i] = srgbToLin(c[0]); T[i + 1] = srgbToLin(c[1]); T[i + 2] = srgbToLin(c[2]);
  }
  // the canvas: a white-primed linen, toned with a thin warm-grey imprimatura (umber, a little
  // sienna, ochre and black in plenty of medium; a brighter earth glinted orange through every
  // break in a grey sky), dry before the first stroke; it glints through wherever the
  // thin block-in broke
  cv.ground([238, 234, 224]);
  {
    const f = new Float32Array(P);
    f[0] = 0.93; f[1] = 0.02; f[5] = 0.03; f[6] = 0.008; f[7] = 0.015; f[2] = 0.004; // a warm grey earth
    if (o.palette === 'mono') { f[6] = 0; f[7] = 0; f[5] = 0.06; }
    const v = 0.35, K = [0, 0, 0], S = [0, 0, 0];
    for (let c = 0; c < 3; c++) for (let p = 1; p < P; p++) { K[c] += f[p] * PG[p].K[c]; S[c] += f[p] * PG[p].S[c]; }
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) cv.dry[i * 3 + c] = kmLayer(K[c], S[c], v, cv.dry[i * 3 + c]);
  }
  const W0 = o.brush; // the finest working brush, canvas px
  // sessions, as painted: [name, brushes (× W0), paint thickness, medium share, tolerance
  // (OKLab), how far past the subject to mix, stroke steps, how far the subject is softened,
  // dry at the end?]
  const SESSIONS = [
    { name: 'block-in', brushes: [5.5], rate: 0.8, medium: 0.12, tol: 0.0, aim: 0, steps: 6, soft: 1.1, dry: true },
    { name: 'body', brushes: [2.8, 1.5], rate: 0.85, medium: 0.08, tol: o.tol, aim: o.aim, steps: 10, soft: 0.55, dry: false },
    { name: 'detail', brushes: [0.75], rate: 0.9, medium: 0.05, tol: o.tol * 1.25, aim: o.aim, steps: 12, soft: 0.35, dry: false },
    { name: 'lights', brushes: [1.0], rate: 1.7 * o.impasto, medium: 0, tol: o.tol, aim: o.aim, steps: 6, soft: 0.4, dry: false, lights: true },
  ];
  const stats = { strokes: 0, reloads: 0, wipes: 0, kept: 0, sessions: [] };
  const lab = new Float32Array(n * 3), cur = new Float32Array(n * 3), err = new Float32Array(n);
  const c3 = [0, 0, 0], l1 = [0, 0, 0], l2 = [0, 0, 0];
  let si = 0, bi = -1, pass = null;

  // set up the next brush: soften the subject to its scale, look over the canvas, list the
  // places that are wrong enough
  function nextPass() {
    for (;;) {
      const S = SESSIONS[si];
      if (!S) return null;
      bi++;
      if (bi >= S.brushes.length) {
        if (S.dry) cv.dryAll();
        stats.sessions.push(S.name + ' ' + stats.strokes);
        si++; bi = -1;
        continue;
      }
      const w = Math.max(3, S.brushes[bi] * W0);
      const Tb = blur3(T, cw, ch, S.soft * w * 0.5);
      for (let i = 0; i < n; i++) {
        oklab(Tb[i * 3], Tb[i * 3 + 1], Tb[i * 3 + 2], l1);
        lab[i * 3] = l1[0]; lab[i * 3 + 1] = l1[1]; lab[i * 3 + 2] = l1[2];
      }
      cv.renderLin(cur);
      for (let i = 0; i < n; i++) {
        oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2);
        err[i] = Math.hypot(l2[0] - lab[i * 3], l2[1] - lab[i * 3 + 1], l2[2] - lab[i * 3 + 2]);
      }
      // the loaded lights go on the sheet's own lightest values (a whiteout sky is light
      // everywhere, and thick paint over all of it glittered)
      let lightAt = 0.8;
      if (S.lights) {
        const Ls = [];
        for (let i = 0; i < n; i += 37) Ls.push(lab[i * 3]);
        Ls.sort((a, b) => a - b);
        lightAt = Math.max(0.8, Ls[Math.floor(0.9 * (Ls.length - 1))]);
      }
      const g = Math.max(2, Math.round(w * 0.75)), cells = [];
      const st = Math.max(1, Math.floor(g / 5));
      for (let y = 0; y < ch; y += g) for (let x = 0; x < cw; x += g) {
        let sum = 0, cnt = 0, best = -1, bx = x, by = y;
        for (let yy = y; yy < Math.min(ch, y + g); yy += st) for (let xx = x; xx < Math.min(cw, x + g); xx += st) {
          const i = yy * cw + xx, e = err[i];
          if (S.lights && lab[i * 3] < lightAt) continue;
          sum += e; cnt++;
          if (e > best) { best = e; bx = xx; by = yy; }
        }
        if (cnt && sum / cnt > S.tol) {
          const i = by * cw + bx, m = pal.nearest(Tb[i * 3], Tb[i * 3 + 1], Tb[i * 3 + 2]);
          cells.push([bx, by, m.lab[0] + 0.04 * rng(), m]);
        }
      }
      // a painter mixes a colour and lays it wherever it belongs, darks first and lights last:
      // the places are taken by colour, darkest first (with a little disorder), in random
      // order within a colour
      for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [cells[k], cells[j]] = [cells[j], cells[k]]; }
      const key = new Map();
      for (const c of cells) if (!key.has(c[3])) key.set(c[3], c[2]);
      cells.sort((A, B) => key.get(A[3]) - key.get(B[3]));
      const field = strokeField(Bs, w / s2d, o.smear);
      const brush = new Brush(w, P, rng, { rate: S.rate, reach: o.reach });
      return { S, w, Tb, cells, at: 0, field, brush, mix: null };
    }
  }

  // the subject (softened) and the canvas, in OKLab, at a canvas pixel
  const subjLab = (i, out) => { out[0] = lab[i * 3]; out[1] = lab[i * 3 + 1]; out[2] = lab[i * 3 + 2]; return out; };
  const canvasLab = (i, out) => { cv.colourAt(i, c3); return oklab(c3[0], c3[1], c3[2], out); };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function paintOne(ps, x0, y0) {
    const { S, w, Tb, brush } = ps;
    const i0 = y0 * cw + x0;
    // look again: has it been put right since the pass began?
    canvasLab(i0, l2);
    if (dist(subjLab(i0, l1), l2) <= S.tol) return null;
    // the colour wanted: the subject here, its value pushed past it by how far the canvas is
    // off (pushed in hue too, a warm-toned canvas sent the greys to cerulean)
    const k = S.aim;
    subjLab(i0, l1);
    // (never more than 0.08 in lightness: pushed harder, it overshot into alternating light and
    // dark dabs)
    const aimL = l1[0] + Math.max(-0.08, Math.min(0.08, k * (l1[0] - l2[0]))), aimA = l1[1], aimB = l1[2];
    const want = [Math.min(1, Math.max(0.05, aimL)), aimA, aimB];
    oklabToLin(want[0], want[1], want[2], c3);
    const mix = pal.nearest(Math.min(1, Math.max(0.002, c3[0])), Math.min(1, Math.max(0.002, c3[1])), Math.min(1, Math.max(0.002, c3[2])));
    // the brush: carry on with it, top it up, or wipe it first
    const held = mixRInf(PG, brush.meanMix(), [0, 0, 0]), hl = oklab(held[0], held[1], held[2], [0, 0, 0]);
    const dE = dist(hl, mix.lab), full = brush.fullness();
    if (full > 0.35 && dE < 0.03) stats.kept++;
    else {
      if (dE > o.wipeAt) { brush.wipe(0.06); stats.wipes++; }
      const f = mix.f.slice();
      let sum = 0;
      for (let p = 1; p < P; p++) sum += f[p];
      f[0] = (sum * S.medium) / Math.max(1e-6, 1 - S.medium);
      brush.reload(f, o.streak);
      stats.reloads++;
    }
    // the stroke: along the form, until going on would not bring the canvas closer
    const step = Math.max(2, w * 0.5), path = [[x0, y0]];
    let x = x0, y = y0, dx = 0, dy = 0;
    const fa = (xx, yy) => ps.field[Math.min(Bs.h - 1, Math.max(0, Math.floor(yy / s2d))) * Bs.w + Math.min(Bs.w - 1, Math.max(0, Math.floor(xx / s2d)))];
    for (let s = 0; s < S.steps; s++) {
      const a = fa(x, y);
      let ux = Math.cos(a), uy = Math.sin(a);
      if (s === 0) { if (rng() < 0.5) { ux = -ux; uy = -uy; } }
      else {
        if (ux * dx + uy * dy < 0) { ux = -ux; uy = -uy; }
        ux = 0.55 * ux + 0.45 * dx; uy = 0.55 * uy + 0.45 * dy;
        const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
      }
      dx = ux; dy = uy;
      const nx = x + ux * step, ny = y + uy * step;
      if (nx < -w || ny < -w || nx > cw + w || ny > ch + w) break;
      if (s >= 4) {
        // (at least four steps: shorter strokes read as square dabs) go on while the colour
        // meant for this stroke is closer to the subject here than the canvas already is
        const j = Math.min(ch - 1, Math.max(0, Math.round(ny))) * cw + Math.min(cw - 1, Math.max(0, Math.round(nx)));
        subjLab(j, l1);
        if (dist(l1, want) > dist(l1, canvasLab(j, l2))) break;
      }
      x = nx; y = ny;
      path.push([x, y]);
    }
    if (path.length < 2) path.push([x0 + dx * step, y0 + dy * step]);
    const rect = layStroke(cv, brush, path, { pressure: 0.85 + 0.15 * rng(), open: o.open, pick: o.pick, dry: o.dryBrush });
    stats.strokes++;
    return rect;
  }

  const api = {
    cv, stats, done: false, stage: 'priming',
    // paint for about `ms`; returns the rect that changed, or null
    step(ms) {
      const t0 = performance.now();
      let R = null;
      while (performance.now() - t0 < ms) {
        if (!pass || pass.at >= pass.cells.length) {
          pass = nextPass();
          if (!pass) { api.done = true; api.stage = 'done'; return R || [0, 0, cw, ch]; }
          api.stage = pass.S.name + ' · ' + Math.round(pass.w) + ' px brush';
          if (!R) R = [0, 0, cw, ch]; // a dried session or a new look: show the lot
          continue;
        }
        const [x, y] = pass.cells[pass.at++];
        const r = paintOne(pass, x, y);
        if (r) R = R ? [Math.min(R[0], r[0]), Math.min(R[1], r[1]), Math.max(R[2], r[2]), Math.max(R[3], r[3])] : r;
      }
      return R;
    },
    progress() {
      if (!pass) return 0;
      return Math.min(1, (si + (bi + (pass.at / Math.max(1, pass.cells.length))) / Math.max(1, SESSIONS[si] ? SESSIONS[si].brushes.length : 1)) / SESSIONS.length);
    },
  };
  return api;
}
