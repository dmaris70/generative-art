// 044 — The 25th Frame: the panel, the keys and the export.
// The piece itself is frame25.js. Keys: R new seed · S save PNG (one frame, or the exposure).
// ?expose=<n> shows the mean of n frames of a take — what a camera sees — and stops.

let G, M;
const QS = new URLSearchParams(location.search);
const EXPOSE = QS.get('expose') !== null && isFinite(+QS.get('expose')) ? Math.max(0, Math.floor(+QS.get('expose'))) : null;
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: the exposure

(function start() {
  const FG = 'The figure', FD = 'The field';
  G = GenArt.create({
    title: 'The 25th Frame',
    params: {
      figure: { value: 0, options: { 'holds still': 0, 'drifts a cell a frame': 1 }, label: 'inside the figure the noise', group: FG },
      take: { value: 4, min: 0.5, max: 20, step: 0.5, label: 'take (s, the figure present)', group: FG },
      gap: { value: 2.5, min: 0, max: 20, step: 0.5, label: 'gap (s, the field alone)', group: FG },
      size: { value: 0.62, min: 0.2, max: 0.95, step: 0.01, label: 'figure height (share of frame)', group: FG },
      wander: { value: 1, options: { 'where the seed puts it': 1, centred: 0 }, label: 'placed', group: FG },
      cell: { value: 6, min: 3, max: 14, step: 1, label: 'cell size', group: FD },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: FD },
      contrast: { value: 0.8, min: 0.2, max: 1, step: 0.05, label: 'contrast of the noise', group: FD },
      expose: { value: 0, min: 0, max: 120, step: 1, label: 'long exposure (frames; 0 = live)', group: FD },
      caption: { value: 0, options: { hidden: 0, shown: 1 }, label: 'caption', group: FD },
    },
    onReset: reset,
  });
  M = Frame25.create(document.getElementById('view'), options());
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
    figure: +G.param('figure') ? 'drift' : 'still',
    take: G.param('take'), gap: G.param('gap'), size: G.param('size'), wander: +G.param('wander'),
    cell: Math.round(G.param('cell')), ground: +G.param('ground') ? 'paper' : 'dark', contrast: G.param('contrast'),
    expose: EXPOSE !== null ? EXPOSE : TILE ? 60 : Math.round(G.param('expose')),
    caption: +G.param('caption'),
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
    a.href = URL.createObjectURL(b); a.download = (name || 'the-25th-frame-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
