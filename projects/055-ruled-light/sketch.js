// Ruled Light — the wall.
//
// engine.js emits straight segments; this file draws them as anti-aliased additive light into
// the LED harness (assets/led.js), drives the loop from the wall clock, and handles the panel,
// overlay, and frame export.
//
// URL flags (besides the GenArt ?seed= and ?p_*):
//   ?kiosk=1   one canvas pixel per LED, top-left, no panel or cursor: for output to a controller
//   ?t=0.25    hold a fixed loop phase (screenshots, review)
//   ?gui=0     contact-sheet tile: a reduced wall, rendered once
// Keys: L loupe · H hide panel & overlay · F fullscreen · space pause · S save master PNG

(function () {
  'use strict';

  const RL = window.RuledLight;
  const url = new URL(location.href);
  const KIOSK = url.searchParams.get('kiosk') === '1';
  const TILE = !KIOSK && url.searchParams.get('gui') === '0';
  const FIXED_T = url.searchParams.has('t') ? parseFloat(url.searchParams.get('t')) : null;
  const LIVE_FPS = 60;

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

  // ---------------------------------------------------------------- line renderer
  const VS = `#version 300 es
  layout(location=0) in vec2 aCorner;  // (along 0..1, side -1..1)
  layout(location=1) in vec4 aEnds;    // x0 y0 x1 y1 in wall px, y down
  layout(location=2) in vec4 aColor;   // linear emitter energy
  uniform vec2 uWall; uniform float uHalf;
  out float vAcross; out vec3 vColor;
  void main(){
    vec2 p0 = aEnds.xy, p1 = aEnds.zw, d = p1 - p0;
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(1., 0.);
    vec2 nrm = vec2(-dir.y, dir.x);
    float ext = uHalf + 1.0;
    vec2 p = mix(p0 - dir * 0.5, p1 + dir * 0.5, aCorner.x) + nrm * aCorner.y * ext;
    vAcross = aCorner.y * ext;
    vColor = aColor.rgb;
    gl_Position = vec4(p.x / uWall.x * 2. - 1., 1. - p.y / uWall.y * 2., 0., 1.);
  }`;
  const FS = `#version 300 es
  precision highp float;
  uniform float uHalf;
  in float vAcross; in vec3 vColor;
  out vec4 o;
  void main(){
    // box-filtered coverage across the line: a line thinner than one LED dims rather than vanishes
    float cov = clamp(uHalf + 0.5 - abs(vAcross), 0., 1.);
    o = vec4(vColor * cov, 1.);
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
    return { p, uWall: gl.getUniformLocation(p, 'uWall'), uHalf: gl.getUniformLocation(p, 'uHalf') };
  })();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, RL.STRIDE * 4, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, RL.STRIDE * 4, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  // ---------------------------------------------------------------- parameters
  const palOpts = {};
  RL.PALETTES.forEach((p, i) => (palOpts[p.name] = i));

  G = GenArt.create({
    title: 'Ruled Light',
    params: {
      preset: { value: 0, options: LEDWall.presetOptions(), label: 'wall', group: 'wall' },
      customW: { value: 6144, min: 256, max: 16384, step: 16, label: 'custom width', group: 'wall' },
      customH: { value: 1536, min: 128, max: 8192, step: 16, label: 'custom height', group: 'wall' },
      pitch: { value: 2.5, min: 0.6, max: 10, step: 0.1, label: 'pixel pitch (mm)', group: 'wall' },
      view: { value: 0, options: { fit: 0, 'loupe (LED emitters)': 1 }, label: 'view', group: 'wall' },

      bundles: { value: 8, min: 2, max: 24, step: 1, label: 'bundles / square', group: 'composition' },
      filaments: { value: 120, min: 16, max: 400, step: 4, label: 'filaments', group: 'composition' },
      spread: { value: 0.55, min: 0.2, max: 1.2, step: 0.01, label: 'spread', group: 'composition' },
      crossing: { value: 0.72, min: 0, max: 1, step: 0.01, label: 'crossing', group: 'composition' },
      warp: { value: 0.4, min: 0, max: 1, step: 0.01, label: 'warp', group: 'composition' },
      ascent: { value: 0.3, min: 0, max: 1, step: 0.01, label: 'ascent', group: 'composition' },
      accent: { value: 0.15, min: 0, max: 0.6, step: 0.01, label: 'accent share', group: 'composition' },
      ground: { value: 0, min: 0, max: 1, step: 0.01, label: 'metric ground', group: 'composition' },

      loopMin: { value: 12, min: 1, max: 60, step: 1, label: 'loop (minutes)', group: 'time' },
      motion: { value: 1, min: 0, max: 1.5, step: 0.01, label: 'motion', group: 'time' },

      palette: { value: 1, options: palOpts, label: 'palette', group: 'light' },
      width: { value: 1.2, min: 0.5, max: 4, step: 0.1, label: 'line width (LEDs)', group: 'light' },
      intensity: { value: 0.07, min: 0.01, max: 0.3, step: 0.005, label: 'filament energy', group: 'light' },
      exposure: { value: 1.4, min: 0.2, max: 4, step: 0.05, label: 'exposure', group: 'light' },
      ceiling: { value: 0.9, min: 0.3, max: 1, step: 0.01, label: 'ceiling', group: 'light' },
      floor: { value: 3, min: 0, max: 12, step: 1, label: 'black floor (code)', group: 'light' },
      dither: { value: 1, min: 0, max: 2, step: 0.1, label: 'dither (LSB)', group: 'light' },
    },
    closedGroups: ['light'],
    onReset: rebuild,
  });
  if (KIOSK && G.gui) G.gui.hide();

  // GenArt's "Save PNG (S)" calls window.saveCanvas: route it to the master, not the preview.
  window.saveCanvas = () => saveMaster();

  // ---------------------------------------------------------------- build
  let wallInfo = { w: 0, h: 0, fold: -1, label: '' };

  function rebuild() {
    const P = G.params;
    wallInfo = LEDWall.resolve(P.preset, P.customW, P.customH);
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
    scene = RL.makeScene(G.seed, {
      aspect: W / H, bundles: P.bundles, filaments: P.filaments | 0, spread: P.spread,
      crossing: P.crossing, warp: P.warp, ascent: P.ascent, accent: P.accent,
      motion: P.motion, ground: P.ground,
    });
    const need = scene.capacity * RL.STRIDE;
    if (!buf || buf.length < need) {
      buf = new Float32Array(need);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW);
    }
    if (TILE) renderAt(FIXED_T ?? 0.3, 0);
  }

  // ---------------------------------------------------------------- render
  function loopSeconds() { return G.params.loopMin * 60; }

  function renderAt(t, frame) {
    const P = G.params;
    count = RL.segments(scene, t, wall.width, wall.height, { palette: P.palette, intensity: P.intensity }, buf);
    wall.beginAccum();
    gl.useProgram(prog.p);
    gl.uniform2f(prog.uWall, wall.width, wall.height);
    gl.uniform1f(prog.uHalf, P.width / 2);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, count * RL.STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
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
    wall.state.insetRight = G.gui && !uiHidden && !KIOSK && innerWidth > 900
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
      `loop ${mmss(t * L)} / ${mmss(L)}${paused ? ' · paused' : ''} · ${count.toLocaleString()} straight lines · ${fpsAvg.toFixed(0)} fps${f.float ? '' : ' · 8-bit accumulation (no float FBO)'}`,
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
    download(await masterBlob(), `ruled-light-${G.seed}-${wall.width}x${wall.height}-t${t.toFixed(4)}.png`);
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
      piece: '055 Ruled Light', seed: G.seed, params: Object.assign({}, G.params),
      wall: { width: wall.width, height: wall.height, label: wallInfo.label },
      fps: exp.fps, loopFrames: N, range: [start, end],
      note: 'Frame f is the loop at t = f / loopFrames. Frame loopFrames equals frame 0, so the full range loops seamlessly.',
      encode: {
        prores: `ffmpeg -framerate ${exp.fps} -start_number ${start} -i frame_%06d.png -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le ruled-light-${G.seed}.mov`,
        hap: `ffmpeg -framerate ${exp.fps} -start_number ${start} -i frame_%06d.png -c:v hap -format hap_q ruled-light-${G.seed}-hap.mov`,
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
    } else if (k === 'r') G.randomize();
    else if (k === 's') saveMaster();
  });

  function fail(e) {
    errorEl.textContent = '⚠ ' + (e && e.message ? e.message : e);
    errorEl.hidden = false;
  }

  rebuild();
  requestAnimationFrame(tick);
})();
