/*
 * diagrams.js — sheet A-06: the building as diagrams, every one derived from the model.
 *
 * Six panels in the drawing frame, two across and three down:
 *   D1 STRUCTURE      what carries the building at the ground cut: columns, walls, cores, masses, the grid
 *   D2 SOLID / VOID   the ground plan as figure and ground: solid, enclosed void, open void
 *   D3 CIRCULATION    the route through the spaces of the ground level, the way in, the verticals
 *   D4 LEVELS         the building exploded into its levels, in axonometric
 *   D5 PROGRAMME      floor area by programme group
 *   D6 FIGURES        floor area by level, and the building's measured proportions
 *
 * Nothing here is asserted: every figure is read from Model.derive (state.model.q) and the
 * bodies it classified (state.model.bodies). The circulation diagram is a minimum spanning
 * tree over the spaces of the level, a diagram of access and not a layout of doors.
 *
 *   Diagrams.paint(hand, state)
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom;
  const KEY = [48, 54, 64], ACC = [226, 112, 74], SOFT = [128, 136, 150];
  const T1 = { color: KEY, alpha: 215 }, T2 = { color: [70, 76, 88], alpha: 185 };
  const HAIR = { color: KEY, alpha: 120, weight: 0.8, wob: 0.3 };
  const EDGE = { color: KEY, alpha: 200, weight: 1.0, wob: 0.3 };
  const HEAVY = { color: KEY, alpha: 235, weight: 2.1, wob: 0.35 };

  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const f0 = (v) => Math.round(v).toString();
  const f1 = (v) => v.toFixed(1);

  function layout(F) {
    const gx = 30, gy = 30, w = (F.w - gx) / 2, h = (F.h - 2 * gy) / 3, out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const x = F.x + c * (w + gx), y = F.y + r * (h + gy);
      out.push({ x: x, y: y, w: w, h: h, inner: { x: x + 16, y: y + 36, w: w - 32, h: h - 36 - 34 } });
    }
    return out;
  }

  function frame(hand, p, title, caption) {
    hand.rect(p.x, p.y, p.w, p.h, { color: KEY, alpha: 95, weight: 0.8, wob: 0.3 });
    hand.text(title, p.x + 12, p.y + 10, 11, T1);
    hand.line([[p.x + 12, p.y + 28], [p.x + p.w - 12, p.y + 28]], { color: KEY, alpha: 70, weight: 0.6, wob: 0.2 });
    let sz = 8.5;
    while (sz > 6 && hand.textWidth(caption, sz) > p.w - 24) sz -= 0.5;
    hand.text(caption, p.x + 12, p.y + p.h - 20, sz, T1);
  }

  // the plan fit shared by D1 to D3: the plot centred in the panel
  function planFit(state, inner) {
    // fit to what is built (and what the spaces declare), not to the empty plot around it
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    for (const b of state.model.bodies) if (b.cls !== 'volume') grow(b.x0, b.y0, b.x1, b.y1);
    for (const sp of state.model.spaces) grow(sp.bb.x0, sp.bb.y0, sp.bb.x1, sp.bb.y1);
    const u = state.stats.union;
    if (!isFinite(x0)) { x0 = u.x; y0 = u.y; x1 = u.x + u.w; y1 = u.y + u.d; }
    const m = 3, w = x1 - x0 + 2 * m, d = y1 - y0 + 2 * m, s = Math.min(inner.w / w, inner.h / d);
    const ox = inner.x + inner.w / 2 - ((x0 + x1) / 2) * s, oy = inner.y + inner.h / 2 - ((y0 + y1) / 2) * s;
    return { s: s, P: (p) => [ox + p[0] * s, oy + p[1] * s], u: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, d: y1 - y0 + 2 * m } };
  }
  function clip(hand, r) { hand.clipPath(rectPts(r.x, r.y, r.x + r.w, r.y + r.h)); }
  function plotLine(hand, fit) {
    const u = fit.u, P = fit.P;
    hand.line([P([u.x, u.y]), P([u.x + u.w, u.y]), P([u.x + u.w, u.y + u.d]), P([u.x, u.y + u.d]), P([u.x, u.y])], { color: KEY, alpha: 120, weight: 0.8, wob: 0.3, dash: [8, 5] });
  }
  const cutZ = (state) => state.ortho.cutZ;
  const atCut = (b, z) => b.z0 < z && b.z1 > z;

  // a body's footprint as page points
  function bodyPts(b, P) { return (b.poly ? b.poly : rectPts(b.x0, b.y0, b.x1, b.y1)).map((q) => P(q)); }
  // a shell (walls round a room) is a heavy outline of the thickness; anything else a filled outline
  function drawShell(hand, b, P, s, pen) {
    const pts = bodyPts(b, P);
    hand.line(pts.concat([pts[0]]), Object.assign({}, pen, { weight: Math.max(1.4, Math.min(7, (b.thick || 0.4) * s)) }));
  }

  // ---- D1 STRUCTURE ----
  function structure(hand, state, p) {
    const M = state.model, q = M.q, fit = planFit(state, p.inner), P = fit.P, z = cutZ(state);
    clip(hand, p);
    const g = M.grids[0], u = fit.u, ext = { x0: u.x - 2, x1: u.x + u.w + 2, y0: u.y - 2, y1: u.y + u.d + 2 };
    if (g && g.xs.length > 1 && g.ys.length > 1) global.Ortho.gridLines(hand, g, P, ext, global.Ortho.labels(g.xs.length, true), global.Ortho.labels(g.ys.length, false));
    for (const b of M.bodies) if (b.cls === 'slab') { const pts = bodyPts(b, P); hand.line(pts.concat([pts[0]]), { color: SOFT, alpha: 90, weight: 0.7, wob: 0.3, dash: [3, 3] }); }
    for (const b of M.bodies) {
      if (!atCut(b, z) || b.cls === 'base' || b.cls === 'slab' || b.cls === 'volume') continue;
      const pts = bodyPts(b, P);
      if (b.cls === 'column') {
        const c = [(Math.min.apply(null, pts.map((a) => a[0])) + Math.max.apply(null, pts.map((a) => a[0]))) / 2, (Math.min.apply(null, pts.map((a) => a[1])) + Math.max.apply(null, pts.map((a) => a[1]))) / 2];
        const w = Math.max(5, Math.abs(P([b.x1, 0])[0] - P([b.x0, 0])[0]));
        hand.rect(c[0] - w / 2, c[1] - w / 2, w, w, EDGE, { color: ACC, alpha: 235, mode: 'flat' });
      } else if (b.thick) drawShell(hand, b, P, fit.s, { color: KEY, alpha: 225 });
      else if (b.cls === 'wall') hand.poly(pts, { color: KEY, alpha: 225, mode: 'flat' }, EDGE);
      else if (b.cls === 'core') hand.poly(pts, { color: ACC, alpha: 150, mode: 'cross', spacing: 3, angle: Math.PI / 4 }, HEAVY);
      else if (b.cls === 'stair') hand.poly(pts, { color: KEY, alpha: 120, mode: 'hatch', spacing: 2.4, angle: 0.4 }, HAIR);
      else hand.poly(pts, { color: KEY, alpha: 120, mode: 'hatch', spacing: 3.2, angle: Math.PI / 4 }, EDGE);
    }
    hand.unclip();
    const share = (k) => (q.volumes && q.solidVol ? Math.round((100 * q.volumes[k]) / q.solidVol) : 0);
    frame(hand, p, 'D1  STRUCTURE', q.structure + '   COLUMNS ' + q.columns + (q.bay ? '   BAY ' + f1(q.bay) + ' M' : '') + '   WALLS ' + f0(q.wallLen) + ' M   CORE ' + share('core') + ' %');
  }

  // ---- D2 SOLID / VOID ----
  function solidVoid(hand, state, p) {
    const M = state.model, q = M.q, fit = planFit(state, p.inner), P = fit.P, z = cutZ(state);
    clip(hand, p);
    // voids first: enclosed spaces as a tint, open ones as a stipple of hatch
    for (const sp of M.spaces) {
      if (sp.z > z + 0.5 || sp.z + Math.max(sp.h, 0.01) < z - 0.01 && sp.kind !== 'court' && sp.kind !== 'terrace') {
        if (!(sp.kind === 'court' || sp.kind === 'loggia' || sp.kind === 'water') || sp.z > z + 1.5) continue;
      }
      const pts = (sp.poly || rectPts(sp.bb.x0, sp.bb.y0, sp.bb.x1, sp.bb.y1)).map((a) => P(a));
      if (sp.kind === 'room' || sp.kind === 'service' || sp.kind === 'circulation' || sp.kind === 'unit') hand.poly(pts, { color: ACC, alpha: 80, mode: 'flat' }, null);
      else if (sp.kind === 'court' || sp.kind === 'loggia') hand.poly(pts, { color: KEY, alpha: 60, mode: 'hatch', spacing: 4, angle: -0.6 }, null);
      else if (sp.kind === 'water') hand.poly(pts, { color: KEY, alpha: 70, mode: 'hatch', spacing: 2.6, angle: 0 }, null);
    }
    for (const b of M.bodies) {
      if (!atCut(b, z) || b.cls === 'base' || b.cls === 'slab' || b.cls === 'volume' || b.cls === 'stair') continue;
      if (b.thick) { drawShell(hand, b, P, fit.s, { color: KEY, alpha: 240 }); continue; }
      const pts = bodyPts(b, P);
      hand.poly(pts, { color: KEY, alpha: 235, mode: 'flat' }, null);
    }
    hand.unclip();
    const dens = q.envVol ? (100 * q.solidVol) / q.envVol : 0;
    frame(hand, p, 'D2  SOLID / VOID', 'PLAN FILL ' + f0(100 * q.fill) + ' %   GROUND OPEN ' + (q.groundOpen === null ? 'NA' : f0(100 * q.groundOpen) + ' %') + '   SOLID / ENVELOPE ' + f1(dens) + ' %');
  }

  // ---- D3 CIRCULATION ----
  function arrow(hand, a, b, pen) {
    hand.line([a, b], pen);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    hand.poly([[b[0], b[1]], [b[0] - ux * 9 - uy * 4.5, b[1] - uy * 9 + ux * 4.5], [b[0] - ux * 9 + uy * 4.5, b[1] - uy * 9 - ux * 4.5]], { color: ACC, alpha: 235, mode: 'flat' }, null);
  }
  function circulation(hand, state, p) {
    const M = state.model, q = M.q, c = q.circ, fit = planFit(state, p.inner), P = fit.P;
    clip(hand, p);
    const L = c.levels[0];
    if (L && L.nodes.length) {
      for (const n of L.nodes) {
        if (n.kind === 'vertical') continue;
        const a = P([n.bb.x0, n.bb.y0]), b = P([n.bb.x1, n.bb.y1]);
        hand.rect(a[0], a[1], b[0] - a[0], b[1] - a[1], { color: KEY, alpha: 70, weight: 0.7, wob: 0.3 });
      }
      for (const e of L.edges) {
        const a = L.nodes[e.a], b = L.nodes[e.b];
        hand.line([P(a.c), P(b.c)], e.far ? { color: KEY, alpha: 160, weight: 1.1, wob: 0.3, dash: [6, 4] } : { color: KEY, alpha: 220, weight: 1.5, wob: 0.3 });
      }
      L.nodes.forEach((n, j) => {
        const pt = P(n.c);
        if (n.kind === 'vertical') {
          hand.rect(pt[0] - 5.5, pt[1] - 5.5, 11, 11, HEAVY, { color: ACC, alpha: 235, mode: 'flat' });
        } else hand.dot(pt[0], pt[1], 2.8, { color: KEY, alpha: 235 });
        if (L.hop[j] > 0 && n.kind !== 'vertical') hand.text(String(L.hop[j]), pt[0] + 4, pt[1] - 10, 6.5, T2);
      });
      if (L.entry && L.root >= 0) {
        const to = P(L.nodes[L.root].c), from = P(L.entry.p);
        const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1;
        const start = l < 26 ? [to[0] - (dx / l || 0) * 26, to[1] - (dy / l || 1) * 26] : from;
        arrow(hand, start, [to[0] - (dx / l) * 6, to[1] - (dy / l) * 6], { color: ACC, alpha: 235, weight: 2.4, wob: 0.3 });
        hand.text('ENTRY', start[0] + 6, start[1] - 2, 8, T1);
      }
      for (const v of c.verticals) {
        if (v.k0 > 0) continue;
        const pt = P(v.c);
        hand.text(v.kind + ' L' + (v.k0 + 1) + (v.k1 > v.k0 ? '-' + (v.k1 + 1) : ''), pt[0] + 8, pt[1] + 3, 7, T1);
      }
    } else hand.text('NO SPACES DECLARED AT THIS LEVEL', p.inner.x + 8, p.inner.y + p.inner.h / 2, 8, T2);
    hand.unclip();
    frame(hand, p, 'D3  CIRCULATION   LEVEL 1', 'ROUTE ' + f0(c.routeLen) + ' M   DEPTH ' + c.depth + '   VERTICALS ' + c.verticals.length + '   NODES ' + c.nodes + (L && L.entry ? (L.entry.steps ? '   ENTRY STEPS' : '   ENTRY SOUTH') : ''));
  }

  // ---- D4 LEVELS exploded ----
  function exploded(hand, state, p) {
    const M = state.model, q = M.q, FH = q.floorH, D = q.datum, N = Math.max(1, q.levels), gap = FH * 1.5;
    const per = []; for (let k = 0; k < N; k++) per.push([]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of M.bodies) {
      if (b.cls === 'volume' || b.cls === 'stair') continue;
      for (let k = 0; k < N; k++) {
        const a = D + k * FH, t = a + FH;
        if (b.z0 < t - 0.2 && b.z1 > a + 0.2 && !(b.cls === 'slab' && b.z1 > t + 0.5)) per[k].push(b);
      }
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (!isFinite(x0)) { frame(hand, p, 'D4  LEVELS', 'NO BODIES'); return; }
    const zTop = (N + 0.4) * gap;
    const pts3 = [];
    for (const xx of [x0, x1]) for (const yy of [y0, y1]) for (const zz of [0, zTop]) pts3.push(global.ISO.proj([xx, yy, zz]));
    const bx0 = Math.min.apply(null, pts3.map((a) => a[0])), bx1 = Math.max.apply(null, pts3.map((a) => a[0]));
    const by0 = Math.min.apply(null, pts3.map((a) => a[1])), by1 = Math.max.apply(null, pts3.map((a) => a[1]));
    const s = Math.min((p.inner.w - 50) / (bx1 - bx0), p.inner.h / (by1 - by0));
    const ox = p.inner.x + 25 + p.inner.w / 2 - ((bx0 + bx1) / 2) * s, oy = p.inner.y + p.inner.h / 2 - ((by0 + by1) / 2) * s;
    const P = (a) => { const r = global.ISO.proj(a); return [ox + r[0] * s, oy + r[1] * s]; };
    clip(hand, p);
    // the four envelope corners, dashed, through every level
    for (const [xx, yy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) hand.line([P([xx, yy, 0]), P([xx, yy, zTop])], { color: KEY, alpha: 60, weight: 0.6, wob: 0.2, dash: [3, 4] });
    const box = (b, ze, h, col, alpha) => {
      if (b.poly) {
        const top = b.poly.map((q2) => P([q2[0], q2[1], ze + h]));
        const bot = b.poly.map((q2) => P([q2[0], q2[1], ze]));
        hand.poly(bot, { color: col, alpha: alpha * 0.6, mode: 'flat' }, null);
        for (let i = 0; i < bot.length; i++) { const j = (i + 1) % bot.length; hand.poly([bot[i], bot[j], top[j], top[i]], { color: G.shade(col, 0.9), alpha: alpha * 0.7, mode: 'flat' }, HAIR); }
        hand.poly(top, { color: G.shade(col, 1.08), alpha: alpha, mode: 'flat' }, EDGE);
        return;
      }
      const f = G.boxFaces(b.x0, b.y0, ze, b.x1 - b.x0, b.y1 - b.y0, h);
      hand.poly(f.left.map(P), { color: G.shade(col, 1.0), alpha: alpha, mode: 'flat' }, HAIR);
      hand.poly(f.right.map(P), { color: G.shade(col, 0.86), alpha: alpha, mode: 'flat' }, HAIR);
      hand.poly(f.top.map(P), { color: G.shade(col, 1.08), alpha: alpha, mode: 'flat' }, EDGE);
    };
    for (let k = 0; k < N; k++) {
      const ze = k * gap;
      // the level's plate: the extent of what stands on it
      const bs = per[k];
      if (bs.length) {
        let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
        for (const b of bs) { a0 = Math.min(a0, b.x0); b0 = Math.min(b0, b.y0); a1 = Math.max(a1, b.x1); b1 = Math.max(b1, b.y1); }
        hand.poly([P([a0, b0, ze]), P([a1, b0, ze]), P([a1, b1, ze]), P([a0, b1, ze])], { color: SOFT, alpha: 70, mode: 'flat' }, { color: KEY, alpha: 130, weight: 0.8, wob: 0.3, dash: [6, 4] });
        const ord = bs.slice().sort((a, b) => (a.x0 + a.y0 + a.z0) - (b.x0 + b.y0 + b.z0));
        for (const b of ord) {
          const hh = Math.max(0.15, Math.min(b.z1, D + (k + 1) * FH) - Math.max(b.z0, D + k * FH));
          if (b.cls === 'slab') box(b, ze, Math.min(hh, 0.3), SOFT, 120);
          else if (b.cls === 'column') box(b, ze, hh, ACC, 235);
          else if (b.cls === 'core') box(b, ze, hh, ACC, 170);
          else if (b.cls === 'base') box(b, ze, Math.min(hh, 0.6), SOFT, 110);
          else box(b, ze, hh, KEY, b.cls === 'wall' ? 215 : 130);
        }
      }
      const lp = P([x0, y1, ze]);
      hand.text('L' + (k + 1), lp[0] - 24, lp[1] - 4, 9, T1);
    }
    // the roof, as an outline at the top
    const zr = N * gap;
    hand.poly([P([x0, y0, zr]), P([x1, y0, zr]), P([x1, y1, zr]), P([x0, y1, zr])], null, { color: KEY, alpha: 150, weight: 0.9, wob: 0.3, dash: [6, 4] });
    const rp = P([x0, y1, zr]);
    hand.text('ROOF', rp[0] - 32, rp[1] - 4, 9, T1);
    hand.unclip();
    frame(hand, p, 'D4  LEVELS', q.levels + ' LEVEL' + (q.levels > 1 ? 'S' : '') + '   HEIGHT ' + f1(q.height) + ' M   FLOOR TO FLOOR ' + f1(q.floorH) + ' M   ' + q.circ.verticals.length + ' VERTICAL' + (q.circ.verticals.length === 1 ? '' : 'S'));
  }

  // ---- D5 PROGRAMME ----
  function programme(hand, state, p) {
    const q = state.model.q, rows = Object.keys(q.groups || {}).map((k) => [k, q.groups[k]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const I = p.inner;
    if (!rows.length) hand.text('NO PROGRAMME DECLARED', I.x + 8, I.y + I.h / 2, 8, T2);
    else {
      const lw = 96, vw = 58, bw = I.w - lw - vw, mx = rows[0][1], bh = Math.min(22, (I.h - 6) / rows.length - 8);
      rows.forEach((r, i) => {
        const y = I.y + 6 + i * (bh + 8), len = Math.max(2, (r[1] / mx) * bw);
        hand.text(r[0], I.x + 2, y + bh / 2 - 4, 8, T1);
        if (r[0] === 'OPEN') hand.rect(I.x + lw, y, len, bh, EDGE, { color: KEY, alpha: 130, mode: 'hatch', spacing: 3, angle: -0.6 });
        else hand.rect(I.x + lw, y, len, bh, EDGE, { color: ACC, alpha: 215, mode: 'flat' });
        hand.text(f0(r[1]) + ' M2', I.x + lw + len + 6, y + bh / 2 - 4, 8, T2);
      });
    }
    frame(hand, p, 'D5  PROGRAMME', 'FLOOR AREA ' + f0(q.gfa) + ' M2   OPEN SPACE ' + f0(q.open) + ' M2   ROOMS ' + q.rooms + '   ' + (q.plotArea ? 'FLOOR AREA / PLOT ' + (q.gfa / q.plotArea).toFixed(2) : ''));
  }

  // ---- D6 FIGURES ----
  function figures(hand, state, p) {
    const q = state.model.q, I = p.inner, la = q.levelArea || [];
    const bw = I.w * 0.5, mx = Math.max.apply(null, la.concat([1])), n = Math.max(1, la.length), slot = bw / n, w = Math.min(34, slot * 0.6);
    hand.line([[I.x, I.y + I.h - 14], [I.x + bw, I.y + I.h - 14]], HAIR);
    la.forEach((a, k) => {
      const h = (a / mx) * (I.h - 44), x = I.x + k * slot + (slot - w) / 2, y = I.y + I.h - 14 - h;
      hand.rect(x, y, w, h, EDGE, { color: ACC, alpha: 200, mode: 'flat' });
      hand.text(f0(a), x + w / 2 - hand.textWidth(f0(a), 7) / 2, y - 11, 7, T1);
      hand.text('L' + (k + 1), x + w / 2 - hand.textWidth('L' + (k + 1), 7.5) / 2, I.y + I.h - 8, 7.5, T2);
    });
    if (q.footprint) {
      const y = I.y + I.h - 14 - (q.footprint / mx) * (I.h - 44);
      hand.line([[I.x, y], [I.x + bw, y]], { color: KEY, alpha: 150, weight: 0.8, wob: 0.2, dash: [6, 4] });
    }
    // the proportions, as a list beside the bars
    const e = q.envelope, rows = [
      ['ENVELOPE', f0(e.w) + ' X ' + f0(e.d) + ' X ' + f0(e.h) + ' M'], ['FOOTPRINT', f0(q.footprint) + ' M2'],
      ['SOLID VOLUME', f0(q.solidVol) + ' M3'], ['SOLID / ENVELOPE', (q.envVol ? (100 * q.solidVol) / q.envVol : 0).toFixed(1) + ' %'],
      ['SLENDERNESS', q.slenderness.toFixed(2)], ['STRUCTURE', q.structure], ['COLUMNS', String(q.columns)], ['WALL LENGTH', f0(q.wallLen) + ' M'],
    ];
    const x = I.x + bw + 20;
    rows.forEach((r, i) => {
      hand.text(r[0], x, I.y + 4 + i * 34, 7, T2);
      hand.text(r[1], x, I.y + 4 + i * 34 + 13, 9, T1);
    });
    frame(hand, p, 'D6  FIGURES', 'FLOOR AREA BY LEVEL, M2   DASHED: FOOTPRINT ' + f0(q.footprint) + ' M2');
  }

  function paint(hand, state) {
    const F = global.Sheet.layout({ schedule: state.spec.schedule }).frame, ps = layout(F);
    structure(hand, state, ps[0]);
    solidVoid(hand, state, ps[1]);
    circulation(hand, state, ps[2]);
    exploded(hand, state, ps[3]);
    programme(hand, state, ps[4]);
    figures(hand, state, ps[5]);
    return null;
  }

  global.Diagrams = { paint: paint, layout: layout };
})(window);
