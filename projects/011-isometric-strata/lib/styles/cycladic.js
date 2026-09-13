/*
 * styles/cycladic.js — CYCLADIC: the white village on its slope.
 *
 * The first grammar built from a settlement rule rather than a building
 * rule. Terraces step up the hill behind low stone retaining walls; on
 * them a contiguous cluster of whitewashed cubes, one or two storeys,
 * every roof somebody's terrace behind a parapet, with pergolas and
 * chimneys; external stairs climb the flanks; courts open between the
 * houses; a chapel carries a dome and a bell wall with arched openings;
 * some roofs are barrel vaults; blue is allowed on doors, shutters and
 * the dome and nowhere else; a windmill may stand on the ridge.
 *
 * Five tenets over the drawn scene: low-rise (no house above two storeys
 * over its ground), contiguous (one connected cluster), roof as terrace
 * (every flat roof has a parapet), stepped (ground rises row by row up
 * the slope), blue only on openings. Reported as TENETS n/5.
 */
(function (global) {
  'use strict';

  const G = global.ISO.geom, D = global.ISO.depth;

  const STYLE = {
    key: 'CYCLADIC',
    header: 'VERNACULAR',
    titles: ['CYCLADIC DIAGRAM', 'CHORA SECTION', 'WHITE VILLAGE', 'KASTRO STUDY', 'ISLAND STEPS'],
    substyles: ['CHORA', 'KASTRO', 'ANO MERIA', 'SKALA', 'MYLOS'],
    types: ['VILLAGE', 'CHORA', 'HAMLET', 'KASTRO'],
    palettes: ['ASVESTI', 'SANTORINI', 'FOLEGANDROS'],
    sites: [['HILLSIDE', 4], ['WATERFRONT', 3], ['PARK', 1]],
    shapes: ['RECTANGLE'],
    floors: [2, 2],
    legend: [
      ['CUBE', 'sq'], ['STAIR', 'step'], ['TERRACE', 'sqf'], ['COURT', 'grid'], ['DOME', 'dome'],
      ['VAULT', 'circ'], ['CHIMNEY', 'bar'], ['WALL', 'sqh'], ['ARCH', 'dome'], ['PERGOLA', 'cols'],
    ],

    size(rng, annex) {
      const cell = rng.range(3.2, 4.2);
      const nx = annex ? rng.int(2, 3) : rng.int(4, 6), ny = annex ? rng.int(2, 3) : rng.int(4, 6);
      return { w: nx * cell, d: ny * cell, nx: nx, ny: ny, cell: cell };
    },

    build(ctx) {
      const R = ctx.rng, S = ctx.scene, P = ctx.plot;
      const cell = P.cell, nx = P.nx, ny = P.ny;
      const c = ctx.palette.colors;
      const white = c[0], blue = c[1], stone = c[2], wood = c[3];
      const SH = R.range(2.6, 3.0); // a storey
      const EDGE = { alpha: 175, weight: 0.9, wob: 0.9, passes: 1 };
      const THIN = { alpha: 140, weight: 0.75, wob: 0.8 };
      const FAINT = { alpha: 70, weight: 0.6, wob: 0.7 };
      const gap = 0.5;

      // ---- the terraces: ground rises row by row toward -x ----
      const riser = R.range(0.8, 1.4);
      const ground = [];
      for (let i = 0; i < nx; i++) ground.push((nx - 1 - i) * riser);
      for (let i = 0; i < nx; i++) {
        if (ground[i] <= 0) continue;
        const x = P.x + i * cell;
        S.box(x, P.y - 0.6, 0, cell, P.d + 1.2, ground[i], { color: stone, alpha: 110, mode: 'hatch', spacing: 2.6, angle: 'edge', edge: EDGE, tag: 'wall' });
        // the stones of the retaining wall, on its downhill face
        for (let k = 0; k < 6; k++) {
          const y = P.y - 0.6 + R.range(0, P.d + 1.2), z = R.range(0.1, ground[i] - 0.2);
          S.line([[x + cell, y, z], [x + cell, y + R.range(0.3, 0.8), z + R.range(-0.1, 0.1)]], FAINT, { depth: D([x + cell, y, z]) + 0.05 });
        }
        S.count('WALL');
      }

      // ---- a contiguous cluster grown from a seed cell ----
      const occ = [];
      for (let i = 0; i < nx; i++) { occ.push([]); for (let j = 0; j < ny; j++) occ[i].push(false); }
      const target = Math.round(nx * ny * R.range(0.5, 0.7));
      const cells = [];
      let cur = [R.int(1, nx - 2), R.int(1, ny - 2)];
      occ[cur[0]][cur[1]] = true; cells.push(cur);
      let guard = 0;
      while (cells.length < target && guard++ < 500) {
        const from = R.pick(cells);
        const d = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const n = [from[0] + d[0], from[1] + d[1]];
        if (n[0] < 0 || n[1] < 0 || n[0] >= nx || n[1] >= ny || occ[n[0]][n[1]]) continue;
        occ[n[0]][n[1]] = true; cells.push(n);
      }

      // ---- houses ----
      const houses = [];
      const blueFaces = [];
      const shutter = (x, y, z, nrm, w, h, tag) => {
        const o = 0.03;
        const q = nrm === 'x'
          ? [[x + o, y, z], [x + o, y + w, z], [x + o, y + w, z + h], [x + o, y, z + h]]
          : [[x, y + o, z], [x + w, y + o, z], [x + w, y + o, z + h], [x, y + o, z + h]];
        S.face(q, { fill: { color: blue, alpha: 200, mode: 'flat' }, edge: THIN, tag: tag, depth: D(q[0]) + 0.2 });
        blueFaces.push(tag);
      };
      const chapel = R.pick(cells);
      const roles = {};
      for (const cl of cells) {
        const key = cl.join(',');
        if (cl === chapel) roles[key] = 'chapel';
        else roles[key] = R.weighted([['house', 7], ['court', 2], ['vault', 1.5]]);
      }
      for (const cl of cells) {
        const i = cl[0], j = cl[1], role = roles[cl.join(',')];
        const x = P.x + i * cell + gap / 2, y = P.y + j * cell + gap / 2, s = cell - gap;
        const z0 = ground[i];
        if (role === 'court') {
          // a walled court with a tree, paved
          S.box(x, y, z0, s, 0.25, 1.4, { color: white, alpha: 190, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: 'wall' });
          S.box(x + s - 0.25, y, z0, 0.25, s, 1.4, { color: white, alpha: 190, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: 'wall' });
          for (let k = 1; k < 4; k++) S.line([[x, y + s * k / 4, z0 + 0.01], [x + s, y + s * k / 4, z0 + 0.01]], FAINT, { depth: D([x + s, y + s, z0]) + 0.02 });
          global.Site.tree(ctx, x + s * 0.5, y + s * 0.5, R.range(0.8, 1.2));
          S.count('COURT');
          S.count('WALL', 2);
          continue;
        }
        const storeys = role === 'chapel' ? 1 : R.chance(0.45) ? 2 : 1;
        const h = storeys * SH;
        S.box(x, y, z0, s, s, h, { color: white, alpha: 200, mode: 'pencil', spacing: 2.6, edge: EDGE, tag: 'cube', shade: [1.0, 0.97, 0.9] });
        const house = { i: i, j: j, x: x, y: y, s: s, z0: z0, h: h, top: 'terrace', parapet: false };
        houses.push(house);
        S.count('CUBE');
        // a door on the +y face, shutters on the +x face
        shutter(x + s * R.range(0.15, 0.6), y + s, z0, 'y', 0.9, 2.0, 'door');
        for (let k = 0; k < storeys; k++) if (R.chance(0.8)) shutter(x + s, y + s * R.range(0.2, 0.6), z0 + k * SH + 1.0, 'x', 0.8, 1.0, 'shutter');
        if (role === 'vault') {
          // a barrel vault along y
          house.top = 'vault';
          const r = s / 2, n = 10;
          const ring = (yy) => { const pts = []; for (let a = 0; a <= n; a++) { const t = (a / n) * Math.PI; pts.push([x + r + Math.cos(Math.PI - t) * r, yy, z0 + h + Math.sin(t) * r * 0.8]); } return pts; };
          const front = ring(y + s), back = ring(y);
          S.face(front, { fill: { color: white, alpha: 200, mode: 'flat' }, edge: EDGE, tag: 'vault' });
          for (let a = 0; a <= n; a++) if (a % 2 === 0) S.line([back[a], front[a]], a === 0 || a === n ? EDGE : FAINT, { tag: 'vault', depth: D(front[a]) + 0.05 });
          S.count('VAULT');
        } else if (role === 'chapel') {
          house.top = 'dome';
          // the drum and dome, blue
          const cx = x + s / 2, cy = y + s / 2, dr = s * 0.32, dz = z0 + h;
          const drum = G.regular(cx, cy, dz, dr, 14);
          const dt = drum.map((p) => [p[0], p[1], dz + 0.9]);
          const pr = G.prism(drum, dt);
          for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: white, alpha: 200, mode: 'flat' }, edge: null, tag: 'drum' });
          S.line(dt.concat([dt[0]]), EDGE, { depth: D([cx + dr, cy + dr, dz + 0.9]) + 0.1, tag: 'drum' });
          const z1 = dz + 0.9;
          for (let lat = 0; lat <= 3; lat++) {
            const t = (lat / 4) * Math.PI / 2;
            const ring = G.regular(cx, cy, z1 + Math.sin(t) * dr, Math.cos(t) * dr, 20);
            S.face(ring, { fill: { color: blue, alpha: lat === 0 ? 150 : 90, mode: 'flat' }, edge: lat === 0 ? EDGE : FAINT, tag: 'dome', depth: D([cx + dr, cy + dr, z1 + Math.sin(t) * dr]) + 0.2 });
            blueFaces.push('dome');
          }
          S.line([[cx, cy, z1 + dr], [cx, cy, z1 + dr + 0.6]], THIN, { depth: D([cx, cy, z1 + dr]) + 0.3 });
          S.line([[cx - 0.25, cy, z1 + dr + 0.4], [cx + 0.25, cy, z1 + dr + 0.4]], THIN, { depth: D([cx, cy, z1 + dr]) + 0.3 });
          S.count('DOME');
          // the bell wall on the +y edge with arched openings
          const bw = s * 0.6, bx = x + s * 0.2, by = y + s - 0.25;
          S.box(bx, by, z0 + h, bw, 0.25, SH * 0.7, { color: white, alpha: 200, mode: 'pencil', spacing: 2.4, edge: EDGE, tag: 'bellwall' });
          const nA = bw > 2.2 ? 2 : 1;
          for (let a = 0; a < nA; a++) {
            const ax = bx + bw * (a + 0.5) / nA - 0.35, az = z0 + h + 0.3, aw = 0.7, ah = SH * 0.35;
            const pts = [[ax, by + 0.28, az], [ax + aw, by + 0.28, az], [ax + aw, by + 0.28, az + ah]];
            for (let k = 0; k <= 6; k++) { const t = (k / 6) * Math.PI; pts.push([ax + aw / 2 + Math.cos(t) * aw / 2, by + 0.28, az + ah + Math.sin(t) * aw / 2]); }
            pts.push([ax, by + 0.28, az + ah]);
            S.face(pts, { fill: { color: [120, 128, 140], alpha: 110, mode: 'flat' }, edge: THIN, tag: 'arch', depth: D(pts[0]) + 0.2 });
            S.line([[ax + aw / 2, by + 0.28, az + ah + aw / 2], [ax + aw / 2, by + 0.28, az + ah * 0.6]], THIN, { depth: D(pts[0]) + 0.25 }); // the bell
            S.count('ARCH');
          }
        } else {
          // a flat roof is a terrace: parapet, then a pergola or a chimney
          const pz = z0 + h;
          S.box(x - 0.05, y - 0.05, pz, s + 0.1, 0.22, 0.35, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'parapet' });
          S.box(x + s - 0.17, y - 0.05, pz, 0.22, s + 0.1, 0.35, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'parapet' });
          S.box(x - 0.05, y + s - 0.17, pz, s + 0.1, 0.22, 0.35, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'parapet' });
          S.box(x - 0.05, y - 0.05, pz, 0.22, s + 0.1, 0.35, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'parapet' });
          house.parapet = true;
          S.count('TERRACE');
          if (R.chance(0.35)) {
            const px0 = x + 0.4, py0 = y + 0.4, pw = s - 0.8, pd = s * 0.5, ph = 2.2;
            for (const [qx, qy] of [[px0, py0], [px0 + pw, py0], [px0, py0 + pd], [px0 + pw, py0 + pd]]) S.line([[qx, qy, pz], [qx, qy, pz + ph]], { color: wood, alpha: 180, weight: 0.9, wob: 0.5 }, { tag: 'pergola', depth: D([qx, qy, pz]) + 0.3 });
            for (let k = 0; k <= 5; k++) S.line([[px0 + pw * k / 5, py0, pz + ph], [px0 + pw * k / 5, py0 + pd, pz + ph]], { color: wood, alpha: 160, weight: 0.8, wob: 0.6 }, { tag: 'pergola', depth: D([px0 + pw, py0 + pd, pz + ph]) + 0.3 });
            S.line([[px0, py0, pz + ph], [px0 + pw, py0, pz + ph]], { color: wood, alpha: 180, weight: 0.9, wob: 0.5 }, { tag: 'pergola', depth: D([px0 + pw, py0 + pd, pz + ph]) + 0.3 });
            S.line([[px0, py0 + pd, pz + ph], [px0 + pw, py0 + pd, pz + ph]], { color: wood, alpha: 180, weight: 0.9, wob: 0.5 }, { tag: 'pergola', depth: D([px0 + pw, py0 + pd, pz + ph]) + 0.3 });
            S.count('PERGOLA');
          } else if (R.chance(0.6)) {
            const qx = x + s * R.range(0.15, 0.7), qy = y + s * R.range(0.15, 0.7);
            S.box(qx, qy, pz, 0.5, 0.5, 1.1, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'chimney' });
            S.box(qx - 0.1, qy - 0.1, pz + 1.1, 0.7, 0.7, 0.2, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'chimney' });
            S.count('CHIMNEY');
          }
        }
        // an external stair up the +x flank
        if (storeys === 2 && R.chance(0.6) || role === 'house' && R.chance(0.25)) {
          const steps = Math.round(SH / 0.25), rise = SH / steps, run = (s - 0.4) / steps;
          for (let k = 0; k < steps; k++) S.box(x + s, y + 0.2 + k * run, z0, 0.9, run, (k + 1) * rise, { color: white, alpha: 200, mode: 'flat', edge: THIN, tag: 'stair' });
          S.line([[x + s + 0.9, y + 0.2, z0 + 0.9], [x + s + 0.9, y + s - 0.2, z0 + SH + 0.9]], THIN, { depth: D([x + s + 0.9, y + s, z0]) + 0.2, tag: 'stair' });
          S.count('STAIR');
        }
      }

      // an arch across a lane between two neighbours
      for (const hA of houses) {
        const hB = houses.find((q) => q.i === hA.i + 1 && q.j === hA.j);
        if (!hB || !R.chance(0.3)) continue;
        const ax = hA.x + hA.s, ay = hA.y + hA.s * 0.5, aw = gap, az = Math.min(hA.z0, hB.z0) + 2.2;
        const pts = [[ax, ay, az], [ax + aw, ay, az]];
        for (let k = 0; k <= 6; k++) { const t = (k / 6) * Math.PI; pts.push([ax + aw / 2 + Math.cos(Math.PI - t) * aw / 2, ay, az + Math.sin(t) * aw / 2]); }
        S.line(pts, THIN, { depth: D([ax + aw, ay, az]) + 0.1, tag: 'arch' });
        S.count('ARCH');
      }

      // ---- the windmill on the ridge ----
      if (ctx.substyle === 'MYLOS' || R.chance(0.35)) {
        const mx = P.x - 2.5, my = P.y + P.d * R.range(0.2, 0.8), mz = ground[0], mr = 1.4, mh = 4.5;
        const base = G.regular(mx, my, mz, mr, 12), top = base.map((p) => [p[0], p[1], mz + mh]);
        const pr = G.prism(base, top);
        for (const f of pr.sides) if (f.visible) S.face(f.pts, { fill: { color: white, alpha: 200, mode: 'flat' }, edge: null, tag: 'mill' });
        S.line(top.concat([top[0]]), EDGE, { depth: D([mx + mr, my + mr, mz + mh]) + 0.1, tag: 'mill' });
        for (let k = 0; k < 12; k += 3) S.line([base[k], top[k]], FAINT, { depth: D(base[k]) + 0.05 });
        for (let k = 0; k < 12; k++) S.face([top[k], top[(k + 1) % 12], [mx, my, mz + mh + 1.6]], { fill: { color: wood, alpha: 120, mode: 'hatch', spacing: 2, angle: 'edge' }, edge: THIN, tag: 'mill', depth: D(top[k]) + 0.15 });
        const hub = [mx + mr + 0.4, my, mz + mh * 0.75];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          S.line([hub, [hub[0], hub[1] + Math.cos(a) * 3.2, hub[2] + Math.sin(a) * 3.2]], THIN, { depth: D(hub) + 0.5, tag: 'mill' });
        }
      }

      // ---- the tenets ----
      const lowRise = houses.every((h) => h.h <= 2 * SH + 0.05);
      const seen = new Set([cells[0].join(',')]);
      const stack = [cells[0]];
      while (stack.length) {
        const [i, j] = stack.pop();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (i + di) + ',' + (j + dj);
          if (occ[i + di] && occ[i + di][j + dj] && !seen.has(k)) { seen.add(k); stack.push([i + di, j + dj]); }
        }
      }
      const contiguous = seen.size === cells.length;
      const flat = houses.filter((h) => h.top === 'terrace');
      const roofTerrace = flat.length > 0 && flat.every((h) => h.parapet);
      let stepped = true;
      for (let i = 0; i + 1 < nx; i++) if (!(ground[i] > ground[i + 1])) stepped = false;
      const blueOnly = S.items.every((it) => !(it.kind === 'face' && it.fill && it.fill.color === blue) || ['door', 'shutter', 'dome'].indexOf(it.tag) >= 0);
      const tenets = [
        { name: 'LOW-RISE', ok: lowRise },
        { name: 'CONTIGUOUS', ok: contiguous },
        { name: 'ROOF AS TERRACE', ok: roofTerrace },
        { name: 'STEPPED', ok: stepped },
        { name: 'BLUE ON OPENINGS', ok: blueFaces.length > 0 && blueOnly },
      ];
      return { kv: [['TENETS', tenets.filter((t) => t.ok).length + '/5']], tenets: tenets };
    },
  };

  global.ISO.styles = global.ISO.styles || {};
  global.ISO.styles.cycladic = STYLE;
})(window);
