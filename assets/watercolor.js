/*
 * watercolor.js — reusable watercolour-shape technique for p5 (global mode).
 *
 * Reimplements 32bitkid's `watercolorizer` (ISC licensed), which follows Tyler
 * Hobbs' "How to Hack a Painting" talk. Rewritten from scratch. Two ideas make
 * the look:
 *   1. Progressive EVOLUTIONS — the master polygon keeps distorting, and each
 *      batch of layers spawns from a further-wandered master, so early layers
 *      hug the base and late ones bleed far out → fingers + soft halo.
 *   2. OUTWARD-biased displacement — each edge midpoint is pushed along the
 *      outward normal, inward pushes damped 5×, so pigment bleeds past the base.
 * Plus render touches: MULTIPLY layer build-up, a lighter-centre radial bloom
 * (edge-darkened rim), pigment granulation, base outline, soft cast shadow, and
 * a procedural paper ground.
 *
 * Determinism: pass an `rng` — a function returning a float in [0,1). Use your
 * GenArt instance's `G.rng` so a seed reproduces the painting exactly.
 *
 * ── API ──────────────────────────────────────────────────────────────────────
 *   Watercolor.paperTexture(color, rng, opts?)   // fill the canvas as paper
 *   Watercolor.paint(opts)                        // paint ONE watercolour shape
 *   Watercolor.watercolorize(base, opts?)         // pure geometry → array<layer>
 *   Watercolor.primitive(kind, cx, cy, r)         // build a base polygon
 *   Watercolor.makeRng(seed)                      // small standalone PRNG
 *
 * paint(opts):
 *   base    : Array<{x,y}>             — a polygon, OR give kind/cx/cy/r below
 *   kind    : 'triangle'|'square'|'pentagon'|'hexagon'|'circle' (+ cx,cy,r)
 *   color   : [r,g,b]                  — pigment colour (required)
 *   paper   : [r,g,b]                  — tone of the centre bloom (default cream)
 *   rng     : ()=>[0,1)                — required for reproducibility
 *   reach   : evolutions   (default 5) — how far the bleed/fingers extend
 *   layers  : per evolution(default 4) — density of pigment layers
 *   detail  : layerEvolutions (def 3)  — subdivision of each layer
 *   bleed   : magnitude    (default 1.7)
 *   pigment : layer alpha 0..255 (default 14)
 *   bloom   : centre lightening 0..1 (default 0.45)
 *   grain   : granulation amount (default 1.0)
 *   outline : draw base outline (default true)
 *   shadow  : soft cast shadow  (default true)
 */
(function (global) {
  'use strict';

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeGauss(rng) {
    return function () {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  const TAU = Math.PI * 2;

  // clockwise-wound base polygons
  function primitive(kind, cx, cy, r) {
    const pts = [];
    const ring = (n, rot) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rot + (i / n) * TAU;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    };
    if (kind === 'triangle') ring(3, 0);
    else if (kind === 'square') ring(4, Math.PI / 4);
    else if (kind === 'pentagon') ring(5, 0);
    else if (kind === 'hexagon') ring(6, 0);
    else ring(44, 0); // circle
    return pts;
  }

  // 3-tap gaussian blur on a wrapped scalar array — the convolution package's
  // K_GAUSS_BLUR_3 ([1,2,1]/4). Smooths the per-vertex weight field so uneven
  // bleeding varies gradually around the shape instead of edge-to-edge.
  function blurWeights3(a) {
    const n = a.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (a[(i - 1 + n) % n] + 2 * a[i] + a[(i + 1) % n]) * 0.25;
    }
    return out;
  }

  // one distortion pass: subdivide every edge + outward-biased midpoint push.
  // Carries a per-vertex WEIGHT that scales each edge's push magnitude (so some
  // sides bleed more than others), interpolated onto new midpoints and blurred.
  function distort(pts, weights, mag, gauss, blur) {
    const n = pts.length;
    const outP = [];
    const outW = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const w0 = weights[i];
      const w1 = weights[(i + 1) % n];

      outP.push({ x: a.x + gauss() * 0.5 * mag, y: a.y + gauss() * 0.5 * mag });
      outW.push(w0);

      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.sqrt(ex * ex + ey * ey) || 1;
      const tx = ex / len;
      const ty = ey / len;

      const t = Math.min(0.999, Math.max(0.001, 0.5 + gauss() * 0.133));
      const mx = a.x + ex * t;
      const my = a.y + ey * t;
      const mw = w0 + (w1 - w0) * t;

      const theta = -Math.PI / 2 + gauss() * (Math.PI / 12); // outward normal
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const nx = tx * ct - ty * st;
      const ny = tx * st + ty * ct;

      let m = gauss() * (len / 3);
      if (m < 0) m /= 5;   // damp inward → bleed outward
      m *= mag * mw;       // weight modulates how far this edge bleeds

      outP.push({ x: mx + nx * m, y: my + ny * m });
      outW.push(mw);
    }
    return { pts: outP, w: blur ? blurWeights3(outW) : outW };
  }

  function smoothPoly(pts, k) {
    const n = pts.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n];
      const b = pts[i];
      const c = pts[(i + 1) % n];
      out[i] = { x: b.x + ((a.x + c.x) * 0.5 - b.x) * k, y: b.y + ((a.y + c.y) * 0.5 - b.y) * k };
    }
    return out;
  }

  function triArea(a, b, c) {
    return Math.abs((a.x - c.x) * (b.y - a.y) - (a.x - b.x) * (c.y - a.y));
  }

  // light Visvalingam-style cleanup: drop near-collinear points (triangle area
  // below the tolerance) — trims redundant vertices after smoothing
  function simplifyArea(pts, tol) {
    const n = pts.length;
    if (n <= 12) return pts;
    const out = [pts[0]];
    for (let k = 1; k < n - 1; k++) {
      if (triArea(out[out.length - 1], pts[k], pts[k + 1]) >= tol) out.push(pts[k]);
    }
    out.push(pts[n - 1]);
    return out;
  }

  // pure geometry: base polygon → array of layer polygons, tight to far-bled
  function watercolorize(base, opts) {
    opts = opts || {};
    const evolutions = opts.reach != null ? opts.reach : (opts.evolutions != null ? opts.evolutions : 5);
    const layersPer = opts.layers != null ? opts.layers : (opts.layersPerEvolution != null ? opts.layersPerEvolution : 4);
    const layerEvo = opts.detail != null ? opts.detail : (opts.layerEvolutions != null ? opts.layerEvolutions : 3);
    const mag = opts.bleed != null ? opts.bleed : 1.7;
    const smooth = opts.smooth != null ? opts.smooth : 0.35;
    const preEvo = opts.preEvolutions != null ? opts.preEvolutions : 0;
    const blur = opts.blurWeights !== false;                       // default on
    const tol = opts.simplify != null ? opts.simplify : 1.5;
    const weightVar = opts.weightVar != null ? opts.weightVar : 0;
    const rng = opts.rng || Math.random;
    const gauss = makeGauss(rng);

    // per-vertex weights → uneven, more natural bleeding when weightVar > 0.
    // At 0 we don't touch the rng, so the render is identical to uniform bleed.
    let prevP = base;
    let prevW = weightVar > 0
      ? base.map(function () { return 1 + (rng() * 2 - 1) * weightVar; })
      : base.map(function () { return 1; });

    for (let p = 0; p < preEvo; p++) {
      const d = distort(prevP, prevW, mag, gauss, blur);
      prevP = d.pts; prevW = d.w;
    }

    const layers = [];
    for (let e = 0; e < evolutions; e++) {
      for (let l = 0; l < layersPer; l++) {
        let d = distort(prevP, prevW, mag, gauss, blur);
        for (let k = 0; k < layerEvo; k++) d = distort(d.pts, d.w, mag, gauss, blur);
        let poly = smoothPoly(smoothPoly(d.pts, smooth), smooth);
        if (tol > 0) poly = simplifyArea(poly, tol);
        layers.push(poly);
      }
      const d2 = distort(prevP, prevW, mag, gauss, blur);
      prevP = d2.pts; prevW = d2.w;
    }
    return layers;
  }

  function bounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1 };
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function traceShape(poly) {
    global.beginShape();
    for (const p of poly) global.vertex(p.x, p.y);
    global.endShape(global.CLOSE);
  }

  // like traceShape but as a smooth closed Catmull-Rom curve, so the pigment
  // layers read as rounded organic lobes instead of straight-edged polygon facets
  function traceSmooth(poly) {
    const n = poly.length;
    if (n < 3) { traceShape(poly); return; }
    global.beginShape();
    global.curveVertex(poly[n - 1].x, poly[n - 1].y);
    for (let i = 0; i < n; i++) global.curveVertex(poly[i].x, poly[i].y);
    global.curveVertex(poly[0].x, poly[0].y);
    global.curveVertex(poly[1].x, poly[1].y);
    global.endShape();
  }

  // paint ONE watercolour shape onto the current p5 canvas (global mode)
  function paint(opts) {
    const rng = opts.rng || Math.random;
    const gauss = makeGauss(rng);
    const col = opts.color;
    const paper = opts.paper || [237, 232, 221];
    const base = opts.base || primitive(opts.kind || 'hexagon', opts.cx, opts.cy, opts.r);
    const alpha = opts.pigment != null ? opts.pigment : 14;
    const bloom = opts.bloom != null ? opts.bloom : 0.45;
    const grain = opts.grain != null ? opts.grain : 1.0;
    const outline = opts.outline !== false;
    const shadow = opts.shadow !== false;

    const layers = watercolorize(base, opts);

    // soft cast shadow (from the outline only, so no hard fill shows)
    if (shadow) {
      global.push();
      global.drawingContext.shadowColor = 'rgba(35,30,25,0.22)';
      global.drawingContext.shadowBlur = 20;
      global.drawingContext.shadowOffsetY = 7;
      global.noFill();
      global.stroke(col[0], col[1], col[2], 60);
      global.strokeWeight(2);
      traceShape(base);
      global.pop();
    }

    // pigment layers — MULTIPLY build-up with slight tone jitter. Each layer's
    // outline is also stroked, so pigment pools where layer edges cluster (the
    // rim + finger edges) → denser, edge-darkened outskirts that read crisply.
    const edge = opts.edge != null ? opts.edge : 0.35;
    const nLayers = layers.length;
    global.blendMode(global.MULTIPLY);
    for (let i = 0; i < nLayers; i++) {
      const layer = layers[i];
      const j = 0.82 + rng() * 0.3;
      global.noStroke();
      global.fill(col[0] * j, col[1] * j, col[2] * j, alpha * (0.7 + rng() * 0.6));
      traceSmooth(layer);
      if (edge > 0) {
        // fade the edge stroke for outer (later) layers so pigment pools at the
        // rim + finger edges rather than smearing across the whole halo
        const ew = edge * (1 - (i / nLayers) * 0.75);
        global.noFill();
        global.stroke(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, alpha * ew * 1.7);
        global.strokeWeight(1.3);
        traceSmooth(layer);
      }
    }
    global.blendMode(global.BLEND);

    // granulation inside the base
    if (grain > 0) {
      const bb = bounds(base);
      const count = Math.floor(grain * (bb.x1 - bb.x0) * (bb.y1 - bb.y0) * 0.004);
      global.noStroke();
      for (let k = 0; k < count; k++) {
        const x = bb.x0 + rng() * (bb.x1 - bb.x0);
        const y = bb.y0 + rng() * (bb.y1 - bb.y0);
        if (!pointInPoly(x, y, base)) continue;
        const d = rng() < 0.55 ? 0.55 : 1.25;
        global.fill(col[0] * d, col[1] * d, col[2] * d, 10);
        global.circle(x, y, 0.7 + rng() * 1.4);
      }
    }

    // lighter-centre interior bloom (radial paper wash, clipped to base)
    if (bloom > 0) {
      const ctx = global.drawingContext;
      const cx = opts.cx != null ? opts.cx : bounds(base).x0;
      const cy = opts.cy != null ? opts.cy : bounds(base).y0;
      const bb = bounds(base);
      const rr = (opts.r != null ? opts.r : Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2) * 1.05;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(base[0].x, base[0].y);
      for (let i = 1; i < base.length; i++) ctx.lineTo(base[i].x, base[i].y);
      ctx.closePath();
      ctx.clip();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0.0, 'rgba(' + paper[0] + ',' + paper[1] + ',' + paper[2] + ',' + bloom + ')');
      g.addColorStop(0.5, 'rgba(' + paper[0] + ',' + paper[1] + ',' + paper[2] + ',' + (bloom * 0.32) + ')');
      g.addColorStop(1.0, 'rgba(' + paper[0] + ',' + paper[1] + ',' + paper[2] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      ctx.restore();
    }

    // base outline
    if (outline) {
      global.noFill();
      global.stroke(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55, 110);
      global.strokeWeight(1);
      traceShape(base);
    }
  }

  // procedural watercolour paper: fine canvas weave + gentle mottle + tooth
  function paperTexture(color, rng, opts) {
    opts = opts || {};
    const grainAmt = opts.grain != null ? opts.grain : 9;
    const r = rng || Math.random;
    global.background(color[0], color[1], color[2]);
    global.loadPixels();
    const d = global.pixelDensity();
    const w = global.width * d;
    const h = global.height * d;
    const px = global.pixels;
    for (let y = 0; y < h; y++) {
      const wy = Math.sin(y * 2.1);        // weft threads (fine, ~3px)
      const my = Math.sin(y * 0.013);      // large-scale mottle
      for (let x = 0; x < w; x++) {
        const idx = 4 * (x + y * w);
        // crosshatch of warp + weft threads → woven canvas look
        const weave = (Math.sin(x * 2.1) + wy) * 1.25 + Math.sin((x - y) * 1.15) * 0.6;
        // paper is never perfectly even
        const mottle = (Math.sin(x * 0.011) + my) * 2.3;
        const g = (r() - 0.5) * grainAmt;
        const v = weave + mottle + g;
        px[idx] += v; px[idx + 1] += v; px[idx + 2] += v;
      }
    }
    global.updatePixels();
    global.drawingContext.shadowBlur = 0;
  }

  global.Watercolor = {
    watercolorize: watercolorize,
    paint: paint,
    paperTexture: paperTexture,
    primitive: primitive,
    makeRng: makeRng,
  };
})(window);
