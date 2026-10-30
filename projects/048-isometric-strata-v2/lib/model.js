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

  // ---- the programme vocabulary: every room name belongs to a group ----
  const GROUPS = [
    ['SLEEPING', /RECAMARA|CAMERE|BEDROOM|GUEST|CAPSULE|POD|UPPER ROOM|DORM|SUITE/],
    ['WORK', /ESTUDIO|STUDIO|STUDY|TALLER|WORKSHOP|BIBLIOTECA|LIBRARY|READING|STACKS|OFFIC|SHOWROOM|LABORATORY|SEMINAR/],
    ['SERVICE', /COCINA|CORE|KITCHEN|SERVICE/],
    ['SACRED', /CHAPEL|CAPILLA|ARCOSOLIUM/],
    ['CIVIC', /ASSEMBLY|LECTURE|COUNCIL|COMMITTEE|AUDITORIUM|CLUB|ATRIUM|COMMON/],
    ['LIVING', /SALA|SALON|LIVING|COMEDOR|DINING|HALL|OPEN PLAN|GALL|MIRADOR|VAULTED|WING|DWELLING|HOUSE|LOFT|BOUDOIR|MUSIC|PLAYROOM|FLATS|PAVILION|COURT ROOM/],
  ];
  function groupOf(sp) {
    if (OPEN[sp.kind]) return 'OPEN';
    if (sp.kind === 'circulation') return 'CIRCULATION';
    if (sp.kind === 'service') return 'SERVICE';
    for (const g of GROUPS) if (g[1].test(sp.name || '')) return g[0];
    return 'OTHER';
  }

  // ---- circulation: how one gets about, derived from the spaces and the vertical solids ----
  // Verticals are clusters of core and stair solids. On each level the spaces that exist at
  // mid-height (plus courts and loggias at that level) are nodes; the route is the minimum
  // spanning tree of the nodes, edge length the gap between footprints. The way in is the
  // entry steps if the building has them, else the south edge of the plot, to the nearest node.
  // It is a diagram of access, not a layout of doors.
  function circulation(M, bs, info) {
    const FH = info.floorH, D = info.datum, N = Math.max(1, info.floors);
    const vb = bs.filter((b) => b.cls === 'core' || b.cls === 'stair');
    const cl = [];
    for (const b of vb) {
      const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      let hit = null;
      for (const k of cl) if (Math.hypot(k.c[0] - c[0], k.c[1] - c[1]) < 4.5 + Math.max(k.w, k.d) * 0.25) { hit = k; break; }
      if (!hit) { cl.push({ c: c, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, z0: b.z0, z1: b.z1, core: b.cls === 'core', n: 1, w: b.x1 - b.x0, d: b.y1 - b.y0 }); continue; }
      hit.x0 = Math.min(hit.x0, b.x0); hit.y0 = Math.min(hit.y0, b.y0); hit.x1 = Math.max(hit.x1, b.x1); hit.y1 = Math.max(hit.y1, b.y1);
      hit.z0 = Math.min(hit.z0, b.z0); hit.z1 = Math.max(hit.z1, b.z1); hit.core = hit.core || b.cls === 'core'; hit.n++;
      hit.c = [(hit.x0 + hit.x1) / 2, (hit.y0 + hit.y1) / 2]; hit.w = hit.x1 - hit.x0; hit.d = hit.y1 - hit.y0;
    }
    const verticals = [], entrySteps = [];
    const span = (z0, z1) => {
      const k0 = Math.max(0, Math.floor((z0 - D) / FH + 0.25)), k1 = Math.min(N - 1, Math.ceil((z1 - D) / FH - 0.25) - 1);
      return [k0, Math.max(k0, k1)];
    };
    for (const k of cl) {
      if (!k.core && k.z1 - k.z0 < 0.8 * FH) { entrySteps.push(k); continue; }
      const r = span(k.z0, k.z1);
      verticals.push({ kind: k.core ? 'CORE' : 'STAIR', c: k.c, bb: { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 }, k0: r[0], k1: r[1], z0: k.z0, z1: k.z1 });
    }
    // a core or stair a style only declared as a space (one per level, stacked) is a vertical too
    for (const sp of M.spaces) {
      if (!(sp.kind === 'service' || sp.kind === 'circulation') || !/CORE|STAIR/.test(sp.name || '')) continue;
      const c = [(sp.bb.x0 + sp.bb.x1) / 2, (sp.bb.y0 + sp.bb.y1) / 2], z1 = sp.z + Math.max(sp.h, FH);
      const hit = verticals.find((v) => Math.hypot(v.c[0] - c[0], v.c[1] - c[1]) < 2.5 + 0.25 * Math.max(v.bb.x1 - v.bb.x0, v.bb.y1 - v.bb.y0));
      if (hit) {
        hit.z0 = Math.min(hit.z0, sp.z); hit.z1 = Math.max(hit.z1, z1);
        const r = span(hit.z0, hit.z1); hit.k0 = r[0]; hit.k1 = r[1];
      } else {
        const r = span(sp.z, z1);
        verticals.push({ kind: /STAIR/.test(sp.name) ? 'STAIR' : 'CORE', c: c, bb: { x0: sp.bb.x0, y0: sp.bb.y0, x1: sp.bb.x1, y1: sp.bb.y1 }, k0: r[0], k1: r[1], z0: sp.z, z1: z1 });
      }
    }
    const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
    const levels = [];
    let routeLen = 0, depth = 0;
    const plot = info.plot;
    for (let k = 0; k < N; k++) {
      const a = D + k * FH, mid = a + FH / 2, nodes = [];
      for (const sp of M.spaces) {
        if (sp.kind === 'water') continue;
        const on = ENCLOSED[sp.kind] ? sp.z <= mid && mid < sp.z + Math.max(sp.h, 0.01) : OPEN[sp.kind] && Math.abs(sp.z - a) < 1.0;
        if (on) nodes.push({ kind: sp.kind, name: sp.name, bb: sp.bb, c: [(sp.bb.x0 + sp.bb.x1) / 2, (sp.bb.y0 + sp.bb.y1) / 2], area: sp.area });
      }
      for (const v of verticals) if (v.k0 <= k && k <= v.k1) nodes.push({ kind: 'vertical', name: v.kind, bb: v.bb, c: v.c, area: 0 });
      const edges = [];
      if (nodes.length > 1) {
        const inT = new Array(nodes.length).fill(false), best = nodes.map(() => ({ d: Infinity, from: -1 }));
        inT[0] = true;
        for (let j = 1; j < nodes.length; j++) best[j] = { d: gap(nodes[0].bb, nodes[j].bb) + 1e-3 * Math.hypot(nodes[0].c[0] - nodes[j].c[0], nodes[0].c[1] - nodes[j].c[1]), from: 0 };
        for (let it = 1; it < nodes.length; it++) {
          let m = -1;
          for (let j = 0; j < nodes.length; j++) if (!inT[j] && (m < 0 || best[j].d < best[m].d)) m = j;
          inT[m] = true;
          const f = best[m].from, len = Math.hypot(nodes[m].c[0] - nodes[f].c[0], nodes[m].c[1] - nodes[f].c[1]);
          edges.push({ a: f, b: m, len: len, far: gap(nodes[f].bb, nodes[m].bb) > 3 });
          routeLen += len;
          for (let j = 0; j < nodes.length; j++) if (!inT[j]) {
            const d = gap(nodes[m].bb, nodes[j].bb) + 1e-3 * Math.hypot(nodes[m].c[0] - nodes[j].c[0], nodes[m].c[1] - nodes[j].c[1]);
            if (d < best[j].d) best[j] = { d: d, from: m };
          }
        }
      }
      // the way in (ground level) or the vertical that brings you here (upper levels)
      let root = -1, entry = null;
      if (k === 0) {
        const es = entrySteps.length ? entrySteps[0].c : [plot.x + plot.w / 2, plot.y + plot.d];
        entry = { p: es, steps: entrySteps.length > 0 };
        let bd = Infinity;
        nodes.forEach((n, j) => { const d = Math.hypot(n.c[0] - es[0], n.c[1] - es[1]); if (d < bd) { bd = d; root = j; } });
      } else {
        root = nodes.findIndex((n) => n.kind === 'vertical');
      }
      const hop = nodes.map(() => -1);
      if (root >= 0) {
        hop[root] = 0;
        let changed = true;
        while (changed) { changed = false; for (const e of edges) { if (hop[e.a] >= 0 && hop[e.b] < 0) { hop[e.b] = hop[e.a] + 1; changed = true; } else if (hop[e.b] >= 0 && hop[e.a] < 0) { hop[e.a] = hop[e.b] + 1; changed = true; } } }
        for (const h of hop) if (h > depth) depth = h;
      }
      levels.push({ k: k, nodes: nodes, edges: edges, entry: entry, root: root, hop: hop });
    }
    return { levels: levels, verticals: verticals, entrySteps: entrySteps.length, routeLen: routeLen, depth: depth, nodes: levels.reduce((n, l) => n + l.nodes.length, 0) };
  }

  // everything a sheet can quote, measured from the model
  function derive(M, scene, info) {
    const bs = bodies(M, scene, info.buildingSolids).filter((b) => b.cls !== 'other');
    M.bodies = bs;
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
    let bay = null, bayCV = null;
    if (cols.length >= 4) {
      const pts = cols.map((c) => [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2]), ds = [];
      for (const p of pts) { let m = Infinity; for (const r of pts) if (r !== p) m = Math.min(m, Math.hypot(p[0] - r[0], p[1] - r[1])); if (m < Infinity && m > 0.3) ds.push(m); }
      ds.sort((a, b) => a - b);
      if (ds.length) {
        bay = ds[Math.floor(ds.length / 2)];
        const mu = ds.reduce((a, b) => a + b, 0) / ds.length;
        bayCV = mu > 0 ? Math.sqrt(ds.reduce((a, b) => a + (b - mu) * (b - mu), 0) / ds.length) / mu : null;
      }
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
    const programme = {}, groups = {};
    for (const sp of M.spaces) {
      if (ENCLOSED[sp.kind]) { gfa += sp.area; if (sp.kind === 'room' || sp.kind === 'unit') { rooms++; programme[sp.name] = (programme[sp.name] || 0) + 1; } }
      else if (OPEN[sp.kind]) open += sp.area;
      if (ENCLOSED[sp.kind] || OPEN[sp.kind]) { const g = groupOf(sp); groups[g] = (groups[g] || 0) + sp.area; }
    }
    const circ = circulation(M, bs.filter((b) => b.cls === 'core' || b.cls === 'stair'), info);

    return Object.assign(q, {
      footprint: footprint, fill: envW * envD > 0 ? footprint / (envW * envD) : 0, envelope: { w: envW, d: envD, h: z1 }, envVol: envVol,
      solidVol: solidVol, density: envVol > 0 ? solidVol / envVol : 0, height: z1, slenderness: footprint > 0 ? z1 / Math.sqrt(footprint) : 0,
      levelArea: levelArea, groundOpen: footprint > 0 ? Math.max(0, 1 - groundCover / footprint) : null,
      columns: cols.length, wallLen: wallLen, bay: bay, volumes: vol, structure: structure,
      gfa: gfa, rooms: rooms, programme: programme, open: open, groups: groups, bayCV: bayCV, circ: circ,
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

  global.Model = { create: create, derive: derive, bands: bands, classify: classify, groupOf: groupOf, GROUPS: GROUPS, polyArea: polyArea, polyCentroid: polyCentroid };
})(window);
