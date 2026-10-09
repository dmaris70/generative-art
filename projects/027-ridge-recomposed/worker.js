// Off the main thread: compose the two sheets (compose.js) and paint them (drybrush.js).
// Both are pure arithmetic, so the worker gives exactly what the page or node would.
importScripts('parts.js', 'compose.js', '../../assets/drybrush.js');

onmessage = (e) => {
  const m = e.data, t0 = performance.now();
  if (m.type === 'paint') {
    const sheets = Compose.sheets(PARTS, Object.assign({ seed: m.seed }, m.params));
    let strokes = 0;
    const out = sheets.map((s, i) => {
      const r = DryBrush.paint(s, { seed: m.seed + i, scale: m.scale, bristle: m.params.bristle, streak: m.params.streak, grain: m.params.grain });
      strokes += r.strokes; return { w: r.w, h: r.h, rgba: r.rgba };
    });
    postMessage({ type: 'painted', job: m.job, purpose: m.purpose, seed: m.seed, regime: sheets[0].regime, strokes, ms: performance.now() - t0, sheets: out }, out.map(o => o.rgba.buffer));
  } else if (m.type === 'deal') {
    // candidates: the composed tone only (unpainted), small — fast enough to deal six at a time
    for (const seed of m.seeds) {
      const sh = Compose.sheets(PARTS, Object.assign({ seed }, m.params)), q = 3;
      const tw = Math.floor(sh[0].tw / q), th = Math.floor(sh[0].th / q), gap = 4, w = tw * 2 + gap, g = new Uint8ClampedArray(w * th * 4);
      for (let i = 0; i < w * th; i++) { g[i * 4] = g[i * 4 + 1] = g[i * 4 + 2] = 16; g[i * 4 + 3] = 255; }
      sh.forEach((s, side) => {
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
          const v = s.tone[(y * q + 1) * s.tw + x * q + 1], o = (y * w + x + side * (tw + gap)) * 4;
          g[o] = g[o + 1] = g[o + 2] = v;
        }
      });
      postMessage({ type: 'thumb', job: m.job, seed, regime: sh[0].regime, w, h: th, rgba: g }, [g.buffer]);
    }
  }
};
