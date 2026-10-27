/*
 * core.js — the Isometric Strata engine's foundations.
 *
 *   ISO.rng(seed)        seeded PRNG with the helpers every generator needs
 *   ISO.proj / depth     true 30° isometric projection and painter's depth
 *   ISO.geom.*           boxes, prisms, polygons, geodesic spheres in world units
 *   ISO.Scene            a list of 3-D primitives (faces, lines, custom glyphs)
 *                        that renders back-to-front as a hand-drawn sheet
 *
 * World units are metres, z up. The viewer sits at (+x, +y, +z), so the three
 * visible faces of a box are its top (+z), its left face (+y) and its right
 * face (+x). Nothing here touches p5 — the scene is pure data until render.js
 * draws it.
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------ rng

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    const s = seed >>> 0;
    const f = mulberry32(s);
    const R = {
      seed: s,
      r: f,
      range: (a, b) => a + f() * (b - a),
      int: (a, b) => Math.floor(a + f() * (b - a + 1)), // inclusive both ends
      pick: (arr) => arr[Math.floor(f() * arr.length) % arr.length],
      chance: (p) => f() < p,
      sign: () => (f() < 0.5 ? -1 : 1),
      gauss: () => {
        const u = 1 - f(), v = f();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      shuffle: (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(f() * (i + 1));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
      // [[item, weight], …] → item
      weighted: (pairs) => {
        let t = 0;
        for (const p of pairs) t += p[1];
        let x = f() * t;
        for (const p of pairs) {
          x -= p[1];
          if (x <= 0) return p[0];
        }
        return pairs[pairs.length - 1][0];
      },
      // an independent stream, so one generator can't disturb another's sequence
      fork: (label) => rng((s ^ hash32(String(label)) ^ Math.floor(f() * 4294967296)) >>> 0),
    };
    return R;
  }

  // ------------------------------------------------------------------ projection

  const C30 = Math.sqrt(3) / 2;

  // world [x, y, z] → unscaled screen [sx, sy] (y down)
  function proj(p) {
    return [(p[0] - p[1]) * C30, (p[0] + p[1]) * 0.5 - p[2]];
  }

  // painter's key: larger = nearer the viewer = drawn later
  function depth(p) {
    return p[0] + p[1] + p[2];
  }

  // ------------------------------------------------------------------ geometry

  const geom = {
    lerp: (a, b, t) => a + (b - a) * t,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),

    centroid(pts) {
      const c = [0, 0, 0];
      for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2] || 0; }
      const n = pts.length || 1;
      return [c[0] / n, c[1] / n, c[2] / n];
    },

    add: (a, b) => [a[0] + b[0], a[1] + b[1], (a[2] || 0) + (b[2] || 0)],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)],
    mul: (a, k) => [a[0] * k, a[1] * k, (a[2] || 0) * k],
    len: (a) => Math.hypot(a[0], a[1], a[2] || 0),
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2] || 0) || 1;
      return [a[0] / l, a[1] / l, (a[2] || 0) / l];
    },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],

    rotZ(p, a, cx, cy) {
      const c = Math.cos(a), s = Math.sin(a);
      const x = p[0] - (cx || 0), y = p[1] - (cy || 0);
      return [x * c - y * s + (cx || 0), x * s + y * c + (cy || 0), p[2] || 0];
    },

    // Visible faces of an axis-aligned box.
    boxFaces(x, y, z, w, d, h) {
      return {
        top: [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]],
        right: [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]],
        left: [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]],
      };
    },

    // The three edges a solid box hides — drawn faintly for an x-ray look.
    boxHidden(x, y, z, w, d, h) {
      return [
        [[x, y, z], [x + w, y, z]],
        [[x, y, z], [x, y + d, z]],
        [[x, y, z], [x, y, z + h]],
      ];
    },

    // A prism from a base polygon (at its own z's) to a top polygon with the same
    // vertex count. Side faces carry their outward normal so callers can cull.
    prism(base, top) {
      const n = base.length;
      const sides = [];
      const cx = geom.centroid(base);
      for (let i = 0; i < n; i++) {
        const a = base[i], b = base[(i + 1) % n];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        let nx = ey, ny = -ex; // one of the two perpendiculars
        const mx = (a[0] + b[0]) / 2 - cx[0], my = (a[1] + b[1]) / 2 - cx[1];
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } // make it outward
        const l = Math.hypot(nx, ny) || 1;
        // the true face normal — a sloped side (a hipped roof, a sheared volume)
        // can face the viewer even when its plan normal points away
        let n3 = geom.cross(geom.sub(b, a), geom.sub(top[i], a));
        if (n3[0] * nx + n3[1] * ny < 0) n3 = geom.mul(n3, -1);
        const l3 = geom.len(n3) || 1;
        sides.push({
          pts: [a, b, top[(i + 1) % n], top[i]],
          n: [nx / l, ny / l],
          n3: [n3[0] / l3, n3[1] / l3, n3[2] / l3],
          visible: (n3[0] + n3[1] + n3[2]) / l3 > 1e-6,
        });
      }
      return { top: top, base: base, sides: sides };
    },

    regular(cx, cy, z, r, n, rot) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (rot || 0) + (i / n) * Math.PI * 2;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
      }
      return out;
    },

    rect(x, y, z, w, d) {
      return [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]];
    },

    // Quad from a centre, two in-plane vectors and half-sizes.
    quad(c, u, v, hu, hv) {
      const U = geom.mul(u, hu), V = geom.mul(v, hv);
      return [
        geom.sub(geom.sub(c, U), V), geom.sub(geom.add(c, U), V),
        geom.add(geom.add(c, U), V), geom.add(geom.sub(c, U), V),
      ];
    },

    // Oriented box: centre, unit axes (u, v, w) and half-extents. Returns 6 faces
    // with outward normals; the caller keeps the ones whose normal faces the viewer.
    obox(c, u, v, w, hu, hv, hw) {
      const U = geom.mul(u, hu), V = geom.mul(v, hv), W = geom.mul(w, hw);
      const P = (su, sv, sw) => geom.add(geom.add(geom.add(c, geom.mul(U, su)), geom.mul(V, sv)), geom.mul(W, sw));
      const faces = [
        { n: w, pts: [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)] },
        { n: geom.mul(w, -1), pts: [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)] },
        { n: u, pts: [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)] },
        { n: geom.mul(u, -1), pts: [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)] },
        { n: v, pts: [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)] },
        { n: geom.mul(v, -1), pts: [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)] },
      ];
      for (const f of faces) f.visible = f.n[0] + f.n[1] + f.n[2] > 1e-6;
      return faces;
    },

    // Geodesic sphere (class I, frequency f): unique vertices and edges on the unit
    // sphere, a vertex at the pole so hemispheres cut cleanly.
    geodesic(freq) {
      const verts = [[0, 0, 1], [0, 0, -1]];
      const a = Math.atan(0.5); // latitude of the two pentagonal rings
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        verts.push([Math.cos(a) * Math.cos(t), Math.cos(a) * Math.sin(t), Math.sin(a)]);
        const t2 = t + Math.PI / 5;
        verts.push([Math.cos(a) * Math.cos(t2), Math.cos(a) * Math.sin(t2), -Math.sin(a)]);
      }
      // ring indices: upper ring vertex i = 2 + 2i, lower ring vertex i = 3 + 2i
      const up = (i) => 2 + 2 * ((i + 5) % 5), lo = (i) => 3 + 2 * ((i + 5) % 5);
      const faces = [];
      for (let i = 0; i < 5; i++) {
        faces.push([0, up(i), up(i + 1)]);
        faces.push([1, lo(i + 1), lo(i)]);
        faces.push([up(i), lo(i), up(i + 1)]);
        faces.push([up(i + 1), lo(i), lo(i + 1)]);
      }
      const key = (p) => p.map((v) => Math.round(v * 1e4)).join(',');
      const vmap = new Map();
      const outV = [];
      const vid = (p) => {
        const k = key(p);
        if (vmap.has(k)) return vmap.get(k);
        vmap.set(k, outV.length);
        outV.push(p);
        return outV.length - 1;
      };
      const edges = new Set();
      const outF = [];
      const n = Math.max(1, freq | 0);
      for (const f of faces) {
        const A = verts[f[0]], B = verts[f[1]], C = verts[f[2]];
        // subdivide triangle into n² sub-triangles in barycentric coordinates
        const grid = [];
        for (let i = 0; i <= n; i++) {
          grid.push([]);
          for (let j = 0; j <= n - i; j++) {
            const k = n - i - j;
            const p = geom.norm([
              (A[0] * i + B[0] * j + C[0] * k) / n,
              (A[1] * i + B[1] * j + C[1] * k) / n,
              (A[2] * i + B[2] * j + C[2] * k) / n,
            ]);
            grid[i].push(vid(p));
          }
        }
        const E = (p, q) => edges.add(p < q ? p + '-' + q : q + '-' + p);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n - i; j++) {
            const a0 = grid[i][j], b0 = grid[i][j + 1], c0 = grid[i + 1][j];
            outF.push([a0, b0, c0]);
            E(a0, b0); E(b0, c0); E(c0, a0);
            if (j < n - i - 1) {
              const d0 = grid[i + 1][j + 1];
              outF.push([b0, d0, c0]);
              E(b0, d0); E(d0, c0);
            }
          }
        }
      }
      return {
        verts: outV,
        faces: outF,
        edges: Array.from(edges).map((k) => k.split('-').map(Number)),
      };
    },

    shade(c, k) {
      return [
        geom.clamp(Math.round(c[0] * k), 0, 255),
        geom.clamp(Math.round(c[1] * k), 0, 255),
        geom.clamp(Math.round(c[2] * k), 0, 255),
      ];
    },

    mix(a, b, t) {
      return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    },
  };

  // ------------------------------------------------------------------ scene

  function Scene() {
    this.items = [];
    this.counts = {};
  }

  Scene.prototype.add = function (it) {
    if (it.depth === undefined) it.depth = it.pts ? depth(geom.centroid(it.pts)) : 0;
    if (it.layer === undefined) it.layer = 1;
    this.items.push(it);
    return it;
  };

  // A closed polygon. fill: { color, alpha, mode: 'flat'|'pencil'|'hatch'|'cross', spacing, angle }
  // edge: pen or null. angle may be a number (radians on screen) or 'edge' (parallel
  // to the face's first edge) or 'side' (parallel to its last edge).
  Scene.prototype.face = function (pts, o) {
    o = o || {};
    return this.add({
      kind: 'face', pts: pts, fill: o.fill || null,
      edge: o.edge === undefined ? {} : o.edge,
      layer: o.layer, depth: o.depth, tag: o.tag,
    });
  };

  Scene.prototype.line = function (pts, pen, o) {
    o = o || {};
    return this.add({ kind: 'line', pts: pts, pen: pen || {}, layer: o.layer, depth: o.depth, tag: o.tag });
  };

  // Anything drawn in screen space at a 3-D anchor: draw(hand, P, item).
  Scene.prototype.custom = function (anchor, draw, o) {
    o = o || {};
    return this.add({
      kind: 'custom', anchor: anchor, draw: draw, alt: o.alt || null, layer: o.layer,
      depth: o.depth === undefined ? depth(anchor) + (o.bias || 0) : o.depth, tag: o.tag,
    });
  };

  Scene.prototype.count = function (tag, n) {
    this.counts[tag] = (this.counts[tag] || 0) + (n === undefined ? 1 : n);
  };

  // An axis-aligned box: three visible faces, shaded top / left / right.
  // o.color null → outline only. o.mode fill mode. o.xray → hidden edges too.
  Scene.prototype.box = function (x, y, z, w, d, h, o) {
    o = o || {};
    const f = geom.boxFaces(x, y, z, w, d, h);
    const sh = o.shade || [1.08, 1.0, 0.86];
    const alpha = o.alpha === undefined ? 150 : o.alpha;
    const edge = o.edge === undefined ? {} : o.edge;
    const self = this;
    const mk = (pts, k, side) =>
      self.face(pts, {
        fill: o.color
          ? { color: geom.shade(o.color, k), alpha: alpha, mode: o.mode || 'pencil', angle: o.angle, spacing: o.spacing, side: side }
          : null,
        edge: edge, layer: o.layer, depth: o.depth, tag: o.tag,
      });
    const out = { top: mk(f.top, sh[0], 'top'), left: mk(f.left, sh[1], 'left'), right: mk(f.right, sh[2], 'right') };
    if (o.xray) {
      for (const e of geom.boxHidden(x, y, z, w, d, h)) {
        this.line(e, o.xrayPen || { alpha: 55, weight: 0.7, wob: 0.8 }, { layer: o.layer, depth: depth([x, y, z]) - 0.01 });
      }
    }
    return out;
  };

  // Faces of an oriented box or prism — only those facing the viewer.
  Scene.prototype.faces = function (faces, o) {
    o = o || {};
    const out = [];
    for (const f of faces) {
      if (f.visible === false && !o.all) continue;
      const k = o.shadeFn ? o.shadeFn(f) : 1;
      out.push(this.face(f.pts, {
        fill: o.color ? { color: geom.shade(o.color, k), alpha: o.alpha === undefined ? 150 : o.alpha, mode: o.mode || 'pencil', angle: o.angle, spacing: o.spacing } : null,
        edge: o.edge === undefined ? {} : o.edge, layer: o.layer, depth: o.depth, tag: o.tag,
      }));
    }
    return out;
  };

  Scene.prototype.sorted = function () {
    return this.items.slice().sort((a, b) => a.layer - b.layer || a.depth - b.depth);
  };

  // Projected bounding box of everything in the scene (unscaled screen units).
  Scene.prototype.bounds = function (layerFilter) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const eat = (p) => {
      const s = proj(p);
      if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0];
      if (s[1] < y0) y0 = s[1]; if (s[1] > y1) y1 = s[1];
    };
    for (const it of this.items) {
      if (layerFilter && !layerFilter(it)) continue;
      if (it.pts) for (const p of it.pts) eat(p);
      else if (it.anchor) eat(it.anchor);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };

  global.ISO = { rng, hash32, proj, depth, geom, Scene, C30, INK: [52, 58, 68] };
})(window);
