// 047 — Edition of 390: the panel, the keys and the export.
// The piece itself is edition.js (the tiling from ../046-twenty-five-fold/fold.js). Keys: S save PNG · V save SVG.
// ?at=<0…1> shows that share of the tiles, still. ?m=<1…390> fixes the edition.

let G, M;
const QS = new URLSearchParams(location.search);
const AT = QS.get('at') !== null && isFinite(+QS.get('at')) ? Math.max(0, Math.min(1, +QS.get('at'))) : null;
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: the whole tiling, still

(function start() {
  const ED = 'The edition', TM = 'Time', SH = 'Sheet';
  G = GenArt.create({
    title: 'Edition of 390',
    params: {
      edition: { value: QS.get('m') ? Math.max(0, Math.min(390, +QS.get('m'))) : 0, min: 0, max: 390, step: 1, label: 'edition (0: by the clock)', group: ED },
      clock: { value: 0, options: { 'Tokyo time, 10:00 – 16:30': 0, 'rehearsal from load': 1 }, label: 'clock', group: ED },
      radius: { value: 4, min: 2, max: 6, step: 0.1, label: "the grids' window", group: ED },
      rate: { value: 220, min: 20, max: 1000, step: 10, label: 'tiles a second', group: TM },
      fade: { value: 2, min: 0, max: 10, step: 0.5, label: 'fade at the minute (s)', group: TM },
      ground: { value: 0, options: { 'light on dark': 0, 'ink on paper': 1 }, label: 'ground', group: SH },
      qr: { value: 1, options: { shown: 1, hidden: 0 }, label: 'the code', group: SH },
      caption: { value: 1, options: { shown: 1, hidden: 0 }, label: 'caption', group: SH },
    },
    onReset: reset,
  });
  M = Edition.create(document.getElementById('view'), options());
  window.saveCanvas = (name) => savePNG(name);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 's' || e.key === 'S') savePNG();
    else if (e.key === 'v' || e.key === 'V') saveSVG();
  });
})();

function options() {
  const ed = G.param('edition');
  return {
    m: ed > 0 ? ed - 1 : null, clock: +G.param('clock') ? 'load' : 'jst', radius: G.param('radius'),
    rate: G.param('rate'), fade: G.param('fade'), ground: +G.param('ground') ? 'paper' : 'dark',
    qr: +G.param('qr'), caption: +G.param('caption'),
    at: AT !== null ? AT : TILE ? 1 : null,
  };
}
function reset() {
  if (!M) return;
  M.setOptions(options());
  M.reset();
}
function download(href, name) {
  const a = document.createElement('a'); a.href = href; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
function savePNG(name) {
  const e = M.edition();
  M.png().toBlob((b) => download(URL.createObjectURL(b), (name || 'edition-' + e.number + '-of-390') + '.png'));
}
function saveSVG() {
  const e = M.edition(), o = options();
  const s = Edition.svg(e.k, o.radius, o.ground);
  download(URL.createObjectURL(new Blob([s.svg], { type: 'image/svg+xml' })), 'edition-' + e.number + '-of-390.svg');
}
