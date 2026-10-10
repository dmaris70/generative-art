// 038 — regions: the masses a watercolourist would lay a wash over, found in a sheet's
// buffers. A mask (a value 0–1 per grid cell) is traced into closed outlines by marching
// squares; outlines are classed as outer edges or holes by their winding; each hole is joined
// to the outline around it by a hairline bridge, so one polygon carries its own lights (a
// wash goes round the paper it leaves, it does not paint over it); outlines are simplified.

// mask: Float32Array gw × gh (cells), level: threshold. Returns loops of [x, y] in cell units
// (cell centres at integer + 0.5).
function traceContours(mask, gw, gh, level = 0.5) {
  // pad with a ring of zeros so every loop closes inside the grid
  const W = gw + 2, H = gh + 2;
  const v = new Float32Array(W * H);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) v[(y + 1) * W + x + 1] = mask[y * gw + x];
  const pt = (x0, y0, x1, y1) => {
    const a = v[y0 * W + x0], b = v[y1 * W + x1];
    const t = Math.abs(b - a) < 1e-6 ? 0.5 : (level - a) / (b - a);
    return [x0 + (x1 - x0) * t - 0.5, y0 + (y1 - y0) * t - 0.5];
  };
  // edges keyed by the cell edge they cross; segments link edge → edge
  const next = new Map();
  const pos = new Map();
  const key = (x, y, d) => (y * W + x) * 2 + d; // d 0: horizontal edge (x,y)-(x+1,y); 1: vertical (x,y)-(x,y+1)
  const add = (ka, pa, kb, pb) => {
    next.set(ka, kb);
    pos.set(ka, pa);
    pos.set(kb, pb);
  };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = v[y * W + x] >= level ? 1 : 0, b = v[y * W + x + 1] >= level ? 1 : 0;
    const c = v[(y + 1) * W + x + 1] >= level ? 1 : 0, d = v[(y + 1) * W + x] >= level ? 1 : 0;
    const idx = a * 8 + b * 4 + c * 2 + d;
    if (idx === 0 || idx === 15) continue;
    const T = [key(x, y, 0), pt(x, y, x + 1, y)];
    const R = [key(x + 1, y, 1), pt(x + 1, y, x + 1, y + 1)];
    const B = [key(x, y + 1, 0), pt(x, y + 1, x + 1, y + 1)];
    const L = [key(x, y, 1), pt(x, y, x, y + 1)];
    // segments oriented so the inside (≥ level) lies on the left when walking in screen space
    const seg = (p, q) => add(p[0], p[1], q[0], q[1]);
    switch (idx) {
      case 1: seg(B, L); break;
      case 2: seg(R, B); break;
      case 3: seg(R, L); break;
      case 4: seg(T, R); break;
      case 5: seg(T, L); seg(B, R); break;
      case 6: seg(T, B); break;
      case 7: seg(T, L); break;
      case 8: seg(L, T); break;
      case 9: seg(B, T); break;
      case 10: seg(L, B); seg(R, T); break;
      case 11: seg(R, T); break;
      case 12: seg(L, R); break;
      case 13: seg(B, R); break;
      case 14: seg(L, B); break;
    }
  }
  const loops = [];
  const seen = new Set();
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop = [];
    let k = k0;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(pos.get(k));
      k = next.get(k);
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

function loopArea(P) {
  let a = 0;
  for (let i = 0, n = P.length; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Ramer–Douglas–Peucker on a closed loop
function simplify(P, eps) {
  if (P.length < 8) return P;
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, bi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best <= eps) return [pts[0], pts[pts.length - 1]];
    const l = rdp(pts.slice(0, bi + 1)), r = rdp(pts.slice(bi));
    return l.slice(0, -1).concat(r);
  };
  const h = Math.floor(P.length / 2);
  const a = rdp(P.slice(0, h + 1)), b = rdp(P.slice(h).concat([P[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

// Outer outlines with their holes bridged in. The sign of the area tells outer from hole:
// the tracer keeps the inside on its left, which in screen space (y down) makes an outer
// outline's shoelace area negative and a hole's positive.
function regionPolys(mask, gw, gh, o = {}) {
  const minArea = o.minArea ?? 6, minHole = o.minHole ?? 4, eps = o.eps ?? 0.6;
  const loops = traceContours(mask, gw, gh, o.level ?? 0.5).map((L) => simplify(L, eps));
  const outers = [], holes = [];
  for (const L of loops) {
    const a = -loopArea(L);
    if (a > minArea) outers.push({ P: L, a });
    else if (a < -minHole) holes.push(L);
  }
  for (const h of holes) {
    const [hx, hy] = h[0];
    // the smallest outer that contains it
    let host = null;
    for (const O of outers) if (inPoly(O.P, hx, hy) && (!host || O.a < host.a)) host = O;
    if (!host) continue;
    // bridge from the hole's vertex nearest the outline to that outline vertex
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < h.length; i += 2) for (let j = 0; j < host.P.length; j++) {
      const d = (h[i][0] - host.P[j][0]) ** 2 + (h[i][1] - host.P[j][1]) ** 2;
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const hr = h.slice(bi).concat(h.slice(0, bi + 1));
    host.P = host.P.slice(0, bj + 1).concat(hr, host.P.slice(bj));
  }
  return outers;
}

// A mask on a grid of cell × cell data pixels: the fraction of each cell for which test(i) holds.
function cellMask(B, cell, test) {
  const gw = Math.ceil(B.w / cell), gh = Math.ceil(B.h / cell);
  const m = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0, n = 0;
    for (let y = gy * cell; y < Math.min(B.h, (gy + 1) * cell); y++) for (let x = gx * cell; x < Math.min(B.w, (gx + 1) * cell); x++) {
      n++;
      if (test(y * B.w + x)) s++;
    }
    m[gy * gw + gx] = n ? s / n : 0;
  }
  return { m, gw, gh };
}
// a light box blur of a cell mask, so outlines are drawn round masses and not round pixels
function blurMask(M, r = 1) {
  const { m, gw, gh } = M, o = new Float32Array(m.length);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0, n = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      s += m[yy * gw + xx];
      n++;
    }
    o[y * gw + x] = s / n;
  }
  return { m: o, gw, gh };
}
