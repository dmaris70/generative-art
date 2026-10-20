// 043 — …8212890625: the panel, the keys and the export.
// The piece itself is receipt.js. Keys: R new hand · S save PNG. ?at=<n> shows the roll after n squarings.

let G, M;
const QS = new URLSearchParams(location.search);
const AT = QS.get('at') !== null && isFinite(+QS.get('at')) ? Math.max(0, Math.floor(+QS.get('at'))) : null;
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: a still

(function start() {
  const TM = 'Pace', SH = 'Sheet';
  G = GenArt.create({
    title: '…8212890625',
    params: {
      beat: { value: 0.4, min: 0.05, max: 2, step: 0.05, label: 'seconds per row', group: TM },
      pause: { value: 1.6, min: 0, max: 10, step: 0.1, label: 'pause between squarings (s)', group: TM },
      size: { value: 14, min: 8, max: 24, step: 1, label: 'digit height', group: SH },
      hand: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'the hand (0 ruled · 1 hurried)', group: SH },
      ground: { value: 0, options: { 'ink on paper': 0, 'light on dark': 1 }, label: 'ground', group: SH },
      header: { value: 1, options: { shown: 1, hidden: 0 }, label: 'the number at the head', group: SH },
    },
    onReset: reset,
  });
  M = Receipt.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
  });
})();

function options() {
  return {
    seed: G.seed,
    beat: G.param('beat'), pause: G.param('pause'), size: Math.round(G.param('size')), hand: G.param('hand'),
    ground: +G.param('ground') ? 'dark' : 'paper', header: +G.param('header'),
    at: AT !== null ? AT : TILE ? 9 : null,
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
    a.href = URL.createObjectURL(b); a.download = (name || '8212890625-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
