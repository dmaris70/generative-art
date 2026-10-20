// 042 — Every 25-Pixel Image, Exhausted in One Day: the panel, the keys and the export.
// The piece itself is icons.js. Keys: R new seed · S save PNG. ?at=<image> shows one block and stops.

let G, M;
const QS = new URLSearchParams(location.search);
const AT = QS.get('at') !== null && isFinite(+QS.get('at')) ? Math.max(0, Math.floor(+QS.get('at'))) : null;
// a contact-sheet tile (gui=0) gets a still from the middle of the day unless ?at= says where
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));

(function start() {
  const TM = 'Time', SH = 'Sheet';
  G = GenArt.create({
    title: 'Every 25-Pixel Image',
    params: {
      clock: { value: 0, options: { 'Tokyo time, 10:00 → 16:12:49 JST': 0, 'from load': 1 }, label: 'clock', group: TM },
      startH: { value: 10, min: 0, max: 23, step: 1, label: 'begins at (hour, JST)', group: TM },
      rate: { value: 1500, min: 25, max: 6000, step: 25, label: 'images a second', group: TM },
      hold: { value: 60, min: 0, max: 600, step: 5, label: 'rest when finished (s, from load)', group: TM },
      order: { value: 0, options: { 'row by row, as Every Icon': 0, 'the seed shuffles the cells': 1 }, label: 'which cell holds which bit', group: SH },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: SH },
      caption: { value: 1, options: { shown: 1, hidden: 0 }, label: 'caption', group: SH },
    },
    onReset: reset,
  });
  M = Icons.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') G.randomize();
    else if (e.key === 's' || e.key === 'S') savePNG();
  });
})();

function options() {
  const o = { seed: G.seed };
  o.clock = +G.param('clock') ? 'load' : 'jst';
  o.start = String(Math.round(G.param('startH'))).padStart(2, '0') + ':00';
  o.rate = Math.round(G.param('rate'));
  o.hold = G.param('hold');
  o.order = +G.param('order') ? 'seed' : 'row';
  o.ground = +G.param('ground') ? 'paper' : 'dark';
  o.caption = +G.param('caption');
  o.at = AT !== null ? AT : TILE ? 2 ** 24 + 1234567 : null;
  return o;
}
function reset() {
  if (!M) return;
  M.setOptions(options());
  M.reset();
}
function savePNG(name) {
  M.png().toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = (name || 'every-25-pixel-image-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
