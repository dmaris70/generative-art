// 046 — Twenty-five-fold: the panel, the keys and the export.
// The piece itself is fold.js. Keys: R new offset · S save PNG. ?at=<0…1> shows that share of the tiles, still.

let G, M;
const QS = new URLSearchParams(location.search);
const AT = QS.get('at') !== null && isFinite(+QS.get('at')) ? Math.max(0, Math.min(1, +QS.get('at'))) : null;
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: the whole tiling, still

(function start() {
  const TL = 'The tiling', TM = 'Time', SH = 'Sheet';
  G = GenArt.create({
    title: 'Twenty-five-fold',
    params: {
      radius: { value: 4, min: 2, max: 6, step: 0.1, label: "the grids' window (lines from the centre)", group: TL },
      edges: { value: 1, options: { drawn: 1, none: 0 }, label: 'edges', group: TL },
      rate: { value: 60, min: 5, max: 600, step: 5, label: 'tiles a second', group: TM },
      turn: { value: 60, min: 0, max: 300, step: 5, label: 'the turn through 14.4° (s)', group: TM },
      hold: { value: 20, min: 0, max: 600, step: 5, label: 'rest (s)', group: TM },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: SH },
      caption: { value: 1, options: { shown: 1, hidden: 0 }, label: 'caption', group: SH },
    },
    onReset: reset,
  });
  M = Fold.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
  });
})();

function options() {
  return {
    seed: G.seed, radius: G.param('radius'), edges: +G.param('edges'), rate: G.param('rate'), turn: G.param('turn'), hold: G.param('hold'),
    ground: +G.param('ground') ? 'paper' : 'dark', caption: +G.param('caption'),
    at: AT !== null ? AT : TILE ? 1 : null,
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
    a.href = URL.createObjectURL(b); a.download = (name || 'twenty-five-fold-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
