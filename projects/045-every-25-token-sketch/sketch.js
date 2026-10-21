// 045 — Every 25-Token Sketch: the panel, the keys and the export.
// The piece itself is babel.js. Keys: R new shelving · S save PNG. ?at=<n> shows the sheet after n programs.

let G, M;
const QS = new URLSearchParams(location.search);
const AT = QS.get('at') !== null && isFinite(+QS.get('at')) ? Math.max(1, Math.floor(+QS.get('at'))) : null;
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: a still

(function start() {
  const LB = 'The library', SH = 'Sheet';
  G = GenArt.create({
    title: 'Every 25-Token Sketch',
    params: {
      rate: { value: 8, min: 1, max: 60, step: 1, label: 'programs a second', group: LB },
      from: { value: 0, min: 0, max: 300000, step: 1, label: 'begin at program', group: LB },
      fade: { value: 0.9992, min: 0.99, max: 1, step: 0.0001, label: "the champion's fade per program", group: LB },
      prologue: { value: 280, min: 0, max: 3000, step: 10, label: 'the first programs at a frame each', group: LB },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: SH },
    },
    onReset: reset,
  });
  M = Babel.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
  });
})();

function options() {
  return {
    seed: G.seed, rate: Math.round(G.param('rate')), from: Math.round(G.param('from')), fade: G.param('fade'), prologue: Math.round(G.param('prologue')),
    ground: +G.param('ground') ? 'paper' : 'dark',
    at: AT !== null ? AT : TILE ? 3000 : null,
  };
}
function reset() {
  if (!M) return;
  M.setOptions(options());
  M.reset();
}
function savePNG(name) {
  M.png().toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = (name || 'every-25-token-sketch-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
