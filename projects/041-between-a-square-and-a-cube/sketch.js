// 041 — Between a Square and a Cube: the panel, the keys and the exports.
// The piece itself is mordell.js. Keys: R new seed · S save PNG · V save SVG · space pause · → step now.

let G, M;
const QS = new URLSearchParams(location.search);
// a contact-sheet tile (gui=0) or ?still=1 draws every step at once and stops
const INSTANT = QS.get('still') === '1' || ['0', 'false', 'off'].includes(QS.get('gui'));

(function start() {
  const CO = 'Construction', FR = 'Frame', MK = 'Marks';
  G = GenArt.create({
    title: 'Between a Square and a Cube',
    closedGroups: [MK],
    resetOnFinish: true,
    params: {
      mode: { value: 0, options: { 'star — every line through P': 0, 'web — seeded chords': 1 }, label: 'construction', group: CO },
      reach: { value: 120, min: 10, max: 300, step: 10, label: 'reach (last multiple nP)', group: CO },
      passes: { value: 2, options: { 'through (3, 5)': 1, 'then the mirror pass through (3, −5)': 2 }, label: 'passes', group: CO },
      tempo: { value: 8, min: 1, max: 30, step: 0.5, label: 'seconds per step', group: CO },
      hold: { value: 60, min: 0, max: 600, step: 5, label: 'rest when finished (s)', group: CO },
      xMin: { value: -1.5, min: -8, max: 1, step: 0.5, label: 'x from', group: FR },
      xMax: { value: 7.5, min: 4, max: 40, step: 0.5, label: 'x to', group: FR },
      yMax: { value: 13, min: 6, max: 80, step: 1, label: '± y', group: FR },
      format: { value: 0, options: { square: 0, landscape: 1, portrait: 2 }, label: 'sheet', group: FR },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: FR },
      labels: { value: 0, options: { 'every point': 0, 'up to 12P': 1, none: 2 }, label: 'fractions', group: MK },
      textSize: { value: 10, min: 7, max: 14, step: 0.5, label: 'digit size', group: MK },
      rayAlpha: { value: 0.28, min: 0.05, max: 0.7, step: 0.01, label: 'ray strength', group: MK },
      lattice: { value: 1, options: { shown: 1, hidden: 0 }, label: 'lattice', group: MK },
      caption: { value: 1, options: { shown: 1, hidden: 0 }, label: 'caption', group: MK },
    },
    onReset: reset,
  });
  const canvas = document.getElementById('view');
  M = Mordell.create(canvas, options());
  if (G.gui) {
    const ctl = {
      pause: () => M.togglePause(),
      step: () => M.stepNow(),
      svg: () => saveSVG(),
    };
    G.gui.add(ctl, 'pause').name('⏯ pause / resume (space)');
    G.gui.add(ctl, 'step').name('→ next step now');
    G.gui.add(ctl, 'svg').name('Save SVG (V)');
  }
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
    else if (e.key === 'v' || e.key === 'V') saveSVG();
    else if (e.key === ' ') { e.preventDefault(); M.togglePause(); }
    else if (e.key === 'ArrowRight') M.stepNow();
  });
})();

function options() {
  const o = { seed: G.seed, instant: INSTANT };
  for (const k of ['mode', 'reach', 'passes', 'tempo', 'hold', 'xMin', 'xMax', 'yMax', 'format', 'ground', 'labels', 'textSize', 'rayAlpha', 'lattice', 'caption']) o[k] = G.param(k);
  // the panel keeps every setting numeric (so a share link can carry it); name them here
  o.mode = ['star', 'web'][+o.mode] || 'star';
  o.format = ['square', 'landscape', 'portrait'][+o.format] || 'square';
  o.ground = ['dark', 'paper'][+o.ground] || 'dark';
  o.labels = ['all', 'twelve', 'none'][+o.labels] || 'all';
  o.reach = Math.round(o.reach); o.passes = +o.passes; o.lattice = +o.lattice; o.caption = +o.caption;
  return o;
}
function reset() {
  if (!M) return;
  M.setOptions(options());
  M.reset();
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function savePNG(name) {
  M.png().toBlob((b) => download(b, (name || 'between-a-square-and-a-cube-' + G.seed) + '.png'));
}
function saveSVG() {
  download(new Blob([M.svg()], { type: 'image/svg+xml' }), 'between-a-square-and-a-cube-' + G.seed + '.svg');
}
