// 048 — Tooth and Wind: the panel, the keys, the pointer and the export.
// The piece itself is weather.js.
// Keys: R new seed · S save PNG · G gust · E erase · Space pause · C cast to a screen.
// Drag on the sheet to smudge it and blow the wind; double-click to throw a splatter.
// ?present=1 is the cast receiver: the piece alone, steered by the page that cast it.

let G, M;
const QS = new URLSearchParams(location.search);
const TILE = ['0', 'false', 'off'].includes(QS.get('gui'));   // a contact-sheet tile: run ahead, then hold still
const PRESENT = QS.get('present') === '1';                       // on a screen, cast from another page
let castConn = null, castCtl = null, castNote = null;              // casting: see the end of the file
const GROUND = { bone: 0, toned: 1, night: 2 };
const GROUND_NAME = ['bone', 'toned', 'night'];
const MEDIUM = { charcoal: 0, 'graphite on gesso': 1, silverpoint: 2, 'ink on wet paper': 3, 'pastel on sanded paper': 4 };
const MEDIUM_NAME = ['charcoal', 'graphite', 'silverpoint', 'ink', 'pastel'];

(function start() {
  const MD = 'The material', HD = 'The hands', WD = 'The wind', SH = 'The sheet';
  G = GenArt.create({
    title: 'Tooth and Wind',
    params: {
      medium: { value: 0, options: MEDIUM, label: 'medium', group: MD },
      view: { value: 0, options: { drawing: 0, "the paper's memory": 1 }, label: 'view', group: MD },
      tarnish: { value: 1, min: 0.2, max: 4, step: 0.1, label: 'silverpoint: tarnish speed', group: MD },
      density: { value: 3, min: 0.5, max: 12, step: 0.5, label: 'gestures a second', group: HD },
      pace: { value: 1, min: 0.25, max: 4, step: 0.25, label: 'pace', group: HD },
      mass: { value: 1, min: 0.3, max: 2, step: 0.1, label: 'weight of the plumes', group: HD },
      wind: { value: 1, min: 0, max: 3, step: 0.05, label: 'wind', group: WD },
      gust: { value: 0.5, min: 0, max: 2, step: 0.05, label: 'gustiness', group: WD },
      grain: { value: 0.7, min: 0.15, max: 1.1, step: 0.05, label: 'tooth (how hard the paper resists)', group: SH },
      smudge: { value: 1, min: 0, max: 2, step: 0.05, label: 'smudge', group: SH },
      erase: { value: 1, min: 0.3, max: 1.6, step: 0.05, label: 'eraser', group: SH },
      fill: { value: 0.1, min: 0.04, max: 0.45, step: 0.01, label: 'fill before erasing', group: SH },
      ground: { value: 0, options: { light: 0, toned: 1, dark: 2 }, label: 'ground', group: SH },
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
    else if (e.key === 'g' || e.key === 'G') { M.gust(); castSend({ type: 'gust' }); }
    else if (e.key === 'e' || e.key === 'E') { M.sweep(); castSend({ type: 'sweep' }); }
    else if (e.key === ' ') { castSend({ type: 'pause', v: M.pause() }); e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') castToggle();
  });

  const cv = M.canvas;
  let last = null;
  const unit = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  let lastU = null;
  cv.addEventListener('pointerdown', (e) => {
    last = M.toSheet(e.clientX, e.clientY); lastU = unit(e);
    M.touch(last[0], last[1]);
    castSend({ type: 'touch', p: lastU });
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = M.toSheet(e.clientX, e.clientY), pu = unit(e);
    M.drag(last[0], last[1], p[0], p[1]);
    castSend({ type: 'drag', a: [lastU[0], lastU[1], pu[0], pu[1]] });
    last = p; lastU = pu;
  });
  const up = () => { last = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', (e) => { const p = M.toSheet(e.clientX, e.clientY); M.splatter(p[0], p[1]); castSend({ type: 'splat', p: unit(e) }); });

  if (PRESENT) castReceiver(); else castControls();

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
    medium: MEDIUM_NAME[+G.param('medium')] || 'charcoal', view: +G.param('view') ? 'memory' : 'drawing', tarnish: G.param('tarnish'),
  };
}

// Only the seed, the medium and the size rebuild the sheet (and, for pastel, the ground,
// which carries its palette); every other setting is a change of weather applied to the
// drawing already there.
let lastKey = null;
const sheetKey = (op) => op.seed + '|' + op.medium + (op.medium === 'pastel' ? '|' + op.ground : '');
function reset() {
  if (!M) return;
  const op = options();
  M.setOptions(op);
  if (sheetKey(op) !== lastKey) { lastKey = sheetKey(op); M.reset(); }
  else M.render();
  castSend(castState());
}
lastKey = sheetKey(options());

let capN = 0;
function caption() {
  const el = document.getElementById('cap');
  if (!+G.param('caption') || PRESENT) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (capN++ % 15) return;
  const s = M.status();
  el.textContent = (castNote && performance.now() < castNote.until ? castNote.text + ' · ' : '') + captionText(s);
}

// what the sheet is doing, in the medium's own terms
function captionText(s) {
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const pc = Math.round(s.cov * 100) + '%';
  const by = {
    charcoal: pc + ' charcoal · ' + pl(s.sweeps, 'erasure'),
    graphite: pc + ' graphite · ' + pl(s.sweeps, 'erasure'),
    silverpoint: 'sheet ' + s.sheet + ' · ' + pc + ' silver' + (s.finished ? ' · finished, tarnishing' : ''),
    ink: pc + ' ink · ' + pl(s.sweeps, 'veil'),
    pastel: pc + ' covered · ' + pl(s.sweeps, 'fixative'),
  };
  if (s.view === 'memory')
    return "the paper's memory · " + (s.medium === 'silverpoint' ? 'silverpoint cannot be erased: nothing has been taken away' : 'everything taken away so far');
  return (s.paused ? 'paused · ' : '') + 'wind ' + s.windMag.toFixed(2) + ' at ' + s.windDeg + '°' + (s.gusting ? ' · gust' : '') +
    ' · ' + s.hands + ' hands · ' + by[s.medium];
}

function savePNG(name) {
  M.canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = (name || 'tooth-and-wind-' + G.seed) + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

// ---------- casting: the piece on a TV ----------
// Chrome's Presentation API. On a Chromecast, Chrome renders the receiver page (this page with
// ?present=1) in a tab of its own, off-screen, and streams it to the screen — so no Cast app
// has to be registered and the drawing runs at the computer's speed, not the dongle's. The
// receiver is the piece alone. It starts the same seed and settings from a fresh sheet, at
// the screen's own proportions, and from then on this page is its remote: settings, gusts,
// erasures, pauses and drags are sent to it as they happen.
function castSend(msg) {
  if (!castConn || castConn.state !== 'connected') return;
  try { castConn.send(JSON.stringify(msg)); } catch (e) { /* the screen went away; onclose tidies up */ }
}
function castState() { return { type: 'state', seed: G.seed, params: Object.assign({}, G.params) }; }
function castSay(text) { castNote = { text, until: performance.now() + 5000 }; capN = 0; }
function castLabel() {
  if (castCtl) castCtl.name(castConn && castConn.state !== 'closed' && castConn.state !== 'terminated' ? '▣ Stop casting (C)' : '▭ Cast to a screen (C)');
}

function castControls() {
  if (!('PresentationRequest' in window) || !G.gui) return;   // Chrome and Edge on desktop and Android
  castCtl = G.gui.add({ cast: castToggle }, 'cast');
  castLabel();
}

async function castToggle() {
  if (PRESENT || !('PresentationRequest' in window)) return;
  if (castConn && castConn.state !== 'closed' && castConn.state !== 'terminated') {
    castConn.terminate(); castConn = null; castLabel(); castSay('casting stopped');
    return;
  }
  const u = new URL(location.href);
  u.searchParams.set('present', '1'); u.searchParams.delete('gui');
  try {
    const conn = await new PresentationRequest([u.toString()]).start();
    castConn = conn;
    const ready = () => { castSend(castState()); castLabel(); castSay('casting'); };
    conn.addEventListener('connect', ready);
    if (conn.state === 'connected') ready();
    const gone = () => { if (castConn === conn) { castConn = null; castLabel(); castSay('casting ended'); } };
    conn.addEventListener('close', gone);
    conn.addEventListener('terminate', gone);
    castLabel();
  } catch (e) {
    // the viewer closed the picker (NotAllowedError / AbortError): nothing to say
    if (e && e.name === 'NotFoundError') castSay('no screen found: is the Chromecast on the same network?');
    else if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') castSay('could not cast: ' + (e.message || e.name));
  }
}

function castReceiver() {
  document.body.classList.add('present');
  const rc = navigator.presentation && navigator.presentation.receiver;
  if (!rc) return;   // opened by hand with ?present=1: just the piece, full screen
  rc.connectionList.then((list) => {
    const hook = (c) => c.addEventListener('message', (ev) => { try { castReceive(JSON.parse(ev.data)); } catch (e) { /* not ours */ } });
    list.connections.forEach(hook);
    list.addEventListener('connectionavailable', (ev) => hook(ev.connection));
  });
}

function castReceive(m) {
  const at = (p) => M.fromUnit(p[0], p[1]);
  if (m.type === 'state') {
    const changed = {};
    for (const k in m.params) if (G.params[k] !== m.params[k]) changed[k] = m.params[k];
    if (Object.keys(changed).length) G.setParams(changed);
    if (m.seed !== G.seed) G.setSeed(m.seed);
  } else if (m.type === 'gust') M.gust();
  else if (m.type === 'sweep') M.sweep();
  else if (m.type === 'pause') M.pause(!!m.v);
  else if (m.type === 'touch') { const p = at(m.p); M.touch(p[0], p[1]); }
  else if (m.type === 'drag') { const a = at([m.a[0], m.a[1]]), b = at([m.a[2], m.a[3]]); M.drag(a[0], a[1], b[0], b[1]); }
  else if (m.type === 'splat') { const p = at(m.p); M.splatter(p[0], p[1]); }
}
