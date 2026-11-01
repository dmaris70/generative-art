// Loop Engine — live view + GIF export. The scene and the encoder live in engine.js.
// Keys: R randomize · G export GIF · S save PNG · Space pause · ←/→ step a frame.

const E = window.LoopEngine;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let scene, buf, img, frame = 0, paused = false, busy = false, last = 0;

// The palette/aspect dropdowns store indices (the harness keeps params numeric for the URL).
const paletteOpts = {};
E.PALETTE_KEYS.forEach((k, i) => (paletteOpts[E.PALETTES[k].name] = i));
const aspectKeys = Object.keys(E.ASPECTS);
const aspectOpts = {};
aspectKeys.forEach((k, i) => (aspectOpts[k] = i));

const D = E.DEFAULTS;
const G = GenArt.create({
  title: 'Loop Engine',
  params: {
    palette: { value: 0, options: paletteOpts, label: 'palette', group: 'look' },
    aspect: { value: 0, options: aspectOpts, label: 'aspect', group: 'look' },
    cells: { value: D.cells, min: 64, max: 320, step: 8, label: 'grid width (cells)', group: 'look' },
    zoom: { value: D.zoom, min: 0.5, max: 2, step: 0.05, label: 'zoom', group: 'look' },
    cards: { value: D.cards, min: 0, max: 4, step: 1, label: 'cards', group: 'scene' },
    spin: { value: D.spin, min: 0, max: 3, step: 1, label: 'card turns / loop', group: 'scene' },
    streams: { value: D.streams, min: 0, max: 3, step: 1, label: 'ink streams', group: 'scene' },
    trail: { value: D.trail, min: 4, max: 40, step: 1, label: 'trail length', group: 'scene' },
    body: { value: D.body, min: 0.4, max: 2.2, step: 0.05, label: 'ink body', group: 'scene' },
    debris: { value: D.debris, min: 0, max: 300, step: 5, label: 'specks', group: 'scene' },
    grain: { value: D.grain, min: 0, max: 1, step: 0.05, label: 'edge grain', group: 'scene' },
    frames: { value: D.frames, min: 24, max: 240, step: 4, label: 'frames / loop', group: 'loop' },
    delay: { value: D.delay, min: 2, max: 10, step: 1, label: 'frame delay (1/100 s)', group: 'loop' },
    scale: { value: 6, min: 1, max: 12, step: 1, label: 'GIF px per cell', group: 'loop' },
  },
  resetOnFinish: true,
  onReset: reset,
});

function opts() {
  const p = G.params;
  return {
    palette: E.PALETTE_KEYS[p.palette | 0] || 'primaries',
    aspect: aspectKeys[p.aspect | 0] || '16:9',
    cells: p.cells, zoom: p.zoom, cards: p.cards, spin: p.spin, streams: p.streams,
    trail: p.trail, body: p.body, debris: p.debris, grain: p.grain, frames: p.frames, delay: p.delay,
  };
}

function reset() {
  scene = E.createScene(G.seed, opts());
  buf = E.makeBuffers(scene);
  canvas.width = scene.W;
  canvas.height = scene.H;
  img = ctx.createImageData(scene.W, scene.H);
  document.body.style.background = scene.paletteHex[0];
  frame = frame % scene.frames;
  fit();
  paint();
}

function fit() {
  const k = Math.max(1, Math.min(window.innerWidth / scene.W, window.innerHeight / scene.H) * 0.9);
  canvas.style.width = Math.floor(scene.W * k) + 'px';
  canvas.style.height = Math.floor(scene.H * k) + 'px';
}

function paint() {
  const idx = E.renderFrame(scene, frame, buf);
  const pal = scene.palette, d = img.data;
  for (let i = 0, j = 0; i < idx.length; i++, j += 4) {
    const c = pal[idx[i]];
    d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (!busy) status(`seed ${scene.seed} · ${scene.W}×${scene.H} · frame ${frame + 1}/${scene.frames}${paused ? ' · paused' : ''}`);
}

function status(s) { statusEl.textContent = s; }

function tick(now) {
  requestAnimationFrame(tick);
  if (paused || !scene) return;
  if (now - last < scene.opts.delay * 10) return;
  last = now;
  frame = (frame + 1) % scene.frames;
  paint();
}
requestAnimationFrame(tick);

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Render every frame of the loop, then encode — yielding between frames so the page stays live.
async function exportGIF() {
  if (busy) return;
  busy = true;
  const sc = E.createScene(G.seed, opts());
  const b = E.makeBuffers(sc);
  const frames = [];
  for (let f = 0; f < sc.frames; f++) {
    frames.push(E.renderFrame(sc, f, b).slice());
    if (f % 8 === 0) { status(`rendering ${f}/${sc.frames}…`); await new Promise((r) => setTimeout(r)); }
  }
  status('encoding…');
  await new Promise((r) => setTimeout(r));
  const scale = G.params.scale | 0;
  const bytes = E.encodeGIF(frames, sc.W, sc.H, sc.palette, { scale, delay: sc.opts.delay });
  download(new Blob([bytes], { type: 'image/gif' }), `loop-engine-${sc.seed}.gif`);
  busy = false;
  status(`saved loop-engine-${sc.seed}.gif · ${sc.W * scale}×${sc.H * scale} · ${(bytes.length / 1024).toFixed(0)} KB`);
}

// The harness's Save PNG calls a global saveCanvas (p5's name); provide it, upscaled crisp.
window.saveCanvas = function (name) {
  const k = G.params.scale | 0;
  const big = document.createElement('canvas');
  big.width = scene.W * k; big.height = scene.H * k;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, big.width, big.height);
  big.toBlob((b) => download(b, name + '.png'), 'image/png');
};

if (G.gui) {
  G.gui.add({ exportGIF }, 'exportGIF').name('⬇ Export GIF (G)');
}

window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'r') G.randomize();
  else if (k === 'g') exportGIF();
  else if (k === 's') window.saveCanvas('loop-engine-' + scene.seed);
  else if (k === ' ') { paused = !paused; paint(); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { paused = true; frame = (frame + 1) % scene.frames; paint(); }
  else if (e.key === 'ArrowLeft') { paused = true; frame = (frame - 1 + scene.frames) % scene.frames; paint(); }
});
window.addEventListener('resize', () => scene && fit());

reset();
