// led.js — a small WebGL2 harness for pieces made for LED walls.
//
// A piece renders into a wall-sized framebuffer at the wall's native resolution (one texel = one
// LED). The harness then:
//   1. accumulates light additively in floating point (RGBA16F where supported),
//   2. finishes a master frame (RGBA8): soft clip in linear light → ceiling → sRGB encode →
//      seeded TPDF dither → black floor,
//   3. presents it: fit to the window, as a loupe of round emitters at the real pixel grid, or
//      1:1 for kiosk output to an LED controller.
//
// Why the black floor: LED processors reproduce the lowest few 8-bit codes poorly (flicker,
// colour shifts, uneven panels). Every lit pixel is pushed to at least `floor`, and anything
// that would land below half of it is sent to true black. Dither is applied only where there is
// light, so black stays black.
//
// Usage:
//   const wall = LEDWall.create(canvas, { kiosk });
//   wall.configure({ width, height, pitch, view, exposure, ceiling, floor, dither, fold });
//   wall.beginAccum();            // bound: accum FBO, viewport W×H, additive blending
//   ...draw with your own program in wall pixels...
//   wall.finish(frameIndex);      // master frame
//   wall.present();               // to the canvas
//   wall.readMaster();            // ImageData of the master (top row first)

(function (global) {
  'use strict';

  const PRESETS = [
    { label: 'Ribbon 7680×1080', w: 7680, h: 1080 },
    { label: 'Wide 5760×2160', w: 5760, h: 2160 },
    { label: 'UHD 3840×2160', w: 3840, h: 2160 },
    { label: 'HD 1920×1080', w: 1920, h: 1080 },
    { label: 'Corner 2 × 1920×1080', w: 3840, h: 1080, fold: 0.5 },
    { label: 'Custom (width × height)', w: 0, h: 0 },
  ];

  // {label: index} for a lil-gui / GenArt dropdown (values must be numbers for the URL).
  function presetOptions() {
    const o = {};
    PRESETS.forEach((p, i) => (o[p.label] = i));
    return o;
  }

  const VIEW = { FIT: 0, LOUPE: 1, NATIVE: 2 };

  const FS_TRI = `#version 300 es
  const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
  void main(){ gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;

  const TONEMAP = `#version 300 es
  precision highp float; precision highp int;
  uniform sampler2D uAccum;
  uniform float uExposure, uCeiling, uFloor, uDither;
  uniform uint uFrame;
  out vec4 o;
  uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
  float h01(uvec3 p){ return float(pcg(p.x ^ pcg(p.y ^ pcg(p.z)))) / 4294967295.0; }
  void main(){
    ivec2 ip = ivec2(gl_FragCoord.xy);
    vec3 E = max(texelFetch(uAccum, ip, 0).rgb, 0.0);
    vec3 v = (1.0 - exp(-uExposure * E)) * uCeiling;   // soft clip in linear light
    vec3 s = pow(v, vec3(1.0 / 2.2));                   // display encode
    float lit = step(1e-6, max(E.r, max(E.g, E.b)));
    uvec3 q = uvec3(uvec2(ip), uFrame);
    float n = h01(q) + h01(q + uvec3(0u, 0u, 0x9e3779b9u)) - 1.0;  // TPDF, ±1 LSB
    vec3 code = floor(s * 255.0 + n * uDither * lit + 0.5);
    code = clamp(code, 0.0, 255.0);
    vec3 keep = step(vec3(uFloor * 0.5), code) * step(0.5, code);
    code = keep * max(code, vec3(uFloor));
    o = vec4(code / 255.0, 1.0);
  }`;

  const PRESENT = `#version 300 es
  precision highp float;
  uniform sampler2D uMaster;
  uniform vec4 uRect;        // wall rect in device px (x0, y0 bottom-left, w, h)
  uniform vec2 uWall;        // wall size in LEDs
  uniform int uMode;         // 0 fit, 1 loupe, 2 native
  uniform float uFill;       // emitter diameter / pitch (loupe)
  uniform float uFold;       // fold position (0..1 of width), < 0 for none
  out vec4 o;
  void main(){
    vec2 uv = (gl_FragCoord.xy - uRect.xy) / uRect.zw;
    if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) {
      // outside the wall: dark surround with a hairline frame so the extent is visible
      vec2 d = max(uRect.xy - gl_FragCoord.xy, gl_FragCoord.xy - (uRect.xy + uRect.zw));
      float edge = (uMode == 2) ? 0. : step(max(d.x, d.y), 1.0);
      o = vec4(vec3(0.035 + 0.12 * edge), 1.); return;
    }
    vec2 lp = uv * uWall;  // position in LEDs
    vec3 c;
    if (uMode == 1) {
      ivec2 cell = ivec2(clamp(floor(lp), vec2(0.), uWall - 1.));
      float px = uRect.z / uWall.x;                 // device px per LED
      float d = length(fract(lp) - 0.5);
      float r = 0.5 * uFill;
      float m = clamp((r - d) * px + 0.5, 0., 1.);
      c = texelFetch(uMaster, cell, 0).rgb * m;
    } else if (uMode == 2) {
      c = texelFetch(uMaster, ivec2(lp), 0).rgb;
    } else {
      c = texture(uMaster, uv).rgb;
    }
    if (uFold >= 0. && uMode != 2) {
      float fx = abs(lp.x - uFold * uWall.x) * (uRect.z / uWall.x);
      float dash = step(0.5, fract(gl_FragCoord.y / 12.));
      c = mix(c, vec3(0.35, 0.5, 0.6), (1. - step(0.75, fx)) * dash * 0.6);
    }
    o = vec4(c, 1.);
  }`;

  function compile(gl, vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  function create(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required.');
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_float_blend');

    const progTone = compile(gl, FS_TRI, TONEMAP);
    const progShow = compile(gl, FS_TRI, PRESENT);
    const vaoEmpty = gl.createVertexArray();

    const st = {
      W: 0, H: 0, pitch: 2.5, view: VIEW.FIT, exposure: 1.4, ceiling: 0.9, floor: 3, dither: 1,
      fold: -1, fill: 0.62, kiosk: !!opts.kiosk, insetRight: 0, // device px reserved for a panel
      loupe: { zoom: 8, cx: 0, cy: 0 }, // zoom in device px per LED; centre in LEDs (y down)
    };
    let accTex, accFbo, mstTex, mstFbo, levels = 1;

    function alloc() {
      [accTex, mstTex].forEach((t) => t && gl.deleteTexture(t));
      [accFbo, mstFbo].forEach((f) => f && gl.deleteFramebuffer(f));
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (st.W > max || st.H > max) throw new Error(`Wall ${st.W}×${st.H} exceeds this GPU's texture limit (${max}).`);

      accTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, accTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, floatOK ? gl.RGBA16F : gl.RGBA8, st.W, st.H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      accFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accTex, 0);

      levels = 1 + Math.floor(Math.log2(Math.max(st.W, st.H)));
      mstTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mstTex);
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, st.W, st.H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      mstFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, mstFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mstTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function sizeCanvas() {
      const dpr = global.devicePixelRatio || 1;
      if (st.kiosk) {
        // 1:1 — one canvas device pixel per LED, anchored top-left for the controller to map
        canvas.width = st.W;
        canvas.height = st.H;
        canvas.style.width = st.W / dpr + 'px';
        canvas.style.height = st.H / dpr + 'px';
      } else {
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      }
    }

    function configure(cfg) {
      const W = Math.round(cfg.width), H = Math.round(cfg.height);
      const resized = W !== st.W || H !== st.H;
      Object.assign(st, {
        pitch: cfg.pitch ?? st.pitch, view: cfg.view ?? st.view, exposure: cfg.exposure ?? st.exposure,
        ceiling: cfg.ceiling ?? st.ceiling, floor: cfg.floor ?? st.floor, dither: cfg.dither ?? st.dither,
        fold: cfg.fold ?? -1, fill: cfg.fill ?? st.fill,
      });
      if (st.kiosk) st.view = VIEW.NATIVE;
      if (resized) {
        st.W = W; st.H = H;
        st.loupe.cx = W / 2; st.loupe.cy = H / 2;
        alloc();
      }
      sizeCanvas();
      return resized;
    }

    function beginAccum() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
      gl.viewport(0, 0, st.W, st.H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
    }

    function finish(frame) {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mstFbo);
      gl.viewport(0, 0, st.W, st.H);
      gl.useProgram(progTone.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, accTex);
      gl.uniform1i(progTone.u.uAccum, 0);
      gl.uniform1f(progTone.u.uExposure, st.exposure);
      gl.uniform1f(progTone.u.uCeiling, st.ceiling);
      gl.uniform1f(progTone.u.uFloor, st.floor);
      gl.uniform1f(progTone.u.uDither, st.dither);
      gl.uniform1ui(progTone.u.uFrame, (frame >>> 0) || 0);
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function rect() {
      const cw = canvas.width, ch = canvas.height;
      if (st.view === VIEW.NATIVE) return [0, ch - st.H, st.W, st.H];
      if (st.view === VIEW.LOUPE) {
        const z = st.loupe.zoom;
        return [cw / 2 - st.loupe.cx * z, ch / 2 - (st.H - st.loupe.cy) * z, st.W * z, st.H * z];
      }
      const aw = Math.max(1, cw - st.insetRight);
      const pad = Math.round(Math.min(aw, ch) * 0.04);
      const s = Math.min((aw - 2 * pad) / st.W, (ch - 2 * pad) / st.H);
      const w = st.W * s, h = st.H * s;
      return [(aw - w) / 2, (ch - h) / 2, w, h];
    }

    function present() {
      if (st.view === VIEW.FIT) {
        gl.bindTexture(gl.TEXTURE_2D, mstTex);
        gl.generateMipmap(gl.TEXTURE_2D); // a downscaled 8K wall must not shimmer in preview
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progShow.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mstTex);
      gl.uniform1i(progShow.u.uMaster, 0);
      gl.uniform4f(progShow.u.uRect, ...rect());
      gl.uniform2f(progShow.u.uWall, st.W, st.H);
      gl.uniform1i(progShow.u.uMode, st.view);
      gl.uniform1f(progShow.u.uFill, st.fill);
      gl.uniform1f(progShow.u.uFold, st.fold);
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function readMaster() {
      const W = st.W, H = st.H;
      const buf = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mstFbo);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = new Uint8ClampedArray(W * H * 4);
      const row = W * 4;
      for (let y = 0; y < H; y++) out.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      return new ImageData(out, W, H);
    }

    // Physical facts for the overlay. Rules of thumb, stated as such: minimum viewing distance
    // in metres ≈ pitch in millimetres; a comfortable distance is about 2–3× that.
    function facts() {
      const mm = st.pitch;
      return {
        widthM: (st.W * mm) / 1000,
        heightM: (st.H * mm) / 1000,
        minViewM: mm,
        comfortM: [2 * mm, 3 * mm],
        megapixels: (st.W * st.H) / 1e6,
        float: floatOK,
      };
    }

    // Loupe navigation: drag to pan, wheel to zoom, both in LED units.
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (st.view !== VIEW.LOUPE) return;
      drag = { x: e.clientX, y: e.clientY, cx: st.loupe.cx, cy: st.loupe.cy };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dpr = global.devicePixelRatio || 1, z = st.loupe.zoom;
      st.loupe.cx = Math.min(st.W, Math.max(0, drag.cx - ((e.clientX - drag.x) * dpr) / z));
      st.loupe.cy = Math.min(st.H, Math.max(0, drag.cy - ((e.clientY - drag.y) * dpr) / z));
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener('wheel', (e) => {
      if (st.view !== VIEW.LOUPE) return;
      e.preventDefault();
      st.loupe.zoom = Math.min(40, Math.max(1, st.loupe.zoom * Math.exp(-e.deltaY * 0.0015)));
    }, { passive: false });
    // In fit view, a double-click asks the piece to open the loupe at that LED.
    canvas.addEventListener('dblclick', (e) => {
      if (st.view !== VIEW.FIT || !opts.onLoupeRequest) return;
      const dpr = global.devicePixelRatio || 1;
      const [x0, y0, w, h] = rect();
      const fx = e.clientX * dpr, fy = canvas.height - e.clientY * dpr;
      st.loupe.cx = ((fx - x0) / w) * st.W;
      st.loupe.cy = (1 - (fy - y0) / h) * st.H;
      opts.onLoupeRequest();
    });
    global.addEventListener('resize', sizeCanvas);

    return {
      gl, configure, beginAccum, finish, present, readMaster, facts,
      get width() { return st.W; },
      get height() { return st.H; },
      get floatAccum() { return floatOK; },
      state: st,
    };
  }

  // Resolve a wall size from a preset index and custom fallbacks.
  function resolve(presetIndex, customW, customH) {
    const p = PRESETS[presetIndex | 0] || PRESETS[0];
    if (!p.w) return { w: Math.round(customW), h: Math.round(customH), fold: -1, label: `Custom ${customW}×${customH}` };
    return { w: p.w, h: p.h, fold: p.fold ?? -1, label: p.label };
  }

  global.LEDWall = { create, resolve, presetOptions, PRESETS, VIEW };
})(window);
