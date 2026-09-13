// Isometric Strata — the portfolio board.
//
// Many sheets on one board with a shared title strip: one sheet per style at
// a fixed seed (the whole system on a page), one style across the six sites,
// one style across the three papers in both views, or one style across
// twelve seeds. Every tile is a full sheet built and painted by the engine
// into its own graphics buffer, laid out on paper with a caption that carries
// the style, the seed and the tenets score. Rendering is progressive — one
// sheet per frame — so the page stays responsive.
//
// URL: ?seed=1234&set=styles|sites|papers|seeds&style=1..12
// Keys: R reseed · S save PNG.

const SETS = {
  styles: { cols: 4, count: 12, label: 'ONE SHEET PER STYLE' },
  sites: { cols: 3, count: 6, label: 'ONE STYLE, SIX SITES' },
  papers: { cols: 3, count: 6, label: 'ONE STYLE, THREE PAPERS, TWO VIEWS' },
  seeds: { cols: 4, count: 12, label: 'ONE STYLE, TWELVE SEEDS' },
  edition: { cols: 4, count: 12, label: 'THE CURATED EDITION, TWELVE PER PAGE' },
};
const TILE = { w: 420, h: 560, gap: 30, cap: 44 };
const MARGIN = 44, HEADER = 132;

let gui, ctrl, board, tiles = [], next = 0, U = 1, boardW = 1, boardH = 1, boardHand = null, tex = null;

function readURL() {
  const u = new URL(window.location.href);
  const seed = u.searchParams.get('seed');
  return {
    seed: seed && /^\d+$/.test(seed) ? Number(seed) >>> 0 : (Math.random() * 4294967296) >>> 0,
    set: SETS[u.searchParams.get('set')] ? u.searchParams.get('set') : 'styles',
    style: Math.max(0, Math.min(12, Number(u.searchParams.get('style')) || 0)),
    page: Math.max(1, Number(u.searchParams.get('page')) || 1),
    gui: u.searchParams.get('gui') !== '0',
  };
}

function setup() {
  const init = readURL();
  ctrl = { seed: String(init.seed), set: init.set, style: init.style, page: init.page, reseed: reseed, save: save };
  pixelDensity(1);
  createCanvas(10, 10);
  if (init.gui && window.lil && window.lil.GUI) {
    gui = new lil.GUI({ title: 'Portfolio' });
    gui.add(ctrl, 'seed').name('seed').onFinishChange(rebuild);
    gui.add(ctrl, 'set', Object.keys(SETS)).name('set').onChange(rebuild);
    gui.add(ctrl, 'style', 0, 12, 1).name('style (0 = from seed)').onChange(rebuild);
    gui.add(ctrl, 'page', 1, 40, 1).name('edition page').onChange(rebuild);
    gui.add(ctrl, 'reseed').name('🎲 reseed (R)');
    gui.add(ctrl, 'save').name('Save PNG (S)');
  }
  rebuild();
}

function reseed() {
  ctrl.seed = String((Math.random() * 4294967296) >>> 0);
  if (gui) gui.controllers.forEach((c) => c.updateDisplay());
  rebuild();
}

function save() {
  saveCanvas('isometric-strata-portfolio-' + ctrl.set + '-' + ctrl.seed, 'png');
}

// ---- the plan for the board: one build spec per tile ----
function plan() {
  const seed = Number(ctrl.seed) >>> 0;
  const set = SETS[ctrl.set];
  const R = ISO.rng(seed ^ 0x9e37);
  const styleN = ctrl.style || R.int(1, Strata.STYLE_KEYS.length);
  const out = [];
  if (ctrl.set === 'edition') {
    const E = window.STRATA_EDITION;
    const entries = E ? Object.entries(E.seeds).map(([sd, n]) => [Number(sd), n]).sort((a, b) => a[1] - b[1]) : [];
    const pages = Math.max(1, Math.ceil(entries.length / set.count));
    const page = Math.min(pages, ctrl.page);
    for (const [sd] of entries.slice((page - 1) * set.count, page * set.count)) out.push({ seed: sd, mode: 0, view: 0 });
    return { seed: seed, set: set, styleN: styleN, specs: out, page: page, pages: pages, editionSize: entries.length };
  }
  for (let i = 0; i < set.count; i++) {
    if (ctrl.set === 'styles') out.push({ seed: seed, mode: i + 1, view: 1 });
    else if (ctrl.set === 'sites') out.push({ seed: seed, mode: styleN, view: 1, site: Site.TYPES[i] });
    else if (ctrl.set === 'papers') out.push({ seed: seed, mode: styleN, view: i < 3 ? 1 : 2, paper: ['VINTAGE', 'STANDARD', 'ROUGH'][i % 3] });
    else out.push({ seed: (seed + i * 7919) >>> 0, mode: styleN, view: 0 });
  }
  return { seed: seed, set: set, styleN: styleN, specs: out };
}

function rebuild() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('seed', ctrl.seed);
    u.searchParams.set('set', ctrl.set);
    if (ctrl.style) u.searchParams.set('style', String(ctrl.style)); else u.searchParams.delete('style');
    if (ctrl.set === 'edition') u.searchParams.set('page', String(ctrl.page)); else u.searchParams.delete('page');
    window.history.replaceState(null, '', u.toString());
  } catch (e) { /* file:// */ }
  board = plan();
  const cols = board.set.cols, rows = Math.ceil(board.specs.length / cols);
  boardW = MARGIN * 2 + cols * TILE.w + (cols - 1) * TILE.gap;
  boardH = MARGIN * 2 + HEADER + rows * (TILE.h + TILE.cap) + (rows - 1) * TILE.gap;
  fitCanvas();
  tiles = board.specs.map((spec, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    return {
      spec: spec, i: i,
      x: MARGIN + col * (TILE.w + TILE.gap), y: MARGIN + HEADER + row * (TILE.h + TILE.cap + TILE.gap),
      img: null, state: null,
    };
  });
  next = 0;
  tex = Paper.texture(width, height, 'VINTAGE', board.seed);
  boardHand = Hand.create(window, ISO.rng(board.seed ^ 0x77), { wob: 0.5, weightScale: 1 });
  loop();
}

function fitCanvas() {
  const w = Math.min(windowWidth, windowHeight * (boardW / boardH));
  U = w / boardW;
  resizeCanvas(w, w * (boardH / boardW));
}

function windowResized() {
  fitCanvas();
  tex = Paper.texture(width, height, 'VINTAGE', board.seed);
  redraw();
}

// ---- progressive render: one sheet per frame ----
function draw() {
  if (next < tiles.length) {
    const t = tiles[next++];
    const g = createGraphics(600, 800);
    g.pixelDensity(1);
    t.state = Strata.build(t.spec);
    Strata.paint(g, t.state, { wobble: 1, ink: 1 });
    t.img = g.get();
    g.remove();
  }
  paintBoard();
  if (next >= tiles.length) noLoop();
}

function paintBoard() {
  blendMode(BLEND);
  noTint();
  image(tex, 0, 0, width, height);
  push();
  scale(U);
  const H = boardHand;
  Paper.grid(H, boardW, boardH, 20);

  // the title strip
  const TXT = { color: [48, 54, 64], alpha: 215 }, TXT2 = { color: [70, 76, 88], alpha: 185 };
  H.rect(MARGIN, MARGIN, boardW - 2 * MARGIN, HEADER - 24, Sheet.CHROME);
  H.text('ISOMETRIC STRATA', MARGIN + 16, MARGIN + 18, 28, TXT, { bold: true, tracking: 1.02 });
  H.text('PORTFOLIO BOARD  /  ' + board.set.label, MARGIN + 16, MARGIN + 60, 13, TXT2);
  const dwg = 'IS-' + ('000000' + (ISO.hash32(String(board.seed)) >>> 8).toString(16)).slice(-6).toUpperCase();
  const right = boardW - MARGIN - 16;
  H.text('SET: ' + ctrl.set.toUpperCase(), right, MARGIN + 18, 11, TXT2, { align: 'right' });
  if (ctrl.set === 'edition') H.text('EDITION OF ' + board.editionSize + '   PAGE ' + board.page + ' / ' + board.pages, right, MARGIN + 42, 11, TXT2, { align: 'right' });
  else H.text('SEED: ' + board.seed + (ctrl.set !== 'styles' ? '   STYLE: ' + ISO.styles[Strata.STYLE_KEYS[board.styleN - 1]].key : ''), right, MARGIN + 42, 11, TXT2, { align: 'right' });
  H.text('SHEETS: ' + tiles.length + '   DWG: ' + dwg + '   ' + next + '/' + tiles.length + ' DRAWN', right, MARGIN + 66, 11, TXT2, { align: 'right' });
  H.line([[MARGIN + 16, MARGIN + HEADER - 40], [boardW - MARGIN - 16, MARGIN + HEADER - 40]], Sheet.CHROME2);
  Sheet.SYM.grid(H, right - 8, MARGIN + 86, 8);

  // the tiles
  for (const t of tiles) {
    // a shadow offset, then the sheet, then its frame
    noStroke();
    fill(40, 42, 48, 60);
    rect(t.x + 6, t.y + 8, TILE.w, TILE.h);
    if (t.img) image(t.img, t.x, t.y, TILE.w, TILE.h);
    else { fill(232, 228, 216, 200); rect(t.x, t.y, TILE.w, TILE.h); }
    H.rect(t.x, t.y, TILE.w, TILE.h, { color: [58, 64, 74], alpha: 200, weight: 1.0, wob: 0.3 });
    // the caption
    const ed = t.state && Strata.edition ? Strata.edition(t.state) : null;
    const n = ed ? ed.number + '/' + ed.size : ('0' + (t.i + 1)).slice(-2);
    if (t.state) {
      const sp = t.state.spec;
      const ten = t.state.tenets ? 'TENETS ' + t.state.tenets.filter((q) => q.ok).length + '/' + t.state.tenets.length : 'SEED ' + t.state.seed;
      H.text(n + '  ' + sp.style.key + '  /  ' + sp.substyle, t.x, t.y + TILE.h + 9, 9.5, TXT);
      H.text(ten, t.x + TILE.w, t.y + TILE.h + 9, 9, TXT2, { align: 'right' });
      H.text(sp.site + '  ·  ' + sp.paper + '  ·  ' + sp.view + '  ·  ' + sp.floors + 'F  ·  SEED ' + t.state.seed, t.x, t.y + TILE.h + 26, 7.5, TXT2);
    } else {
      H.text(n + '  DRAWING…', t.x, t.y + TILE.h + 9, 9.5, TXT2);
    }
  }
  pop();

  blendMode(MULTIPLY);
  tint(255, 60);
  image(tex, 0, 0, width, height);
  noTint();
  blendMode(BLEND);
}

window.__portfolio = function () { return { drawn: next, total: tiles.length, set: ctrl.set, seed: ctrl.seed }; };

function keyPressed() {
  if (key === 'r' || key === 'R') reseed();
  if (key === 's' || key === 'S') save();
}
