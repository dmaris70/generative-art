// 038 — the watercolour painter for a sheet of 028's scene.
//
// The watercolourist's order, from 037: paper first, then light to dark and far to near.
// The sky's values are laid as wet washes, one level after another, each round the paper the
// last one left; the land is split into depth bands (028's depth per pixel), and each band,
// farthest first, gets a body wash and then glazes for its darker values — soft-edged and wet
// far off, harder and drier near, the nearest band's bleed running the way the body moves
// (028's smear). Then the crest found and lost in rigger runs, dry brush dragged across the
// rock along its form, and the paper's tooth. The colour of every glaze is the mean of the
// pixels it is the last layer over (bridge.js colours), so the painting's values stay 028's.

const SKY_LEVELS = [228, 204, 180, 156, 132, 108, 84];
const LAND_LEVELS = [236, 210, 186, 162, 138, 114, 92, 70, 50];

// data pixel → sheet units (the picture box is the data at 2×)
function dataToSheet(Bs, P) {
  const s = Bs.box[2] / Bs.w;
  return P.map(([x, y]) => [Bs.box[0] + x * s, Bs.box[1] + y * s]);
}

// mean colour of the data pixels inside a cell-space polygon's box that pass test(i)
function meanColour(Bs, C, poly, cell, test) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const px0 = Math.max(0, Math.floor(x0 * cell)), px1 = Math.min(Bs.w - 1, Math.ceil((x1 + 1) * cell));
  const py0 = Math.max(0, Math.floor(y0 * cell)), py1 = Math.min(Bs.h - 1, Math.ceil((y1 + 1) * cell));
  const step = Math.max(1, Math.round(Math.sqrt(((px1 - px0) * (py1 - py0)) / 900)));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = py0; y <= py1; y += step) for (let x = px0; x <= px1; x += step) {
    const i = y * Bs.w + x;
    if (!test(i)) continue;
    r += C[i * 3]; g += C[i * 3 + 1]; b += C[i * 3 + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : null;
}

// one pass of corner cutting on a closed outline; vertices for which keep() is true stay put
function chaikin(P, keep = () => false) {
  const out = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i + n - 1) % n], b = P[(i + 1) % n];
    if (keep(p)) { out.push(p); continue; }
    out.push([0.75 * p[0] + 0.25 * a[0], 0.75 * p[1] + 0.25 * a[1]], [0.75 * p[0] + 0.25 * b[0], 0.75 * p[1] + 0.25 * b[1]]);
  }
  return out;
}

// a region's outline in sheet units, ready to paint: contours traced on the cell grid stop half a
// cell inside the picture, and cutting corners rounded the picture's own corners off, so paper
// showed along its edge. Vertices near the edge go just past it (the mat is laid over that) and
// keep their corners; the rest are cut twice.
function washOutline(Bs, P, cell) {
  const [x0, y0, w, h] = Bs.box, m = 1.3 * cell * (w / Bs.w), out = 3;
  const Q = dataToSheet(Bs, P.map(([x, y]) => [(x + 0.5) * cell, (y + 0.5) * cell])).map(([x, y]) => [
    x < x0 + m ? x0 - out : x > x0 + w - m ? x0 + w + out : x,
    y < y0 + m ? y0 - out : y > y0 + h - m ? y0 + h + out : y,
  ]);
  const edge = ([x, y]) => x <= x0 || x >= x0 + w || y <= y0 || y >= y0 + h;
  return chaikin(chaikin(Q, edge), edge);
}

// the cell size for regions: 4 data px (8 sheet units)
const WC_CELL = 4;
// the radius (sheet units) above which a wash's spread stops growing with its size
const SPREAD_R = 90;
// the value curve that makes up for glazes drying lighter than they are laid
const WC_GAMMA = 1.6;
// the even body laid with each wet fill, as a share of its opacity
const WC_BODY = 0.6;
// below this median tone a sheet is painted on a toned ground
const LOW_KEY = 140;

function wcSheetTasks(Bs, C, st) {
  const T = [];
  const cell = WC_CELL;
  const near = (i) => (Bs.sky[i] ? 0 : Math.min(1, Bs.nearAt / Math.max(1, Bs.depth[i])));
  // smear direction for the near washes (028's movement of the body), as a bleed angle
  const sm = Bs.smear;
  const smearAng = sm.kind === 'fall' ? Math.atan2(1, 0.25 * sm.sign) : sm.kind === 'turn' ? Math.atan2(0.15 * sm.sign, 1) : sm.kind === 'shove' ? Math.atan2(-0.35, sm.sign) : null;
  let wet = 0;
  const WET_MAX = 46;
  // the colour of a glaze is that of the pixels it is the last layer over (tone between its level
  // and the next): the mean of everything under it would be darker than its lights and bury
  // them, so a lit edge on a mid-grey slope went flat
  // p5.brush glazes dry lighter than their colour, more so in the middle values: the colour is
  // laid darker by a value curve (WC_GAMMA, measured against 028's tone) so the dried value lands
  const stepColour = (P, test, next) => {
    // no pixels in its step: the outline is the next level's too, and a glaze there would only
    // darken the rim of the next one
    const c = meanColour(Bs, C, P, cell, (i) => test(i) && Bs.tone[i] >= next);
    return c && toLum(c, 255 * Math.pow(lumOf(c) / 255, WC_GAMMA));
  };
  // one wash over a region: wet (bleeding) when big and the budget allows, else feathered
  const lay = (P, col, op, o) => {
    if (!col) return;
    // corners cut (Chaikin, twice): the outlines come off a 4-pixel grid and read as cut paper
    const poly = washOutline(Bs, P, cell);
    // both spreads grow with the size of the shape (wsoft's rings scale about its centre, and
    // p5.brush's bleed is a fraction of the shape): on a slope 400 units across a wash ran 60–90
    // units into the sky and over its own lit edge. Capped by the radius, the spread stays the
    // size a wet edge really runs, whatever the shape.
    let cx = 0, cy = 0, r = 1;
    for (const [x, y] of poly) { cx += x / poly.length; cy += y / poly.length; }
    for (const [x, y] of poly) r = Math.max(r, Math.hypot(x - cx, y - cy));
    const cap = Math.min(1, SPREAD_R / r);
    if (o.big && wet < WET_MAX) {
      wet++;
      wfill(poly, col, op, Object.assign({}, o, { bleed: (o.bleed ?? 0.15) * cap }));
      // a wet fill gathers its pigment at the edge and thins inside: on a big shape the middle
      // came out ~70 levels lighter than its rim. The body of the wash, laid evenly under the same
      // outline, carries the value across it
      wwash(poly, col, op * WC_BODY);
    } else wsoft(poly, col, op * 0.9, (o.soft ?? 0.8) * cap);
  };

  // the paper
  T.push(() => {
    noStroke();
    fill(...PAPER);
    rect(X(Bs.box[0]), Y(Bs.box[1]), Bs.box[2] * U, Bs.box[3] * U);
  });

  // a low-key sheet (the moon, a dark storm) gets a toned ground first, as a nocturne is painted:
  // one wash over the whole sheet in the colour of its lighter values, then the lights lifted
  // back out of it while it is damp. Transparent glazes on white paper alone stopped ~40 levels
  // short of 028's darks.
  const ts = [];
  for (let i = 0; i < Bs.tone.length; i += 7) ts.push(Bs.tone[i]);
  ts.sort((a, b) => a - b);
  const tq = (f) => ts[Math.min(ts.length - 1, Math.floor(f * ts.length))];
  if (tq(0.5) < LOW_KEY) T.push(() => {
    const lift = Math.min(250, tq(0.9) + 25);
    const g = meanColour(Bs, C, [[0, 0], [Bs.w / cell, Bs.h / cell]], cell, (i) => Bs.tone[i] >= tq(0.75) && Bs.tone[i] < lift);
    if (!g) return;
    const [x0, y0, w, h] = Bs.box, box = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    const col = toLum(g, 255 * Math.pow(lumOf(g) / 255, WC_GAMMA));
    wfill(box, col, 170, { bleed: 0.02, tex: 0.25 + 0.4 * WP.gran, border: 0.05 });
    wwash(box, col, 170 * WC_BODY);
    const test = (i) => Bs.tone[i] >= lift;
    const M = blurMask(cellMask(Bs, cell, test), 1);
    for (const R of regionPolys(M.m, M.gw, M.gh, { minArea: 2, minHole: 4, eps: 0.6 })) {
      const c = meanColour(Bs, C, R.P, cell, test);
      if (!c) continue;
      const poly = washOutline(Bs, R.P, cell);
      wsoft(poly, mixRGB(PAPER, c, 0.4), 235, 0.5);
    }
  });

  // --- the sky, wet into wet, light to dark ---
  T.push(() => {
    SKY_LEVELS.forEach((L, li) => {
      const test = (i) => Bs.sky[i] && Bs.tone[i] < L;
      const M = blurMask(cellMask(Bs, cell, test), 2);
      for (const R of regionPolys(M.m, M.gw, M.gh, { minArea: 10, minHole: 6, eps: 0.9 })) {
        const col = stepColour(R.P, test, SKY_LEVELS[li + 1] ?? 0);
        lay(R.P, col && shadeRGB(col, 0.94), li === 0 ? 170 : 160, { big: R.a > 60, bleed: 0.3 + 0.25 * WP.wet, dir: 'out', tex: 0.2 + 0.4 * WP.gran, border: 0.08 + 0.2 * WP.back, soft: 1.4 });
      }
    });
  });

  // --- the land, in depth bands, farthest first ---
  const ds = [];
  for (let i = 0; i < Bs.depth.length; i += 5) if (!Bs.sky[i]) ds.push(Bs.depth[i]);
  ds.sort((a, b) => a - b);
  const q = (f) => (ds.length ? ds[Math.min(ds.length - 1, Math.floor(f * ds.length))] : 1);
  const edges = [0, q(0.3), q(0.55), q(0.8), Infinity];
  for (let b = 3; b >= 0; b--) {
    const lo = edges[b], hi = edges[b + 1], farK = b / 3; // 1 far … 0 near
    T.push(() => {
      LAND_LEVELS.forEach((L, li) => {
        const test = (i) => !Bs.sky[i] && Bs.depth[i] >= lo && Bs.depth[i] < hi && Bs.tone[i] < L;
        const M = blurMask(cellMask(Bs, cell, test), farK > 0.5 ? 2 : 1);
        for (const R of regionPolys(M.m, M.gw, M.gh, { minArea: 8, minHole: 5, eps: 0.8 })) {
          const col = stepColour(R.P, test, LAND_LEVELS[li + 1] ?? 0);
          const nearest = b === 0;
          // strong enough that the last glaze over a pixel nearly carries its own colour:
          // the values reach 028's darks (p5.brush washes come out far lighter than their opacity)
          lay(R.P, col, li === 0 ? 150 : 150 + 60 * (1 - farK), {
            big: R.a > 40 + 30 * li,
            // far: wet and soft; near: glazes on dry paper, the pigment gathered at the edge
            bleed: (0.06 + 0.3 * farK) * (0.6 + 0.8 * WP.wet) + (nearest && smearAng !== null ? 0.12 * st.smear : 0),
            dir: farK > 0.5 ? 'out' : 'in',
            ang: nearest && smearAng !== null ? smearAng : farK > 0.5 ? 0 : null,
            tex: 0.15 + 0.45 * WP.gran * (1 - farK * 0.5),
            border: (0.1 + 0.5 * (1 - farK)) * (0.4 + WP.back),
            soft: 0.5 + 1.1 * farK,
          });
        }
      });
    });
  }

  // --- the crest, found and lost: rigger runs where the land meets the sky in contrast ---
  T.push(() => {
    if (WP.rigger <= 0) return;
    let run = [];
    const flush = () => {
      if (run.length > 3) {
        const c = run[(run.length / 2) | 0][2];
        brush.set('rigger', toHex(mixRGB(c, PAPER, 0.15)), 0.35 + 0.35 * WP.rigger);
        brush.spline(dataToSheet(Bs, run).map(([x, y]) => [X(x), Y(y)]), 0.4);
      }
      run = [];
    };
    for (let x = 0; x < Bs.w; x += 2) {
      let y = 0;
      while (y < Bs.h && Bs.sky[y * Bs.w + x]) y++;
      if (y <= 1 || y >= Bs.h - 2) { flush(); continue; }
      const above = Bs.tone[(y - 2) * Bs.w + x], below = Bs.tone[Math.min(Bs.h - 1, y + 2) * Bs.w + x];
      const found = above - below > 38 && noise(x * 0.05, Bs.k * 7.1) > 0.35;
      if (found) {
        const i = Math.min(Bs.h - 1, y + 1) * Bs.w + x;
        run.push([x, y + 0.3, [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]].map((v) => v * 0.8)]);
        if (run.length > 1 && Math.abs(run[run.length - 1][1] - run[run.length - 2][1]) > 6) { const last = run.pop(); flush(); run.push(last); }
      } else flush();
    }
    flush();
  });

  // --- the form: dry brush dragged along it (across the gradient of the light) — on rock a
  //     broken dark drag, on snow a soft blue-grey shadow stroke ---
  T.push(() => {
    if (WP.dry <= 0) return;
    const n = Math.round(900 * WP.dry);
    for (let k = 0; k < n; k++) {
      const x = 2 + random(Bs.w - 4), y = 2 + random(Bs.h - 4), i = (y | 0) * Bs.w + (x | 0);
      if (Bs.sky[i] || Bs.air[i] > 0.6) continue;
      if (Bs.rock[i] < 0.6) {
        // snow: the shadow side of each ripple, a soft glaze stroke
        const gx = sampleBuf(Bs.tone, Bs, x + 2, y) - sampleBuf(Bs.tone, Bs, x - 2, y);
        const gy = sampleBuf(Bs.tone, Bs, x, y + 2) - sampleBuf(Bs.tone, Bs, x, y - 2);
        if (Math.hypot(gx, gy) < 5) continue;
        const a = Math.atan2(gy, gx) + Math.PI / 2, len = (5 + 12 * near(i)) * random(0.6, 1.4);
        const c = shadeRGB([C[i * 3], C[i * 3 + 1], C[i * 3 + 2]], 0.85);
        const P = dataToSheet(Bs, [[x - Math.cos(a) * len, y - Math.sin(a) * len], [x + Math.cos(a) * len, y + Math.sin(a) * len]]);
        const nx = -Math.sin(a), ny = Math.cos(a), ww = (1.5 + 3 * near(i)) * 2;
        wsoft([[P[0][0] + nx * ww, P[0][1] + ny * ww], [P[1][0] + nx * ww * 0.4, P[1][1] + ny * ww * 0.4], [P[1][0] - nx * ww * 0.4, P[1][1] - ny * ww * 0.4], [P[0][0] - nx * ww, P[0][1] - ny * ww]], c, 110, 0.6);
        continue;
      }
      const gx = sampleBuf(Bs.tone, Bs, x + 1.5, y) - sampleBuf(Bs.tone, Bs, x - 1.5, y);
      const gy = sampleBuf(Bs.tone, Bs, x, y + 1.5) - sampleBuf(Bs.tone, Bs, x, y - 1.5);
      if (Math.hypot(gx, gy) < 6) continue;
      const a = Math.atan2(gy, gx) + Math.PI / 2;
      const len = (4 + 10 * near(i)) * random(0.6, 1.4);
      const c = shadeRGB([C[i * 3], C[i * 3 + 1], C[i * 3 + 2]], 0.72);
      const [[ax, ay], [bx, by]] = dataToSheet(Bs, [[x - Math.cos(a) * len, y - Math.sin(a) * len], [x + Math.cos(a) * len, y + Math.sin(a) * len]]);
      wdry(c, 120 + 60 * near(i), ax, ay, bx, by, 1.2 + 2.8 * near(i));
    }
  });

  // --- the paper's tooth ---
  T.push(() => {
    const g = WP.tooth;
    strokeWeight(Math.max(1, 1.1 * U));
    for (const dark of [true, false]) {
      stroke(dark ? 70 : 255, dark ? 60 : 252, dark ? 50 : 244, (dark ? 24 : 34) * g);
      beginShape(POINTS);
      for (let k = 0; k < 9000; k++) vertex(X(Bs.box[0] + random(Bs.box[2])), Y(Bs.box[1] + random(Bs.box[3])));
      endShape();
    }
    noStroke();
  });
  return T;
}
