/*
 * sheet.js — the drawing's chrome: title block, north arrow, palette swatches,
 * the drawing frame with its floor scale, and the footer's legend / project /
 * specification boxes. Layout is in sheet units on a 1500 × 2000 portrait sheet.
 *
 *   const L = Sheet.layout();              // the rectangles, for marginalia to avoid
 *   Sheet.draw(hand, meta, floors);        // meta from the style + the sketch
 */
(function (global) {
  'use strict';

  const W = 1500, H = 2000;

  function layout() {
    return {
      W: W, H: H,
      title: { x: 75, y: 45, w: 1350, h: 130 },
      titleDiv: [525, 1290],
      frame: { x: 178, y: 205, w: 1252, h: 1565 },
      footer: { x: 75, y: 1795, w: 1350, h: 160 },
      footerDiv: [325, 1075],
      scaleX: 40,
    };
  }

  const CHROME = { color: [58, 64, 74], alpha: 190, weight: 1.05, wob: 0.45, overshoot: 1.5 };
  const CHROME2 = { color: [58, 64, 74], alpha: 120, weight: 0.8, wob: 0.4 };
  const TXT = { color: [48, 54, 64], alpha: 215 };
  const TXT2 = { color: [70, 76, 88], alpha: 185 };

  // ---- legend glyphs: small icons keyed by kind ----
  const SYM = {
    sq: (h, x, y, s) => h.rect(x, y, s, s, CHROME2),
    sqf: (h, x, y, s) => h.rect(x, y, s, s, CHROME2, { color: [120, 126, 136], alpha: 90, mode: 'flat' }),
    sqh: (h, x, y, s) => h.rect(x, y, s, s, CHROME2, { color: [70, 76, 88], alpha: 150, mode: 'hatch', spacing: 1.6, angle: 0.8 }),
    grid: (h, x, y, s) => { h.rect(x, y, s, s, CHROME2); h.line([[x + s / 2, y], [x + s / 2, y + s]], CHROME2); h.line([[x, y + s / 2], [x + s, y + s / 2]], CHROME2); },
    diag: (h, x, y, s) => { h.rect(x, y, s, s, CHROME2); h.line([[x, y + s], [x + s, y]], CHROME2); },
    circ: (h, x, y, s) => h.circle(x + s / 2, y + s / 2, s / 2, CHROME2),
    dot: (h, x, y, s) => h.dot(x + s / 2, y + s / 2, s * 0.22, CHROME2),
    tri: (h, x, y, s) => h.poly([[x, y + s], [x + s, y + s], [x + s / 2, y]], null, CHROME2),
    tee: (h, x, y, s) => { h.line([[x, y], [x + s, y]], CHROME2); h.line([[x + s / 2, y], [x + s / 2, y + s]], CHROME2); },
    bar: (h, x, y, s) => h.rect(x + s * 0.3, y, s * 0.4, s, CHROME2),
    dash: (h, x, y, s) => h.line([[x, y + s / 2], [x + s, y + s / 2]], CHROME2),
    wave: (h, x, y, s) => h.line([[x, y + s * 0.6], [x + s * 0.25, y + s * 0.35], [x + s * 0.5, y + s * 0.6], [x + s * 0.75, y + s * 0.35], [x + s, y + s * 0.6]], CHROME2),
    hex: (h, x, y, s) => { const c = [x + s / 2, y + s / 2]; const p = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; p.push([c[0] + Math.cos(a) * s / 2, c[1] + Math.sin(a) * s / 2]); } h.poly(p, null, CHROME2); },
    dome: (h, x, y, s) => { const p = []; for (let i = 0; i <= 8; i++) { const a = Math.PI - (i / 8) * Math.PI; p.push([x + s / 2 + Math.cos(a) * s / 2, y + s - Math.sin(a) * s * 0.8]); } h.line(p, CHROME2); h.line([[x, y + s], [x + s, y + s]], CHROME2); },
    x: (h, x, y, s) => { h.line([[x, y], [x + s, y + s]], CHROME2); h.line([[x + s, y], [x, y + s]], CHROME2); },
    step: (h, x, y, s) => h.line([[x, y + s], [x, y + s * 0.66], [x + s * 0.33, y + s * 0.66], [x + s * 0.33, y + s * 0.33], [x + s * 0.66, y + s * 0.33], [x + s * 0.66, y], [x + s, y]], CHROME2),
    ramp: (h, x, y, s) => h.poly([[x, y + s], [x + s, y + s * 0.2], [x + s, y + s * 0.45], [x, y + s]], null, CHROME2),
    cols: (h, x, y, s) => { for (let i = 0; i < 4; i++) h.line([[x + (i / 3) * s, y], [x + (i / 3) * s, y + s]], CHROME2); },
  };

  function box(hand, r) {
    hand.rect(r.x, r.y, r.w, r.h, CHROME);
  }

  function northArrow(hand, cx, cy, r) {
    hand.text('N', cx, cy - r - 30, 14, TXT, { align: 'center' });
    hand.circle(cx, cy, r, CHROME);
    hand.circle(cx, cy, r * 0.82, CHROME2, null);
    hand.line([[cx, cy + r * 0.7], [cx, cy - r * 0.7]], CHROME);
    hand.line([[cx - r * 0.25, cy - r * 0.35], [cx, cy - r * 0.7], [cx + r * 0.25, cy - r * 0.35]], CHROME);
  }

  function swatches(hand, x, y, colors, s) {
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      hand.rect(x + i * (s + 20), y, s, s, CHROME2, { color: c, alpha: 200, mode: 'pencil', spacing: 1.8 });
    }
  }

  function scaleBar(hand, x, y, w, label) {
    hand.line([[x, y], [x + w, y]], CHROME);
    const n = 4;
    for (let i = 0; i <= n; i++) hand.line([[x + (i / n) * w, y - 4], [x + (i / n) * w, y + 4]], CHROME);
    for (let i = 0; i < n; i += 2) hand.rect(x + (i / n) * w, y - 2, w / n, 2, null, { color: [58, 64, 74], alpha: 200, mode: 'flat' });
    hand.text('0', x, y + 12, 9, TXT2, { align: 'center' });
    hand.text(label || '1:100', x + w / 2, y + 12, 9, TXT2, { align: 'center' });
    hand.text('M', x + w, y + 12, 9, TXT2, { align: 'center' });
  }

  // F1 … Fn up the left margin, aligned to the building's floor lines
  function floorScale(hand, x, yBase, step, n) {
    if (!(n > 0) || !(step > 0)) return;
    const top = yBase - (n - 1) * step;
    hand.line([[x, yBase + step * 0.55], [x, top - step * 0.55]], CHROME2);
    for (let i = 0; i < n; i++) {
      const y = yBase - i * step;
      hand.line([[x - 6, y], [x + 6, y]], CHROME2);
      hand.text('F' + (i + 1), x + 34, y - 7, 14, TXT, { align: 'left' });
    }
    hand.line([[x - 8, yBase + step * 0.55], [x + 8, yBase + step * 0.55]], CHROME2);
    hand.line([[x - 8, top - step * 0.55], [x + 8, top - step * 0.55]], CHROME2);
  }

  function kvLine(hand, x, y, key, val, size) {
    const s = size || 10;
    hand.text(key, x, y, s, TXT2);
    hand.text(String(val), x + hand.textWidth(key, s) + s * 0.9, y, s, TXT);
  }

  function draw(hand, meta, floorInfo) {
    const L = layout();
    const T = L.title, F = L.footer, FR = L.frame;

    // ---- title block ----
    box(hand, T);
    for (const dx of L.titleDiv) hand.line([[dx, T.y], [dx, T.y + T.h]], CHROME);
    hand.text(meta.title, T.x + 12, T.y + 22, 24, TXT, { bold: true, tracking: 1.02 });
    hand.text(meta.subtitle, T.x + 12, T.y + 58, 13, TXT2);
    hand.text('DWG: ' + meta.dwg, T.x + 12, T.y + 97, 11, TXT2);
    hand.text('SHEET ' + (meta.sheet || '1/1'), T.x + 248, T.y + 97, 11, TXT2);

    const mx = L.titleDiv[0] + 14;
    kvLine(hand, mx, T.y + 22, 'VIEW:', meta.view || 'AXONOMETRIC', 11);
    kvLine(hand, mx, T.y + 47, 'DETAIL:', meta.detail, 11);
    kvLine(hand, mx, T.y + 72, 'DENSITY:', meta.density, 11);
    kvLine(hand, mx, T.y + 97, 'SITE:', meta.site, 11);

    // swatches sit in the right third of the middle box
    const sw = meta.palette || [];
    const swS = 22;
    const swX = L.titleDiv[1] - 24 - sw.length * (swS + 20) + 20;
    swatches(hand, swX, T.y + 52, sw, swS);

    northArrow(hand, L.titleDiv[1] + (T.x + T.w - L.titleDiv[1]) / 2, T.y + 84, 24);

    // ---- drawing frame ----
    box(hand, FR);

    if (floorInfo && floorInfo.n) floorScale(hand, L.scaleX, floorInfo.yBase, floorInfo.step, floorInfo.n);

    // ---- footer ----
    box(hand, F);
    for (const dx of L.footerDiv) hand.line([[dx, F.y], [dx, F.y + F.h]], CHROME);

    // legend
    hand.text('LEGEND', F.x + 12, F.y + 12, 13, TXT);
    hand.line([[F.x + 10, F.y + 30], [L.footerDiv[0] - 10, F.y + 30]], CHROME2);
    const leg = meta.legend || [];
    for (let i = 0; i < leg.length && i < 10; i++) {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const x = F.x + 14 + col * 112, y = F.y + 44 + row * 23;
      const s = 8;
      const g = SYM[leg[i].sym] || SYM.sq;
      g(hand, x, y + 1, s);
      hand.text(leg[i].name + '(' + leg[i].count + ')', x + s + 9, y + 1, 8.5, TXT2);
    }

    // project
    const cx = (L.footerDiv[0] + L.footerDiv[1]) / 2;
    hand.text('PROJECT ' + meta.project, cx, F.y + 12, 13, TXT, { align: 'center' });
    hand.line([[L.footerDiv[0] + 10, F.y + 30], [L.footerDiv[1] - 10, F.y + 30]], CHROME2);
    scaleBar(hand, cx - 100, F.y + 88, 200, meta.scale || '1:100');
    hand.text(meta.type, cx, F.y + 132, 10, TXT2, { align: 'center' });

    // specification
    const sx = L.footerDiv[1] + 12;
    hand.text(meta.header, sx, F.y + 12, 13, TXT, { tracking: 1.02 });
    hand.line([[L.footerDiv[1] + 10, F.y + 30], [F.x + F.w - 10, F.y + 30]], CHROME2);
    const kv = meta.kv || [];
    for (let i = 0; i < kv.length && i < 10; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = sx + col * 168, y = F.y + 44 + row * 23;
      kvLine(hand, x, y + 1, kv[i][0] + ':', kv[i][1], 8.5);
    }
  }

  global.Sheet = { layout: layout, draw: draw, SYM: SYM, CHROME: CHROME, CHROME2: CHROME2, TXT: TXT, TXT2: TXT2 };
})(window);
