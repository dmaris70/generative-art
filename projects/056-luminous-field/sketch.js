// Luminous Field — the wall.
//
// engine.js lays out the canvases and computes, for each loop phase, one uniform block per
// canvas; this file paints each canvas as a fragment-shader pass into the LED harness
// (assets/led.js), drives the loop from the wall clock, and handles the panel, overlay and
// frame export.
//
// URL flags (besides the GenArt ?seed= and ?p_*):
//   ?kiosk=1   one canvas pixel per LED, top-left, no panel or cursor: for output to a controller
//   ?t=0.25    hold a fixed loop phase (screenshots, review)
//   ?gui=0     contact-sheet tile: a reduced wall, rendered once
// Wall 'Screen' (the default) makes the wall the window: any size, edge to edge, rebuilt on resize.
// Keys: L loupe · H hide panel & overlay · I info · F fullscreen · space pause · S save master PNG

(function () {
  'use strict';

  const LF = window.LuminousField;
  const url = new URL(location.href);
  const KIOSK = url.searchParams.get('kiosk') === '1';
  const TILE = !KIOSK && url.searchParams.get('gui') === '0';
  const FIXED_T = url.searchParams.has('t') ? parseFloat(url.searchParams.get('t')) : null;
  const LIVE_FPS = 60;
  const SCREEN_PRESET = 99;    // wall = the window, not a fixed LED size
  const SCREEN_MAX = 2560;     // longest side rendered in screen mode; larger displays upscale

  if (KIOSK) document.body.classList.add('kiosk');

  const canvas = document.getElementById('wall');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');

  let wall, G, scene, buf, count = 0;
  let paused = FIXED_T !== null, pausedT = FIXED_T ?? 0, uiHidden = false, exporting = null;

  try {
    wall = LEDWall.create(canvas, {
      kiosk: KIOSK,
      onLoupeRequest: () => G.setParams({ view: LEDWall.VIEW.LOUPE }),
    });
  } catch (e) {
    fail(e);
    return;
  }
  const gl = wall.gl;

  // ---------------------------------------------------------------- canvas painter
  // One draw per canvas: a quad over the canvas's rectangle, shaded per LED.
  const NV = LF.PANEL_VEC4;
  const VS = `#version 300 es
  uniform vec4 uB[${NV}];
  uniform vec2 uWall;
  out vec2 vQ;   // canvas units: x ∈ [0, aspect], y ∈ [0, 1], y down
  void main(){
    vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec4 R = uB[0];
    vec2 p = R.xy + c * R.zw;
    vQ = c * vec2(uB[3].z, 1.0);
    gl_Position = vec4(p.x / uWall.x * 2. - 1., 1. - p.y / uWall.y * 2., 0., 1.);
  }`;

  const FS = `#version 300 es
  precision highp float;
  uniform vec4 uB[${NV}];
  uniform vec3 uCore;
  uniform float uDrift, uPx;   // edge-drift radius; one LED in canvas units
  in vec2 vQ;
  out vec4 o;

  float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float s = 0., a = 0.5;
    for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
    return s / 0.9375;
  }
  float sdRound(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
  }

  void main(){
    vec2 q = vQ;
    float A = uB[3].z;
    int n = int(uB[3].w + 0.5);
    vec2 N0 = uB[3].xy;
    float sc = uB[2].w;

    // Ground: a vertical passage from one colour to the other, unevenly, brushed sideways.
    float gn = fbm(vec2(q.x * 2.4, q.y * 9.0) + N0);
    float gw = fbm(q * 1.4 + N0 * 1.7 + 13.0);
    vec3 col = mix(uB[1].rgb, uB[2].rgb, smoothstep(0.0, 1.0, q.y + (gw - 0.5) * 0.45));
    col *= 1.0 + sc * 0.3 * (gn - 0.5);
    vec3 glow = vec3(0.);

    for (int i = 0; i < ${LF.MAX_FIELDS}; i++){
      if (i >= n) break;
      int b = 4 + 6 * i;
      vec4 a = uB[b], s = uB[b + 1], cA = uB[b + 2], cB = uB[b + 3], e = uB[b + 4], f = uB[b + 5];
      float fi = float(i);
      vec2 dr = vec2(cos(f.w), sin(f.w)) * uDrift;
      vec2 p = q - a.xy;

      // the brushed edge: broad wander plus horizontal strokes fraying the border
      float en = fbm(q * 3.0 + N0 + dr + fi * 31.7) - 0.5;
      float es = fbm(vec2(q.x * 3.0, q.y * 22.0) + N0 * 0.7 + dr * 1.3 + fi * 7.3) - 0.5;
      float d = sdRound(p, a.zw, s.x) + (en * 0.04 + es * 0.007) * s.z;
      float fe = s.y + uPx;
      float cov = 1.0 - smoothstep(-fe, fe, d);

      // layered interior: ink B seen through ink A, in horizontal scumbles
      vec2 fu = p / a.zw * 0.5 + 0.5;
      float st = fbm(vec2(q.x * 2.2, q.y * 8.0) + N0 * 1.3 + dr * 0.5 + fi * 5.1);
      float sw = fbm(q * 2.2 + N0 + dr * 0.3 + fi * 11.0);
      float m = clamp(cB.w + (st - 0.5) * 0.6 * sc + (fu.y - 0.5) * 0.35, 0.0, 1.0);
      vec3 ink = mix(cA.rgb, cB.rgb, m);
      ink *= 1.0 + sc * 0.35 * (sw - 0.5);

      // the core: light that seems to come from behind the paint
      vec2 cd = (fu - f.xy) * a.zw * vec2(0.8, 1.5);
      float core = exp(-dot(cd, cd) / (0.12 * max(a.z * a.w, 0.02))) * f.z;
      ink += uCore * core * 0.32 * (0.8 + 0.4 * sw);

      // paint is thinner at the border, so the ground shows through
      // and thinner toward the top, where the light gathers less
      float thin = smoothstep(0.0, -0.09, d);
      ink *= mix(0.85, 1.15, smoothstep(0.0, 1.0, fu.y));
      col = mix(col, ink, cov * cA.w * mix(0.62, 1.0, thin) * mix(0.72, 1.0, smoothstep(0.0, 0.6, fu.y)));

      // the seam: a line of light just inside the edge, and its bleed out over the ground
      float ws = fe * 0.45 + 0.005 + uPx;
      float seam = exp(-pow((d + fe * 0.35) / ws, 2.0)) * s.w;
      float lower = smoothstep(-0.6, 1.0, fu.y);      // the seam and the bleed gather at the foot
      float brk = smoothstep(0.3, 0.75, fbm(q * 6.0 + N0 * 0.5 + dr + fi * 3.3));  // the seam is not traced: it comes and goes
      col += e.rgb * seam * (0.015 + 0.2 * lower * lower) * (0.35 + 0.9 * brk);
      float fall = 0.05 + 0.07 * smoothstep(0.0, 0.25, p.y - a.w);
      glow += mix(ink, e.rgb, 0.5) * e.w * (0.08 + 0.2 * lower) * exp(-max(d, 0.0) / fall) * (1.0 - cov) * s.w;
    }
    col += glow;

    // the canvas edge: one LED of anti-aliasing so the stretcher reads as a plane, not a cut
    float edge = min(min(q.x, A - q.x), min(q.y, 1.0 - q.y));
    col *= clamp(edge / uPx, 0.0, 1.0);
    o = vec4(max(col, 0.0) * uB[1].w, 1.0);
  }`;

  const prog = (() => {
    const mk = (t, s) => {
      const sh = gl.createShader(t);
      gl.shaderSource(sh, s);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = (n) => gl.getUniformLocation(p, n);
    return { p, uB: u('uB'), uWall: u('uWall'), uCore: u('uCore'), uDrift: u('uDrift'), uPx: u('uPx') };
  })();
  const vao = gl.createVertexArray();

  // ---------------------------------------------------------------- parameters
  const regOpts = {};
  LF.REGISTERS.forEach((r, i) => (regOpts[r.name] = i));

  G = GenArt.create({
    title: 'Luminous Field',
    params: {
      preset: { value: SCREEN_PRESET, options: Object.assign({ 'Screen (fills the window)': SCREEN_PRESET }, LEDWall.presetOptions()), label: 'wall', group: 'wall' },
      customW: { value: 2160, min: 256, max: 16384, step: 16, label: 'custom width', group: 'wall' },
      customH: { value: 2160, min: 128, max: 8192, step: 16, label: 'custom height', group: 'wall' },
      pitch: { value: 2.5, min: 0.6, max: 10, step: 0.1, label: 'pixel pitch (mm)', group: 'wall' },
      view: { value: 0, options: { fit: 0, 'loupe (LED emitters)': 1 }, label: 'view', group: 'wall' },

      register: { value: 0, options: regOpts, label: 'register', group: 'painting' },
      panels: { value: 0, min: 0, max: LF.MAX_PANELS, step: 1, label: 'canvases (0 = auto)', group: 'painting' },
      fields: { value: 0, min: 0, max: 3, step: 1, label: 'fields (0 = seed)', group: 'painting' },
      hang: { value: 0, min: 0, max: 0.2, step: 0.005, label: 'hang (black wall)', group: 'painting' },
      series: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'series variation', group: 'painting' },
      feather: { value: 1, min: 0.1, max: 3, step: 0.01, label: 'feather', group: 'painting' },
      halo: { value: 1, min: 0, max: 2.5, step: 0.01, label: 'seam of light', group: 'painting' },
      scumble: { value: 1, min: 0, max: 2, step: 0.01, label: 'scumble', group: 'painting' },
      core: { value: 1, min: 0, max: 2.5, step: 0.01, label: 'core light', group: 'painting' },

      loopMin: { value: 10, min: 1, max: 60, step: 1, label: 'loop (minutes)', group: 'time' },
      motion: { value: 1, min: 0, max: 2, step: 0.01, label: 'breath', group: 'time' },

      intensity: { value: 1, min: 0.2, max: 2.5, step: 0.01, label: 'intensity', group: 'light' },
      exposure: { value: 1.6, min: 0.2, max: 4, step: 0.05, label: 'exposure', group: 'light' },
      ceiling: { value: 0.92, min: 0.3, max: 1, step: 0.01, label: 'ceiling', group: 'light' },
      floor: { value: 3, min: 0, max: 12, step: 1, label: 'black floor (code)', group: 'light' },
      dither: { value: 1, min: 0, max: 2, step: 0.1, label: 'dither (LSB)', group: 'light' },
    },
    closedGroups: ['light'],
    onReset: rebuild,
  });
  if (KIOSK && G.gui) G.gui.hide();
  if (G.gui && !KIOSK) G.gui.close();

  // in screen mode the wall follows the window
  let resizeTimer = 0;
  addEventListener('resize', () => {
    if (G.params.preset !== SCREEN_PRESET || TILE) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 200);
  });
  setTimeout(() => document.getElementById('hint').classList.add('gone'), 5000);

  window.saveCanvas = () => saveMaster();

  // ---------------------------------------------------------------- build
  let wallInfo = { w: 0, h: 0, fold: -1, label: '' };

  function rebuild() {
    const P = G.params;
    const screen = P.preset === SCREEN_PRESET && !KIOSK;
    if (screen) {
      // the wall is the window, in device pixels, capped so large displays stay smooth
      const dpr = devicePixelRatio || 1;
      const sw = Math.max(1, innerWidth * dpr), sh = Math.max(1, innerHeight * dpr);
      const k = Math.min(1, SCREEN_MAX / Math.max(sw, sh));
      wallInfo = { w: Math.round(sw * k), h: Math.round(sh * k), fold: -1, label: 'Screen' };
    } else {
      wallInfo = LEDWall.resolve(P.preset === SCREEN_PRESET ? 2 : P.preset, P.customW, P.customH);
    }
    wall.state.noPad = screen;
    document.body.classList.toggle('screen', screen);
    let W = wallInfo.w, H = wallInfo.h;
    if (TILE) {
      const s = 360 / H;
      W = Math.round(W * s); H = 360;
    }
    try {
      wall.configure({
        width: W, height: H, pitch: P.pitch, view: P.view, exposure: P.exposure,
        ceiling: P.ceiling, floor: P.floor, dither: P.dither, fold: wallInfo.fold,
      });
    } catch (e) {
      fail(e);
      return;
    }
    scene = LF.makeScene(G.seed, {
      aspect: W / H, panels: P.panels, fields: P.fields, hang: P.hang, register: P.register,
      series: P.series, feather: P.feather, halo: P.halo, scumble: P.scumble, core: P.core,
      motion: P.motion,
    });
    buf = new Float32Array(LF.MAX_PANELS * LF.STRIDE);
    if (TILE) renderAt(FIXED_T ?? 0.3, 0);
  }

  // ---------------------------------------------------------------- render
  function loopSeconds() { return G.params.loopMin * 60; }

  function renderAt(t, frame) {
    const P = G.params;
    count = LF.frame(scene, t, wall.width, wall.height, { intensity: P.intensity }, buf);
    wall.beginAccum();
    gl.useProgram(prog.p);
    gl.uniform2f(prog.uWall, wall.width, wall.height);
    gl.uniform3fv(prog.uCore, LF.coreColour(scene));
    gl.uniform1f(prog.uDrift, scene.drift * P.motion);
    gl.bindVertexArray(vao);
    for (let i = 0; i < count; i++) {
      const block = buf.subarray(i * LF.STRIDE, (i + 1) * LF.STRIDE);
      gl.uniform1f(prog.uPx, 1 / block[3]); // one LED in canvas units (canvas height = 1)
      gl.uniform4fv(prog.uB, block);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    wall.finish(frame);
    wall.present();
  }

  // Phase from the wall clock: several players stay in step, and a restarted player resumes
  // where the loop should be rather than at the beginning.
  function currentT() {
    if (paused) return pausedT;
    const s = Date.now() / 1000;
    return (s / loopSeconds()) % 1;
  }

  let fpsAvg = 60, last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    if (exporting || TILE || !scene) return;
    const dt = now - last; last = now;
    fpsAvg += (1000 / Math.max(1, dt) - fpsAvg) * 0.05;
    // keep the fitted wall clear of the panel
    wall.state.insetRight = !wall.state.noPad && G.gui && !uiHidden && !KIOSK && innerWidth > 900
      ? Math.ceil(G.gui.domElement.getBoundingClientRect().width * devicePixelRatio) + 16 : 0;
    const t = currentT();
    const frames = Math.round(loopSeconds() * LIVE_FPS);
    renderAt(t, Math.floor(t * frames) % frames);
    if (!KIOSK && !uiHidden) status(t);
  }

  function mmss(s) {
    s = Math.floor(s);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function status(t) {
    const f = wall.facts();
    const L = loopSeconds();
    statusEl.textContent = [
      `${wallInfo.label}${TILE ? ' (tile)' : ''} · ${wall.width}×${wall.height} LEDs · ${f.megapixels.toFixed(1)} MP`,
      `${G.params.pitch} mm pitch → ${f.widthM.toFixed(2)} × ${f.heightM.toFixed(2)} m · view ≥ ${f.minViewM.toFixed(1)} m, comfortable ${f.comfortM[0].toFixed(1)}–${f.comfortM[1].toFixed(1)} m (rule of thumb)`,
      `loop ${mmss(t * L)} / ${mmss(L)}${paused ? ' · paused' : ''} · ${count} canvas${count === 1 ? '' : 'es'} · ${LF.REGISTERS[G.params.register].name} · ${fpsAvg.toFixed(0)} fps${f.float ? '' : ' · 8-bit accumulation (no float FBO)'}`,
    ].join('\n');
  }

  // ---------------------------------------------------------------- export
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function masterBlob() {
    const img = wall.readMaster();
    const oc = new OffscreenCanvas(img.width, img.height);
    oc.getContext('2d').putImageData(img, 0, 0);
    return oc.convertToBlob({ type: 'image/png' });
  }

  async function saveMaster() {
    const t = currentT();
    const frames = Math.round(loopSeconds() * LIVE_FPS);
    renderAt(t, Math.floor(t * frames) % frames);
    download(await masterBlob(), `luminous-field-${G.seed}-${wall.width}x${wall.height}-t${t.toFixed(4)}.png`);
  }

  const exp = { fps: 30, start: 0, count: 300, run: () => exportFrames(), progress: '—' };
  let progCtl;
  if (G.gui && !KIOSK) {
    const f = G.gui.addFolder('export (master frames)');
    f.add(exp, 'fps', [24, 25, 30, 50, 60]).name('fps');
    f.add(exp, 'start', 0, 1e6, 1).name('start frame');
    f.add(exp, 'count', 1, 1e6, 1).name('frame count');
    f.add(exp, 'run').name('Export PNG sequence to folder…');
    progCtl = f.add(exp, 'progress').name('progress').disable();
    f.close();
  }

  // Frame f of N is rendered at t = f / N exactly, with the dither seeded by f, so the sequence
  // is deterministic and frame N would equal frame 0: encode with -stream_loop for a seamless
  // master. Needs the File System Access API (Chromium).
  async function exportFrames() {
    if (!window.showDirectoryPicker) {
      alert('Exporting a sequence needs the File System Access API (Chrome / Edge). Use "Save PNG" for single frames.');
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' }).catch(() => null);
    if (!dir) return;
    const N = Math.round(loopSeconds() * exp.fps);
    const start = Math.min(exp.start | 0, N - 1), end = Math.min(N, start + (exp.count | 0));
    exporting = { cancel: false };
    const manifest = {
      piece: '056 Luminous Field', seed: G.seed, params: Object.assign({}, G.params),
      wall: { width: wall.width, height: wall.height, label: wallInfo.label },
      fps: exp.fps, loopFrames: N, range: [start, end],
      note: 'Frame f is the loop at t = f / loopFrames. Frame loopFrames equals frame 0, so the full range loops seamlessly.',
      encode: {
        prores: `ffmpeg -framerate ${exp.fps} -start_number ${start} -i frame_%06d.png -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le luminous-field-${G.seed}.mov`,
        hap: `ffmpeg -framerate ${exp.fps} -start_number ${start} -i frame_%06d.png -c:v hap -format hap_q luminous-field-${G.seed}-hap.mov`,
      },
      created: new Date().toISOString(),
    };
    const write = async (name, data) => {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
    };
    await write('manifest.json', JSON.stringify(manifest, null, 2));
    try {
      for (let f = start; f < end && !exporting.cancel; f++) {
        renderAt(f / N, f);
        await write(`frame_${String(f).padStart(6, '0')}.png`, await masterBlob());
        exp.progress = `${f - start + 1} / ${end - start}`;
        if (progCtl) progCtl.updateDisplay();
        statusEl.textContent = `exporting frame ${f} (${f - start + 1}/${end - start}) — Esc to cancel`;
      }
    } finally {
      exp.progress = exporting.cancel ? 'cancelled' : 'done';
      if (progCtl) progCtl.updateDisplay();
      exporting = null;
    }
  }

  // ---------------------------------------------------------------- keys
  addEventListener('keydown', (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && exporting) exporting.cancel = true;
    else if (k === 'l') G.setParams({ view: G.params.view === 1 ? 0 : 1 });
    else if (k === 'h') {
      uiHidden = !uiHidden;
      document.body.classList.toggle('bare', uiHidden);
      if (G.gui) uiHidden ? G.gui.hide() : G.gui.show();
    } else if (k === 'f') {
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    } else if (k === ' ') {
      e.preventDefault();
      if (!paused) pausedT = currentT();
      paused = !paused;
    } else if (k === 'i') document.body.classList.toggle('info');
    else if (k === 'r') G.randomize();
    else if (k === 's') saveMaster();
  });

  function fail(e) {
    errorEl.textContent = '⚠ ' + (e && e.message ? e.message : e);
    errorEl.hidden = false;
  }

  rebuild();
  requestAnimationFrame(tick);
})();
