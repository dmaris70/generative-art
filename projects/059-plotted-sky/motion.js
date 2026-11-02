// 059 — Plotted Sky in motion. Two loops that already existed, run together:
//   the grass: 048's wind is gusts sin(along·0.33 − 1.25·t + warp), so it repeats every 2π/1.25 s
//              (5.03 s). A loop of n whole gusts closes exactly.
//   the sky:   058's Drift, a closed path of the fold constants plus the engine's camera clock
//              10π·u. The deck re-forms in place over the same loop.
// Frames are full plotted sheets (hidden lines and all), built with 048's `stable` option so a
// blade is kept or culled the same way in every frame. On screen they play like a flip-book of
// plots. On paper, `chronograph` overlays several instants of one gust in different pens.
//
// Runs in the browser, in a Worker and in Node.

(function (global) {
  'use strict';
  const GUST = 2 * Math.PI / 1.25;                      // s: one gust period of 048's wind

  function loopSeconds(gusts) { return gusts * GUST; }
  function frameCount(gusts, fps) { return Math.max(4, Math.round(loopSeconds(gusts) * fps)); }

  // build options for frame k of n: the grass at its instant, the sky at its phase of the drift
  function frameOptions(base, sky, k, n, gusts) {
    const u = k / n, PF = global.PlottedField, PS = global.PlottedSky;
    const field = Object.assign({}, base, { instant: base.instant + loopSeconds(gusts) * u, stable: true });
    if (!sky) return field;
    return PS.withSky(field, Object.assign({}, sky, { loop: u, loopInstant: base.instant }));
  }

  // pack a built sheet for transfer: per layer, a pen, Uint16 coordinates (0.01 mm) and Uint32 stroke ends
  function pack(r, keepCaption) {
    const layers = [], transfer = [];
    for (const l of r.layers) {
      if (l.id === 'caption' && !keepCaption) continue;
      let n = 0; for (const s of l.strokes) n += s.length;
      // 0.01 mm steps in 16 bits (an A1 sheet is 841 mm): half the memory of floats, finer than any pen
      const xy = new Uint16Array(n), ends = new Uint32Array(l.strokes.length);
      let o = 0; l.strokes.forEach((s, i) => { for (const v of s) xy[o++] = Math.max(0, Math.min(65535, Math.round(v * 100))); ends[i] = o; });
      layers.push({ id: l.id, pen: l.pen, xy, ends }); transfer.push(xy.buffer, ends.buffer);
    }
    return { msg: { sheet: r.sheet, stats: r.stats, extra: r.extra || null, layers }, transfer };
  }

  // On paper: `count` instants spread over one gust, each frame's grass in its own pen, so the
  // sway is drawn as a chronophotograph. Sky and caption come from the first instant.
  const PEN_INKS = ['#1b1a1f', '#7a4b2c', '#4f6f8f', '#6a6e78'];
  function chronograph(base, sky, count = 3) {
    const PF = global.PlottedField, PS = global.PlottedSky, layers = [];
    // each instant plants a share of the blades, so the sheet carries about 1.5× the grass of a still
    base = Object.assign({}, base, { density: (base.density || 220) * Math.min(1, 1.5 / count) });
    let first = null;
    for (let i = 0; i < count; i++) {
      let o = Object.assign({}, base, { instant: base.instant + GUST * i / count, stable: true });
      if (sky && i === 0) o = PS.withSky(o, sky);
      const r = PF.build(o);
      if (!first) first = r;
      const strokes = r.layers.filter((l) => l.id === 'grass' || l.id === 'heads').flatMap((l) => l.strokes);
      layers.push({ id: 'instant' + (i + 1), label: (i + 1) + ' grass at +' + (GUST * i / count).toFixed(2) + ' s', pen: i + 1, strokes });
    }
    for (const l of first.layers) if (l.id === 'sky') layers.push(Object.assign({}, l, { label: (count + 1) + ' sky', pen: 1 }));
    const cap = first.layers.find((l) => l.id === 'caption');
    layers.push({ id: 'caption', label: (layers.length + 1) + ' caption and map', pen: 1, strokes: cap ? cap.strokes : [] });
    let strokes = 0; layers.forEach((l) => (strokes += l.strokes.length));
    return { kind: 'chronograph', sheet: first.sheet, camera: first.camera, layers, count, strokes, extra: first.extra || null };
  }
  function chronographSVG(r, pen = 0.3) {
    const f = (v) => +v.toFixed(2), out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + r.sheet.w + 'mm" height="' + r.sheet.h + 'mm" viewBox="0 0 ' + r.sheet.w + ' ' + r.sheet.h + '">');
    for (const l of r.layers) {
      out.push('<g id="' + l.id + '" inkscape:groupmode="layer" inkscape:label="' + l.label + ' (pen ' + l.pen + ')" fill="none" stroke="' + PEN_INKS[(l.pen - 1) % PEN_INKS.length] + '" stroke-width="' + pen + '" stroke-linecap="round" stroke-linejoin="round">');
      for (const s of l.strokes) { let d = 'M' + f(s[0]) + ' ' + f(s[1]); for (let k = 2; k < s.length; k += 2) d += 'L' + f(s[k]) + ' ' + f(s[k + 1]); out.push('<path d="' + d + '"/>'); }
      out.push('</g>');
    }
    out.push('</svg>');
    return out.join('\n');
  }

  const api = { GUST, loopSeconds, frameCount, frameOptions, pack, chronograph, chronographSVG, PEN_INKS };
  global.PlottedMotion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
