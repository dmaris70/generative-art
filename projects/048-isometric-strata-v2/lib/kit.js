/*
 * kit.js — drawing helpers the later styles share: pens, a hipped or pitched roof,
 * a cylinder, a faceted sphere, a flight of steps, and apertures cut in a wall face.
 *
 * Faces visible to the viewer are the top, the +y face ('y1') and the +x face ('x1').
 * An aperture is a face laid a hair in front of the wall it pierces, so it reads as a
 * dark opening in every view (a plan cut ignores it, as a plan should).
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;
  const EDGE = { alpha: 190, weight: 0.95, wob: 0.55, passes: 1 };
  const THIN = { alpha: 150, weight: 0.75, wob: 0.45 };
  const FAINT = { alpha: 70, weight: 0.6, wob: 0.5 };
  const VOID = [38, 40, 46];

  // a hipped roof over a loop of [x, y] corners at height z: eaves out by `over`, ridge in by `inset` (0..1 of the way to the centre)
  function hip(S, loop, z, rise, inset, over, col, tag) {
    const cen = G.centroid(loop.map((p) => [p[0], p[1], 0]));
    const eave = loop.map((p) => [p[0] + Math.sign(p[0] - cen[0]) * over, p[1] + Math.sign(p[1] - cen[1]) * over, z]);
    const ridge = loop.map((p) => [cen[0] + (p[0] - cen[0]) * (1 - inset), cen[1] + (p[1] - cen[1]) * (1 - inset), z + rise]);
    const rp = G.prism(eave, ridge);
    for (const f of rp.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(col, 0.85 + 0.2 * ((f.n[1] - f.n[0]) * 0.5 + 0.5)), alpha: 140, mode: 'pencil', spacing: 2.2, angle: 'edge' }, edge: EDGE, tag: tag });
    S.face(ridge, { fill: { color: col, alpha: 100, mode: 'flat' }, edge: EDGE, tag: tag });
    return { eave: eave, ridge: ridge };
  }

  // a standing cylinder as a 16-sided prism
  function cyl(S, cx, cy, z, r, h, col, tag, n) {
    const k = n || 16, base = G.regular(cx, cy, z, r, k), top = base.map((p) => [p[0], p[1], z + h]);
    const pr = G.prism(base, top);
    for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: G.shade(col, 0.8 + 0.24 * ((f.n[1] - f.n[0]) * 0.5 + 0.5)), alpha: 190, mode: 'flat' }, edge: null, tag: tag });
    S.face(top, { fill: { color: G.shade(col, 1.08), alpha: 150, mode: 'flat' }, edge: EDGE, tag: tag, depth: D([cx, cy, z + h]) + 0.05 });
    S.line([base[0], top[0]], EDGE, { depth: D(base[0]) + 0.05 });
    S.line([base[Math.floor(k / 4)], top[Math.floor(k / 4)]], THIN, { depth: D(base[Math.floor(k / 4)]) + 0.05 });
    return base;
  }

  // a faceted sphere from a frequency-2 geodesic, the faces turned to the light by their normals
  function sphere(S, cx, cy, cz, r, col, tag, zs) {
    const g = G.geodesic(2);
    for (const f of g.faces) {
      const a = g.verts[f[0]], b = g.verts[f[1]], c = g.verts[f[2]];
      const n = G.norm([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]);
      if (n[0] + n[1] + n[2] <= -0.15) continue;
      const pts = [a, b, c].map((v) => [cx + v[0] * r, cy + v[1] * r, cz + v[2] * r * (zs || 1)]);
      S.face(pts, { fill: { color: G.shade(col, 0.7 + 0.35 * Math.max(0, Math.min(1, (n[2] + 0.4 * (n[1] - n[0]) + 1) / 2))), alpha: 200, mode: 'flat' }, edge: FAINT, tag: tag });
    }
  }

  // a flight of n steps climbing in direction dir ('+x' | '-x' | '+y' | '-y') from (x, y) at z, width w across
  function steps(S, x, y, z, w, n, rise, run, dir, col, tag) {
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * rise;
      let bx, by, bw, bd;
      if (dir === '+x') { bx = x + i * run; by = y; bw = run; bd = w; }
      else if (dir === '-x') { bx = x - (i + 1) * run; by = y; bw = run; bd = w; }
      else if (dir === '+y') { bx = x; by = y + i * run; bw = w; bd = run; }
      else { bx = x; by = y - (i + 1) * run; bw = w; bd = run; }
      S.box(bx, by, z, bw, bd, h, { color: col, alpha: 90, mode: 'flat', edge: THIN, tag: tag || 'step' });
    }
  }

  // an aperture on the +y face (plane y = at) or the +x face (plane x = at); (u0..u1) along the wall, (z0..z1) up it.
  // shape: 'rect' | 'circle' | 'arch' | 'tri' | 'slot'
  function aperture(S, face, at, u0, u1, z0, z1, shape, col, tag) {
    const P = (u, z) => (face === 'y1' ? [u, at + 0.02, z] : [at + 0.02, u, z]);
    const cu = (u0 + u1) / 2, cz = (z0 + z1) / 2, ru = (u1 - u0) / 2, rz = (z1 - z0) / 2;
    let pts;
    if (shape === 'circle') { pts = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; pts.push(P(cu + Math.cos(a) * Math.min(ru, rz), cz + Math.sin(a) * Math.min(ru, rz))); } }
    else if (shape === 'arch') { pts = [P(u0, z0)]; for (let i = 0; i <= 12; i++) { const a = Math.PI - (i / 12) * Math.PI; pts.push(P(cu + Math.cos(a) * ru, z0 + rz * 0.3 + Math.sin(a) * (rz * 1.7))); } pts.push(P(u1, z0)); }
    else if (shape === 'tri') pts = [P(u0, z0), P(u1, z0), P(cu, z1)];
    else pts = [P(u0, z0), P(u1, z0), P(u1, z1), P(u0, z1)];
    S.face(pts, { fill: { color: col || VOID, alpha: 175, mode: 'flat' }, edge: THIN, tag: tag || 'aperture' });
  }

  // a tube lying along x or y: a ring of n points swept the length, the far end closed
  function tube(S, x0, y0, z, len, r, dir, col, tag, n) {
    const k = n || 12;
    const pt = (t, a) => (dir === 'x' ? [x0 + t, y0 + Math.cos(a) * r, z + Math.sin(a) * r] : [x0 + Math.cos(a) * r, y0 + t, z + Math.sin(a) * r]);
    for (let i = 0; i < k; i++) {
      const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2, m = (a0 + a1) / 2;
      const nrm = dir === 'x' ? [0, Math.cos(m), Math.sin(m)] : [Math.cos(m), 0, Math.sin(m)];
      if (nrm[0] + nrm[1] + nrm[2] < -0.05) continue;
      S.face([pt(0, a0), pt(len, a0), pt(len, a1), pt(0, a1)], { fill: { color: G.shade(col, 0.78 + 0.3 * Math.max(0, Math.min(1, (nrm[2] + 1) / 2))), alpha: 175, mode: 'flat' }, edge: null, tag: tag });
    }
    const cap = []; for (let i = 0; i < k; i++) cap.push(pt(len, (i / k) * Math.PI * 2));
    S.face(cap, { fill: { color: G.shade(col, 0.9), alpha: 150, mode: 'flat' }, edge: FAINT, tag: tag });
  }

  // a sector of an annulus about (cx, cy), radii r0..r1, angles a0..a1 (radians from +x toward +y), z0..z1
  function annulus(S, cx, cy, r0, r1, a0, a1, z0, z1, col, tag, seg) {
    const n = seg || Math.max(2, Math.round((a1 - a0) / 0.18));
    const at = (r, a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    const vf = (pts, nx, ny, k) => { if (nx + ny > 1e-6) S.face(pts, { fill: { color: G.shade(col, k), alpha: 170, mode: 'pencil', spacing: 2.8, angle: 'edge' }, edge: THIN, tag: tag }); };
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * (a1 - a0), b = a0 + ((j + 1) / n) * (a1 - a0), m = (a + b) / 2;
      vf([at(r1, a, z0), at(r1, b, z0), at(r1, b, z1), at(r1, a, z1)], Math.cos(m), Math.sin(m), 0.88 + 0.2 * Math.max(0, Math.cos(m)));
      if (r0 > 0.01) vf([at(r0, a, z0), at(r0, b, z0), at(r0, b, z1), at(r0, a, z1)], -Math.cos(m), -Math.sin(m), 0.8);
    }
    vf([at(r0, a0, z0), at(r1, a0, z0), at(r1, a0, z1), at(r0, a0, z1)], Math.sin(a0), -Math.cos(a0), 0.84);
    vf([at(r0, a1, z0), at(r1, a1, z0), at(r1, a1, z1), at(r0, a1, z1)], -Math.sin(a1), Math.cos(a1), 0.84);
    const top = [];
    for (let j = 0; j <= n; j++) top.push(at(r1, a0 + (j / n) * (a1 - a0), z1));
    for (let j = n; j >= 0; j--) top.push(at(r0, a0 + (j / n) * (a1 - a0), z1));
    S.face(top, { fill: { color: G.shade(col, 1.08), alpha: 150, mode: 'flat' }, edge: EDGE, tag: tag });
    const poly = []; for (let j = 0; j <= n; j++) poly.push([cx + Math.cos(a0 + (j / n) * (a1 - a0)) * r1, cy + Math.sin(a0 + (j / n) * (a1 - a0)) * r1]);
    for (let j = n; j >= 0; j--) poly.push([cx + Math.cos(a0 + (j / n) * (a1 - a0)) * r0, cy + Math.sin(a0 + (j / n) * (a1 - a0)) * r0]);
    return poly;
  }

  global.Kit = { EDGE: EDGE, THIN: THIN, FAINT: FAINT, VOID: VOID, hip: hip, cyl: cyl, sphere: sphere, tube: tube, annulus: annulus, steps: steps, aperture: aperture };
})(window);
