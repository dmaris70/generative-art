// 049 — Grass Nocturne: a live grass field for a large screen, locked to the local clock.
//
// A camera drifts through one meadow on a path that is a function of the clock alone: a main
// loop of an hour, a 19.5-minute swerve and a 37-minute rise and fall, so the path as a whole
// repeats only every 20 days (1,731,600 s). It moves at walking-in-a-dream speed, ≤ 6 cm/s. The light
// is a single low source whose bearing and height follow the real day: high and flat at noon,
// low and raking at night. The wind is a set of gust fronts crossing the field, also a function
// of the clock. So any screen, after any restart, shows the same moment as every other.
//
// Every blade is computed in the vertex shader from its world cell and a hash (WebGL2, no
// buffers of blades): the meadow is the same wherever the camera goes, and nothing is stored.
//
// URL: ?seed=N · ?blades=<per cell, 4…24> · ?scale=<render scale> · ?dim=19-22:0.6,22-7:0.35
//      ?hud=0 · ?at=2026-11-02T14:20 & ?speed=60 (rehearsal) · ?still=1 (hold the clock)
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;

  // ───────────────────────── the clock-locked score (pure; tested in Node) ─────────────────────────
  const dayS = (ms) => { const d = new Date(ms); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; };
  // the camera: a closed hourly loop over the meadow, with a slower rise and fall
  function eyeAt(s) {
    const a = TAU * s / 3600, b = TAU * s / 1170, c = TAU * s / 2220;
    const x = 13 * Math.sin(a) + 4 * Math.sin(b + 0.7);
    const z = 9 * Math.sin(2 * a + 1.2) + 3 * Math.cos(b * 0.5 + 0.3);
    const breath = Math.pow(0.5 - 0.5 * Math.cos(c), 2.2);           // mostly low, sometimes lifted
    return { x, z, h: 0.32 + 5.2 * breath };
  }
  // the light: bearing turns once a day; height is greatest at 13:00 and least at 01:00
  function lightAt(s) {
    const hr = s / 3600, az = TAU * (hr / 24) + 2.1;
    const el = (7 + 31 * (0.5 + 0.5 * Math.cos(TAU * (hr - 13) / 24))) * Math.PI / 180;
    return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  }
  // the wind: a direction that wanders through the day, a strength that gusts
  function windAt(s) {
    const dir = 0.6 + 0.9 * Math.sin(TAU * s / 86400 * 3) + 0.25 * Math.sin(TAU * s / 1530);
    const g = 0.5 + 0.5 * Math.sin(TAU * s / 97) * Math.sin(TAU * s / 411 + 1.3);
    return { x: Math.cos(dir), z: Math.sin(dir), strength: 0.25 + 0.75 * g * g };
  }
  function dimAt(ms, spec) {
    const d = new Date(ms), h = d.getHours() + d.getMinutes() / 60;
    for (const part of String(spec || '').split(',')) {
      const m = part.match(/^\s*(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):(\d*\.?\d+)\s*$/);
      if (!m) continue;
      const a = +m[1], b = +m[2];
      if (a <= b ? h >= a && h < b : h >= a || h < b) return +m[3];
    }
    return 1;
  }
  const api = { dayS, eyeAt, lightAt, windAt, dimAt };
  global.Nocturne = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ───────────────────────── shaders ─────────────────────────
  const COMMON = `#version 300 es
precision highp float; precision highp int;
uniform float uSeed;
uint hash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hash(x) & 0xffffffu) / 16777215.0; }
float vhash(ivec2 c) { return h01(uint(c.x) * 0x9e3779b9u ^ uint(c.y) * 0x85ebca6bu ^ uint(uSeed)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); ivec2 c = ivec2(i);
  return mix(mix(vhash(c), vhash(c + ivec2(1, 0)), f.x), mix(vhash(c + ivec2(0, 1)), vhash(c + ivec2(1, 1)), f.x), f.y);
}
float ground(vec2 p) {
  return 0.8 * sin(p.x * 0.053 + 1.3) * cos(p.y * 0.047 - 0.4) + 0.4 * sin(p.x * 0.11 - p.y * 0.083 + 2.0) + 0.45 * (vnoise(p * 0.18) - 0.5);
}
`;
  const GRASS_VS = COMMON + `
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uOrigin; uniform float uCell; uniform int uN; uniform int uPer;
uniform float uTime; uniform vec3 uWind; uniform int uSegs;
out float vT; out vec3 vN; out vec3 vTan; out vec3 vPos; out float vTone;
void main() {
  int inst = gl_InstanceID, k = inst % uPer, c = inst / uPer;
  ivec2 cell = ivec2(floor(uOrigin / uCell)) + ivec2(c % uN, c / uN);
  uint hb = hash(uint(cell.x) * 73856093u ^ uint(cell.y) * 19349663u ^ uint(k) * 83492791u ^ uint(uSeed) * 2654435761u);
  vec2 root = (vec2(cell) + vec2(h01(hb), h01(hb ^ 0x68bc21ebu))) * uCell;
  float d = distance(root, uEye.xz);
  // fewer blades with distance, each a little wider, so the field keeps its tone
  float keep = clamp(pow(7.0 / max(d, 7.0), 1.35), 0.04, 1.0);
  if (float(k) >= ceil(keep * float(uPer))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // the meadow: tall in drifts, short in lawns; tufts share a stature
  float meadow = smoothstep(0.25, 0.8, 0.6 * vnoise(root * 0.06) + 0.4 * vnoise(root * 0.17 + 9.0));
  float tuft = vnoise(root * 1.1 + 3.0);
  float H = (0.1 + 0.75 * meadow) * (0.55 + 0.6 * tuft) * (0.7 + 0.5 * h01(hb ^ 0x1u));
  float yaw = h01(hb ^ 0x2u) * 6.2831853, lean = 0.12 + 0.35 * h01(hb ^ 0x3u);
  vec2 own = vec2(cos(yaw), sin(yaw));
  // gust fronts travel downwind; a flutter rides on them
  float along = dot(root, uWind.xy);
  float gust = 0.5 + 0.5 * sin(along * 0.28 - uTime * 1.6 + 2.0 * vnoise(root * 0.07));
  float flutter = 0.08 * sin(uTime * (2.2 + 1.5 * h01(hb ^ 0x4u)) + h01(hb ^ 0x5u) * 6.28);
  vec2 bendDir = own * lean + uWind.xy * uWind.z * (0.2 + 0.9 * gust * gust) + own.yx * vec2(1.0, -1.0) * flutter;
  float bend = min(length(bendDir), 1.2); vec2 bd = bendDir / max(length(bendDir), 1e-4);
  float th = bend * 1.05;
  float y0 = ground(root);
  vec3 p0 = vec3(root.x, y0, root.y);
  vec3 p1 = p0 + vec3(bd.x * H * sin(th) * 0.15, H * 0.62, bd.y * H * sin(th) * 0.15);
  vec3 p2 = p0 + vec3(bd.x * H * sin(th), H * cos(th) * 0.96, bd.y * H * sin(th));
  int seg = gl_VertexID / 2; float side = float(gl_VertexID % 2) * 2.0 - 1.0;
  float t = float(seg) / float(uSegs), s = 1.0 - t;
  vec3 pos = s * s * p0 + 2.0 * s * t * p1 + t * t * p2;
  vec3 tan = normalize(2.0 * s * (p1 - p0) + 2.0 * t * (p2 - p1));
  vec3 across = normalize(vec3(-bd.y, 0.0, bd.x) * 0.6 + vec3(-own.y, 0.0, own.x) * 0.4);
  float w = (0.004 + 0.004 * h01(hb ^ 0x6u)) * (1.0 - pow(t, 1.4)) / sqrt(keep);
  pos += across * side * w;
  vT = t; vTan = tan; vN = normalize(cross(across, tan)); vPos = pos; vTone = 0.8 + 0.4 * h01(hb ^ 0x7u);
  gl_Position = uVP * vec4(pos, 1.0);
}`;
  const GRASS_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure;
in float vT; in vec3 vN; in vec3 vTan; in vec3 vPos; in float vTone;
out vec4 frag;
void main() {
  vec3 V = normalize(uEye - vPos), N = faceforward(vN, -V, vN), H = normalize(uLight + V);
  float diff = 0.3 + 0.7 * max(dot(N, uLight), 0.0);
  float th = dot(vTan, H), sheen = pow(max(0.0, 1.0 - th * th), 36.0) * (0.25 + 0.75 * vT);
  float rim = pow(1.0 - abs(dot(N, V)), 3.0) * 0.25 * vT;
  float occ = mix(0.12, 1.0, smoothstep(0.0, 0.75, vT));
  float e = (0.04 + 0.32 * diff * vTone + 1.2 * sheen + rim) * occ;
  float d = distance(vPos, uEye);
  e *= exp(-d * uFog);
  float lum = 1.0 - exp(-e * uExposure);
  float g = (h01(uint(gl_FragCoord.x) * 1973u ^ uint(gl_FragCoord.y) * 9277u) - 0.5) / 255.0;   // no banding on 8-bit panels
  frag = vec4(vec3(lum + g), 1.0);
}`;
  const GROUND_VS = COMMON + `
uniform mat4 uVP; uniform vec2 uOrigin; uniform float uSpan; uniform int uRes;
out vec3 vPos;
void main() {
  int i = gl_VertexID % (uRes + 1), j = gl_VertexID / (uRes + 1);
  vec2 p = uOrigin + vec2(float(i), float(j)) / float(uRes) * uSpan;
  vPos = vec3(p.x, ground(p) - 0.01, p.y);
  gl_Position = uVP * vec4(vPos, 1.0);
}`;
  const GROUND_FS = COMMON + `
uniform vec3 uEye; uniform float uFog; uniform float uExposure; in vec3 vPos; out vec4 frag;
void main() { float e = 0.02 * exp(-distance(vPos, uEye) * uFog); frag = vec4(vec3(1.0 - exp(-e * uExposure)), 1.0); }`;

  // ───────────────────────── the screen ─────────────────────────
  const Q = new URLSearchParams(location.search), num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const O = {
    seed: num('seed', 49) >>> 0, per: Math.max(4, Math.min(24, num('blades', 14) | 0)), scale: Math.max(0.25, Math.min(2, num('scale', 1))),
    dim: Q.has('dim') ? Q.get('dim') : '19-22:0.6,22-7:0.35', hud: Q.get('hud') !== '0', speed: Math.max(0, num('speed', 1)), still: Q.get('still') === '1',
  };
  const t0Real = Date.now(), t0Wall = Q.has('at') && !isNaN(Date.parse(Q.get('at'))) ? Date.parse(Q.get('at')) : t0Real;
  const now = () => (O.still ? t0Wall : t0Wall + (Date.now() - t0Real) * O.speed);

  const canvas = document.getElementById('gl'), hud = document.getElementById('hud'), stage = document.getElementById('stage');
  hud.hidden = !O.hud;
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { hud.hidden = false; hud.textContent = 'This screen needs WebGL2.'; return; }

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  const grass = program(GRASS_VS, GRASS_FS), groundP = program(GROUND_VS, GROUND_FS);
  const vao = gl.createVertexArray();
  // the ground mesh: indices for a (RES+1)² grid
  const RES = 96, idx = [];
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const a = j * (RES + 1) + i; idx.push(a, a + 1, a + RES + 1, a + 1, a + RES + 2, a + RES + 1); }
  const ibo = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

  const CELL = 0.28, SPAN = 46, N = Math.ceil(SPAN / CELL), SEGS = 6;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * O.scale;
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  }
  addEventListener('resize', resize); resize();

  function mat(eye, look, fovY, aspect) {
    const f = 1 / Math.tan(fovY / 2), near = 0.05, far = 120;
    let zx = eye[0] - look[0], zy = eye[1] - look[1], zz = eye[2] - look[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const V = [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
    const P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k2 = 0; k2 < 4; k2++) v += P[k2 * 4 + r] * V[c * 4 + k2]; out[c * 4 + r] = v; }
    return out;
  }
  // the shader's ground, in JS, so the eye always clears it
  const ihash = (x) => { x >>>= 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16; return x >>> 0; };
  const vhash = (cx, cz) => (ihash((Math.imul(cx >>> 0, 0x9e3779b9) ^ Math.imul(cz >>> 0, 0x85ebca6b) ^ O.seed) >>> 0) & 0xffffff) / 16777215;
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  }
  const groundH = (x, z) => 0.8 * Math.sin(x * 0.053 + 1.3) * Math.cos(z * 0.047 - 0.4) + 0.4 * Math.sin(x * 0.11 - z * 0.083 + 2.0) + 0.45 * (vnoise(x * 0.18, z * 0.18) - 0.5);

  function frame() {
    const ms = now(), s = dayS(ms), time = (ms / 1000) % 86400;
    // look along the path, 14 m ahead, a little above the grass there
    const e = eyeAt(s), pa = eyeAt(s - 60), pb = eyeAt(s + 60);
    let hx = pb.x - pa.x, hz = pb.z - pa.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const eye = [e.x, groundH(e.x, e.z) + e.h, e.z];
    const lx = e.x + hx * 14, lz = e.z + hz * 14;
    const look = [lx, groundH(lx, lz) + 0.35, lz];
    const L = lightAt(s), W = windAt(s), aspect = canvas.width / canvas.height;
    const VP = mat(eye, look, 0.62, aspect);
    // the window of cells sits ahead of the eye, where the view is
    const fx = look[0] - eye[0], fz = look[2] - eye[2], fl = Math.hypot(fx, fz) || 1;
    const origin = [eye[0] + fx / fl * (SPAN * 0.38) - SPAN / 2, eye[2] + fz / fl * (SPAN * 0.38) - SPAN / 2];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // the night is darker than the day: exposure follows the light's height (7° → 1.5, 38° → 3.0)
    const elev = Math.asin(L[1]) * 180 / Math.PI, exposure = 1.5 + 1.5 * Math.min(1, Math.max(0, (elev - 7) / 31)), fog = 0.04;

    gl.useProgram(groundP.p); const g = groundP.u;
    gl.uniformMatrix4fv(g.uVP, false, VP); gl.uniform2f(g.uOrigin, origin[0], origin[1]); gl.uniform1f(g.uSpan, SPAN);
    gl.uniform1i(g.uRes, RES); gl.uniform3fv(g.uEye, eye); gl.uniform1f(g.uFog, fog); gl.uniform1f(g.uExposure, exposure); gl.uniform1f(g.uSeed, O.seed);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(grass.p); const u = grass.u;
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uEye, eye); gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform1f(u.uCell, CELL); gl.uniform1i(u.uN, N); gl.uniform1i(u.uPer, O.per); gl.uniform1f(u.uTime, time);
    gl.uniform3f(u.uWind, W.x, W.z, W.strength); gl.uniform1i(u.uSegs, SEGS); gl.uniform3fv(u.uLight, L);
    gl.uniform1f(u.uFog, fog); gl.uniform1f(u.uExposure, exposure); gl.uniform1f(u.uSeed, O.seed);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (SEGS + 1), N * N * O.per);

    stage.style.opacity = String(dimAt(ms, O.dim));
    if (O.hud) {
      const d = new Date(ms), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      hud.textContent = 'GRASS NOCTURNE · ' + hh + ' · EYE ' + e.h.toFixed(2) + ' M · LIGHT ' + Math.round(Math.asin(L[1]) * 180 / Math.PI) + '° · WIND ' + W.strength.toFixed(2);
    }
    if (!O.still) requestAnimationFrame(frame);       // a held clock is drawn once
    else canvas.dataset.drawn = '1';
  }
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (err) { /* optional */ }
  requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : globalThis);
