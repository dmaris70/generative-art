// 039 — the watercolourist: decides every wash by looking at the paper.
//
// Watercolour can only darken: the paper is the light, and what is too dark cannot be taken
// back. So the painter works as a watercolourist does:
//   - the lights of the subject are reserved: no wash goes over them;
//   - the sky first, wet into wet: clear water over it, then colour dropped into the wet with a
//     round brush, which the water spreads and softens;
//   - then layers of washes, broad to small, each let dry before the next is decided. For each
//     layer the painter compares the dried paper with the subject; the places still too light,
//     smoothed into shapes (as a painter sees them, not pixel by pixel) and split by hue, are
//     the washes. Each wash is one mix, chosen for where it lands, flooded over its shape and
//     graded as it goes (more pigment where the shape must go darker); then the water does what
//     water does. Each layer aims short of the subject (60 %, 85 %, then all the way), because
//     a wash cannot be undone and the next can always go further.
// (Thousands of small strokes, tried first, each dried alone with its own hard edge: a
// patchwork, not a wash.)

function makeWCPainter(Bs, C, PG, o, rng) {
  const RES = o.res || 1;
  const s2d = (Bs.box[2] / Bs.w) * RES, cw = Math.round(Bs.box[2] * RES), ch = Math.round(Bs.box[3] * RES), n = cw * ch;
  const cv = new WaterCanvas(cw, ch, PG, rng, { res: RES });
  const glazer = makeGlazer(PG, o.palette === 'mono' ? 'mono' : 'colour');
  const SO = { dryRate: o.dryRate ?? 1, hold: o.hold ?? 1 };
  // the subject at paper resolution, linear
  let T = new Float32Array(n * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = sampleRGB(C, Bs, x / s2d, y / s2d), i = (y * cw + x) * 3;
    T[i] = srgbToLin(c[0]); T[i + 1] = srgbToLin(c[1]); T[i + 2] = srgbToLin(c[2]);
  }
  const l1 = [0, 0, 0], l2 = [0, 0, 0], c3 = [0, 0, 0];
  const paperL = oklab(cv.paper[0], cv.paper[1], cv.paper[2], [0, 0, 0])[0];
  // the reserved lights: where the subject is as light as the paper (softened a little, so the
  // reserves are shapes and not specks)
  const reserve = new Uint8Array(n);
  {
    const Tb0 = blur3(T, cw, ch, 2 * RES);
    for (let i = 0; i < n; i++) { oklab(Tb0[i * 3], Tb0[i * 3 + 1], Tb0[i * 3 + 2], l1); reserve[i] = l1[0] > paperL - 0.012 ? 1 : 0; }
  }
  const skyAt = (i) => {
    const x = i % cw, y = (i - x) / cw;
    return Bs.sky[Math.min(Bs.h - 1, Math.floor(y / s2d)) * Bs.w + Math.min(Bs.w - 1, Math.floor(x / s2d))] === 1;
  };
  const W0 = o.brush * RES;
  const LAYERS = [
    { name: 'first washes', frac: 0.6, blur: 9, tol: 0.03, minArea: 500 },
    { name: 'second washes', frac: 0.85, blur: 5, tol: 0.025, minArea: 160 },
    { name: 'third washes', frac: 1, blur: 3, tol: 0.025, minArea: 50 },
    // accents only where something is clearly missing (at 0.04 a smooth sky got small washes
    // that each dried to a dot with its own dark rim)
    { name: 'accents', frac: 1, blur: 1.5, tol: Math.max(0.07, o.tol * 2), minArea: 30 },
  ];
  const stats = { strokes: 0, washes: 0, passes: [], hours: 0 };
  const steps = [];
  // 1) the sky: the paper flooded with clear water, then the sky's wash laid into the wet,
  // graded and split by hue (the water softens it; drops of colour, tried first, stayed blobs)
  steps.push({ name: 'sky: clear water', kind: 'flood', where: skyAt, depth: 0.35 });
  steps.push({ name: 'sky: wash into the wet', kind: 'washes', L: { frac: 0.6, blur: 12, tol: 0.02, minArea: 500, where: skyAt, depth: 0.25 } });
  // 2) layers of washes
  for (const L of LAYERS) steps.push({ name: L.name, kind: 'washes', L });
  let si = -1, cur = new Float32Array(n * 3), lab = new Float32Array(n * 3), pending = null, work = null;
  const grow = (R, r) => (!r ? R : !R ? r : [Math.min(R[0], r[0]), Math.min(R[1], r[1]), Math.max(R[2], r[2]), Math.max(R[3], r[3])]);

  const setSubject = (soft) => {
    const Tb = blur3(T, cw, ch, soft);
    for (let i = 0; i < n; i++) { oklab(Tb[i * 3], Tb[i * 3 + 1], Tb[i * 3 + 2], l1); lab[i * 3] = l1[0]; lab[i * 3 + 1] = l1[1]; lab[i * 3 + 2] = l1[2]; }
  };

  // the washes of a layer: the shapes still too light, by hue, each with its mix and grading
  function planWashes(L) {
    setSubject(L.blur * RES * 0.5);
    cv.renderLin(cur);
    // smoothed into shapes
    const sm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (reserve[i] || (L.where && !L.where(i))) continue;
      oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2);
      sm[i * 3] = l2[0] - lab[i * 3] > L.tol ? 1 : 0;
    }
    const S = blur3(sm, cw, ch, L.blur * RES);
    // the hue the shape is: grey, or one of six sectors
    const key = new Int8Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (reserve[i] || S[i * 3] < 0.5 || (L.where && !L.where(i))) continue;
      const a = lab[i * 3 + 1], b = lab[i * 3 + 2], chroma = Math.hypot(a, b);
      key[i] = chroma < 0.015 ? 0 : 1 + (Math.floor(((Math.atan2(b, a) + Math.PI) / (2 * Math.PI)) * 6) % 6);
    }
    // connected shapes of one hue
    const seen = new Uint8Array(n), washes = [], stack = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (key[s0] < 0 || seen[s0]) continue;
      const k = key[s0], px = [];
      stack.push(s0); seen[s0] = 1;
      while (stack.length) {
        const i = stack.pop();
        px.push(i);
        const x = i % cw;
        for (const j of [x > 0 ? i - 1 : -1, x < cw - 1 ? i + 1 : -1, i - cw, i + cw]) {
          if (j < 0 || j >= n || seen[j] || key[j] !== k) continue;
          seen[j] = 1; stack.push(j);
        }
      }
      // a small shape is worth a wash only if it is clearly too light (in a smooth sky, small
      // washes for slight shortfalls each dried to a dot with its own dark rim)
      if (px.length < L.minArea * RES * RES) continue;
      if (px.length < 1500 * RES * RES) {
        let def = 0;
        for (let k = 0; k < px.length; k += 3) { const i = px[k]; oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2); def += l2[0] - lab[i * 3]; }
        if (def / Math.ceil(px.length / 3) < 2 * L.tol) continue;
      }
      washes.push(px);
    }
    // largest first: a painter lays the big washes and works the small shapes after
    washes.sort((A, B) => B.length - A.length);
    return washes;
  }

  // lay one wash: one mix for the shape (chosen for where it lands, from the shape's mean), the
  // pigment graded pixel by pixel to reach the lightness wanted there
  function layOne(px, L) {
    let ur = 0, ug = 0, ub = 0, wl = 0, wa = 0, wb = 0, m = 0;
    const step = Math.max(1, Math.floor(px.length / 400));
    for (let k = 0; k < px.length; k += step) {
      const i = px[k];
      ur += cur[i * 3]; ug += cur[i * 3 + 1]; ub += cur[i * 3 + 2];
      oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2);
      wl += l2[0] - L.frac * Math.max(0, l2[0] - lab[i * 3]); wa += lab[i * 3 + 1]; wb += lab[i * 3 + 2]; m++;
    }
    const gl = glazer.best([wl / m, wa / m, wb / m], [ur / m, ug / m, ub / m]);
    if (!gl.mix) return null;
    const amount = new Float32Array(px.length);
    for (let k = 0; k < px.length; k++) {
      const i = px[k];
      oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2);
      const Lw = l2[0] - L.frac * Math.max(0, l2[0] - lab[i * 3]);
      c3[0] = cur[i * 3]; c3[1] = cur[i * 3 + 1]; c3[2] = cur[i * 3 + 2];
      amount[k] = Lw < l2[0] - 0.002 ? glazer.amountFor(gl.mix, Lw, c3) : 0;
    }
    stats.washes++;
    // the water of a wash: enough to flow and level, a broad wash wetter than a small accent
    const depth = L.depth ?? Math.min(0.6, 0.25 + (0.012 * Math.sqrt(px.length)) / RES);
    return layWash(cv, px, gl.mix.f, amount, depth);
  }

  // the sky's strokes (water, then colour dropped into it)
  function skyStrokes(P) {
    const r = Math.max(2, P.r * W0);
    if (!P.water) setSubject(r * 0.6);
    cv.renderLin(cur);
    const g = Math.max(2, Math.round(r * (P.space ?? (P.brush === 'flat' ? 1.8 : 1.5)))), cells = [];
    for (let y = 0; y < ch; y += g) for (let x = 0; x < cw; x += g) {
      const i = y * cw + x;
      if (reserve[i] || !P.where(i)) continue;
      if (!P.water) { oklab(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], l2); if (l2[0] - lab[i * 3] < P.tol) continue; }
      cells.push([x, y]);
    }
    if (P.water) cells.sort((A, B) => A[1] - B[1] || A[0] - B[0]);
    return { P, r, cells, at: 0, field: strokeField(Bs, r / s2d, o.smear) };
  }
  function skyOne(ps, x0, y0) {
    const { P, r } = ps;
    const i0 = y0 * cw + x0;
    const brush = new WaterBrush(r, P.brush, rng, P.brush === 'flat' ? 10 : 7);
    if (P.water) brush.charge(new Float32Array(cv.Q), P.fill);
    else {
      cv.colourAt(i0, c3);
      oklab(c3[0], c3[1], c3[2], l2);
      const want = [l2[0] - Math.max(0, l2[0] - lab[i0 * 3]) * P.frac, lab[i0 * 3 + 1], lab[i0 * 3 + 2]];
      const gl = glazer.best(want, c3);
      if (!gl.mix || gl.amount < 1e-4) return null;
      // one stroke leaves 0.18 of pigment per pixel per unit of concentration (measured)
      const conc = new Float32Array(cv.Q);
      for (let q = 0; q < cv.Q; q++) conc[q] = (gl.mix.f[q] * gl.amount) / 0.18;
      brush.charge(conc, P.fill);
    }
    const path = [[x0, y0]];
    let x = x0, y = y0, dx = 0, dy = 0;
    const fa = (xx, yy) => ps.field[Math.min(Bs.h - 1, Math.max(0, Math.floor(yy / s2d))) * Bs.w + Math.min(Bs.w - 1, Math.max(0, Math.floor(xx / s2d)))];
    for (let s = 0; s < (P.water ? 6 : 4); s++) {
      const a = mixAng(0, fa(x, y), P.water ? 0.25 : 0.6);
      let ux = Math.cos(a), uy = Math.sin(a);
      if (s === 0) { if (rng() < 0.5) { ux = -ux; uy = -uy; } }
      else if (ux * dx + uy * dy < 0) { ux = -ux; uy = -uy; }
      dx = ux; dy = uy;
      const nx = x + ux * r * 0.9, ny = y + uy * r * 0.9;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || !P.where(Math.round(ny) * cw + Math.round(nx))) break;
      x = nx; y = ny;
      path.push([x, y]);
    }
    if (path.length < 2) return null;
    const rect = layWater(cv, brush, path, { mask: (i) => !reserve[i] && P.where(i), flow: P.flow });
    stats.strokes++;
    let R = rect;
    work.simDue = (work.simDue || 0) + 3 / 60;
    while (work.simDue >= 0.5) { R = grow(R, cv.tick(0.5, SO)); work.simDue -= 0.5; }
    return R;
  }

  function next() {
    // what the last step left standing dries before the next is decided (but the sky's water
    // is not let dry before the colour is dropped into it)
    if (work && !work.flood) pending = grow(pending, cv.dryOut(SO));
    // (the paper is still wet from the clear water when the sky's wash goes in: what the
    // painter sees is the dry paper, the wet paper only darkens it a little)
    if (work) stats.passes.push(steps[si].name + ' · ' + (cv.time / 60).toFixed(1) + ' h');
    si++;
    const P = steps[si];
    if (!P) return null;
    if (P.kind === 'strokes') return { type: 'strokes', ...skyStrokes(P) };
    if (P.kind === 'flood') {
      // the paper flooded evenly with clear water, as with a large mop (laid in strokes it was
      // deeper where they overlapped, and those spots dried last, as dots)
      const px = [];
      for (let i = 0; i < n; i++) if (!reserve[i] && P.where(i)) px.push(i);
      if (px.length) pending = grow(pending, layWash(cv, px, new Float32Array(cv.Q), new Float32Array(px.length), P.depth));
      return { type: 'washes', P: { L: {} }, washes: [], at: 0, flood: true };
    }
    return { type: 'washes', P, washes: planWashes(P.L), at: 0 };
  }

  const api = {
    cv, stats, done: false, stage: 'stretching the paper',
    step(ms) {
      const t0 = performance.now();
      let R = null;
      while (performance.now() - t0 < ms) {
        const exhausted = work && (work.type === 'strokes' ? work.at >= work.cells.length : work.at >= work.washes.length);
        if (!work || exhausted) {
          work = next();
          R = grow(R, pending || [0, 0, cw, ch]);
          pending = null;
          if (!work) {
            stats.hours = cv.time / 60;
            api.done = true; api.stage = 'done';
            T = lab = cur = null;
            return [0, 0, cw, ch];
          }
          api.stage = steps[si].name + ' · ' + (cv.time / 60).toFixed(1) + ' h';
          continue;
        }
        if (work.type === 'strokes') {
          const [x, y] = work.cells[work.at++];
          R = grow(R, skyOne(work, x, y));
        } else {
          R = grow(R, layOne(work.washes[work.at++], work.P.L));
          // a wash takes a minute or two to lay; the earlier ones begin to flow meanwhile
          R = grow(R, cv.tick(1.5, SO));
        }
      }
      return R;
    },
  };
  return api;
}
