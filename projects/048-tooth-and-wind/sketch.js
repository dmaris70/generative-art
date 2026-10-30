// 048 — Tooth and Wind: the panel, the keys, the pointer and the export.
// The piece itself is weather.js.
// Keys: R new seed · S save PNG · G gust · E erase · Space pause.
// Drag on the sheet to smudge it and blow the wind; double-click to throw a splatter.

let G, M;
const QS = new URLSearchParams(location.search);
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: run ahead, then hold still
const GROUND = { bone: 0, toned: 1, night: 2 };
const GROUND_NAME = ['bone', 'toned', 'night'];

(function start() {
  const HD = 'The hands', WD = 'The wind', SH = 'The sheet';
  G = GenArt.create({
    title: 'Tooth and Wind',
    params: {
      density: { value: 3, min: 0.5, max: 12, step: 0.5, label: 'gestures a second', group: HD },
      pace: { value: 1, min: 0.25, max: 4, step: 0.25, label: 'pace', group: HD },
      mass: { value: 1, min: 0.3, max: 2, step: 0.1, label: 'weight of the plumes', group: HD },
      wind: { value: 1, min: 0, max: 3, step: 0.05, label: 'wind', group: WD },
      gust: { value: 0.5, min: 0, max: 2, step: 0.05, label: 'gustiness', group: WD },
      grain: { value: 0.7, min: 0.15, max: 1.1, step: 0.05, label: 'tooth (how hard the paper resists)', group: SH },
      smudge: { value: 1, min: 0, max: 2, step: 0.05, label: 'smudge', group: SH },
      erase: { value: 1, min: 0.3, max: 1.6, step: 0.05, label: 'eraser', group: SH },
      fill: { value: 0.1, min: 0.04, max: 0.45, step: 0.01, label: 'fill before erasing', group: SH },
      ground: { value: 0, options: GROUND, label: 'ground', group: SH },
      caption: { value: 1, options: { shown: 1, hidden: 0 }, label: 'caption', group: SH },
    },
    onReset: reset,
  });
  M = Weather.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
    else if (e.key === 'g' || e.key === 'G') M.gust();
    else if (e.key === 'e' || e.key === 'E') M.sweep();
    else if (e.key === ' ') { M.pause(); e.preventDefault(); }
  });

  const cv = M.canvas;
  let last = null;
  cv.addEventListener('pointerdown', (e) => {
    last = M.toSheet(e.clientX, e.clientY);
    M.touch(last[0], last[1]);
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = M.toSheet(e.clientX, e.clientY);
    M.drag(last[0], last[1], p[0], p[1]);
    last = p;
  });
  const up = () => { last = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', (e) => { const p = M.toSheet(e.clientX, e.clientY); M.splatter(p[0], p[1]); });

  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => M.reset(), 250); });

  if (TILE) {   // contact sheet: develop the sheet off-screen for a while, then show it still
    for (let i = 0; i < 1800; i++) M.tick();
    M.pause(true);
    document.getElementById('cap').style.display = 'none';
    return;
  }
  const loop = () => { M.tick(); caption(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();

function options() {
  return {
    seed: G.seed, density: G.param('density'), pace: G.param('pace'), mass: G.param('mass'),
    wind: G.param('wind'), gust: G.param('gust'), grain: G.param('grain'), smudge: G.param('smudge'),
    erase: G.param('erase'), fill: G.param('fill'), ground: GROUND_NAME[+G.param('ground')] || 'bone',
  };
}

// Only the seed and the size rebuild the sheet; every other setting is a change of weather
// applied to the drawing already there.
let lastSeed = null;
function reset() {
  if (!M) return;
  M.setOptions(options());
  if (G.seed !== lastSeed) { lastSeed = G.seed; M.reset(); }
  else M.render();
}
lastSeed = G.seed;

let capN = 0;
function caption() {
  const el = document.getElementById('cap');
  if (!+G.param('caption')) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (capN++ % 15) return;
  const s = M.status();
  el.textContent =
    (s.paused ? 'paused · ' : '') +
    'wind ' + s.windMag.toFixed(2) + ' at ' + s.windDeg + '°' + (s.gusting ? ' · gust' : '') +
    ' · ' + s.hands + ' hands · ' + Math.round(s.cov * 100) + '% charcoal · ' +
    s.sweeps + ' erasure' + (s.sweeps === 1 ? '' : 's');
}

function savePNG(name) {
  M.canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = (name || 'tooth-and-wind-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
