// Poured Ground — liquid paint spread on a sheet, after the "foundation" method of
// mofu-dev.com (Stable Fluids velocity + per-pigment height maps + trace history + normal
// shading), coloured from colorlisa.com palettes and rendered to giclée-ready files.
//
//   step:   force → advect velocity → divergence → pressure (Jacobi) → project
//           → height (4 pigments, RGBA32F) → trace history (max of coverage)
//   render: cubic B-spline height (value + analytic gradient) → normal → Kubelka–Munk mix
//           over the ground → key light + gloss → sRGB
//
// Keys: R new seed · G new seed and settings · P export print · S save preview
//       1–4 choose pigment · drag to push paint · shift-click to pour
(function () {
  'use strict';
  const PG = window.PouredGround, PALS = window.PALETTES;

  // ---------------------------------------------------------------- GL setup
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
  if (!gl) throw new Error('WebGL2 is required');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is required (float render targets)');
  const MAXTEX = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);

  const VS = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

  const HEAD = `#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 vUv; out vec4 o;
  uniform vec2 uSize;    // grid size in cells
  uniform vec2 uAspect;  // size / min(size): short-side units → uv is / uAspect
  const float DT = 1.0/60.0;
  vec4 bilin(sampler2D t, vec2 uv){           // manual bilinear: no float-linear extension needed
    vec2 p = uv*uSize - 0.5; vec2 i = floor(p); vec2 f = p - i;
    ivec2 m = ivec2(uSize) - 1;
    ivec2 a = clamp(ivec2(i), ivec2(0), m), b = clamp(ivec2(i)+1, ivec2(0), m);
    vec4 v00 = texelFetch(t, a, 0), v10 = texelFetch(t, ivec2(b.x,a.y), 0);
    vec4 v01 = texelFetch(t, ivec2(a.x,b.y), 0), v11 = texelFetch(t, b, 0);
    return mix(mix(v00,v10,f.x), mix(v01,v11,f.x), f.y);
  }`;

  const FS = {
    // finger: velocity pulled toward the finger's velocity inside a soft capsule
    force: HEAD + `
    uniform sampler2D uVel; uniform vec2 uA, uB, uTarget; uniform float uR, uAmt;
    void main(){
      vec2 v = texture(uVel, vUv).xy;
      vec2 p = vUv*uAspect, a = uA*uAspect, b = uB*uAspect, ab = b-a;
      float h = clamp(dot(p-a, ab)/max(dot(ab,ab),1e-9), 0., 1.);
      vec2 d = p - (a + ab*h);
      float g = exp(-dot(d,d)/(uR*uR));
      o = vec4(mix(v, uTarget, clamp(g*uAmt,0.,1.)), 0., 1.);
    }`,
    advect: HEAD + `
    uniform sampler2D uVel; uniform float uDamp;
    void main(){
      vec2 v = texture(uVel, vUv).xy;
      vec2 nv = texture(uVel, vUv - v*DT/uAspect).xy * uDamp;
      vec2 c = vUv*uSize; // walls: no flow in the outermost cell
      if (c.x < 1. || c.y < 1. || c.x > uSize.x-1. || c.y > uSize.y-1.) nv = vec2(0);
      o = vec4(nv, 0., 1.);
    }`,
    divergence: HEAD + `
    uniform sampler2D uVel;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float L = texelFetch(uVel, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uVel, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uVel, clamp(c-ivec2(0,1),ivec2(0),m),0).y, T = texelFetch(uVel, clamp(c+ivec2(0,1),ivec2(0),m),0).y;
      o = vec4(0.5*(R-L+T-B), 0., 0., 1.);
    }`,
    pressure: HEAD + `
    uniform sampler2D uP, uDiv;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float L = texelFetch(uP, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uP, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uP, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uP, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      o = vec4((L+R+B+T - texelFetch(uDiv,c,0).x)*0.25, 0., 0., 1.);
    }`,
    project: HEAD + `
    uniform sampler2D uVel, uP;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float L = texelFetch(uP, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uP, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uP, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uP, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      o = vec4(texelFetch(uVel,c,0).xy - 0.5*vec2(R-L, T-B), 0., 1.);
    }`,
    scale: HEAD + `uniform sampler2D uT; uniform float uK;
    void main(){ o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0)*uK; }`,
    // mofu height.frag, four pigments at once: paint leaves where the flow is strong and
    // arrives from the backtraced source; a little levelling smooths the film
    height: HEAD + `
    uniform sampler2D uH, uVel; uniform vec2 uTh; uniform float uK, uLevel;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      vec2 v = texture(uVel, vUv).xy;
      float s0 = smoothstep(uTh.x, uTh.y, length(v));
      vec2 src = vUv - v*DT/uAspect;
      float s1 = smoothstep(uTh.x, uTh.y, length(texture(uVel, src).xy));
      vec4 h0 = texelFetch(uH, c, 0), hs = bilin(uH, src);
      vec4 h = max(vec4(0), h0 - min(h0, s0*uK*h0) + min(hs, s1*uK*hs));
      vec4 nb = texelFetch(uH, clamp(c-ivec2(1,0),ivec2(0),m),0) + texelFetch(uH, clamp(c+ivec2(1,0),ivec2(0),m),0)
              + texelFetch(uH, clamp(c-ivec2(0,1),ivec2(0),m),0) + texelFetch(uH, clamp(c+ivec2(0,1),ivec2(0),m),0);
      o = mix(h, nb*0.25, uLevel*max(s0, s1));   // only moving paint levels; a resting film keeps its edge
    }`,
    // mofu alpha.frag: the historical maximum of coverage, per pigment
    history: HEAD + `
    uniform sampler2D uHist, uH;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      o = max(texelFetch(uHist,c,0), smoothstep(vec4(0), vec4(0.01/0.7), texelFetch(uH,c,0)));
    }`,
    // a laid field (rectangle or ellipse): covers whatever paint lies beneath, then lays its own
    // pigment as a flat slab with a bevelled shoulder (the shoulder is what catches the light).
    // uMask = 0 clears to the ground (a cut-out).
    zone: HEAD + `
    uniform sampler2D uH; uniform vec2 uC, uHalf; uniform float uAng, uShape, uTh; uniform vec4 uMask;
    void main(){
      vec2 p = (vUv - uC)*uAspect;
      float c = cos(uAng), s = sin(uAng);
      vec2 q = vec2(c*p.x + s*p.y, -s*p.x + c*p.y);
      float d;
      if (uShape < 0.5) { vec2 dd = abs(q) - uHalf; d = length(max(dd, 0.)) + min(max(dd.x, dd.y), 0.); }
      else d = (length(q/uHalf) - 1.) * min(uHalf.x, uHalf.y);
      float m = 1. - smoothstep(-0.0015, 0.0015, d);
      float hh = uTh * smoothstep(0., 0.01, -d);
      o = texelFetch(uH, ivec2(gl_FragCoord.xy), 0)*(1. - m) + uMask*hh;
    }`,
    // mofu initialHeight.frag profile, added into one pigment channel
    pour: HEAD + `
    uniform sampler2D uH; uniform vec2 uC; uniform float uR, uK; uniform vec4 uMask;
    void main(){
      float d = length((vUv-uC)*uAspect)/uR;
      float s = smoothstep(0., 1., d);
      float hh = sqrt(max(0., (1. - s*s)/12.));
      hh = smoothstep(0., 0.025, hh) * hh * 0.66;
      o = texelFetch(uH, ivec2(gl_FragCoord.xy), 0) + uMask*hh*uK;   // uK < 1: a flatter dab
    }`,
  };

  // render: one pass, any output size. Output pixel → sheet uv → image uv → sim.
  const RENDER = `#version 300 es
  precision highp float; precision highp sampler2D;
  out vec4 o;
  uniform sampler2D uH, uHist;
  uniform vec2 uSize, uAspect;
  uniform vec2 uOut;          // output size in px (whole sheet)
  uniform vec2 uOrigin;       // this tile's top-left in output px
  uniform float uTileH;
  uniform vec4 uImg;          // image rect in sheet uv (x0, y0, x1, y1), y down
  uniform float uPxPerMM;
  uniform vec3 uGround, uPaper;
  uniform vec3 uKS[4];        // Kubelka–Munk K/S per pigment (linear RGB)
  uniform float uRelief, uGloss, uTooth, uLinearOut;
  uniform float uSeed;

  float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423) + uSeed*0.0001); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  // paper tooth: fixed in millimetres, so it prints the same at any dpi; faded out where a
  // screen pixel is too large to show it
  float tooth(vec2 mm){
    float n = vnoise(mm*7.0)*0.55 + vnoise(mm*19.0)*0.3 + vnoise(mm*2.3)*0.15 - 0.5;
    return n * uTooth * smoothstep(1.5, 5.0, uPxPerMM);
  }

  void bspline(float t, out vec4 w, out vec4 d){
    float t2 = t*t, t3 = t2*t, s = 1.-t;
    w = vec4(s*s*s, 3.*t3 - 6.*t2 + 4., -3.*t3 + 3.*t2 + 3.*t + 1., t3)/6.;
    d = vec4(-0.5*s*s, 1.5*t2 - 2.*t, -1.5*t2 + t + 0.5, 0.5*t2);
  }
  // cubic B-spline: smooth (C2) height so normals stay smooth when a 1k grid prints at 10k px
  void sampleCubic(vec2 uv, out vec4 H, out vec4 Hx, out vec4 Hy, out vec4 Q){
    vec2 p = uv*uSize - 0.5, i = floor(p), f = p - i;
    vec4 wx, dx, wy, dy; bspline(f.x, wx, dx); bspline(f.y, wy, dy);
    ivec2 m = ivec2(uSize)-1, b = ivec2(i) - 1;
    H = vec4(0); Hx = vec4(0); Hy = vec4(0); Q = vec4(0);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      ivec2 c = clamp(b + ivec2(x,y), ivec2(0), m);
      vec4 h = texelFetch(uH, c, 0), q = texelFetch(uHist, c, 0);
      float W = wx[x]*wy[y];
      H += h*W; Q += q*W; Hx += h*dx[x]*wy[y]; Hy += h*wx[x]*dy[y];
    }
  }
  vec3 ks2r(vec3 ks){ return 1. + ks - sqrt(ks*ks + 2.*ks); }
  vec3 srgb(vec3 c){ c = clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }

  void main(){
    vec2 px = vec2(uOrigin.x + gl_FragCoord.x, uOrigin.y + (uTileH - gl_FragCoord.y));
    vec2 su = px / uOut;                         // sheet uv, y down
    vec2 mm = px / uPxPerMM;
    vec3 col;
    if (su.x < uImg.x || su.y < uImg.y || su.x > uImg.z || su.y > uImg.w) {
      col = uPaper * (1. + tooth(mm));
    } else {
      vec2 iu = (su - uImg.xy) / (uImg.zw - uImg.xy);
      vec2 uv = vec2(iu.x, 1. - iu.y);            // sim textures: y up
      vec4 H, Hx, Hy, Q; sampleCubic(uv, H, Hx, Hy, Q);
      float total = H.x+H.y+H.z+H.w;
      // gradient of total thickness per short-side unit
      float minS = min(uSize.x, uSize.y);
      vec2 g = vec2(Hx.x+Hx.y+Hx.z+Hx.w, Hy.x+Hy.y+Hy.z+Hy.w) * minS;
      vec3 N = normalize(vec3(-g*uRelief, 1.));
      // coverage, per pigment: mofu's alpha = 0.5·(trace history) + 0.5·(present film), both
      // near-binary at sim scale. Here each is thresholded on the smooth cubic field and
      // anti-aliased over one *output* pixel (fwidth), so edges stay crisp at any dpi.
      vec4 fwH = max(fwidth(H), vec4(1e-7)), fwQ = max(fwidth(Q), vec4(1e-5));
      vec4 film  = smoothstep(vec4(0.004) - fwH, vec4(0.004) + fwH, H);
      vec4 stain = smoothstep(vec4(0.5) - fwQ, vec4(0.5) + fwQ, Q);
      vec4 a4 = 0.5*max(stain, film) + 0.5*film;
      float A = max(max(a4.x,a4.y), max(a4.z,a4.w));
      // Kubelka–Munk: mix absorption/scatter weighted by thickness; stains weigh in where thin
      vec4 w = max(H, vec4(0)) + 0.015*a4;
      float ws = w.x+w.y+w.z+w.w;
      vec3 ks = ws > 1e-6 ? (uKS[0]*w.x + uKS[1]*w.y + uKS[2]*w.z + uKS[3]*w.w)/ws : uKS[0];
      vec3 paint = ks2r(ks);
      // a thin film lets the ground through
      float hide = 1. - exp(-total*40.);
      float cover = A * mix(0.9, 1., hide);
      vec3 ground = uGround * (1. + tooth(mm));
      vec3 base = mix(ground, paint, cover);
      // light: flat paint renders as its palette colour exactly; relief adds key light and gloss
      vec3 L = normalize(vec3(-0.45, 0.55, 0.70)), Hh = normalize(L + vec3(0,0,1));
      float shade = 1. + 0.9*(dot(N,L) - L.z);
      float sh = 70.;
      float spec = max(0., pow(max(dot(N,Hh),0.), sh) - pow(Hh.z, sh));
      col = base*mix(1., shade, cover) + uGloss*spec*cover*vec3(1.);
    }
    if (uLinearOut > 0.5) { o = vec4(srgb(col), 1.); return; }
    vec3 s = srgb(col);
    s += (hash(px + 0.37) - hash(px + 7.1)) / 255.;   // triangular dither for 8-bit
    o = vec4(s, 1.);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VS);
  function program(fs, vsrc) {
    const p = gl.createProgram();
    gl.attachShader(p, vsrc ? compile(gl.VERTEX_SHADER, vsrc) : vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }
  const P = {};
  for (const k in FS) P[k] = program(FS[k]);
  P.render = program(RENDER, `#version 300 es
  in vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function target(w, h, fmt, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t: t, f: f, w: w, h: h };
  }
  function pair(w, h, fmt, filter) {
    const p = { a: target(w, h, fmt, filter), b: target(w, h, fmt, filter) };
    p.swap = function () { const x = p.a; p.a = p.b; p.b = x; };
    p.free = function () { [p.a, p.b].forEach(function (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }); };
    return p;
  }

  // ---------------------------------------------------------------- state
  let S = null;          // simulation: textures, score, clock
  let G = null;          // GenArt harness
  let simKey = '';
  let dirty = true;
  let exporting = false;
  let handTouched = false;
  let pigment = 0;

  const PAL_OPTIONS = { '— chosen by seed —': -1 };
  PALS.forEach(function (p) { PAL_OPTIONS[p.artist + ' · ' + p.painting] = p.id; });
  const FMT_OPTIONS = {}; PG.FORMAT_KEYS.forEach(function (k, i) { FMT_OPTIONS[k] = i; });

  function paletteFor(seed) {
    const id = G.param('palette');
    if (id >= 0) return PALS[id];
    return PALS[GenArt._mulberry32(seed ^ 0x9e3779b9)() * PALS.length | 0];
  }

  function bind(prog, tex) {
    gl.useProgram(prog.p);
    let unit = 0;
    for (const name in tex) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex[name]);
      gl.uniform1i(prog.u[name], unit++);
    }
    if (prog.u.uSize) gl.uniform2f(prog.u.uSize, S.w, S.h);
    if (prog.u.uAspect) gl.uniform2f(prog.u.uAspect, S.aspect[0], S.aspect[1]);
  }
  function run(dst) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------------------------------------------------------------- build
  function build() {
    const sh = PG.sheet(G.param('format'), G.param('landscape') === 1, G.param('border'), 300);
    const long = G.param('simres');
    const a = sh.aspect, big = Math.max(a[0], a[1]);
    const w = Math.max(64, Math.round(long * a[0] / big)), h = Math.max(64, Math.round(long * a[1] / big));
    if (S) { S.vel.free(); S.p.free(); S.hgt.free(); S.hist.free(); gl.deleteTexture(S.div.t); gl.deleteFramebuffer(S.div.f); }
    const rng = G.rng;
    const pal = paletteFor(G.seed);
    // mode 0, after the work: the palette's brief sets the ground, the fields and the gestures.
    // mode 1, free gestures: the palette's colours with the seeded gesture styles.
    const brief = G.param('mode') === 0 ? window.BRIEFS[pal.id] : null;
    const cols = brief ? PG.briefColours(pal.colors, brief) : PG.assignColours(pal.colors, G.param('ground'), rng);
    const score = brief
      ? PG.composeBrief(rng, brief, { energy: G.param('energy'), aspect: a })
      : PG.compose(rng, { style: G.param('style'), pours: G.param('pours'), energy: G.param('energy'), aspect: a });
    S = {
      w: w, h: h, aspect: a, sheet: sh, palette: pal, colours: cols, score: score, brief: brief,
      t: 0, live: 0,
      vel: pair(w, h, gl.RGBA16F, gl.LINEAR),
      p: pair(w, h, gl.RGBA16F, gl.NEAREST),
      div: target(w, h, gl.RGBA16F, gl.NEAREST),
      hgt: pair(w, h, gl.RGBA32F, gl.NEAREST),
      hist: pair(w, h, gl.RGBA16F, gl.NEAREST),
      pours: {},
    };
    for (const e of score.events) if (e.type === 'pour' || e.type === 'zone') (S.pours[e.t] = S.pours[e.t] || []).push(e);
    handTouched = false;
    updateCaption();
    dirty = true;
  }

  function zone(e) {
    const u = P.zone.u;
    bind(P.zone, { uH: S.hgt.a.t });
    gl.uniform2f(u.uC, e.cx, e.cy); gl.uniform2f(u.uHalf, Math.max(1e-4, e.hx), Math.max(1e-4, e.hy));
    gl.uniform1f(u.uAng, e.ang); gl.uniform1f(u.uShape, e.shape); gl.uniform1f(u.uTh, e.th);
    gl.uniform4f(u.uMask, e.chan === 0 ? 1 : 0, e.chan === 1 ? 1 : 0, e.chan === 2 ? 1 : 0, e.chan === 3 ? 1 : 0);
    run(S.hgt.b); S.hgt.swap();
  }
  function after() { // "after A Bigger Splash, David Hockney" — the work this generation follows
    return S.brief ? 'after ' + S.palette.painting + ', ' + S.palette.artist : null;
  }

  function pour(x, y, r, pig, k) {
    bind(P.pour, { uH: S.hgt.a.t });
    gl.uniform2f(P.pour.u.uC, x, y); gl.uniform1f(P.pour.u.uR, r); gl.uniform1f(P.pour.u.uK, k === undefined ? 1 : k);
    gl.uniform4f(P.pour.u.uMask, pig === 0 ? 1 : 0, pig === 1 ? 1 : 0, pig === 2 ? 1 : 0, pig === 3 ? 1 : 0);
    run(S.hgt.b); S.hgt.swap();
  }
  function finger(a, b, r, amt) {
    // finger velocity in short-side units per second
    const tv = [(b[0] - a[0]) * S.aspect[0] * PG.FPS, (b[1] - a[1]) * S.aspect[1] * PG.FPS];
    bind(P.force, { uVel: S.vel.a.t });
    gl.uniform2f(P.force.u.uA, a[0], a[1]); gl.uniform2f(P.force.u.uB, b[0], b[1]);
    gl.uniform2f(P.force.u.uTarget, tv[0], tv[1]);
    gl.uniform1f(P.force.u.uR, r); gl.uniform1f(P.force.u.uAmt, amt);
    run(S.vel.b); S.vel.swap();
  }

  const handQueue = [];
  function step() {
    const t = S.t;
    if (S.pours[t]) for (const e of S.pours[t]) { if (e.type === 'zone') zone(e); else pour(e.x, e.y, e.r, e.pig, e.k); }
    for (const e of S.score.events) {
      if (e.type !== 'drag' || t < e.t0 || t > e.t1) continue;
      const p1 = PG.dragAt(e, t), p0 = PG.dragAt(e, Math.max(e.t0, t - 1));
      const u = (t - e.t0) / (e.t1 - e.t0);
      finger(p0, p1, e.r, e.amt * Math.min(1, Math.min(u, 1 - u) * 12 + 0.15));
    }
    while (handQueue.length) {
      const h = handQueue.shift();
      if (h.type === 'pour') pour(h.x, h.y, h.r, h.pig); else finger(h.a, h.b, h.r, 0.9);
    }
    bind(P.advect, { uVel: S.vel.a.t }); gl.uniform1f(P.advect.u.uDamp, G.param('flow'));
    run(S.vel.b); S.vel.swap();
    bind(P.divergence, { uVel: S.vel.a.t }); run(S.div);
    bind(P.scale, { uT: S.p.a.t }); gl.uniform1f(P.scale.u.uK, 0.8); run(S.p.b); S.p.swap();
    const iters = G.param('iterations');
    for (let i = 0; i < iters; i++) { bind(P.pressure, { uP: S.p.a.t, uDiv: S.div.t }); run(S.p.b); S.p.swap(); }
    bind(P.project, { uVel: S.vel.a.t, uP: S.p.a.t }); run(S.vel.b); S.vel.swap();
    bind(P.height, { uH: S.hgt.a.t, uVel: S.vel.a.t });
    gl.uniform2f(P.height.u.uTh, 0.02, 0.22);
    gl.uniform1f(P.height.u.uK, 0.3);
    gl.uniform1f(P.height.u.uLevel, G.param('levelling'));
    run(S.hgt.b); S.hgt.swap();
    bind(P.history, { uHist: S.hist.a.t, uH: S.hgt.a.t }); run(S.hist.b); S.hist.swap();
    S.t++;
  }

  // ---------------------------------------------------------------- render
  function linRGB(hex) { return PG.hexToSRGB(hex).map(PG.toLinear); }
  function setRenderUniforms(outW, outH, pxPerMM, linearOut) {
    const u = P.render.u, sh = S.sheet;
    bind(P.render, { uH: S.hgt.a.t, uHist: S.hist.a.t });
    gl.uniform2f(u.uOut, outW, outH);
    gl.uniform4f(u.uImg, sh.borderMM / sh.mm[0], sh.borderMM / sh.mm[1], 1 - sh.borderMM / sh.mm[0], 1 - sh.borderMM / sh.mm[1]);
    gl.uniform1f(u.uPxPerMM, pxPerMM);
    const g = linRGB(S.colours.ground);
    gl.uniform3f(u.uGround, g[0], g[1], g[2]);
    const pp = linRGB(PG.PAPER);
    gl.uniform3f(u.uPaper, pp[0], pp[1], pp[2]);
    const ks = [];
    S.colours.pigments.forEach(function (hex) {
      linRGB(hex).forEach(function (r) { r = Math.min(0.995, Math.max(0.003, r)); ks.push((1 - r) * (1 - r) / (2 * r)); });
    });
    gl.uniform3fv(u.uKS, new Float32Array(ks));
    gl.uniform1f(u.uRelief, G.param('relief'));
    gl.uniform1f(u.uGloss, G.param('gloss'));
    gl.uniform1f(u.uTooth, G.param('tooth'));
    gl.uniform1f(u.uLinearOut, linearOut ? 1 : 0);
    gl.uniform1f(u.uSeed, G.seed % 100000);
  }

  let view = { x: 0, y: 0, w: 1, h: 1 };
  function resize() {
    // the canvas fills its container: the whole window on the piece, the stage in the studio
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    dirty = true;
  }
  function drawScreen() {
    const sh = S.sheet, pad = 28 * (canvas.width / Math.max(1, canvas.clientWidth));
    const k = Math.min((canvas.width - 2 * pad) / sh.mm[0], (canvas.height - 2 * pad) / sh.mm[1]);
    const w = Math.round(sh.mm[0] * k), h = Math.round(sh.mm[1] * k);
    view = { x: Math.round((canvas.width - w) / 2), y: Math.round((canvas.height - h) / 2), w: w, h: h };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.043, 0.043, 0.055, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    setRenderUniforms(w, h, k, false);
    gl.viewport(view.x, canvas.height - view.y - h, w, h);
    // uOrigin/uTileH map gl_FragCoord (window space) → sheet px
    gl.uniform2f(P.render.u.uOrigin, -view.x, 0);
    gl.uniform1f(P.render.u.uTileH, canvas.height - view.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------------------------------------------------------------- loop
  function frame() {
    if (!exporting && S) {
      const spf = G.param('speed');
      let stepped = false;
      for (let i = 0; i < spf; i++) {
        if (S.t < S.score.steps || S.live > 0 || handQueue.length) { step(); stepped = true; if (S.live > 0) S.live--; }
      }
      if (stepped) dirty = true;
      if (dirty) { drawScreen(); dirty = false; }
      progress.style.width = (100 * Math.min(1, S.t / S.score.steps)) + '%';
      progress.parentNode.classList.toggle('done', S.t >= S.score.steps);
    }
    requestAnimationFrame(frame);
  }
  function finishSim() { while (S.t < S.score.steps) step(); dirty = true; }

  // ---------------------------------------------------------------- export
  const status = document.getElementById('status');
  const progress = document.getElementById('bar');
  function say(msg) { status.textContent = msg || ''; status.hidden = !msg; }

  function filename(ext) {
    const p = S.palette;
    return ('poured-ground-' + p.artist + '-' + G.seed).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') + ext;
  }
  function provenance(dpi, bits, W, H) {
    const p = S.palette;
    return {
      Title: 'Poured Ground' + (S.brief ? ' — ' + after() : '') + ', seed ' + G.seed,
      Author: 'dmaris70 / generative-art',
      Software: 'Poured Ground (projects/060-poured-ground), WebGL2',
      Source: 'Palette: colorlisa.com - ' + p.artist + ', ' + p.painting + ' [' + p.colors.join(' ') + ']',
      Description: (S.brief ? 'Composition after the work: ' + S.brief.note + ' (' + (S.brief.k ? 'layout follows the documented composition' : 'layout inferred from the title and the artist\'s typical structure') + '). No image of the work is used; only its five colorlisa colours and a description of its layout. ' : 'Free gestures. ') +
        'Ground ' + S.colours.ground + '; pigments ' + S.colours.pigments.join(' ') + '. Sheet ' + S.sheet.name +
        (G.param('landscape') ? ' landscape' : ' portrait') + ', border ' + S.sheet.borderMM.toFixed(1) + ' mm, ' + W + '×' + H + ' px at ' + dpi + ' dpi, ' + bits + '-bit sRGB.' +
        (handTouched ? ' Hand-touched: contains marks made by pointer, not reproducible from the URL.' : ' Reproducible from the URL below.'),
      Comment: location.href,
    };
  }

  async function exportImage(dpi, bits, label) {
    if (exporting) return;
    exporting = true;
    try {
      finishSim();
      const sh = PG.sheet(G.param('format'), G.param('landscape') === 1, G.param('border'), dpi);
      const W = sh.px[0], H = sh.px[1];
      const pxPerMM = dpi / 25.4;
      const writer = PNGStream.createWriter({ width: W, height: H, bitDepth: bits, dpi: dpi, text: provenance(dpi, bits, W, H) });
      const tileW = Math.min(W, MAXTEX, 4096), stripH = Math.max(16, Math.min(256, Math.floor(16e6 / (W * 4))));
      const fbo = target(tileW, stripH, bits === 16 ? gl.RGBA32F : gl.RGBA8, gl.NEAREST);
      const tile = bits === 16 ? new Float32Array(tileW * stripH * 4) : new Uint8Array(tileW * stripH * 4);
      const t0 = performance.now();
      for (let y0 = 0; y0 < H; y0 += stripH) {
        const sH = Math.min(stripH, H - y0);
        const rows = bits === 16 ? new Uint16Array(W * sH * 3) : new Uint8Array(W * sH * 3);
        for (let x0 = 0; x0 < W; x0 += tileW) {
          const tW = Math.min(tileW, W - x0);
          setRenderUniforms(W, H, pxPerMM, bits === 16);
          gl.uniform2f(P.render.u.uOrigin, x0, y0);
          gl.uniform1f(P.render.u.uTileH, sH);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.f);
          gl.viewport(0, 0, tW, sH);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(0, 0, tW, sH, gl.RGBA, bits === 16 ? gl.FLOAT : gl.UNSIGNED_BYTE, tile);
          for (let r = 0; r < sH; r++) {
            const src = (sH - 1 - r) * tW * 4, dst = (r * W + x0) * 3; // readPixels is bottom-up
            for (let x = 0; x < tW; x++) {
              const s = src + x * 4, d = dst + x * 3;
              if (bits === 16) {
                rows[d] = Math.round(Math.min(1, Math.max(0, tile[s])) * 65535);
                rows[d + 1] = Math.round(Math.min(1, Math.max(0, tile[s + 1])) * 65535);
                rows[d + 2] = Math.round(Math.min(1, Math.max(0, tile[s + 2])) * 65535);
              } else { rows[d] = tile[s]; rows[d + 1] = tile[s + 1]; rows[d + 2] = tile[s + 2]; }
            }
          }
        }
        await writer.writeRows(rows, sH);
        say(label + ' — ' + W + '×' + H + ' px, ' + Math.round(100 * (y0 + sH) / H) + '%');
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      gl.deleteTexture(fbo.t); gl.deleteFramebuffer(fbo.f);
      say(label + ' — compressing…');
      const blob = await writer.finish();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename(dpi >= 150 ? '-' + dpi + 'dpi-' + bits + 'bit.png' : '-preview.png');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      window.__lastExport = { width: W, height: H, bits: bits, dpi: dpi, bytes: blob.size, ms: Math.round(performance.now() - t0) };
      say(label + ' — saved ' + W + '×' + H + ' px, ' + (blob.size / 1048576).toFixed(1) + ' MB');
      setTimeout(function () { say(''); }, 4000);
    } catch (err) {
      say('Export failed: ' + err.message);
      throw err;
    } finally {
      exporting = false; dirty = true;
    }
  }
  function exportPrint() { return exportImage(G.param('dpi'), G.param('bits'), 'Print'); }
  function exportPreview() {
    // ~2400 px on the long side, 8-bit
    const sh = PG.sheet(G.param('format'), G.param('landscape') === 1, G.param('border'), 1);
    const dpi = Math.max(20, Math.round(2400 / (Math.max(sh.mm[0], sh.mm[1]) / 25.4)));
    return exportImage(dpi, 8, 'Preview');
  }
  window.saveCanvas = function () { exportPreview(); }; // the harness's "Save PNG" button

  // ---------------------------------------------------------------- caption
  const cap = document.getElementById('caption');
  function swatch(hex) { return '<i style="background:' + hex + '" title="' + hex + '"></i>'; }
  function updateCaption() {
    window.dispatchEvent(new CustomEvent('pouredground:update'));
    if (!cap) return;
    const p = S.palette, c = S.colours;
    const sh = PG.sheet(G.param('format'), G.param('landscape') === 1, G.param('border'), G.param('dpi'));
    cap.innerHTML =
      '<b>Poured Ground</b>' + (S.brief ? ' — <em>' + after() + '</em>' : '') + ' · seed ' + G.seed + '<br>' +
      (S.brief ? '<span class="src">' + S.brief.note + (S.brief.k ? '' : ' (layout inferred)') + '</span><br>' : '') +
      'palette: ' + p.artist + ', <em>' + p.painting + '</em> <span class="src">(colorlisa.com)</span><br>' +
      '<span class="sw">ground ' + swatch(c.ground) + ' paint ' + c.pigments.map(function (h, i) { return '<span class="pig' + (i === pigment ? ' on' : '') + '">' + (i + 1) + swatch(h) + '</span>'; }).join('') + '</span><br>' +
      '<span class="src">print ' + sh.name + ' · ' + sh.px[0] + '×' + sh.px[1] + ' px @ ' + G.param('dpi') + ' dpi · ' + G.param('bits') + '-bit · sim ' + S.w + '×' + S.h + '</span>';
  }

  // ---------------------------------------------------------------- pointer
  let last = null;
  function toUV(e) {
    const box = canvas.getBoundingClientRect(), dpr = canvas.width / box.width, sh = S.sheet;
    const sx = ((e.clientX - box.left) * dpr - view.x) / view.w, sy = ((e.clientY - box.top) * dpr - view.y) / view.h;
    const b0 = sh.borderMM / sh.mm[0], b1 = sh.borderMM / sh.mm[1];
    return [(sx - b0) / (1 - 2 * b0), 1 - (sy - b1) / (1 - 2 * b1)];
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!S || exporting) return;
    const u = toUV(e);
    handTouched = true;
    if (e.shiftKey) { handQueue.push({ type: 'pour', x: u[0], y: u[1], r: 0.08, pig: pigment }); S.live = Math.max(S.live, 30); return; }
    last = u; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!last) return;
    const u = toUV(e);
    handQueue.push({ type: 'drag', a: last, b: u, r: 0.05 });
    last = u; S.live = 120;
  });
  addEventListener('pointerup', function () { last = null; });

  addEventListener('keydown', function (e) {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') G.randomize();
    else if (k === 'g') generate();
    else if (k === 'p') exportPrint();
    else if (k === 's') exportPreview();
    else if (k.length === 1 && '1234'.indexOf(k) >= 0) { pigment = +k - 1; updateCaption(); }
  });
  function generate() {
    G.shuffle(function (key) {
      // a new composition; the print setup (format, border, dpi, bits) and quality settings stay
      if (['format', 'landscape', 'border', 'dpi', 'bits', 'simres', 'iterations', 'speed'].indexOf(key) >= 0) return G.param(key);
      if (key === 'palette') return -1;
      if (key === 'mode') return G.param('mode');
      if (key === 'flow') return 0.97 + Math.random() * 0.025;
      return undefined;
    });
  }

  // ---------------------------------------------------------------- harness
  const SIM_KEYS = ['mode', 'palette', 'ground', 'style', 'pours', 'energy', 'flow', 'levelling', 'iterations', 'simres', 'format', 'landscape', 'border'];
  G = GenArt.create({
    title: 'Poured Ground',
    resetOnFinish: true,
    closedGroups: ['simulation', 'surface'],
    params: {
      mode: { value: 0, options: { 'after the work': 0, 'free gestures': 1 }, label: 'composition', group: 'colour' },
      palette: { value: -1, options: PAL_OPTIONS, label: 'palette', group: 'colour' },
      ground: { value: 0, options: { 'lightest colour': 0, 'darkest colour': 1, 'paper white': 2 }, label: 'ground', group: 'colour' },
      style: { value: 4, options: PG.STYLES, label: 'gesture', group: 'composition' },
      pours: { value: 12, min: 2, max: 24, step: 1, label: 'pours', group: 'composition' },
      energy: { value: 1, min: 0.4, max: 2, step: 0.05, label: 'hand speed', group: 'composition' },
      flow: { value: 0.985, min: 0.9, max: 0.998, step: 0.001, label: 'flow (momentum)', group: 'simulation' },
      levelling: { value: 0.03, min: 0, max: 0.2, step: 0.005, label: 'levelling', group: 'simulation' },
      iterations: { value: 30, min: 8, max: 80, step: 1, label: 'pressure iterations', group: 'simulation' },
      simres: { value: 1024, options: { '512': 512, '768': 768, '1024': 1024, '1536': 1536, '2048': 2048 }, label: 'sim long side', group: 'simulation' },
      speed: { value: 4, min: 1, max: 24, step: 1, label: 'steps / frame', group: 'simulation' },
      relief: { value: 0.22, min: 0, max: 0.8, step: 0.01, label: 'relief', group: 'surface' },
      gloss: { value: 0.25, min: 0, max: 1, step: 0.01, label: 'gloss', group: 'surface' },
      tooth: { value: 0.035, min: 0, max: 0.15, step: 0.005, label: 'paper tooth', group: 'surface' },
      format: { value: 5, options: FMT_OPTIONS, label: 'format', group: 'print' },
      landscape: { value: 0, options: { portrait: 0, landscape: 1 }, label: 'orientation', group: 'print' },
      border: { value: 40, min: 0, max: 120, step: 1, label: 'border (mm)', group: 'print' },
      dpi: { value: 300, options: { '150': 150, '200': 200, '240': 240, '300': 300, '360': 360 }, label: 'dpi', group: 'print' },
      bits: { value: 16, options: { '16-bit': 16, '8-bit': 8 }, label: 'bit depth', group: 'print' },
    },
    onReset: function () {
      const key = G.seed + '|' + SIM_KEYS.map(function (k) { return G.param(k); }).join('|');
      if (key !== simKey) { simKey = key; build(); }
      else { updateCaption(); dirty = true; }
    },
  });
  if (G.gui) {
    G.gui.add({ g: generate }, 'g').name('✨ Generate (G)');
    G.gui.add({ p: exportPrint }, 'p').name('🖨 Export print PNG (P)');
    G.gui.add({ f: function () { finishSim(); } }, 'f').name('⏭ Finish pour');
  }
  window.PouredGroundApp = {
    G: G, finish: finishSim, exportPrint: exportPrint, exportPreview: exportPreview, exportImage: exportImage, generate: generate,
    state: function () { return S; },
    after: function () { return S ? after() : null; },
    exporting: function () { return exporting; },
    handTouched: function () { return handTouched; },
    get pigment() { return pigment; },
    set pigment(i) { pigment = i; updateCaption(); },
  };

  addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();
  G.reset();
  if (new URLSearchParams(location.search).get('still') === '1') finishSim();
  requestAnimationFrame(frame);
})();
