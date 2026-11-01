// 048 — Plotted Field, the wall: builds one sheet off the main thread, so the drawing never stalls.
// The first message names the scripts to load (their paths differ between the gallery and a copy).
let ready = false;
self.onmessage = (e) => {
  const m = e.data;
  if (m.scripts) {
    self.window = self;                       // strokefont.js attaches itself to `window`
    importScripts(...m.scripts);
    ready = true;
    return;
  }
  if (!ready) return;
  const PF = self.PlottedField;
  const r = m.kind === 'map' ? PF.buildMap(m.options) : PF.build(m.options);
  self.postMessage({
    id: m.id, kind: r.kind, sheet: r.sheet, stats: r.stats,
    view: r.camera ? r.camera.view : 0, eye: r.camera ? r.camera.height : 0,
    layers: r.layers.map((l) => ({ id: l.id, pen: l.pen, strokes: PF.orderStrokes(l.strokes) })),
  });
};
