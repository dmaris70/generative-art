// 039 — the constructive manner (after Cézanne's late Mont Sainte-Victoire canvases).
//
// Measured on one of them against 039's alla prima oil (see README):
//   - the strokes are distinct, flat patches: ~6× the variation of value, and ~5× that of
//     colour, inside an 8 px window — where the alla prima painter blends wet into wet;
//   - they lie in parallel groups, one direction to a group, the directions spread round the
//     compass — not following every form;
//   - colour, not light and dark, models: warm and cool turn up at every value (the correlation
//     of warmth with lightness is 0.04; in the alla prima painting 0.76);
//   - more chroma (0.043 against 0.031) from greens and a clean yellow the main palette lacks,
//     and the same colours in sky and land.
// So this painter, on the same paint (paint.js), works in patches:
//   - each layer divides the canvas into patches a few brushes wide; each patch is laid as a
//     group of parallel flat strokes in one direction (a general diagonal hatching, turned a
//     little toward the form, varied patch to patch);
//   - a patch takes the subject's value at its own scale (softened to the patch): the painting
//     is answerable for its masses, not its pixels;
//   - each stroke in it is a variant of that value warmer or cooler (ochre and orange, blue-
//     violet and green), cooler far off and warmer near, with a little play in value;
//   - from a palette of few piles reused loosely, so the same colours recur everywhere;
//   - lean and thin, with little pickup, and each layer let dry before the next, so strokes
//     stay strokes; later layers only where the masses are still wrong;
//   - then the drawing: broken blue-violet lines along the strongest edges, restated.

function makeConstructivePainter(Bs, C, PG, pal, o, rng) {
  const RES = o.res || 1;
  const s2d = (Bs.box[2] / Bs.w) * RES, cw = Math.round(Bs.box[2] * RES), ch = Math.round(Bs.box[3] * RES), n = cw * ch, P = PG.length;
  const cv = new PaintCanvas(cw, ch, PG, rng, { res: RES, dryMul: o.dryRate });
  let T = new Float32Array(n * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = sampleRGB(C, Bs, x / s2d, y / s2d), i = (y * cw + x) * 3;
    T[i] = srgbToLin(c[0]); T[i + 1] = srgbToLin(c[1]); T[i + 2] = srgbToLin(c[2]);
  }
  // a white-primed canvas, as he painted on (no toned ground)
  cv.ground([240, 236, 226]);
  const W0 = o.brush * RES, MOD = o.modulation ?? 1;
  const stats = { strokes: 0, patches: 0, outlines: 0, reloads: 0, pilesFresh: 0, pilesDerived: 0, pilesReused: 0, contaminated: 0, sessions: [], hours: 0 };
  const mixer = makeMixer(PG, pal, rng, stats, { reuse: 0.03, max: 12 });
  // load: the second and third layers of patches are laid again, once per round (1 = three
  // layers; up to 3), each round finer in what it corrects and a little fatter
  const LOAD = Math.max(1, Math.round(o.load || 1));
  const LAYERS = [{ name: 'first patches', w: 2.6, patch: 4.5, rate: 0.7, fat: 0.1, tol: 0, push: 0 }];
  for (let k = 0; k < LOAD; k++) {
    const tk = Math.pow(0.6, k), tag = LOAD > 1 ? ' ' + (k + 1) : '';
    LAYERS.push(
      { name: 'second patches' + tag, w: 1.9, patch: 4, rate: 0.7, fat: 0.2 + 0.05 * k, tol: o.tol * 1.2 * tk, push: 0.5 },
      { name: 'third patches' + tag, w: 1.4, patch: 3.5, rate: 0.65, fat: 0.3 + 0.05 * k, tol: o.tol * 1.5 * tk, push: 0.5 },
    );
  }
  const l1 = [0, 0, 0], l2 = [0, 0, 0], c3 = [0, 0, 0];
  const dataAt = (x, y) => Math.min(Bs.h - 1, Math.max(0, Math.floor(y / s2d))) * Bs.w + Math.min(Bs.w - 1, Math.max(0, Math.floor(x / s2d)));
  // the general hatching: a diagonal for the whole canvas, its sense set by the seed
  const hatch = (rng() < 0.5 ? 1 : -1) * (0.55 + 0.25 * rng());
  // warm and cool directions in OKLab's a, b (ochre, orange; blue-violet, green)
  const WARM = [[0.01, 0.1], [0.06, 0.08]], COOL = [[0.02, -0.09], [-0.08, 0.02]];
  const norm2 = (v) => { const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; };
  let li = -1, work = null, pending = null;
  const grow = (R, r) => (!r ? R : !R ? r : [Math.min(R[0], r[0]), Math.min(R[1], r[1]), Math.max(R[2], r[2]), Math.max(R[3], r[3])]);

  function planLayer(L) {
    const w = Math.max(3, L.w * W0), S = Math.max(8, L.patch * w);
    // the subject and the canvas softened to the patch: what a patch answers for
    const Tb = blur3(T, cw, ch, S * 0.35);
    const cur = cv.renderLin(new Float32Array(n * 3));
    const Cb = blur3(cur, cw, ch, S * 0.35);
    const field = strokeField(Bs, w / s2d, o.smear);
    const patches = [];
    for (let gy = 0; gy < ch + S; gy += S) for (let gx = 0; gx < cw + S; gx += S) {
      const x = Math.min(cw - 1, Math.max(0, gx + (rng() - 0.5) * S * 0.6)), y = Math.min(ch - 1, Math.max(0, gy + (rng() - 0.5) * S * 0.6));
      const i = Math.round(y) * cw + Math.round(x);
      oklab(Tb[i * 3], Tb[i * 3 + 1], Tb[i * 3 + 2], l1);
      oklab(Cb[i * 3], Cb[i * 3 + 1], Cb[i * 3 + 2], l2);
      const err = Math.abs(l1[0] - l2[0]) + 0.5 * Math.hypot(l1[1] - l2[1], l1[2] - l2[2]);
      if (err <= L.tol) continue;
      patches.push({ x, y, L: l1[0], a: l1[1], b: l1[2], Lc: l2[0], j: dataAt(x, y) });
    }
    // patches in random order: a painter works all over the canvas at once
    for (let k = patches.length - 1; k > 0; k--) { const q = Math.floor(rng() * (k + 1)); [patches[k], patches[q]] = [patches[q], patches[k]]; }
    return { L, w, S, patches, at: 0, field };
  }

  // the colour of one brushload: the patch's value (pushed past it where the canvas is off), its
  // hue turned warm or cool, a little play in value
  function patchColour(pt, L) {
    const d = Bs.depth[pt.j], sky = Bs.sky[pt.j];
    const near = sky ? 0 : Math.min(1, Bs.nearAt / Math.max(1, d)), far = sky ? 0.7 : Math.min(1, Bs.air[pt.j] * 1.4);
    const pw = 0.25 + 0.25 * near - 0.15 * far, pc = 0.25 + 0.2 * far;
    const u = rng();
    let dir = null;
    if (u < pw) dir = WARM[rng() < 0.5 ? 0 : 1];
    else if (u < pw + pc) dir = COOL[rng() < 0.7 ? 0 : 1];
    // the turn is smaller in the lights, where a little chroma already shows (and paint has less room)
    const m = 0.04 * MOD * (0.6 + 0.8 * rng()) * Math.min(1, 1.25 - 0.75 * pt.L);
    const v = dir ? norm2(dir) : [0, 0];
    const Lw = pt.L + Math.max(-0.06, Math.min(0.06, L.push * (pt.L - pt.Lc))) + (rng() - 0.5) * 0.12;
    return [Math.min(0.98, Math.max(0.08, Lw)), pt.a + v[0] * m, pt.b + v[1] * m];
  }

  // one patch: a group of parallel flat strokes in one direction
  function paintPatch(ps, pt) {
    const { L, w, S, field } = ps;
    // the direction: the general hatching, turned a little toward the form, varied
    const form = field[pt.j];
    const u = rng(), fam = u < 0.3 ? hatch : u < 0.5 ? hatch + Math.PI / 2 : u < 0.7 ? Math.PI / 2 : 0;
    const a = mixAng(fam, form, 0.2) + (rng() - 0.5) * 0.5;
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const half = S * (0.6 + 0.2 * rng());
    const k = Math.max(2, Math.round((2 * half) / (w * 0.75)));
    // one brushload for the patch, now and then a second one worked into it; each stroke takes
    // up only a little more or less of it
    const loads = [];
    const load = () => {
      const want = patchColour(pt, L);
      oklabToLin(want[0], want[1], want[2], c3);
      const got = mixer.get(want, [Math.min(1, Math.max(0.002, c3[0])), Math.min(1, Math.max(0.002, c3[1])), Math.min(1, Math.max(0.002, c3[2]))]);
      cv.time += got.minutes;
      loads.push(got.pile);
      return got.pile;
    };
    load();
    if (rng() < 0.35) load();
    let R = null;
    for (let s = 0; s < k; s++) {
      const t = -half + ((s + 0.5) * 2 * half) / k + (rng() - 0.5) * w * 0.25;
      const len = 2 * half * (0.75 + 0.35 * rng()), off = (rng() - 0.5) * half * 0.3;
      const cx = pt.x + nx * t + ux * off, cy = pt.y + ny * t + uy * off;
      const pile = loads.length > 1 && rng() < 0.3 ? loads[1] : loads[0];
      const brush = new Brush(w, P, rng, { rate: L.rate, reach: 8, kind: 'flat' });
      const f = new Float32Array(P);
      for (let p = 1; p < P; p++) f[p] = pile.f[p];
      f[0] = 0.1; // a little thinned: lean, matte, still covering
      brush.reload(f, o.streak);
      stats.reloads++;
      cv.time += 0.05;
      const path = [[cx - (ux * len) / 2, cy - (uy * len) / 2], [cx + (ux * len) / 2, cy + (uy * len) / 2]];
      R = grow(R, layStroke(cv, brush, path, { pressure: 0.85 + 0.15 * rng(), pick: 0.05, dry: o.dryBrush, fat: L.fat, minutes: (0.4 + len / (250 * RES)) / 60 }));
      stats.strokes++;
    }
    stats.patches++;
    return R;
  }

  // the drawing: broken blue-violet lines along the strongest edges of the subject, restated
  function outlines() {
    if (!(o.outlines > 0)) return null;
    const Ls = new Float32Array(n);
    const Tb = blur3(T, cw, ch, 4 * RES);
    for (let i = 0; i < n; i++) { oklab(Tb[i * 3], Tb[i * 3 + 1], Tb[i * 3 + 2], l1); Ls[i] = l1[0]; }
    const grad = (x, y) => {
      const i = y * cw + x, xl = x > 1 ? i - 2 : i, xr = x < cw - 2 ? i + 2 : i, yu = y > 1 ? i - 2 * cw : i, yd = y < ch - 2 ? i + 2 * cw : i;
      return [(Ls[xr] - Ls[xl]) / 4, (Ls[yd] - Ls[yu]) / 4];
    };
    const mags = [];
    for (let y = 2; y < ch - 2; y += 4) for (let x = 2; x < cw - 2; x += 4) { const g = grad(x, y); mags.push(Math.hypot(g[0], g[1])); }
    mags.sort((a, b) => a - b);
    // the silhouette against the sky at a working threshold; elsewhere only the very strongest
    const thrS = Math.max(0.004 / RES, mags[Math.floor(0.9 * (mags.length - 1))]);
    const thrL = Math.max(0.012 / RES, mags[Math.floor(0.99 * (mags.length - 1))]);
    const skyAt = (x, y) => Bs.sky[dataAt(x, y)];
    const w = Math.max(2, 0.45 * W0), cell = Math.round(14 * RES);
    let R = null;
    for (let gy = cell; gy < ch - cell; gy += cell) for (let gx = cell; gx < cw - cell; gx += cell) {
      // the strongest edge in the cell
      let bm = 0, bx = 0, by = 0;
      for (let y = gy; y < gy + cell; y += 2) for (let x = gx; x < gx + cell; x += 2) { const g = grad(x, y), m = Math.hypot(g[0], g[1]); if (m > bm) { bm = m; bx = x; by = y; } }
      const rim = skyAt(gx, gy) !== skyAt(gx + cell, gy + cell) || skyAt(gx + cell, gy) !== skyAt(gx, gy + cell);
      const thr = rim ? thrS : thrL;
      if (bm < thr || rng() < 0.3 * (1 - o.outlines)) continue;
      // along the edge both ways while it holds
      const pts = [[bx, by]];
      for (const sg of [1, -1]) {
        let x = bx, y = by;
        for (let s = 0; s < 6; s++) {
          const g = grad(Math.round(x), Math.round(y)), m = Math.hypot(g[0], g[1]);
          if (m < thr * 0.6) break;
          x += (sg * -g[1] / m) * 5 * RES; y += (sg * g[0] / m) * 5 * RES;
          if (x < 2 || y < 2 || x >= cw - 2 || y >= ch - 2) break;
          if (sg > 0) pts.push([x, y]); else pts.unshift([x, y]);
        }
      }
      if (pts.length < (rim ? 3 : 5)) continue;
      // a contour, not a ring: the traced line must run nearly straight (no point further from
      // the chord than 0.15 of it; a small spot's rim, traced half by one cell and half by the
      // next, would draw a loop) and long enough that the brush settles into it
      const [ax, ay] = pts[0], cx = pts[pts.length - 1][0] - ax, cy = pts[pts.length - 1][1] - ay, chord = Math.hypot(cx, cy);
      let bow = 0;
      for (const [qx, qy] of pts) bow = Math.max(bow, Math.abs((qx - ax) * cy - (qy - ay) * cx) / (chord || 1));
      if (chord < 22 * RES || bow > 0.15 * chord) continue;
      // dark blue-violet, darker than what it divides
      const i = by * cw + bx;
      const want = [Math.max(0.2, Math.min(0.42, Ls[i] - 0.28)), 0.025, -0.085];
      oklabToLin(want[0], want[1], want[2], c3);
      const got = mixer.get(want, [Math.max(0.002, c3[0]), Math.max(0.002, c3[1]), Math.max(0.002, c3[2])]);
      for (let rep = 0; rep < 2; rep++) {
        const sh = (rng() - 0.5) * 3 * RES, path = pts.map(([x, y]) => [x + sh * (rng() - 0.5), y + sh]);
        const brush = new Brush(w, P, rng, { rate: 0.6, reach: 3 + 3 * rng(), kind: 'round' });
        const f = new Float32Array(P);
        for (let p = 1; p < P; p++) f[p] = got.pile.f[p];
        f[0] = 0.3;
        brush.reload(f, 0.1);
        R = grow(R, layStroke(cv, brush, path, { pressure: 0.6 + 0.3 * rng(), pick: 0.05, dry: 0.75, fat: 0.35, minutes: 1 / 60 }));
        stats.outlines++;
      }
    }
    return R;
  }

  const api = {
    cv, stats, done: false, stage: 'priming',
    step(ms) {
      const t0 = performance.now();
      let R = null;
      while (performance.now() - t0 < ms) {
        if (!work || work.at >= work.patches.length) {
          if (work) {
            // the layer stands until it is dry enough to paint over without picking it up
            R = grow(R, cv.wait(6 * 60));
            stats.sessions.push(work.L.name + ' ' + stats.strokes + ' strokes, ' + (cv.time / 60).toFixed(1) + ' h');
          }
          li++;
          if (li >= LAYERS.length) {
            R = grow(R, outlines());
            stats.hours = cv.time / 60;
            if (o.age > 0) cv.age(o.age);
            api.done = true; api.stage = 'done';
            T = null;
            return [0, 0, cw, ch];
          }
          work = planLayer(LAYERS[li]);
          api.stage = LAYERS[li].name + ' · ' + (cv.time / 60).toFixed(1) + ' h';
          R = grow(R, pending || [0, 0, cw, ch]);
          pending = null;
          continue;
        }
        R = grow(R, paintPatch(work, work.patches[work.at++]));
      }
      return R;
    },
  };
  return api;
}
