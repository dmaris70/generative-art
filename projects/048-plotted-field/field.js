// 048 — Plotted Field: the engine. No drawing library; it returns pen strokes in millimetres.
//
// One seed is one field: ground, tufts, heights and blades are placed by world position, so
// every view of a seed looks at the same grass. A view (1 … 25) is a camera in that field. An
// instant (0 … 3599 s into the hour) fixes the wind. The moon is the only light, and light is
// where the pen lifts: a blade turned so that it would shine is left as a gap in its stroke.
//
// Hidden lines are removed front to back. Blades and ground cells are sorted by distance; each
// blade's centreline is tested against an occlusion bitmap at `grain` mm per pixel, the visible
// runs become strokes, and then the blade's body (its real width, tapering, projected) is
// stamped into the bitmap so that nothing behind it is drawn. Blades too small to read, and a
// share of the distant ones that grows with distance, are neither drawn nor occluding: the far
// field thins out into the paper — aerial recession done with the pen, not with grey.
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
  const VIEWS = 25;
  const NEAR = 0.12;                 // m
  const CELL = 1;                    // m: blades are placed per world cell, so views agree

  // ───────────────────────── hashing and noise ─────────────────────────
  function ihash(x) {
    x = x >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0;
  }
  const cellHash = (ix, iz, s) => ihash((Math.imul(ix | 0, 0x9e3779b9) ^ Math.imul(iz | 0, 0x85ebca6b) ^ s) >>> 0);
  const u01 = (h) => h / 4294967296;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
  function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
    const a = u01(cellHash(ix, iz, s)), b = u01(cellHash(ix + 1, iz, s));
    const c = u01(cellHash(ix, iz + 1, s)), d = u01(cellHash(ix + 1, iz + 1, s));
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  // ───────────────────────── the field (depends on the seed only) ─────────────────────────
  function createWorld(seed) {
    const s = seed >>> 0, r = mulberry32(ihash(s ^ 0x5bd1e995));
    const ph = Array.from({ length: 6 }, () => r() * TAU);
    const sN = ihash(s ^ 0x27d4eb2f), sM = ihash(s ^ 0x165667b1), sC = ihash(s ^ 0xc2b2ae35);
    const windAz = r() * TAU;

    function ground(x, z) {           // m; gentle, never a cliff
      return 0.9 * Math.sin(x * 0.052 + ph[0]) * Math.cos(z * 0.047 + ph[1])
        + 0.45 * Math.sin(x * 0.11 - z * 0.083 + ph[2])
        + 0.5 * (vnoise(x * 0.18, z * 0.18, sN) - 0.5);
    }
    // the meadow: where the grass is tall, where it is short, where it is thin
    function meadow(x, z) {
      const n = 0.6 * vnoise(x * 0.06, z * 0.06, sM) + 0.4 * vnoise(x * 0.17, z * 0.17, sM ^ 0x9e37);
      return { height: 0.18 + 1.0 * smoothstep(0.25, 0.8, n), density: 0.35 + 0.65 * smoothstep(0.15, 0.6, vnoise(x * 0.09 + 40, z * 0.09 - 17, sM)) };
    }
    // tufts: blades of one tuft share a centre, a stature and lean away from the centre
    function tuft(x, z) {
      const cs = 0.85, px = x / cs, pz = z / cs, bx = Math.floor(px), bz = Math.floor(pz);
      let best = 1e9, second = 1e9, cx = 0, cz = 0, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const h = cellHash(bx + i, bz + j, sC);
        const qx = bx + i + (h & 0xffff) / 65535, qz = bz + j + (h >>> 16) / 65535;
        const dd = (px - qx) ** 2 + (pz - qz) ** 2;
        if (dd < best) { second = best; best = dd; cx = qx; cz = qz; id = u01(ihash(h)); } else if (dd < second) second = dd;
      }
      return { cx: cx * cs, cz: cz * cs, stature: 0.55 + 0.7 * id, core: smoothstep(0, 0.35, Math.sqrt(second) - Math.sqrt(best)) };
    }
    // wind at an instant: bands of gust crossing the field along the mean direction
    function wind(x, z, t, strength, turn) {
      const a = windAz + turn, wx = Math.cos(a), wz = Math.sin(a);
      const along = x * wx + z * wz, warp = 2.2 * vnoise(x * 0.07, z * 0.07, sN ^ 0x3c6ef372);
      const gust = 0.5 + 0.5 * Math.sin(along * 0.33 - t * 1.25 + warp);
      return { x: wx, z: wz, amount: strength * (0.25 + 0.75 * gust * gust) };
    }
    return { seed: s, ground, meadow, tuft, wind, windAz };
  }

  // ───────────────────────── the 25 views of a field ─────────────────────────
  // Around the field's centre, each from its own side, height and inclination. Heights are spread
  // logarithmically from lying in the grass to standing on a roof.
  function camera(seed, view, world) {
    const k = clamp(view | 0, 1, VIEWS), r = mulberry32(ihash((seed >>> 0) ^ Math.imul(k, 0x9e3779b9)));
    const az = (k - 1) / VIEWS * TAU + (r() - 0.5) * 0.18;
    const dist = 4 + r() * 16;
    const ex = Math.cos(az) * dist, ez = Math.sin(az) * dist;
    const height = 0.3 * Math.pow(9 / 0.3, ((k * 7) % VIEWS) / (VIEWS - 1)) * (0.9 + 0.2 * r());
    const heading = Math.atan2(-ez, -ex) + (r() - 0.5) * 0.7;      // toward the centre, give or take
    const lookAt = 3 + r() * 14;                                   // where the eye meets the ground
    const pitch = -Math.atan2(height, lookAt) * (0.6 + 0.5 * r());
    return { view: k, eye: [ex, world.ground(ex, ez) + height, ez], height, heading, pitch };
  }

  function basis(cam) {
    const ch = Math.cos(cam.heading), sh = Math.sin(cam.heading), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const f = [ch * cp, sp, sh * cp], rt = [-sh, 0, ch];
    const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    return { f, rt, up };
  }

  // ───────────────────────── occlusion bitmap ─────────────────────────
  function createMask(w, h) {
    const m = new Uint8Array(w * h);
    function disc(x, y, rad) {          // a filled square of half-size rad (px); cheap and enough
      const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(w - 1, Math.ceil(x + rad));
      const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(h - 1, Math.ceil(y + rad));
      for (let yy = y0; yy <= y1; yy++) { const o = yy * w; for (let xx = x0; xx <= x1; xx++) m[o + xx] = 1; }
    }
    function tri(ax, ay, bx, by, cx, cy) {
      if (ay > by) [ax, ay, bx, by] = [bx, by, ax, ay];
      if (ay > cy) [ax, ay, cx, cy] = [cx, cy, ax, ay];
      if (by > cy) [bx, by, cx, cy] = [cx, cy, bx, by];
      const y0 = Math.max(0, Math.ceil(ay)), y1 = Math.min(h - 1, Math.floor(cy));
      for (let y = y0; y <= y1; y++) {
        const xl = cy === ay ? ax : ax + (cx - ax) * (y - ay) / (cy - ay);
        const xr = y < by ? (by === ay ? bx : ax + (bx - ax) * (y - ay) / (by - ay)) : (cy === by ? bx : bx + (cx - bx) * (y - by) / (cy - by));
        const a = Math.max(0, Math.ceil(Math.min(xl, xr))), b = Math.min(w - 1, Math.floor(Math.max(xl, xr)));
        const o = y * w;
        for (let x = a; x <= b; x++) m[o + x] = 1;
      }
    }
    const seen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[(y | 0) * w + (x | 0)] === 0;
    return { disc, tri, seen, data: m };
  }

  // ───────────────────────── build one sheet ─────────────────────────
  const DEFAULTS = {
    seed: 1, view: 1, instant: 1200, wind: 0.6, windTurn: 0,
    sheet: 'A3', fov: 55, density: 220, far: 45, body: 1.6, cutoff: 1.4, light: 0.35, moon: 40, moonHeight: 25,
    grain: 0.2, minRun: 0.35, ground: 1, haze: 6, hazeLength: 16,
  };

  function build(options) {
    const o = Object.assign({}, DEFAULTS, options);
    const t0 = Date.now();
    const world = createWorld(o.seed), cam = camera(o.seed, o.view, world), B = basis(cam);
    const [SW, SH] = SHEETS[o.sheet] || SHEETS.A3;
    const margin = Math.round(SW * 0.055), bottom = Math.round(SW * 0.085);
    const frame = { x: margin, y: margin, w: SW - 2 * margin, h: SH - margin - bottom };
    const F = (frame.w / 2) / Math.tan(o.fov * Math.PI / 360);     // mm on paper per unit tangent
    const grain = o.grain, MW = Math.ceil(frame.w / grain), MH = Math.ceil(frame.h / grain);
    const mask = createMask(MW, MH);
    const E = cam.eye;
    const rnd = mulberry32(ihash(world.seed ^ Math.imul(cam.view, 0x632be5ab) ^ (o.instant * 1000 | 0)));

    // camera space → paper (mm, relative to the frame) and depth
    const P = new Float64Array(3);
    function project(x, y, z) {
      const dx = x - E[0], dy = y - E[1], dz = z - E[2];
      const zc = dx * B.f[0] + dy * B.f[1] + dz * B.f[2];
      if (zc < NEAR) return false;
      P[0] = frame.w / 2 + F * (dx * B.rt[0] + dy * B.rt[1] + dz * B.rt[2]) / zc;
      P[1] = frame.h / 2 - F * (dx * B.up[0] + dy * B.up[1] + dz * B.up[2]) / zc;
      P[2] = zc; return true;
    }

    // moon: azimuth relative to the view, so "moon 0°" is always behind the viewer's right shoulder
    const ma = cam.heading + Math.PI + o.moon * Math.PI / 180, me = o.moonHeight * Math.PI / 180;
    const M = [Math.cos(me) * Math.cos(ma), Math.sin(me), Math.cos(me) * Math.sin(ma)];

    // ── plant: every world cell inside the view's wedge, out to `far`
    const far = o.far;
    const blades = [];                 // [depth, x0,y0,z0, x1,y1,z1, x2,y2,z2, width]
    const cells = [];                  // ground cells: [depth, ix, iz]
    const ix0 = Math.floor((E[0] - far) / CELL), ix1 = Math.floor((E[0] + far) / CELL);
    const iz0 = Math.floor((E[2] - far) / CELL), iz1 = Math.floor((E[2] + far) / CELL);
    let planted = 0;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const cx = (ix + 0.5) * CELL - E[0], cz = (iz + 0.5) * CELL - E[2], d = Math.hypot(cx, cz);
      if (d > far + 1) continue;
      // in view if the cell's centre, at the ground or at tall-grass height, lands near the frame
      if (d > 1.5) {
        const gx = (ix + 0.5) * CELL, gz = (iz + 0.5) * CELL, gy = world.ground(gx, gz);
        let inside = false;
        for (const lift of [0, 1.3]) {
          if (project(gx, gy + lift, gz) && P[0] > -0.25 * frame.w && P[0] < 1.25 * frame.w && P[1] > -0.25 * frame.h && P[1] < 1.4 * frame.h) { inside = true; break; }
        }
        if (!inside) continue;
      }
      cells.push(ix, iz);
      const hc = cellHash(ix, iz, world.seed ^ 0xa511e9b3), cr = mulberry32(hc);
      const mc = world.meadow((ix + 0.5) * CELL, (iz + 0.5) * CELL);
      const n = Math.round(o.density * CELL * CELL * mc.density * (0.85 + 0.3 * cr()));
      for (let b = 0; b < n; b++) {
        const x = (ix + cr()) * CELL, z = (iz + cr()) * CELL;
        const r1 = cr(), r2 = cr(), r3 = cr(), r4 = cr();     // drawn in a fixed order: views agree
        planted++;
        const m = world.meadow(x, z), tf = world.tuft(x, z);
        const L = m.height * tf.stature * (0.7 + 0.6 * r1) * (0.55 + 0.45 * tf.core);
        if (L < 0.04) continue;
        // lean: away from the tuft's centre, plus a little of the blade's own, plus the wind
        let ax = x - tf.cx, az = z - tf.cz; const al = Math.hypot(ax, az) || 1;
        const own = r2 * TAU; ax = ax / al * 0.8 + Math.cos(own) * 0.5; az = az / al * 0.8 + Math.sin(own) * 0.5;
        const w = world.wind(x, z, o.instant, o.wind, o.windTurn * Math.PI / 180);
        const lean = 0.18 + 0.32 * r3;
        let dx = ax * lean + w.x * w.amount * 1.1, dz = az * lean + w.z * w.amount * 1.1;
        const dl = Math.hypot(dx, dz) || 1, bend = clamp(dl, 0, 1.15);
        dx /= dl; dz /= dl;
        const th = bend * 1.1, y = world.ground(x, z);
        const tipX = x + dx * L * Math.sin(th), tipZ = z + dz * L * Math.sin(th), tipY = y + L * Math.cos(th) * (0.95 - 0.1 * r4);
        const cxp = x + dx * L * Math.sin(th) * 0.12, czp = z + dz * L * Math.sin(th) * 0.12, cyp = y + L * 0.62;
        const dep = (x - E[0]) * B.f[0] + (y - E[1]) * B.f[1] + (z - E[2]) * B.f[2];
        if (dep < NEAR) continue;
        blades.push([dep, x, y, z, cxp, cyp, czp, tipX, tipY, tipZ, 0.004 + 0.004 * r4]);
      }
    }
    blades.sort((a, b) => a[0] - b[0]);

    // ground cells occlude too (a rise hides what is behind it). Each is stamped after the
    // blades rooted on it: its key is its farthest corner.
    const ground = [];
    for (let i = 0; i < cells.length; i += 2) {
      const ix = cells[i], iz = cells[i + 1], q = [];
      let ok = true, dmax = 0;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const x = (ix + u) * CELL, z = (iz + v) * CELL;
        if (!project(x, world.ground(x, z), z)) { ok = false; break; }
        q.push(P[0] / grain, P[1] / grain); dmax = Math.max(dmax, P[2]);
      }
      if (ok) ground.push([dmax + 0.02, q]);
    }
    ground.sort((a, b) => a[0] - b[0]);

    // ── draw, front to back
    const strokes = [];
    let gi = 0, drawn = 0, ink = 0, culled = 0;
    const pts = new Float64Array(3 * 30), tan = new Float64Array(3 * 30);
    for (const bl of blades) {
      while (o.ground && gi < ground.length && ground[gi][0] < bl[0]) {
        const q = ground[gi++][1];
        mask.tri(q[0], q[1], q[2], q[3], q[4], q[5]); mask.tri(q[0], q[1], q[4], q[5], q[6], q[7]);
      }
      // projected size decides detail, and whether it is drawn at all
      if (!project(bl[1], bl[2], bl[3])) continue;
      const ax = P[0], ay = P[1], zc = P[2];
      if (!project(bl[7], bl[8], bl[9])) continue;
      const size = Math.hypot(P[0] - ax, P[1] - ay);
      // aerial recession, drawn: past `haze` metres the field thins out exponentially into the paper
      // (haze/zc)² first holds the marks per square millimetre of paper constant with distance,
      // then the exponential lets them go.
      const keep = smoothstep(o.cutoff * 0.5, o.cutoff * 1.5, size)
        * (zc > o.haze ? (o.haze / zc) ** 2 * Math.exp(-(zc - o.haze) / o.hazeLength) : 1);
      if (keep <= 0 || rnd() > keep) { culled++; continue; }
      if (Math.max(ax, P[0]) < -2 || Math.min(ax, P[0]) > frame.w + 2 || Math.max(ay, P[1]) < -2 || Math.min(ay, P[1]) > frame.h + 2) {
        // maybe the curve enters the frame through its middle; the control point bounds it
        if (!project(bl[4], bl[5], bl[6])) continue;
        const xs = [ax, P[0]], ys = [ay, P[1]];
        project(bl[7], bl[8], bl[9]); xs.push(P[0]); ys.push(P[1]);
        if (Math.max(...xs) < 0 || Math.min(...xs) > frame.w || Math.max(...ys) < 0 || Math.min(...ys) > frame.h) continue;
      }
      const n = clamp(Math.ceil(size / 1.2), 2, 28);
      let ok = true;
      for (let i = 0; i <= n; i++) {
        const t = i / n, s = 1 - t, a = s * s, b = 2 * s * t, c = t * t;
        const x = a * bl[1] + b * bl[4] + c * bl[7], y = a * bl[2] + b * bl[5] + c * bl[8], z = a * bl[3] + b * bl[6] + c * bl[9];
        if (!project(x, y, z)) { ok = false; break; }
        pts[i * 3] = P[0]; pts[i * 3 + 1] = P[1]; pts[i * 3 + 2] = P[2];
        // world tangent, for the light
        let tx = 2 * (s * (bl[4] - bl[1]) + t * (bl[7] - bl[4])), ty = 2 * (s * (bl[5] - bl[2]) + t * (bl[8] - bl[5])), tz = 2 * (s * (bl[6] - bl[3]) + t * (bl[9] - bl[6]));
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let vx = E[0] - x, vy = E[1] - y, vz = E[2] - z; const vl = Math.hypot(vx, vy, vz) || 1;
        let hx = M[0] + vx / vl, hy = M[1] + vy / vl, hz = M[2] + vz / vl; const hl = Math.hypot(hx, hy, hz) || 1;
        const th = (tx * hx + ty * hy + tz * hz) / hl;
        tan[i] = Math.pow(Math.max(0, 1 - th * th), 24) * (0.35 + 0.65 * t);   // sheen, stronger toward the tip
      }
      if (!ok) continue;

      // visible runs: inside the frame, not covered, not lit
      const lightLimit = 1 - o.light;
      let run = null;
      const flush = () => {
        if (run && run.length >= 4) {
          let len = 0; for (let k = 2; k < run.length; k += 2) len += Math.hypot(run[k] - run[k - 2], run[k + 1] - run[k - 1]);
          if (len >= o.minRun) { strokes.push(run.map((v, k) => v + (k % 2 ? frame.y : frame.x))); ink += len; }
        }
        run = null;
      };
      for (let i = 0; i < n; i++) {
        const x0 = pts[i * 3], y0 = pts[i * 3 + 1], x1 = pts[i * 3 + 3], y1 = pts[i * 3 + 4];
        const lit0 = tan[i], lit1 = tan[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (grain * 0.7)));
        for (let k = (i === 0 ? 0 : 1); k <= steps; k++) {
          const f = k / steps, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
          const lit = o.light > 0 && lit0 + (lit1 - lit0) * f > lightLimit;
          const vis = !lit && x >= 0 && y >= 0 && x <= frame.w && y <= frame.h && mask.seen(x / grain, y / grain);
          if (vis) {
            if (!run) run = [x, y];
            else if (k === steps) run.push(x, y);
          } else if (run) { run.push(x, y); flush(); }
        }
      }
      flush();
      drawn++;

      // the body: real width, tapering to the tip, projected; thinner than a pixel → dithered
      for (let i = 0; i < n; i++) {
        const x0 = pts[i * 3] / grain, y0 = pts[i * 3 + 1] / grain, x1 = pts[i * 3 + 3] / grain, y1 = pts[i * 3 + 4] / grain;
        const t = (i + 0.5) / n, wpx = o.body * bl[10] * (1 - 0.85 * t) * F / ((pts[i * 3 + 2] + pts[i * 3 + 5]) / 2) / grain;
        if (wpx < 1 && rnd() > wpx) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.7)), rad = Math.max(0.5, wpx / 2);
        for (let k = 0; k <= steps; k++) mask.disc(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps, rad);
      }
    }

    const travel = strokes.length * 0.45;              // s per stroke: pen up, travel, pen down
    return {
      options: o, world, camera: cam, sheet: { w: SW, h: SH }, frame, strokes,
      stats: {
        planted, considered: blades.length, drawn, culled, strokes: strokes.length,
        ink: ink / 1000,                                 // m
        minutes: (ink / 25 + travel) / 60,               // at 25 mm/s drawing
        ms: Date.now() - t0,
      },
    };
  }

  // ───────────────────────── caption and SVG ─────────────────────────
  const hms = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60].map((v) => String(v).padStart(2, '0')).join(':');
  function caption(r) {
    const o = r.options, c = r.camera;
    return [
      'PLOTTED FIELD - FIELD ' + r.world.seed + ' - VIEW ' + c.view + ' OF ' + VIEWS,
      'EYE ' + c.height.toFixed(2) + ' M - ' + hms(o.instant) + ' INTO THE HOUR - ' + r.stats.strokes + ' STROKES - ' + r.stats.ink.toFixed(0) + ' M OF LINE',
    ];
  }
  function captionLines(r) {
    if (typeof global.StrokeFont === 'undefined') return [];
    const size = Math.max(2.4, r.sheet.w * 0.0075), x = r.frame.x, y = r.frame.y + r.frame.h + size * 2.2;
    return caption(r).flatMap((str, i) => global.StrokeFont.text(str, x, y + i * size * 1.9, size));
  }
  function svg(r, { pen = 0.3 } = {}) {
    const f = (v) => +v.toFixed(2);
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + r.sheet.w + 'mm" height="' + r.sheet.h + 'mm" viewBox="0 0 ' + r.sheet.w + ' ' + r.sheet.h + '">');
    out.push('<title>' + caption(r).join(' / ') + '</title>');
    out.push('<g id="grass" inkscape:groupmode="layer" inkscape:label="1 grass" fill="none" stroke="black" stroke-width="' + pen + '" stroke-linecap="round" stroke-linejoin="round">');
    for (const s of r.strokes) {
      let d = 'M' + f(s[0]) + ' ' + f(s[1]);
      for (let k = 2; k < s.length; k += 2) d += 'L' + f(s[k]) + ' ' + f(s[k + 1]);
      out.push('<path d="' + d + '"/>');
    }
    out.push('</g>');
    out.push('<g id="caption" inkscape:groupmode="layer" inkscape:label="2 caption" fill="none" stroke="black" stroke-width="' + pen + '" stroke-linecap="round" stroke-linejoin="round">');
    for (const pl of captionLines(r)) out.push('<polyline points="' + pl.map((p) => f(p.x) + ',' + f(p.y)).join(' ') + '"/>');
    out.push('</g></svg>');
    return out.join('\n');
  }

  const api = { build, svg, caption, captionLines, camera, createWorld, DEFAULTS, SHEETS, VIEWS };
  global.PlottedField = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
