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
//      ?weather=0 (the built-in day instead of the journey) · ?from=<longitude the journey starts at>
//      ?light=local (light follows the local day, not the sun where the journey is)
//      ?style=auto|nocturne|ink|wash|charcoal|water (auto: the weather chooses) · ?paper=0 (never paper)
//      ?look=real (a coloured field with flowers and sky instead of the line-drawn blades) · ?flowers=0…3
//      ?near=0…1.5 (the faded near field; 0 off) · ?geo=0 (ignore the ground under the journey)
//      ?dichroic=<0…5> (0 off; scales the shimmer) · ?glitch=<1…10> · ?colour=<1…8> · ?measure=<1…10> (hold one event, for checking) · ?score=0
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
uniform float uRelief;
// the real look: colour light from the sun or moon, a sky fill, and a fog the colour of the horizon
uniform int uLook; uniform vec3 uSunCol; uniform vec3 uAmbCol; uniform vec3 uFogCol; uniform float uDry;
vec3 atmosC(vec3 c, vec3 pos, vec3 eye, vec3 L, float fog) {
  float t = exp(-distance(pos, eye) * fog * 0.14);   // real air: barely hazed at 20 m, pale by the horizon
  vec2 vh = normalize((pos - eye).xz + 1e-5), lh = normalize(L.xz + 1e-5);
  float side = 0.8 + 0.3 * pow(max(0.0, dot(vh, lh)), 2.0);
  return c * t + uFogCol * side * (1.0 - t);
}
vec3 toneC(vec3 r, float E) { return 1.0 - exp(-r * E * 2.2); }
float ground(vec2 p) {
  return uRelief * (0.8 * sin(p.x * 0.053 + 1.3) * cos(p.y * 0.047 - 0.4) + 0.4 * sin(p.x * 0.11 - p.y * 0.083 + 2.0) + 0.45 * (vnoise(p * 0.18) - 0.5));
}
`;
  const GRASS_VS = COMMON + `
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uOrigin; uniform float uCell; uniform int uN; uniform int uPer;
uniform float uTime; uniform vec3 uWind; uniform int uSegs; uniform float uSpan;
uniform int uGlitch; uniform float uG; uniform float uP; uniform float uPx; uniform float uDensity; uniform float uHScale;
uniform vec3 uSway; uniform float uBow;
uniform vec4 uW1; uniform vec4 uW2; uniform vec4 uW3; uniform vec4 uW4; uniform vec4 uWo; uniform float uAmp; uniform float uSeaMove; uniform float uSeaWhite; uniform float uSeaT;
float seaCrest(vec2 p) {             // 0 in the trough … 1 on the crest of the sea where the journey is
  vec4 W[4] = vec4[4](uW1, uW2, uW3, uW4); float h = 0.0;
  for (int i = 0; i < 4; i++) h += W[i].w * sin(W[i].z * dot(W[i].xy, p) - uWo[i] * uSeaT + float(i) * 1.7);
  return clamp(0.5 + 0.5 * h / max(uAmp, 1e-3), 0.0, 1.0);
}
out float vCov; out float vSide;
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
  float kf = keep * float(uPer) * uDensity;
  if (float(k) >= ceil(kf)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // the last blade kept in a cell is drawn in proportion to how far it is kept: no blinking
  float fadeK = clamp(kf - float(k), 0.0, 1.0);
  // the meadow: tall in drifts, short in lawns; tufts share a stature
  float meadow = smoothstep(0.25, 0.8, 0.6 * vnoise(root * 0.06) + 0.4 * vnoise(root * 0.17 + 9.0));
  float tuft = vnoise(root * 1.1 + 3.0);
  float H = (0.1 + 0.75 * meadow) * (0.55 + 0.6 * tuft) * (0.7 + 0.5 * h01(hb ^ 0x1u)) * uHScale;
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
  // at sea, the sea's waves roll through the meadow: blades lean with the passing crests
  float crest = 0.5;
  if (uSeaMove > 0.001) { crest = seaCrest(root); bendDir += uW1.xy * uSeaMove * (crest - 0.35) * (0.5 + 1.2 * min(1.0, uAmp)); }
  // a bending blade shows its paler side: strong gusts read as bright waves crossing the field
  float windAmt = uWind.z * (0.2 + 0.9 * gust * gust);
  vSilver = max(smoothstep(0.22, 0.75, windAmt), uSeaMove * uSeaWhite * smoothstep(0.7, 0.97, crest));   // crests that would whiten
  // the window of cells fades out at its edges, so the meadow has no hard end
  vec2 lo = root - uOrigin, hi = uOrigin + uSpan - root;
  vFade = smoothstep(0.0, 7.0, min(min(lo.x, lo.y), min(hi.x, hi.y)));
  vShade = cloudShade(root);
  bendDir += uSway.xy * uSway.z;                                            // unison: the whole field as one
  if (uBow > 0.001) bendDir += normalize(uEye.xz - root + 1e-4) * uBow * 0.9;   // the révérence: toward the viewer
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
  // a leaf narrowing to a real point
  float w = (0.004 + 0.004 * h01(hb ^ 0x6u)) * pow(1.0 - t, 0.75) * (1.0 - 0.25 * t) / sqrt(keep) * fadeK;
  // thinner than a pixel: widen to a pixel and give back the difference as faintness, so thin
  // blades stay continuous lines instead of breaking into dots
  float px = 2.0 * w * uPx / max(distance(pos, uEye), 0.05);
  vCov = 1.0;
  if (px < 1.2 && px > 0.0) { vCov = px / 1.2; w *= 1.2 / px; }
  pos += across * side * w;
  vSide = side;
  // quantisation: positions snap to a grid that halves six times, until the field is smooth again
  if (uGlitch == 5 && uG > 0.01) { float q = 0.64 * pow(0.5, floor(uP * 7.0)) * uG; pos = floor(pos / q + 0.5) * q; }
  // the blade is creased along its middle: each half tilts away, so light falls differently on each
  vec3 flatN = normalize(cross(across, tan));
  vT = t; vTan = tan; vN = normalize(flatN + across * side * 0.45); vPos = pos; vTone = 0.8 + 0.4 * h01(hb ^ 0x7u);
  vId = float(hash(hb) & 0xffffu) / 65535.0; vHash = hash(hb);
  vCluster = h01(uint(int(floor(root.x * 1.1 + 3.0))) * 0x9e3779b9u ^ uint(int(floor(root.y * 1.1 + 3.0))) * 0x85ebca6bu ^ 0x51u);
  gl_Position = uVP * vec4(pos, 1.0);
  // sorting: every blade slides across the screen to the place its height ranks it, then back
  if (uGlitch == 3) gl_Position.x = mix(gl_Position.x, (clamp(H / 1.0, 0.0, 1.0) * 2.0 - 1.0) * gl_Position.w * 0.92, uG * 0.92);
}`;
  const GRASS_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure; uniform int uShow;
uniform int uGlitch; uniform float uG; uniform int uTint; uniform float uTintE; uniform float uHue;
uniform vec3 uDichA; uniform vec3 uDichB; uniform float uDich;
in float vCov; in float vSide;
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
  // light through the blade: lit from behind, its edges and tip glow
  float back = pow(max(0.0, dot(-V, uLight)), 3.0) * (0.35 + 0.65 * vT);
  float trans = back * (0.6 + 0.4 * max(0.0, dot(-N, uLight)));
  float e = (0.03 + (0.46 * diff * vTone + 1.2 * sheen + rim + silver + 0.85 * trans) * vShade) * occ * vFade * vCov;
  e = atmos(e, vPos, uEye, uLight, uFog);
  float lum = 1.0 - exp(-e * uExposure);
  float g = (h01(uint(gl_FragCoord.x) * 1973u ^ uint(gl_FragCoord.y) * 9277u) - 0.5) / 255.0;   // no banding on 8-bit panels
  // colour that encodes something about the blade: its number, its distance, its tuft, the wind
  vec3 col = vec3(lum);
  if (uLook == 1) {
    // a leaf: green varying blade to blade, drying to straw toward the tip and in dry tufts, dark at the root
    vec3 green = mix(vec3(0.08, 0.22, 0.03), vec3(0.22, 0.40, 0.06), vId);
    vec3 straw = mix(vec3(0.42, 0.37, 0.16), vec3(0.55, 0.50, 0.30), vTone - 0.8);
    float dry = clamp(uDry + 0.4 * smoothstep(0.55, 1.0, vT) * (0.25 + 0.75 * vCluster) + 0.2 * (vCluster - 0.5), 0.0, 1.0);
    vec3 alb = mix(green, straw, dry) * mix(0.3, 1.0, smoothstep(0.0, 0.65, vT));
    // a canopy is lit from above as much as on its faces: a high sun still lights the tops
    float sd = max(dot(N, uLight), 0.0), canopy = 0.45 * max(uLight.y, 0.0) * smoothstep(0.2, 1.0, vT) + 0.55 * sd;
    vec3 rad = alb * (uSunCol * (0.06 + canopy) * vShade + uAmbCol * 1.0 * occ)
      + uSunCol * vShade * (0.28 * sheen + 0.12 * silver)                      // the shine along a blade
      + alb * vec3(1.15, 1.3, 0.55) * uSunCol * trans * 1.5 * vShade;           // light through the leaf
    rad *= vFade * vCov;
    col = toneC(atmosC(rad, vPos, uEye, uLight, uFog), uExposure);
    lum = dot(col, vec3(0.299, 0.587, 0.114));
  }
  float dist = distance(vPos, uEye);
  // dichroic: a thin film whose thickness differs a little from blade to blade; the colour it
  // reflects depends on the angles to the viewer and the light, and what the light passes
  // through is the complement. As blades bend and the camera drifts, the colours shift.
  if (uDich > 0.001) {
    float film = 0.7 + 0.6 * vId;
    float phase = film * (1.8 * abs(dot(N, V)) + 0.9 * abs(dot(N, uLight))) + 0.35 * vT;
    float i = 0.5 + 0.5 * cos(6.2831853 * phase);
    vec3 refl = mix(uDichA, uDichB, i), thru = mix(uDichB, uDichA, i);
    vec3 dich = mix(refl, thru, clamp(trans * 2.5, 0.0, 1.0));
    col = mix(col, lum * dich * 1.75, uDich);
  }
  if (uTint == 1) col = mix(col, lum * hue3(vId) * 1.7, uTintE);
  if (uTint == 2) col = mix(col, lum * hue3(mix(0.04, 0.62, clamp(dist / 40.0, 0.0, 1.0))) * 1.7, uTintE);
  if (uTint == 4) col = mix(col, lum * hue3(vCluster) * 1.7, uTintE);
  if (uTint == 7) col = mix(col, mix(vec3(lum), lum * hue3(uHue) * 2.2, 0.3 + 0.7 * vSilver), uTintE);
  // identity: each blade drawn as its own number, the 16 low bits of its hash along its length
  if (uGlitch == 7) { uint bit = (vHash >> uint(min(15.0, floor(vT * 16.0)))) & 1u; col = mix(col, vec3(float(bit) * (0.35 + 0.65 * vFade)), uG); }
  // alpha carries nearness: the finishing pass fades the closest grass
  frag = vec4(col + g, 1.0 - smoothstep(0.6, 4.0, dist));
  if (uShow == 1) frag = vec4(vec3(vShade), 1.0);        // ?show=clouds: the cloud shadows alone
  if (uShow == 2) frag = vec4(vec3(vSilver), 1.0);       // ?show=gusts: where the wind turns blades pale
}`;
  // ── the sea, drawn the way the grass is: a field of thin strokes, here lying along the crests of
  // moving waves (two wind-sea trains, a swell, a ripple). Each stroke rides the surface; crests lift
  // and curl it; steep crests turn white; in a gale some strokes lie along the wind as streaks of foam.
  const SEA_VS = COMMON + `
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uOrigin; uniform float uCell; uniform int uN; uniform int uPer;
uniform float uTime; uniform int uSegs; uniform float uSpan; uniform float uSea; uniform float uPx;
uniform vec4 uW1; uniform vec4 uW2; uniform vec4 uW3; uniform vec4 uW4; uniform vec4 uWo; uniform float uAmp;
uniform float uWhite; uniform float uFoam; uniform float uGlassy;
uniform int uGlitch; uniform float uG; uniform float uP;
out float vCov; out float vSide;
out float vT; out vec3 vN; out vec3 vTan; out vec3 vPos; out float vTone; out float vSilver; out float vFade; out float vShade;
out float vId; out float vCluster; flat out uint vHash;
vec3 waves(vec2 p) {                 // height and its gradient
  vec4 W[4] = vec4[4](uW1, uW2, uW3, uW4); float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) { float ph = W[i].z * dot(W[i].xy, p) - uWo[i] * uTime + float(i) * 1.7;
    h += W[i].w * sin(ph); g += W[i].w * W[i].z * W[i].xy * cos(ph); }
  return vec3(h, g);
}
void main() {
  int inst = gl_InstanceID, k = inst % uPer, c = inst / uPer;
  ivec2 cell = ivec2(floor(uOrigin / uCell)) + ivec2(c % uN, c / uN);
  uint hb = hash(uint(cell.x) * 73856093u ^ uint(cell.y) * 19349663u ^ uint(k) * 83492791u ^ uint(uSeed) * 2654435761u ^ 0x5ea5ea5u);
  // only the sea's share of the strokes (the rest of the field is meadow), thinned with distance
  if (h01(hb ^ 0x9u) >= uSea) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 root = (vec2(cell) + vec2(h01(hb), h01(hb ^ 0x68bc21ebu))) * uCell;
  float d = distance(root, uEye.xz);
  float keep = clamp(pow(6.0 / max(d, 6.0), 1.25), 0.05, 1.0), kf = keep * float(uPer) * 0.75;
  if (float(k) >= ceil(kf)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float fadeK = clamp(kf - float(k), 0.0, 1.0);
  vec3 w0 = waves(root);
  float crest = clamp(0.5 + 0.5 * w0.x / max(uAmp, 1e-3), 0.0, 1.0), steep = length(w0.yz);
  // along the crest, a little turned; in a gale, some lie along the wind instead (foam streaks)
  vec2 dir = uW1.xy, along = vec2(-dir.y, dir.x);
  float yaw = (h01(hb ^ 0x2u) - 0.5) * mix(1.4, 0.5, uGlassy);
  bool streak = h01(hb ^ 0x3u) < uFoam * 0.35;
  if (streak) along = dir;
  along = vec2(along.x * cos(yaw) - along.y * sin(yaw), along.x * sin(yaw) + along.y * cos(yaw));
  float len = min(1.1, (0.18 + 0.5 * h01(hb ^ 0x4u)) * (0.8 + 0.5 * crest) * (streak ? 2.5 : 1.0) / sqrt(keep));
  vec2 a = root - along * len * 0.5, b = root + along * len * 0.5;
  vec3 p0 = vec3(a.x, waves(a).x, a.y), p2 = vec3(b.x, waves(b).x, b.y);
  vec3 p1 = vec3(root.x, w0.x + len * (0.04 + 0.2 * crest * min(1.0, steep * 2.0)), root.y);   // the crest curls up
  int seg = gl_VertexID / 2; float side = float(gl_VertexID % 2) * 2.0 - 1.0;
  float t = float(seg) / float(uSegs), s = 1.0 - t;
  vec3 pos = s * s * p0 + 2.0 * s * t * p1 + t * t * p2;
  vec3 tan = normalize(2.0 * s * (p1 - p0) + 2.0 * t * (p2 - p1));
  vec3 across = normalize(vec3(-0.5 * w0.y, 1.0, -0.5 * w0.z) * 0.8 + vec3(-tan.z, 0.0, tan.x) * 0.2);   // upright, leaning with the slope
  float w = (0.003 + 0.004 * h01(hb ^ 0x6u)) * sin(3.14159 * clamp(t, 0.02, 0.98)) / sqrt(keep) * fadeK;
  float px = 2.0 * w * uPx / max(distance(pos, uEye), 0.05);
  vCov = 1.0; if (px < 1.2 && px > 0.0) { vCov = px / 1.2; w *= 1.2 / px; }
  pos += across * side * w; vSide = side;
  if (uGlitch == 5 && uG > 0.01) { float q = 0.64 * pow(0.5, floor(uP * 7.0)) * uG; pos = floor(pos / q + 0.5) * q; }
  vT = 0.55 + 0.45 * crest; vTan = tan; vN = normalize(cross(across, tan)); vPos = pos; vTone = 0.8 + 0.4 * h01(hb ^ 0x7u);
  vSilver = uWhite * smoothstep(0.62, 0.95, crest) * smoothstep(0.05, 0.25, steep) + (streak ? 0.6 * uFoam : 0.0);   // white horses
  vec2 lo = root - uOrigin, hi = uOrigin + uSpan - root;
  vFade = smoothstep(0.0, 7.0, min(min(lo.x, lo.y), min(hi.x, hi.y)));
  vShade = cloudShade(root);
  vId = float(hash(hb) & 0xffffu) / 65535.0; vHash = hash(hb); vCluster = crest;
  gl_Position = uVP * vec4(pos, 1.0);
}`;
  // ── flowers, in the real look: stems with a head of petals, in drifts, moving with the same wind
  const FLOWER_VS = COMMON + `
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uOrigin; uniform int uFN; uniform float uFCell;
uniform float uTime; uniform vec3 uWind; uniform float uFlowers; uniform vec3 uSway; uniform float uBow;
out vec3 vPos; out vec3 vN; out vec3 vAlb; out float vPetal; out float vShadeF;
vec3 bez(vec3 a, vec3 b, vec3 c, float t) { float s = 1.0 - t; return s * s * a + 2.0 * s * t * b + t * t * c; }
void main() {
  int c = gl_InstanceID; ivec2 cell = ivec2(floor(uOrigin / uFCell)) + ivec2(c % uFN, c / uFN);
  uint hb = hash(uint(cell.x) * 2654435761u ^ uint(cell.y) * 40503u ^ uint(uSeed) * 668265263u ^ 0xf10e3u);
  vec2 root = (vec2(cell) + vec2(h01(hb), h01(hb ^ 0x1234u))) * uFCell;
  float drift = smoothstep(0.36, 0.72, 0.7 * vnoise(root * 0.12 + 17.0) + 0.3 * vnoise(root * 0.5 + 4.0));
  float d = distance(root, uEye.xz), keep = clamp(pow(8.0 / max(d, 8.0), 1.2), 0.0, 1.0);
  if (d < 1.4 || h01(hb ^ 0x2u) > uFlowers * drift * keep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float sp = h01(hb ^ 0x3u);
  vec3 petal = sp < 0.34 ? vec3(0.92, 0.22, 0.52) : sp < 0.62 ? vec3(0.93, 0.92, 0.88) : sp < 0.8 ? vec3(0.86, 0.07, 0.16)
             : sp < 0.92 ? vec3(0.97, 0.45, 0.10) : vec3(0.70, 0.33, 0.82);
  petal *= 0.8 + 0.25 * h01(hb ^ 0x4u);
  float H = 0.22 + 0.42 * h01(hb ^ 0x5u), rad = 0.02 + 0.028 * h01(hb ^ 0x6u);
  float along = dot(root, uWind.xy), gust = 0.5 + 0.5 * sin(along * 0.28 - uTime * 1.6 + 2.0 * vnoise(root * 0.07));
  float yaw = h01(hb ^ 0x7u) * 6.2831853;
  vec2 bd = uWind.xy * uWind.z * (0.25 + 0.8 * gust * gust) + vec2(cos(yaw), sin(yaw)) * 0.15
          + vec2(sin(uTime * (1.7 + h01(hb ^ 0x8u)) + yaw), cos(uTime * 1.3 + yaw)) * 0.04;
  bd += uSway.xy * uSway.z; if (uBow > 0.001) bd += normalize(uEye.xz - root + 1e-4) * uBow * 0.9;
  float th = min(length(bd), 1.0) * 0.7; vec2 bdir = bd / max(length(bd), 1e-4);
  vec3 p0 = vec3(root.x, ground(root), root.y);
  vec3 p1 = p0 + vec3(bdir.x * H * sin(th) * 0.15, H * 0.6, bdir.y * H * sin(th) * 0.15);
  vec3 p2 = p0 + vec3(bdir.x * H * sin(th), H * cos(th), bdir.y * H * sin(th));
  int v = gl_VertexID; vec3 pos, nrm, alb; float isP = 0.0;
  vec2 SC[6] = vec2[6](vec2(0.0, -1.0), vec2(0.0, 1.0), vec2(1.0, -1.0), vec2(1.0, -1.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
  if (v < 30) {                                     // the stem: five quads
    vec2 k = SC[v % 6]; float t = (float(v / 6) + k.x) / 5.0;
    vec3 tn = normalize(2.0 * (1.0 - t) * (p1 - p0) + 2.0 * t * (p2 - p1)), ac = vec3(-bdir.y, 0.0, bdir.x);
    pos = bez(p0, p1, p2, t) + ac * k.y * 0.0022; nrm = normalize(cross(ac, tn)); alb = vec3(0.09, 0.2, 0.05);
  } else {
    vec3 toEye = normalize(uEye - p2), tn = normalize(p2 - p1);
    vec3 hn = normalize(tn * 0.4 + vec3(0.0, 0.45, 0.0) + toEye * 0.55 + vec3(cos(yaw * 3.0), 0.0, sin(yaw * 3.0)) * 0.35);
    vec3 u = normalize(cross(hn, vec3(0.31, 0.0, 0.95))), w = cross(hn, u);
    int q = v - 30;
    if (q < 48) {                                   // eight petals
      vec2 PC[6] = vec2[6](vec2(0.15, -0.12), vec2(0.15, 0.12), vec2(1.0, -0.42), vec2(1.0, -0.42), vec2(0.15, 0.12), vec2(1.0, 0.42));
      vec2 k = PC[q % 6]; float a = float(q / 6) * 0.7853982 + yaw;
      vec3 dv = u * cos(a) + w * sin(a), pv = -u * sin(a) + w * cos(a);
      pos = p2 + (dv * k.x + pv * k.y) * rad + hn * k.x * rad * 0.22; nrm = hn; alb = petal; isP = 1.0;
    } else {                                        // the centre
      vec2 k = SC[q - 48] * vec2(1.0, 1.0) - vec2(0.5, 0.0);
      pos = p2 + (u * k.x + w * k.y) * rad * 0.42 + hn * rad * 0.12; nrm = hn;
      alb = sp < 0.62 && sp >= 0.34 ? vec3(0.9, 0.7, 0.08) : vec3(0.75, 0.55, 0.06);
    }
  }
  vPos = pos; vN = nrm; vAlb = alb; vPetal = isP; vShadeF = cloudShade(root);
  gl_Position = uVP * vec4(pos, 1.0);
}`;
  const FLOWER_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure;
in vec3 vPos; in vec3 vN; in vec3 vAlb; in float vPetal; in float vShadeF; out vec4 frag;
void main() {
  vec3 V = normalize(uEye - vPos), N = faceforward(vN, -V, vN);
  float sd = max(dot(N, uLight), 0.0), back = pow(max(0.0, dot(-V, uLight)), 3.0) * vPetal;
  vec3 rad = vAlb * (uSunCol * (0.15 + 0.85 * sd) * vShadeF + uAmbCol * 0.6) + vAlb * uSunCol * back * 0.9 * vShadeF;
  frag = vec4(toneC(atmosC(rad, vPos, uEye, uLight, uFog), uExposure), 1.0 - smoothstep(0.6, 4.0, distance(vPos, uEye)));
}`;
  const GROUND_VS = COMMON + `
uniform mat4 uVP; uniform vec2 uOrigin; uniform float uSpan; uniform int uRes; uniform float uDrop;
out vec3 vPos;
void main() {
  int i = gl_VertexID % (uRes + 1), j = gl_VertexID / (uRes + 1);
  vec2 p = uOrigin + vec2(float(i), float(j)) / float(uRes) * uSpan;
  vPos = vec3(p.x, ground(p) - 0.01 - uDrop, p.y);     // at sea, below the deepest trough
  gl_Position = uVP * vec4(vPos, 1.0);
}`;
  const GROUND_FS = COMMON + `
uniform vec3 uEye; uniform vec3 uLight; uniform float uFog; uniform float uExposure; in vec3 vPos; out vec4 frag;
void main() {
  float e = atmos((0.012 + 0.06 * max(uLight.y, 0.0)) * cloudShade(vPos.xz), vPos, uEye, uLight, uFog);
  vec3 c = vec3(1.0 - exp(-e * uExposure));
  if (uLook == 1) {   // earth under the grass
    vec3 alb = vec3(0.10, 0.085, 0.055) * (0.8 + 0.4 * vnoise(vPos.xz * 3.0));
    c = toneC(atmosC(alb * (uSunCol * max(uLight.y, 0.0) * cloudShade(vPos.xz) + uAmbCol * 0.5), vPos, uEye, uLight, uFog), uExposure);
  }
  frag = vec4(c, 1.0 - smoothstep(0.6, 4.0, distance(vPos, uEye)));
}`;
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
void main() {
  float e = atmos(0.0, vPos, uEye, uLight, uFog * 0.45);
  vec3 c = vec3(1.0 - exp(-e * uExposure));
  if (uLook == 1) c = toneC(atmosC(vec3(0.02, 0.04, 0.02) * (uSunCol * 0.5 + uAmbCol * 0.7), vPos, uEye, uLight, uFog * 0.9), uExposure);   // a dark wood
  frag = vec4(c, 0.0);
}`;
  // the sky: black, with the mist glowing low on the light's side and a faint airglow at the horizon
  const SKY_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0); }`;
  const SKY_FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uHorizonY; uniform float uLightX; uniform float uMist; uniform float uExposure; out vec4 frag;
uniform int uLook; uniform vec3 uSkyZen; uniform vec3 uSkyHor; uniform vec3 uSunDisp; uniform vec2 uSunNdc;
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float glow = exp(-max(0.0, ndc.y - uHorizonY) / 0.12);
  float side = 0.45 + 0.55 * exp(-pow(ndc.x - uLightX, 2.0) / 0.8);
  float e = (uMist * 1.15 * side + 0.012) * glow;
  vec3 c = vec3(1.0 - exp(-e * uExposure));
  if (uLook == 1) {   // a sky: the horizon pale, the zenith deeper, a glow round the sun
    c = mix(uSkyHor, uSkyZen, smoothstep(0.0, 1.1, ndc.y - uHorizonY));
    vec2 ds = (ndc - uSunNdc) * vec2(uRes.x / uRes.y, 1.0);
    c += uSunDisp * (0.45 * exp(-dot(ds, ds) / 0.06) + 0.9 * exp(-dot(ds, ds) / 0.0012));
  }
  frag = vec4(c, 0.0);
}`;

  // the finishing pass: glitches that act on the whole image, and colours that tint it; a
  // 64-second history of frames (one a second, 320 × 180) feeds the time slice and the echo
  const POST_FS = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2D uScene; uniform sampler2DArray uHist; uniform int uHead; uniform int uLayers; uniform float uFilled;
uniform vec2 uRes; uniform int uGlitch; uniform float uG; uniform float uP; uniform int uTint; uniform float uTintE; uniform float uHue;
uniform float uRain; uniform float uSnow; uniform float uSlant; uniform float uTimeS; uniform float uTilt; uniform float uFlash;
uniform float uStage;
uniform float uWaterY; uniform float uRipple; uniform float uDrip; uniform float uInk; uniform float uWash; uniform float uChar; uniform vec2 uWDir; uniform float uP90; uniform float uNear;
out vec4 frag;
float r1(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
// falling lines: columns of dashes, each column its own speed and phase; slanted by the wind
float falling(vec2 uv, float cols, float speed, float len, float dens) {
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y); p.x += (1.0 - p.y) * uSlant;
  float cx = floor(p.x * cols), r = r1(cx + cols);
  if (r > dens) return 0.0;
  float y = fract(p.y + uTimeS * speed * (0.7 + 0.6 * r) + r * 7.0);
  float dx = abs(fract(p.x * cols) - 0.5) * uRes.y / cols;
  return (1.0 - smoothstep(0.4, 1.1, dx)) * smoothstep(0.0, 0.015, y) * (1.0 - smoothstep(len, len + 0.015, y)) * (0.35 + 0.5 * r);
}
vec3 hue3(float h) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return mix(vec3(1.0), k, 0.78); }
uniform float uGain;
// automatic exposure: dark frames (night, storm, sea) lifted up to 4×, bright frames untouched
vec4 sceneAt(vec2 uv) { vec4 t = texture(uScene, uv); return vec4(t.rgb * uGain, t.a); }
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// ── the four registers borrowed as techniques: paper and ink, wash, charcoal, water
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
float lumAt(vec2 uv) { return lumOf(sceneAt(uv).rgb); }
vec3 past(vec2 uv, float ago) {
  float n = min(floor(ago + 0.5), uFilled);
  int layer = (uHead - int(n) + uLayers * 8) % uLayers;
  return texture(uHist, vec3(uv, float(layer))).rgb * uGain;
}
void main() {
  vec2 uv0 = gl_FragCoord.xy / uRes;
  // the pressure trend tilts the horizon (by at most 2°), zoomed just enough to hide the corners
  float ca = cos(uTilt), sa = sin(uTilt), asp = uRes.x / uRes.y;
  // water: below the waterline the meadow is seen reflected, squashed, broken into rippling bands
  vec2 uvS = uv0; float depthW = -1.0;
  if (uWaterY > 0.001 && uv0.y < uWaterY) {
    depthW = (uWaterY - uv0.y) / uWaterY;
    // a continuous field of ripples: fine and quick near the horizon, broad and slow near the eye,
    // drifting with the wind; nothing is stepped
    float persp = 1.0 / (depthW + 0.06);
    float drift = uTimeS * (0.25 + 0.35 * uRipple) * sign(uSlant + 1e-4);
    vec2 wp = vec2(uv0.x * (3.0 + 0.6 * persp) + drift * 0.3, persp * 2.2 - uTimeS * 0.35);
    float n1 = vn(wp) - 0.5, n2 = vn(wp * 2.1 + vec2(7.3, uTimeS * 0.21)) - 0.5;
    float swell = sin(persp * 3.1 - uTimeS * 0.9 + 2.5 * n1);
    float amp = uRipple * (0.0015 + 0.016 * depthW);
    uvS = vec2(uv0.x + amp * (0.8 * swell + 1.6 * n1 + 0.7 * n2), uWaterY + (uWaterY - uv0.y) * 0.85 + amp * 0.6 * (n2 + 0.5 * swell));
  }
  vec2 d0 = (uvS - 0.5) * vec2(asp, 1.0);
  vec2 uv = vec2(ca * d0.x - sa * d0.y, sa * d0.x + ca * d0.y) / vec2(asp, 1.0) / (1.0 + abs(sa) * asp) + 0.5;
  vec3 c = sceneAt(uv).rgb;
  // the near field, faded: the closest grass dissolves into soft, mottled, grainy light, losing
  // its contrast as if washed out, not focused away
  float near = sceneAt(uv).a * uNear;
  if (near > 0.01) {
    vec2 px = 1.0 / uRes; float r = 3.0 + 18.0 * near; vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853982 + 0.39; vec2 o = vec2(cos(a), sin(a));
      acc += sceneAt(uv + o * px * r).rgb + sceneAt(uv + o * px * r * 0.45).rgb; }
    acc /= 16.0;
    vec2 mp = gl_FragCoord.xy / (uRes.y * 0.07) + vec2(uTimeS * 0.02, uTimeS * 0.007);
    mp += 0.8 * vec2(vn(mp * 0.5 + 3.1), vn(mp * 0.5 + 8.7));      // warped, so the pools are not round squares
    float La = lumOf(acc), mott = 0.65 * vn(mp) + 0.35 * vn(mp * 2.3 + 5.1);
    float pool = smoothstep(0.35, 0.85, mott);                     // pools of washed-out light
    vec3 faded = mix(acc, vec3(La), 0.5) * 0.6 + vec3(0.04 + 0.42 * pool) * (0.45 + 1.2 * La);
    faded += (hh(gl_FragCoord.xy + fract(uTimeS * 7.0) * 91.0) - 0.5) * 0.22 * (0.2 + lumOf(faded));
    c = mix(c, faded, near);
  }
  if (uGlitch == 1) c = mix(c, past(uv, uv.x * 40.0), uG);                                   // time slice
  if (uGlitch == 2 && abs(uv.y - mix(1.25, -0.25, uP)) < 0.13) c = mix(c, past(uv, 60.0), uG);   // echo
  if (uGlitch == 6) c = mix(c, vec3(step(0.14, lumOf(c))), uG);                               // one bit
  if (uGlitch == 8) c = mix(c, sceneAt(vec2(uv.x > 0.5 ? 1.0 - uv.x : uv.x, uv.y)).rgb, uG);   // mirror
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
    vec3 r = edge ? vec3(0.75) : sceneAt(p).rgb;
    c = mix(c, r, uG);
  }
  if (uGlitch == 11) {                                                                          // datamosh
    vec2 px = gl_FragCoord.xy; vec3 m = c;
    float cw = 2.0 + floor(hh(vec2(floor(px.x / 37.0), 3.0)) * 4.0), ci = floor(px.x / cw);
    float band = step(0.45, hh(vec2(floor(px.x / 90.0), 9.0 + floor(uP * 2.0))));
    if (hh(vec2(ci, floor(uP * 3.0))) < 0.75 * band) {          // columns smeared upward from one row: vertical streaks
      float sy = 0.35 + 0.6 * hh(vec2(ci, 5.0));
      if (uv.y > sy) m = sceneAt(vec2(uv.x, sy + (uv.y - sy) * 0.02)).rgb;
    }
    float row = floor(px.y / (6.0 + 10.0 * hh(vec2(floor(px.y / 40.0), 1.0)))), rb = hh(vec2(row, floor(uP * 5.0)));
    if (rb < 0.06) { m = sceneAt(vec2(fract(uv.x + (rb - 0.03) * 4.0), uv.y)).rgb; if (rb < 0.018) m = mix(m, vec3(0.32, 0.42, 0.92), 0.75); }   // displaced bars
    if (hh(floor(px / 16.0) + floor(uP * 4.0) * 7.0) < 0.05) m = past(uv + vec2(0.0, 0.02), 3.0);   // stale blocks of an earlier frame
    c = mix(c, m, uG);
  }
  float L = lumOf(c);
  if (uTint == 3) c = mix(c, L * hue3(uHue) * 1.7, uTintE);                                    // hue by time
  if (uTint == 5) c = mix(c, L * hue3(uv.x < 0.5 ? uHue : fract(uHue + 0.5)) * 1.7, uTintE);  // complement
  if (uTint == 6) {                                                                             // prime colour
    vec3 prim = uHue < 0.3333 ? vec3(1.0, 0.1, 0.08) : uHue < 0.6667 ? vec3(0.1, 1.0, 0.22) : vec3(0.16, 0.26, 1.0);
    c = mix(c, L * prim * 1.9, uTintE);
  }
  // charcoal: luminance dragged along the wind, broken by a dry brush skipping over the tooth
  if (uChar > 0.001) {
    vec2 px = 1.0 / uRes; float acc = 0.0;
    for (int i = -3; i <= 3; i++) acc += lumAt(uv + uWDir * px * float(i) * 2.2);
    acc /= 7.0;
    vec2 q = vec2(dot(gl_FragCoord.xy, uWDir), dot(gl_FragCoord.xy, vec2(-uWDir.y, uWDir.x)));
    float skip = smoothstep(0.3, 0.7, vn(vec2(q.x * 0.02, q.y * 0.6)));
    float L0 = lumOf(c);
    c += vec3((mix(L0, mix(acc, acc * skip * 1.5, 0.6), 0.65) - L0) * uChar);
  }
  // wash: tone that has bled, pigment pooled at the wash's edge, granulation in the paper
  if (uWash > 0.001) {
    vec2 px = 1.0 / uRes; float a1 = 0.0, a2 = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853982; vec2 o = vec2(cos(a), sin(a)); a1 += lumAt(uv + o * px * 5.0); a2 += lumAt(uv + o * px * 15.0); }
    a1 /= 8.0; a2 /= 8.0;
    float edge = max(0.0, a1 - a2), gran = 0.6 * vn(gl_FragCoord.xy * 0.33) + 0.4 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.7));
    c += vec3((a1 * 0.85 + edge * 0.9 + (gran - 0.5) * 0.07 * (0.3 + a1) - lumOf(c)) * uWash);
  }
  // water: the reflection darker with depth; threads of light hanging from the waterline
  if (depthW >= 0.0) {
    c *= 0.72 * (1.0 - 0.25 * depthW);
    float cols = 52.0, x = uv0.x * cols, ci = floor(x);
    if (hh(vec2(ci, 7.0)) < 0.22 * uDrip) {
      float len = 0.2 + 0.6 * hh(vec2(ci, 3.0));
      if (depthW < len) {
        // a thin wandering line, its course a smooth function of depth, swaying slowly
        float yy = uv0.y * uRes.y;
        float zz = 0.28 * (vn(vec2(ci * 3.1, yy / 22.0 + uTimeS * 0.05)) - 0.5) + 0.08 * (vn(vec2(ci * 5.7, yy / 6.0)) - 0.5);
        float dx = abs(fract(x) - 0.5 - zz) * uRes.x / cols;
        float broken = smoothstep(0.3, 0.5, vn(vec2(ci * 1.3, yy / 40.0)));      // gaps, as ink leaves them
        c += vec3(1.0 - smoothstep(0.25, 0.9, dx)) * 0.32 * broken * (1.0 - depthW / len);
      }
    }
  }
  // rain: falling lines in three depths, the meadow darkened a little
  if (uRain > 0.001) {
    float f = falling(uv0, 90.0, -0.9, 0.09, uRain) + falling(uv0, 170.0, -1.3, 0.06, uRain) * 0.7 + falling(uv0, 260.0, -1.7, 0.04, uRain) * 0.5;
    c = c * (1.0 - 0.22 * uRain) + vec3(f) * 0.55 * uRain * (1.0 - 0.75 * uInk);   // on paper, rain is a fine line, not a bar
  }
  // snow: slow short marks, lighter greys, colour drained
  if (uSnow > 0.001) {
    float f = falling(uv0, 120.0, -0.06, 0.006, uSnow) + falling(uv0, 210.0, -0.09, 0.004, uSnow) * 0.7;
    float L2 = lumOf(c);
    c = mix(c, vec3(L2), 0.85 * uSnow); c = mix(c, c * 0.75 + 0.13, 0.5 * uSnow); c += vec3(f) * 0.6 * uSnow;
  }
  // paper and ink: the night turned to paper, light turned to ink; colour becomes its complement,
  // as a dichroic film shows by transmitted light
  if (uInk > 0.001) {
    vec3 paper = vec3(0.9, 0.893, 0.876);
    // the ink follows the frame's own brightness (its 90th percentile), so a dark, wet field still draws
    vec3 cn = c / max(uP90 * uGain, 0.04);
    // ink goes where there is drawing — a blade, a crest, brighter than its surroundings — and only
    // lightly where the frame is merely bright, so fog and haze turn to paper, as they do in daylight
    vec2 pxI = 1.0 / uRes; float Lm = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853982; Lm += lumAt(uv + vec2(cos(a), sin(a)) * pxI * 4.0); }
    Lm /= 8.0;
    float detail = smoothstep(0.015, 0.2, lumOf(c) - Lm);
    vec3 amt = clamp(vec3(detail) * 0.85 + smoothstep(vec3(0.2), vec3(1.1), cn) * 0.4, 0.0, 1.0);
    vec3 inked = paper * (1.0 - 0.94 * amt);
    inked -= (vn(gl_FragCoord.xy * 0.5) - 0.5) * 0.045 + (0.5 + 0.5 * sin(gl_FragCoord.y * 2.1)) * 0.012;
    c = mix(c, inked, uInk);
  }
  if (uStage > 0.001) { vec2 q = (uv0 - vec2(0.5, 0.42)) * vec2(uRes.x / uRes.y, 1.0); c *= mix(1.0, 0.5 + 0.75 * exp(-dot(q, q) / 0.22), uStage); }   // a stage light
  if (uFlash > 0.5) c = 1.0 - c;                                                                  // storm: one inverted frame
  frag = vec4(c, 1.0);
}`;
  const POST_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  // ───────────────────────── the screen ─────────────────────────
  const Q = new URLSearchParams(location.search), num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);
  const O = {
    seed: num('seed', 49) >>> 0, per: Math.max(4, Math.min(24, num('blades', 14) | 0)), scale: Math.max(0.25, Math.min(2, num('scale', 1))),
    dim: Q.has('dim') ? Q.get('dim') : '19-22:0.6,22-7:0.35', hud: Q.get('hud') !== '0', speed: Math.max(0, num('speed', 1)), still: Q.get('still') === '1',
    score: Q.get('score') !== '0', dich: Q.has('dichroic') ? num('dichroic', 1) : null,
    weather: Q.get('weather') !== '0' && !!global.Weather, style: Q.get('style') || 'auto', paper: Q.get('paper') !== '0', near: Math.max(0, Math.min(1.5, num('near', 1))), geo: Q.get('geo') !== '0' && !!global.Geography, seaSurface: Q.get('sea') === 'surface', look: Q.get('look') === 'real' ? 1 : 0, flowers: Math.max(0, Math.min(3, num('flowers', 1))), from: num('from', 0), lightHere: Q.get('light') === 'local', glitch: num('glitch', 0) | 0, colour: num('colour', 0) | 0, measure: num('measure', 0) | 0,
  };
  const Score = global.Score, Wx = global.Weather;
  // where the meadow is: ?from=lat,lon (start there) · ?place=lat,lon · ?route=lat,lon;lat,lon;… · ?lat= · ?days= · ?start=
  const TRACK = Wx ? Wx.track(Wx.parseSettings(Q)) : null;
  const reader = O.weather ? Wx.createReader({ track: TRACK }) : null;
  // the homage (the default): two homes, each with its own reader for glimpses, and the real look
  const HOMAGE = TRACK && TRACK.cfg.mode === 'homage', HOMES = HOMAGE ? TRACK.cfg.homes : [];
  const homeReaders = HOMAGE && O.weather ? HOMES.map((h) => Wx.createReader({ track: () => ({ lat: h.lat, lon: h.lon }) })) : [];
  if (HOMAGE && !Q.has('look')) O.look = 1;
  O.where = Q.get('where') !== '0';
  O.dedication = HOMAGE ? Q.get('dedication') !== '0' : Q.get('dedication') === '1';   // the homage carries it; ?dedication=0 hides it O.glimpses = Q.get('glimpses') !== '0';
  let seedNow = O.seed;
  const Geo = global.Geography;
  if (O.geo) Geo.fetchData(new URL('data/', document.currentScript ? document.currentScript.src : location.href).href).catch((e) => console.log('nocturne: geography —', e.message));
  const J1 = (t) => TRACK(t); J1.START = TRACK ? TRACK.START : 0;
  let geoAt = -1, geo = null, geoEv = null;
  const stillUntil = Date.now() + (O.weather ? 15000 : 0);  // a held clock waits for a reading (15 s at most)
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
  const grass = program(GRASS_VS, GRASS_FS), groundP = program(GROUND_VS, GROUND_FS), seaP = program(SEA_VS, GRASS_FS), flowerP = program(FLOWER_VS, FLOWER_FS);
  const trees = program(TREES_VS, TREES_FS), sky = program(SKY_VS, SKY_FS), post = program(POST_VS, POST_FS);
  const TREE_M = 2400, TREE_R = 70, SHOW = { clouds: 1, gusts: 2 }[Q.get('show')] || 0;
  const vao = gl.createVertexArray();
  // the ground mesh: indices for a (RES+1)² grid
  const RES = 96, idx = [];
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const a = j * (RES + 1) + i; idx.push(a, a + 1, a + RES + 1, a + 1, a + RES + 2, a + RES + 1); }
  const ibo = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

  const CELL = 0.28, SPAN = 46, N = Math.ceil(SPAN / CELL), SEGS = 6;
  const FCELL = 0.45, FN = Math.ceil(SPAN / FCELL);   // the flowers' grid
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
  let p90 = 0.5, gain = 1;
  function brightness() {                         // the 90th percentile of the newest small frame's brightness
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, histFB);
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, histTex, 0, head);
    const px = new Uint8Array(HIST_W * HIST_H * 4); gl.readPixels(0, 0, HIST_W, HIST_H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    const bins = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) bins[(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0]++;
    let n = 0; const want = HIST_W * HIST_H * 0.9;
    for (let b = 0; b < 256; b++) { n += bins[b]; if (n >= want) return b / 255; }
    return 1;
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
  const vhash = (cx, cz) => (ihash((Math.imul(cx >>> 0, 0x9e3779b9) ^ Math.imul(cz >>> 0, 0x85ebca6b) ^ seedNow) >>> 0) & 0xffffff) / 16777215;
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  }
  let relief = 1;                                  // the ground's relief where the journey is
  const groundH = (x, z) => relief * (0.8 * Math.sin(x * 0.053 + 1.3) * Math.cos(z * 0.047 - 0.4) + 0.4 * Math.sin(x * 0.11 - z * 0.083 + 2.0) + 0.45 * (vnoise(x * 0.18, z * 0.18) - 0.5));

  function frame() {
    const ms = now(), s = dayS(ms), sE = epochS(ms), time = (ms / 1000) % 86400;
    // the journey and its weather
    let J = null, sun = null, wx = null, fx = null;
    if (reader) {
      reader.poll(ms);
      J = TRACK(ms); sun = Wx.sunAt(ms, J.lat, J.lon); wx = reader.current(ms); fx = Wx.effects(wx, sun);
    }
    // the homage: where in the week, and whether this second is a glimpse of a home
    let PH = null, GL = null;
    if (J && J.mode === 'homage') {
      PH = J.phase; homeReaders.forEach((r) => r.poll(ms));
      GL = O.glimpses ? Wx.glimpseAt(ms, PH) : null;
      if (GL) {
        const h = HOMES[GL.home]; J = Object.assign({}, J, { lat: h.lat, lon: h.lon, glimpse: GL.home });
        sun = Wx.sunAt(ms, h.lat, h.lon);
        if (homeReaders[GL.home]) { wx = homeReaders[GL.home].current(ms); fx = Wx.effects(wx, sun); }
      }
      const at = GL ? GL.home : PH.state === 'home' ? PH.home : -1;
      seedNow = O.seed + 101 * (at + 1);          // each home its own meadow; the journey another
    }
    // the ground under the journey, once a second (and at once when the place cuts)
    const geoKey = J ? Math.floor(ms / 1000) + '|' + J.lat.toFixed(3) + ',' + J.lon.toFixed(3) : '';
    if (J && O.geo && Geo.ready() && geoKey !== geoAt) {
      geoAt = geoKey; geo = Geo.at(J.lat, J.lon); geoEv = Geo.events(J1, ms, O.from);
    }
    const smG = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const seaness = geo && !geo.land ? smG(0, -40, geo.coastKm) : 0, biome = geo && geo.land ? geo.biome : null;
    const absLat = J ? Math.abs(J.lat) : 45;
    const density = biome ? biome.density : 1;                                        // the meadow stays, at sea too
    const hScale = geo ? (1 - 0.35 * smG(35, 60, absLat)) * (1 + 0.15 * smG(15, 0, absLat)) * (biome ? biome.height : 1) : 1;
    relief = geo && geo.land ? 1 + Math.min(2, geo.elev / 1200 + geo.rough / 400) : 1;
    // the sea's conditions where the journey is
    const SS = seaness > 0.001 && wx ? Wx.seaState(wx, J.lat) : null;
    // the score: which glitch, which colour, which measurement, now
    let G = O.glitch ? { kind: O.glitch, p: (sE % 12) / 12, e: 1 } : O.score ? Score.glitchAt(ms, fx ? fx.stormFactor : 0) : null;
    // crossing the equator mirrors the image for an hour; the date line slices time for ten minutes
    if (!O.glitch && geoEv && geoEv.equator) G = { kind: 8, p: (sE % 3600) / 3600, e: 1, cause: 'THE EQUATOR, CROSSED' };
    // cuts tear: the edges of a glimpse, an arrival and a departure are a second of datamosh
    if (!O.glitch && GL && GL.edge < 0.35) G = { kind: 11, p: GL.p, e: 1, cause: 'GLIMPSE OF ' + HOMES[GL.home].name };
    if (!O.glitch && PH && PH.state === 'home' && (PH.since < 1500 || PH.left < 1500)) G = { kind: 11, p: (ms % 1500) / 1500, e: 1, cause: PH.since < 1500 ? 'ARRIVAL AT ' + HOMES[PH.home].name : 'DEPARTURE FROM ' + HOMES[PH.home].name };
    else if (!O.glitch && geoEv && geoEv.dateLine) G = { kind: 1, p: (sE % 600) / 600, e: 1, cause: 'THE DATE LINE, CROSSED' };
    const C = O.colour ? { mode: O.colour, hue: 0.07, e: 1 } : O.score ? Score.colourAt(ms, !!(geoEv && geoEv.tropic)) : null;
    const tintHue = C ? (C.mode === 3 ? s / 86400 : C.hue) : 0;
    // the dichroic pair of the hour: four pairs through the day, crossing over half an hour
    const DP = [[[0.1, 0.9, 1.0], [1.0, 0.15, 0.85]], [[1.0, 0.72, 0.18], [0.16, 0.36, 1.0]], [[0.3, 1.0, 0.45], [0.62, 0.2, 1.0]], [[1.0, 0.45, 0.2], [0.1, 0.85, 0.8]]];
    const blk = s / 21600, bi = Math.floor(blk) % 4, bj = (bi + 1) % 4, bt = Math.min(1, Math.max(0, (blk - Math.floor(blk) - 0.9167) / 0.0833));
    const mixc = (a, b) => a.map((v, i) => v + (b[i] - v) * bt);
    let dichA = mixc(DP[bi][0], DP[bj][0]), dichB = mixc(DP[bi][1], DP[bj][1]);
    if (fx) [dichA, dichB] = Wx.pairFor(fx.temp);                // the temperature there chooses the pair
    const nightK = fx && !O.lightHere ? 1 - 0.5 * fx.night : 1;  // night there: quieter colour
    const dich = (C && C.mode === 8 ? 0.18 + 0.82 * C.e : C ? 0.18 * (1 - C.e) : 0.18) * nightK;
    // look along the path, 14 m ahead, a little above the grass there
    const e = eyeAt(sE), pa = eyeAt(sE - 60), pb = eyeAt(sE + 60);
    if (fx) e.h = 0.32 + (e.h - 0.32) * fx.heightScale;          // pressure: low keeps the eye in the grass
    let hx = pb.x - pa.x, hz = pb.z - pa.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const seaAmp = SS ? (SS.frozen ? 0.02 : 0.12 + 0.38 * Math.sqrt(SS.hs) + 0.15 * Math.sqrt(SS.swellH)) : 0;
    const surf = O.seaSurface ? seaness : 0;   // the separate wave surface only when asked for
    const eye = [e.x, groundH(e.x, e.z) + e.h + 1.1 * seaAmp * surf, e.z];
    const lx = e.x + hx * 14, lz = e.z + hz * 14;
    const look = [lx, groundH(lx, lz) + 0.35, lz];
    let L = lightAt(s), W = windAt(s);
    const aspect = canvas.width / canvas.height;
    if (fx) {
      // the sun where the journey is (north is −z); below the horizon it stays a low light, darker
      if (!O.lightHere) {
        // by night there, a low light from the opposite bearing stands in (the night is still lit)
        const n = fx.night, el = (Math.max(5, sun.el) * (1 - n) + 9 * n) * Math.PI / 180;
        const az = (sun.az + 180 * n) * Math.PI / 180;
        L = [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
      }
      // the wind there, with the built-in gusting riding on it; snow slows everything
      const osc = (W.strength - 0.25) / 0.75;
      W = { x: fx.windX, z: fx.windZ, strength: (fx.windStrength * (0.75 + 0.25 * osc) + 0.3 * fx.gustiness * osc) * (1 - 0.6 * fx.snow) };
    }
    // ── the dance. Tempo follows the place: allegro (120) at the first home, adagio (66) at the second,
    // blending on the way. Gusts are phrased in eights with the accent on one; some minutes the
    // field moves in unison, the rest in canon; on arrival it bows; at a home, a stage light.
    let dance = null, sway = [0, 0, 0], bow = 0, stageK = 0;
    if (PH) {
      const athens = GL ? 1 - GL.home : PH.state === 'home' ? 1 - PH.home : (PH.path.from === HOMES[0] ? 1 - (0.5 - 0.5 * Math.cos(Math.PI * PH.f)) : 0.5 - 0.5 * Math.cos(Math.PI * PH.f));
      const bpm = 66 + 54 * athens, beats = sE * bpm / 60, count = Math.floor(beats) % 8 + 1, frac = beats % 1;
      const accent = count === 1 ? 1 : count === 5 ? 0.6 : 0.25;
      W = { x: W.x, z: W.z, strength: W.strength * (0.8 + 0.4 * accent * Math.exp(-frac * 4)) };
      const unisonMin = Score.ih(Math.floor(ms / 6e4) ^ 0x8a1) % 3 === 0, sm60 = (ms % 6e4) / 6e4;
      if (unisonMin) { const a = 0.38 * Math.sin(Math.PI * sm60) * Math.sin(2 * Math.PI * beats / 8); sway = [W.x, W.z, a]; }
      if (PH.state === 'home' && !GL) {
        const b = PH.since / 6e4; bow = b < 1 ? Math.sin(Math.PI * Math.min(1, b)) : 0;          // the révérence: the first minute
        W = { x: W.x, z: W.z, strength: W.strength * (1 - 0.8 * bow) };
        stageK = 0.45 * Math.min(1, PH.since / 6e4);
      }
      if (GL) stageK = 0.45;
      dance = { bpm: Math.round(bpm), count, tempo: bpm > 105 ? 'ALLEGRO' : bpm > 85 ? 'MODERATO' : 'ADAGIO', unison: unisonMin };
    }
    const VP = mat(eye, look, 0.62, aspect);
    // the window of cells sits ahead of the eye, where the view is
    const vx = look[0] - eye[0], vz = look[2] - eye[2], fl = Math.hypot(vx, vz) || 1;
    const origin = [eye[0] + vx / fl * (SPAN * 0.38) - SPAN / 2, eye[2] + vz / fl * (SPAN * 0.38) - SPAN / 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFB);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // the night is darker than the day: exposure follows the light's height (7° → 1.5, 38° → 3.0)
    const elev = Math.asin(L[1]) * 180 / Math.PI;
    const thin = geo && geo.land ? Math.exp(-geo.elev / 2500) : 1;   // thinner air higher up
    const exposure = (1 + 0.15 * (1 - thin) + 0.3 * (biome ? biome.pale : 0) + (fx ? 1.6 * wx.cloud * wx.cloud : 0))   // overcast light is even, not dark * (1.5 + 1.5 * Math.min(1, Math.max(0, (elev - 7) / 31))) * (fx && !O.lightHere ? 1 - 0.3 * fx.night : 1) + (fx && !O.lightHere ? 0.45 * fx.night : 0);   // night: darker, never unreadable
    const fog = (fx ? fx.fog : 0.04) * thin;

    // the day's atmosphere: mist at dawn and dusk, clouds drifting downwind, their cover changing
    const hr = s / 3600, mist = 0.01 + 0.04 * Math.exp(-(((hr - 6.5) / 1.5) ** 2)) + 0.03 * Math.exp(-(((hr - 19) / 1.6) ** 2)) + (fx ? fx.mistBoost : 0);
    const cloudDir = fx ? Math.atan2(fx.windZ, fx.windX) : 0.6, cloudSpeed = fx ? 0.6 + 3 * fx.windStrength : 1.8;
    const cloudOff = [-s * cloudSpeed * Math.cos(cloudDir), -s * cloudSpeed * Math.sin(cloudDir)];
    const cover = fx ? fx.cover + 0.05 * Math.sin(TAU * s / 5400) : 0.36 + 0.14 * Math.sin(TAU * s / 5400);   // weather: real cloud; else broken to clear every 90 min
    const atmosU = (u2) => { gl.uniform2f(u2.uCloudOff, cloudOff[0], cloudOff[1]); gl.uniform1f(u2.uCloudCover, cover); gl.uniform1f(u2.uMist, mist); };
    // where the horizon and the light fall on screen
    const ndc = (x, y, z) => { const w = VP[3] * x + VP[7] * y + VP[11] * z + VP[15]; return [(VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / w, (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / w, w]; };
    const hzn = ndc(eye[0] + hx * 500, eye[1], eye[2] + hz * 500);
    const lhl = Math.hypot(L[0], L[2]) || 1, lp = ndc(eye[0] + L[0] / lhl * 500, eye[1], eye[2] + L[2] / lhl * 500);
    const lightX = lp[2] > 0 ? lp[0] : (lp[0] > 0 ? -3 : 3);
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // ── the real look's light: colours of the sun or moon, the sky, the fog, from the sun's height there
    const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const elRef = fx && !O.lightHere ? sun.el : elev, cloudK = fx ? wx.cloud : 0.35;
    const dayK = sm(-6, 12, elRef), golden = elRef > -6 ? Math.exp(-(((elRef - 4) / 7) ** 2)) : 0;
    let sunCol = lerp3(lerp3([0.10, 0.12, 0.2], [1.0, 0.97, 0.92], dayK), [1.0, 0.6, 0.3], golden * 0.8).map((v) => v * 1.25 * (1 - 0.6 * cloudK));
    let ambCol = lerp3(lerp3([0.035, 0.045, 0.08], [0.32, 0.42, 0.62], dayK), [0.42, 0.44, 0.47].map((v) => v * (0.15 + 0.85 * dayK)), cloudK * 0.8);
    const skyZen = lerp3(lerp3(lerp3([0.006, 0.01, 0.03], [0.2, 0.4, 0.78], dayK), [0.52, 0.54, 0.58].map((v) => v * (0.08 + 0.92 * dayK)), cloudK * 0.85), [0.35, 0.3, 0.45], golden * 0.3);
    const skyHor = lerp3(lerp3(lerp3([0.02, 0.025, 0.05], [0.68, 0.78, 0.9], dayK), [0.62, 0.63, 0.65].map((v) => v * (0.1 + 0.9 * dayK)), cloudK * 0.7), [0.97, 0.6, 0.36], golden * 0.6);
    const fogCol = skyHor.map((v) => -Math.log(1 - Math.min(0.97, v)) / (Math.max(0.5, exposure) * 2.2));
    const dryK = Math.min(1, 0.12 + (biome ? biome.pale * 1.4 : 0) + (fx ? sm(22, 36, wx.temp) * 0.35 + sm(0.5, 0.15, wx.rh) * 0.25 : 0));
    const colU = (u2) => { gl.uniform1i(u2.uLook, O.look); gl.uniform3fv(u2.uSunCol, sunCol); gl.uniform3fv(u2.uAmbCol, ambCol); gl.uniform3fv(u2.uFogCol, fogCol); gl.uniform1f(u2.uDry, dryK); };
    const sunN = ndc(eye[0] + L[0] * 500, eye[1] + L[1] * 500, eye[2] + L[2] * 500);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(sky.p); const k2 = sky.u;
    gl.uniform1i(k2.uLook, O.look); gl.uniform3fv(k2.uSkyZen, skyZen); gl.uniform3fv(k2.uSkyHor, skyHor);
    gl.uniform3fv(k2.uSunDisp, (sunN[2] > 0 && elRef > -2 ? sunCol : [0, 0, 0]).map((v) => v * 0.8)); gl.uniform2f(k2.uSunNdc, sunN[2] > 0 ? sunN[0] : 9, sunN[2] > 0 ? sunN[1] : 9);
    gl.uniform2f(k2.uRes, canvas.width, canvas.height); gl.uniform1f(k2.uHorizonY, hzn[1]); gl.uniform1f(k2.uLightX, lightX);
    gl.uniform1f(k2.uMist, mist); gl.uniform1f(k2.uExposure, exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(trees.p); const tr = trees.u; gl.uniform1f(tr.uRelief, relief); colU(tr);
    gl.uniformMatrix4fv(tr.uVP, false, VP); gl.uniform1i(tr.uM, TREE_M); gl.uniform1f(tr.uR, TREE_R); gl.uniform3fv(tr.uEye, eye); gl.uniform3fv(tr.uLight, L);
    gl.uniform1f(tr.uFog, fog); gl.uniform1f(tr.uExposure, exposure); gl.uniform1f(tr.uSeed, seedNow); atmosU(tr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2 * (TREE_M + 1));

    gl.useProgram(groundP.p); const g = groundP.u; atmosU(g); colU(g); gl.uniform3fv(g.uLight, L); gl.uniform1f(g.uRelief, relief); gl.uniform1f(g.uDrop, (2.2 * seaAmp + 0.3) * surf);
    gl.uniformMatrix4fv(g.uVP, false, VP); gl.uniform2f(g.uOrigin, origin[0], origin[1]); gl.uniform1f(g.uSpan, SPAN);
    gl.uniform1i(g.uRes, RES); gl.uniform3fv(g.uEye, eye); gl.uniform1f(g.uFog, fog); gl.uniform1f(g.uExposure, exposure); gl.uniform1f(g.uSeed, seedNow);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

    // the sea's four wave trains: wind sea, a shorter sea, the swell, a ripple. Periods are true;
    // wavelengths are shortened to a third so the waves fit the 46 m view.
    let trains = null, still = 1, aw = 0, as = 0;
    if (SS) {
      const toDir = (from) => { const a = (from + 180) * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; };
      const Lw = Math.min(28, Math.max(1.5, 9.81 * SS.T * SS.T / (2 * Math.PI) / 3)), Ls = Math.min(40, Math.max(6, 9.81 * SS.swellT * SS.swellT / (2 * Math.PI) / 3));
      const dw = toDir(SS.from), ds = toDir(SS.swellFrom), rot = (v, r) => [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)];
      still = SS.frozen ? 0 : 1; aw = seaAmp * 0.5 * still; as = (0.06 + 0.3 * Math.sqrt(SS.swellH)) * still;
      trains = [[dw, 2 * Math.PI / Lw, aw, 2 * Math.PI / SS.T], [rot(dw, 0.5), 2 * Math.PI / Lw * 1.7, aw * 0.45, 2 * Math.PI / SS.T * 1.3],
        [ds, 2 * Math.PI / Ls, as, 2 * Math.PI / SS.swellT], [rot(dw, -0.7), 2 * Math.PI / Lw * 3.1, 0.015 + aw * 0.12, 2 * Math.PI / SS.T * 1.76]];
    }
    const setTrains = (v) => { if (!trains) return; trains.forEach(([d, k, amp], i) => gl.uniform4f(v['uW' + (i + 1)], d[0], d[1], k, amp));
      gl.uniform4f(v.uWo, ...trains.map((t) => t[3] * still)); gl.uniform1f(v.uAmp, aw + as + 0.02); };
    gl.useProgram(grass.p); const u = grass.u; atmosU(u); colU(u); gl.uniform1f(u.uSpan, SPAN);
    gl.uniform3fv(u.uSway, sway); gl.uniform1f(u.uBow, bow);
    setTrains(u); gl.uniform1f(u.uSeaMove, trains ? seaness * still : 0); gl.uniform1f(u.uSeaWhite, SS ? SS.whitecaps : 0); gl.uniform1f(u.uSeaT, sE % 86400);
    gl.uniform1f(u.uRelief, relief); gl.uniform1f(u.uDensity, density); gl.uniform1f(u.uHScale, hScale);
    gl.uniform1i(u.uShow, SHOW);
    gl.uniform1i(u.uGlitch, G ? G.kind : 0); gl.uniform1f(u.uG, G ? G.e : 0); gl.uniform1f(u.uP, G ? G.p : 0);
    gl.uniform1i(u.uTint, C ? C.mode : 0); gl.uniform1f(u.uTintE, C ? C.e * nightK : 0); gl.uniform1f(u.uHue, tintHue);
    gl.uniform3fv(u.uDichA, dichA); gl.uniform3fv(u.uDichB, dichB); gl.uniform1f(u.uDich, O.dich === 0 || (O.look && O.dich === null) ? 0 : dich * (O.dich || 1));
    gl.uniform1f(u.uPx, canvas.height * 0.5 / Math.tan(0.31));
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uEye, eye); gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform1f(u.uCell, CELL); gl.uniform1i(u.uN, N); gl.uniform1i(u.uPer, O.per); gl.uniform1f(u.uTime, time);
    gl.uniform3f(u.uWind, W.x, W.z, W.strength); gl.uniform1i(u.uSegs, SEGS); gl.uniform3fv(u.uLight, L);
    gl.uniform1f(u.uFog, fog); gl.uniform1f(u.uExposure, exposure); gl.uniform1f(u.uSeed, seedNow);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (SEGS + 1), N * N * O.per);
    if (O.look && O.flowers > 0) {
      // flowers in season: the warm half of the year where the journey is, all year in the tropics
      const latF = J ? J.lat : 38, mon = new Date(ms).getMonth(), north = mon >= 3 && mon <= 8;
      const season = Math.abs(latF) < 23 ? 0.85 : (latF >= 0) === north ? 1 : 0.3;
      const climate = biome ? Math.min(1, biome.density) * (1 - biome.pale) : 1;
      const fAmt = O.flowers * season * climate * (fx ? 1 - fx.snow : 1);
      if (fAmt > 0.01) {
        gl.useProgram(flowerP.p); const fu = flowerP.u; atmosU(fu); colU(fu);
        gl.uniformMatrix4fv(fu.uVP, false, VP); gl.uniform3fv(fu.uEye, eye); gl.uniform2f(fu.uOrigin, origin[0], origin[1]);
        gl.uniform1i(fu.uFN, FN); gl.uniform1f(fu.uFCell, FCELL); gl.uniform1f(fu.uTime, time); gl.uniform3f(fu.uWind, W.x, W.z, W.strength);
        gl.uniform1f(fu.uFlowers, fAmt); gl.uniform3fv(fu.uSway, sway); gl.uniform1f(fu.uBow, bow); gl.uniform1f(fu.uRelief, relief); gl.uniform3fv(fu.uLight, L);
        gl.uniform1f(fu.uFog, fog); gl.uniform1f(fu.uExposure, exposure); gl.uniform1f(fu.uSeed, seedNow);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 84, FN * FN);
      }
    }
    if (SS && O.seaSurface) {
      gl.useProgram(seaP.p); const v = seaP.u; atmosU(v); colU(v); setTrains(v);
      gl.uniform1f(v.uSea, seaness); gl.uniform1f(v.uWhite, SS.frozen ? 0 : SS.whitecaps); gl.uniform1f(v.uFoam, SS.frozen ? 0 : SS.foam); gl.uniform1f(v.uGlassy, SS.glassy);
      gl.uniform1f(v.uRelief, relief); gl.uniform1f(v.uSpan, SPAN); gl.uniform1f(v.uPx, canvas.height * 0.5 / Math.tan(0.31));
      gl.uniform1i(v.uShow, SHOW); gl.uniform1i(v.uGlitch, G ? G.kind : 0); gl.uniform1f(v.uG, G ? G.e : 0); gl.uniform1f(v.uP, G ? G.p : 0);
      gl.uniform1i(v.uTint, C ? C.mode : 0); gl.uniform1f(v.uTintE, C ? C.e * nightK : 0); gl.uniform1f(v.uHue, tintHue);
      gl.uniform3fv(v.uDichA, dichA); gl.uniform3fv(v.uDichB, dichB); gl.uniform1f(v.uDich, O.dich === 0 ? 0 : dich * (O.dich || 1));
      gl.uniformMatrix4fv(v.uVP, false, VP); gl.uniform3fv(v.uEye, eye); gl.uniform2f(v.uOrigin, origin[0], origin[1]);
      gl.uniform1f(v.uCell, CELL); gl.uniform1i(v.uN, N); gl.uniform1i(v.uPer, O.per); gl.uniform1f(v.uTime, (sE % 86400));
      gl.uniform1i(v.uSegs, SEGS); gl.uniform3fv(v.uLight, L); gl.uniform1f(v.uFog, fog); gl.uniform1f(v.uExposure, exposure); gl.uniform1f(v.uSeed, seedNow);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (SEGS + 1), N * N * O.per);
    }

    // resolve the antialiased scene; once a second, keep a small copy for the history
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFB); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFB);
    gl.blitFramebuffer(0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    const second = Math.floor(ms / 1000);
    if (filled < 0) { pushHistory(true); p90 = brightness(); } else if (second !== lastSecond) { pushHistory(false); p90 = brightness(); }
    lastSecond = second;
    // the finishing pass, to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(post.p); const pu = post.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(pu.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, histTex); gl.uniform1i(pu.uHist, 1);
    gl.uniform1i(pu.uHead, head); gl.uniform1i(pu.uLayers, LAYERS); gl.uniform1f(pu.uFilled, filled);
    gl.uniform2f(pu.uRes, canvas.width, canvas.height);
    gl.uniform1i(pu.uGlitch, G ? G.kind : 0); gl.uniform1f(pu.uG, G ? G.e : 0); gl.uniform1f(pu.uP, G ? G.p : 0);
    gl.uniform1i(pu.uTint, C ? C.mode : 0); gl.uniform1f(pu.uTintE, C ? C.e * nightK : 0); gl.uniform1f(pu.uHue, tintHue);
    // weather in the finishing pass: falling lines, snow's stillness, the tilt, the storm's flashes
    const slant = fx ? -(fx.windX * hz - fx.windZ * hx) * Math.min(1, fx.windStrength) * 0.35 : 0;   // wind across the view
    const flash = fx && fx.storm && Score.ih(Math.floor(ms / 120) ^ 0x7a11) % 83 === 0 ? 1 : 0;
    gl.uniform1f(pu.uRain, fx ? fx.rain : 0); gl.uniform1f(pu.uSnow, fx ? fx.snow : 0); gl.uniform1f(pu.uSlant, slant);
    gl.uniform1f(pu.uTimeS, (ms / 1000) % 3600); gl.uniform1f(pu.uTilt, fx ? fx.tilt : 0); gl.uniform1f(pu.uFlash, flash);
    // the registers: daylight there turns the night to paper; humidity and rain bring wash and
    // water; wind drags the tone into charcoal strokes
    let inkW, wet, windy;
    if (fx) {
      inkW = O.lightHere ? sm(26, 34, elev) : sm(-4, 10, sun.el);
      wet = Math.min(1, 0.7 * sm(0.55, 0.95, wx.rh) + 0.6 * fx.rain + 0.5 * sm(0.05, 0.2, fx.fog));
      windy = sm(0.45, 1.0, fx.windStrength);
    } else { inkW = sm(26, 34, elev); wet = 0.25 + 0.25 * Math.sin(TAU * s / 25200); windy = sm(0.55, 1.0, W.strength); }
    let style = { ink: O.paper ? inkW : 0, wash: 0.8 * wet, char: 0.6 * windy, water: 0, drip: 0 };   // water only where the journey is over the sea (below)
    const forced = { nocturne: { ink: 0, wash: 0, char: 0, water: 0, drip: 0 }, ink: { ink: 1, wash: 0, char: 0, water: 0, drip: 0 },
      wash: { ink: 0, wash: 0.9, char: 0, water: 0, drip: 0 }, charcoal: { ink: 0, wash: 0, char: 0.75, water: 0, drip: 0 },
      water: { ink: 0, wash: 0, char: 0, water: 0.32, drip: 1 } }[O.style];
    // the waterline never rises above the horizon: at sea it sits just below it
    const horizonUv = Math.min(0.55, Math.max(0.2, (hzn[1] + 1) / 2 - 0.03));
    // at sea, and only at sea: the waterline just below the horizon; threads only if it is also wet
    if (geo) {   // the sea is drawn as a surface now: no reflection register
      if (biome) style.char = Math.min(0.9, style.char + biome.comb); }
    if (O.look) { style.ink = 0; style.wash = 0; style.char = 0; }   // the real look keeps its colour; registers only when asked for
    if (forced) style = forced;
    const wsx = W.x * -hz + W.z * hx, wsy = 0.4 * (W.x * hx + W.z * hz), wl = Math.hypot(wsx, wsy) || 1;
    gl.uniform1f(pu.uWaterY, style.water); gl.uniform1f(pu.uRipple, 0.3 + (fx ? fx.windStrength : W.strength)); gl.uniform1f(pu.uDrip, style.drip);
    // ease toward the gain that brings the frame's 90th percentile up to 0.32
    const gainTarget = Math.min(4, Math.max(1, 0.32 / Math.max(p90, 0.02)));
    gain = O.still ? gainTarget : gain + (gainTarget - gain) * 0.02;
    gl.uniform1f(pu.uGain, gain);
    gl.uniform1f(pu.uStage, stageK);
    gl.uniform1f(pu.uNear, O.near * (0.75 + 0.25 * wet)); gl.uniform1f(pu.uP90, p90); gl.uniform1f(pu.uInk, style.ink); gl.uniform1f(pu.uWash, style.wash); gl.uniform1f(pu.uChar, style.char); gl.uniform2f(pu.uWDir, wsx / wl, wsy / wl);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);

    overlay(ms, sE, { eye, look, hx, hz, VP, ndc, W, G, C, origin, J, sun, wx, style, geo, bright: dayK > 0.6 && cloudK < 0.85, PH, GL, dance });

    stage.style.opacity = String(dimAt(ms, O.dim));
    if (ov) ov.style.opacity = stage.style.opacity;
    if (O.hud) {
      const d = new Date(ms), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      hud.textContent = 'GRASS NOCTURNE · ' + hh + ' · EYE ' + e.h.toFixed(2) + ' M · LIGHT ' + Math.round(Math.asin(L[1]) * 180 / Math.PI) + '° · WIND ' + W.strength.toFixed(2);
    }
    if (!O.still || (Date.now() < stillUntil && (!(reader && reader.place) || (O.geo && !geo)))) requestAnimationFrame(frame);   // a held clock is drawn once (after waiting for weather)
    else canvas.dataset.drawn = '1';
  }
  // ───────────────────────── the measurements ─────────────────────────
  // Each reads the same functions that draw: the blade's own hash and shape, the thinning, the
  // census of the window, the clock, the score. Drawn in the single-stroke letters of 048.
  const font = global.StrokeFont;
  const PER_SEGS = SEGS, FRAME_EPOCH = new Date(2026, 10, 1).getTime();      // frames counted from 1 Nov 2026, 00:00
  const hbOf = (cx, cz, k) => ihash(((Math.imul(cx >>> 0, 73856093) ^ Math.imul(cz >>> 0, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(seedNow, 2654435761)) >>> 0));
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
      case 11: case 12: case 13: case 14: case 15: return weatherLines(M.kind, ms, f);
      case 16: case 17: case 18: case 19: case 20: case 21: return geoLines(M.kind, ms, f);
      case 22: return homageLines(ms, f);
      default: { const t = Score.todaySoFar(ms); return { lines: ['TODAY ' + grp(t.events) + ' EVENTS', t.glitches + ' GLITCHES - ' + t.colours + ' COLOUR MINUTES', grp(t.measures) + ' MEASUREMENTS'] }; }
    }
  }
  const s0 = (ms) => dayS(ms);
  const deg = (v, pos, neg) => Math.abs(v).toFixed(1) + ' ' + (v >= 0 ? pos : neg);
  const up = (str) => String(str).toUpperCase().replace(/[^A-Z0-9 .,:;\/*=+()<>#%-]/g, ' ').replace(/\s+/g, ' ').trim();
  const dur = (h) => (h >= 24 ? Math.floor(h / 24) + ' D ' : '') + (h % 24) + ' H';
  function geoLines(kind, ms, f) {
    if (!f.J || !f.geo) return { lines: ['GROUND NOT LOADED', O.geo ? 'READING THE MAP' : 'GEOGRAPHY OFF'] };
    const g = f.geo, J = f.J;
    switch (kind) {
      case 16: return { lines: g.land
        ? [up(g.country), 'LAND - ' + grp(g.coastKm) + ' KM FROM THE COAST - ' + grp(g.elev) + ' M ABOVE THE SEA', g.hasClimate ? 'CLIMATE ' + up(g.climate) + ' - ' + (g.biome ? g.biome.name : '') : 'CLIMATE MAP NOT YET ADDED']
        : [up('the ' + g.sea), 'SEA - ' + grp(-g.coastKm) + ' KM FROM THE COAST'] };
      case 17: { const p = Geo.nearestPlace(J.lat, J.lon); return { lines: ['NEAREST CITY ' + up(p.name) + ', ' + up(p.country), grp(p.km) + ' KM, BEARING ' + Math.round(p.bearing) + ' DEG'] }; }
      case 18: { const km = Geo.travelled(J1, ms, O.from), n = Geo.nextChange(J1, ms, O.from, !g.land);
        return { lines: ['TRAVELLED ' + grp(km) + ' KM IN ' + (J.day + 1) + ' DAYS', n ? (g.land ? 'TO SEA IN ' + dur(n.hours) + ': ' + up(n.ground.sea) : 'LANDFALL IN ' + dur(n.hours) + ': ' + up(n.ground.country)) : 'NO CHANGE FOR 200 DAYS'] }; }
      case 19: { const c = Geo.lastCrossing(J1, ms, O.from);
        if (!c) return { lines: ['NOTHING CROSSED', 'IN 60 DAYS'] };
        const d = new Date(c.when), ago = (ms - c.when) / 36e5;
        return { lines: ['CROSSED ' + up(c.what), pad(d.getDate(), 2) + '.' + pad(d.getMonth() + 1, 2) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ' - ' + dur(Math.max(0, Math.round(ago))) + ' AGO'] }; }
      case 21: { if (g.land || !f.wx) return { lines: ['ON LAND - THE NEAREST SEA:', up('the ' + g.sea) + ', ' + grp(g.coastKm) + ' KM'] };
        const q = Wx.seaState(f.wx, J.lat);
        return { lines: ['SEA STATE ' + q.douglas + ' - ' + q.name, 'WAVES ' + q.hs.toFixed(1) + ' M, ' + q.T.toFixed(1) + ' S, FROM ' + Math.round(q.from) + ' DEG',
          'SWELL ' + q.swellH.toFixed(1) + ' M, ' + q.swellT.toFixed(0) + ' S - ' + (q.measured ? 'MEASURED' : 'FROM THE WIND')] }; }
      default: { const a = Geo.antipode(J.lat, J.lon), ga = Geo.at(a.lat, a.lon);
        return { lines: ['THE ANTIPODE ' + deg(a.lat, 'N', 'S') + ' ' + deg(a.lon, 'E', 'W'), ga.land ? 'LAND - ' + up(ga.country) : 'SEA - ' + up('the ' + ga.sea)] }; }
    }
  }
  // ── where: a small map of the two schools, the route and the meadow, with words for the place
  let mapCache = { key: '', coast: [] };
  function placeWords(lat, lon) {
    const g = Geo.ready() ? Geo.at(lat, lon) : null;
    if (!g) return '';
    if (!g.land) return 'OVER ' + up('the ' + g.sea);
    const home = HOMES.find((h) => Geo.haversine(lat, lon, h.lat, h.lon) < 5);   // at a school: its own city
    if (home) return 'IN ' + home.name + ', ' + up(g.country);
    const c = Geo.nearestPlace(lat, lon);
    return c && c.km < 40 ? 'IN ' + up(c.name) + ', ' + up(g.country) : c && c.km < 150 ? 'NEAR ' + up(c.name) + ', ' + up(g.country) : 'IN ' + up(g.country);
  }
  function drawWhere(ms, f, size) {
    if (!f.PH || !Geo.ready()) return;
    const W = ov.width, H = ov.height, pw = Math.round(W * 0.24), ph = Math.round(pw * 0.62);
    const x0 = W - pw - W * 0.03, y0 = H * 0.06;
    // the frame of the map: both schools, the whole route when travelling, the glimpse; padded
    const pts = HOMES.map((h) => [h.lat, h.lon]);
    if (f.PH.state === 'travel') for (let i = 0; i <= 60; i++) { const q = Wx.alongPath(f.PH.path, i / 60); pts.push([q.lat, q.lon]); }
    let la0 = Math.min(...pts.map((p) => p[0])), la1 = Math.max(...pts.map((p) => p[0]));
    let lo0 = Math.min(...pts.map((p) => p[1])), lo1 = Math.max(...pts.map((p) => p[1]));
    if (lo1 - lo0 > 180) { lo0 = -180; lo1 = 180; }
    const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
    let wDeg = (lo1 - lo0) * k, hDeg = la1 - la0; const pad = 0.18;
    wDeg *= 1 + 2 * pad; hDeg *= 1 + 2 * pad;
    if (wDeg / hDeg < pw / ph) wDeg = hDeg * pw / ph; else hDeg = wDeg * ph / pw;
    const cLat = (la0 + la1) / 2, cLon = (lo0 + lo1) / 2;
    const X = (lon) => x0 + pw / 2 + ((lon - cLon) * k) / wDeg * pw, Y = (lat) => y0 + ph / 2 - (lat - cLat) / hDeg * ph;
    // the backing, so the lines read on any sky
    ox.save(); ox.globalAlpha = 0.28; ox.fillStyle = f.bright && O.look ? 'rgb(255,255,255)' : 'rgb(0,0,0)'; ox.fillRect(x0 - 8, y0 - 8, pw + 16, ph + size * 12.5); ox.restore();
    // coastlines, from the piece's own map: marching squares on the land mask, cached per frame of map
    const key = [cLat, cLon, wDeg, hDeg].map((v) => v.toFixed(2)).join(',');
    if (key !== mapCache.key) {
      const nx = 110, ny = Math.round(nx * ph / pw), segs = [], lonAt = (i) => cLon + (i / nx - 0.5) * wDeg / k, latAt = (j) => cLat + (0.5 - j / ny) * hDeg;
      const L = []; for (let j = 0; j <= ny; j++) { L.push([]); for (let i = 0; i <= nx; i++) L[j].push(Geo.isLand(latAt(j), ((lonAt(i) + 540) % 360) - 180) ? 1 : 0); }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = L[j][i], b = L[j][i + 1], c = L[j + 1][i + 1], d = L[j + 1][i], e = [];
        if (a !== b) e.push([i + 0.5, j]); if (b !== c) e.push([i + 1, j + 0.5]); if (c !== d) e.push([i + 0.5, j + 1]); if (d !== a) e.push([i, j + 0.5]);
        if (e.length >= 2) segs.push([e[0], e[1]]); if (e.length === 4) segs.push([e[2], e[3]]);
      }
      mapCache = { key, coast: segs.map(([p, q]) => [x0 + p[0] / nx * pw, y0 + p[1] / ny * ph, x0 + q[0] / nx * pw, y0 + q[1] / ny * ph]) };
    }
    ox.beginPath(); for (const s2 of mapCache.coast) { ox.moveTo(s2[0], s2[1]); ox.lineTo(s2[2], s2[3]); }
    ox.globalAlpha = 0.45; ox.stroke(); ox.globalAlpha = 0.9;
    // the route (or the direct line, at a home), the two schools, and the meadow
    ox.beginPath();
    const path = f.PH.state === 'travel' ? f.PH.path : Wx.tripPath(f.PH.home === 0 ? 2 * f.PH.week : 2 * f.PH.week + 1, HOMES);
    let px = null;
    for (let i = 0; i <= 120; i++) { const q = Wx.alongPath(path, i / 120), x = X(q.lon), y = Y(q.lat);
      if (px === null || Math.abs(x - px) > pw * 0.5) ox.moveTo(x, y); else ox.lineTo(x, y); px = x; }
    ox.setLineDash(f.PH.state === 'travel' ? [] : [size * 0.4, size * 0.5]); ox.stroke(); ox.setLineDash([]);
    ox.beginPath();
    for (const h of HOMES) {
      const hx = X(h.lon), hy = Y(h.lat); ox.moveTo(hx + size * 0.45, hy); ox.arc(hx, hy, size * 0.45, 0, Math.PI * 2);
      const label = (h.short ? h.short + ' - ' : '') + h.name, lw = font ? font.width(label, size * 0.8) : 0;
      strokeText(label, Math.min(x0 + pw - lw, Math.max(x0, hx - lw / 2)), hy + (hy < y0 + ph * 0.5 ? size * 0.9 : -size * 1.8), size * 0.8);
    }
    ox.stroke();
    const mx = X(f.J.lon), my = Y(f.J.lat);
    ox.beginPath(); ox.arc(mx, my, size * 0.32, 0, Math.PI * 2); ox.fill(); ox.beginPath(); ox.arc(mx, my, size * 0.85, 0, Math.PI * 2); ox.stroke();
    // the words
    ox.beginPath();
    const dist = (h) => Geo.haversine(f.J.lat, f.J.lon, h.lat, h.lon), there = (h) => dist(h) < 5 ? 'HERE' : grp(dist(h)) + ' KM';
    const lines = [deg(f.J.lat, 'N', 'S') + ' ' + deg(f.J.lon, 'E', 'W') + (f.GL ? ' - A GLIMPSE' : ''), placeWords(f.J.lat, f.J.lon)]
      .concat(...HOMES.map((h) => h.inst ? [h.inst, '   ' + h.name + ' - ' + there(h)] : [h.name + ' - ' + there(h)]));
    lines.forEach((l, i) => strokeText(l, x0, y0 + ph + size * 1.2 + i * size * 1.75, size * 0.85));
    ox.stroke();
  }
  function homageLines(ms, f) {
    if (!f.PH) return { lines: ['NOT IN THE HOMAGE', 'A ' + (f.J ? f.J.mode : 'FIXED').toUpperCase() + ' TRACK'] };
    const P = f.PH, d = f.dance, c = 'COUNT ' + d.count + ' OF 8 - ' + d.tempo + ' ' + d.bpm + (d.unison ? ' - UNISON' : ' - CANON');
    const hrs = (x) => (x >= 864e5 ? Math.floor(x / 864e5) + ' D ' : '') + Math.floor(x % 864e5 / 36e5) + ' H';
    if (P.state === 'home') {
      const other = HOMES[1 - P.home], here = HOMES[P.home];
      return { lines: ['IN RESIDENCE - ' + here.name + ' - DAY ' + (Math.floor(P.since / 864e5) + 1) + ' OF 3', c,
        other.name + ' ' + grp(Geo.haversine(here.lat, here.lon, other.lat, other.lon)) + ' KM - LEAVING IN ' + hrs(P.left)] };
    }
    const T = P.path, far = T.pts.slice(1, -1).sort((a, b) => Geo.haversine(b.lat, b.lon, T.from.lat, T.from.lon) - Geo.haversine(a.lat, a.lon, T.from.lat, T.from.lon))[0];
    const via = far ? Geo.nearestPlace(far.lat, far.lon) : null;
    return { lines: ['TRIP ' + (T.n + 1) + ' - ' + T.from.name + ' TO ' + T.to.name + ' - ' + T.label, grp(T.km) + ' KM, ' + Math.round(P.f * 100) + '% ALONG' + (via ? ' - BY WAY OF ' + up(via.name) : ''), c] };
  }
  function weatherLines(kind, ms, f) {
    if (!f.J) return { lines: ['WEATHER OFF', 'THE BUILT-IN DAY'] };
    const w = f.wx, there = Wx.solarClock(ms, f.J.lon), none = w.builtIn;
    switch (kind) {
      case 11: return { lines: [deg(f.J.lat, 'N', 'S') + ' ' + deg(f.J.lon, 'E', 'W'), hhmm(there) + ' THERE - SUN ' + Math.abs(f.sun.el).toFixed(0) + (f.sun.el >= 0 ? ' DEG HIGH' : ' DEG BELOW'), f.J.mode === 'place' ? 'A FIXED PLACE' : f.J.mode === 'homage' ? (f.GL ? 'GLIMPSE OF ' + HOMES[f.GL.home].name : f.PH.state === 'home' ? 'AT ' + HOMES[f.PH.home].name : 'TRIP ' + (f.PH.n + 1)) : 'DAY ' + (f.J.day + 1) + (f.J.mode === 'route' ? ' OF THE ROUTE' : ' OF THE JOURNEY')] };
      case 12: return { lines: ['WIND ' + w.speed.toFixed(1) + ' M/S FROM ' + Math.round(w.dir) + ' DEG', 'GUSTS ' + w.gusts.toFixed(1) + ' M/S'].concat(none ? ['BUILT-IN, NO READING'] : []) };
      case 13: return { lines: ['PRESSURE ' + Math.round(w.pressure) + ' HPA ' + (Math.abs(w.trend) < 0.3 ? 'STEADY' : (w.trend > 0 ? 'RISING ' : 'FALLING ') + Math.abs(w.trend).toFixed(1)), 'HUMIDITY ' + Math.round(w.rh * 100) + '% - ' + w.temp.toFixed(1) + ' C'] };
      case 14: return { lines: ['CLOUD ' + Math.round(w.cloud * 100) + '% - VISIBILITY ' + (w.vis / 1000).toFixed(1) + ' KM', 'PRECIPITATION ' + w.precip.toFixed(1) + ' MM/H' + (w.snow > 0 ? ' - SNOW ' + w.snow.toFixed(1) + ' CM/H' : '')] };
      default: return { lines: [].concat(none ? ['NO READING', 'BUILT-IN WEATHER' + (w.error ? ' - ' + String(w.error).toUpperCase().replace(/[^A-Z0-9 .:\/-]/g, '').slice(0, 40) : '')] : ['WEATHER CODE ' + w.code + ' - ' + (Wx.WMO[w.code] || 'UNLISTED'), 'READ ' + Math.round(w.ageMin || 0) + ' MIN AGO'], ['INK ' + f.style.ink.toFixed(2) + ' WASH ' + f.style.wash.toFixed(2) + ' CHARCOAL ' + f.style.char.toFixed(2) + ' WATER ' + f.style.water.toFixed(2)]) };
    }
  }
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
    ox.strokeStyle = (f.style && f.style.ink > 0.5) || (O.look && f.bright) ? 'rgb(24, 26, 32)' : 'rgb(222, 219, 211)'; ox.beginPath();
    // the cause, low on the left, while a glitch or a colour is on
    const causes = [];
    if (f.GL) causes.push('GLIMPSE - ' + HOMES[f.GL.home].name);
    if (O.dedication && (ms / 1000) % 3600 > 10 && (ms / 1000) % 3600 < 50) causes.push('FOR THE ROYAL BALLET SCHOOL AND THE CENTRE FOR DANCE STUDIES');
    if (f.G && f.G.e > 0.02) causes.push('GLITCH ' + f.G.kind + ' - ' + Score.GLITCHES[f.G.kind].toUpperCase() + (f.G.cause ? ' - ' + f.G.cause : f.G.m !== undefined ? ' - MINUTE ' + f.G.m + ' IS PRIME' : ''));
    if (f.C && f.C.e > 0.02) causes.push('COLOUR ' + f.C.mode + ' - ' + Score.COLOURS[f.C.mode].toUpperCase() + (f.C.hhmm !== undefined ? ' - ' + f.C.hhmm + ' IS PRIME' : ''));
    causes.forEach((c, i) => strokeText(c, W * 0.035, H * 0.93 - (causes.length - 1 - i) * lh, size));
    ox.globalAlpha = 0.85; ox.stroke();
    // where: thirty seconds of every two minutes, and through every glimpse
    if (O.where && f.PH && ((ms / 1000) % 120 < 30 || f.GL)) { ox.fillStyle = ox.strokeStyle; drawWhere(ms, f, size); ox.globalAlpha = 0.85; }
    // the measurement of these 30 seconds
    const M = O.measure ? { kind: O.measure, k: Math.floor(sE / 30), e: 1 } : O.score ? Score.measureAt(ms) : null;
    if (!M || M.e <= 0.01) { ox.globalAlpha = 1; return; }
    if (M.k !== cacheK || O.measure) { cacheK = M.k; cache = measurement(M, ms, sE, f); }
    let info = cache;
    if (M.kind === 4 || M.kind === 5 || M.kind === 7 || (M.kind >= 10 && M.kind <= 15) || M.kind === 22) info = measurement(M, ms, sE, f);   // these change while shown
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
