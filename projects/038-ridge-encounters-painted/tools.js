// 038 — the watercolour toolkit, copied verbatim from 037 (Watercolor Landscape v1).
// Shapes are in sheet units; X()/Y() (sketch.js) map them to the canvas for the sheet being painted.

// brush.polygon with a guard: p5.brush sizes an offscreen buffer from the polygon's
// bounds, so degenerate (sub-pixel or non-finite) shapes are skipped, not passed on.
function bpoly(arr) {
  const P = pts(arr);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 - x0 < 1.5 || y1 - y0 < 1.5) return null;
  return brush.polygon(P);
}

function toHex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function shadeRGB(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// A wash: fill (wet, bleeding) over a REF polygon. o: {bleed, dir ('in'|'out'), ang (radians,
// the direction the wash runs; null = random), tex (granulation), border (pigment gathered at
// the edge as the wash dries), scatter (sparse edge layers)}.
function wfill(poly, col, op, o = {}) {
  brush.noStroke();
  brush.noHatch();
  brush.fill(toHex(col), Math.min(255, op * WP.load));
  brush.fillBleed(clamp01((o.bleed ?? 0.15) * (0.35 + 1.3 * WP.wet)), o.dir || 'out', o.ang ?? null);
  brush.fillTexture(clamp01(o.tex ?? 0.3), clamp01((o.border ?? 0.3) * (0.3 + 1.4 * WP.back)), o.scatter ?? true);
  const r = bpoly(poly);
  brush.noFill();
  return r;
}

// a glaze laid on dry paper (no bleed, no texture, a crisp edge): the library's wash, which
// is transparent and builds up where glazes overlap — and cheap, so the many small marks use it
function wwash(poly, col, op) {
  brush.noStroke();
  brush.noFill();
  brush.wash(toHex(col), Math.min(255, op));
  bpoly(poly);
  brush.noWash();
}

// A glaze with a loose edge: a wet mark spreads past where it was laid and thins there, so
// it is laid three times — a faint spread a little beyond the shape, the shape itself, and a
// denser core a little inside it — each outline jittered on its own, so the edge fades and
// wanders instead of cutting. k scales the spread (1 = a damp brush on damp paper).
function wsoft(poly, col, op, k = 1) {
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x; cy += y; }
  cx /= poly.length; cy /= poly.length;
  let r = 0;
  for (const [x, y] of poly) r = Math.max(r, Math.hypot(x - cx, y - cy));
  const ph = random(100);
  const ring = (sc, j) => poly.map(([x, y], i) => {
    const n = (noise(ph + i * 0.37, sc * 7) - 0.5) * 2 * j * r;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [cx + dx * sc + (dx / d) * n, cy + dy * sc + (dy / d) * n];
  });
  wwash(ring(1 + 0.16 * k, 0.07 * k), col, op * 0.22);
  wwash(ring(1, 0.05 * k), col, op * 0.42);
  wwash(ring(1 - 0.12 * k, 0.04 * k), col, op * 0.5);
}

// Dry brush: a lightly loaded brush dragged fast across the paper, its hairs skipping over
// the hollows of the tooth — a few parallel slivers of glaze, each broken where the paper's
// grain catches it, the breaks commoner on a rough sheet.
function wdry(col, op, x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const hairs = 3 + Math.floor(random(4));
  const skip = 0.3 + 0.35 * WP.dry * (1.4 - WP.tooth * 0.4);
  const ph = random(100);
  for (let h = 0; h < hairs; h++) {
    const off = (h / Math.max(1, hairs - 1) - 0.5) * w * 2 + random(-0.3, 0.3) * w;
    const hw = Math.max(0.35, w * random(0.12, 0.3));
    let t = random(0, 0.15);
    while (t < 1) {
      const seg = random(0.08, 0.3);
      const t1 = Math.min(1, t + seg);
      if (noise(ph + h * 7.7, t * 6) > skip) {
        const ax = x0 + dx * t + nx * off, ay = y0 + dy * t + ny * off;
        const bx = x0 + dx * t1 + nx * off, by = y0 + dy * t1 + ny * off;
        wwash([[ax + nx * hw, ay + ny * hw], [bx + nx * hw * 0.6, by + ny * hw * 0.6], [bx - nx * hw * 0.6, by - ny * hw * 0.6], [ax - nx * hw, ay - ny * hw]], col, op);
      }
      t = t1 + random(0.02, 0.12);
    }
  }
}
