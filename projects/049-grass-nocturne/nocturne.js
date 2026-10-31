// 049 — Grass Nocturne: a live grass field for a large screen, locked to the local clock.
//
// A camera drifts through one meadow on a path that is a function of the clock alone: a main
// loop of an hour, a 19.5-minute swerve and a 37-minute rise and fall, counted from the local
// epoch, so the path as a whole repeats only every 20 days (1,731,600 s). It moves at
// walking-in-a-dream speed, ≤ 6 cm/s. The light
// is a single low source whose bearing and height follow the real day: high and flat at noon,
// low and raking at night. The wind is a set of gust fronts crossing the field, also a function
// of the clock. So any screen, after any restart, shows the same moment as every other.
//
// Every blade is computed in the vertex shader from its world cell and a hash (WebGL2, no
// buffers of blades): the meadow is the same wherever the camera goes, and nothing is stored.
//
// URL: ?seed=N · ?blades=<per cell, 4…24> · ?scale=<render scale> · ?dim=19-22:0.6,22-7:0.35
//      ?hud=0 · ?at=2026-11-02T14:20 & ?speed=60 (rehearsal) · ?still=1 (hold the clock)
//      ?glitch=<1…10> · ?colour=<1…7> · ?measure=<1…10> (hold one event, for checking) · ?score=0
//
// Over it runs the score (score.js): glitches on prime minutes, colour on prime clock times,
// a measurement every 30 s. The glitches and colours are abstract notions — time, memory,
// order, identity, resolution — and the measurements read the same functions that draw.
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;

  // ───────────────────────── the clock-locked score (pure; tested in Node) ─────────────────────────
  const PATH_REPEAT = 1731600;                                    // lcm(3600, 1170, 2220) s
  const epochS = (ms) => (ms - new Date(ms).getTimezoneOffset() * 60000) / 1000;   // local seconds, continuous
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
  const api = { dayS, epochS, eyeAt, lightAt, windAt, dimAt, PATH_REPEAT };
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
// the sky's work: cloud shadows drifting downwind, and a mist lit from the light's side
uniform vec2 uCloudOff; uniform float uCloudCover; uniform float uMist;
float fbm2(vec2 p) { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 5.2) + 0.1 * vnoise(p * 4.1 + 1.7); }
float cloudShade(vec2 p) { return 1.0 - 0.78 * smoothstep(uCloudCover, uCloudCover + 0.16, fbm2((p + uCloudOff) / 34.0)); }
float atmos(float e, vec3 pos, vec3 eye, vec3 L, float fog) {
  float t = exp(-distance(pos, eye) * fog);
  vec2 vh = normalize((pos - eye).xz + 1e-5), lh = normalize(L.xz + 1e-5);
  float side = 0.45 + 0.55 * pow(max(0.0, dot(vh, lh)), 2.0);
  return e * t + uMist * side * (1.0 - t);
}
float ground(vec2 p) {
  return 0.8 * sin(p.x * 0.053 + 1.3) * cos(p.y * 0.047 - 0.4) + 0.4 * sin(p.x * 0.11 - p.y * 0.083 + 2.0) + 0.45 * (vnoise(p * 0.18) - 0.5);
}
`;
  const GRASS_VS = COMMON + `
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uOrigin; uniform float uCell; uniform int uN; uniform int uPer;
uniform float uTime; uniform vec3 uWind; uniform int uSegs; uniform float uSpan;
uniform int uGlitch; uniform float uG; uniform float uP;
out float vT; out vec3 vN; out vec3 vTan; out vec3 vPos; out float vTone; out float vSilver; out float vFade; out float vShade;
out float vId; out float vCluster; flat out uint vHash;
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
  // transposition: the wind turns a quarter, blowing across its own direction
  vec2 Wd = uWind.xy;
  if (uGlitch == 4) Wd = normalize(mix(uWind.xy, vec2(-uWind.y, uWind.x), uG) + 1e-4);
  float along = dot(root, Wd);
  float gust = 0.5 + 0.5 * sin(along * 0.28 - uTime * 1.6 + 2.0 * vnoise(root * 0.07));
  float flutter = 0.08 * sin(uTime * (2.2 + 1.5 * h01(hb ^ 0x4u)) + h01(hb ^ 0x5u) * 6.28);
  vec2 bendDir = own * lean + Wd * uWind.z * (0.2 + 0.9 * gust * gust) + own.yx * vec2(1.0, -1.0) * flutter;
  // a bending blade shows its paler side: strong gusts read as bright waves crossing the field
  float windAmt = uWind.z * (0.2 + 0.9 * gust * gust);
  vSilver = smoothstep(0.22, 0.75, windAmt);
  // the window of cells fades out at its edges, so the meadow has no hard end
  vec2 lo = root - uOrigin, hi = uOrigin + uSpan - root;
  vFade = smoothstep(0.0, 7.0, min(min(lo.x, lo.y), min(hi.x, hi.y)));
  vShade = cloudShade(root);
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
  // quantisation: positions snap to a grid that halves six times, until the field is smooth again
  if (uGlitch == 5 && uG > 0.01) { float q = 0.64 * pow(0.5, floor(uP * 7.0)) * uG; pos = floor(pos / q + 0.5) * q; }
  vT = t; vTan = tan; vN = normalize(cross(across, tan)); vPos = pos; vTone = 0.8 + 0.4 * h01(hb ^ 0x7u);
  vId = float(hash(hb) & 0xffffu) / 65535.0; vHash = hash(hb);
  vCluster = h01(uint(int(floor(root.x * 1.1 + 3.0))) * 0x9e3779b9u ^ uint(int(floor(root.y * 1.1 + 3.0))) * 0x85ebca6bu ^ 0x51u);
  gl_Position = uVP * vec4(pos, 1.0);
  // sorting: every blade slides across the screen to the place its height ranks it, then back
  if (uGlitch == 3) gl_Position.x = mix(gl_Position.x, (clamp(H / 1.0, 0.0, 1.0) * 2.0 - 1.0) * gl_Position.w * 0.92, uG * 0.92);
}`;
  const GRASS_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure; uniform int uShow;
uniform int uGlitch; uniform float uG; uniform int uTint; uniform float uTintE; uniform float uHue;
in float vT; in vec3 vN; in vec3 vTan; in vec3 vPos; in float vTone; in float vSilver; in float vFade; in float vShade;
in float vId; in float vCluster; flat in uint vHash;
out vec4 frag;
vec3 hue3(float h) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return mix(vec3(1.0), k, 0.78); }
void main() {
  vec3 V = normalize(uEye - vPos), N = faceforward(vN, -V, vN), H = normalize(uLight + V);
  float diff = 0.3 + 0.7 * max(dot(N, uLight), 0.0);
  float th = dot(vTan, H), sheen = pow(max(0.0, 1.0 - th * th), 36.0) * (0.25 + 0.75 * vT);
  float rim = pow(1.0 - abs(dot(N, V)), 3.0) * 0.25 * vT;
  float occ = mix(0.12, 1.0, smoothstep(0.0, 0.75, vT));
  float silver = 0.95 * vSilver * vT * (0.4 + 0.6 * diff);
  float e = (0.03 + (0.46 * diff * vTone + 1.2 * sheen + rim + silver) * vShade) * occ * vFade;
  e = atmos(e, vPos, uEye, uLight, uFog);
  float lum = 1.0 - exp(-e * uExposure);
  float g = (h01(uint(gl_FragCoord.x) * 1973u ^ uint(gl_FragCoord.y) * 9277u) - 0.5) / 255.0;   // no banding on 8-bit panels
  // colour that encodes something about the blade: its number, its distance, its tuft, the wind
  vec3 col = vec3(lum);
  float dist = distance(vPos, uEye);
  if (uTint == 1) col = mix(col, lum * hue3(vId) * 1.7, uTintE);
  if (uTint == 2) col = mix(col, lum * hue3(mix(0.04, 0.62, clamp(dist / 40.0, 0.0, 1.0))) * 1.7, uTintE);
  if (uTint == 4) col = mix(col, lum * hue3(vCluster) * 1.7, uTintE);
  if (uTint == 7) col = mix(col, mix(vec3(lum), lum * hue3(uHue) * 2.2, 0.3 + 0.7 * vSilver), uTintE);
  // identity: each blade drawn as its own number, the 16 low bits of its hash along its length
  if (uGlitch == 7) { uint bit = (vHash >> uint(min(15.0, floor(vT * 16.0)))) & 1u; col = mix(col, vec3(float(bit) * (0.35 + 0.65 * vFade)), uG); }
  frag = vec4(col + g, 1.0);
  if (uShow == 1) frag = vec4(vec3(vShade), 1.0);        // ?show=clouds: the cloud shadows alone
  if (uShow == 2) frag = vec4(vec3(vSilver), 1.0);       // ?show=gusts: where the wind turns blades pale
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
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure; in vec3 vPos; out vec4 frag;
void main() { float e = atmos((0.012 + 0.06 * max(uLight.y, 0.0)) * cloudShade(vPos.xz), vPos, uEye, uLight, uFog); frag = vec4(vec3(1.0 - exp(-e * uExposure)), 1.0); }`;
  // a tree line on a ring round the field, its height from noise on the ground plane (no seam)
  const TREES_VS = COMMON + `
uniform mat4 uVP; uniform int uM; uniform float uR;
out vec3 vPos;
void main() {
  int i = gl_VertexID / 2; bool top = gl_VertexID % 2 == 1;
  float a = float(i) / float(uM) * 6.2831853;
  vec2 p = vec2(cos(a), sin(a)) * uR;
  float n = vnoise(p * 0.09 + 11.0), n2 = vnoise(p * 0.45 + 3.0);
  float crowns = vnoise(p * 1.1 + 5.0) * 0.6 + vnoise(p * 2.6 + 1.0) * 0.4;   // the broken edge of leaves
  float hgt = 1.4 + 7.5 * pow(n, 1.8) + 1.2 * n2 + (0.6 + 2.0 * n) * crowns;   // hedgerow, trees standing out of it
  vPos = vec3(p.x, ground(p * 0.5) + (top ? hgt : -3.0), p.y);
  gl_Position = uVP * vec4(vPos, 1.0);
}`;
  const TREES_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure; in vec3 vPos; out vec4 frag;
void main() { float e = atmos(0.0, vPos, uEye, uLight, uFog * 0.45); frag = vec4(vec3(1.0 - exp(-e * uExposure)), 1.0); }`;
  // the sky: black, with the mist glowing low on the light's side and a faint airglow at the horizon
  const SKY_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0); }`;
  const SKY_FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uHorizonY; uniform float uLightX; uniform float uMist; uniform float uExposure; out vec4 frag;
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float glow = exp(-max(0.0, ndc.y - uHorizonY) / 0.12);
  float side = 0.45 + 0.55 * exp(-pow(ndc.x - uLightX, 2.0) / 0.8);
  float e = (uMist * 1.15 * side + 0.012) * glow;
  frag = vec4(vec3(1.0 - exp(-e * uExposure)), 1.0);
}`;

  // the finishing pass: glitches that act on the whole image, and colours that tint it; a
  // 64-second history of frames (one a second, 320 × 180) feeds the time slice and the echo
  const POST_FS = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2D uScene; uniform sampler2DArray uHist; uniform int uHead; uniform int uLayers; uniform float uFilled;
uniform vec2 uRes; uniform int uGlitch; uniform float uG; uniform float uP; uniform int uTint; uniform float uTintE; uniform float uHue;
out vec4 frag;
vec3 hue3(float h) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return mix(vec3(1.0), k, 0.78); }
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 past(vec2 uv, float ago) {
  float n = min(floor(ago + 0.5), uFilled);
  int layer = (uHead - int(n) + uLayers * 8) % uLayers;
  return texture(uHist, vec3(uv, float(layer))).rgb;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uScene, uv).rgb;
  if (uGlitch == 1) c = mix(c, past(uv, uv.x * 40.0), uG);                                   // time slice
  if (uGlitch == 2 && abs(uv.y - mix(1.25, -0.25, uP)) < 0.13) c = mix(c, past(uv, 60.0), uG);   // echo
  if (uGlitch == 6) c = mix(c, vec3(step(0.14, lumOf(c))), uG);                               // one bit
  if (uGlitch == 8) c = mix(c, texture(uScene, vec2(uv.x > 0.5 ? 1.0 - uv.x : uv.x, uv.y)).rgb, uG);   // mirror
  if (uGlitch == 9) c = mix(c, 1.0 - c, uG);                                                    // inversion
  if (uGlitch == 10) {                                                                          // recursion
    vec2 p = uv; bool edge = false;
    const vec2 lo = vec2(0.6, 0.56), hi = vec2(0.94, 0.9);
    for (int i = 0; i < 5; i++) {
      if (any(lessThan(p, lo)) || any(greaterThan(p, hi))) break;
      vec2 q = (p - lo) / (hi - lo);
      if (min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)) < 0.008) { edge = true; break; }
      p = q;
    }
    vec3 r = edge ? vec3(0.75) : texture(uScene, p).rgb;
    c = mix(c, r, uG);
  }
  float L = lumOf(c);
  if (uTint == 3) c = mix(c, L * hue3(uHue) * 1.7, uTintE);                                    // hue by time
  if (uTint == 5) c = mix(c, L * hue3(uv.x < 0.5 ? uHue : fract(uHue + 0.5)) * 1.7, uTintE);  // complement
  if (uTint == 6) {                                                                             // prime colour
    vec3 prim = uHue < 0.3333 ? vec3(1.0, 0.1, 0.08) : uHue < 0.6667 ? vec3(0.1, 1.0, 0.22) : vec3(0.16, 0.26, 1.0);
    c = mix(c, L * prim * 1.9, uTintE);
  }
  frag = vec4(c, 1.0);
}`;
  const POST_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // ───────────────────────── the screen ─────────────────────────
  const Q = new URLSearchParams(location.search), num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const O = {
    seed: num('seed', 49) >>> 0, per: Math.max(4, Math.min(24, num('blades', 14) | 0)), scale: Math.max(0.25, Math.min(2, num('scale', 1))),
    dim: Q.has('dim') ? Q.get('dim') : '19-22:0.6,22-7:0.35', hud: Q.get('hud') !== '0', speed: Math.max(0, num('speed', 1)), still: Q.get('still') === '1',
    score: Q.get('score') !== '0', glitch: num('glitch', 0) | 0, colour: num('colour', 0) | 0, measure: num('measure', 0) | 0,
  };
  const Score = global.Score;
  const t0Real = Date.now(), t0Wall = Q.has('at') && !isNaN(Date.parse(Q.get('at'))) ? Date.parse(Q.get('at')) : t0Real;
  const now = () => (O.still ? t0Wall : t0Wall + (Date.now() - t0Real) * O.speed);

  const canvas = document.getElementById('gl'), hud = document.getElementById('hud'), stage = document.getElementById('stage');
  hud.hidden = !O.hud;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
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
  const trees = program(TREES_VS, TREES_FS), sky = program(SKY_VS, SKY_FS), post = program(POST_VS, POST_FS);
  const TREE_M = 2400, TREE_R = 70, SHOW = { clouds: 1, gusts: 2 }[Q.get('show')] || 0;
  const vao = gl.createVertexArray();
  // the ground mesh: indices for a (RES+1)² grid
  const RES = 96, idx = [];
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const a = j * (RES + 1) + i; idx.push(a, a + 1, a + RES + 1, a + 1, a + RES + 2, a + RES + 1); }
  const ibo = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

  const CELL = 0.28, SPAN = 46, N = Math.ceil(SPAN / CELL), SEGS = 6;
  // targets: the scene drawn with 4× antialiasing, resolved into a texture the finishing pass reads;
  // a ring of 64 small frames, one a second, for the time slice and the echo
  const ov = document.getElementById('ov'), ox = ov ? ov.getContext('2d') : null;
  const HIST_W = 320, HIST_H = 180, LAYERS = 64;
  let msFB = null, msColor = null, msDepth = null, sceneFB = null, sceneTex = null;
  const histTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, histTex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, HIST_W, HIST_H, LAYERS);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const histFB = gl.createFramebuffer();
  let head = 0, filled = -1, lastSecond = -1;
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * O.scale;
    const W = canvas.width = Math.round(innerWidth * dpr), H = canvas.height = Math.round(innerHeight * dpr);
    if (ov) { ov.width = W; ov.height = H; }
    for (const o of [msFB, sceneFB]) if (o) gl.deleteFramebuffer(o);
    for (const o of [msColor, msDepth]) if (o) gl.deleteRenderbuffer(o);
    if (sceneTex) gl.deleteTexture(sceneTex);
    msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
    msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
    msFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFB);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    sceneTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    sceneFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  addEventListener('resize', resize); resize();
  function pushHistory(all) {                     // the resolved scene, scaled into the ring
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, histFB);
    const n = all ? LAYERS : 1;
    for (let i = 0; i < n; i++) {
      head = (head + 1) % LAYERS;
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, histTex, 0, head);
      gl.blitFramebuffer(0, 0, canvas.width, canvas.height, 0, 0, HIST_W, HIST_H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
    filled = all ? 0 : Math.min(LAYERS - 1, filled + 1);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
  function entropyOfLatest() {                    // bits per pixel of the newest small frame's brightness
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, histFB);
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, histTex, 0, head);
    const px = new Uint8Array(HIST_W * HIST_H * 4); gl.readPixels(0, 0, HIST_W, HIST_H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    const bins = new Float64Array(256);
    for (let i = 0; i < px.length; i += 4) bins[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
    let hBits = 0; const n = HIST_W * HIST_H;
    for (const b of bins) if (b) { const q = b / n; hBits -= q * Math.log2(q); }
    return hBits;
  }

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
    const ms = now(), s = dayS(ms), sE = epochS(ms), time = (ms / 1000) % 86400;
    // the score: which glitch, which colour, which measurement, now
    const G = O.glitch ? { kind: O.glitch, p: (sE % 12) / 12, e: 1 } : O.score ? Score.glitchAt(ms) : null;
    const C = O.colour ? { mode: O.colour, hue: 0.07, e: 1 } : O.score ? Score.colourAt(ms) : null;
    const tintHue = C ? (C.mode === 3 ? s / 86400 : C.hue) : 0;
    // look along the path, 14 m ahead, a little above the grass there
    const e = eyeAt(sE), pa = eyeAt(sE - 60), pb = eyeAt(sE + 60);
    let hx = pb.x - pa.x, hz = pb.z - pa.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const eye = [e.x, groundH(e.x, e.z) + e.h, e.z];
    const lx = e.x + hx * 14, lz = e.z + hz * 14;
    const look = [lx, groundH(lx, lz) + 0.35, lz];
    const L = lightAt(s), W = windAt(s), aspect = canvas.width / canvas.height;
    const VP = mat(eye, look, 0.62, aspect);
    // the window of cells sits ahead of the eye, where the view is
    const fx = look[0] - eye[0], fz = look[2] - eye[2], fl = Math.hypot(fx, fz) || 1;
    const origin = [eye[0] + fx / fl * (SPAN * 0.38) - SPAN / 2, eye[2] + fz / fl * (SPAN * 0.38) - SPAN / 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFB);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // the night is darker than the day: exposure follows the light's height (7° → 1.5, 38° → 3.0)
    const elev = Math.asin(L[1]) * 180 / Math.PI, exposure = 1.5 + 1.5 * Math.min(1, Math.max(0, (elev - 7) / 31)), fog = 0.04;

    // the day's atmosphere: mist at dawn and dusk, clouds drifting downwind, their cover changing
    const hr = s / 3600, mist = 0.01 + 0.04 * Math.exp(-(((hr - 6.5) / 1.5) ** 2)) + 0.03 * Math.exp(-(((hr - 19) / 1.6) ** 2));
    const cloudOff = [-s * 1.8 * Math.cos(0.6), -s * 1.8 * Math.sin(0.6)], cover = 0.36 + 0.14 * Math.sin(TAU * s / 5400);   // from broken cloud to mostly clear, every 90 min
    const atmosU = (u2) => { gl.uniform2f(u2.uCloudOff, cloudOff[0], cloudOff[1]); gl.uniform1f(u2.uCloudCover, cover); gl.uniform1f(u2.uMist, mist); };
    // where the horizon and the light fall on screen
    const ndc = (x, y, z) => { const w = VP[3] * x + VP[7] * y + VP[11] * z + VP[15]; return [(VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / w, (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / w, w]; };
    const hzn = ndc(eye[0] + hx * 500, eye[1], eye[2] + hz * 500);
    const lhl = Math.hypot(L[0], L[2]) || 1, lp = ndc(eye[0] + L[0] / lhl * 500, eye[1], eye[2] + L[2] / lhl * 500);
    const lightX = lp[2] > 0 ? lp[0] : (lp[0] > 0 ? -3 : 3);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(sky.p); const k2 = sky.u;
    gl.uniform2f(k2.uRes, canvas.width, canvas.height); gl.uniform1f(k2.uHorizonY, hzn[1]); gl.uniform1f(k2.uLightX, lightX);
    gl.uniform1f(k2.uMist, mist); gl.uniform1f(k2.uExposure, exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(trees.p); const tr = trees.u;
    gl.uniformMatrix4fv(tr.uVP, false, VP); gl.uniform1i(tr.uM, TREE_M); gl.uniform1f(tr.uR, TREE_R); gl.uniform3fv(tr.uEye, eye); gl.uniform3fv(tr.uLight, L);
    gl.uniform1f(tr.uFog, fog); gl.uniform1f(tr.uExposure, exposure); gl.uniform1f(tr.uSeed, O.seed); atmosU(tr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2 * (TREE_M + 1));

    gl.useProgram(groundP.p); const g = groundP.u; atmosU(g); gl.uniform3fv(g.uLight, L);
    gl.uniformMatrix4fv(g.uVP, false, VP); gl.uniform2f(g.uOrigin, origin[0], origin[1]); gl.uniform1f(g.uSpan, SPAN);
    gl.uniform1i(g.uRes, RES); gl.uniform3fv(g.uEye, eye); gl.uniform1f(g.uFog, fog); gl.uniform1f(g.uExposure, exposure); gl.uniform1f(g.uSeed, O.seed);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(grass.p); const u = grass.u; atmosU(u); gl.uniform1f(u.uSpan, SPAN);
    gl.uniform1i(u.uShow, SHOW);
    gl.uniform1i(u.uGlitch, G ? G.kind : 0); gl.uniform1f(u.uG, G ? G.e : 0); gl.uniform1f(u.uP, G ? G.p : 0);
    gl.uniform1i(u.uTint, C ? C.mode : 0); gl.uniform1f(u.uTintE, C ? C.e : 0); gl.uniform1f(u.uHue, tintHue);
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uEye, eye); gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform1f(u.uCell, CELL); gl.uniform1i(u.uN, N); gl.uniform1i(u.uPer, O.per); gl.uniform1f(u.uTime, time);
    gl.uniform3f(u.uWind, W.x, W.z, W.strength); gl.uniform1i(u.uSegs, SEGS); gl.uniform3fv(u.uLight, L);
    gl.uniform1f(u.uFog, fog); gl.uniform1f(u.uExposure, exposure); gl.uniform1f(u.uSeed, O.seed);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (SEGS + 1), N * N * O.per);

    // resolve the antialiased scene; once a second, keep a small copy for the history
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFB);
    gl.blitFramebuffer(0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    const second = Math.floor(ms / 1000);
    if (filled < 0) pushHistory(true); else if (second !== lastSecond) pushHistory(false);
    lastSecond = second;
    // the finishing pass, to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(post.p); const pu = post.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(pu.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, histTex); gl.uniform1i(pu.uHist, 1);
    gl.uniform1i(pu.uHead, head); gl.uniform1i(pu.uLayers, LAYERS); gl.uniform1f(pu.uFilled, filled);
    gl.uniform2f(pu.uRes, canvas.width, canvas.height);
    gl.uniform1i(pu.uGlitch, G ? G.kind : 0); gl.uniform1f(pu.uG, G ? G.e : 0); gl.uniform1f(pu.uP, G ? G.p : 0);
    gl.uniform1i(pu.uTint, C ? C.mode : 0); gl.uniform1f(pu.uTintE, C ? C.e : 0); gl.uniform1f(pu.uHue, tintHue);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);

    overlay(ms, sE, { eye, look, hx, hz, VP, ndc, W, G, C, origin });

    stage.style.opacity = String(dimAt(ms, O.dim));
    if (ov) ov.style.opacity = stage.style.opacity;
    if (O.hud) {
      const d = new Date(ms), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      hud.textContent = 'GRASS NOCTURNE · ' + hh + ' · EYE ' + e.h.toFixed(2) + ' M · LIGHT ' + Math.round(Math.asin(L[1]) * 180 / Math.PI) + '° · WIND ' + W.strength.toFixed(2);
    }
    if (!O.still) requestAnimationFrame(frame);       // a held clock is drawn once
    else canvas.dataset.drawn = '1';
  }
  // ───────────────────────── the measurements ─────────────────────────
  // Each reads the same functions that draw: the blade's own hash and shape, the thinning, the
  // census of the window, the clock, the score. Drawn in the single-stroke letters of 048.
  const font = global.StrokeFont;
  const PER_SEGS = SEGS, FRAME_EPOCH = new Date(2026, 10, 1).getTime();      // frames counted from 1 Nov 2026, 00:00
  const hbOf = (cx, cz, k) => ihash(((Math.imul(cx >>> 0, 73856093) ^ Math.imul(cz >>> 0, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(O.seed, 2654435761)) >>> 0));
  const h01 = (x) => (ihash(x) & 0xffffff) / 16777215;
  const smoothJS = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function bladeAt(cx, cz, k) {                   // the vertex shader's blade, in JS
    const hb = hbOf(cx, cz, k), rx = (cx + h01(hb)) * CELL, rz = (cz + h01((hb ^ 0x68bc21eb) >>> 0)) * CELL;
    const meadow = smoothJS(0.25, 0.8, 0.6 * vnoise(rx * 0.06, rz * 0.06) + 0.4 * vnoise(rx * 0.17 + 9, rz * 0.17 + 9));
    const tuft = vnoise(rx * 1.1 + 3, rz * 1.1 + 3);
    const H = (0.1 + 0.75 * meadow) * (0.55 + 0.6 * tuft) * (0.7 + 0.5 * h01((hb ^ 1) >>> 0));
    return { hb, x: rx, z: rz, y: groundH(rx, rz), H };
  }
  const keepAt = (d) => Math.min(1, Math.max(0.04, Math.pow(7 / Math.max(d, 7), 1.35)));
  const pad = (n, w) => String(n).padStart(w, '0');
  const grp = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const hhmm = (m) => pad(Math.floor(m / 60), 2) + ':' + pad(m % 60, 2);
  let cacheK = -1, cache = null;
  function measurement(M, ms, sE, f) {
    const R = Score.ih(M.k ^ 0x9e37);
    const fwd = [f.hx, f.hz], right = [-f.hz, f.hx];
    switch (M.kind) {
      case 1: case 2: {                            // a blade, by its number; a blade's chance to be drawn
        const dist = M.kind === 1 ? 5 + (R % 7) : 14 + (R % 18), off = ((R >>> 8) % 100) / 100 * 4 - 2;
        const px = f.eye[0] + fwd[0] * dist + right[0] * off, pz = f.eye[2] + fwd[1] * dist + right[1] * off;
        const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL), b = bladeAt(cx, cz, 0);
        const d = Math.hypot(b.x - f.eye[0], b.z - f.eye[2]), keep = keepAt(d);
        const lines = M.kind === 1
          ? ['CELL (' + cx + ', ' + cz + ') K 0', 'HASH 0X' + b.hb.toString(16).toUpperCase().padStart(8, '0'), 'H ' + b.H.toFixed(2) + ' M - ' + d.toFixed(1) + ' M AWAY']
          : ['P(BLADE) = ' + keep.toFixed(2) + ' AT ' + d.toFixed(1) + ' M', 'DRAWN ' + Math.ceil(keep * O.per) + ' OF ' + O.per + ' IN THIS CELL'];
        return { lines, anchor: [b.x, b.y + b.H * 0.9, b.z] };
      }
      case 3: {                                    // census of this frame
        let blades = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = (Math.floor(f.origin[0] / CELL) + i + 0.5) * CELL, z = (Math.floor(f.origin[1] / CELL) + j + 0.5) * CELL;
          blades += Math.ceil(keepAt(Math.hypot(x - f.eye[0], z - f.eye[2])) * O.per);
        }
        return { lines: [grp(blades) + ' BLADES', grp(blades * 2 * PER_SEGS) + ' TRIANGLES', 'THIS FRAME'] };
      }
      case 4: return { lines: ['FRAME ' + grp(Math.max(0, (ms - FRAME_EPOCH) / (1000 / 60))), 'AT 60 FPS SINCE 1 NOV 2026 00:00'] };
      case 5: { const n = Score.nextPrimes(ms); return { lines: ['NEXT PRIME MINUTE ' + hhmm(n.minute) + ' (' + n.minute + ')', 'IN ' + n.inSeconds + ' S', 'NEXT PRIME CLOCK ' + hhmm(n.clock) + ' (' + (Math.floor(n.clock / 60) * 100 + n.clock % 60) + ')'] }; }
      case 6: return { lines: ['CAMERA LOOP ' + ((sE % 3600) / 3600).toFixed(4), 'SWERVE ' + ((sE % 1170) / 1170).toFixed(4) + ' - BREATH ' + ((sE % 2220) / 2220).toFixed(4), 'DAY ' + (s0(ms) / 86400).toFixed(4)] };
      case 7: { const left = PATH_REPEAT - (sE % PATH_REPEAT), dd = Math.floor(left / 86400), r = left - dd * 86400;
        return { lines: ['PATH REPEATS IN', dd + ' D ' + pad(Math.floor(r / 3600), 2) + ':' + pad(Math.floor(r / 60) % 60, 2) + ':' + pad(Math.floor(r) % 60, 2), 'PERIOD 1 731 600 S = LCM(3600, 1170, 2220)'] }; }
      case 8: { const W = f.W, dist = 9, px = f.eye[0] + fwd[0] * dist, pz = f.eye[2] + fwd[1] * dist, py = groundH(px, pz) + 0.6;
        return { lines: ['W = (' + W.x.toFixed(2) + ', ' + W.z.toFixed(2) + ') X ' + W.strength.toFixed(2)], anchor: [px, py, pz], arrow: [px + W.x * 2.5, py, pz + W.z * 2.5] }; }
      case 9: return { lines: ['ENTROPY OF THIS FRAME', entropyOfLatest().toFixed(2) + ' BITS OF 8'] };
      default: { const t = Score.todaySoFar(ms); return { lines: ['TODAY ' + grp(t.events) + ' EVENTS', t.glitches + ' GLITCHES - ' + t.colours + ' COLOUR MINUTES', grp(t.measures) + ' MEASUREMENTS'] }; }
    }
  }
  const s0 = (ms) => dayS(ms);
  function strokeText(str, x, y, size) {
    if (!font) return;
    for (const pl of font.text(str, x, y, size)) { ox.moveTo(pl[0].x, pl[0].y); for (let i = 1; i < pl.length; i++) ox.lineTo(pl[i].x, pl[i].y); }
  }
  function overlay(ms, sE, f) {
    if (!ox) return;
    const W = ov.width, H = ov.height;
    ox.clearRect(0, 0, W, H);
    const size = Math.max(7, H * 0.016), lh = size * 1.9;
    ox.lineWidth = Math.max(1, H / 900); ox.lineCap = 'round'; ox.lineJoin = 'round';
    ox.strokeStyle = 'rgb(222, 219, 211)'; ox.beginPath();
    // the cause, low on the left, while a glitch or a colour is on
    const causes = [];
    if (f.G && f.G.e > 0.02) causes.push('GLITCH ' + f.G.kind + ' - ' + Score.GLITCHES[f.G.kind].toUpperCase() + (f.G.m !== undefined ? ' - MINUTE ' + f.G.m + ' IS PRIME' : ''));
    if (f.C && f.C.e > 0.02) causes.push('COLOUR ' + f.C.mode + ' - ' + Score.COLOURS[f.C.mode].toUpperCase() + (f.C.hhmm !== undefined ? ' - ' + f.C.hhmm + ' IS PRIME' : ''));
    causes.forEach((c, i) => strokeText(c, W * 0.035, H * 0.93 - (causes.length - 1 - i) * lh, size));
    ox.globalAlpha = 0.85; ox.stroke();
    // the measurement of these 30 seconds
    const M = O.measure ? { kind: O.measure, k: Math.floor(sE / 30), e: 1 } : O.score ? Score.measureAt(ms) : null;
    if (!M || M.e <= 0.01) { ox.globalAlpha = 1; return; }
    if (M.k !== cacheK || O.measure) { cacheK = M.k; cache = measurement(M, ms, sE, f); }
    let info = cache;
    if (M.kind === 4 || M.kind === 5 || M.kind === 7 || M.kind === 10) info = measurement(M, ms, sE, f);   // these count while shown
    ox.beginPath();
    let tx = W * 0.035, ty = H * 0.08;
    if (info.anchor) {
      const a = f.ndc(...info.anchor);
      if (a[2] > 0) {
        const ax = (a[0] * 0.5 + 0.5) * W, ay = (0.5 - a[1] * 0.5) * H;
        ox.moveTo(ax + size * 0.6, ay); ox.arc(ax, ay, size * 0.6, 0, Math.PI * 2);
        tx = Math.min(W * 0.7, ax + size * 3); ty = Math.max(H * 0.05, ay - size * 6);
        ox.moveTo(ax + size * 0.45, ay - size * 0.45); ox.lineTo(tx - size * 0.4, ty + size * 1.2);
        if (info.arrow) {
          const b = f.ndc(...info.arrow);
          if (b[2] > 0) { const bx = (b[0] * 0.5 + 0.5) * W, by = (0.5 - b[1] * 0.5) * H; ox.moveTo(ax, ay); ox.lineTo(bx, by);
            const ang = Math.atan2(by - ay, bx - ax); for (const s2 of [-1, 1]) { ox.moveTo(bx, by); ox.lineTo(bx - Math.cos(ang + s2 * 0.4) * size, by - Math.sin(ang + s2 * 0.4) * size); } }
        }
      }
    }
    info.lines.forEach((line, i) => strokeText(line, tx, ty + i * lh, size));
    ox.globalAlpha = 0.85 * M.e; ox.stroke(); ox.globalAlpha = 1;
  }
  // the logbook: window.NocturneLog('2026-11-02') lists every glitch and colour minute of that day
  global.NocturneLog = (date) => Score.eventsFor(date ? Date.parse(date + 'T12:00:00') : now());

  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (err) { /* optional */ }
  requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : globalThis);
