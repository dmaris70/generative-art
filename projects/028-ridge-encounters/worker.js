// Off the main thread: compose the two sheets (compose.js) and paint them (drybrush.js).
// Both are pure arithmetic, so the worker gives exactly what the page or node would.
const V = self.location.search;                                  // the page's build stamp, so edited engines are never served stale
importScripts('parts.js' + V, 'compose.js' + V, '../../assets/drybrush.js' + V);

// .dem = gzip of rows delta-coded along x: a running sum in Uint16 arithmetic restores the heights
const undelta = (a, n) => { for (let y = 0; y < n; y++) for (let x = 1; x < n; x++) a[y * n + x] += a[y * n + x - 1]; return a; };

// the real ranges (dem/index.json + one 512² Uint16 tile each) are loaded once; work waits for them
const ready = fetch('dem/index.json' + V).then(r => r.json()).then(ix => Promise.all(ix.places.map(m =>
  fetch('dem/' + m.slug + '.dem' + V).then(r => new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()).then(b => Compose.setDEM(m.slug, m, undelta(new Uint16Array(b), m.size)))))
  .then(() => postMessage({ type: 'places', places: Compose.places(), labels: ix.places.reduce((o, m) => (o[m.slug] = m.label, o), {}) })))
  .catch(() => postMessage({ type: 'places', places: Compose.places(), labels: {} }));

onmessage = (e) => ready.then(() => handle(e.data));

function handle(m) {
  const t0 = performance.now();
  if (m.type === 'paint') {
    const sheets = Compose.sheets(PARTS, Object.assign({ seed: m.seed }, m.params));
    let strokes = 0;
    const out = sheets.map((s, i) => {
      const r = DryBrush.paint(s, { seed: m.seed + i, scale: m.scale, bristle: s.temper.bristle, streak: s.temper.streak, grain: s.temper.grain });
      strokes += r.strokes; return { w: r.w, h: r.h, rgba: r.rgba };
    });
    postMessage({ type: 'painted', job: m.job, purpose: m.purpose, seed: m.seed, regime: sheets[0].regime, place: sheets[0].placeLabel, times: sheets[0].times, temper: sheets[0].temper, light: sheets[0].light, key: sheets[0].tonalKey, weather: sheets[0].weather, event: sheets[0].event, pair: sheets[0].pair === 'panorama' ? 'one view, cut' : sheets.map(s => s.gaze).join(' | '), strokes, ms: performance.now() - t0, sheets: out }, out.map(o => o.rgba.buffer));
  } else if (m.type === 'ground') {
    // the live view asks for the land itself (copies: the engine keeps its own)
    const g = Compose.ground(PARTS, Object.assign({ seed: m.seed }, m.params)), H = Float32Array.from(g.H), lum = Float32Array.from(g.lum);
    postMessage({ type: 'ground', job: m.job, n: g.n, H, lum, cam: g.cam }, [H.buffer, lum.buffer]);
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
      postMessage({ type: 'thumb', job: m.job, seed, regime: sh[0].regime + ' · ' + sh[0].place, w, h: th, rgba: g }, [g.buffer]);
    }
  }
};
