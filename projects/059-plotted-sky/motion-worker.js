// 059 — Plotted Sky in motion: builds one frame off the main thread.
let ready = false;
self.onmessage = (e) => {
  const m = e.data;
  if (m.scripts) { self.window = self; importScripts(...m.scripts); ready = true; return; }
  if (!ready) return;
  const t = Date.now();
  const o = self.PlottedMotion.frameOptions(m.base, m.sky, m.k, m.n, m.gusts);
  const r = self.PlottedField.build(o);
  const { msg, transfer } = self.PlottedMotion.pack(r, m.k === 0);
  msg.k = m.k; msg.job = m.job; msg.ms = Date.now() - t;
  self.postMessage(msg, transfer);
};
