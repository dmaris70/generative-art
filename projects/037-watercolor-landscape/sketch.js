// 037 — Watercolor Landscape v1
//
// The sister of 036 (Oil Landscape v1). The same scene engine — one camera over one ground
// plane, one transmittance term for the air, moods, viewpoints, scene types, mountains with
// planes and snow, a river or lake, a plain of fields and trees, a framing group of trees —
// painted the way a watercolourist works, with every tool p5.brush offers:
//
//   paper first (a faint graphite underdrawing), then light to dark, back to front;
//   wet-in-wet washes for the sky and the big masses (fill + fillBleed, the bleed's angle
//   set so the wash runs the way the wet paper is tilted); variegated drops of a second
//   colour into the wet; hard-edged glazes over dry paint for the shadow planes (low
//   bleed, strong border — pigment gathering at the edge of a wash that dried); granulation
//   (fillTexture, and a fine spray brush); backruns and cauliflowers (border strength);
//   reserved and lifted lights (the sun, snow, glints, mist); dry-brush across the paper's
//   tooth (a spray brush); sponge texture on foliage (a custom tip); rigger strokes for
//   twigs and grass (a tapering brush, flowLine through a wind field); flat-brush strokes
//   down the fall line of the mountains (a custom flat tip, rotating with the stroke);
//   spatter; massing for the darkest foreground (mass); and, optionally, pen and wash
//   (hatchStyle + hatch over the shadows, pen contours).
//
// Scene engine copied from 036 (buildScene … rangeDetail), unchanged.


const REF_W = 1500;

const REF_H = 1000;

const FIELD_ASPECT = REF_W / REF_H;

const FRAME_BUDGET_MS = 28;

// ?profile records per-pass timings in window.PROFILE (index, ms) for tuning.
const PROFILE = /[?&]profile\b/.test(location.search) ? (window.PROFILE = []) : null;

// ?stop=N halts the painting after pass N, to inspect any intermediate state.
const YIELD = 'yield';

const STOP = parseInt(new URLSearchParams(location.search).get('stop'), 10) || Infinity;

const MOODS = {
  'golden hour': {
    zenith: '#2c4470', upper: '#7486ad', horizon: '#f3c27f', glow: '#ffdc9c', sun: '#fff5dc',
    haze: '#d8b596', cloudShadow: '#6d6788', cloudLit: '#f5ad6c',
    rockFar: '#68658a', rockNear: '#4d4838', groundFar: '#8a8250', groundNear: '#3d3d22',
    fields: ['#a8964f', '#7b8040', '#c2a35a', '#6a7136', '#93874a'],
    foliage: '#2d3620', foliageLit: '#8f8a3a', silhouette: '#15120d',
    light: '#f4ad5c', shadow: '#33405f', water: '#41516e', clouds: 1.0, rays: 1.0,
  },
  'after the storm': {
    zenith: '#353e4a', upper: '#66707b', horizon: '#e5d3a0', glow: '#f5e3a6', sun: '#fffbea',
    haze: '#b5b9b2', cloudShadow: '#454c57', cloudLit: '#e6cb8c',
    rockFar: '#5a6470', rockNear: '#384036', groundFar: '#727d5d', groundNear: '#2c3828',
    fields: ['#6f7e4f', '#58693f', '#8e8f58', '#4b5c37', '#7d8a55'],
    foliage: '#1e2a1c', foliageLit: '#78864a', silhouette: '#101311',
    light: '#f0d185', shadow: '#2b3846', water: '#3b4652', clouds: 1.7, rays: 1.4,
  },
  'dawn mist': {
    zenith: '#5a7096', upper: '#a1b1cc', horizon: '#f3cfbd', glow: '#fbe1cf', sun: '#fff7ef',
    haze: '#d8d9e2', cloudShadow: '#8a8eae', cloudLit: '#f4bfac',
    rockFar: '#7b82a2', rockNear: '#4a5163', groundFar: '#8d947f', groundNear: '#38443a',
    fields: ['#8a9472', '#76845f', '#a19f7d', '#687659', '#949a78'],
    foliage: '#283226', foliageLit: '#a59b7d', silhouette: '#15191c',
    light: '#f7ccb2', shadow: '#47506d', water: '#62708e', clouds: 0.7, rays: 0.6,
  },
  // Night (the fjord nocturne): the whole scale drops into deep blue; the moon is a small
  // cool disc with a tight halo, the clouds near it dark with silver edges, the land a
  // near-silhouette whose lights are a cool grey-blue, never warm
  'moonlit night': {
    zenith: '#0a1230', upper: '#1a2850', horizon: '#3f537b', glow: '#a7bad9', sun: '#f3f0e3',
    haze: '#34436a', cloudShadow: '#161d36', cloudLit: '#b4c2dc',
    rockFar: '#2a3454', rockNear: '#151a24', groundFar: '#263044', groundNear: '#0f1419',
    fields: ['#2b3643', '#25313a', '#333c49', '#202b32', '#2d3741'],
    foliage: '#0c120f', foliageLit: '#3f4d5b', silhouette: '#05070a',
    light: '#c2cee3', shadow: '#0f162b', water: '#1a253d', clouds: 0.8, rays: 0, night: 1,
  },
  // Late snow (after a snow study of mountains under an overcast sky): a heavy grey-violet
  // sky laid in level drags, the mountains white to their feet with Prussian-blue shadows,
  // a ploughed brown field with snow lying in its furrows. No sun: the light is diffuse.
  'late snow': {
    zenith: '#3f4352', upper: '#5c6070', horizon: '#9a9ca6', glow: '#d8d6d2', sun: '#eeeae2',
    haze: '#8d919e', cloudShadow: '#4a4c5a', cloudLit: '#c8c6c8',
    rockFar: '#55617f', rockNear: '#303a55', groundFar: '#7a6656', groundNear: '#5a4334',
    fields: ['#7b6252', '#6e5645', '#8a6e58', '#644c3e', '#806452'],
    foliage: '#262b2c', foliageLit: '#59625a', silhouette: '#15171c',
    light: '#e9e8e4', shadow: '#2c3b66', water: '#5d6678', clouds: 1.5, rays: 0, winter: 1,
  },
};

let G;
let S = null; // the scene: all geometry + colours, in REF coordinates
let tasks = [];
let taskIdx = 0;
let R, U; // field rect on screen, and screen px per REF unit
let brushK = 1; // brush scale currently applied (scaleBrushes compounds)
let PANEL_W = 0; // space kept clear for the control panel, fixed at each reset
let BRUSHES = false; // custom brushes registered (once, before any scaling)
let WP = null; // the watercolour settings, frozen when a painting starts
const UI = { status: '' };
const PAPER = [246, 241, 230]; // cold-pressed paper, warm white
const SEPIA = [74, 52, 38];

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));

  const SC = 'Scene';
  const WC = 'Watercolour · washes';
  const WT = 'Watercolour · techniques';
  const MO = 'Mountains';
  const NI = 'Night';
  G = GenArt.create({
    title: 'Watercolor Landscape v1',
    applyOnDemand: true, // a full painting is heavy: settings repaint only on "Apply changes"
    closedGroups: [WT, MO, NI],
    params: {
      sceneType: { value: 0, options: { 'river plain': 0, 'fjord / lake': 1, 'alpine valley': 2 }, label: 'scene', group: SC },
      viewpoint: { value: 1, options: { 'low (looking up)': 0, 'eye level': 1, 'high vantage (looking down)': 2 }, label: 'viewpoint', group: SC },
      mood: { value: 0, options: { 'golden hour': 0, 'after the storm': 1, 'dawn mist': 2, 'moonlit night': 3, 'late snow': 4 }, label: 'mood', group: SC },
      sun: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'sun height', group: SC },
      haze: { value: 0.72, min: 0.3, max: 2.2, step: 0.05, label: 'atmosphere', group: SC },
      ranges: { value: 5, min: 3, max: 7, step: 1, label: 'mountain ranges', group: SC },
      mountainForm: { value: 1, options: { jagged: 0, 'big forms': 1 }, label: 'mountain forms', group: SC },
      mist: { value: 0.45, min: 0, max: 1, step: 0.05, label: 'mist', group: SC },
      clouds: { value: 0.55, min: 0, max: 1, step: 0.05, label: 'clouds', group: SC },
      cloudRows: { value: 0, options: { off: 0, on: 1 }, label: 'cloud rows', group: SC },
      meander: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'river meander', group: SC },
      trees: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'trees', group: SC },
      frame: { value: 1.0, min: 0, max: 1, step: 0.05, label: 'framing trees', group: SC },
      fgTrees: { value: 2, min: 1, max: 4, step: 1, label: 'foreground trees', group: SC },
      fgLayout: { value: 0, options: { 'one side (a group)': 0, 'both sides': 1 }, label: 'foreground trees stand', group: SC },
      rhyme: { value: 0, options: { off: 0, on: 1 }, label: 'tree rhymes the peak', group: SC },

      paintSeed: { value: 0, step: 1, label: 'paint seed (0 = scene)', group: 'Seeds' },

      paper: { value: 0, options: { 'cold pressed (NOT)': 0, rough: 1, 'hot pressed (smooth)': 2 }, label: 'paper', group: WC },
      wetness: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'wetness (bleed of the washes)', group: WC },
      load: { value: 1, min: 0.5, max: 1.6, step: 0.05, label: 'pigment load', group: WC },
      granulation: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'granulation', group: WC },
      backruns: { value: 0.55, min: 0, max: 1, step: 0.05, label: 'backruns / hard edges', group: WC },
      glazes: { value: 2, min: 1, max: 3, step: 1, label: 'glazes over dry paint', group: WC },
      variegation: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'variegated drops (wet-in-wet)', group: WC },
      lifting: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'lifted lights (sun, mist, glints)', group: WC },
      horizonBand: { value: 0.8, min: 0, max: 1.2, step: 0.05, label: 'lifted horizon band', group: WC },

      pencil: { value: 0.45, min: 0, max: 1, step: 0.05, label: 'graphite underdrawing', group: WT },
      dryBrush: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'dry brush', group: WT },
      planes: { value: 0.7, min: 0, max: 1.2, step: 0.05, label: 'flat-brush planes on the mountains', group: WT },
      sponge: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'sponge texture (foliage)', group: WT },
      rigger: { value: 0.7, min: 0, max: 1.5, step: 0.05, label: 'rigger: grass, twigs', group: WT },
      massing: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'massing in the darkest foreground', group: WT },
      penInk: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'pen and wash (hatching)', group: WT },
      spatter: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'spatter', group: WT },
      salt: { value: 0.3, min: 0, max: 1, step: 0.05, label: 'salt texture', group: WT },
      gouache: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'white gouache (snow, stars, sparkle)', group: WT },
      wobble: { value: 2, min: 0, max: 6, step: 0.5, label: 'hand wobble of the lines', group: WT },
      cloudShadows: { value: 0.7, min: 0, max: 1.2, step: 0.05, label: 'cloud shadows on the land', group: WT },
      flowers: { value: 0.5, min: 0, max: 1.5, step: 0.05, label: 'flowers in the foreground', group: WT },

      snow: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'snow (snowline)', group: MO },
      couloirs: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'couloirs', group: MO },
      rockDetail: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'rock: buttresses, scree', group: MO },
      valleyMist: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'valley mist', group: MO },
      mountainShadows: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'cloud shadows on mountains', group: MO },
      stars: { value: 0.6, min: 0, max: 1.5, step: 0.05, label: 'stars (night)', group: NI },
      moonSize: { value: 1, min: 0.6, max: 1.8, step: 0.05, label: 'moon size (night)', group: NI },
      windowLights: { value: 0.5, min: 0, max: 1.5, step: 0.05, label: 'window lights (night)', group: NI },
    },
    onReset: reset,
  });
  buildControls();
  // p5.brush binds to the WEBGL sketch once the p5 constructor has returned, so the
  // first brush-dependent frame waits one tick
  noLoop();
  requestAnimationFrame(() => reset());
}

function panelSpace() {
  const g = G.gui;
  const el = g && g.domElement;
  if (!el || g._closed || g._hidden || windowWidth <= 700) return 0;
  return el.offsetWidth ? el.offsetWidth + 12 : 0;
}

function reset() {
  randomSeed(G.seed);
  noiseSeed(G.seed);
  S = buildScene();
  PANEL_W = panelSpace();
  tasks = buildTasks(S);
  taskIdx = 0;
  window.DONE = false;
  loop();
}

// keep the mat clean while the painting forms (washes deliberately reach past the field)
p5.registerAddon((p5, fn, lifecycles) => {
  lifecycles.postdraw = function () {
    if (!S || !R) return;
    push();
    resetMatrix();
    translate(-width / 2, -height / 2);
    paintMat(S);
    pop();
  };
});

function draw() {
  if (!S) return;
  translate(-width / 2, -height / 2);
  R = fieldRect(width - PANEL_W, height);
  U = R.w / REF_W;
  const t0 = performance.now();
  const last = () => Math.min(tasks.length, STOP);
  while (taskIdx < last() && performance.now() - t0 < FRAME_BUDGET_MS) {
    const ts = performance.now();
    try {
      if (tasks[taskIdx++]() === YIELD) break;
      if (PROFILE) PROFILE.push([taskIdx - 1, Math.round(performance.now() - ts)]);
    } catch (e) {
      console.warn('watercolor-landscape: pass', taskIdx - 1, 'failed:', e && e.message);
    }
  }
  if (taskIdx >= last()) {
    noLoop();
    window.DONE = true;
    UI.status = 'done';
  } else {
    UI.status = Math.round((100 * taskIdx) / tasks.length) + '% · ' + (UI.stage || 'painting');
  }
}

// screen mapping (REF → canvas px, top-left origin after the translate in draw)
const X = (x) => R.x + x * U;
const Y = (y) => R.y + y * U;
const pts = (arr) => arr.map((p) => [X(p[0]), Y(p[1])]);

function setBrushScale(k) {
  brush.scaleBrushes(k / brushK);
  brushK = k;
}

function buildControls() {
  const gui = G.gui;
  if (!gui) return;
  const st = gui.add(UI, 'status').name('painting').listen().disable();
  const kids = gui.$children;
  kids.insertBefore(st.domElement, kids.children[2] || null);
  const seeds = gui.folders.find((f) => f._title === 'Seeds') || gui.addFolder('Seeds');
  const paint = () => G.param('paintSeed');
  const act = {
    scenePrev: () => G.setSeed(Math.max(0, G.seed - 1)),
    sceneNext: () => G.setSeed(G.seed + 1),
    sceneRandom: () => G.randomize(),
    paintPrev: () => G.setParams({ paintSeed: Math.max(1, (paint() || 2) - 1) }),
    paintNext: () => G.setParams({ paintSeed: (paint() || 0) + 1 }),
    paintRandom: () => G.setParams({ paintSeed: 1 + Math.floor(Math.random() * 999999) }),
    save: () => {
      const blob = new Blob([JSON.stringify({ piece: '037-watercolor-landscape', seed: G.seed, params: G.params }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'watercolor-landscape-v1-' + G.seed + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    load: () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        f.text().then((t) => {
          try {
            const j = JSON.parse(t);
            if (j.params) G.setParams(j.params);
            if (j.seed !== undefined) G.setSeed(Number(j.seed) >>> 0);
          } catch (e) {
            console.warn('watercolor-landscape: preset not readable', e && e.message);
          }
        });
      };
      inp.click();
    },
    tuned: () => {
      G.setSeed(4);
      G.setParams(G.defaults());
    },
    // everything at once, with guards where an extreme would ruin the sheet
    shuffleAll: () => {
      const r = (a, b) => a + Math.random() * (b - a);
      const step = (v, d) => (d.step ? Number((d.min + Math.round((v - d.min) / d.step) * d.step).toFixed(6)) : v);
      const guard = {
        paintSeed: () => 1 + Math.floor(Math.random() * 999999),
        sun: (d) => step(r(0.05, 0.85), d),
        haze: (d) => step(r(0.4, 1.6), d),
        load: (d) => step(r(0.75, 1.35), d),
        penInk: (d) => (Math.random() < 0.5 ? 0 : step(r(0.2, 0.8), d)),
      };
      G.shuffle((k, d) => (guard[k] ? guard[k](d) : undefined));
    },
  };
  const shuf = gui.add(act, 'shuffleAll').name('🔀 shuffle everything (X)');
  kids.insertBefore(shuf.domElement, st.domElement.nextSibling);
  seeds.add(act, 'scenePrev').name('◀ scene seed');
  seeds.add(act, 'sceneNext').name('▶ scene seed');
  seeds.add(act, 'sceneRandom').name('🎲 new scene');
  seeds.add(act, 'paintPrev').name('◀ paint seed');
  seeds.add(act, 'paintNext').name('▶ paint seed');
  seeds.add(act, 'paintRandom').name('🎲 new hand (P)');
  const presets = gui.addFolder('Presets');
  presets.add(act, 'tuned').name('★ Tuned painting (seed 4)');
  presets.add(act, 'save').name('Save preset (.json)');
  presets.add(act, 'load').name('Load preset…');
  presets.close();
  window.WC_ACTIONS = act;
  if (gui.onOpenClose) {
    gui.onOpenClose((g) => {
      if (g === gui && panelSpace() !== PANEL_W) G.reset();
    });
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') G.randomize();
  if ((key === 'p' || key === 'P') && window.WC_ACTIONS) window.WC_ACTIONS.paintRandom();
  if ((key === 'x' || key === 'X') && window.WC_ACTIONS) window.WC_ACTIONS.shuffleAll();
  if (key === 's' || key === 'S') saveCanvas('watercolor-landscape-v1-' + G.seed, 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  brush.load();
  if (S) G.reset();
}


// ---------------------------------------------------------------------------------
// The scene engine (from 036, unchanged)
// ---------------------------------------------------------------------------------


// brush.polygon with a guard: p5.brush sizes an offscreen buffer from the polygon's
// bounds, so degenerate (sub-pixel or non-finite) shapes are skipped, not passed on.
function bpoly(arr) {
  const P = pts(arr);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 - x0 < 1.5 || y1 - y0 < 1.5) return null;
  return brush.polygon(P);
}

function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function shadeRGB(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const easeBand = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function buildScene() {
  const rng = G.rng;
  const rnd = (a, b) => a + (b - a) * rng();
  const mood = MOODS[Object.keys(MOODS)[G.param('mood')]] || MOODS['golden hour'];
  const C = {};
  for (const k in mood) C[k] = typeof mood[k] === 'string' ? hexRGB(mood[k]) : mood[k];
  C.fields = mood.fields.map(hexRGB);

  const sunH = G.param('sun');
  const s = { C, rnd, sunH };

  // --- composition: thirds ---
  // The viewpoint moves the eye and the horizon together (the horizon is always at eye
  // height): low — a big sky, the ground squeezed into a narrow band, the mountains
  // towering; eye level — the horizon on the lower third; high vantage — the horizon near
  // the middle, the plain spread out below and the ranges lower against it.
  s.vp = G.param('viewpoint');
  s.HY = REF_H * ([0.75, 0.645, 0.5][s.vp] + rnd(-0.02, 0.02));
  s.vpAmp = [1.18, 1, 0.74][s.vp];
  // The scene type: a river plain; a fjord or lake (the valley floor drowned — the water
  // opens out a little way in front and runs to the foot of steeper, taller mountains,
  // which it mirrors); an alpine valley (the nearer ranges rise steeply at both sides of
  // the picture, a V that converges on the focal summit).
  s.scene = G.param('sceneType');
  s.vpAmp *= [1, 1.22, 1.15][s.scene];
  s.CX = REF_W / 2;
  s.F = REF_H - s.HY; // focal length: ground at z = 1 meets the bottom edge
  s.sunSide = rng() < 0.5 ? -1 : 1; // -1: sun on the left third
  s.sunX = REF_W * (s.sunSide < 0 ? 1 / 3 : 2 / 3) + rnd(-35, 35);
  s.focalX = REF_W * (s.sunSide < 0 ? 2 / 3 : 1 / 3) + rnd(-25, 25);
  s.sunY = s.HY - 200; // provisional; set above the ridges once they exist
  // Lower sun → warmer, longer shadows, stronger glow.
  s.warmth = 1 - 0.55 * sunH;
  // at night the "sun" is the moon: a cool, weak light — the warm terms all but vanish
  s.night = !!C.night;
  if (s.night) s.warmth = 0.22;
  // late snow: no sun, the light diffuse through an overcast
  s.winter = !!C.winter;
  if (s.winter) s.warmth = 0.12;

  // --- atmospheric perspective: transmittance with distance ---
  const k = 0.0125 * G.param('haze');
  s.aerial = (z) => 1 - Math.exp(-k * z);

  // Sky colour at (x, y): vertical gradient + radial sun glow.
  s.sky = (x, y) => {
    const t = clamp01(y / s.HY);
    let c = t < 0.45 ? mixRGB(C.zenith, C.upper, t / 0.45) : mixRGB(C.upper, C.horizon, easeBand(0.45, 1, t));
    const dx = (x - s.sunX) / 1.6;
    const dy = y - s.sunY;
    const d = Math.sqrt(dx * dx + dy * dy);
    // the moon's halo is tight and faint; the sun's broad and strong
    const g = s.night ? Math.exp(-d / (95 * G.param('moonSize'))) * 0.55 : s.winter ? Math.exp(-d / 420) * 0.16 : Math.exp(-d / (210 + 140 * s.warmth)) * (0.75 + 0.25 * s.warmth);
    c = mixRGB(c, C.glow, clamp01(g));
    const band = Math.exp(-Math.abs(y - s.HY) / 70) * 0.35 * s.warmth;
    return mixRGB(c, C.glow, band * Math.exp(-Math.abs(x - s.sunX) / 700));
  };
  // Haze colour: warmer and brighter toward the sun.
  s.hazeAt = (x, y) => {
    const g = Math.exp(-Math.pow((x - s.sunX) / 520, 2)) * 0.65 * s.warmth;
    return mixRGB(mixRGB(C.haze, s.sky(x, Math.min(y, s.HY)), 0.35), C.glow, g);
  };
  // Seen colour of something with local colour c at depth z.
  s.seen = (c, z, x, y) => mixRGB(c, s.hazeAt(x, y), s.aerial(z));
  // The plain's trees span only the near middle distance (z ≈ 2–30), where the global
  // transmittance barely acts; on its own it left far trees as dark and saturated as near
  // ones, so they jumped forward. Across the plain they also fade by their place between
  // the nearest tree and the hills.
  s.treeHaze = (z) => 0.55 * clamp01(Math.log(z / 2.4) / Math.log(Math.max(2.5, s.zGround / 2.4)));
  s.seenTree = (c, z, x, y) => mixRGB(s.seen(c, z, x, y), s.hazeAt(x, y), s.treeHaze(z));
  s.treeAir = (z) => 1 - (1 - s.aerial(z)) * (1 - s.treeHaze(z));

  // --- projection onto the ground plane (camera height 1) ---
  s.gy = (z) => s.HY + s.F / z;
  s.gx = (wx, z) => s.CX + (s.F * wx) / z;

  s.clouds = buildClouds(s);
  diversifyClouds(s);
  if (G.param('cloudRows') === 1) arrangeCloudRows(s);
  s.ranges = buildRanges(s);
  // The sun hangs just above whatever ridge lies beneath it; at height 0 it touches the crest.
  let crest = s.HY;
  for (const L of s.ranges) {
    for (const p of L.ridge) if (Math.abs(p[0] - s.sunX) < 40) crest = Math.min(crest, p[1]);
  }
  s.sunY = Math.max(70, crest - 22 - 270 * sunH);
  // The focal summit: the highest crest on the focal third, which the frame must not cover.
  s.peakTop = s.HY;
  for (const L of s.ranges) {
    for (const p of L.ridge) if (Math.abs(p[0] - s.focalX) < 60) s.peakTop = Math.min(s.peakTop, p[1]);
  }
  s.zGround = s.ranges[s.ranges.length - 1].z; // the ground plane runs up to the nearest hills
  s.river = buildRiver(s);
  s.fields = buildFields(s);
  s.trees = buildTrees(s);
  s.repoussoir = buildRepoussoir(s);
  s.grain = buildGrain(s);
  return s;
}

// Clouds sit on a ceiling above the camera; projection alone makes far ones smaller,
// flatter and lower, crowding toward the horizon. Each is a cluster of lobes over a
// flat base — the base is where the low sun catches it.
function buildClouds(s) {
  const { rnd, C } = s;
  const n = Math.round(G.param('clouds') * 18 * C.clouds);
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = Math.exp(rnd(Math.log(1.9), Math.log(40)));
    const ceil = 3.0 + rnd(-0.3, 0.45);
    const cy = s.HY - (s.F * ceil) / z;
    const halfView = ((REF_W / 2 + 150) * z) / s.F;
    const wx = rnd(-halfView, halfView);
    const cx = s.gx(wx, z);
    const w = Math.min(620, (rnd(2.2, 5.5) * s.F) / z);
    const elev = clamp01((s.HY - cy) / s.HY);
    const h = w * (0.06 + 0.2 * elev) * rnd(0.8, 1.2);
    const lobes = [];
    const nl = 3 + Math.floor(rnd(0, 5));
    for (let k = 0; k < nl; k++) {
      const u = nl === 1 ? 0.5 : k / (nl - 1);
      const lx = cx + (u - 0.5) * w * 0.75 + rnd(-0.06, 0.06) * w;
      const crown = Math.sin(Math.PI * u); // tallest in the middle
      const rx = w * rnd(0.16, 0.26) * (0.75 + 0.4 * crown);
      const ry = h * rnd(0.55, 0.85) * (0.6 + 0.6 * crown);
      lobes.push({ x: lx, y: cy - ry * 0.45, rx, ry, ph: rnd(0, 100) });
    }
    out.push({ z, cx, cy, w, h, lobes });
  }
  out.sort((a, b) => b.z - a.z);
  return out;
}

// Mountain ranges at geometric depths. Screen amplitude, detail (noise octaves),
// edge treatment and colour all derive from z.
function buildRanges(s) {
  const { rnd, C } = s;
  const N = G.param('ranges');
  const zFar = 230;
  const zNear = 11;
  const out = [];
  const peakLayer = N >= 4 ? 1 : 0;
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 1 : i / (N - 1);
    const z = zFar * Math.pow(zNear / zFar, t);
    const air = s.aerial(z);
    const amp = (250 - 165 * t) * rnd(0.85, 1.15) * s.vpAmp;
    const base = s.gy(z);
    const oct = 2 + Math.round(5 * (1 - air));
    // big forms: the shape is carried by the two broad octaves; the finer ones only break
    // the crest a little (Friedrich's and Wilson's mountains are a few large masses with
    // rounded shoulders, not an evenly jagged saw)
    const big = G.param('mountainForm') === 1;
    const ridged = (1 - t) * (big ? 0.3 : 1); // far = sharper, near = rolling
    const feature = 230 + 180 * t;
    const off = rnd(0, 1000);
    const step = 4;
    const raw = [];
    for (let x = -30; x <= REF_W + 30; x += step) {
      let a = 0.5;
      let f = 1 / feature;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < oct; o++) {
        let n = noise(x * f + off, i * 31.7 + o * 9.1);
        const r = 1 - Math.abs(2 * n - 1);
        n = n * (1 - ridged) + r * r * ridged;
        const wgt = big && o >= 2 ? 0.14 : 1;
        sum += a * n * wgt;
        norm += a * wgt;
        a *= 0.5;
        f *= 2.07;
      }
      raw.push([x, sum / norm]);
    }
    if (big) {
      // rounded summits and shoulders: the profile is smoothed (three box passes of
      // ±28 px ≈ a Gaussian), then a faint crest texture is laid back on; the middle ranges
      // otherwise rose as pointed tents
      for (let pass = 0; pass < 3; pass++) {
        const v = raw.map((p) => p[1]);
        for (let q = 0; q < raw.length; q++) {
          let acc = 0, cnt = 0;
          for (let r = Math.max(0, q - 7); r <= Math.min(raw.length - 1, q + 7); r++) { acc += v[r]; cnt++; }
          raw[q][1] = acc / cnt;
        }
      }
      for (const p of raw) p[1] += 0.012 * (noise(p[0] * 0.05 + off, i * 13.1) - 0.5);
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of raw) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    const peakW = rnd(110, 190);
    const ridge = raw.map(([x, v]) => {
      let h = (v - lo) / (hi - lo + 1e-6);
      if (i === peakLayer) {
        const d = (x - s.focalX) / peakW;
        if (big) {
          // an asymmetric summit: steeper on one side, a long shoulder and a lower second
          // summit on the other, the crest a little broken — not a symmetric bell
          const sd = hash2(G.seed % 9973, 7) < 0.5 ? -1 : 1;
          const dd = d * (d * sd > 0 ? 0.72 : 1.4);
          const main = 0.4 + 1.2 * Math.exp(-dd * dd) - 0.1 * Math.abs(dd);
          const e = (d - sd * 1.2) / 0.5;
          const second = 0.38 + 0.78 * Math.exp(-e * e);
          h = Math.max(h, main + 0.035 * (noise(x * 0.04, 77.7) - 0.5), second);
        } else h = Math.max(h, 0.4 + 1.25 * Math.exp(-d * d) - 0.12 * Math.abs(d));
      }
      // alpine valley: the walls rise toward the picture's sides, more on the nearer ranges
      const vu = Math.abs(x - s.focalX) / REF_W;
      const vlift = s.scene === 2 ? (60 + amp) * 2.2 * Math.pow(t, 1.2) * Math.pow(vu, 1.3) : 0;
      return [x, base - amp * (0.12 + 0.88 * h) - vlift];
    });
    const local = mixRGB(C.rockFar, C.rockNear, t);
    out.push({ i, t, z, air, base, amp, ridge, local, isPeak: i === peakLayer, peaks: findPeaks(ridge, s) });
  }
  return out;
}

// Each summit with real prominence gets a shadow face on the side away from the sun:
// summit → down the ridge to the next valley → down to the base → back up a jittered spur.
function findPeaks(ridge, s) {
  const peaks = [];
  const w = 9;
  for (let j = w; j < ridge.length - w; j++) {
    let isTop = true;
    for (let q = j - w; q <= j + w; q++) if (ridge[q][1] < ridge[j][1]) isTop = false;
    if (!isTop) continue;
    const dir = -s.sunSide; // shadow side
    let v = j;
    while (v + dir > 0 && v + dir < ridge.length - 1 && ridge[v + dir][1] >= ridge[v][1] - 0.5) v += dir;
    const prom = ridge[v][1] - ridge[j][1];
    if (prom > 8) peaks.push({ j, v, dir, prom });
  }
  return peaks;
}

// River: a world-space line whose projection vanishes exactly at the focal point where
// it meets the nearest hills, plus a meander that perspective compresses into S-curves.
function buildRiver(s) {
  const { rnd } = s;
  const zN = s.zGround * 0.98;
  const uFocal = s.focalX - s.CX;
  const uStart = -Math.sign(uFocal) * rnd(60, 260);
  const a = (uStart - uFocal) / (s.F * (1 - 1 / zN));
  const b = uStart / s.F - a;
  const A = 1.25 * G.param('meander');
  const ph = rnd(0, TWO_PI);
  const lam = rnd(0.55, 0.8);
  const center = (z) => {
    const sN = Math.log(z) / Math.log(zN);
    const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp01(sN))), 0.8);
    const m = A * env * Math.sin((TWO_PI * Math.log(z)) / lam + ph);
    return a + b * z + m; // world x
  };
  const riverW = (z) => 0.2 + 0.05 * Math.log(z);
  // a lake: the river opens out between zL and zW until its shores leave the picture
  // (opened near the viewer: a shallow band of water shows only the mirrored foot of the
  // nearest hills, a flat dark strip; a deeper one mirrors their crests and the sky above)
  const zL = 1.25, zW = Math.min(zN * 0.35, 3.2);
  const halfW = s.scene !== 1 ? riverW : (z) => {
    if (z <= zL) return riverW(z);
    const full = ((REF_W / 2 + 260) * z) / s.F + Math.abs(center(z));
    const e = clamp01(Math.log(z / zL) / Math.log(zW / zL));
    return riverW(z) + (full - riverW(z)) * e * e * (3 - 2 * e);
  };
  const samples = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const z = 0.8 * Math.pow(zN / 0.8, i / n);
    const cx = center(z);
    samples.push({ z, wl: cx - halfW(z), wr: cx + halfW(z) });
  }
  return { center, halfW, samples, zN };
}

// Patchwork fields: world-space cells on the ground plane, converging on the horizon.
function buildFields(s) {
  const { rnd, C } = s;
  const out = [];
  const zs = [0.8];
  while (zs[zs.length - 1] < s.zGround) zs.push(zs[zs.length - 1] * rnd(1.28, 1.5));
  zs[zs.length - 1] = s.zGround;
  for (let r = 0; r < zs.length - 1; r++) {
    const z0 = zs[r];
    const z1 = zs[r + 1];
    const cw = rnd(2.2, 3.4);
    const half = ((REF_W / 2 + 80) * z1) / s.F;
    const x0 = -Math.ceil(half / cw) * cw;
    for (let x = x0; x < half; x += cw) {
      const skew = rnd(-0.25, 0.25);
      const corners = [
        [s.gx(x, z0), s.gy(z0)],
        [s.gx(x + cw, z0), s.gy(z0)],
        [s.gx(x + cw + skew * (z1 - z0) * 0.1, z1), s.gy(z1)],
        [s.gx(x + skew * (z1 - z0) * 0.1, z1), s.gy(z1)],
      ];
      const zc = (z0 + z1) / 2;
      const col = C.fields[Math.floor(rnd(0, C.fields.length))];
      out.push({ z: zc, z0, z1, x, cw, poly: corners, col, hedge: rng01(s) < 0.28, hedgeSide: rng01(s) < 0.5 });
    }
  }
  return out;
}

const rng01 = (s) => s.rnd(0, 1);

// Trees on the ground plane: along hedgerows and in noise-driven copses, never in the river.
function buildTrees(s) {
  const { rnd } = s;
  const density = G.param('trees');
  const out = [];
  const river = s.river;
  const tries = Math.round(600 * density);
  for (let i = 0; i < tries; i++) {
    // Uniform in log z: as many trees per screen band near and far, so far copses read as texture.
    const z = Math.exp(rnd(Math.log(2.4), Math.log(s.zGround * 0.97)));
    const half = ((REF_W / 2 + 60) * z) / s.F;
    const wx = rnd(-half, half);
    const copse = noise(wx * 0.3 + 50, z * 0.25 + 80);
    if (copse < 0.55 && rnd(0, 1) > 0.06) continue;
    const rc = river.center(Math.min(z, river.zN));
    if (Math.abs(wx - rc) < river.halfW(z) + 0.15) continue;
    const hW = rnd(0.2, 0.34) * (rnd(0, 1) < 0.12 ? 1.5 : 1);
    out.push({ z, wx, hW, tall: rnd(0, 1) < 0.22, ph: rnd(0, 100) });
  }
  // Bank-side trees reinforce the leading line.
  for (let z = 2.2; z < s.zGround * 0.9; z *= rnd(1.15, 1.4)) {
    if (rnd(0, 1) < 0.4 * (0.4 + density)) {
      const side = rnd(0, 1) < 0.5 ? -1 : 1;
      const wx = river.center(z) + side * (river.halfW(z) + rnd(0.05, 0.25)); // close enough to mirror in it
      out.push({ z, wx, hW: rnd(0.22, 0.32), tall: rnd(0, 1) < 0.5, ph: rnd(0, 100), bank: true });
    }
  }
  // Composition pass. Spread evenly, the trees read as a planted orchard: the plain wants
  // a few groves and the river's banks, with open meadow between. This pass thins and
  // varies them with its own random stream, so the scene's draws (the framing tree, the
  // grain) are untouched.
  let h = (G.seed ^ 0x9e3779b9) >>> 0;
  const lr = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const kept = [];
  for (const t of out) {
    const grove = noise(t.wx * 0.3 + 50, t.z * 0.25 + 80);
    const keep = t.bank ? 0.9 : grove > 0.62 ? 0.95 : grove > 0.55 ? 0.55 : 0.3;
    if (lr() > keep) continue;
    // sizes vary: bushes, ordinary trees, now and then an old broad one
    t.hW *= Math.exp(-0.35 + 0.8 * lr()) * (lr() < 0.06 ? 1.6 : 1);
    // poplars are few, and mostly stand along the water
    t.tall = t.bank ? lr() < 0.35 : lr() < 0.07;
    kept.push(t);
  }
  // Waterside trees: where the river runs across the view, a tree on its far bank stands
  // with the water straight in front of its foot, so its reflection falls in the river.
  // Candidates on land are scored by how much of their mirrored height lands on water;
  // the best three, apart from one another and from the other trees, are planted.
  const cover = (wx, z, hW) => {
    let hits = 0;
    for (let f = 0.05; f < 1.2; f += 0.1) {
      const z2 = z / (1 + 1.15 * hW * f);
      if (z2 > river.samples[0].z && Math.abs((wx * z2) / z - river.center(z2)) < river.halfW(z2) * 0.9) hits++;
    }
    return hits / 12;
  };
  const cands = [];
  for (let tries = 0; tries < 900; tries++) {
    const z = 2.4 * Math.pow((s.zGround * 0.6) / 2.4, lr());
    const wx = river.center(z) + (lr() < 0.5 ? -1 : 1) * (river.halfW(z) + 0.04 + 0.5 * lr());
    const hW = 0.24 + 0.1 * lr();
    const tall = lr() < 0.3;
    const x = s.gx(wx, z);
    if (x < 60 || x > REF_W - 60 || Math.abs(wx - river.center(z)) < river.halfW(z) + 0.04) continue;
    const c = cover(wx, z, hW * (tall ? 2 : 1));
    if (c >= 0.25) cands.push({ z, wx, hW, tall, ph: lr() * 100, bank: true, score: c * Math.sqrt(s.F / z) });
  }
  cands.sort((p, q) => q.score - p.score);
  let added = 0;
  for (const c of cands) {
    if (added >= 3) break;
    const x = s.gx(c.wx, c.z);
    if (kept.some((q) => Math.abs(q.z - c.z) < c.z * 0.12 && Math.abs(s.gx(q.wx, q.z) - x) < 24)) continue;
    delete c.score;
    kept.push(c);
    added++;
  }
  kept.sort((a, b) => b.z - a.z);
  return kept;
}

// Repoussoir: a dark bank rising toward the shadow side and a tree at
// that edge whose limbs arch over the top of the picture. A keep-clear zone (the sun,
// the focal third, the middle distance) prunes any limb that would wander into it.
function buildRepoussoir(s) {
  const { rnd } = s;
  const amt = G.param('frame');
  const side = -s.sunSide; // shadow side
  const fromEdge = (x) => (side > 0 ? REF_W - x : x);

  const both = G.param('fgLayout') === 1 && G.param('fgTrees') > 1;
  const bank = [];
  const ph = rnd(0, 100);
  for (let x = -20; x <= REF_W + 20; x += 6) {
    const u = clamp01(1 - fromEdge(x) / REF_W); // 1 at the tree side
    // with a tree on the far side too, the bank rises a little there as well
    const u2 = both ? clamp01(fromEdge(x) / REF_W) : 0;
    const lift = (62 + 200 * Math.max(Math.pow(u, 2.6), 0.6 * Math.pow(u2, 3.2))) * (0.3 + 0.7 * amt);
    const n = noise(ph + x * 0.004) * 46 + noise(ph + 9 + x * 0.025) * 14;
    bank.push([x, REF_H - lift - n + 24]);
  }

  // The limb tree is grown twice from the same random tape: once with the no-crossing rule,
  // once without. The crossing-free tree is kept unless steering round other limbs cost it
  // more than a sixth of its crown (a thin crown is a worse fault than one crossing).
  // one tape per tree: the two growths of a tree read the same random numbers
  const tapes = (src) => {
    const tape = [];
    return () => {
      let i = 0;
      return (lo, hi) => {
        if (i >= tape.length) tape.push(src(0, 1));
        return lo + (hi - lo) * tape[i++];
      };
    };
  };
  // the direction of the peak's near flank, rising from the tree's side to the summit
  let rhymeA = null;
  if (G.param('rhyme') === 1) {
    let L = null, ia = -1, ay = Infinity;
    for (const R of s.ranges) R.ridge.forEach((p, i) => { if (Math.abs(p[0] - s.focalX) < 70 && p[1] < ay) { ay = p[1]; L = R; ia = i; } });
    if (L) {
      const ax = L.ridge[ia][0];
      const j = Math.max(0, Math.min(L.ridge.length - 1, ia + Math.round((side * 160) / 4)));
      const [x2, y2] = L.ridge[j];
      if (Math.abs(x2 - ax) > 20) rhymeA = Math.atan2(ay - y2, ax - x2);
    }
  }
  // T: which edge the tree stands by, how far in its foot is (b0..b1), its scale (k for
  // length, wk for girth), and how far into the picture its limbs may reach low down
  const growTree = (noCross, rnd, T) => {
    const side = T.side;
    const edgeX = (u) => (side > 0 ? REF_W - u : u);
    const fromEdge = (x) => (side > 0 ? REF_W - x : x);
    const segs = [];
    const tips = [];
    const forks = [];
    const bx = edgeX(rnd(T.b0, T.b1));
    const inward = -side;
    const nearPeak = (x, y) => Math.hypot((x - s.focalX) / 1.3, y - s.peakTop) < 150;
    const clear = (x, y) =>
      Math.hypot(x - s.sunX, y - s.sunY) < 170 ||
      nearPeak(x, y) ||
      (fromEdge(x) > T.reach && y > REF_H * 0.3);
    // Limbs never cross one another (an X of two big limbs reads as a mistake): a step that
    // would cut through an existing limb turns aside, or the limb stops there.
    const cut = (ax, ay, bx, by, ox, oy) => {
      const ccw = (px, py, qx, qy, rx, ry) => (ry - py) * (qx - px) > (qy - py) * (rx - px);
      for (const g of segs) {
        if (g.stub || g.depth > 2) continue;
        for (let i = 1; i < g.pts.length; i++) {
          const [cx2, cy2] = g.pts[i - 1], [dx2, dy2] = g.pts[i];
          // segments that touch the fork this limb grows from are its parent and siblings
          if (Math.hypot(cx2 - ox, cy2 - oy) < 6 || Math.hypot(dx2 - ox, dy2 - oy) < 6) continue;
          if (ccw(ax, ay, cx2, cy2, dx2, dy2) !== ccw(bx, by, cx2, cy2, dx2, dy2) && ccw(ax, ay, bx, by, cx2, cy2) !== ccw(ax, ay, bx, by, dx2, dy2)) return true;
        }
      }
      return false;
    };
    // A limb that ends without children forks into two short twigs instead of standing as a
    // bare pole; the twig ends carry foliage.
    const twigFork = (p, a, len, w, depth, me) => {
      const n0 = p.length;
      if (depth > 2 || n0 < 4) return false;
      // only where the twigs can carry foliage: a bare fork low in the picture reads as a thorn
      const m = Math.max(3, Math.round(n0 * 0.72));
      const [ex, ey, ew] = p[m - 1];
      if (ey > REF_H * 0.42 && fromEdge(ex) > T.leafReach) return false;
      let any = false;
      for (const da of [-0.55, 0.5]) {
        const ta = a + da + 0.15 * Math.sign(Math.cos(a)); // the twigs droop a little
        const l = len * 0.3;
        const tw = Math.max(1.2, ew * 0.55);
        const q = [[ex, ey, tw]];
        for (let j = 1; j <= 4; j++) q.push([ex + (Math.cos(ta) * l * j) / 4, ey + (Math.sin(ta) * l * j) / 4, tw * (1 - 0.18 * j)]);
        if (clear(q[4][0], q[4][1]) || cut(ex, ey, q[4][0], q[4][1], ex, ey)) continue;
        segs.push({ pts: q, depth: depth + 1, parent: me });
        tips.push([q[4][0], q[4][1], depth + 1]);
        any = true;
      }
      if (any) p.length = m;
      return any;
    };
    const grow = (x, y, ang, len, w, depth, parent = -1) => {
      const p = [[x, y, w]];
      let cx = x;
      let cy = y;
      let a = ang;
      const steps = 7;
      let pruned = false;
      // a limb's gesture: long straight runs broken by an elbow or two where it changes
      // direction, alternating left and right (Etherington: main movement, direction
      // change; Ran: the elbowed olive and dead-wood branches) — not a steady wobble
      // (the trunk itself stays a straight cylinder, Ran)
      const elbowAt = new Set(depth > 0 ? [Math.floor(rnd(2, steps - 1))] : []);
      if (depth > 0 && depth <= 2 && rnd(0, 1) < 0.45) elbowAt.add(Math.floor(rnd(2, steps)));
      let esign = rnd(0, 1) < 0.5 ? -1 : 1;
      const stubs = [];
      for (let k = 1; k <= steps; k++) {
        a += rnd(-0.06, 0.06);
        if (elbowAt.has(k)) {
          // bend the alternate way, unless that heads into the keep-clear zone
          const e = rnd(0.2, 0.4);
          const ahead = (aa) => clear(cx + Math.cos(aa) * len * 0.5, cy + Math.sin(aa) * len * 0.5);
          if (ahead(a + esign * e) && !ahead(a - esign * e)) esign = -esign;
          a += esign * e;
          esign = -esign;
        }
        if (depth >= 2) a += 0.03 * Math.sign(Math.cos(a)) * (k / steps); // thin limbs droop
        // A limb that sees the keep-clear zone ahead curves gently up and back toward the
        // edge, the way a tree grows around an obstacle; only if it cannot does it stop.
        const turn = () => -inward * Math.sign(Math.cos(a) * inward || 1);
        if (depth > 0 && clear(cx + Math.cos(a) * len * 0.6, cy + Math.sin(a) * len * 0.6)) a += turn() * 0.12;
        let nx = cx + (Math.cos(a) * len) / steps;
        let ny = cy + (Math.sin(a) * len) / steps;
        for (let tries = 0; tries < 3 && depth > 0 && clear(nx, ny); tries++) {
          a += turn() * 0.12;
          nx = cx + (Math.cos(a) * len) / steps;
          ny = cy + (Math.sin(a) * len) / steps;
        }
        if (depth > 0 && clear(nx, ny)) {
          pruned = true;
          break;
        }
        if (noCross && depth === 1 && cut(cx, cy, nx, ny, x, y)) {
          // steer gently round the other limb; if no small turn clears it, keep the course
          // (a large turn or a pruned limb costs more of the crown than the crossing does)
          const a0 = a;
          let ok = false;
          for (const da of [0.15, -0.3, 0.45, -0.6]) {
            a += da;
            const tx = cx + (Math.cos(a) * len) / steps, ty = cy + (Math.sin(a) * len) / steps;
            if (!clear(tx, ty) && !cut(cx, cy, tx, ty, x, y)) { nx = tx; ny = ty; ok = true; break; }
          }
          if (!ok) a = a0;
        }
        cx = nx;
        cy = ny;
        p.push([cx, cy, w * (1 - (0.45 * k) / steps)]);
        // a broken-off side branch: a short blunt stub (the knuckles along old limbs)
        if (depth <= 2 && w > 6 && k < steps && rnd(0, 1) < 0.16) {
          stubs.push([p.length - 1, a + (rnd(0, 1) < 0.5 ? -1 : 1) * rnd(0.6, 1.1), rnd(0.18, 0.28), rnd(2.5, 4.5)]);
        }
      }
      if (p.length < 3) return; // a limb stopped at birth is simply not grown
      if (pruned && depth > 0) {
        // a limb steered more than ~60° off its course has hooked round the keep-clear zone:
        // it ends where the hook begins, as a snapped limb
        for (let q = 2; q < p.length; q++) {
          const ha = Math.atan2(p[q][1] - p[q - 1][1], p[q][0] - p[q - 1][0]);
          if (Math.abs(Math.atan2(Math.sin(ha - ang), Math.cos(ha - ang))) > 1.05) {
            p.length = Math.max(3, q);
            [cx, cy] = p[p.length - 1];
            break;
          }
        }
      }
      if (pruned) {
        // Taper the last stretch to a point so a stopped limb never ends as a sawn stub.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.38 + (0.62 * q) / m;
      }
      const me = segs.length;
      segs.push({ pts: p, depth, parent });
      for (const [idx, sa, fw, fl] of stubs) {
        if (Math.sin(sa) > -0.1) continue; // stubs point up or sideways, not into the ground
        // sized from the limb as finally drawn (after any end taper), so a stub is never
        // thicker than the wood it grows from
        const [sx, sy, lw] = p[Math.min(idx, p.length - 1)];
        const sw = lw * fw;
        if (sw < 1.2) continue;
        const l = sw * fl;
        const q = [[sx, sy, sw]];
        for (let j = 1; j <= 3; j++) q.push([sx + (Math.cos(sa) * l * j) / 3, sy + (Math.sin(sa) * l * j) / 3, sw * (1 - 0.15 * j)]);
        if (!clear(q[3][0], q[3][1])) segs.push({ pts: q, depth: depth + 2, stub: true, parent: me });
      }
      if (depth >= 5 || w < 1.5 || p.length < steps + 1) {
        if (!(p.length < steps + 1 && twigFork(p, a, len, w, depth, me))) tips.push([cx, cy, depth]);
        return;
      }
      if (depth >= 3) forks.push([cx, cy, depth]); // foliage along the outer limbs, not only at tips
      const before = segs.length;
      const kids = depth === 0 ? 3 : rnd(0, 1) < 0.6 ? 2 : 3;
      for (let c = 0; c < kids; c++) {
        let na = a + rnd(-0.65, 0.65) + inward * rnd(0.15, 0.5) * (depth < 2 ? 1 : 0.4);
        const lo = -Math.PI + 0.1;
        const hi = -0.1;
        if (na > hi && na < Math.PI / 2) na = hi - rnd(0, 0.25);
        if (na < lo || na >= Math.PI / 2) na = lo + rnd(0, 0.25);
        // rhyme (Cézanne's pine): the inward secondary limbs turn toward the slope of the
        // peak's near flank, so the tree echoes the mountain (no extra draws: off = as before)
        if (rhymeA !== null && T.main && depth === 1 && Math.cos(na) * inward > 0) na = Math.max(lo, Math.min(hi, na + (rhymeA - na) * 0.55));
        grow(cx, cy, na, len * rnd(0.64, 0.84), w * rnd(0.52, 0.68), depth + 1, me);
      }
      if (segs.length === before && !twigFork(p, a, len, w, depth, me)) {
        // Every child was stopped by the keep-clear zone: this limb becomes a tip, tapered.
        const m = Math.min(4, p.length - 1);
        for (let q = 0; q < m; q++) p[p.length - 1 - q][2] *= 0.38 + (0.62 * q) / m;
        tips.push([cx, cy, depth]);
      }
    };
    grow(bx, REF_H + 30, -Math.PI / 2 + inward * rnd(0.05, 0.14), rnd(340, 420) * (0.75 + 0.25 * amt) * T.k, rnd(36, 48) * T.wk, 0);
    return { segs, tips, forks, fromEdge, leafReach: T.leafReach };
  };
  // The trees (the fjord and Tatra studies frame with groups, not a lone tree): the main
  // tree by the shadow-side edge; the others either stand with it as a group — younger,
  // thinner and shorter, their feet farther in along the bank, their crowns overlapping —
  // or one stands by the far edge, smaller, so the view is framed from both sides.
  const plan = [{ side, b0: 50, b1: 120, k: 1, wk: 1, reach: REF_W * 0.24, leafReach: REF_W * 0.2, main: true }];
  // the other trees draw from their own stream, so adding one leaves the main tree as it was
  const pr = seededRand(G.seed ^ 0x3a9e1f27);
  const prnd = (a, b) => a + (b - a) * pr();
  if (amt > 0.05) {
    let j = 0;
    for (let t = 1; t < G.param('fgTrees'); t++) {
      if (both && t === 1) {
        plan.push({ side: -side, b0: 25, b1: 85, k: prnd(0.62, 0.76), wk: prnd(0.5, 0.64), reach: REF_W * 0.15, leafReach: REF_W * 0.24 });
      } else {
        const b = 165 + 105 * j++ + prnd(0, 50);
        plan.push({ side, b0: b, b1: b + 30, k: prnd(0.55, 0.74) - 0.06 * j, wk: prnd(0.42, 0.58), reach: b + REF_W * 0.12, leafReach: b + REF_W * 0.24 });
      }
    }
  }
  const segs = [];
  const grown = [];
  if (amt > 0.05) {
    const crown = (t) => t.tips.length + 0.4 * t.forks.length;
    for (const T of plan) {
      const taped = tapes(T.main ? rnd : prnd);
      const free = growTree(false, taped(), T);
      const tidy = growTree(true, taped(), T);
      const g = crown(tidy) >= 0.85 * crown(free) ? tidy : free;
      // one list of limbs for all the trees: parents re-indexed into it
      const off = segs.length;
      for (const q of g.segs) segs.push({ ...q, parent: q.parent >= 0 ? q.parent + off : -1 });
      grown.push(g);
    }
  }
  // Foliage masses at tips and outer forks — high, and never over the sun.
  const leaves = [];
  for (const g of s.winter ? [] : grown) { // late snow: bare trees
    const nodes = g.tips.map((t) => [...t, 1]).concat(g.forks.map((f) => [...f, 0.4]));
    for (const [x, y, d, weight] of nodes) {
      if (y > REF_H * 0.42 && g.fromEdge(x) > g.leafReach) continue;
      const n = Math.round(rnd(6, 12) * amt * weight);
      for (let k = 0; k < n; k++) {
        const r = rnd(8, 24) * (d > 3 ? 1 : 1.35);
        const lx = x + rnd(-42, 42);
        const ly = y + rnd(-28, 18);
        if (Math.hypot(lx - s.sunX, ly - s.sunY) < 160 + r) continue;
        if (Math.hypot((lx - s.focalX) / 1.3, ly - s.peakTop) < 170 + r) continue;
        leaves.push({ x: lx, y: ly, r, ph: rnd(0, 100) });
      }
    }
  }
  // A limb end that no foliage reached (the keep-clear zone emptied it) would taper to a
  // bare needle: it is snapped instead, ending blunt like an old broken limb.
  const hasKids = new Set(segs.map((g) => g.parent)); // stubs too: they sit along the limb
  segs.forEach((g, i) => {
    if (s.winter || g.stub || g.depth === 0 || hasKids.has(i) || g.pts.length < 5) return; // bare twigs stay
    const [ex, ey] = g.pts[g.pts.length - 1];
    if (leaves.some((l) => Math.hypot(l.x - ex, l.y - ey) < 50)) return;
    g.pts.length -= 2;
  });
  return { side, bank, segs, leaves, amt };
}

function buildGrain(s) {
  const { rnd } = s;
  const n = 26000;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = rnd(0, REF_W);
    out[i * 3 + 1] = rnd(0, REF_H);
    out[i * 3 + 2] = rnd(0, 1);
  }
  return out;
}

// Cloud shadows on the plain: soft dark patches and the sunlit gaps between them —
// chiaroscuro at the scale of the land itself. Drawn in world space, so they flatten with z.
// A small seeded generator, for passes that must not touch the scene's own stream.
function seededRand(seed) {
  let h = seed >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cloud character. Clouds in one sky are not one kind: towering cumulus with built-up
// tops, long flat banks of stratocumulus, ragged fractus torn into pieces, and high thin
// cirrus far above them all. Each cloud is given a kind, a thickness and a shape from its
// own random stream (the scene's stream is untouched), and the sky gets a few cirrus wisps.
function diversifyClouds(s) {
  const lr = seededRand(G.seed ^ 0x51ed270b);
  const R = (a, b) => a + (b - a) * lr();
  for (const c of s.clouds) {
    const q = lr();
    c.kind = q < 0.4 ? 'cumulus' : q < 0.72 ? 'strato' : 'fractus';
    c.thick = R(0.7, 1.25); // how much light it stops: thin clouds stay nearer the sky
    if (c.kind === 'cumulus') {
      // built up: the biggest lobes push 1–3 rounded towers above them
      const big = c.lobes.slice().sort((a, b) => b.rx * b.ry - a.rx * a.ry).slice(0, 2);
      for (const lb of big) {
        const m = 1 + Math.floor(R(0, 2.99));
        for (let k = 0; k < m; k++) {
          const rx = lb.rx * R(0.4, 0.65);
          c.lobes.push({ x: lb.x + R(-0.5, 0.5) * lb.rx, y: lb.y - lb.ry * R(0.45, 0.85), rx, ry: rx * R(0.75, 1.0), ph: R(0, 100) });
        }
      }
      c.h *= 1.35;
    } else if (c.kind === 'strato') {
      // a long flat bank: lobes stretched and lowered toward the base, one more each side
      for (const lb of c.lobes) {
        lb.rx *= R(1.15, 1.4);
        lb.ry *= R(0.55, 0.75);
        lb.y += (c.cy - lb.y) * 0.4;
      }
      for (const sd of [-1, 1]) {
        const e = sd < 0 ? c.lobes.reduce((a, b) => (b.x < a.x ? b : a)) : c.lobes.reduce((a, b) => (b.x > a.x ? b : a));
        c.lobes.push({ x: e.x + sd * e.rx * R(0.7, 1.0), y: e.y + R(0, 0.2) * e.ry, rx: e.rx * R(0.6, 0.85), ry: e.ry * R(0.6, 0.85), ph: R(0, 100) });
      }
      c.w *= 1.3;
      c.h *= 0.75;
    } else {
      // fractus: smaller pieces, drawn apart, with ragged edges
      for (const lb of c.lobes) {
        lb.rx *= R(0.6, 0.85);
        lb.ry *= R(0.5, 0.75);
        lb.x = c.cx + (lb.x - c.cx) * R(1.15, 1.45);
        lb.y += R(-0.15, 0.15) * c.h;
      }
      c.thick *= 0.8;
    }
  }
  // cirrus: a few high, thin, combed wisps, near the top of the sky, slanting with the wind
  s.wisps = [];
  const n = Math.round(R(1, 4.99) * G.param('clouds') * s.C.clouds);
  const wind = R(-0.25, 0.1);
  for (let i = 0; i < n; i++) {
    const cx = R(0.05, 0.95) * REF_W, cy = R(0.06, 0.32) * s.HY;
    s.wisps.push({ cx, cy, len: R(160, 420), a: wind + R(-0.12, 0.12), curl: R(-0.25, 0.25), strands: 4 + Math.floor(R(0, 6)), ph: R(0, 100) });
  }
}

// Cloud rows (Wivenhoe Park): the clouds gathered onto three receding rows, with blue
// between them. Each cloud keeps its place over the ground and its shape, and moves to
// the nearest row's depth, so it scales and drops as perspective requires. Its own
// random stream: nothing else in the scene moves.
function arrangeCloudRows(s) {
  const rows = [3.2, 7, 16];
  const lr = seededRand(G.seed ^ 0x7f4a7c15);
  for (const c of s.clouds) {
    let best = rows[0];
    for (const r of rows) if (Math.abs(Math.log(c.z / r)) < Math.abs(Math.log(c.z / best))) best = r;
    const z2 = best * Math.exp((lr() - 0.5) * 0.25);
    const sc = c.z / z2;
    const cx2 = s.CX + (c.cx - s.CX) * sc, cy2 = s.HY - (s.HY - c.cy) * sc;
    // the place follows perspective; the size only part of the way (a far cloud brought
    // forward would otherwise swell to a ball), and the row flattens with distance
    const k = Math.min(1.5, Math.max(0.65, Math.sqrt(sc)));
    const flat = z2 > 10 ? 0.75 : 1;
    for (const lb of c.lobes) {
      lb.x = cx2 + (lb.x - c.cx) * k;
      lb.y = cy2 + (lb.y - c.cy) * k * flat;
      lb.rx *= k;
      lb.ry *= k * flat;
    }
    Object.assign(c, { cx: cx2, cy: cy2, w: c.w * k, h: c.h * k * flat, z: z2 });
  }
  s.clouds.sort((a, b) => b.z - a.z);
}

// Where the clouds' shadows fall on the plain (Wivenhoe Park: the land patterned light and
// dark by the clouds above it). Each cloud in the sky casts its shadow down the sun's
// rays: a cloud hc above the ground moves t = hc / tan(sun elevation) toward the viewer
// and sideways away from the sun. Only those that land on the visible plain are kept.
// Clouds overhead and behind the viewer (out of the picture) shade the near plain too: a
// few such patches come from their own seeded stream. Returns world ellipses.
function cloudShadowPatches(s) {
  if (s._cloudShadows) return s._cloudShadows;
  const out = [];
  const tanE = Math.max(0.15, (s.HY - s.sunY) / s.F);
  const ax = (s.sunX - s.CX) / s.F; // the sun's sideways offset per unit of depth
  for (const c of s.clouds) {
    const hc = ((s.HY - c.cy) * c.z) / s.F + 1; // ceiling above the eye, plus the eye's height
    const t = hc / tanE;
    const zs = c.z - t;
    if (zs < 1 || zs > s.zGround) continue;
    const ww = (c.w * c.z) / s.F, hw = (c.h * c.z) / s.F;
    out.push({ wx: ((c.cx - s.CX) * c.z) / s.F - t * ax, z: zs, rw: ww * 0.45, rz: Math.max(0.35, ww * 0.25 + (hw / tanE) * 0.5), ph: c.lobes[0].ph, k: 1 });
  }
  const lr = seededRand(G.seed ^ 0x2c1b3c6d);
  const nO = Math.round(3 * G.param('clouds') * s.C.clouds);
  for (let i = 0; i < nO; i++) {
    const z = 1.4 + lr() * 2.6;
    const half = ((REF_W / 2) * z) / s.F;
    const rw = 0.6 + lr() * 1.0;
    out.push({ wx: (lr() * 2 - 1) * half, z, rw, rz: rw * (0.4 + lr() * 0.4), ph: lr() * 100, k: 0.85 });
  }
  s._cloudShadows = out;
  return out;
}

// Gather the tip clumps into canopy masses (greedy proximity clustering).
function canopyClusters(leaves) {
  const out = [];
  const used = new Array(leaves.length).fill(false);
  for (let i = 0; i < leaves.length; i++) {
    if (used[i]) continue;
    const members = [];
    for (let j = i; j < leaves.length; j++) {
      if (!used[j] && Math.hypot(leaves[j].x - leaves[i].x, leaves[j].y - leaves[i].y) < 70) {
        used[j] = true;
        members.push(leaves[j]);
      }
    }
    let cx = 0, cy = 0;
    for (const m of members) { cx += m.x; cy += m.y; }
    cx /= members.length;
    cy /= members.length;
    let r = 0;
    for (const m of members) r = Math.max(r, Math.hypot(m.x - cx, m.y - cy) + m.r);
    out.push({ x: cx, y: cy, r: Math.max(14, r), members, ph: random(100) });
  }
  return out;
}

// Chaikin corner-cutting, twice: the recursion's straight segments become a grown curve.
function smoothLimb(P) {
  let Q = P;
  for (let it = 0; it < 2; it++) {
    const R = [Q[0]];
    for (let i = 0; i < Q.length - 1; i++) {
      const a = Q[i];
      const b = Q[i + 1];
      R.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      R.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    R.push(Q[Q.length - 1]);
    Q = R;
  }
  return Q;
}

// A child limb starts exactly where its parent ends, and both taper there, which leaves
// a notch at every fork. Extending the child back into its parent by half its width
// lets the two bodies overlap into one joint.
// A limb grows out of its parent instead of butting onto it (Ran's olive and Etherington's
// branch drawings: the wood flows round the fork, no seam). The child's path is extended
// back along the parent's last stretch — far for the dominant (thickest) child, which
// continues the parent's run, a little for the others — and its base swells into a
// collar, never wider than the parent there.
function jointed(seg, segs) {
  const P = seg.pts;
  if (seg.depth === 0 || P.length < 2) return P;
  const [x0, y0, w0] = P[0];
  const par = segs && seg.parent >= 0 ? segs[seg.parent] : null;
  if (!par) {
    const dx = P[1][0] - x0, dy = P[1][1] - y0, d = Math.hypot(dx, dy) || 1;
    return [[x0 - (dx / d) * w0 * 0.45, y0 - (dy / d) * w0 * 0.45, w0 * 0.6]].concat(P);
  }
  const sibs = segs.filter((o) => o.parent === seg.parent && !o.stub);
  const dominant = sibs.every((o) => o.pts[0][2] <= w0);
  const pw = par.pts[par.pts.length - 1][2];
  const back = dominant ? 3 : 1;
  const tail = par.pts.slice(Math.max(0, par.pts.length - 1 - back), par.pts.length - 1).map((q) => [q[0], q[1], Math.min(q[2], dominant ? q[2] : w0 * 0.8)]);
  const out = tail.concat(P.map((q) => q.slice()));
  const start = tail.length, nC = Math.max(2, Math.round((P.length - 1) * 0.3));
  for (let i = 0; i < nC; i++) {
    const t = i / nC;
    out[start + i][2] = Math.min(pw * 0.95, out[start + i][2] * (1 + 0.32 * (1 - t) * (1 - t)));
  }
  return out;
}

const bankAt = (rp, x) => rp.bank[Math.max(0, Math.min(rp.bank.length - 1, Math.round((x + 20) / 6)))][1];

// a repeatable pseudo-random value in [0, 1) for a pair of integers (patch and field ids)
const hash2 = (a, b) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Van Gogh's drawing colour: the dark blue line round trunks and leaves (Arles, 1888)
const PRUSSIAN = [40, 66, 132];

const BARK = [74, 53, 37]; // #4a3525

const ACCENTS = {
  violet: [118, 92, 150],
  ochre: [196, 156, 74],
  orange: [196, 120, 70],
  olive: [120, 128, 64],
};

// The direction/scale field, from scene geometry. Returns {a, k, kind, ...} — stroke
// angle, size multiplier and what is being painted — for a REF point.
// The planes of a range (Friedrich, Wilson): a point under a crest belongs to a slope whose
// direction is the crest's, smoothed over a width that grows with depth below it, crossed
// by spurs running down from the summits (an alternation of faces). Returns the lateral
// screen slope `sl` (dy/dx; + descends to the right), how far it turns to the sun (`lit`)
// or away from it (`shade`), the depth below the crest `d`, and a lit-crest term.
function rangePlane(s, L, x, y) {
  if (!L.cum) {
    L.cum = [0];
    for (const p of L.ridge) L.cum.push(L.cum[L.cum.length - 1] + p[1]);
  }
  const n = L.ridge.length;
  const idx = (xx) => Math.max(0, Math.min(n - 1, Math.round((xx + 30) / 4)));
  const avg = (x0, x1) => {
    const a = idx(Math.min(x0, x1)), b = Math.max(idx(Math.max(x0, x1)), a + 1);
    return (L.cum[b] - L.cum[a]) / (b - a);
  };
  const ry = L.ridge[idx(x)][1];
  const d = Math.max(0, y - ry);
  const w = 10 + d * 0.9;
  let sl = (avg(x, x + w) - avg(x - w, x)) / w;
  // spurs: a height field of ridges falling from the crest, its lateral slope alternating
  const sp = (xx) => noise(xx * 0.022 + d * 0.0035, L.i * 7.1 + 3.3);
  const spurA = 26 * clamp01(d / 25) * (1 - 0.6 * L.air);
  sl += ((sp(x + 3) - sp(x - 3)) / 6) * spurA;
  const toSun = sl * s.sunSide; // descending toward the sun = facing it
  const lit = clamp01(toSun * 1.6);
  const shade = clamp01(-toSun * 1.6);
  const crest = Math.exp(-d / (4 + 5 * L.t)) * (0.35 + 0.65 * clamp01(0.5 + toSun * 2));
  return { sl, lit, shade, d, crest };
}

// Mountain detail at a point under a range's crest (the Tatra and fjord studies): how much
// snow lies there, whether rock is exposed, the strata, a scree fan, and a cloud's
// shadow. Altitude is measured from the range's foot (0) to its typical crest (1).
//  - snow lies above a snowline that the snow setting lowers; steep faces shed it; it
//    reaches further down in hollows and in couloirs — gullies falling from the cols;
//  - rock shows on steep faces above the scree: buttresses, crossed by faint bands;
//  - scree fans spread below the gullies at the foot of the nearer ranges;
//  - a cloud standing above a range shades a broad patch of it, so one slope can be in
//    sun while the next is in shadow.
function rangeDetail(s, L, x, y, P) {
  const alt = (L.base - y) / Math.max(1, L.amp);
  const SN = s.winter ? Math.max(0.9, G.param('snow')) : G.param('snow'), CO = G.param('couloirs'), RD = G.param('rockDetail');
  if (L.maxSpan === undefined) L.maxSpan = Math.max(...L.ridge.map((p) => L.base - p[1]));
  const ry = y - P.d;
  // how high this stretch of crest stands: snow belongs to the summits and high crests,
  // not to a fixed fraction of every range (that read as a level white band); the farther
  // ranges stand higher and carry more of it, the near hills almost none
  const crestH = (L.base - ry) / Math.max(1, L.maxSpan);
  const high = s.winter ? 1 : clamp01((crestH - (0.82 - 0.4 * SN)) / 0.25); // late snow: every crest
  // snow lies on some stretches of a crest and not others (wind, aspect), and the farthest
  // ranges show less of it through their air — otherwise a high far range wore a
  // continuous white belt (glaring by moonlight)
  const gate = L.isPeak ? 1.25 : clamp01((noise(x * 0.005 + L.i * 3.1, 17.3) - (s.winter ? 0.2 : 0.38)) / 0.2) * (0.45 + 0.55 * (1 - L.air));
  // late snow: the nearer ranges are white too, down to their feet
  const reachK = SN * high * gate * clamp01(1 - (s.winter ? 0.55 : 1.4) * L.t);
  // hollows between spurs hold the snow further down, the ribs shed it
  const sp = noise(x * 0.022 + P.d * 0.0035, L.i * 7.1 + 3.3);
  const hollow = clamp01((0.5 - sp) * 3);
  const patch = 0.55 + 0.9 * noise(x * 0.045, y * 0.03, L.i * 2.2 + 2.2);
  const reach = L.maxSpan * (s.winter ? 1.4 : 0.32) * reachK * patch * (0.45 + 0.9 * hollow);
  // couloirs: thin, broken gullies running down from the snowfield, a little past it
  const cou = noise(x * 0.03 + P.d * 0.0025, L.i * 5.3 + 11);
  const run = clamp01((noise(P.d * 0.06, x * 0.01, L.i + 4.4) - 0.42) * 4);
  const gully = CO * reachK * clamp01(1 - Math.abs(cou - 0.5) / 0.012) * run *
    clamp01((P.d - reach * 0.5) / 6) * clamp01((reach * 2.2 + 10 - P.d) / 12);
  const steep = clamp01((Math.abs(P.sl) - 0.55) / 0.5);
  // a snowfield too shallow to read as a patch would only rim the crest with a white line
  let snow = reachK > 0 ? clamp01((reach - P.d) / 5) * (1 - 0.7 * steep) * clamp01((reach - 5) / 8) : 0;
  snow = Math.max(snow, gully * 0.9);
  const rock = RD * steep * clamp01((alt - 0.2) / 0.2) * (1 - snow);
  const band = RD * (noise(y * 0.09 + noise(x * 0.01, L.i) * 2, L.i * 3.7) - 0.5) * clamp01(alt / 0.3) * (1 - snow);
  const fan = clamp01(1 - Math.abs(noise(x * 0.012, L.i * 2.9 + 4) - 0.5) / (0.06 + 0.2 * clamp01(0.3 - alt)));
  const scree = RD * L.t * clamp01((0.32 - alt) / 0.2) * fan * (1 - snow);
  let shade = 0;
  const MS = G.param('mountainShadows');
  if (MS > 0) {
    for (const c of s.clouds) {
      const sx = (x - (c.cx + (c.cx - s.sunX) * 0.25)) / (c.w * 0.55);
      const sy = (y - (L.base - L.amp * 0.55)) / (L.amp * 0.55);
      const r = Math.hypot(sx, sy) / (0.75 + 0.4 * noise(c.lobes[0].ph + sx, sy + L.i));
      if (r < 1) shade = Math.max(shade, 1 - clamp01((r - 0.6) / 0.4));
    }
    shade *= MS * (1 - 0.6 * L.air);
  }
  return { alt, snow, gully, rock, band, scree, shade };
}

// The bright band of clear sky at the horizon (the light strip under the sketch's deck):
// a few tens of pixels of near-white, slightly warm sky just above the skyline — whatever
// range forms it at that x — strongest away from the sun's own glow. Returns 0–1.
function skylineY(s, x) {
  if (!s._sky1) {
    // the skyline (highest crest of any range), then its envelope over ±50 px, so a band
    // above it is a smooth strip, not a ribbon following every peak
    const raw = [];
    for (let xx = -60; xx <= REF_W + 60; xx += 4) {
      let y = s.HY;
      for (const R of s.ranges) y = Math.min(y, R.ridge[Math.max(0, Math.min(R.ridge.length - 1, Math.round((xx + 30) / 4)))][1]);
      raw.push(y);
    }
    s._sky1 = raw.map((_, i) => Math.min(...raw.slice(Math.max(0, i - 12), i + 13)));
  }
  return s._sky1[Math.max(0, Math.min(s._sky1.length - 1, Math.round((x + 60) / 4)))];
}

function horizonBandAt(s, x, y) {
  const HB = G.param('horizonBand');
  if (HB <= 0) return 0;
  const top = skylineY(s, x);
  const H = 38 + 30 * noise(x * 0.004, 17.3);
  const d = top - y; // height above the skyline
  if (d < 0 || d > H) return 0;
  const away = 1 - Math.exp(-Math.pow((x - s.sunX) / 320, 2));
  // a band at the horizon, not a halo round a tall peak: it fades where the skyline
  // stands high above the horizon line
  const lowSky = 1 - clamp01((s.HY - top - 150) / 110);
  const u = d / H;
  return HB * away * lowSky * (1 - u * u) * (0.75 + 0.35 * noise(x * 0.01, 5.5));
}

// Whether a point lies inside a cloud's mass (any lobe, above its flat base).
function inCloud(s, x, y) {
  for (const c of s.clouds) {
    if (y > c.cy + c.h * 0.14 + 2 || Math.abs(x - c.cx) > c.w) continue;
    for (const lb of c.lobes) if (Math.hypot((x - lb.x) / lb.rx, (y - lb.y) / lb.ry) < 1) return true;
  }
  return false;
}

// Clean the field edge: everything outside the picture is the mat.
function paintMat(s) {
  const m = matColour(s);
  noStroke();
  fill(m[0], m[1], m[2]);
  rect(0, 0, width, R.y);
  rect(0, R.y + R.h, width, height - R.y - R.h);
  rect(0, 0, R.x, height);
  rect(R.x + R.w, 0, width - R.x - R.w, height);
}

function fieldRect(W, H) {
  const m = 0.045 * Math.min(W, H);
  const aw = Math.max(10, W - 2 * m);
  const ah = Math.max(10, H - 2 * m);
  let fw = aw;
  let fh = fw / FIELD_ASPECT;
  if (fh > ah) {
    fh = ah;
    fw = fh * FIELD_ASPECT;
  }
  return { x: (W - fw) / 2, y: (H - fh) / 2, w: fw, h: fh };
}



// ---------------------------------------------------------------------------------
// The watercolour toolkit
// ---------------------------------------------------------------------------------

// the settings, frozen when a painting starts (a slider moved mid-painting changes nothing
// already queued)
function wcParams() {
  const P = (k) => G.param(k);
  const paper = P('paper');
  return {
    paper,
    wet: P('wetness'),
    load: P('load'),
    // a rough sheet granulates more, a hot-pressed one hardly at all
    gran: P('granulation') * [1, 1.35, 0.5][paper],
    back: P('backruns'),
    glazes: P('glazes'),
    vari: P('variegation'),
    lift: P('lifting'),
    band: P('horizonBand'),
    pencil: P('pencil'),
    dry: P('dryBrush') * [1, 1.3, 0.6][paper],
    planes: P('planes'),
    sponge: P('sponge'),
    rigger: P('rigger'),
    mass: P('massing'),
    pen: P('penInk'),
    spatter: P('spatter'),
    salt: P('salt'),
    gouache: P('gouache'),
    wobble: P('wobble'),
    flowers: P('flowers'),
    cloudShadows: P('cloudShadows'),
    tooth: [0.6, 1, 0.25][paper],
  };
}

// the sponge's dots and the salt crystal are fixed shapes (a tip mask is drawn once)
const SPONGE_DOTS = [[-30, -22, 14], [-8, -34, 10], [18, -26, 16], [34, -6, 11], [24, 18, 15], [2, 30, 12], [-24, 22, 13], [-38, 4, 9], [-6, -4, 18], [12, 6, 8], [-16, -8, 7], [30, 32, 7], [-34, -36, 6], [40, -30, 6]];

// Custom brushes (brush.add) and vector fields (brush.addField), registered once, before
// any scaling, so brush.scaleBrushes sizes them with the built-in ones.
// p5.brush 2 lays a stroke down as a solid mark (its opacity only softens the edge, and
// strokes do not build up over each other), so strokes here are the opaque media — pencil,
// rigger, pen, white gouache, spatter, salt, the sponge — and every transparent layer is a
// fill (wet, bleeding) or a wash (a flat glaze).
function addBrushes() {
  if (BRUSHES) return;
  BRUSHES = true;
  // body colour (white gouache) on a round sable: a soft oval tip swelling in the middle of
  // the stroke (the library's gaussian pressure)
  brush.add('wc-round', {
    type: 'custom', weight: 14, scatter: 0.35, opacity: 30, spacing: 0.2, rotate: 'natural', markerTip: false,
    pressure: { mode: 'gaussian', curve: [0.25, 0.3], min_max: [1.15, 0.7] },
    tip: (m) => { m.noStroke(); m.fill(0); m.ellipse(0, 0, 86, 60); },
  });
  // gouache on a flat brush: square-ended, it turns with the stroke
  brush.add('wc-flat', {
    type: 'custom', weight: 16, scatter: 0.25, opacity: 26, spacing: 0.22, rotate: 'natural', markerTip: false,
    pressure: [1.1, 0.85],
    tip: (m) => { m.noStroke(); m.fill(0); m.rect(-48, -14, 96, 28); },
  });
  // a rigger: a long thin sable for twigs and grass, tapering off at the end
  brush.add('rigger', { type: 'default', weight: 0.8, scatter: 0.12, sharpness: 0.75, grain: 20, opacity: 210, spacing: 0.18, pressure: [1.25, 0.18], rotate: 'none' });
  // spatter: drops flicked from a loaded brush
  brush.add('spatter', { type: 'spray', weight: 3.5, scatter: 10, sharpness: 0.6, grain: 0.3, opacity: 170, spacing: 3, pressure: [1, 1], rotate: 'none' });
  // granulating pigment settling into the paper's hollows
  brush.add('granule', { type: 'spray', weight: 6, scatter: 5, sharpness: 0.8, grain: 0.6, opacity: 55, spacing: 1.2, pressure: [1, 1], rotate: 'none' });
  // a natural sponge dabbed for foliage
  brush.add('sponge', {
    type: 'custom', weight: 12, scatter: 2.5, opacity: 48, spacing: 1.4, rotate: 'random', markerTip: false, pressure: [1, 1],
    tip: (m) => { m.noStroke(); m.fill(0); for (const [x, y, r] of SPONGE_DOTS) m.circle(x, y, r); },
  });
  // salt: star-shaped pale blooms where crystals drew the pigment away
  brush.add('salt', {
    type: 'custom', weight: 3, scatter: 7, opacity: 110, spacing: 4, rotate: 'random', markerTip: false, pressure: [1, 1],
    tip: (m) => { m.noStroke(); m.fill(0); m.circle(0, 0, 22); for (let k = 0; k < 6; k++) { m.push(); m.rotate((k * Math.PI) / 3); m.rect(-3, -34, 6, 34); m.pop(); } },
  });
  // wind through the grass: upward, leaning with a slow gust (degrees; -90 = up)
  brush.addField('wind', (t, f) => {
    for (let c = 0; c < f.length; c++) for (let r = 0; r < f[0].length; r++) f[c][r] = -90 + 22 * Math.sin(c * 0.09 + r * 0.05 + t) + 10 * Math.sin(c * 0.31);
    return f;
  });
}

// A wash: fill (wet, bleeding) over a REF polygon. o: {bleed, dir ('in'|'out'), ang (radians,
// the direction the wash runs; null = random), tex (granulation), border (pigment gathered at
// the edge as the wash dries), scatter (sparse edge layers)}.
function wfill(poly, col, op, o = {}) {
  brush.noStroke();
  brush.noHatch();
  brush.fill(toHex(col), Math.min(255, op * WP.load));
  brush.fillBleed(clamp01((o.bleed ?? 0.15) * (0.35 + 1.3 * WP.wet)), o.dir || 'out', o.ang ?? null);
  brush.fillTexture(clamp01(o.tex ?? 0.3), clamp01((o.border ?? 0.3) * (0.3 + 1.4 * WP.back)), o.scatter ?? true);
  const r = bpoly(poly);
  brush.noFill();
  return r;
}
// a glaze laid on dry paper (no bleed, no texture, a crisp edge): the library's wash, which
// is transparent and builds up where glazes overlap — and cheap, so the many small marks use it
function wwash(poly, col, op) {
  brush.noStroke();
  brush.noFill();
  brush.wash(toHex(col), Math.min(255, op));
  bpoly(poly);
  brush.noWash();
}
// the outline of a brush mark along a REF polyline [[x, y], …]: w the half-width at the
// belly, the mark swelling from a point and lifting off thinner (a loaded round brush)
function markPoly(P, w, ph = 0, jag = 0.35) {
  const L = [], Rt = [];
  const n = P.length;
  for (let k = 0; k < n; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const t = k / Math.max(1, n - 1);
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.98)), 0.6);
    const wl = w * prof * (1 - jag / 2 + jag * noise(ph + t * 3.1, 0.5));
    const wr = w * prof * (1 - jag / 2 + jag * noise(ph + t * 3.1, 7.5));
    L.push([P[k][0] - (dy / d) * wl, P[k][1] + (dx / d) * wl]);
    Rt.push([P[k][0] + (dy / d) * wr, P[k][1] - (dx / d) * wr]);
  }
  return L.concat(Rt.reverse());
}
// a straight mark from (x0, y0) to (x1, y1), as a polyline with a little bow in it
function markLine(x0, y0, x1, y1, bow = 0.08, n = 6) {
  const P = [];
  const dx = x1 - x0, dy = y1 - y0;
  const b = (random() - 0.5) * 2 * bow;
  for (let k = 0; k <= n; k++) {
    const t = k / n, o = b * Math.sin(Math.PI * t);
    P.push([x0 + dx * t - dy * o, y0 + dy * t + dx * o]);
  }
  return P;
}
// Dry brush: a lightly loaded brush dragged fast across the paper, its hairs skipping over
// the hollows of the tooth — a few parallel slivers of glaze, each broken where the paper's
// grain catches it, the breaks commoner on a rough sheet.
function wdry(col, op, x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const hairs = 3 + Math.floor(random(4));
  const skip = 0.3 + 0.35 * WP.dry * (1.4 - WP.tooth * 0.4);
  const ph = random(100);
  for (let h = 0; h < hairs; h++) {
    const off = (h / Math.max(1, hairs - 1) - 0.5) * w * 2 + random(-0.3, 0.3) * w;
    const hw = Math.max(0.35, w * random(0.12, 0.3));
    let t = random(0, 0.15);
    while (t < 1) {
      const seg = random(0.08, 0.3);
      const t1 = Math.min(1, t + seg);
      if (noise(ph + h * 7.7, t * 6) > skip) {
        const ax = x0 + dx * t + nx * off, ay = y0 + dy * t + ny * off;
        const bx = x0 + dx * t1 + nx * off, by = y0 + dy * t1 + ny * off;
        wwash([[ax + nx * hw, ay + ny * hw], [bx + nx * hw * 0.6, by + ny * hw * 0.6], [bx - nx * hw * 0.6, by - ny * hw * 0.6], [ax - nx * hw, ay - ny * hw]], col, op);
      }
      t = t1 + random(0.02, 0.12);
    }
  }
}
// The union of a set of ellipses (cloud lobes, clumps of leaves) as one outline, sampled
// round its centre: each ray keeps its farthest point still inside an ellipse. One wet fill
// of the whole mass, instead of one per part.
function unionPoly(E, n = 36, jag = 0) {
  let cx = 0, cy = 0, wsum = 0;
  for (const e of E) { const a = e.rx * e.ry; cx += e.x * a; cy += e.y * a; wsum += a; }
  cx /= wsum; cy /= wsum;
  const R = Math.max(...E.map((e) => Math.hypot(e.x - cx, e.y - cy) + Math.max(e.rx, e.ry)));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TWO_PI, ca = Math.cos(a), sa = Math.sin(a);
    let best = R * 0.15;
    for (let r = R; r > best; r -= R / 60) {
      const x = cx + ca * r, y = cy + sa * r;
      if (E.some((e) => ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 <= 1)) { best = r; break; }
    }
    const j = jag ? 1 - jag / 2 + jag * noise(cx * 0.01 + ca, cy * 0.01 + sa) : 1;
    out.push([cx + ca * best * j, cy + sa * best * j]);
  }
  return out;
}
// lifting: a damp brush or tissue takes pigment back toward the paper
function wlift(poly, k, o = {}) {
  if (k <= 0.01) return;
  wfill(poly, PAPER, 200 * k, { bleed: o.bleed ?? 0.25, dir: 'out', ang: o.ang ?? null, tex: 0.05, border: o.border ?? 0.04, scatter: false });
}
// a brush line in REF coordinates (an opaque mark: thin solid lines read darker than their
// colour, so the callers mix it toward the paper)
function wline(name, col, w, x0, y0, x1, y1) {
  brush.set(name, toHex(col), w);
  brush.line(X(x0), Y(y0), X(x1), Y(y1));
}
// one continuous brush stroke along a REF polyline [[x, y, pressure?], …]
// (brush.move angles run anticlockwise with y up, so the screen angle is negated)
function wstroke(name, col, w, P) {
  if (P.length < 2) return;
  brush.set(name, toHex(col), w);
  brush.beginStroke('curve', X(P[0][0]), Y(P[0][1]));
  let last = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1];
    const len = Math.hypot(dx, dy) * U;
    if (len < 0.01) continue;
    last = -Math.atan2(dy, dx);
    brush.move(last, len, P[i][2] ?? 1);
  }
  brush.endStroke(last, P[P.length - 1][2] ?? 1);
}

// irregular shapes, in REF coordinates
function blobPoly(cx, cy, rx, ry, ph, n = 20, jag = 0.3) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TWO_PI;
    const r = 1 - jag / 2 + jag * noise(ph + Math.cos(a) * 1.3, ph + Math.sin(a) * 1.3);
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
}
function rrect(x0, y0, x1, y1, jag, ph) {
  const out = [];
  const n = 6;
  const side = (ax, ay, bx, by, k0) => {
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const nz = (noise(ph + k0 + t * 2.1, ph * 0.37) - 0.5) * 2 * jag;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      // push the edge out or in along its normal
      const nx = -(by - ay), ny = bx - ax, d = Math.hypot(nx, ny) || 1;
      out.push([x + (nx / d) * nz * (y1 - y0), y + (ny / d) * nz * (y1 - y0)]);
    }
  };
  side(x0, y0, x1, y0, 0);
  side(x1, y0, x1, y1, 7);
  side(x1, y1, x0, y1, 13);
  side(x0, y1, x0, y0, 19);
  return out;
}
const ridgeAt = (L, x) => L.ridge[Math.max(0, Math.min(L.ridge.length - 1, Math.round((x + 30) / 4)))][1];
// keep a blot below a range's crest (a wash dropped into the range stays in it)
function underRidge(poly, L, base) {
  return poly.map(([x, y]) => [x, Math.min(base + 4, Math.max(ridgeAt(L, x) + 2, y))]);
}
function matColour(s) {
  return mixRGB([236, 229, 214], s.C.haze, 0.12);
}


// ---------------------------------------------------------------------------------
// Painting order: paper, underdrawing, then light to dark and far to near — the sky wet
// into wet, the ranges as washes and glazes, the plain, the water, the trees, the bank,
// the framing trees; pen work, spatter, salt and the paper's tooth last.
// ---------------------------------------------------------------------------------

function buildTasks(s) {
  // the settings are frozen here: some passes decide what to queue from them
  WP = wcParams();
  // solid lines are mixed toward the paper by day; at night that would make them glow
  WP.lineLift = s.night ? 0 : 1;
  const T = [];
  const stage = (name) => T.push(() => { UI.stage = name; });
  T.push(() => {
    background(...matColour(s));
    noStroke();
    fill(...PAPER);
    rect(X(0), Y(0), REF_W * U, REF_H * U);
    addBrushes();
    setBrushScale(Math.max(0.3, U * 1.7));
    brush.noField();
    brush.noStroke();
    brush.noFill();
    brush.noHatch();
    // the paint seed changes the hand (every brush jitter) and leaves the scene as it is
    const ps = G.param('paintSeed');
    if (ps) randomSeed(ps);
  });
  stage('underdrawing');
  T.push(() => wcPencil(s));
  stage('sky, wet into wet');
  for (const t of wcSkyTasks(s)) T.push(t);
  stage('clouds');
  for (const c of s.clouds) T.push(() => wcCloud(s, c));
  T.push(() => wcCirrus(s));
  T.push(() => wcSunMoon(s));
  stage('mountains');
  s.ranges.forEach((L) => {
    T.push(() => wcRangeBody(s, L));
    T.push(() => wcRangeDrops(s, L));
    for (const t of wcRangePlanes(s, L)) T.push(t);
    T.push(() => wcPeakGlazes(s, L));
    T.push(() => wcRangeEdge(s, L));
    T.push(() => wcRangeMist(s, L));
  });
  T.push(() => wcHorizonBand(s));
  stage('the plain');
  for (const t of wcGroundTasks(s)) T.push(t);
  stage('water');
  T.push(() => wcWater(s));
  T.push(() => wcWaterLight(s));
  stage('trees');
  for (let i = 0; i < s.trees.length; i += 8) {
    const chunk = s.trees.slice(i, i + 8);
    T.push(() => chunk.forEach((tr) => wcMidTree(s, tr)));
  }
  stage('foreground');
  T.push(() => wcBank(s));
  T.push(() => wcBankDetail(s));
  if (s.repoussoir.segs.length) {
    stage('framing trees');
    for (const t of wcFramingTasks(s)) T.push(t);
  }
  stage('pen, spatter, salt');
  T.push(() => wcPen(s));
  T.push(() => wcSpatterSalt(s));
  T.push(() => wcGranulation(s));
  T.push(() => paintPaperTooth(s));
  T.push(() => paintMat(s));
  return T;
}

// --- graphite underdrawing ---------------------------------------------------------
// The painter's light pencil lay-in: the crests, the horizon, the river's banks, where the
// trees stand, the framing trunk's axis. It stays visible through the transparent washes.
function wcPencil(s) {
  if (WP.pencil <= 0.02) return;
  const col = mixRGB(PAPER, [86, 84, 90], 0.3 + 0.45 * WP.pencil);
  brush.wiggle(WP.wobble * 0.6);
  brush.set('2H', toHex(col), 0.35 + 0.35 * WP.pencil);
  for (const L of s.ranges) {
    if (L.air > 0.85) continue;
    const run = [];
    for (let i = 0; i < L.ridge.length; i += 3) {
      const [x, y] = L.ridge[i];
      if (x < -10 || x > REF_W + 10) continue;
      run.push([X(x), Y(y)]);
      // the line is lifted now and then, as a hand draws
      if (run.length > 14 && random() < 0.12) { brush.spline(run.splice(0, run.length), 0.4); }
    }
    if (run.length > 2) brush.spline(run, 0.4);
  }
  if (s.river) {
    for (const side of ['wl', 'wr']) {
      const run = s.river.samples.filter((_, i) => i % 3 === 0).map((p) => [X(s.gx(p[side], p.z)), Y(s.gy(p.z))]).filter(([x, y]) => x > R.x - 20 && x < R.x + R.w + 20 && y < Y(REF_H));
      if (run.length > 2) brush.spline(run, 0.5);
    }
  }
  for (const tr of s.trees) {
    const x = s.gx(tr.wx, tr.z), y = s.gy(tr.z);
    const h = (tr.hW * s.F) / tr.z * (tr.tall ? 2.3 : 1.15);
    if (h < 8 || x < 0 || x > REF_W) continue;
    brush.line(X(x), Y(y), X(x), Y(y - h * 0.5));
  }
  for (const g of s.repoussoir.segs) {
    if (g.depth > 1) continue;
    brush.spline(g.pts.map((p) => [X(p[0]), Y(p[1])]), 0.5);
  }
  brush.noField();
}

// --- the sky -------------------------------------------------------------------------
// A graded wash: level bands laid wet top to bottom, each overlapping the last by half so
// they melt together (fillBleed run level, angle 0), each the sky's colour at its height.
// The light is then lifted out round the sun, and drops of warm and cool fed into the wet.
function skyBandColour(s, y) {
  const c = [0, 0, 0];
  let w = 0;
  for (let k = 0; k < 7; k++) {
    const x = ((k + 0.5) / 7) * REF_W;
    // the sun's side counts for less: its glow is put in as a drop, then lifted
    const ww = 1 - 0.6 * Math.exp(-Math.pow((x - s.sunX) / 320, 2));
    const q = s.sky(x, Math.min(s.HY - 2, y));
    for (let i = 0; i < 3; i++) c[i] += q[i] * ww;
    w += ww;
  }
  return c.map((v) => v / w);
}
function wcSkyTasks(s) {
  const C = s.C;
  const T = [];
  const nb = 5;
  const H = s.HY + 40;
  for (let b = 0; b < nb; b++) {
    T.push(() => {
      const h = (H + 60) / nb;
      const y0 = -60 + b * h - (b ? h * 0.45 : 0), y1 = -60 + (b + 1) * h + h * 0.3;
      const col = skyBandColour(s, (y0 + y1) / 2);
      wfill(rrect(-90, y0, REF_W + 90, y1, 0.08, b * 3.7 + 1), col, s.night ? 175 : s.winter ? 150 : 135, {
        bleed: 0.45, dir: 'out', ang: 0, tex: 0.06 + 0.2 * WP.gran, border: 0.05, scatter: false,
      });
    });
  }
  T.push(() => {
    // variegated drops: warm toward the light and the horizon, cool high up
    const n = Math.round(2 + 4 * WP.vari);
    for (let i = 0; i < n; i++) {
      const high = i % 2 === 0;
      const x = high ? random(-50, REF_W + 50) : s.sunX + random(-380, 380);
      const y = high ? random(0, s.HY * 0.3) : random(s.HY * 0.5, s.HY * 0.92);
      const col = high ? mixRGB(C.zenith, C.upper, random(0.2, 0.6)) : mixRGB(C.horizon, C.glow, random(0.3, 0.8));
      const rx = random(180, 380), ry = rx * random(0.22, 0.4);
      wfill(blobPoly(x, y, rx, ry, random(100), 18, 0.4), col, 80 * WP.vari, { bleed: 0.5, dir: 'out', ang: 0, tex: 0.1, border: 0.06, scatter: false });
    }
    // late snow: the overcast laid in long level drags, wet into wet
    if (s.winter) {
      for (let i = 0; i < 3; i++) {
        const y = random(-10, s.HY * 0.55);
        const col = mixRGB(C.cloudShadow, C.upper, random(0.1, 0.5));
        wfill(rrect(-60, y, REF_W + 60, y + random(50, 120), 0.25, i * 5.1), col, 110, { bleed: 0.45, dir: 'out', ang: 0, tex: 0.25, border: 0.25 });
      }
    }
  });
  return T;
}

// --- clouds --------------------------------------------------------------------------
// A cloud is one pale wash of its whole mass dropped into the damp sky (its edge melts);
// its shadow one darker wash in the lower part, away from the light, left to dry with a hard
// backrun edge; the tops toward the sun lifted back to paper (the lining); a warm glaze laid
// along the base when the sun is low.
function wcCloud(s, c) {
  const C = s.C;
  const air = clamp01(s.aerial(c.z * 4.5));
  const sky = s.sky(c.cx, c.cy);
  const dxs = s.sunX - c.cx, dys = s.sunY - c.cy, dl = Math.hypot(dxs, dys) || 1;
  const Lx = dxs / dl, Ly = dys / dl;
  const near = Math.exp(-Math.pow(dl / 520, 2));
  const thick = c.thick || 1;
  const body = mixRGB(mixRGB(C.cloudShadow, sky, 0.3), sky, air * 0.65);
  const lit = mixRGB(mixRGB(C.cloudLit, C.glow, near * 0.5), PAPER, 0.35);
  const base = c.cy + c.h * 0.14;
  const flat = (P, b) => P.map(([x, y]) => [x, Math.min(b, y)]);
  wfill(flat(unionPoly(c.lobes, 40, 0.18), base), mixRGB(sky, lit, 0.5), 70, { bleed: 0.45, tex: 0.1, border: 0.06, scatter: false });
  const sh = c.lobes.map((lb) => ({ x: lb.x - Lx * lb.rx * 0.22, y: lb.y + lb.ry * 0.32, rx: lb.rx * 0.8, ry: lb.ry * 0.62 }));
  wfill(flat(unionPoly(sh, 40, 0.25), base + 2), body, 120 * thick * (1 - 0.45 * air), { bleed: 0.24, dir: 'in', tex: 0.15 + 0.3 * WP.gran, border: 0.3 + 0.4 * WP.back });
  if (!s.winter && near > 0.12 && WP.lift > 0) {
    const tops = c.lobes.map((lb) => ({ x: lb.x + Lx * lb.rx * 0.3, y: lb.y - lb.ry * 0.38 + Ly * lb.ry * 0.2, rx: lb.rx * 0.6, ry: lb.ry * 0.4 }));
    wlift(flat(unionPoly(tops, 32, 0.2), base), 0.75 * near * WP.lift, { bleed: 0.12 });
  }
  if (!s.night && !s.winter && s.warmth > 0.4) {
    const band = [];
    const x0 = c.cx - c.w * 0.42, x1 = c.cx + c.w * 0.42;
    for (let k = 0; k <= 10; k++) band.push([x0 + ((x1 - x0) * k) / 10, base - c.h * (0.05 + 0.1 * Math.sin((Math.PI * k) / 10))]);
    for (let k = 10; k >= 0; k--) band.push([x0 + ((x1 - x0) * k) / 10, base + c.h * 0.05]);
    wwash(band, C.cloudLit, 50 * s.warmth * (1 - air));
  }
}
// cirrus: dry brush dragged fast across the high sky, thin paint broken by the paper
function wcCirrus(s) {
  if (!s.wisps || !s.wisps.length || WP.dry <= 0) return;
  for (const w of s.wisps) {
    const col = mixRGB(s.sky(w.cx, w.cy), s.C.cloudShadow, 0.3);
    for (let j = 0; j < w.strands; j++) {
      const off = (j - w.strands / 2) * 7;
      const l = w.len * random(0.5, 1);
      const x = w.cx - (Math.cos(w.a) * l) / 2 - Math.sin(w.a) * off, y = w.cy - (Math.sin(w.a) * l) / 2 + Math.cos(w.a) * off;
      wdry(col, 40 + 40 * WP.dry, x, y, x + Math.cos(w.a + w.curl * 0.3) * l, y + Math.sin(w.a + w.curl * 0.3) * l, 2.2);
    }
  }
}
// The sun is the paper, lifted clean, with a warm glaze round it; the moon a small lifted
// disc with grey maria; the stars dots of white gouache, none near the moon.
function wcSunMoon(s) {
  if (s.winter) return;
  const C = s.C;
  const r = s.night ? 11 * G.param('moonSize') : 24;
  // the sky's wash lifted round the light with a damp sponge, then the glow fed back in
  if (!s.night) wlift(blobPoly(s.sunX, s.sunY, 300, 170, 2.2, 24, 0.25), 0.55 * WP.lift + 0.2, { bleed: 0.5, border: 0.02 });
  wfill(blobPoly(s.sunX, s.sunY, r * 4, r * 3, 4.4, 24, 0.2), C.glow, s.night ? 40 : 70, { bleed: 0.5, tex: 0.05, border: 0.04, scatter: false });
  wlift(blobPoly(s.sunX, s.sunY, r, r, 9.9, 24, 0.06), 1.0, { bleed: 0.04, border: 0.02 });
  if (WP.gouache > 0) wwash(blobPoly(s.sunX, s.sunY, r * 0.92, r * 0.92, 1.1, 24, 0.04), mixRGB(PAPER, C.sun, 0.3), 220 * WP.gouache);
  if (s.night) {
    for (let i = 0; i < 4; i++) {
      const a = random(TWO_PI), d = random(0.15, 0.55) * r;
      wwash(blobPoly(s.sunX + Math.cos(a) * d, s.sunY + Math.sin(a) * d, r * random(0.18, 0.3), r * random(0.14, 0.25), random(50), 10, 0.4), [170, 176, 192], 60);
    }
    const n = Math.round(160 * G.param('stars') * WP.gouache);
    for (let i = 0; i < n; i++) {
      const x = random(0, REF_W), y = s.HY * Math.pow(random(), 1.3);
      if (Math.hypot(x - s.sunX, y - s.sunY) < 120 + random(160)) continue;
      if (y > skylineY(s, x) - 30 || inCloud(s, x, y)) continue;
      const rr = 0.7 + 1.6 * Math.pow(random(), 3);
      wwash(blobPoly(x, y, rr, rr, random(9), 8, 0.2), mixRGB(PAPER, [255, 255, 250], 0.5), 235);
    }
  }
}


// --- the ranges ------------------------------------------------------------------------
// A range is one wash first (the air in it: far ranges pale, cool, flat and soft-edged; near
// ones deeper, granulating, their edge found), then variegated drops into the wet, then —
// once it has "dried" — the shadow planes in flat-brush strokes down the fall line, the
// summits' shadow faces as hard-edged glazes, the snow, the found and lost crest, and the
// valley mist lifted at its foot.
function rangePoly(L) {
  // on a lake the range stops at the far shore (the water is reserved)
  const S0 = S && S.scene === 1 && S.river ? S.gy(S.river.zN) + 2 : Infinity;
  const b = Math.min(L.base + 8, S0);
  return L.ridge.map((p) => [p[0], Math.min(p[1], b)]).concat([[REF_W + 30, b], [-30, b]]);
}
function rangeCol(s, L) {
  return s.seen(L.local, L.z, s.focalX, L.base - L.amp * 0.5);
}
function wcRangeBody(s, L) {
  const near = 1 - L.air;
  wfill(rangePoly(L), rangeCol(s, L), 130 + 125 * near, {
    bleed: 0.05 + 0.08 * L.air, dir: 'in', ang: Math.PI / 2, tex: 0.1 + 0.5 * WP.gran * near, border: 0.15 + 0.5 * near,
  });
}
function wcRangeDrops(s, L) {
  const C = s.C;
  const n = Math.round(1 + 2 * WP.vari * (1 - 0.5 * L.air));
  const col = rangeCol(s, L);
  for (let i = 0; i < n; i++) {
    const x = random(-20, REF_W + 20);
    const top = ridgeAt(L, x);
    const y = top + (L.base - top) * random(0.15, 0.7);
    const sunw = clamp01(1 - Math.abs(x - s.sunX) / (REF_W * 0.6));
    const tint = random() < 0.5 + 0.3 * sunw ? mixRGB(col, mixRGB(C.light, C.glow, 0.5), 0.35 * s.warmth + 0.1) : mixRGB(col, C.shadow, 0.35);
    const rx = random(60, 200), ry = rx * random(0.35, 0.6);
    wfill(underRidge(blobPoly(x, y, rx, ry, random(100), 18, 0.45), L, L.base), tint, 55 * (1 - 0.5 * L.air), { bleed: 0.42, dir: 'out', tex: 0.2, border: 0.15 });
  }
}
// The planes: where the slope under a crest turns from the light (rangePlane, rangeDetail),
// the shadow is laid as one shape — a glaze on the dried wash, wet on dry, so its edge stays
// hard and the pigment gathers along it — not as hundreds of strokes. The shapes are found
// column by column and joined where neighbouring columns agree. A second, smaller and darker
// glaze goes over the deepest part; rock is dry-brushed down the fall line inside the
// shadow; the snow is restated in white gouache with blue on its shadow side.
function planeShapes(s, L, thr) {
  return slopeShapes(s, L, (P, D) => P.shade + 0.5 * D.shade > thr && D.snow < 0.45);
}
// the parts of a range's slope where test(plane, detail) holds, as a few polygons
function slopeShapes(s, L, test) {
  const step = 9;
  const cols = [];
  for (let x = -24; x <= REF_W + 24; x += step) {
    const top = ridgeAt(L, x);
    const depth = Math.min(L.base - top, L.amp * 0.95);
    let y0 = null, y1 = null;
    for (let y = top + 2; y < top + depth; y += 4) {
      const P = rangePlane(s, L, x, y);
      const D = rangeDetail(s, L, x, y, P);
      if (test(P, D)) {
        if (y0 === null) y0 = y;
        y1 = y;
      } else if (y0 !== null && y - y1 > 14) break;
    }
    cols.push(y0 === null || y1 - y0 < 6 ? null : [x, y0, y1]);
  }
  const shapes = [];
  let cur = [];
  const close = () => { if (cur.length >= 2) shapes.push(cur); cur = []; };
  for (const c of cols) {
    if (!c) { close(); continue; }
    if (cur.length && Math.abs(c[1] - cur[cur.length - 1][1]) > 34) close();
    cur.push(c);
  }
  close();
  return shapes.map((raw) => {
    const ph = raw[0][0] * 0.013 + L.i;
    // both edges smoothed along the run (a moving average), and the ends drawn to a point,
    // so a shape reads as a brushed plane and not as a stack of columns
    const n = raw.length;
    const sh = raw.map((c, k) => {
      let a = 0, b = 0, m = 0;
      for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) { a += raw[j][1]; b += raw[j][2]; m++; }
      const end = Math.min(k + 0.5, n - k - 0.5) / Math.min(2.5, n / 2);
      const top = a / m, bot = b / m;
      return [c[0], top, top + (bot - top) * Math.min(1, 0.25 + 0.75 * end)];
    });
    const topE = sh.map((c, k) => [c[0] + (noise(ph, k * 0.4) - 0.5) * step * 0.6, c[1] - 1]);
    const botE = sh.slice().reverse().map((c, k) => [c[0] + (noise(ph + 5, k * 0.4) - 0.5) * step, c[2] + 3 + 6 * noise(ph + 9, k * 0.3)]);
    const poly = topE.concat(botE);
    return { poly: underRidge(poly, L, L.base), w: sh.length * step };
  });
}
function wcRangePlanes(s, L) {
  if (WP.planes <= 0 || L.air > 0.8) return [];
  const T = [];
  T.push(() => {
    const C = s.C;
    const col = rangeCol(s, L);
    const shadowC = s.seen(mixRGB(mixRGB(C.shadow, L.local, 0.35), PRUSSIAN, 0.12), L.z, s.focalX, L.base);
    const near = 1 - L.air;
    const shapes = planeShapes(s, L, 0.62 - 0.22 * WP.planes).sort((a, b) => b.w - a.w);
    shapes.forEach((sh, i) => {
      const c = mixRGB(col, shadowC, 0.55 + 0.25 * near);
      // the broad shapes get a real wash (bleed, a backrun border), the slivers a glaze
      if (i < 5) wfill(sh.poly, c, (150 + 105 * near) * WP.planes, { bleed: 0.05, dir: 'in', ang: Math.PI / 2, tex: 0.2 + 0.4 * WP.gran * near, border: 0.4 + 0.4 * WP.back });
      else wwash(sh.poly, c, (70 + 70 * near) * WP.planes);
    });
    if (WP.planes > 0.35) {
      for (const sh of planeShapes(s, L, 0.95 - 0.25 * WP.planes)) wwash(sh.poly, mixRGB(shadowC, C.silhouette, 0.15), 90 * near * WP.planes);
    }
  });
  T.push(() => {
    const C = s.C;
    const near = 1 - L.air;
    const rockC = s.seen(mixRGB(BARK, C.shadow, 0.35), L.z * 0.8, s.focalX, L.base);
    // rock: dry brush down the fall line where the face is steep
    if (WP.dry > 0) {
      const n = Math.round(70 * WP.dry * near);
      for (let i = 0; i < n; i++) {
        const x = random(-10, REF_W + 10);
        const top = ridgeAt(L, x);
        const y = top + (Math.min(L.base - top, L.amp) * Math.pow(random(), 1.4)) * 0.8 + 3;
        const P = rangePlane(s, L, x, y);
        const D = rangeDetail(s, L, x, y, P);
        if (D.rock < 0.4 || D.snow > 0.45) continue;
        const fall = P.sl >= 0 ? Math.atan2(P.sl * 1.5 + 0.35, 1) : Math.atan2(-P.sl * 1.5 + 0.35, -1);
        const len = random(14, 34) * (0.6 + 0.6 * near);
        wdry(mixRGB(rockC, C.shadow, P.shade * 0.4), 70 + 60 * near, x, y, x + Math.cos(fall) * len, y + Math.sin(fall) * len, 1.2 + 1.6 * near);
      }
    }
    // the snow: reserved paper is impossible after a wash, so it is restated in white
    // gouache (body colour), and its shadow side glazed blue
    if (WP.gouache > 0 && G.param('snow') > 0) {
      const snowC = mixRGB(PAPER, C.light, 0.12);
      const blue = s.seen(mixRGB(PRUSSIAN, [150, 168, 214], 0.55), L.z * 0.3, s.focalX, L.base);
      // the snowfields as shapes in gouache (the summits' shadow glazes, laid next, shade them)
      for (const sh of slopeShapes(s, L, (P, D) => D.snow > 0.45)) wwash(sh.poly, snowC, 200 * WP.gouache);
      // their lower edges broken where rock shows through: a few touches of the brush
      for (let i = 0; i < 60 * near; i++) {
        const x = random(-10, REF_W + 10);
        const top = ridgeAt(L, x);
        const y = top + random(0, Math.min(L.base - top, L.amp));
        const P = rangePlane(s, L, x, y);
        const D = rangeDetail(s, L, x, y, P);
        if (D.snow < 0.3 || D.snow > 0.6) continue;
        const a = Math.atan(P.sl) * 0.8 + random(-0.25, 0.25);
        const len = random(6, 16) * (0.6 + 0.6 * near);
        wwash(markPoly(markLine(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.2), (1.2 + 1.8 * near) * random(0.7, 1.3), x * 0.03 + y * 0.01, 0.6), P.lit >= P.shade ? snowC : blue, P.lit >= P.shade ? 180 * WP.gouache : 90);
      }
    }
  });
  return T;
}
// The summits' shadow faces as glazes over the dried wash: hard-edged (low bleed, strong
// border — the pigment gathers at the edge of a wash left to dry), laid 1–3 times, each a
// little smaller and darker toward the summit.
function wcPeakGlazes(s, L) {
  if (L.air > 0.85 || !L.peaks.length) return;
  const C = s.C;
  const col = s.seen(mixRGB(C.shadow, L.local, 0.3), L.z, s.focalX, L.base);
  for (const pk of L.peaks) {
    if (pk.prom < 14) continue;
    const face = peakFace(L, pk);
    const [sx, sy] = L.ridge[pk.j];
    for (let g = 0; g < WP.glazes; g++) {
      const k = 1 - g * 0.25;
      const poly = face.map(([x, y]) => [sx + (x - sx) * k, sy + (y - sy) * k]);
      if (g === 0) wfill(underRidge(poly, L, L.base), col, 150 * (1 - L.air), { bleed: 0.03, dir: 'in', tex: 0.3 * WP.gran, border: 0.7 });
      else wwash(underRidge(poly, L, L.base), col, (45 + 15 * g) * (1 - L.air));
    }
  }
}
// lost and found: the crest of the nearer ranges restated in broken rigger runs on the side
// away from the light; the far crests are left lost in the sky
function wcRangeEdge(s, L) {
  if (L.t < 0.35) return;
  const col = s.seen(mixRGB(s.C.shadow, L.local, 0.5), L.z, s.focalX, L.base);
  brush.wiggle(WP.wobble * 0.4);
  brush.set('rigger', toHex(col), 0.35 + 0.6 * (1 - L.air));
  let run = [];
  for (let i = 0; i < L.ridge.length; i += 2) {
    const [x, y] = L.ridge[i];
    const P = rangePlane(s, L, x, y + 4);
    if (x > -10 && x < REF_W + 10 && P.shade > 0.15 && noise(x * 0.02, L.i) > 0.45) run.push([X(x), Y(y + 0.6)]);
    else if (run.length) { if (run.length > 2) brush.spline(run, 0.3); run = []; }
  }
  if (run.length > 2) brush.spline(run, 0.3);
  brush.noField();
}
// mist lifted out along the foot of a range (a damp brush drawn level through the wash)
function wcRangeMist(s, L) {
  const k = (G.param('mist') * 0.6 + G.param('valleyMist') * 0.6) * WP.lift;
  if (k <= 0.02 || L === s.ranges[s.ranges.length - 1]) return;
  const poly = [];
  const top = (x) => L.base - L.amp * (0.1 + 0.18 * G.param('valleyMist')) * (0.6 + 0.8 * noise(x * 0.004, L.i * 3.1));
  for (let x = -40; x <= REF_W + 40; x += 40) poly.push([x, top(x)]);
  poly.push([REF_W + 40, L.base + 6], [-40, L.base + 6]);
  wlift(underRidge(poly, L, L.base + 6), 0.45 * k, { bleed: 0.45, ang: 0 });
}
// the bright band of sky over the skyline, lifted
function wcHorizonBand(s) {
  if (WP.band <= 0 || s.night) return;
  // one damp stroke along the whole skyline, lifted harder where the band is brightest
  const poly = [];
  let k = 0;
  for (let xx = -40; xx <= REF_W + 40; xx += 15) {
    poly.push([xx, skylineY(s, xx) - 2]);
    k += horizonBandAt(s, xx, skylineY(s, xx) - 15);
  }
  k /= poly.length;
  for (let xx = REF_W + 40; xx >= -40; xx -= 15) poly.push([xx, skylineY(s, xx) - 40 - 30 * noise(xx * 0.01)]);
  if (k > 0.05) wlift(poly, 0.4 * Math.sqrt(k) * WP.lift, { bleed: 0.4, ang: 0 });
}


// --- the plain -----------------------------------------------------------------------
const groundTop = (s) => s.gy(s.zGround) - 3;
function onWater(s, x, y) {
  const r = s.river;
  if (!r || y <= s.HY + 0.5) return false;
  const z = s.F / (y - s.HY);
  if (z < r.samples[0].z || z > r.zN) return false;
  return Math.abs(((x - s.CX) * z) / s.F - r.center(z)) < r.halfW(z) * 0.96;
}
// A lake is reserved: the land's washes are laid round it, as a watercolourist paints round
// a light. lakeRows(s) gives, per x, the far and the near shore (null where there is no
// water), from the projected river.
function lakeRows(s) {
  if (s.scene !== 1 || !s.river) return null;
  const ys = s.gy(s.river.zN);
  const rows = [];
  for (let x = -60; x <= REF_W + 60; x += 10) {
    if (!onWater(s, x, ys + 3)) { rows.push([x, null]); continue; }
    let y = ys + 3;
    while (y < REF_H + 40 && onWater(s, x, y + 4)) y += 4;
    rows.push([x, [ys, y + 3]]);
  }
  return rows;
}
// the parts of the level band y0–y1 that lie outside the lake, as polygons
function bandOutsideLake(rows, y0, y1, jag, ph) {
  if (!rows) return [rrect(-60, y0, REF_W + 60, y1, jag, ph)];
  const above = [], below = [];
  for (const [x, w] of rows) {
    if (!w) { above.push([x, y0]); below.push([x, y1]); continue; }
    above.push([x, y0]);
    below.push([x, Math.min(y1, Math.max(y0, w[0]))]);
  }
  const out = [];
  // above the far shore
  if (below.some((p, i) => p[1] - above[i][1] > 1)) out.push(above.concat(below.slice().reverse()));
  // below the near shore
  const top2 = rows.map(([x, w]) => [x, w ? Math.max(y0, w[1]) : y1]);
  if (top2.some((p) => p[1] < y1 - 1)) out.push(top2.concat(rows.slice().reverse().map(([x]) => [x, y1])));
  return out;
}
function wcGroundTasks(s) {
  const C = s.C;
  const T = [];
  const yT = groundTop(s);
  const lake = lakeRows(s);
  // a variegated base wash, far colour to near, laid level and wet
  T.push(() => {
    const nb = 5;
    for (let b = 0; b < nb; b++) {
      const y0 = yT + (REF_H + 40 - yT) * Math.pow(b / nb, 1.4);
      const y1 = yT + (REF_H + 40 - yT) * Math.min(1.05, Math.pow((b + 1.7) / nb, 1.4));
      const ym = (y0 + y1) / 2;
      const z = s.F / Math.max(1, ym - s.HY);
      const col = s.seen(mixRGB(C.groundFar, C.groundNear, b / (nb - 1)), z, s.CX, ym);
      for (const poly of bandOutsideLake(lake, Math.max(yT, y0), y1, 0.03, b * 3.3)) wfill(poly, col, 105, { bleed: 0.3, dir: 'out', ang: 0, tex: 0.12 + 0.35 * WP.gran, border: 0.18 });
    }
  });
  // the far woods along the foot of the mountains: one dark band, wet, its top broken into
  // crowns — it also hides where the nearest range's wash stops
  T.push(() => wcTreeLine(s));
  // the fields: glazes over the dried base wash, harder-edged near us
  const fields = s.fields.slice().sort((a, b) => b.z - a.z);
  let nWet = 0;
  for (let i = 0; i < fields.length; i += 14) {
    const chunk = fields.slice(i, i + 14);
    T.push(() => {
      for (const f of chunk) {
        const cx = f.poly.reduce((a, p) => a + p[0] / 4, 0), cy = f.poly.reduce((a, p) => a + p[1] / 4, 0);
        if (cx < -160 || cx > REF_W + 160 || (lake && onWater(s, cx, cy))) continue;
        const near = 1 - s.aerial(f.z);
        const poly = f.poly.map(([x, y]) => [Math.max(-200, Math.min(REF_W + 200, x)), Math.max(yT + 1, y)]);
        // the near fields get a real wash, the far ones a flat glaze (their edges are too
        // small to show a backrun)
        if (f.z < 1.6 && nWet++ < 8) wfill(poly, s.seen(f.col, f.z, cx, cy), 60 + 60 * near, { bleed: 0.06, dir: 'in', tex: 0.12 + 0.35 * WP.gran, border: 0.15 + 0.35 * near });
        else wwash(poly, s.seen(f.col, f.z, cx, cy), 22 + 40 * near);
      }
    });
  }
  // hedges: dry brush along the field edges, a darker green, finer with distance
  T.push(() => {
    for (const f of fields) {
      if (!f.hedge || f.z < 1.2) continue;
      const [a, b] = f.hedgeSide ? [f.poly[1], f.poly[2]] : [f.poly[3], f.poly[2]];
      if (Math.max(a[0], b[0]) < -20 || Math.min(a[0], b[0]) > REF_W + 20) continue;
      const col = s.seen(mixRGB(C.foliage, C.silhouette, 0.25), f.z, a[0], a[1]);
      const w = Math.min(1.2, 0.18 + 1.1 / Math.sqrt(f.z));
      if (WP.dry > 0.2) wdry(col, 150, a[0], Math.max(yT, a[1]), b[0], Math.max(yT, b[1]), 1.6 * w);
      else wline('rigger', col, w, a[0], Math.max(yT, a[1]), b[0], Math.max(yT, b[1]));
    }
  });
  // the clouds' shadows on the land: soft glazes, cooler and darker
  T.push(() => {
    if (WP.cloudShadows <= 0) return;
    for (const sp of cloudShadowPatches(s)) {
      const poly = [];
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TWO_PI;
        const rr = 0.75 + 0.45 * noise(sp.ph + Math.cos(a) * 1.6, sp.ph + Math.sin(a) * 1.6);
        const z = Math.max(0.7, sp.z + Math.sin(a) * sp.rz * rr);
        poly.push([s.gx(sp.wx + Math.cos(a) * sp.rw * rr, z), Math.max(yT, s.gy(z))]);
      }
      const z = sp.z;
      wfill(poly, s.seen(mixRGB(C.shadow, C.groundNear, 0.4), z, s.gx(sp.wx, z), s.gy(z)), 55 * WP.cloudShadows * sp.k * (1 - 0.6 * s.aerial(z)), { bleed: 0.3, dir: 'out', tex: 0.1, border: 0.12 });
    }
  });
  // texture: level dry-brush streaks across the middle distance; rigger flicks of grass in
  // front, drawn through the wind field
  T.push(() => {
    const n = Math.round(90 * WP.dry);
    for (let i = 0; i < n; i++) {
      const y = yT + 6 + (REF_H - yT) * Math.pow(random(), 1.3) * 0.85;
      const x = random(-20, REF_W + 20);
      if (onWater(s, x, y)) continue;
      const z = s.F / Math.max(1, y - s.HY);
      const len = random(30, 90) * (0.4 + 0.6 / Math.sqrt(z));
      const col = s.seen(mixRGB(C.groundNear, C.foliage, random(0.1, 0.5)), z, x, y);
      wdry(col, 80 + 60 * WP.dry, x, y, x + len, y + random(-1, 1), Math.min(3.5, 0.6 + 2.2 / Math.sqrt(z)));
    }
    if (WP.rigger > 0 && !s.winter) {
      brush.field('wind');
      const m = Math.round(110 * WP.rigger);
      for (let i = 0; i < m; i++) {
        const y = yT + (REF_H - yT) * (0.45 + 0.55 * random());
        const x = random(-10, REF_W + 10);
        if (onWater(s, x, y) || y > bankAt(s.repoussoir, x)) continue;
        const z = s.F / Math.max(1, y - s.HY);
        // the rigger's line is solid paint, so it is mixed lighter than the wash under it
        const col = mixRGB(s.seen(mixRGB(C.foliage, random() < 0.4 ? C.foliageLit : C.groundNear, random(0.3, 0.7)), z, x, y), PAPER, 0.35 * WP.lineLift);
        brush.set('rigger', toHex(col), Math.min(0.6, 0.15 + 0.4 / Math.sqrt(z)));
        brush.flowLine(X(x), Y(y), random(8, 22) * U / Math.sqrt(z), 0);
      }
      brush.noField();
    }
  });
  if (s.winter) T.push(() => wcFurrows(s));
  // night: the whole land glazed down once more, darker toward us
  if (s.night) {
    T.push(() => {
      // several overlapping glazes with ragged tops, so no band leaves a ruled edge
      for (let b = 0; b < 6; b++) {
        const top = [];
        const y0 = yT + (REF_H - yT) * (b / 6) * 0.85;
        for (let x = -60; x <= REF_W + 60; x += 30) top.push([x, y0 + (noise(x * 0.006, b * 3.3) - 0.5) * 50 * (b + 1) * 0.5]);
        wwash(top.concat([[REF_W + 60, REF_H + 40], [-60, REF_H + 40]]), mixRGB(C.silhouette, C.shadow, 0.4), 38);
      }
    });
  }
  return T;
}
function wcTreeLine(s) {
  const C = s.C;
  const yT = groundTop(s);
  const z = s.zGround * 0.9;
  const col = s.seen(mixRGB(mixRGB(C.foliage, C.silhouette, 0.35), PRUSSIAN, 0.1), z, s.CX, yT);
  const top = [];
  for (let x = -40; x <= REF_W + 40; x += 12) {
    const h = 3 + 9 * Math.pow(noise(x * 0.01, 8.8), 2) * (s.winter ? 0.5 : 1);
    top.push([x, yT - h - 3 * noise(x * 0.08, 2.2)]);
  }
  const poly = top.concat([[REF_W + 40, yT + 4], [-40, yT + 4]]);
  wfill(poly, col, 210, { bleed: 0.1, dir: 'out', ang: Math.PI / 2, tex: 0.2 + 0.3 * WP.gran, border: 0.4 });
  // crowns standing proud of the band, single touches of the brush
  for (let i = 0; i < 40; i++) {
    const x = random(-20, REF_W + 20);
    const r = random(3, 8);
    wwash(blobPoly(x, yT - r * 0.6 - 4 * noise(x * 0.01, 8.8), r, r * 0.7, random(50), 10, 0.5), mixRGB(col, C.silhouette, random(0, 0.25)), 150);
  }
}
// Late snow: snow lying in the furrows of a ploughed field, converging on one point on the
// horizon — white gouache over the brown wash, ragged and broken, a cold edge here and
// there, and dark and rusty plough streaks between.
function wcFurrows(s) {
  const yT = groundTop(s);
  const vx = s.focalX + (noise(G.seed % 997, 3.3) - 0.5) * REF_W * 0.3;
  const snow = mixRGB(PAPER, [240, 242, 246], 0.5);
  const cold = mixRGB(s.C.shadow, [140, 152, 186], 0.5);
  const at = (xb, t) => [vx + (xb - vx) * t, s.HY + t * (REF_H - s.HY)];
  // plough streaks: earth dragged with a dry brush, some rusty
  for (let k = 0; k < 26; k++) {
    const xb = -REF_W * 0.5 + random() * REF_W * 2;
    const t0 = (yT - s.HY) / (REF_H - s.HY) + random(0, 0.3), t1 = Math.min(1.05, t0 + random(0.2, 0.6));
    const [x0, y0] = at(xb, t0), [x1, y1] = at(xb, t1);
    wdry(random() < 0.35 ? [176, 98, 62] : [96, 70, 54], 110, x0, y0, x1, y1, 0.6 + 2.2 * t1);
  }
  // the snow in the furrows: gouache slivers that narrow toward the horizon, broken where
  // the ridge of earth shows through, a cold edge on some
  const n = 14 + Math.floor(random(8));
  for (let k = 0; k < n; k++) {
    const xb = -REF_W * 0.2 + random() * REF_W * 1.4;
    let t = (yT - s.HY) / (REF_H - s.HY) + (random() < 0.5 ? 0 : random(0.05, 0.4));
    const t1 = random() < 0.6 ? 1.05 : t + random(0.25, 0.6);
    const ph = random(100);
    while (t < t1) {
      const dt = 0.05 + 0.12 * t * random(0.6, 1.4);
      const t2 = Math.min(t1, t + dt);
      if (noise(ph + 1, t * 5) > 0.35) {
        const P = [];
        for (let j = 0; j <= 5; j++) {
          const tt = t + ((t2 - t) * j) / 5;
          const [x, y] = at(xb + (noise(ph + 2, tt * 3) - 0.5) * 40 * tt, tt);
          P.push([x, y]);
        }
        const [mx, my] = P[2];
        if (!onWater(s, mx, my)) {
          const w = (0.8 + 6 * Math.pow(t, 1.2)) * (0.5 + noise(ph, t * 4));
          wwash(markPoly(P, w, ph + t, 0.5), snow, 215 * WP.gouache + 25);
          if (w > 1.5 && random() < 0.35) wwash(markPoly(P.map(([x, y]) => [x + w * 0.8, y]), w * 0.3, ph + t + 4, 0.5), cold, 110);
        }
      }
      t = t2 + 0.01;
    }
  }
}

// --- water ---------------------------------------------------------------------------
// A river (or a lake) mirrors what stands above it: the sky at the same angle, or — on a
// lake — the mountains hanging upside down from its far shore, as vertical wet strokes.
function wcWater(s) {
  const r = s.river;
  if (!r) return;
  const C = s.C;
  const sm = r.samples;
  const lake = s.scene === 1;
  const ys = s.gy(r.zN);
  const cl = (x) => Math.max(-220, Math.min(REF_W + 220, x));
  const seg = Math.max(10, Math.ceil(sm.length / 6));
  for (let i = 0; i < sm.length - 1; i += seg) {
    const part = sm.slice(i, Math.min(sm.length, i + seg + 1));
    const poly = part.map((p) => [cl(s.gx(p.wl, p.z)), s.gy(p.z)]).concat(part.map((p) => [cl(s.gx(p.wr, p.z)), s.gy(p.z)]).reverse());
    const pm = part[Math.floor(part.length / 2)];
    const y = s.gy(pm.z), x = s.gx(r.center(pm.z), pm.z);
    const ym = Math.max(2, Math.min(s.HY, lake ? 2 * ys - y : 2 * s.HY - y));
    // water reads bluer than the sky it mirrors (the zenith's colour comes back off it)
    const col = mixRGB(mixRGB(s.sky(x, ym), C.zenith, lake ? 0.4 : 0.2), C.water, 0.4);
    wfill(poly, col, 210, { bleed: 0.16, dir: 'out', ang: 0, tex: 0.08, border: 0.45 });
  }
  if (lake) {
    // the ranges mirrored, nearest last: each a glaze the shape of the range hanging upside
    // down from the far shore, a shade darker, its foot dragged into vertical streaks
    const near = s.ranges.slice(-3);
    for (const L of near) {
      // a reflection is never darker than what it mirrors, and carries the sky's colour
      const col = mixRGB(shadeRGB(rangeCol(s, L), 0.92), s.sky(s.CX, s.HY * 0.6), 0.3);
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const poly = run.map(([x]) => [x, ys + 1]).concat(run.slice().reverse().map(([x, y]) => [x, y]));
          wwash(poly, col, 60);
        }
        run = [];
      };
      for (let x = -10; x <= REF_W + 10; x += 6) {
        const ry = ridgeAt(L, x);
        if (ry >= ys - 2 || !onWater(s, x, ys + 3)) { flush(); continue; }
        // the reflection stops at the near shore
        let yW = ys + 3;
        while (yW < REF_H && onWater(s, x, yW + 4)) yW += 4;
        run.push([x, Math.min(yW, ys + (ys - ry) * 0.92)]);
        if (random() < 0.12 * WP.dry) wdry(col, 70, x, ys + (ys - ry) * 0.6, x + random(-1, 1), ys + (ys - ry) * random(0.9, 1.1), 1.5);
      }
      flush();
    }
    // wind on the lake: level lines lifted across the reflections
    for (let i = 0; i < 16; i++) {
      const y = ys + 4 + (REF_H - ys) * Math.pow(random(), 1.6) * 0.8;
      const x = random(-20, REF_W);
      const len = random(80, 300);
      if (!onWater(s, x + len / 2, y)) continue;
      wdry(mixRGB(PAPER, s.sky(x, s.HY * 0.5), 0.3), 150, x, y, x + len, y + random(-1, 1), random(0.8, 2));
    }
  }
  // the bank trees mirrored in the river, soft, a shade darker
  for (const tr of s.trees) {
    const x = s.gx(tr.wx, tr.z), y = s.gy(tr.z);
    const h = ((tr.hW * s.F) / tr.z) * (tr.tall ? 2.3 : 1.15);
    const w = ((tr.hW * s.F) / tr.z) * (tr.tall ? 0.5 : 1);
    if (h < 4 || !onWater(s, x, y + 3)) continue;
    const col = shadeRGB(s.seenTree(mixRGB(C.foliage, C.silhouette, 0.3), tr.z, x, y), 0.9);
    wwash(markPoly(markLine(x, y + 1, x + random(-1, 1), y + h * 0.85, 0.03), Math.min(6, 0.6 + w * 0.3), tr.ph), col, 110);
  }
}
// lights on the water: dry-brush skips leaving paper in the light's column, wind lines
// lifted level, a few gouache glints
function wcWaterLight(s) {
  const r = s.river;
  if (!r) return;
  const C = s.C;
  for (let i = 0; i < 60 * WP.dry; i++) {
    const z = Math.exp(random(Math.log(0.9), Math.log(r.zN)));
    const x = s.gx(r.center(z) + random(-0.8, 0.8) * r.halfW(z), z), y = s.gy(z);
    const near = Math.exp(-Math.pow((x - s.sunX) / 170, 2));
    if (random() > 0.25 + 0.75 * near || !onWater(s, x, y)) continue;
    const len = Math.max(4, (random(0.1, 0.3) * s.F) / z);
    wdry(mixRGB(PAPER, C.glow, 0.25), 200, x - len / 2, y, x + len / 2, y + random(-0.4, 0.4), Math.min(2.5, 0.5 + 2 / Math.sqrt(z)));
  }
  if (WP.gouache > 0 && !s.winter) {
    for (let i = 0; i < 70 * WP.gouache; i++) {
      const z = Math.exp(random(Math.log(0.9), Math.log(r.zN)));
      const x = s.gx(r.center(z) + random(-0.8, 0.8) * r.halfW(z), z), y = s.gy(z);
      if (random() > Math.exp(-Math.pow((x - s.sunX) / 120, 2)) || !onWater(s, x, y)) continue;
      const l = Math.max(1.5, (random(0.03, 0.1) * s.F) / z);
      wwash([[x - l, y - 0.5], [x + l, y - 0.5], [x + l, y + 0.6], [x - l, y + 0.6]], mixRGB(PAPER, [255, 252, 240], 0.5), 230);
    }
  }
}

// --- the plain's trees ------------------------------------------------------------------
// A wet blot for the crown (its edge left to dry hard: a backrun), the shadow dropped into
// it away from the light, a rigger trunk, a sponge dabbed on the lit side of the nearer
// ones, the cast shadow a soft glaze on the ground; at night a lit window or two.
function wcMidTree(s, tr) {
  const C = s.C;
  const x = s.gx(tr.wx, tr.z);
  if (x < -40 || x > REF_W + 40) return;
  const y = s.gy(tr.z);
  const sc = s.F / tr.z;
  const w = tr.hW * sc * (tr.tall ? 0.5 : 1);
  const h = tr.hW * sc * (tr.tall ? 2.3 : 1.15);
  if (w < 1.2) return;
  const air = s.treeAir(tr.z);
  const cy = y - h * 0.18 - h * 0.5;
  const crown = s.seenTree(mixRGB(C.foliage, C.foliageLit, 0.35), tr.z, x, cy);
  const dark = s.seenTree(mixRGB(C.foliage, C.silhouette, 0.35), tr.z, x, cy);
  const lit = s.seenTree(mixRGB(C.foliageLit, C.light, 0.3 * s.warmth), tr.z, x, cy);
  const lx = Math.sign(s.sunX - x) || s.sunSide;
  if (w > 3 && !s.night && !s.winter && !onWater(s, x, y + 2)) {
    const len = h * (0.8 + 1.6 * (1 - s.sunH));
    wwash(blobPoly(x - lx * len * 0.45, y + 0.6, len * 0.5, Math.max(1, w * 0.1), tr.ph, 12, 0.25), s.seen(mixRGB(C.shadow, C.groundNear, 0.45), tr.z, x, y), 60 * (1 - air));
  }
  if (w > 3) wline('rigger', s.seenTree(C.silhouette, tr.z, x, y), Math.min(1.5, 0.25 + w * 0.04), x, y + 1, x + random(-0.5, 0.5), cy + h * 0.2);
  const poly = tr.tall ? blobPoly(x, cy, w * 0.5, h * 0.5, tr.ph, 16, 0.3) : blobPoly(x, cy, w * 0.56, h * 0.48, tr.ph, 18, 0.36);
  // the nearer crowns are wet blots that dry with a hard rim; the far ones single glazes
  if (w > 12) wfill(poly, crown, 150 + 60 * (1 - air), { bleed: 0.18, dir: 'out', tex: 0.25 + 0.3 * WP.gran, border: 0.1 + 0.55 * (1 - air) });
  else wwash(poly, crown, 120 + 70 * (1 - air));
  if (w > 2.5) {
    wwash(blobPoly(x - lx * w * 0.18, cy + h * 0.12, w * 0.38, h * (tr.tall ? 0.38 : 0.3), tr.ph + 5, 14, 0.4), dark, 110 * (1 - 0.5 * air));
  }
  if (w > 9 && WP.sponge > 0) {
    brush.set('sponge', toHex(lit), Math.min(1.1, w * 0.025) * WP.sponge + 0.1);
    for (let k = 0; k < 2 + Math.round(w / 16); k++) {
      const sx = x + lx * w * random(0.05, 0.35), sy = cy - h * random(0.05, 0.35);
      brush.line(X(sx), Y(sy), X(sx + random(-3, 3)), Y(sy + random(-3, 3)));
    }
  }
  if (s.night && tr.z > 2.5 && tr.z < 40 && random() < 0.4 * G.param('windowLights')) {
    const wx = x + (random() < 0.5 ? -1 : 1) * w * random(0.6, 1.1), wy = y - Math.max(1.5, w * 0.12);
    const r = Math.max(0.8, Math.min(2.5, w * 0.06));
    wwash(blobPoly(wx, wy, r * 3, r * 2, random(9), 10, 0.3), [255, 196, 110], 50);
    wwash(blobPoly(wx, wy, r, r * 0.8, random(9), 8, 0.2), [255, 214, 140], 235);
  }
}


// --- the foreground bank -------------------------------------------------------------
function bankPoly(rp, drop = 0) {
  return rp.bank.map((p) => [p[0], p[1] + drop]).concat([[REF_W + 30, REF_H + 40], [-30, REF_H + 40]]);
}
function bankBase(s) {
  const C = s.C;
  return s.winter ? [118, 100, 76] : mixRGB(mixRGB(C.silhouette, C.foliage, 0.55), C.foliageLit, 0.15);
}
// The bank: one dark wash, wet; drops of warm olive, earth and cool blue into it; its
// lower part massed with settling pigment (massArray over the bank's bands, the granulating
// brush); in late snow, patches of snow lifted and restated in gouache.
function wcBank(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const base = bankBase(s);
  if (s.night) wwash(bankPoly(rp, 10), mixRGB(C.silhouette, C.shadow, 0.3), 120);
  wfill(bankPoly(rp), base, 255, { bleed: 0.14, dir: 'in', tex: 0.25 + 0.4 * WP.gran, border: 0.5 });
  // a second glaze over the lower bank, once the first has dried: the foreground darkest
  wwash(bankPoly(rp, 60), mixRGB(base, C.shadow, 0.3), 110);
  wwash(bankPoly(rp, 150), mixRGB(base, C.silhouette, 0.3), 80);
  const n = Math.round(2 + 3 * WP.vari);
  const tints = s.winter ? [[150, 120, 84], [96, 92, 104], [130, 112, 90]] : [mixRGB(C.foliage, ACCENTS.olive, 0.6), mixRGB(BARK, C.foliage, 0.4), mixRGB(C.shadow, C.foliage, 0.5)];
  for (let i = 0; i < n; i++) {
    const x = random(-20, REF_W + 20);
    const y = bankAt(rp, x) + random(15, 150);
    const rx = random(60, 170), ry = rx * random(0.3, 0.6);
    const poly = blobPoly(x, y, rx, ry, random(100), 16, 0.45).map(([px, py]) => [px, Math.max(bankAt(rp, px) + 3, py)]);
    wfill(poly, tints[i % tints.length], 85, { bleed: 0.4, dir: 'out', tex: 0.3, border: 0.3 });
  }
  if (WP.mass > 0) {
    brush.noStroke();
    brush.noFill();
    brush.mass('2B', toHex(mixRGB(shadeRGB(base, 0.7), PAPER, 0.2)), { precision: 0.5, strength: 0.25 * WP.mass, gradient: 0.6, outline: false });
    brush.massArray([70, 170].map((d) => new brush.Polygon(bankPoly(rp, d).map(([x, y]) => [X(x), Y(y)]))));
    brush.noMass();
  }
  if (s.winter) {
    for (let i = 0; i < 9; i++) {
      const x = random(-20, REF_W + 20);
      const y = bankAt(rp, x) + random(8, 120);
      const poly = blobPoly(x, y, random(30, 90), random(8, 22), random(50), 18, 0.9).map(([px, py]) => [px, Math.max(bankAt(rp, px) + 2, py)]);
      wlift(poly, 0.8, { bleed: 0.12 });
      // restated in gouache as a few overlapping touches, not one flat shape
      for (let j = 0; j < 4; j++) {
        const q = poly[Math.floor(random(poly.length))];
        const cx = (x * 2 + q[0]) / 3, cy = (y * 2 + q[1]) / 3;
        wwash(blobPoly(cx, cy, random(10, 34), random(4, 11), random(50), 14, 0.8), mixRGB(PAPER, [238, 240, 246], 0.5), 120 * WP.gouache);
      }
    }
  }
}
// The bank's detail: grass flicked with the rigger through the wind field (flowLine), lit
// tips toward the sun; sword leaves as single swelling strokes (beginStroke / move /
// endStroke with pressure); flowers dropped in as small wet blots.
function wcBankDetail(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const left = rp.bank[0][0], right = rp.bank[rp.bank.length - 1][0];
  const base = bankBase(s);
  const dark = s.winter ? [92, 76, 58] : mixRGB(C.silhouette, C.foliage, 0.35);
  const lit = s.winter ? [186, 164, 124] : mixRGB(C.foliageLit, C.light, 0.25 * s.warmth);
  if (WP.rigger > 0) {
    brush.field('wind');
    // a new gust for the bank (the field recomputed at a later time)
    brush.refreshField(2.7);
    const n = Math.round(200 * WP.rigger);
    for (let i = 0; i < n; i++) {
      const x = random(left, right);
      const lip = bankAt(rp, x);
      const depth = -Math.log(1 - random() * 0.985) * 60;
      const y = lip + depth;
      if (y > REF_H + 5) continue;
      const near = 1 + depth / 110;
      const sunw = clamp01(1 - Math.abs(x - s.sunX) / (REF_W * 0.7));
      const col = random() < (0.25 + 0.35 * sunw) * clamp01(1.2 - depth / 120) ? mixRGB(lit, base, random(0, 0.35)) : mixRGB(mixRGB(dark, base, random(0.3, 0.7)), C.foliageLit, 0.2);
      brush.set('rigger', toHex(mixRGB(col, PAPER, 0.3 * WP.lineLift)), (0.3 + 0.35 * random()) * near);
      brush.flowLine(X(x), Y(y), random(8, 26) * near * U, 0);
    }
    brush.noField();
  }
  if (!s.winter) {
    const leafC = mixRGB(mixRGB(C.foliage, C.foliageLit, 0.25), C.silhouette, 0.2);
    for (let c = 0; c < 7; c++) {
      const x = random(left + 30, right - 30);
      const y = bankAt(rp, x) + random(50, Math.max(60, REF_H - bankAt(rp, x)));
      const near = Math.min(2, 1 + (y - bankAt(rp, x)) / 120);
      const m = 3 + Math.floor(random(3));
      for (let i = 0; i < m; i++) {
        const fan = (i / Math.max(1, m - 1) - 0.5) * random(1.1, 1.6);
        const a = -Math.PI / 2 + fan + random(-0.1, 0.1);
        const len = random(45, 90) * near * (1 - 0.3 * Math.abs(fan));
        const P = [];
        let px = x, py = y, aa = a;
        const curl = (a + Math.PI / 2) * random(0.9, 1.6);
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          P.push([px, py, [0.35, 0.9, 1.25, 1.35, 1.15, 0.7, 0.2][k]]);
          aa = a + curl * t * t;
          px += (Math.cos(aa) * len) / 6;
          py += (Math.sin(aa) * len) / 6;
        }
        // one stroke of a loaded round brush: it swells and lifts off to a point
        const c = shadeRGB(leafC, random(0.8, 1.1));
        wwash(markPoly(P, (3 + 2.5 * near) * random(0.8, 1.2), x * 0.01 + i), c, 170);
        if (random() < 0.5) wwash(markPoly(P.slice(0, 5), (1.6 + 1.2 * near), x * 0.01 + i + 3), shadeRGB(c, 0.7), 120);
      }
    }
  }
  if (WP.flowers > 0 && !s.winter) {
    const violet = s.night ? [70, 66, 104] : [112, 92, 168];
    const cream = s.night ? [120, 120, 140] : [240, 228, 196];
    for (let i = 0; i < Math.round(36 * WP.flowers); i++) {
      const x = random(left, right);
      const y = bankAt(rp, x) + random(8, 160);
      if (y > REF_H) continue;
      const r = random(2.5, 5.5) * (1 + (y - bankAt(rp, x)) / 160);
      wwash(blobPoly(x, y, r, r * 0.8, random(50), 9, 0.5), random() < 0.75 ? violet : cream, 200);
    }
  }
}

// --- the framing trees ------------------------------------------------------------------
// Each limb is a wash the shape of the limb (lit colour, wet), its shadow side glazed darker
// over it, and bark marked with the rigger; twigs are single rigger strokes. Each mass of the
// crown is a light wash, mid-green blots dropped in at its clumps, the darks dropped in away
// from the light with backrun edges; a sponge dabbed for the leaves' texture, light on the lit
// side and dark on the shadow side; dry-brush and rigger flicks break its outer edge.
function wcFramingTasks(s) {
  const C = s.C;
  const rp = s.repoussoir;
  const T = [];
  const bark = s.night ? mixRGB(C.silhouette, C.shadow, 0.35) : mixRGB(mixRGB(BARK, C.silhouette, 0.35), C.shadow, 0.12);
  const barkLit = mixRGB(bark, mixRGB(C.light, BARK, 0.5), 0.3 * s.warmth + 0.15);
  const ink = mixRGB(C.silhouette, C.shadow, 0.3);
  const segs = rp.segs.slice().sort((a, b) => b.pts[0][2] - a.pts[0][2]);
  for (let i = 0; i < segs.length; i += 10) {
    const chunk = segs.slice(i, i + 10);
    T.push(() => {
      for (const seg of chunk) {
        const P = smoothLimb(jointed(seg, rp.segs));
        const W = Math.max(...P.map((p) => p[2]));
        if (W < 2.5) {
          wstroke('rigger', bark, Math.max(0.5, W * 0.45), P.map((p) => [p[0], p[1], 1]));
          continue;
        }
        const left = [], right = [], away = [], mid = [];
        const lxs = Math.sign(s.sunX - P[0][0]) || s.sunSide;
        for (let k = 0; k < P.length; k++) {
          const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
          const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
          let nx = -dy / d, ny = dx / d;
          const hw = P[k][2] * 0.5;
          left.push([P[k][0] + nx * hw, P[k][1] + ny * hw]);
          right.push([P[k][0] - nx * hw, P[k][1] - ny * hw]);
          if (nx * lxs > 0) { nx = -nx; ny = -ny; } // the side away from the light
          away.push([P[k][0] + nx * hw, P[k][1] + ny * hw]);
          mid.push([P[k][0] - nx * hw * 0.15, P[k][1] - ny * hw * 0.15]);
        }
        // the trunk and the big limbs are washes (texture, a dried rim); the rest glazes
        if (W > 14) wfill(left.concat(right.reverse()), barkLit, 220, { bleed: 0.04, dir: 'in', tex: 0.45, border: 0.55 });
        else wwash(left.concat(right.reverse()), barkLit, 200);
        wwash(away.concat(mid.reverse()), bark, 170);
        if (W > 7 && WP.rigger > 0) {
          for (let k = 0; k < W * 0.5; k++) {
            const j = Math.floor(random(P.length - 1));
            const [ax, ay] = away[j], [bx, by] = P[j];
            const u = random(0.1, 0.8);
            const px = bx + (ax - bx) * u, py = by + (ay - by) * u;
            const dx = P[j + 1][0] - P[j][0], dy = P[j + 1][1] - P[j][1], d = Math.hypot(dx, dy) || 1;
            const len = W * random(0.4, 1.0);
            wline('rigger', ink, 0.3 + W * 0.012, px, py, px + (dx / d) * len, py + (dy / d) * len);
          }
        }
      }
    });
  }
  if (!rp.leaves.length || s.winter) return T; // late snow: bare trees
  const clusters = canopyClusters(rp.leaves);
  const lit = mixRGB(mixRGB(C.foliageLit, C.light, 0.3 * s.warmth), C.foliage, 0.25);
  const midC = mixRGB(C.foliage, C.foliageLit, 0.4);
  const darkC = mixRGB(mixRGB(C.foliage, C.silhouette, 0.3), PRUSSIAN, 0.08);
  // the biggest masses get a wet wash; the rest are glazed
  const wetSet = new Set(clusters.slice().sort((a, b) => b.r - a.r).slice(0, 10));
  for (const c of clusters) {
    T.push(() => {
      const dxs = s.sunX - c.x, dys = s.sunY - c.y, dl = Math.hypot(dxs, dys) || 1;
      const Lx = dxs / dl, Ly = dys / dl;
      const outline = blobPoly(c.x, c.y, c.r, c.r * 0.78, c.ph, 26, 0.7);
      if (wetSet.has(c)) wfill(outline, lit, 150, { bleed: 0.34, dir: 'out', tex: 0.3, border: 0.3 });
      else wwash(outline, lit, 110);
      // the clumps: mid green on the shadow side of each, never centred, broken outlines
      for (const lf of c.members) wwash(blobPoly(lf.x - Lx * lf.r * 0.2, lf.y - Ly * lf.r * 0.2, lf.r * 1.05, lf.r * 0.8, lf.ph, 16, 0.8), midC, 80);
      for (const lf of c.members) {
        if (random() > 0.6) continue;
        wwash(blobPoly(lf.x - Lx * lf.r * 0.45, lf.y - Ly * lf.r * 0.45 + lf.r * 0.2, lf.r * 0.6, lf.r * 0.4, lf.ph + 7, 14, 0.9), darkC, 100);
      }
      if (WP.sponge > 0) {
        const k = Math.round((3 + c.r / 10) * WP.sponge);
        for (let i = 0; i < k * 2; i++) {
          const lightSide = i < k;
          const a = Math.atan2(Ly, Lx) + (lightSide ? 0 : Math.PI) + random(-1, 1);
          const d = c.r * random(0.2, 0.75);
          const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * 0.78;
          brush.set('sponge', toHex(lightSide ? mixRGB(lit, [236, 226, 150], 0.15 * s.warmth) : darkC), random(0.5, 1));
          brush.line(X(x), Y(y), X(x + random(-4, 4)), Y(y + random(-4, 4)));
        }
      }
      if (WP.dry > 0 || WP.rigger > 0) {
        const n = Math.round(c.r * 0.3);
        for (let i = 0; i < n; i++) {
          const a = random(TWO_PI);
          const ex = c.x + Math.cos(a) * c.r * 0.85, ey = c.y + Math.sin(a) * c.r * 0.66;
          const len = c.r * random(0.15, 0.35);
          const col = Math.cos(a) * Lx + Math.sin(a) * Ly > 0.2 ? midC : darkC;
          // the edge broken by single leaf-touches of the brush's tip, and some dry brush
          if (random() < 0.3 && WP.dry > 0) wdry(col, 150, ex, ey, ex + Math.cos(a) * len, ey + Math.sin(a) * len, random(1, 2.5));
          else wwash(markPoly(markLine(ex, ey, ex + Math.cos(a) * len * 0.6, ey + Math.sin(a) * len * 0.6, 0.25, 4), random(1.4, 3), ex * 0.05, 0.4), col, 150);
        }
      }
    });
  }
  return T;
}

// --- pen and wash ----------------------------------------------------------------------
// A sepia pen over the dried washes: hatching in the shadow faces of the nearer summits and
// in the bank (hatchStyle + hatch), cross-hatched where it is darkest; contours drawn with
// the hand's wobble along the nearest crest and the framing trunk.
function peakFace(L, pk) {
  const rid = L.ridge;
  const face = [];
  for (let i = pk.j; i !== pk.v; i += pk.dir) face.push([rid[i][0], rid[i][1] + 1]);
  const [vx, vy] = rid[pk.v], [sx, sy] = rid[pk.j];
  const bottom = vy + (L.base - vy) * 0.75;
  face.push([vx, vy + 1], [vx, bottom]);
  for (let k = 1; k <= 6; k++) face.push([vx + (sx - vx) * (k / 6) + (noise(pk.j * 0.1, k * 0.5) - 0.5) * 24, bottom + (sy - bottom) * (k / 6)]);
  return face;
}
function wcPen(s) {
  if (WP.pen <= 0.02) return;
  const ink = s.night ? mixRGB(s.C.silhouette, SEPIA, 0.3) : mixRGB(mixRGB(SEPIA, s.C.shadow, 0.25), PAPER, 0.3);
  brush.noFill();
  brush.noStroke();
  brush.hatchStyle('pen', toHex(ink), 0.25 + 0.3 * WP.pen);
  const dist = Math.max(2.5, (10 - 6 * WP.pen) * U * 1.4);
  // the summits' shadow faces hatched together, as one pass of the pen (hatchArray)
  const faces = [];
  for (const L of s.ranges) {
    if (L.t < 0.7) continue;
    for (const pk of L.peaks) if (pk.prom >= 30) faces.push(new brush.Polygon(underRidge(peakFace(L, pk), L, L.base).map(([x, y]) => [X(x), Y(y)])));
  }
  if (faces.length) {
    brush.hatch(dist, 0.9, { rand: 0.25, gradient: 0.3 });
    brush.hatchArray(faces);
    brush.noHatch();
    brush.hatchStyle('pen', toHex(ink), 0.25 + 0.3 * WP.pen);
  }
  // in the bank, short hatching in a few shadowed clumps only (hatchArray over small blobs)
  const rp = s.repoussoir;
  const clumps = [];
  for (let i = 0; i < 6; i++) {
    const x = random(40, REF_W - 40);
    const y = bankAt(rp, x) + random(40, 160);
    if (y > REF_H - 10) continue;
    clumps.push(new brush.Polygon(blobPoly(x, y, random(30, 60), random(14, 26), random(50), 14, 0.5).map(([px, py]) => [X(px), Y(py)])));
  }
  if (clumps.length) {
    brush.hatch(dist * 0.8, -0.6, { rand: 0.3, gradient: 0.5 });
    brush.hatchArray(clumps);
  }
  brush.noHatch();
  brush.wiggle(WP.wobble);
  brush.set('pen', toHex(ink), 0.2 + 0.25 * WP.pen);
  // the nearest crest, the pen lifted now and then
  const L = s.ranges[s.ranges.length - 1];
  let run = [];
  for (let i = 0; i < L.ridge.length; i += 3) {
    const [x, y] = L.ridge[i];
    if (x > -10 && x < REF_W + 10 && noise(x * 0.012, 4.4) > 0.38) run.push([X(x), Y(y)]);
    else { if (run.length > 2) brush.spline(run, 0.35); run = []; }
  }
  if (run.length > 2) brush.spline(run, 0.35);
  for (const g of s.repoussoir.segs) {
    if (g.depth > 1) continue;
    const P = smoothLimb(g.pts);
    for (const sd of [-1, 1]) {
      const edge = [];
      for (let k = 0; k < P.length; k += 2) {
        const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
        edge.push([X(P[k][0] - (dy / d) * P[k][2] * 0.5 * sd), Y(P[k][1] + (dx / d) * P[k][2] * 0.5 * sd)]);
      }
      if (edge.length > 2 && random() < 0.8) brush.spline(edge, 0.4);
    }
  }
  brush.noField();
}

// --- spatter, salt, granulation, the paper ------------------------------------------------
function wcSpatterSalt(s) {
  const C = s.C;
  if (WP.spatter > 0) {
    const yT = groundTop(s);
    const cols = s.winter ? [[96, 80, 64], [150, 98, 70], [238, 240, 246]] : [C.groundNear, C.foliage, ACCENTS.violet, BARK];
    for (let i = 0; i < Math.round(14 * WP.spatter); i++) {
      const x = random(-20, REF_W + 20), y = yT + (REF_H - yT) * (0.35 + 0.65 * random());
      const a = random(TWO_PI), l = random(20, 70);
      brush.set('spatter', toHex(mixRGB(cols[i % cols.length], PAPER, 0.15)), random(0.4, 0.8));
      brush.line(X(x), Y(y), X(x + Math.cos(a) * l), Y(y + Math.sin(a) * l));
    }
  }
  if (WP.salt > 0) {
    brush.set('salt', toHex(mixRGB(PAPER, s.sky(s.CX, 10), 0.15)), 1);
    for (let i = 0; i < Math.round(16 * WP.salt); i++) {
      // salt only bites where the wash was wet and dark enough: the upper sky, the bank
      const inSky = random() < 0.5;
      const x = random(0, REF_W);
      const y = inSky ? random(10, s.HY * 0.4) : bankAt(s.repoussoir, x) + random(30, 200);
      if (inSky && inCloud(s, x, y)) continue;
      brush.line(X(x), Y(y), X(x + random(-14, 14)), Y(y + random(-8, 8)));
    }
  }
}
// granulating pigment (ultramarine settling in the hollows) in the mountains' shadows and
// the high sky
function wcGranulation(s) {
  const n = Math.round(20 * WP.gran);
  if (n <= 0) return;
  const C = s.C;
  for (let i = 0; i < n; i++) {
    const L = s.ranges[Math.floor(random(s.ranges.length))];
    const x = random(0, REF_W);
    const top = ridgeAt(L, x);
    const y = top + (L.base - top) * random(0.1, 0.8);
    const col = s.seen(mixRGB(C.shadow, PRUSSIAN, 0.35), L.z * 0.6, x, y);
    brush.set('granule', toHex(mixRGB(col, rangeCol(s, L), 0.4)), 0.2 + 0.25 * (1 - L.air));
    brush.line(X(x), Y(y), X(x + random(-30, 30)), Y(y + random(-12, 12)));
  }
}
// the paper's tooth: the grain of the sheet catching the light and holding pigment in its
// hollows (rough more than cold-pressed, hot-pressed hardly at all)
function paintPaperTooth(s) {
  const g = WP.tooth;
  const d = s.grain;
  strokeWeight(Math.max(1, 1.1 * U));
  for (const dark of [true, false]) {
    stroke(dark ? 70 : 255, dark ? 60 : 252, dark ? 50 : 244, (dark ? 26 : 38) * g);
    beginShape(POINTS);
    for (let i = 0; i < d.length; i += 3) {
      if ((d[i + 2] < 0.5) !== dark) continue;
      vertex(X(d[i]), Y(d[i + 1]));
    }
    endShape();
  }
  noStroke();
}
