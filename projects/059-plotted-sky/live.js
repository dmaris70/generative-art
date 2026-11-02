// 059 — Plotted Sky, live. The flip-book (motion.js) rebuilds whole plotted sheets, a few a second,
// and every visibility decision is re-made each frame, so lines jump. Here the graphics card
// redraws the sheet at screen rate from continuous functions, the way a shader piece does:
//   - the blades: 048's engine plants them once (`collect`), with their lean and the gust's warp;
//     the vertex shader bends each one with 048's wind formula at the current instant.
//   - hidden lines: each blade also has a paper-coloured body of its real width, and the ground is
//     a paper-coloured surface; the depth buffer hides whatever lies behind them, smoothly.
//   - light: 048's moon sheen is evaluated per vertex; where it passes the limit the pen "lifts".
//   - the sky: the folded engine fills a tone grid on the GPU (the same 1.2 mm grid sky.js uses),
//     and a ruling pass draws the engraved lines from it. A line's threshold wavers smoothly along
//     its length (sky.js `ditherSmooth`), so as the deck re-forms the ends of the lines slide.
// Pausing and exporting rebuilds that exact instant on the CPU as a plottable SVG.
//
// Browser only (WebGL2).

(function (global) {
  'use strict';
  const NEAR = 0.12, FAR = 400, SEGS = 10;

  // ───────────────────────── shaders ─────────────────────────
  const COMMON = `
uniform vec3 uE, uF, uRt, uUp;      // eye and camera basis (048's basis)
uniform float uFoc;                  // mm on paper per unit tangent
uniform vec2 uFrame;                 // frame size, mm
vec4 toClip(vec3 p, out vec2 mm, out float zc, float push){
  vec3 d = p - uE;
  zc = dot(d, uF);
  float z = max(zc, ${NEAR.toFixed(3)});
  mm = vec2(uFrame.x * .5 + uFoc * dot(d, uRt) / z, uFrame.y * .5 - uFoc * dot(d, uUp) / z);
  float zz = z + push;
  float nd = (${FAR.toFixed(1)} + ${NEAR.toFixed(3)}) / (${FAR.toFixed(1)} - ${NEAR.toFixed(3)}) - 2. * ${FAR.toFixed(1)} * ${NEAR.toFixed(3)} / ((${FAR.toFixed(1)} - ${NEAR.toFixed(3)}) * zz);
  return vec4(mm.x / uFrame.x * 2. - 1., 1. - mm.y / uFrame.y * 2., nd, 1.);
}`;

  const BLADE_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 aRoot; in vec2 aLean; in vec4 aMisc;   // misc: L, r4, head (0/1), width
in float aWarp; in vec4 aHeadA; in vec4 aSpkA; in vec4 aSpkB; in vec2 aSpkC;   // head: len, nod, spikelet count; spikelet lengths
uniform float uT, uWind, uBody, uPen, uPxMM, uLight;
uniform vec2 uWdir;
uniform vec3 uMoon;
uniform int uMode;                              // 0 body (paper), 1 centreline (ink), 2 seed-head spine
out float vLit;
${COMMON}
vec3 P0, P1, P2;
vec3 bez(float t){ float s = 1. - t; return s*s*P0 + 2.*s*t*P1 + t*t*P2; }
vec3 bezT(float t){ return 2. * ((1. - t) * (P1 - P0) + t * (P2 - P1)); }
void main(){
  float L = aMisc.x, r4 = aMisc.y, head = aMisc.z, w = aMisc.w;
  // 048's wind at this instant
  float along = aRoot.x * uWdir.x + aRoot.z * uWdir.y;
  float gust = .5 + .5 * sin(along * .33 - uT * 1.25 + aWarp);
  float amount = uWind * (.25 + .75 * gust * gust);
  vec2 dv = aLean + uWdir * amount * 1.1;
  float dl = max(length(dv), 1e-6), bend = clamp(dl, 0., 1.15);
  dv /= dl;
  float th = bend * (head > .5 ? .6 : 1.1);
  P0 = aRoot;
  P2 = vec3(aRoot.x + dv.x * L * sin(th), aRoot.y + L * cos(th) * (.95 - .1 * r4), aRoot.z + dv.y * L * sin(th));
  P1 = vec3(aRoot.x + dv.x * L * sin(th) * .12, aRoot.y + L * .62, aRoot.z + dv.y * L * sin(th) * .12);

  int seg = gl_VertexID / 6, corner = gl_VertexID % 6;
  float t0 = float(seg) / float(${SEGS}), t1 = float(seg + 1) / float(${SEGS});
  vec3 A, B; float ta = t0, tb = t1;
  bool dead = false;
  if (uMode == 2) {
    // 048's seed head (headLines): a spine of 8 segments continuing the stalk, nodding, with
    // 5–10 spikelets alternating along it; its random numbers come from the head's own sequence
    float len = aHeadA.x, nod = aHeadA.y, kk = aHeadA.z;
    vec3 tv = normalize(P2 - P1);
    vec2 sd = vec2(tv.z, -tv.x); sd = length(sd) < 1e-4 ? vec2(1., 0.) : normalize(sd);
    #define AT(sv) (P2 + tv * len * (sv) - vec3(0., nod * len * (sv) * (sv), 0.))
    if (seg < 8) { A = AT(float(seg) / 8.); B = AT(float(seg + 1) / 8.); }
    else {
      int j = seg - 8;
      float spk[10] = float[10](aSpkA.x, aSpkA.y, aSpkA.z, aSpkA.w, aSpkB.x, aSpkB.y, aSpkB.z, aSpkB.w, aSpkC.x, aSpkC.y);
      if (float(j) >= kk) dead = true;
      float sv = .25 + .7 * float(j) / max(1., kk - 1.);
      vec3 q = AT(sv), q2 = AT(min(1., sv + .05)), dd = normalize(q2 - q);
      float side = (j % 2 == 1) ? 1. : -1., l = len * spk[min(j, 9)] * (1. - .5 * sv);
      vec3 ev = normalize(vec3(dd.x * .55 + sd.x * side * .75, dd.y * .55 + .15, dd.z * .55 + sd.y * side * .75));
      A = q; B = q + ev * l;
    }
    ta = 1.; tb = 1.;
  } else { A = bez(t0); B = bez(t1); }
  bool second = (corner == 2 || corner == 4 || corner == 5);
  bool side = (corner == 1 || corner == 2 || corner == 4);
  float push = uMode == 0 ? .03 : 0.;
  vec2 ma, mb; float za, zb;
  vec4 ca = toClip(A, ma, za, push), cb = toClip(B, mb, zb, push);
  if (dead || za < ${NEAR.toFixed(3)} || zb < ${NEAR.toFixed(3)} || (uMode == 2 && head < .5)) { gl_Position = vec4(2., 2., 2., 1.); vLit = 0.; return; }
  vec2 dir = mb - ma; float len = length(dir); dir = len > 1e-6 ? dir / len : vec2(1., 0.);
  vec2 nrm = vec2(-dir.y, dir.x);
  float t = second ? tb : ta, z = second ? zb : za;
  // a body as 048's occlusion map stamps it: a square rounded out to whole 0.2 mm cells, so
  // half a cell wider on each side than the blade, and never narrower than two cells
  float hw = uMode == 0 ? max(.5 * uBody * w * (1. - .85 * t) * uFoc / z + .1, .2) : max(uPen * .5, .45 / uPxMM);
  vec2 m = (second ? mb : ma) + nrm * (side ? hw : -hw) + dir * (second ? hw : -hw) * (uMode == 0 ? 0. : 1.);
  vec4 c = second ? cb : ca;
  gl_Position = vec4(m.x / uFrame.x * 2. - 1., 1. - m.y / uFrame.y * 2., c.z, 1.);
  // 048's moonlight: sheen of the blade's direction toward the moon, seen from the eye
  vec3 P = second ? B : A, tg = normalize(uMode == 2 ? bezT(1.) : bezT(t));
  vec3 v = normalize(uE - P), hh = normalize(uMoon + v);
  float c2 = dot(tg, hh);
  vLit = uMode == 1 ? pow(max(0., 1. - c2 * c2), 24.) * (.35 + .65 * t) : 0.;   // heads: no pen lift, as in 048
}`;
  const BLADE_FS = `#version 300 es
precision highp float; precision highp int;
in float vLit; uniform vec3 uInk; uniform float uLight; uniform int uMode; out vec4 o;
void main(){ if (uMode != 0 && uLight > 0. && vLit > 1. - uLight) discard; o = vec4(uInk, 1.); }`;

  const GROUND_VS = `#version 300 es
precision highp float; precision highp int;
in vec3 aP;
${COMMON}
void main(){ vec2 mm; float zc; vec4 c = toClip(aP, mm, zc, .06); if (zc < ${NEAR.toFixed(3)}) { gl_Position = vec4(2.,2.,2.,1.); return; } gl_Position = c; }`;
  const FLAT_FS = `#version 300 es
precision highp float; precision highp int; uniform vec3 uInk; out vec4 o; void main(){ o = vec4(uInk, 1.); }`;

  const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

  // the tone grid: one texel per node of sky.js's grid (spacing uH mm); r = tone, g = 1 where sky
  const TONE_FS = `#version 300 es
precision highp float; precision highp int;
uniform vec3 uE, uF, uRt, uUp; uniform float uFoc; uniform vec2 uFrame;
uniform float uH, uDeck, uL, uShift, uCw, uSw, uReach0, uReach1, uGain, uGainInv;   // uGainInv > 0: the negative
uniform vec3 uOff, uBox, uAniso; uniform float uScale;
uniform vec3 uC0, uC1, uC2;
uniform vec3 uMoon;
out vec4 o;
float sstep(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
float mirror(float v, float lo, float hi){ float span = hi - lo, t = (v - lo) / span; t -= 2. * floor(t / 2.); return lo + span * (t < 1. ? t : 2. - t); }
void main(){
  vec2 ij = floor(gl_FragCoord.xy);
  vec2 mm = vec2(min(ij.x * uH, uFrame.x), min(ij.y * uH, uFrame.y));
  float a = (mm.x - uFrame.x * .5) / uFoc, b = (uFrame.y * .5 - mm.y) / uFoc;
  vec3 d = normalize(uF + uRt * a + uUp * b);
  if (d.y <= .004) { o = vec4(0.); return; }
  float t = (uDeck - uE.y) / d.y; vec3 X = d * t; float rho = length(X.xz) / 1000.;
  float fade = 1. - sstep(uReach0, uReach1, rho);
  if (fade <= 0.) { o = vec4(0., 1., 0., 1.); return; }
  float wx = uE.x + X.x, wz = uE.z + X.z;
  float qx = (wx * uCw + wz * uSw - uShift) / uL, qy = mirror((-wx * uSw + wz * uCw) / uL - 1., -5.5, 3.5);
  float vx = qx, vy = qy + 9.;
  float g = 0., e = 0., s = 0., W = 0., S = 0.;
  for (float i = 1.; i < 99.; i++) {
    vec3 p = vec3(vx * uC0.x + vy * uC0.y + g * uC0.z, vx * uC1.x + vy * uC1.y + g * uC1.z, vx * uC2.x + vy * uC2.y + g * uC2.z);
    s = 2.;
    for (int j = 0; j < 19; j++) { e = uScale / dot(p * p, uAniso); s *= e; p = uOff - abs(abs(p) * e - uBox); }
    g += p.y / s; s = log2(s) / exp(e);
    float v = s / 200.; W += v; S += v * (g * .016 - e * .3);
  }
  float Dp = clamp((sstep(.04, .85, W) + S * .25) * uGain, 0., 1.);
  float D = (uGainInv > 0. ? clamp((1. - Dp) * uGainInv, 0., 1.) : Dp) * fade;
  float ang = acos(clamp(dot(d, uMoon), -1., 1.));
  D *= .3 + .7 * sstep(.03, .35, ang);
  o = vec4(D, 1., 0., 1.);
}`;

  // the ruling: sky.js's three line families, thresholds wavering smoothly along each line
  const RULE_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uTone; uniform vec2 uGrid; uniform float uH;
uniform vec2 uFrame, uOrigin; uniform float uPxMM, uSp, uPen, uDither, uCross;
uniform vec3 uThr; uniform float uN1, uN2;
uniform vec3 uMoonP;   // x, y (mm), r (mm); r = 0 when the moon is not drawn
uniform vec3 uInk;
out vec4 o;
float h01(float a, float b){
  uint x = uint(int(a)) * 0x27d4eb2du ^ uint(int(b)) * 0x165667b1u;
  x = (x ^ (x >> 15u)) * 0x2c1b3c6du; x = (x ^ (x >> 12u)) * 0x297a2d39u;
  return float(x ^ (x >> 15u)) / 4294967296.;
}
float wav(float id, float s){ float sc = s / .9, c0 = floor(sc), f = sc - c0, m = f * f * (3. - 2. * f); return mix(h01(id, c0), h01(id, c0 + 1.), m); }
float tone(vec2 mm){
  vec2 f = clamp(mm / uH, vec2(0.), uGrid - 1.0001); vec2 i = floor(f), u = f - i;
  vec4 a = texelFetch(uTone, ivec2(i), 0), b = texelFetch(uTone, ivec2(i) + ivec2(1, 0), 0);
  vec4 c = texelFetch(uTone, ivec2(i) + ivec2(0, 1), 0), d = texelFetch(uTone, ivec2(i) + ivec2(1, 1), 0);
  if (a.g < .5 || b.g < .5 || c.g < .5 || d.g < .5) return -1.;
  return mix(mix(a.r, b.r, u.x), mix(c.r, d.r, u.x), u.y);
}
float lineCover(float dist, float id, float s, float thr, float T){
  float hw = max(uPen * .5, .45 / uPxMM), aa = .7 / uPxMM;
  float cov = 1. - smoothstep(hw - aa, hw + aa, dist);
  float th = thr + (wav(id, s) - .5) * uDither;
  return T > th ? cov : 0.;
}
void main(){
  vec2 mm = vec2((gl_FragCoord.x - uOrigin.x) / uPxMM, uFrame.y - (gl_FragCoord.y - uOrigin.y) / uPxMM);
  float T = tone(mm);
  if (T <= 0.) discard;
  float ink = 0.;
  // family 1: y = sp/2 + i sp
  float i1 = floor(mm.y / uSp); float y1 = uSp * .5 + i1 * uSp;
  ink = max(ink, lineCover(abs(mm.y - y1), i1 + 1., mm.x, uThr.x, T));
  // family 2: y = (j + 1) sp, between them
  float j2 = floor(mm.y / uSp - .5); float y2 = (j2 + 1.) * uSp;
  if (j2 >= 0.) ink = max(ink, lineCover(abs(mm.y - y2), uN1 + j2 + 1., mm.x, uThr.y, T));
  if (uCross > .5) {
    float an = radians(28.); vec2 uu = vec2(cos(an), -sin(an)), nn = vec2(-uu.y, uu.x);
    float diag = length(uFrame), gap = uSp * 1.5;
    vec2 p = mm - uFrame * .5; float dp = dot(p, nn);
    float m = floor((dp + diag) / gap + .5), dl = -diag + m * gap;
    float sAlong = dot(p - nn * dl, uu) + diag * .5;
    ink = max(ink, lineCover(abs(dp - dl), uN1 + uN2 + m + 1., sAlong, uThr.z, T));
  }
  if (uMoonP.z > 0.) {
    float dm = length(mm - uMoonP.xy);
    if (dm < uMoonP.z * 1.6) ink = 0.;
    float hw = max(uPen * .5, .45 / uPxMM);
    ink = max(ink, 1. - smoothstep(hw - .7 / uPxMM, hw + .7 / uPxMM, abs(dm - uMoonP.z)));
  }
  if (ink <= .01) discard;
  o = vec4(uInk, ink);
}`;

  // ───────────────────────── setup ─────────────────────────
  function basis(cam) {
    const ch = Math.cos(cam.heading), sh = Math.sin(cam.heading), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const f = [ch * cp, sp, sh * cp], rt = [-sh, 0, ch];
    const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    return { f, rt, up };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    const PF = global.PlottedField, PS = global.PlottedSky;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs) => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); U[u.name] = gl.getUniformLocation(p, u.name); }
      return { p, U };
    };
    const P = { blade: prog(BLADE_VS, BLADE_FS), ground: prog(GROUND_VS, FLAT_FS), tone: prog(QUAD_VS, TONE_FS), rule: prog(QUAD_VS, RULE_FS) };
    const quad = gl.createVertexArray(); gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    let S = null;           // the scene for one field and view

    function setup(o) {
      // 048 plants the field (and 059 rules a still sky for the caption's numbers)
      const collect = [];
      let bo = { seed: o.seed, view: o.view, instant: o.instant, stable: true, collect };
      if (o.moonAhead) Object.assign(bo, { moon: 175, moonHeight: 9 });
      const fieldOpts = Object.assign({}, bo);
      const r = PF.build(o.sky ? PS.withSky(bo, Object.assign({}, o.skyOpts, { loop: 0, loopInstant: o.instant, ditherSmooth: true })) : bo);
      const world = PF.createWorld(o.seed), cam = PF.camera(o.seed, o.view, world), B = basis(cam);
      const frame = r.frame, F = (frame.w / 2) / Math.tan((r.options.fov) * Math.PI / 360);
      const kept = collect.filter((b) => b.kept);
      const n = kept.length;
      const root = new Float32Array(n * 3), lean = new Float32Array(n * 2), misc = new Float32Array(n * 4), warp = new Float32Array(n);
      const headA = new Float32Array(n * 4), spkA = new Float32Array(n * 4), spkB = new Float32Array(n * 4), spkC = new Float32Array(n * 2);
      let heads = 0;
      kept.forEach((b, i) => {
        root.set([b.x, b.y, b.z], i * 3); lean.set([b.lx, b.lz], i * 2);
        misc.set([b.L, b.r4, b.head ? 1 : 0, b.width], i * 4); warp[i] = world.warp(b.x, b.z);
        if (b.head) {
          // the head's numbers, drawn in headLines' order from mulberry32(head hash)
          const r = mulberry32(b.head), len = 0.09 + 0.12 * r(), nod = r() < 0.4 ? 0.5 + 0.8 * r() : 0.12 * r(), k = 5 + Math.floor(r() * 6);
          const spk = Array.from({ length: 10 }, (_, j) => (j < k ? 0.28 + 0.14 * r() : 0));
          headA.set([len, nod, k, 0], i * 4); spkA.set(spk.slice(0, 4), i * 4); spkB.set(spk.slice(4, 8), i * 4); spkC.set(spk.slice(8, 10), i * 2);
          heads++;
        }
      });
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const attr = (name, data, size) => {
        const loc = gl.getAttribLocation(P.blade.p, name); if (loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, 1);
      };
      attr('aRoot', root, 3); attr('aLean', lean, 2); attr('aMisc', misc, 4); attr('aWarp', warp, 1);
      attr('aHeadA', headA, 4); attr('aSpkA', spkA, 4); attr('aSpkB', spkB, 4); attr('aSpkC', spkC, 2);
      gl.bindVertexArray(null);

      // the ground, as a paper-coloured surface around the eye (1 m cells, out to 60 m)
      const R = 60, step = 1, E = cam.eye, cells = Math.round(2 * R / step), gp = [], idx = [];
      for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) { const x = E[0] - R + i * step, z = E[2] - R + j * step; gp.push(x, world.ground(x, z), z); }
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) { const a = j * (cells + 1) + i; idx.push(a, a + 1, a + cells + 1, a + 1, a + cells + 2, a + cells + 1); }
      const gvao = gl.createVertexArray(); gl.bindVertexArray(gvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gp), gl.STATIC_DRAW);
      const gloc = gl.getAttribLocation(P.ground.p, 'aP'); gl.enableVertexAttribArray(gloc); gl.vertexAttribPointer(gloc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      // the sky: sky.js's deck, gain and grid, for the moving deck (camera held, levelled at u = 0)
      let sky = null;
      if (o.sky) {
        const so = Object.assign({}, PS.DEFAULTS, o.skyOpts);
        const P0 = PS.weather(so.weather), C = PS.cameraColumns(0);
        const gain = PS.levelGain(so.weather, PS.drifted(P0, 0), C) * (so.invert ? 1 : so.tone);
        const gainInv = so.invert ? PS.levelGainInv(so.weather, PS.drifted(P0, 0), C, gain) * so.tone : 0;
        const wa = world.windAz + 0;
        const h = so.sample, GW = Math.ceil(frame.w / h) + 1, GH = Math.ceil(frame.h / h) + 1;
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, GW, GH);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let n1 = 0, n2 = 0; for (let y = so.ruling / 2; y < frame.h; y += so.ruling) n1++; for (let y = so.ruling; y < frame.h; y += so.ruling) n2++;
        // the moon on the sheet, as sky.js places it (shown only if in the frame and above the horizon)
        sky = { so, P0, C, gain, gainInv, cw: Math.cos(wa), sw: Math.sin(wa), shift: so.drift * o.instant, h, GW, GH, tex, fb, n1, n2 };
      }
      // moon direction, as 048 computes it
      const ma = cam.heading + Math.PI + (o.moonAhead ? 175 : 40) * Math.PI / 180, me = (o.moonAhead ? 9 : 25) * Math.PI / 180;
      const moon = [Math.cos(me) * Math.cos(ma), Math.sin(me), Math.cos(me) * Math.sin(ma)];
      let moonP = [0, 0, 0];
      const mz = moon[0] * B.f[0] + moon[1] * B.f[1] + moon[2] * B.f[2];
      if (o.sky && mz > 0 && moon[1] > 0) {
        const mx = frame.w / 2 + F * (moon[0] * B.rt[0] + moon[1] * B.rt[1] + moon[2] * B.rt[2]) / mz;
        const my = frame.h / 2 - F * (moon[0] * B.up[0] + moon[1] * B.up[1] + moon[2] * B.up[2]) / mz;
        const rr = Math.max(2.2, F * Math.tan(0.0045) * 2.5);
        if (mx > rr && my > rr && mx < frame.w - rr && my < frame.h - rr) moonP = [mx, my, rr];
      }
      const caption = r.layers.find((l) => l.id === 'caption');
      S = { o, r, world, cam, B, frame, F, n, heads, vao, gvao, gcount: idx.length, sky, moon, moonP, caption, sheet: r.sheet, fieldOpts };
      return { blades: n, heads, sheet: r.sheet, frame, caption, stats: r.stats, extra: r.extra };
    }

    let toneFrame = 0;
    function render(t, u, layout, skyEvery = 2) {
      if (!S) return;
      const { frame, F, B, cam } = S, o = S.o;
      const { px, py, pw, ph, pxmm } = layout;            // frame rect on the canvas, device px
      const setCam = (U) => {
        gl.uniform3fv(U.uE, cam.eye); gl.uniform3fv(U.uF, B.f); gl.uniform3fv(U.uRt, B.rt); gl.uniform3fv(U.uUp, B.up);
        gl.uniform1f(U.uFoc, F); gl.uniform2f(U.uFrame, frame.w, frame.h);
      };
      // ── sky tone grid (every few frames; the deck moves slowly)
      if (S.sky && (toneFrame++ % skyEvery === 0)) {
        const k = S.sky, Pd = PS.drifted(k.P0, u);
        gl.useProgram(P.tone.p); const U = P.tone.U;
        gl.bindFramebuffer(gl.FRAMEBUFFER, k.fb); gl.viewport(0, 0, k.GW, k.GH); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        setCam(U);
        gl.uniform1f(U.uH, k.h); gl.uniform1f(U.uDeck, k.so.height); gl.uniform1f(U.uL, k.so.scale * 1000); gl.uniform1f(U.uShift, k.shift);
        gl.uniform1f(U.uCw, k.cw); gl.uniform1f(U.uSw, k.sw); gl.uniform1f(U.uReach0, k.so.reach); gl.uniform1f(U.uReach1, k.so.reachEnd); gl.uniform1f(U.uGain, k.gain); gl.uniform1f(U.uGainInv, k.gainInv);
        gl.uniform3fv(U.uOff, Pd.off); gl.uniform3fv(U.uBox, Pd.box); gl.uniform3fv(U.uAniso, Pd.aniso); gl.uniform1f(U.uScale, Pd.scale);
        gl.uniform3fv(U.uC0, k.C[0]); gl.uniform3fv(U.uC1, k.C[1]); gl.uniform3fv(U.uC2, k.C[2]); gl.uniform3fv(U.uMoon, S.moon);
        gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      // ── the sheet
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      const L = PS.look(o.look), rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const INK = rgb(L.ink), SEPIA = rgb(L.ink2), PAPER = rgb(L.paper);
      gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(px, py, pw, ph); gl.viewport(px, py, pw, ph);
      // sky ruling, first: anything nearer is drawn over it in paper
      if (S.sky) {
        const k = S.sky; gl.useProgram(P.rule.p); const U = P.rule.U;
        gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, k.tex); gl.uniform1i(U.uTone, 0);
        gl.uniform2f(U.uGrid, k.GW, k.GH); gl.uniform1f(U.uH, k.h); gl.uniform2f(U.uFrame, frame.w, frame.h);
        gl.uniform1f(U.uPxMM, pxmm); gl.uniform1f(U.uSp, k.so.ruling); gl.uniform1f(U.uPen, 0.3); gl.uniform1f(U.uDither, k.so.dither);
        gl.uniform1f(U.uCross, k.so.cross ? 1 : 0); gl.uniform3fv(U.uThr, PS.THRESH); gl.uniform1f(U.uN1, k.n1); gl.uniform1f(U.uN2, k.n2);
        gl.uniform3fv(U.uMoonP, S.moonP); gl.uniform3fv(U.uInk, INK); gl.uniform2f(U.uOrigin, px, py);
        // gl_FragCoord is relative to the canvas: shift so the frame's corner is (0, 0)
        gl.viewport(px, py, pw, ph);
        gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
      }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      // ground, in paper
      gl.useProgram(P.ground.p); setCam(P.ground.U); gl.uniform3fv(P.ground.U.uInk, PAPER);
      gl.bindVertexArray(S.gvao); gl.drawElements(gl.TRIANGLES, S.gcount, gl.UNSIGNED_INT, 0);
      // blades: bodies in paper, then centrelines and seed-head spines in ink
      gl.useProgram(P.blade.p); const U = P.blade.U; setCam(U);
      const wa = S.world.windAz + (o.windTurn || 0) * Math.PI / 180;
      gl.uniform1f(U.uT, t); gl.uniform1f(U.uWind, o.wind != null ? o.wind : 0.6); gl.uniform2f(U.uWdir, Math.cos(wa), Math.sin(wa));
      gl.uniform1f(U.uBody, o.body != null ? o.body : 1.6); gl.uniform1f(U.uPen, 0.3); gl.uniform1f(U.uPxMM, pxmm); gl.uniform1f(U.uLight, o.light != null ? o.light : 0.35); gl.uniform3fv(U.uMoon, S.moon);
      gl.bindVertexArray(S.vao);
      gl.uniform1i(U.uMode, 0); gl.uniform3fv(U.uInk, PAPER); gl.drawArraysInstanced(gl.TRIANGLES, 0, SEGS * 6, S.n);
      gl.uniform1i(U.uMode, 1); gl.uniform3fv(U.uInk, INK); gl.drawArraysInstanced(gl.TRIANGLES, 0, SEGS * 6, S.n);
      gl.uniform1i(U.uMode, 2); gl.uniform3fv(U.uInk, SEPIA); gl.drawArraysInstanced(gl.TRIANGLES, 0, 18 * 6, S.n);
      gl.bindVertexArray(null);
      gl.disable(gl.SCISSOR_TEST);
    }

    // this instant as a plottable sheet, from the CPU engine (exact; the screen is a close likeness)
    function exportSheet(t, u) {
      if (!S) return null;
      const o = S.o;
      let bo = Object.assign({}, S.fieldOpts, { instant: t, collect: undefined });
      delete bo.collect;
      if (o.sky) bo = PS.withSky(bo, Object.assign({}, o.skyOpts, { loop: u, loopInstant: o.instant, ditherSmooth: true }));
      return PF.build(bo);
    }

    return { setup, render, exportSheet, get scene() { return S; }, gl };
  }

  const api = { create, SEGS };
  global.PlottedLive = api;
})(typeof window !== 'undefined' ? window : globalThis);
