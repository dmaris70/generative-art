// Undertow — a seagrass meadow at night-depth.
// WebGL2. Every blade is a twisting ribbon bent on the GPU by a gusting current,
// a back-and-forth surge, a travelling swell and the viewer's hand; light falls
// from a slowly circling source above the surface, through animated caustics.
//
// URL: ?seed=<int>  ?n=<blade count>   Keys: S save PNG · R reseed · Space pause

(() => {
'use strict';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false });
if (!gl) throw new Error('WebGL2 is not available in this browser.');

// ---------- parameters ----------
const params = new URLSearchParams(location.search);
let seed = parseInt(params.get('seed') ?? '', 10);
if (!Number.isFinite(seed)) seed = 12;
const small = Math.min(innerWidth, innerHeight) < 700;
const BLADES = Math.max(1000, Math.min(200000, parseInt(params.get('n') ?? '', 10) || (small ? 26000 : 48000)));
const SEG = 18;                 // segments per ribbon
const FIELD_R = 9.5;            // meadow radius (m)
const SURFACE_Y = 9.0;          // water surface height
const BRUSH_N = 24;
const SNOW_N = small ? 1400 : 2600;

// ---------- seeded randomness ----------
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function valueNoise2(rng) {
  const P = 256, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (x, y) => g[((y & (P - 1)) * P) + (x & (P - 1))];
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

// ---------- the meadow ----------
// Seagrass grows in beds with sandy gaps between them; heights swell toward bed centres.
function plant(seed) {
  const rng = mulberry32(seed * 9973 + 17);
  const n1 = valueNoise2(rng), n2 = valueNoise2(rng);
  const data = new Float32Array(BLADES * 8);
  let i = 0, guard = 0;
  while (i < BLADES && guard++ < BLADES * 40) {
    const r = FIELD_R * Math.sqrt(rng()), a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const bed = 0.65 * n1(x * 0.42 + 40, z * 0.42 + 40) + 0.35 * n1(x * 1.1 + 9, z * 1.1 + 3);
    const edge = Math.min(1, (FIELD_R - r) / 1.5);
    const keep = Math.max(0, (bed - 0.3) / 0.35) * edge;
    if (rng() > keep) continue;
    const vigour = Math.min(1, keep);
    const tall = rng() < 0.035;
    const h = tall ? 2.2 + rng() * 1.3 : (0.45 + 1.45 * vigour * (0.55 + 0.45 * n2(x * 0.8, z * 0.8))) * (0.7 + 0.5 * rng());
    const w = (tall ? 0.04 : 0.018 + rng() * 0.028);
    const o = i * 8;
    data[o] = x; data[o + 1] = z; data[o + 2] = h; data[o + 3] = w;
    data[o + 4] = rng();                         // seed
    data[o + 5] = rng() * Math.PI * 2;           // phase
    data[o + 6] = 0.55 + rng() * 0.9;            // flexibility
    data[o + 7] = rng() * Math.PI * 2;           // resting lean azimuth
    i++;
  }
  // Aim the view at the thickest bed near the middle.
  let best = -1, focus = [0, 0];
  for (let gz = -4; gz <= 4; gz += 0.25) for (let gx = -4; gx <= 4; gx += 0.25) {
    let v = 0;
    for (let a = 0; a < 6; a++) { const x = gx + Math.cos(a) * 1.2, z = gz + Math.sin(a) * 1.2;
      v += 0.65 * n1(x * 0.42 + 40, z * 0.42 + 40) + 0.35 * n1(x * 1.1 + 9, z * 1.1 + 3); }
    if (v > best) { best = v; focus = [gx, gz]; }
  }
  return { data, count: i, focus };
}

// ---------- shaders ----------
const COMMON = `
uniform float uTime;
uniform vec3 uL;          // direction toward the light (unit, y > 0)
uniform vec3 uWater;      // deep water colour (linear)
uniform vec3 uLightCol;
float causticAt(vec2 p, float t, float sharp) {
  vec2 q = p + 0.45 * vec2(sin(p.y * 1.3 + t * 0.7), sin(p.x * 1.1 - t * 0.6));
  float v1 = sin(q.x * 2.1 + t * 0.9) + sin(q.y * 1.9 - t * 0.7) + sin((q.x - q.y) * 1.6 + t * 1.1);
  vec2 r = p * 1.7 + vec2(3.1, 1.7);
  r += 0.5 * vec2(sin(r.y * 1.2 - t * 0.8), sin(r.x * 1.4 + t * 0.5));
  float v2 = sin(r.x * 1.8 - t * 1.0) + sin(r.y * 2.2 + t * 0.6) + sin((r.x + r.y) * 1.3 - t * 0.9);
  return exp(-abs(v1) * sharp) + 0.8 * exp(-abs(v2) * sharp * 1.1);
}
// Caustic pattern carried down along the light direction: constant along each ray.
float causticWorld(vec3 w, float sharp) {
  vec2 p = w.xz + uL.xz / uL.y * (${SURFACE_Y.toFixed(1)} - w.y);
  return causticAt(p * 1.35, uTime * 0.85, sharp);
}
// Light shafts: in-scattered caustic columns between eye and a surface.
float shafts(vec3 eye, vec3 ray, float dist) {
  float far = min(dist, 10.0), acc = 0.0;
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(41.3, 289.1)) + uTime * 7.0) * 17853.13);
  for (int j = 0; j < 7; j++) {
    float d = (float(j) + jit) / 7.0 * far;
    vec3 p = eye + ray * d;
    float c = causticWorld(p, 0.9);
    acc += c * c * exp(-d * 0.12) * smoothstep(${SURFACE_Y.toFixed(1)}, 0.0, p.y * 0.6);
  }
  float phase = 0.2 + 0.7 * pow(max(dot(ray, uL), 0.0), 6.0);
  return acc / 7.0 * far / 10.0 * phase;
}
vec3 fogTo(vec3 col, float dist) { return mix(col, uWater, 1.0 - exp(-dist * 0.17)); }
vec3 finish(vec3 col, vec2 frag) {
  col = col / (1.0 + col * 0.6);                                   // soft shoulder
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float n = fract(sin(dot(frag, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  return col + (n - 0.5) / 255.0 * 1.5;
}
`;

const BLADE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aV;   // vertex row (0..SEG), side (-1, 1)
layout(location = 1) in vec4 aA;   // x, z, height, width
layout(location = 2) in vec4 aB;   // seed, phase, flexibility, lean azimuth
uniform mat4 uVP;
uniform float uTime;
uniform vec2 uFlow;     // current direction
uniform float uGust;    // current strength
uniform float uSurge;   // signed oscillating surge
uniform vec4 uBrush[${BRUSH_N}];  // x, z, birth time, strength
uniform vec3 uEye;
out vec3 vPos; out vec3 vN; out vec3 vT; out float vS; out float vSeed;
const int SEG = ${SEG};
void main() {
  vec2 root = aA.xy; float h = aA.z, w = aA.w;
  float sd = aB.x, ph = aB.y, flex = aB.z, leanAz = aB.w;
  int k = int(aV.x + 0.5);

  // Horizontal force on this blade.
  vec2 perp = vec2(-uFlow.y, uFlow.x);
  float along = dot(root, uFlow), across = dot(root, perp);
  float swell = sin(along * 1.25 - uTime * 1.55 + sin(across * 0.35) * 1.5);
  float swell2 = sin(along * 2.9 + across * 0.8 - uTime * 2.6 + ph * 0.3);
  vec2 F = uFlow * (uGust * (0.75 + 0.35 * swell) + uSurge * 0.55 + 0.12 * swell2 * (0.3 + uGust));
  F += perp * 0.12 * sin(across * 1.7 + uTime * 0.9 + ph);
  for (int b = 0; b < ${BRUSH_N}; b++) {
    vec4 B = uBrush[b];
    float age = uTime - B.z;
    if (age < 0.0 || age > 9.0) continue;
    vec2 d = root - B.xy; float r2 = dot(d, d);
    float fall = exp(-r2 / 0.42) * B.w * exp(-age * 0.55) * smoothstep(0.0, 0.25, age + 0.25);
    F += normalize(d + 1e-4) * fall * 2.6;
  }
  F *= flex;
  float Fm = length(F);
  vec2 leanDir = vec2(cos(leanAz), sin(leanAz));
  float lean = 0.10 + 0.55 * sd * sd;

  vec3 pos = vec3(root.x, 0.0, root.y);
  vec3 T = vec3(0.0, 1.0, 0.0); vec2 dirH = leanDir;
  float segL = h / float(SEG);
  for (int i = 0; i < SEG; i++) {
    float s = (float(i) + 0.5) / float(SEG);
    vec2 hv = leanDir * lean * pow(s, 1.3) * 1.6 + F * pow(s, 0.8) * 1.7;
    float wave = sin(uTime * 2.0 + ph - s * 5.5) * 0.16 * s * (0.35 + uGust);
    float theta = clamp(length(hv) + wave, -1.2, 1.78);
    dirH = normalize(hv + leanDir * 1e-3);
    vec3 dir = vec3(dirH.x * sin(theta), cos(theta), dirH.y * sin(theta));
    if (i < k) pos += dir * segL;
    if (i == min(k, SEG - 1)) T = dir;
  }

  float t = float(k) / float(SEG);
  float width = w * (1.0 - pow(t, 5.0)) * (0.85 + 0.15 * sin(t * 3.14159));
  width *= smoothstep(0.25, 0.7, length(root - uEye.xz));   // nothing grows through the lens
  vec3 side0 = normalize(vec3(-dirH.y, 0.0, dirH.x));
  side0 = normalize(side0 - T * dot(side0, T));
  float tw = (sd - 0.5) * 2.4 + t * (1.2 + 2.2 * sd) * (sd < 0.5 ? -1.0 : 1.0) + sin(uTime * 0.8 + ph + t * 2.0) * 0.35 * t;
  vec3 side = side0 * cos(tw) + cross(T, side0) * sin(tw);
  vec3 p = pos + side * aV.y * width * 0.5;
  vPos = p; vT = T; vN = normalize(cross(side, T)); vS = t; vSeed = sd;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const BLADE_FS = `#version 300 es
precision highp float;
${COMMON}
uniform vec3 uEye;
in vec3 vPos; in vec3 vN; in vec3 vT; in float vS; in float vSeed;
out vec4 o;
void main() {
  vec3 V = normalize(uEye - vPos);
  vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
  vec3 T = normalize(vT), L = uL, H = normalize(L + V);
  float caus = 0.25 + 1.5 * causticWorld(vPos, 2.6);
  float depthLight = exp(-(${SURFACE_Y.toFixed(1)} - vPos.y) * 0.07);
  float nl = dot(N, L);
  float diff = max(nl, 0.0);
  float spec = pow(max(dot(N, H), 0.0), 24.0);
  float th = dot(T, H);
  float aniso = pow(sqrt(max(1.0 - th * th, 0.0)), 28.0) * smoothstep(-0.1, 0.4, nl);
  float trans = pow(max(dot(-V, L), 0.0), 3.0) * (0.5 + 0.5 * vS) * 0.35;  // backlit leaf glow
  float ao = mix(0.05, 1.0, smoothstep(0.0, 0.8, vS));
  vec3 albedo = mix(vec3(0.009, 0.011, 0.010), vec3(0.017, 0.019, 0.016), vSeed);
  vec3 col = albedo * (diff * 1.4 + 0.05) * caus * uLightCol
           + uLightCol * (spec * 2.2 + aniso * 1.6) * caus
           + uLightCol * vec3(0.55, 0.75, 0.6) * trans * caus * 0.9;
  col *= ao * depthLight;
  float dist = length(uEye - vPos);
  col = fogTo(col, dist);
  col += uLightCol * 0.012 * shafts(uEye, -V, dist);
  o = vec4(finish(col, gl_FragCoord.xy), 1.0);
}`;

const FLOOR_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aP;
uniform mat4 uVP;
out vec3 vPos;
void main() { vPos = vec3(aP.x, 0.0, aP.y); gl_Position = uVP * vec4(vPos, 1.0); }`;

const FLOOR_FS = `#version 300 es
precision highp float;
${COMMON}
uniform vec3 uEye;
in vec3 vPos;
out vec4 o;
void main() {
  float r = length(vPos.xz);
  float ripple = 0.6 + 0.4 * sin(dot(vPos.xz, vec2(5.3, 2.1)) + sin(vPos.x * 1.7) * 1.4);
  float caus = causticWorld(vPos, 2.8);
  vec3 col = vec3(0.003, 0.0034, 0.003) * ripple * (0.3 + caus) * uLightCol;
  col *= smoothstep(${(FIELD_R + 6).toFixed(1)}, ${(FIELD_R - 2).toFixed(1)}, r);
  float dist = length(uEye - vPos);
  vec3 V = normalize(uEye - vPos);
  col = fogTo(col, dist);
  col += uLightCol * 0.012 * shafts(uEye, -V, dist);
  o = vec4(finish(col, gl_FragCoord.xy), 1.0);
}`;

const SKY_VS = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
${COMMON}
uniform vec3 uEye, uRight, uUp, uFwd;
uniform vec2 uTan;
in vec2 vNdc;
out vec4 o;
void main() {
  vec3 ray = normalize(uFwd + uRight * vNdc.x * uTan.x + uUp * vNdc.y * uTan.y);
  vec3 col = uWater;
  if (ray.y > 0.0) {
    // Snell's window: the sky compressed into a 48.6° cone overhead, broken by the surface.
    float window = smoothstep(0.60, 0.70, ray.y);
    vec3 hit = uEye + ray * (${SURFACE_Y.toFixed(1)} - uEye.y) / ray.y;
    float ripples = causticAt(hit.xz * 0.9, uTime * 1.1, 1.6);
    float sun = pow(max(dot(ray, normalize(vec3(uL.x * 0.75, uL.y, uL.z * 0.75))), 0.0), 90.0);
    float dim = exp(-(${SURFACE_Y.toFixed(1)} - uEye.y) / max(ray.y, 0.05) * 0.06);
    col += uLightCol * dim * (window * (0.002 + 0.008 * ripples) + sun * (0.08 + 0.15 * ripples));
  }
  col += uLightCol * 0.012 * shafts(uEye, ray, 30.0);
  o = vec4(finish(col, gl_FragCoord.xy), 1.0);
}`;

const SNOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aS;   // box position (0..1)^3, size seed
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uTime, uScale;
uniform vec3 uDrift;
out float vA;
void main() {
  vec3 box = vec3(14.0, 7.0, 14.0);
  vec3 p = aS.xyz * box + uDrift + vec3(0.0, -uTime * 0.035, 0.0)
         + 0.08 * vec3(sin(uTime * 0.7 + aS.w * 30.0), sin(uTime * 0.5 + aS.w * 17.0), cos(uTime * 0.6 + aS.w * 23.0));
  p = uEye + mod(p - uEye + box * 0.5, box) - box * 0.5;
  p.y = clamp(p.y, 0.02, 9.0);
  vec4 c = uVP * vec4(p, 1.0);
  float d = length(p - uEye);
  gl_PointSize = clamp(uScale * (0.4 + aS.w) / max(d, 0.2), 1.0, 9.0);
  vA = exp(-d * 0.22) * (0.25 + 0.75 * aS.w) * smoothstep(0.15, 0.6, d);
  gl_Position = c;
}`;

const SNOW_FS = `#version 300 es
precision highp float;
uniform vec3 uLightCol;
in float vA;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 3.0) * vA * 0.22;
  o = vec4(uLightCol * a, a);
}`;

// ---------- GL helpers ----------
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}
const P = {
  blade: program(BLADE_VS, BLADE_FS),
  floor: program(FLOOR_VS, FLOOR_FS),
  sky: program(SKY_VS, SKY_FS),
  snow: program(SNOW_VS, SNOW_FS),
};

// Blade geometry: one shared strip, instanced.
const bladeVAO = gl.createVertexArray();
gl.bindVertexArray(bladeVAO);
{
  const strip = new Float32Array((SEG + 1) * 4);
  for (let k = 0; k <= SEG; k++) strip.set([k, -1, k, 1], k * 4);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}
const instanceBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
let bladeCount = 0;
const cam = { yaw: 0.35, pitch: 0.42, dist: 2.6, target: [0, 0.55, 0], fov: 50 * Math.PI / 180 };
function reseed(s) {
  seed = s;
  const { data, count, focus } = plant(seed);
  bladeCount = count;
  cam.target[0] = focus[0]; cam.target[2] = focus[1];
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.STATIC_DRAW);
  const url = new URL(location.href); url.searchParams.set('seed', seed); history.replaceState(null, '', url);
}

const floorVAO = gl.createVertexArray();
gl.bindVertexArray(floorVAO);
{
  const R = FIELD_R + 8, n = 64, v = [0, 0];
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; v.push(Math.cos(a) * R, Math.sin(a) * R); }
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}
const FLOOR_VERTS = 66;

const snowVAO = gl.createVertexArray();
gl.bindVertexArray(snowVAO);
{
  const rng = mulberry32(seed + 5), v = new Float32Array(SNOW_N * 4);
  for (let i = 0; i < v.length; i++) v[i] = rng();
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
}
const skyVAO = gl.createVertexArray();
gl.bindVertexArray(null);

// ---------- matrices ----------
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, target) {
  const f = norm(sub(target, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const view = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
    -dot(r, eye), -dot(u, eye), dot(f, eye), 1]);
  return { view, f, r, u };
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s;
  }
  return o;
}

// ---------- the current: calm water broken by long gusts, with a swell's surge ----------
function current(t, seed) {
  const SPACING = 34, RAMP = 7, HOLD = 9, CALM = 0.10, PEAK = 1.0;
  const i = Math.floor(t / SPACING), at = t - i * SPACING;
  const amp = (PEAK - CALM) * (0.55 + 0.45 * mulberry32(seed * 131 + i)());
  const sm = x => x * x * (3 - 2 * x);
  let env = 0;
  if (at < RAMP) env = sm(at / RAMP);
  else if (at < RAMP + HOLD) env = 1;
  else if (at < 2 * RAMP + HOLD) env = 1 - sm((at - RAMP - HOLD) / RAMP);
  const gust = CALM + amp * env;
  const surge = Math.sin(t * Math.PI * 2 / 8.5) * (0.25 + 0.5 * gust) + 0.15 * Math.sin(t * 1.9 + 1.3);
  const az = 0.6 + 0.45 * Math.sin(t * 0.011) + 0.15 * Math.sin(t * 0.047);
  return { gust, surge, flow: [Math.cos(az), Math.sin(az)] };
}

// ---------- camera: low among the blades, looking up into them ----------
let W = 1, H = 1, dpr = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
  canvas.width = W; canvas.height = H;
}
addEventListener('resize', resize); resize();

function cameraFrame(t, cur) {
  const sway = 0.035;
  const eye = [
    cam.target[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw) + sway * cur.flow[0] * cur.surge,
    cam.target[1] + cam.dist * Math.sin(cam.pitch) + 0.02 * Math.sin(t * 0.6),
    cam.target[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw) + sway * cur.flow[1] * cur.surge,
  ];
  eye[1] = Math.max(0.12, eye[1]);
  const look = lookAt(eye, cam.target);
  const aspect = W / H;
  const proj = perspective(cam.fov, aspect, 0.02, 80);
  return { eye, ...look, vp: mul(proj, look.view), aspect, tanV: Math.tan(cam.fov / 2) };
}

// ---------- interaction ----------
const brush = new Float32Array(BRUSH_N * 4).fill(-1000);
let brushHead = 0, lastBrush = 0, time = 0, frame = null;
function ray(px, py) {
  const x = (px / innerWidth) * 2 - 1, y = 1 - (py / innerHeight) * 2;
  const { f, r, u, aspect, tanV, eye } = frame;
  return { eye, d: norm([f[0] + (r[0] * x * aspect + u[0] * y) * tanV, f[1] + (r[1] * x * aspect + u[1] * y) * tanV, f[2] + (r[2] * x * aspect + u[2] * y) * tanV]) };
}
function stroke(px, py, now) {
  if (!frame || now - lastBrush < 35) return;
  const { eye, d } = ray(px, py);
  // Hit the meadow at mid-blade height, or the floor if the ray points down steeply.
  const planeY = 0.55;
  let tt = (planeY - eye[1]) / d[1];
  if (!(tt > 0) || tt > 25) tt = 2.2;
  const hx = eye[0] + d[0] * tt, hz = eye[2] + d[2] * tt;
  brush.set([hx, hz, time, 1], brushHead * 4);
  brushHead = (brushHead + 1) % BRUSH_N; lastBrush = now;
}
const pointers = new Map();
let mode = null, lastPinch = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  mode = (e.button === 2 || e.shiftKey || pointers.size > 1) ? 'orbit' : 'brush';
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); }
  if (mode === 'brush') stroke(e.clientX, e.clientY, performance.now());
  dismissIntro();
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (mode === 'orbit') {
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) zoom(lastPinch / d);
      lastPinch = d;
      cam.yaw -= dx * 0.002; cam.pitch = Math.max(-0.75, Math.min(0.9, cam.pitch + dy * 0.002));
    } else {
      cam.yaw -= dx * 0.004; cam.pitch = Math.max(-0.75, Math.min(0.9, cam.pitch + dy * 0.004));
    }
  } else if (mode === 'brush') stroke(e.clientX, e.clientY, performance.now());
});
const end = e => { pointers.delete(e.pointerId); if (!pointers.size) mode = null; lastPinch = 0; };
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
function zoom(f) { cam.dist = Math.max(0.6, Math.min(12, cam.dist * f)); }
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); dismissIntro(); }, { passive: false });

let paused = false, saveNext = false;
addEventListener('keydown', e => {
  if (e.key === 's' || e.key === 'S') saveNext = true;
  if (e.key === 'r' || e.key === 'R') reseed((Math.random() * 1e6) | 0);
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
});

const intro = document.getElementById('intro');
let introGone = false;
function dismissIntro() { if (!introGone) { introGone = true; intro.classList.add('gone'); } }
setTimeout(dismissIntro, 5000);

// ---------- frame ----------
const WATER = [0.00008, 0.00030, 0.00042];
const LIGHT = [0.80, 0.95, 1.00];
let last = performance.now();
function setCommon(prog, cur, L) {
  const u = prog.u;
  if (u.uTime) gl.uniform1f(u.uTime, time);
  if (u.uL) gl.uniform3fv(u.uL, L);
  if (u.uWater) gl.uniform3fv(u.uWater, WATER);
  if (u.uLightCol) gl.uniform3fv(u.uLightCol, LIGHT);
  if (u.uEye) gl.uniform3fv(u.uEye, frame.eye);
  if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, frame.vp);
}
function render(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) time += dt;
  if (!pointers.size && !paused) cam.yaw += dt * 0.008;
  const cur = current(time, seed);
  frame = cameraFrame(time, cur);
  // The light circles slowly overhead, like a moon seen from below.
  const az = time * (Math.PI * 2 / 240) + 2.1, el = 1.05 + 0.12 * Math.sin(time * 0.017);
  const L = norm([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]);

  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

  gl.useProgram(P.sky.p); setCommon(P.sky, cur, L);
  gl.uniform3fv(P.sky.u.uRight, frame.r); gl.uniform3fv(P.sky.u.uUp, frame.u); gl.uniform3fv(P.sky.u.uFwd, frame.f);
  gl.uniform2f(P.sky.u.uTan, frame.tanV * frame.aspect, frame.tanV);
  gl.bindVertexArray(skyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT); gl.depthFunc(gl.LESS);
  gl.useProgram(P.floor.p); setCommon(P.floor, cur, L);
  gl.bindVertexArray(floorVAO); gl.drawArrays(gl.TRIANGLE_FAN, 0, FLOOR_VERTS);

  gl.useProgram(P.blade.p); setCommon(P.blade, cur, L);
  gl.uniform2fv(P.blade.u.uFlow, cur.flow); gl.uniform1f(P.blade.u.uGust, cur.gust); gl.uniform1f(P.blade.u.uSurge, cur.surge);
  gl.uniform4fv(P.blade.u.uBrush, brush);
  gl.bindVertexArray(bladeVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, bladeCount);

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  gl.useProgram(P.snow.p); setCommon(P.snow, cur, L);
  gl.uniform1f(P.snow.u.uScale, 6.0 * dpr);
  gl.uniform3f(P.snow.u.uDrift, cur.flow[0] * time * 0.12, 0, cur.flow[1] * time * 0.12);
  gl.bindVertexArray(snowVAO); gl.drawArrays(gl.POINTS, 0, SNOW_N);
  gl.depthMask(true);

  if (saveNext) {
    saveNext = false;
    const a = document.createElement('a');
    a.download = `undertow-${seed}.png`; a.href = canvas.toDataURL('image/png'); a.click();
  }
  requestAnimationFrame(render);
}

reseed(seed);
window.__undertow = { seek: t => { time = t; }, cam };
requestAnimationFrame(render);
})();
