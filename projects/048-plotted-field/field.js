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
  const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], W16x9: [480, 270] };   // W16x9: a screen, not a paper
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
    grain: 0.2, minRun: 0.35, ground: 1, haze: 6, hazeLength: 16, heads: 0.08,
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
    const blades = [];                 // [depth, x0,y0,z0, x1,y1,z1, x2,y2,z2, width, head hash]
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
        let L = m.height * tf.stature * (0.7 + 0.6 * r1) * (0.55 + 0.45 * tf.core);
        if (L < 0.04) continue;
        // a seed head on some of the taller blades, decided by its own hash (the cell's sequence
        // stays as it was). Its blade becomes a stalk: longer and straighter, carrying the head
        // above the leaves.
        const hh = ihash((hc ^ Math.imul(b + 1, 0x9e3779b9) ^ 0x2545f491) >>> 0);
        const head = o.heads > 0 && u01(hh) < o.heads * smoothstep(0.2, 0.7, L) ? (hh | 1) >>> 0 : 0;
        if (head) L *= 1.25 + 0.3 * u01(ihash(hh));
        // lean: away from the tuft's centre, plus a little of the blade's own, plus the wind
        let ax = x - tf.cx, az = z - tf.cz; const al = Math.hypot(ax, az) || 1;
        const own = r2 * TAU; ax = ax / al * 0.8 + Math.cos(own) * 0.5; az = az / al * 0.8 + Math.sin(own) * 0.5;
        const w = world.wind(x, z, o.instant, o.wind, o.windTurn * Math.PI / 180);
        const lean = 0.18 + 0.32 * r3;
        let dx = ax * lean + w.x * w.amount * 1.1, dz = az * lean + w.z * w.amount * 1.1;
        const dl = Math.hypot(dx, dz) || 1, bend = clamp(dl, 0, 1.15);
        dx /= dl; dz /= dl;
        const th = bend * (head ? 0.6 : 1.1), y = world.ground(x, z);
        const tipX = x + dx * L * Math.sin(th), tipZ = z + dz * L * Math.sin(th), tipY = y + L * Math.cos(th) * (0.95 - 0.1 * r4);
        const cxp = x + dx * L * Math.sin(th) * 0.12, czp = z + dz * L * Math.sin(th) * 0.12, cyp = y + L * 0.62;
        const dep = (x - E[0]) * B.f[0] + (y - E[1]) * B.f[1] + (z - E[2]) * B.f[2];
        if (dep < NEAR) continue;
        blades.push([dep, x, y, z, cxp, cyp, czp, tipX, tipY, tipZ, head ? 0.003 : 0.004 + 0.004 * r4, head]);
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
    const grass = [], heads = [];
    let gi = 0, drawn = 0, ink = 0, headInk = 0, culled = 0, headsDrawn = 0;
    const pts = new Float64Array(3 * 30), tan = new Float64Array(30), hp = new Float64Array(3 * 12);
    const lightLimit = 1 - o.light;

    // the visible runs of one projected polyline (xy at stride 3) become strokes in `out`
    function trace(xy, count, lit, out) {
      let run = null, len = 0;
      const flush = () => {
        if (run && run.length >= 4) {
          let l = 0; for (let k = 2; k < run.length; k += 2) l += Math.hypot(run[k] - run[k - 2], run[k + 1] - run[k - 1]);
          if (l >= o.minRun) { out.push(run.map((v, k) => v + (k % 2 ? frame.y : frame.x))); len += l; }
        }
        run = null;
      };
      for (let i = 0; i < count - 1; i++) {
        const x0 = xy[i * 3], y0 = xy[i * 3 + 1], x1 = xy[i * 3 + 3], y1 = xy[i * 3 + 4];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (grain * 0.7)));
        for (let k = (i === 0 ? 0 : 1); k <= steps; k++) {
          const f = k / steps, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
          const shine = lit && o.light > 0 && lit[i] + (lit[i + 1] - lit[i]) * f > lightLimit;
          const vis = !shine && x >= 0 && y >= 0 && x <= frame.w && y <= frame.h && mask.seen(x / grain, y / grain);
          if (vis) {
            if (!run) run = [x, y];
            else if (k === steps) run.push(x, y);
          } else if (run) { run.push(x, y); flush(); }
        }
      }
      flush();
      return len;
    }
    // a body of world width w (tapering by `taper` toward the end) into the occlusion bitmap
    function stamp(xyz, count, w, taper) {
      for (let i = 0; i < count - 1; i++) {
        const x0 = xyz[i * 3] / grain, y0 = xyz[i * 3 + 1] / grain, x1 = xyz[i * 3 + 3] / grain, y1 = xyz[i * 3 + 4] / grain;
        const t = (i + 0.5) / (count - 1), wpx = o.body * w * (1 - taper * t) * F / ((xyz[i * 3 + 2] + xyz[i * 3 + 5]) / 2) / grain;
        if (wpx < 1 && rnd() > wpx) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.7)), rad = Math.max(0.5, wpx / 2);
        for (let k = 0; k <= steps; k++) mask.disc(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps, rad);
      }
    }
    // project a world polyline (flat x,y,z) into `buf`; false if any point is behind the eye
    function projectLine(line, buf) {
      for (let i = 0; i < line.length / 3; i++) {
        if (!project(line[i * 3], line[i * 3 + 1], line[i * 3 + 2])) return false;
        buf[i * 3] = P[0]; buf[i * 3 + 1] = P[1]; buf[i * 3 + 2] = P[2];
      }
      return true;
    }

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
      // aerial recession, drawn: (haze/zc)² first holds the marks per square millimetre of paper
      // constant with distance, then the exponential lets them go
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
        const vx = E[0] - x, vy = E[1] - y, vz = E[2] - z, vl = Math.hypot(vx, vy, vz) || 1;
        const hx = M[0] + vx / vl, hy = M[1] + vy / vl, hz = M[2] + vz / vl, hl = Math.hypot(hx, hy, hz) || 1;
        const th = (tx * hx + ty * hy + tz * hz) / hl;
        tan[i] = Math.pow(Math.max(0, 1 - th * th), 24) * (0.35 + 0.65 * t);   // sheen, stronger toward the tip
      }
      if (!ok) continue;

      // the seed head, if this blade carries one: traced before anything of this blade is stamped
      const lines = bl[11] ? headLines(bl) : null, projected = [];
      if (lines && size > 1.5) {
        for (const line of lines) {
          const buf = new Float64Array(line.length);
          if (!projectLine(line, buf)) { projected.length = 0; break; }
          projected.push(buf);
        }
      }
      ink += trace(pts, n + 1, tan, grass);
      if (projected.length) {
        const before = heads.length;
        for (const buf of projected) headInk += trace(buf, buf.length / 3, null, heads);
        if (heads.length > before) headsDrawn++;
      }
      drawn++;

      // the bodies: real width, tapering to the tip, projected; thinner than a pixel → dithered
      stamp(pts, n + 1, bl[10], 0.85);
      if (projected.length) stamp(projected[0], projected[0].length / 3, 0.006, 0.6);
    }

    // ── optional extension (059 Plotted Sky): runs after all grass is drawn, with every ground
    // cell stamped, and may add pen layers and a caption line. Without it nothing here changes.
    let extra = null;
    if (typeof o.extend === 'function') {
      while (o.ground && gi < ground.length) {
        const q = ground[gi++][1];
        mask.tri(q[0], q[1], q[2], q[3], q[4], q[5]); mask.tri(q[0], q[1], q[4], q[5], q[6], q[7]);
      }
      extra = o.extend({ options: o, world, camera: cam, basis: B, eye: E, F, frame, grain, mask, MW, MH, moon: M });
    }

    const result = { kind: 'view', options: o, world, camera: cam, sheet: { w: SW, h: SH }, frame };
    result.stats = {
      planted, considered: blades.length, drawn, culled, heads: headsDrawn,
      strokes: grass.length + heads.length, ink: (ink + headInk) / 1000,
    };
    if (extra && extra.stats) result.extra = extra.stats;
    const text = caption(result);
    if (extra && extra.title) text[0] = text[0].replace('PLOTTED FIELD', extra.title);
    if (extra && extra.caption) text.push(...extra.caption);
    const inset = insetMap(result);
    const words = captionStrokes(text, frame.x, frame.y + frame.h, SW);
    result.layers = [
      { id: 'grass', label: '1 grass', pen: 1, strokes: grass },
      { id: 'heads', label: '2 seed heads', pen: 2, strokes: heads },
      ...(extra && extra.layers ? extra.layers : []),
      { id: 'caption', label: (extra && extra.layers && extra.layers.length ? extra.layers.length + 3 : 3) + ' caption and map', pen: 1, strokes: words.concat(inset) },
    ];
    finish(result, t0);
    return result;
  }

  // ───────────────────────── seed heads ─────────────────────────
  // A spine continuing the blade's tip, upright or nodding, with spikelets alternating along it.
  // Everything is drawn from the head's own hash, so every view of the field shows the same head.
  function headLines(bl) {
    const r = mulberry32(bl[11]);
    let tx = bl[7] - bl[4], ty = bl[8] - bl[5], tz = bl[9] - bl[6];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const len = 0.09 + 0.12 * r(), nod = r() < 0.4 ? 0.5 + 0.8 * r() : 0.12 * r();
    let sx = tz, sz = -tx; const sl = Math.hypot(sx, sz);
    if (sl < 1e-4) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const N = 8, spine = new Float64Array((N + 1) * 3), at = (s) => [
      bl[7] + tx * len * s, bl[8] + ty * len * s - nod * len * s * s, bl[9] + tz * len * s,
    ];
    for (let i = 0; i <= N; i++) spine.set(at(i / N), i * 3);
    const lines = [spine], k = 5 + Math.floor(r() * 6);
    for (let j = 0; j < k; j++) {
      const s = 0.25 + 0.7 * j / Math.max(1, k - 1), q = at(s), q2 = at(Math.min(1, s + 0.05));
      let dx = q2[0] - q[0], dy = q2[1] - q[1], dz = q2[2] - q[2]; const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const side = j % 2 ? 1 : -1, l = len * (0.28 + 0.14 * r()) * (1 - 0.5 * s);
      let ex = dx * 0.55 + sx * side * 0.75, ey = dy * 0.55 + 0.15, ez = dz * 0.55 + sz * side * 0.75;
      const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      lines.push(Float64Array.of(q[0], q[1], q[2], q[0] + ex * l * 0.5, q[1] + ey * l * 0.5, q[2] + ez * l * 0.5, q[0] + ex * l, q[1] + ey * l, q[2] + ez * l));
    }
    return lines;
  }

  // ───────────────────────── the map: the field from above, and its 25 views ─────────────────────────
  const MAP_R = 24;                    // m, half the side of the mapped square around the field's centre

  function viewAim(cam, world) {       // where the view's centre line meets the ground, within reason
    const lookDist = cam.pitch < -0.02 ? cam.height / Math.tan(-cam.pitch) : 30;
    return clamp(lookDist, 2, 5);               // a wedge, not a sightline: the far field is implied
  }

  function buildMap(options) {
    const o = Object.assign({}, DEFAULTS, options);
    const t0 = Date.now();
    const world = createWorld(o.seed), cams = [];
    for (let k = 1; k <= VIEWS; k++) cams.push(camera(o.seed, k, world));
    const [SW, SH] = SHEETS[o.sheet] || SHEETS.A3;
    const margin = Math.round(SW * 0.055), bottom = Math.round(SW * 0.085);
    const frame = { x: margin, y: margin, w: SW - 2 * margin, h: SH - margin - bottom };
    const side = Math.min(frame.h, frame.w * 0.62), k = side / (2 * MAP_R);
    const box = { x: frame.x, y: frame.y, w: side, h: side };
    const X = (x) => box.x + (x + MAP_R) * k, Y = (z) => box.y + (z + MAP_R) * k;   // +z down the sheet

    // contours: marching squares on the ground, every 0.15 m, segments chained into lines
    const step = 0.3, G = Math.round(2 * MAP_R / step), hs = new Float64Array((G + 1) * (G + 1));
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const h = world.ground(-MAP_R + i * step, -MAP_R + j * step); hs[j * (G + 1) + i] = h;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    const contours = [], interval = 0.15;
    for (let level = Math.ceil(lo / interval) * interval; level < hi; level += interval) {
      const segs = [];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const a = hs[j * (G + 1) + i], b = hs[j * (G + 1) + i + 1], c = hs[(j + 1) * (G + 1) + i + 1], d = hs[(j + 1) * (G + 1) + i];
        const e = [];
        const cross = (p, q, x0, z0, x1, z1) => { if ((p < level) !== (q < level)) { const t = (level - p) / (q - p); e.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]); } };
        cross(a, b, i, j, i + 1, j); cross(b, c, i + 1, j, i + 1, j + 1); cross(c, d, i + 1, j + 1, i, j + 1); cross(d, a, i, j + 1, i, j);
        if (e.length === 2) segs.push(e);
        else if (e.length === 4) { segs.push([e[0], e[1]]); segs.push([e[2], e[3]]); }
      }
      for (const line of chain(segs)) contours.push(line.flatMap(([gx, gz]) => [X(-MAP_R + gx * step), Y(-MAP_R + gz * step)]));
    }

    // tall grass, in the second pen: the cartographer's tuft, sized by how tall the meadow grows
    const meadow = [], tr = mulberry32(ihash(world.seed ^ 0x6a09e667));
    for (let z = -MAP_R + 0.5; z < MAP_R; z += 1) for (let x = -MAP_R + 0.5; x < MAP_R; x += 1) {
      const px = x + (tr() - 0.5) * 0.7, pz = z + (tr() - 0.5) * 0.7, m = world.meadow(px, pz);
      if (m.height < 0.55 || tr() > m.density) continue;
      const s = 0.7 + 1.3 * (m.height - 0.55) / 0.65, bx = X(px), by = Y(pz);
      meadow.push([bx, by, bx, by - s], [bx, by, bx - s * 0.45, by - s * 0.8], [bx, by, bx + s * 0.45, by - s * 0.8]);
    }

    // the views: where each stands, which way it looks and how far, numbered
    const views = [];
    for (const c of cams) {
      const ex = c.eye[0], ez = c.eye[2], reach = viewAim(c, world), half = Math.atan(Math.tan(o.fov * Math.PI / 360));
      const ray = (a) => [X(ex + Math.cos(a) * reach), Y(ez + Math.sin(a) * reach)];
      const l = ray(c.heading - half), r = ray(c.heading + half);
      views.push([X(ex), Y(ez), ...l], [X(ex), Y(ez), ...r]);
      const arc = [];
      for (let i = 0; i <= 12; i++) arc.push(...ray(c.heading - half + 2 * half * i / 12));
      views.push(arc);
      views.push(circle(X(ex), Y(ez), Math.max(0.8, 0.5 + 0.35 * Math.log2(1 + c.height))));
      const away = Math.atan2(ez, ex), size = 2.6, label = String(c.view);
      const lx = X(ex) + Math.cos(away) * 4.2 - (global.StrokeFont ? global.StrokeFont.width(label, size) / 2 : 0), ly = Y(ez) + Math.sin(away) * 4.2 - size / 2;
      views.push(...textStrokes(label, lx, ly, size));
    }
    const clipped = (lines) => lines.flatMap((l) => clipLine(l, box));
    const frameLines = [[box.x, box.y, box.x + side, box.y, box.x + side, box.y + side, box.x, box.y + side, box.x, box.y]];

    // the legend: the 25 views as a table, a scale bar
    const legend = [], lx = box.x + side + Math.max(10, SW * 0.03), size = Math.max(2.2, SW * 0.0062), lineH = Math.min(size * 1.85, side / 27);
    legend.push(...textStrokes('VIEW   EYE      FACING   LOOKS DOWN', lx, box.y, size));
    cams.forEach((c, i) => {
      // compass bearing, with north up the sheet (−z)
      const deg = ((Math.atan2(Math.cos(c.heading), -Math.sin(c.heading)) * 180 / Math.PI) % 360 + 360) % 360;
      const row = String(c.view).padStart(2, ' ') + '     ' + c.height.toFixed(2).padStart(5, ' ') + ' M  ' + String(Math.round(deg)).padStart(3, ' ') + '      ' + String(Math.round(-c.pitch * 180 / Math.PI)).padStart(2, ' ');
      legend.push(...textStrokes(row, lx, box.y + (i + 1.4) * lineH, size));
    });
    const sy = box.y + side - 2, sx = lx;
    legend.push([sx, sy, sx + 5 * k, sy], [sx, sy - 1.2, sx, sy + 1.2], [sx + 5 * k, sy - 1.2, sx + 5 * k, sy + 1.2], [sx + 2.5 * k, sy - 0.7, sx + 2.5 * k, sy + 0.7]);
    legend.push(...textStrokes('5 M', sx + 5 * k + 2, sy - size / 2, size));
    legend.push(...textStrokes('CONTOURS EVERY 0.15 M', sx, sy - size * 2.4, size));
    legend.push(...textStrokes('FACING: DEGREES FROM NORTH, UP THE SHEET', sx, sy - size * 4.4, size));
    legend.push(...textStrokes('LOOKS DOWN: DEGREES BELOW LEVEL', sx, sy - size * 6.4, size));
    legend.push(...textStrokes('WEDGES: THE LENS, DRAWN TO 5 M AT MOST', sx, sy - size * 8.4, size));

    const result = { kind: 'map', options: o, world, cameras: cams, sheet: { w: SW, h: SH }, frame };
    const ground = clipped(contours).concat(frameLines), grass = clipped(meadow), marks = clipped(views);
    result.stats = { strokes: ground.length + grass.length + marks.length + legend.length, ink: 0 };
    const text = [
      'PLOTTED FIELD - FIELD ' + world.seed + ' - THE ' + VIEWS + ' VIEWS',
      'THE FIELD FROM ABOVE, ' + (2 * MAP_R) + ' BY ' + (2 * MAP_R) + ' M - EACH VIEW WHERE IT STANDS, WHICH WAY IT LOOKS, AND HOW FAR',
    ];
    result.caption = text;
    result.layers = [
      { id: 'ground', label: '1 contours', pen: 1, strokes: ground },
      { id: 'meadow', label: '2 tall grass', pen: 2, strokes: grass },
      { id: 'views', label: '3 views and legend', pen: 1, strokes: marks.concat(legend, captionStrokes(text, frame.x, frame.y + frame.h, SW)) },
    ];
    finish(result, t0);
    return result;
  }

  // a small map in the caption band of a view sheet: the 25 positions, this view's field of view
  function insetMap(r) {
    const { frame, sheet, camera: own, options: o } = r;
    const s = Math.min(30, sheet.h - (frame.y + frame.h) - 7);
    if (s < 12) return [];
    const box = { x: frame.x + frame.w - s, y: frame.y + frame.h + 5, w: s, h: s }, k = s / (2 * MAP_R);
    const X = (x) => box.x + (x + MAP_R) * k, Y = (z) => box.y + (z + MAP_R) * k;
    const out = [[box.x, box.y, box.x + s, box.y, box.x + s, box.y + s, box.x, box.y + s, box.x, box.y]];
    for (let v = 1; v <= VIEWS; v++) {
      const c = v === own.view ? own : camera(r.world.seed, v, r.world);
      out.push(circle(X(c.eye[0]), Y(c.eye[2]), v === own.view ? 0.7 : 0.3, v === own.view ? 12 : 6));
    }
    const reach = viewAim(own, r.world), half = o.fov * Math.PI / 360, ex = own.eye[0], ez = own.eye[2];
    const ray = (a) => [X(ex + Math.cos(a) * reach), Y(ez + Math.sin(a) * reach)];
    const wedge = [X(ex), Y(ez), ...ray(own.heading - half)];
    for (let i = 1; i <= 8; i++) wedge.push(...ray(own.heading - half + 2 * half * i / 8));
    wedge.push(X(ex), Y(ez));
    return out.concat(clipLine(wedge, box));
  }

  // ───────────────────────── plotting helpers ─────────────────────────
  function circle(cx, cy, r, n = 16) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(cx + r * Math.cos(TAU * i / n), cy + r * Math.sin(TAU * i / n));
    return out;
  }
  // segments [[a,b],…] with shared endpoints → polylines
  function chain(segs) {
    const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4), ends = new Map(), used = new Uint8Array(segs.length), out = [];
    segs.forEach((s, i) => { for (const p of s) { const kk = key(p); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(i); } });
    const next = (p) => (ends.get(key(p)) || []).find((i) => !used[i]);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1; const line = [segs[i][0], segs[i][1]];
      for (const dir of [1, -1]) {
        for (;;) {
          const tip = dir === 1 ? line[line.length - 1] : line[0], j = next(tip);
          if (j === undefined) break;
          used[j] = 1; const s = segs[j], far = key(s[0]) === key(tip) ? s[1] : s[0];
          if (dir === 1) line.push(far); else line.unshift(far);
        }
      }
      out.push(line);
    }
    return out;
  }
  // a flat polyline clipped to a box → zero or more flat polylines (Liang–Barsky per segment)
  function clipLine(l, b) {
    const out = []; let cur = null;
    for (let i = 0; i + 3 < l.length; i += 2) {
      let x0 = l[i], y0 = l[i + 1], x1 = l[i + 2], y1 = l[i + 3], t0 = 0, t1 = 1;
      const dx = x1 - x0, dy = y1 - y0;
      let ok = true;
      for (const [p, q] of [[-dx, x0 - b.x], [dx, b.x + b.w - x0], [-dy, y0 - b.y], [dy, b.y + b.h - y0]]) {
        if (p === 0) { if (q < 0) { ok = false; break; } continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
      if (!ok) { if (cur) { out.push(cur); cur = null; } continue; }
      const ax = x0 + dx * t0, ay = y0 + dy * t0, bx = x0 + dx * t1, by = y0 + dy * t1;
      if (!cur || t0 > 0) { if (cur) out.push(cur); cur = [ax, ay]; }
      cur.push(bx, by);
      if (t1 < 1) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter((p) => p.length >= 4);
  }
  function textStrokes(str, x, y, size) {
    if (typeof global.StrokeFont === 'undefined') return [];
    return global.StrokeFont.text(str, x, y, size).map((pl) => pl.flatMap((p) => [p.x, p.y]));
  }
  function captionStrokes(lines, x, top, sheetW) {
    const size = Math.max(2.4, sheetW * 0.0075), y = top + size * 2.2;
    return lines.flatMap((str, i) => textStrokes(str, x, y + i * size * 1.9, size));
  }
  function finish(r, t0) {
    let ink = 0, strokes = 0;
    for (const layer of r.layers) for (const s of layer.strokes) {
      strokes++;
      for (let k = 2; k < s.length; k += 2) ink += Math.hypot(s[k] - s[k - 2], s[k + 1] - s[k - 1]);
    }
    const pens = new Set(r.layers.filter((l) => l.strokes.length).map((l) => l.pen)).size;
    Object.assign(r.stats, {
      strokesAll: strokes, inkAll: ink / 1000,
      minutes: (ink / 25 + strokes * 0.45) / 60 + (pens - 1) * 3,   // 25 mm/s, 0.45 s a stroke, 3 min a pen change
      ms: Date.now() - t0,
    });
  }

  // ───────────────────────── caption and SVG ─────────────────────────
  const hms = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60].map((v) => String(v).padStart(2, '0')).join(':');
  function caption(r) {
    if (r.kind === 'map') return r.caption;
    const o = r.options, c = r.camera, s = r.stats;
    return [
      'PLOTTED FIELD - FIELD ' + r.world.seed + ' - VIEW ' + c.view + ' OF ' + VIEWS,
      'EYE ' + c.height.toFixed(2) + ' M - ' + hms(o.instant) + ' INTO THE HOUR - ' + s.strokes + ' STROKES - ' + s.ink.toFixed(0) + ' M OF LINE'
        + (s.heads ? ' - ' + s.heads + ' SEED HEADS' : ''),
    ];
  }
  const INKS = { sepia: '#7a4b2c', green: '#3f5a3c', grey: '#6a6e78', black: '#1b1a1f' };
  function svg(r, { pen = 0.3, ink2 = 'sepia' } = {}) {
    const f = (v) => +v.toFixed(2);
    const colour = (p) => (p === 2 ? INKS[ink2] || INKS.sepia : 'black');
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + r.sheet.w + 'mm" height="' + r.sheet.h + 'mm" viewBox="0 0 ' + r.sheet.w + ' ' + r.sheet.h + '">');
    out.push('<title>' + caption(r).join(' / ') + '</title>');
    for (const layer of r.layers) {
      out.push('<g id="' + layer.id + '" inkscape:groupmode="layer" inkscape:label="' + layer.label + (layer.pen === 2 ? ' (pen 2: ' + ink2 + ')' : '') + '" fill="none" stroke="' + colour(layer.pen) + '" stroke-width="' + pen + '" stroke-linecap="round" stroke-linejoin="round">');
      for (const s of layer.strokes) {
        let d = 'M' + f(s[0]) + ' ' + f(s[1]);
        for (let k = 2; k < s.length; k += 2) d += 'L' + f(s[k]) + ' ' + f(s[k + 1]);
        out.push('<path d="' + d + '"/>');
      }
      out.push('</g>');
    }
    out.push('</svg>');
    return out.join('\n');
  }

  // ───────────────────────── plotting order ─────────────────────────
  // Greedy nearest neighbour over stroke ends (a stroke may be drawn backwards), with a bucket
  // grid so it stays near-linear. It is the order a careful plotter would draw in; the wall
  // draws in it too. Deterministic: ties break by index.
  function orderStrokes(strokes, cell = 8) {
    const n = strokes.length, used = new Uint8Array(n), grid = new Map(), out = [];
    if (!n) return out;
    const key = (x, y) => Math.floor(x / cell) + ':' + Math.floor(y / cell);
    const put = (i, x, y) => { const k = key(x, y); let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(i); };
    strokes.forEach((s, i) => { put(i, s[0], s[1]); put(i, s[s.length - 2], s[s.length - 1]); });
    let px = 0, py = 0, left = n;
    while (left) {
      let best = -1, bestD = Infinity, flip = false;
      const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
      for (let ring = 0; best < 0 || ring * cell <= Math.sqrt(bestD) + cell; ring++) {
        for (let gy = cy - ring; gy <= cy + ring; gy++) for (let gx = cx - ring; gx <= cx + ring; gx++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue;
          const b = grid.get(gx + ':' + gy); if (!b) continue;
          for (const i of b) {
            if (used[i]) continue;
            const s = strokes[i], d0 = (s[0] - px) ** 2 + (s[1] - py) ** 2, d1 = (s[s.length - 2] - px) ** 2 + (s[s.length - 1] - py) ** 2;
            const d = Math.min(d0, d1);
            if (d < bestD || (d === bestD && i < best)) { bestD = d; best = i; flip = d1 < d0; }
          }
        }
        if (ring > 4096) break;
      }
      used[best] = 1; left--;
      let s = strokes[best];
      if (flip) { const r = []; for (let k = s.length - 2; k >= 0; k -= 2) r.push(s[k], s[k + 1]); s = r; }
      out.push(s); px = s[s.length - 2]; py = s[s.length - 1];
    }
    return out;
  }

  const api = { build, buildMap, svg, orderStrokes, caption, camera, createWorld, headLines, DEFAULTS, SHEETS, VIEWS, INKS };
  global.PlottedField = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
