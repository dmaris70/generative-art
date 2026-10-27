/*
 * model.js — what the building is, beneath what it looks like.
 *
 * A style draws a scene of faces, but a building is also its solids (every box
 * the scene recorded), its extruded outlines (slabs and blocks a style drew as
 * prisms), its structural grid and its spaces. The orthographic sheets read this
 * model, and so does the schedule: the quantities on a sheet are measured from
 * it, not asserted.
 *
 * A style may report, through the recorder on its context (`ctx.M`):
 *
 *   M.grid(xs, ys)                 the structural grid lines, in plot coordinates
 *   M.prism(poly, z0, z1, kind, t) an extruded outline: kind 'slab' | 'mass' | 'wall' | 'column' | 'volume';
 *                                  with t, a shell of that thickness round the outline (walls round rooms);
 *                                  'volume' is an envelope that is built but not itself solid
 *   M.space({ name, kind, x, y, w, d | poly, z, h, level, area? })
 *                                  a room, court, water, terrace, loggia, service,
 *                                  circulation or unit; area overrides w * d / the outline
 *   M.R                            an rng of its own, so naming rooms never disturbs the
 *                                  style's own stream (a fork would advance it)
 *
 * Whatever a style does not report is derived from its solids: each is classified
 * (column, wall, slab, mass, core, stair, base, other) and measured.
 */
(function (global) {
  'use strict';

  const polyArea = (p) => {
    let a = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    return Math.abs(a) / 2;
  };
  const polyCentroid = (p) => {
    let x = 0, y = 0;
    for (const q of p) { x += q[0]; y += q[1]; }
    return [x / p.length, y / p.length];
  };
  const inPoly = (x, y, p) => {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  };

  function create(seed) {
    const m = { grids: [], spaces: [], prisms: [], R: global.ISO.rng(((seed >>> 0) ^ 0xa7c45) >>> 0) };
    m.grid = function (xs, ys) { m.grids.push({ xs: xs.slice().sort((a, b) => a - b), ys: ys.slice().sort((a, b) => a - b) }); };
    m.prism = function (poly, z0, z1, kind, thick) { m.prisms.push({ poly: poly.map((q) => [q[0], q[1]]), z0: z0, z1: z1, kind: kind || 'mass', thick: thick || 0 }); };
    m.space = function (sp) {
      sp.kind = sp.kind || 'room';
      sp.area = sp.area !== undefined ? sp.area : sp.poly ? polyArea(sp.poly) : sp.w * sp.d;
      sp.h = sp.h || 0;
      sp.z = sp.z || 0;
      if (sp.poly) {
        const xs = sp.poly.map((q) => q[0]), ys = sp.poly.map((q) => q[1]);
        sp.bb = { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
      } else sp.bb = { x0: sp.x, y0: sp.y, x1: sp.x + sp.w, y1: sp.y + sp.d };
      sp.id = m.spaces.length;
      m.spaces.push(sp);
      return sp;
    };
    return m;
  }

  // ---- what a solid is ----
  const ORNAMENT = { parapet: 1, rail: 1, joint: 1, canopy: 1, balcony: 1, pergola: 1, chimney: 1, mill: 1, crane: 1, duct: 1, planter: 1, shadow: 1, tie: 1, porthole: 1 };
  const COLUMN = { column: 1, pier: 1, post: 1, pilotis: 1, mast: 1 };
  function classify(s) {
    const t = s.tag, mn = Math.min(s.w, s.d), mx = Math.max(s.w, s.d);
    if (t === 'core') return 'core';
    if (t === 'stair' || t === 'step' || t === 'ramp') return 'stair';
    if (t === 'plinth' || t === 'podium' || t === 'terrace' || (s.z < 0.05 && s.h <= 1.5 && mn >= 3)) return 'base';
    if (ORNAMENT[t]) return 'other';
    if (COLUMN[t] || (mx <= 1.0 && s.h >= 1.5)) return 'column';
    if (mx < 0.5) return 'other';
    if (s.h <= 0.6 && mn >= 1.2) return 'slab';
    if (mn <= 0.8 && s.h >= 0.9 && mx >= 1.2) return 'wall';
    return 'mass';
  }

  // ---- measuring ----
  // bodies: everything solid, as { poly | rect, z0, z1, cls }
  function bodies(M, scene, nSolids) {
    const out = [];
    for (let i = 0; i < nSolids; i++) {
      const s = scene.solids[i];
      out.push({ x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.d, z0: s.z, z1: s.z + s.h, cls: classify(s), vol: s.w * s.d * s.h, w: s.w, d: s.d });
    }
    for (const p of M.prisms) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of p.poly) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      let per = 0;
      for (let i = 0; i < p.poly.length; i++) { const a = p.poly[i], b = p.poly[(i + 1) % p.poly.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      const vol = p.kind === 'volume' ? 0 : p.thick ? per * p.thick * (p.z1 - p.z0) : polyArea(p.poly) * (p.z1 - p.z0);
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1, z0: p.z0, z1: p.z1, cls: p.kind, poly: p.poly, vol: vol, w: x1 - x0, d: y1 - y0, len: p.thick ? per : 0 });
    }
    return out;
  }

  function raster(bs, ext, c) {
    const nx = Math.max(1, Math.ceil((ext.x1 - ext.x0) / c)), ny = Math.max(1, Math.ceil((ext.y1 - ext.y0) / c));
    const g = new Uint8Array(nx * ny);
    for (const b of bs) {
      const i0 = Math.max(0, Math.floor((b.x0 - ext.x0) / c)), i1 = Math.min(nx - 1, Math.ceil((b.x1 - ext.x0) / c) - 1);
      const j0 = Math.max(0, Math.floor((b.y0 - ext.y0) / c)), j1 = Math.min(ny - 1, Math.ceil((b.y1 - ext.y0) / c) - 1);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if (b.poly && !inPoly(ext.x0 + (i + 0.5) * c, ext.y0 + (j + 0.5) * c, b.poly)) continue;
          g[j * nx + i] = 1;
        }
      }
    }
    let n = 0;
    for (let k = 0; k < g.length; k++) n += g[k];
    return n * c * c;
  }

  const ENCLOSED = { room: 1, service: 1, circulation: 1, unit: 1 };
  const OPEN = { court: 1, terrace: 1, water: 1, loggia: 1 };

  // everything a sheet can quote, measured from the model
  function derive(M, scene, info) {
    const bs = bodies(M, scene, info.buildingSolids).filter((b) => b.cls !== 'other');
    const built = bs.filter((b) => b.cls !== 'base');
    const q = { levels: info.floors, floorH: info.floorH, datum: info.datum, plotArea: info.plot.w * info.plot.d };
    if (!built.length) return Object.assign(q, { footprint: 0, fill: 0, density: 0, structure: 'NONE', height: 0, columns: 0, wallLen: 0, bay: null, gfa: 0, rooms: 0, programme: {}, open: 0, levelArea: [], envelope: { w: 0, d: 0, h: 0 }, groundOpen: null, slenderness: 0, solidVol: 0, envVol: 0, volumes: {} });

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = 0;
    for (const b of built) { if (b.x0 < x0) x0 = b.x0; if (b.x1 > x1) x1 = b.x1; if (b.y0 < y0) y0 = b.y0; if (b.y1 > y1) y1 = b.y1; if (b.z1 > z1) z1 = b.z1; }
    const ext = { x0: x0, x1: x1, y0: y0, y1: y1 };
    const cell = Math.max(0.25, Math.sqrt(((x1 - x0) * (y1 - y0)) / 160000));
    const footprint = raster(built.filter((b) => b.cls !== 'stair'), ext, cell);

    // area occupied on each level, and at the ground
    const levelArea = [];
    for (let k = 0; k < info.floors; k++) {
      const a = info.datum + k * info.floorH, b = a + info.floorH;
      levelArea.push(raster(built.filter((s) => s.cls !== 'stair' && s.z0 < b - 0.2 && s.z1 > a + 0.2 && !(s.cls === 'slab' && s.z1 <= a + 0.6)), ext, cell));
    }
    const ground = built.filter((b) => b.z0 < 2.5 && b.cls !== 'slab' && b.cls !== 'stair');
    const groundCover = raster(ground, ext, cell);

    // volumes by class: the sum of what each solid occupies (overlaps are not subtracted)
    const vol = { column: 0, wall: 0, slab: 0, mass: 0, core: 0, stair: 0 };
    for (const b of built) if (vol[b.cls] !== undefined) vol[b.cls] += b.vol;
    const solidVol = vol.column + vol.wall + vol.slab + vol.mass + vol.core;
    const envW = x1 - x0, envD = y1 - y0, envVol = envW * envD * z1;

    const cols = built.filter((b) => b.cls === 'column');
    const wallLen = built.filter((b) => b.cls === 'wall').reduce((s, b) => s + (b.len || Math.max(b.w, b.d)), 0);
    // bay: the median distance from each column to its nearest neighbour
    let bay = null;
    if (cols.length >= 4) {
      const pts = cols.map((c) => [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2]), ds = [];
      for (const p of pts) { let m = Infinity; for (const r of pts) if (r !== p) m = Math.min(m, Math.hypot(p[0] - r[0], p[1] - r[1])); if (m < Infinity && m > 0.3) ds.push(m); }
      ds.sort((a, b) => a - b);
      if (ds.length) bay = ds[Math.floor(ds.length / 2)];
    }

    // what carries it: a frame if columns are a real share of the carrying volume, a core
    // if one shaft dominates everything, a mass if solid volume does, else walls or a hybrid
    const carry = vol.column + vol.wall + vol.mass + vol.core, bare = vol.column + vol.wall + vol.mass;
    let structure = 'HYBRID';
    if (carry > 0) {
      if (cols.length >= 4 && bare > 0 && vol.column / bare >= 0.15) structure = 'FRAME';
      else if (vol.core / carry >= 0.5) structure = 'CORE';
      else if (vol.mass / carry > 0.55) structure = 'MASS';
      else if (vol.wall > 1.6 * vol.column) structure = 'WALL';
    }

    // spaces
    let gfa = 0, rooms = 0, open = 0;
    const programme = {};
    for (const sp of M.spaces) {
      if (ENCLOSED[sp.kind]) { gfa += sp.area; if (sp.kind === 'room' || sp.kind === 'unit') { rooms++; programme[sp.name] = (programme[sp.name] || 0) + 1; } }
      else if (OPEN[sp.kind]) open += sp.area;
    }

    return Object.assign(q, {
      footprint: footprint, fill: envW * envD > 0 ? footprint / (envW * envD) : 0, envelope: { w: envW, d: envD, h: z1 }, envVol: envVol,
      solidVol: solidVol, density: envVol > 0 ? solidVol / envVol : 0, height: z1, slenderness: footprint > 0 ? z1 / Math.sqrt(footprint) : 0,
      levelArea: levelArea, groundOpen: footprint > 0 ? Math.max(0, 1 - groundCover / footprint) : null,
      columns: cols.length, wallLen: wallLen, bay: bay, volumes: vol, structure: structure,
      gfa: gfa, rooms: rooms, programme: programme, open: open,
    });
  }

  // the bands the token layer reads, from the measured model
  function bands(q) {
    const d = q.density, sl = q.slenderness, g = q.groundOpen, f = q.fill;
    return {
      structure: q.structure,
      massing: d < 0.02 ? 'OPEN' : d < 0.07 ? 'LIGHT' : d < 0.15 ? 'MEDIUM' : d < 0.25 ? 'SOLID' : 'MONOLITHIC',
      proportion: sl < 0.7 ? 'SQUAT' : sl < 1.1 ? 'LOW' : sl < 2.0 ? 'TALL' : 'SLENDER',
      ground: g === null ? 'NONE' : g < 0.3 ? 'SOLID' : g < 0.8 ? 'PERFORATED' : 'OPEN',
      plan: f >= 0.8 ? 'COMPACT' : f >= 0.5 ? 'ARTICULATED' : 'SCATTERED',
    };
  }

  global.Model = { create: create, derive: derive, bands: bands, classify: classify, polyArea: polyArea, polyCentroid: polyCentroid };
})(window);
