// 059 — Plotted Sky: one generation. Draws every setting that shapes the picture: the field, the
// view, the moment, the moon, the weather and the grass. Plotter settings (paper, pen, inks,
// occlusion grain), the mode and the motion settings (gusts, frame rate, speed) are left as they are.
// Ranges are narrower than the panel's where the extremes are slow to build or rarely work.
(function (global) {
  'use strict';
  // Does this view see sky? 8 of a field's 25 views look down without a horizon; a generation
  // redraws the view (up to 40 times) until the top of the frame is at least 2° above the horizon.
  function seesSky(field, view, fov) {
    const PF = global.PlottedField;
    if (!PF) return true;
    const cam = PF.camera(field, view, PF.createWorld(field));
    const [W, H] = PF.SHEETS.A3, m = Math.round(W * 0.055), fw = W - 2 * m, fh = H - m - Math.round(W * 0.085);
    const top = cam.pitch + Math.atan(Math.tan(fov * Math.PI / 360) * fh / fw);
    return top > 2 * Math.PI / 180;
  }
  function draw(rand = Math.random) {
    const U = (a, b, step) => { let v = a + rand() * (b - a); if (step) v = a + Math.round((v - a) / step) * step; return +v.toFixed(4); };
    const I = (a, b) => a + Math.floor(rand() * (b - a + 1));
    return {
      field: I(1, 99999), view: I(1, 25), fov: I(40, 70), instant: I(0, 3599),
      wind: U(0.2, 1.0, 0.01), windTurn: I(-180, 180),
      light: U(0.15, 0.6, 0.01), moon: I(-180, 180), moonHeight: I(5, 60), moonAhead: rand() < 0.3,
      weather: I(0, 48), deck: U(300, 1500, 50), scale: U(2.5, 5.5, 0.1), drift: U(0, 16, 0.5),
      ruling: U(0.6, 1.0, 0.05), tone: U(0.8, 1.25, 0.05), cross: rand() < 0.8 ? 1 : 0,
      density: U(150, 300, 10), body: U(1.2, 2.4, 0.1), haze: U(4, 12, 0.5), hazeLength: I(10, 30), cutoff: U(1.0, 2.0, 0.1), heads: U(0, 0.15, 0.01),
    };
  }
  function drawWithSky(rand = Math.random, field) {
    const g = draw(rand);
    if (field != null) g.field = field;
    for (let i = 0; i < 40 && !seesSky(g.field, g.view, g.fov); i++) g.view = 1 + Math.floor(rand() * 25);
    return g;
  }
  const api = { draw: drawWithSky, drawAny: draw, seesSky };
  global.PlottedSkyGenerate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
