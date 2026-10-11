// 040 — the shaders. One full-screen pass per view: the ray from the eye marched over 028's
// heightfield (and, at the feet, over its fine ground), the land lit by the sun with soft
// shadows and the sky's light, the cloud deck marched as a volume between the eye and the land,
// and the air between them. Everything is in 028's world units: x and z are cells of the
// 1024² grid, y is height in the same unit.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;

uniform sampler2D uH;      // RG32F  N×N: height, smoothed height (fetched, filtered by hand)
uniform sampler2D uNrm;    // RGBA8  N×N: shading normal (028's slope-smoothed), ambient occlusion
uniform sampler2D uMat;    // RGBA8  N×N: rock, snow, albedo, water (1) or track (≤ 0.9)
uniform sampler2D uNearH;  // R32F   M×M: the fine ground at the feet
uniform sampler2D uNearR;  // R8     M×M: its rock
uniform sampler3D uNoise;  // RGBA8 64³, tiling: fbm, billows, fine fbm
uniform sampler2D uDeckT;  // RG16F 256²: the deck's rise over the land (0.3 × (smoothed height − mean)), lee factor

uniform vec2  uView;       // viewport size (px)
uniform vec2  uOrigin;     // viewport origin in the canvas (px)
uniform vec4  uFrame;      // frame width, frame height, x offset of this sheet in the frame, focal (px)
uniform vec3  uEye;
uniform vec2  uYawPitch;
uniform float uRoll;
uniform float uN;          // grid size
uniform float uMaxH;
uniform vec4  uNear;       // x0, z0, cell, M  (M = 0: no fine ground)
uniform vec3  uSun;        // toward the sun (or the moon)
uniform vec3  uSunCol;
uniform vec3  uSkyZen, uSkyHor, uGlow;
uniform float uNight, uOvercast, uRime, uDirect, uAmbient;
uniform vec4  uDeck;       // deck altitude, thickness, mean height of the land in view, cover
uniform vec4  uWind;       // wind x, wind z, drift (units), whiteout visibility (0 = not a whiteout)
uniform float uHaze, uExposure, uTime, uQuality, uSeed;
uniform vec2  uJit;        // sub-pixel offset of this pass (the still view is averaged over several)
uniform vec4  uCairns[12];
uniform int   uNCairns;

out vec4 outColor;

float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// the land continues, reflected, past the edge of the grid (as 028's weather does), so a long
// view ends in haze, not at the edge of the survey
float mirr(float v) { float n = uN - 1.0; v = mod(abs(v), 2.0 * n); return v > n ? 2.0 * n - v : v; }
vec2 mirr2(vec2 p) { return vec2(mirr(p.x), mirr(p.y)); }

vec2 fetchH(ivec2 i) { return texelFetch(uH, clamp(i, ivec2(0), ivec2(int(uN) - 1)), 0).rg; }
// bilinear on the lattice, as 028's bil(): heights live at integer cells
vec2 bilH(vec2 p) {
  p = mirr2(p);
  vec2 f = fract(p); ivec2 i = ivec2(floor(p));
  vec2 a = fetchH(i), b = fetchH(i + ivec2(1, 0)), c = fetchH(i + ivec2(0, 1)), d = fetchH(i + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float bilNear(vec2 g) {
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g); int M = int(uNear.w) - 1;
  float a = texelFetch(uNearH, clamp(i, ivec2(0), ivec2(M)), 0).r, b = texelFetch(uNearH, clamp(i + ivec2(1, 0), ivec2(0), ivec2(M)), 0).r;
  float c = texelFetch(uNearH, clamp(i + ivec2(0, 1), ivec2(0), ivec2(M)), 0).r, d = texelFetch(uNearH, clamp(i + ivec2(1, 1), ivec2(0), ivec2(M)), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// the fine ground takes over near the feet, but not on a cliff: it cannot hold a wall (028)
float nearWeight(vec2 p, out vec2 g) {
  g = vec2(0.0);
  if (uNear.w < 2.0) return 0.0;
  g = (p - uNear.xy) / uNear.z;
  float e = min(min(g.x, g.y), min(uNear.w - 1.0 - g.x, uNear.w - 1.0 - g.y)) * uNear.z;
  if (e <= 0.0) return 0.0;
  float sx = bilH(p + vec2(1, 0)).x - bilH(p - vec2(1, 0)).x, sz = bilH(p + vec2(0, 1)).x - bilH(p - vec2(0, 1)).x;
  return sstep(0.0, 7.0, e) * sstep(2.2, 1.1, length(vec2(sx, sz)) * 0.5);
}
float terrain(vec2 p) {
  float h = bilH(p).x;
  if (uNear.w > 1.0 && abs(p.x - uNear.x - uNear.w * uNear.z * 0.5) < uNear.w * uNear.z * 0.5 && abs(p.y - uNear.y - uNear.w * uNear.z * 0.5) < uNear.w * uNear.z * 0.5) {
    vec2 g; float w = nearWeight(p, g);
    if (w > 0.0) h = mix(h, bilNear(g), w);
  }
  return h;
}

// ── the eye's ray. 028's camera: a level horizon shifted by the pitch (verticals stay
// vertical), the frame rolled about its centre.
vec3 eyeRay(vec2 frag) {
  vec2 q = frag - uOrigin;
  float x = q.x + uFrame.z, y = uFrame.y - q.y;                 // pixel in the frame, y down
  float ux = x - uFrame.x * 0.5, uy = y - uFrame.y * 0.5, cr = cos(uRoll), sr = sin(uRoll);
  float rx = ux * cr - uy * sr, ry = ux * sr + uy * cr;           // into the upright render
  float kx = rx / uFrame.w, ky = -ry / uFrame.w + tan(uYawPitch.y);
  vec3 f = vec3(cos(uYawPitch.x), 0.0, sin(uYawPitch.x)), r = vec3(-f.z, 0.0, f.x);
  return normalize(f + r * kx + vec3(0.0, ky, 0.0));
}

float marchLand(vec3 ro, vec3 rd, float tmax) {
  int steps = uQuality > 1.5 ? 900 : uQuality > 0.5 ? 620 : 360;
  float t = 0.25, tp = t;
  for (int i = 0; i < 900; i++) {
    if (i >= steps || t > tmax) break;
    vec3 p = ro + rd * t;
    if (p.y > uMaxH && rd.y >= 0.0) break;
    float d = p.y - terrain(p.xz);
    if (d < 0.0) {
      float a = tp, b = t;                                        // the crossing, bisected
      for (int k = 0; k < 7; k++) { float m = 0.5 * (a + b); vec3 q = ro + rd * m; if (q.y - terrain(q.xz) < 0.0) b = m; else a = m; }
      return 0.5 * (a + b);
    }
    tp = t;
    // the step: by the height above the land, but never more than a fraction of the distance
    // (a long step from high above went clean through a thin fin of rock and showed the land
    // behind it as a dark slot)
    t += clamp(d * 0.35, 0.004 * t + 0.01, 0.2 + 0.011 * t);
  }
  return -1.0;
}

// soft shadow toward the sun over the land
float sunShadow(vec3 p, vec3 n) {
  if (uSun.y <= -0.02) return 0.0;
  vec3 ro = p + n * 0.4 + uSun * 0.3; float res = 1.0, t = 0.6;
  int steps = uQuality > 0.5 ? 56 : 32;
  for (int i = 0; i < 56; i++) {
    if (i >= steps) break;
    vec3 q = ro + uSun * t;
    if (q.y > uMaxH) break;
    float d = q.y - bilH(q.xz).x;
    res = min(res, 9.0 * d / t);
    if (res < 0.0) return 0.0;
    t += clamp(d * 0.5, 0.4, 30.0) * (1.0 + t * 0.004);
    if (t > 900.0) break;
  }
  return sstep(0.0, 1.0, res);
}

// ── the cloud deck: a layer that hugs the smoothed ground (its altitude follows the land a
// third of the way), combed along the wind, thick where the air climbs and thin in the lee
vec2 windFrame(vec2 xz) { return vec2(dot(xz, uWind.xy), dot(xz, vec2(-uWind.y, uWind.x))); }
// (precomputed per seed: the lee comes from the smoothed ground 12 units up- and downwind)
float deckAlt(vec2 xz, out float lee) {
  vec2 d = texture(uDeckT, xz / uN).rg;
  lee = d.g;
  return uDeck.x + d.r;
}
float cloudDensity(vec3 p, float lod) {
  float lee; float alt = deckAlt(p.xz, lee);
  float v = (p.y - alt) / uDeck.y;
  float prof = exp(-v * v);
  if (prof < 0.02) return 0.0;
  vec2 ac = windFrame(p.xz); ac.x -= uWind.z;                    // carried along the wind
  vec4 n = texture(uNoise, vec3(ac.x / 330.0, ac.y / 150.0, p.y / 90.0 + 0.37));
  float base = n.r * 0.65 + n.g * 0.35;
  float cov = clamp(uDeck.w, 0.0, 1.0);
  float d = max(0.0, base - (1.0 - cov) * 0.62 - 0.2) * prof * lee;
  if (d > 0.0 && lod < 1.5) {                                      // eroded at the edges by finer billows
    vec4 m = texture(uNoise, vec3(ac.x / 46.0, ac.y / 38.0, p.y / 22.0) + vec3(0.0, 0.0, uTime * 0.01));
    d = max(0.0, d - (1.0 - m.g) * 0.16 * (1.0 - d));
  }
  return d * 3.2;
}
// how much of the sun reaches a point through the deck above it
float cloudShade(vec3 p) {
  if (uDeck.w <= 0.0) return 1.0;
  float od = 0.0;
  for (int i = 1; i <= 5; i++) { vec3 q = p + uSun * (float(i) * uDeck.y * 0.7); od += cloudDensity(q, 2.0); }
  return exp(-od * uDeck.y * 0.7 * 0.06);
}

// ── the sky
vec3 skyCol(vec3 rd) {
  float up = clamp(rd.y, -0.2, 1.0);
  vec3 c = mix(uSkyHor, uSkyZen, pow(max(up, 0.0), 0.55));
  float mu = dot(rd, uSun);
  c += uGlow * (0.22 * pow(max(mu, 0.0), 6.0) + 0.9 * pow(max(mu, 0.0), 120.0)) * (1.0 - 0.8 * uOvercast);
  c = mix(c, vec3(0.70, 0.71, 0.72) * (1.0 - 0.9 * uNight), uOvercast * 0.85);
  if (uNight > 0.5 && rd.y > 0.03) {                              // the stars: fine, sparse, faint low down
    vec3 sp = rd * 700.0, cell = floor(sp);
    float s = hash12(cell.xy + cell.z * 17.31), d = length(fract(sp) - 0.5);
    c += vec3(0.7, 0.75, 0.9) * step(0.9965, s) * sstep(0.35, 0.1, d) * 1.6 * sstep(0.03, 0.3, rd.y);
  }
  return c;
}
vec3 sunDisk(vec3 rd) {
  float mu = dot(rd, uSun);
  float r = uNight > 0.5 ? 0.99996 : 0.99993;
  return uSunCol * sstep(r - 0.00003, r, mu) * (uNight > 0.5 ? 6.0 : 40.0) * (1.0 - uOvercast);
}

// ── the land's surface
struct Surf { vec3 n; float ao; float rock; float snow; float alb; float water; float trk; float face; };
// the survey's slope, averaged over the cells around a point: bilinear height has one slope per
// cell, and close to the eye every cell shaded as a flat plate
vec2 slopeAt(vec2 p) { return vec2(bilH(p + vec2(1, 0)).x - bilH(p - vec2(1, 0)).x, bilH(p + vec2(0, 1)).x - bilH(p - vec2(0, 1)).x) * 0.5; }
vec2 slopeSmooth(vec2 p) { return 0.25 * (slopeAt(p + vec2(0.5, 0.5)) + slopeAt(p + vec2(-0.5, 0.5)) + slopeAt(p + vec2(0.5, -0.5)) + slopeAt(p + vec2(-0.5, -0.5))); }

Surf surface(vec3 p, float t) {
  Surf s;
  vec2 q = mirr2(p.xz) / uN;
  vec4 nn = texture(uNrm, q);
  s.n = normalize(nn.xyz * 2.0 - 1.0); s.ao = nn.a;
  if (t < 140.0) {                                                  // near: the smoothed slope, not the cell's
    vec2 gs = slopeSmooth(p.xz);
    vec3 ns = normalize(vec3(-gs.x, 1.0, -gs.y));
    float keep = sstep(1.0, 2.2, length(gs)) * 0.5;                  // on steep ground 028's broader normal still has a say
    s.n = normalize(mix(mix(ns, s.n, keep), s.n, sstep(80.0, 140.0, t)));
  }
  vec4 m = texture(uMat, q);
  s.rock = m.r; s.snow = m.g; s.alb = m.b; s.water = m.a > 0.95 ? 1.0 : 0.0; s.trk = m.a > 0.95 ? 0.0 : m.a;
  // at the feet: the fine ground's own normal and rock
  vec2 g; float w = (t < 80.0) ? nearWeight(p.xz, g) : 0.0;
  if (w > 0.0) {
    float e = 0.5;
    float hx = bilNear(g + vec2(e, 0)) - bilNear(g - vec2(e, 0)), hz = bilNear(g + vec2(0, e)) - bilNear(g - vec2(0, e));
    vec3 fn = normalize(vec3(-hx, 2.0 * e * uNear.z, -hz));
    s.n = normalize(mix(s.n, fn, w));
    float rk = texelFetch(uNearR, clamp(ivec2(g), ivec2(0), ivec2(int(uNear.w) - 1)), 0).r;
    s.rock = mix(s.rock, rk, w);
  }
  // a wall (over ~50°, judged on the survey's own slope, as 028 does) carries no snow and none of
  // the ground's texture: bare rock. Seen from the side a heightfield wall is a cell or two wide,
  // so its normal and materials would stretch down it as streaks; the wall is textured instead
  // from the side (below) and its normal comes from the true slope.
  vec2 gH = t < 140.0 ? slopeSmooth(p.xz) : slopeAt(p.xz);
  s.face = sstep(2.0, 3.4, length(gH));
  if (s.face > 0.0) {
    s.n = normalize(mix(s.n, normalize(vec3(-gH.x, 1.0, -gH.y)), s.face));
    s.snow *= 1.0 - s.face; s.rock = mix(s.rock, 1.0, s.face); s.alb = mix(s.alb, min(s.alb, 0.42), s.face);
  }
  // relief finer than the survey: grain on rock, fading with distance (in 3D, so it holds on a
  // wall as on the ground)
  float fade = sstep(420.0, 20.0, t) * (0.3 + 0.7 * s.rock);
  if (fade > 0.0) {
    vec3 a = texture(uNoise, p * (1.0 / 23.0)).rgb - 0.5, b = texture(uNoise, p * (1.0 / 9.0) + 0.17).rgb - 0.5, c = texture(uNoise, p * (1.0 / 2.3) + 0.31).rgb - 0.5;
    vec3 g = a * 0.7 + b * (0.55 + 0.35 * s.face) + c * 0.35 * sstep(90.0, 10.0, t);
    s.n = normalize(s.n + (g - s.n * dot(g, s.n)) * fade);
  }
  return s;
}

vec3 shade(vec3 p, vec3 rd, float t, out float alpha) {
  Surf s = surface(p, t);
  alpha = 1.0;
  float alb = mix(s.alb, 0.92, uRime);
  // colour: a warm grey stone, stained a little from place to place; snow a cool white
  vec3 st = texture(uNoise, vec3(p.xz / 160.0, 0.5)).rgb;
  vec3 rockC = vec3(1.06, 1.0, 0.9) * mix(0.9, 1.1, st.r) + vec3(0.05, 0.0, -0.05) * (st.g - 0.5);
  vec3 snowC = vec3(0.86, 0.88, 0.91);                            // snow reflects about 0.88
  // snow lies where 028 lays it, but slides off steep ground: rock shows through from ~40°
  float snowW = clamp(max(s.snow * sstep(0.62, 0.82, s.n.y), uRime), 0.0, 1.0);
  vec3 albedo = alb * mix(rockC, snowC, snowW);
  if (s.face > 0.0) {                                               // the wall's own texture, seen from the side
    vec3 an = abs(s.n);
    float wx = an.x / (an.x + an.z + 1e-4);
    vec2 uv = mix(vec2(p.x, p.y), vec2(p.z, p.y), wx);
    float tx = texture(uNoise, vec3(uv / vec2(11.0, 4.0), 0.21)).r, tf = texture(uNoise, vec3(uv / vec2(2.6, 1.3), 0.63)).b;
    float strata = sstep(0.35, 0.55, fract(p.y / 6.5 + tx * 0.8));  // bedding: ledges and recesses
    vec3 wall = vec3(0.30, 0.29, 0.27) * (0.65 + 0.6 * tx) * mix(0.72, 1.08, strata) * (0.85 + 0.3 * tf);
    albedo = mix(albedo, wall * mix(1.0, 1.25, step(0.6, s.alb)), s.face);
  }
  // the way: trodden dark in snow, worn pale on rock
  albedo *= 1.0 + (snowW > 0.5 ? -0.3 : 0.4) * s.trk * s.trk;
  vec3 n = s.n;
  float sh = sunShadow(p, n) * cloudShade(p);
  float lam = max(0.0, dot(n, uSun));
  float wrap = max(0.0, (dot(n, uSun) + 0.35) / 1.35) * snowW * 0.18;   // light carried inside the snow
  vec3 skyAmb = mix(uSkyHor, uSkyZen, 0.5 + 0.5 * n.y) * (0.55 + 0.45 * n.y);
  skyAmb = mix(vec3(dot(skyAmb, vec3(0.3, 0.5, 0.2))), skyAmb, 0.6);   // the sky's light on the land, less blue than the sky looks
  vec3 bounce = vec3(0.6, 0.58, 0.55) * alb * max(0.0, -n.y + 0.3) * 0.35;
  vec3 col = albedo * (uSunCol * uDirect * (lam * sh + wrap * (0.4 + 0.6 * sh)) + (skyAmb * uAmbient * 1.5 + bounce) * s.ao);
  if (s.water > 0.5) {                                             // still water holds the sky
    vec3 r = reflect(rd, vec3(0.0, 1.0, 0.0));
    float fr = 0.03 + 0.97 * pow(1.0 - max(0.0, -rd.y), 5.0);
    col = mix(vec3(0.02, 0.03, 0.035) * uAmbient, skyCol(r) + sunDisk(r) * sh, fr);
  }
  return col;
}

// ── the air: haze thickening with distance and low down; the deck marched as a volume
float airTr(vec3 ro, vec3 rd, float d, out vec3 inC) {
  float yMid = ro.y + rd.y * d * 0.5;
  float dens = uHaze * 0.0007 * exp(-max(0.0, yMid - uDeck.z) / 380.0);
  if (uWind.w > 0.0) dens += 1.0 / uWind.w;                       // a whiteout: inside the cloud
  inC = skyCol(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z)));
  if (uWind.w > 0.0) inC = vec3(0.80, 0.81, 0.82) * (0.45 + uAmbient);   // inside the cloud: white-grey, from every side
  return exp(-dens * d);
}
vec3 airIn(vec3 col, vec3 ro, vec3 rd, float d) { vec3 inC; float tr = airTr(ro, rd, d, inC); return col * tr + inC * (1.0 - tr); }

vec4 marchCloud(vec3 ro, vec3 rd, float tEnd, float jitter) {
  if (uDeck.w <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float lo = uDeck.x - 2.6 * uDeck.y - 0.3 * 220.0, hi = uDeck.x + 2.6 * uDeck.y + 0.3 * 220.0;
  float t0 = 0.0, t1 = min(tEnd, 2600.0);
  if (abs(rd.y) > 1e-4) {
    float ta = (lo - ro.y) / rd.y, tb = (hi - ro.y) / rd.y;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  } else if (ro.y < lo || ro.y > hi) return vec4(0.0, 0.0, 0.0, 1.0);
  if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);
  int steps = uQuality > 1.5 ? 72 : uQuality > 0.5 ? 48 : 28;
  float dt = (t1 - t0) / float(steps), t = t0 + dt * jitter;
  float mu = dot(rd, uSun);
  float g1 = 0.6, g2 = -0.25;
  float ph = mix((1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5), (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * mu, 1.5), 0.3) / 12.566;
  vec3 acc = vec3(0.0); float T = 1.0;
  for (int i = 0; i < 72; i++) {
    if (i >= steps || T < 0.02) break;
    vec3 p = ro + rd * t;
    float d = cloudDensity(p, t > 900.0 ? 2.0 : 0.0);
    if (d > 0.001) {
      float od = 0.0;                                               // toward the sun
      for (int k = 1; k <= 4; k++) od += cloudDensity(p + uSun * (float(k * k) * 3.0), 2.0) * float(2 * k - 1) * 3.0;
      float ext = d * 0.06;
      float sunT = exp(-od * 0.06) * (1.0 - exp(-d * 0.6) * 0.5);   // the powder: thin edges darker against the light
      float lee; float alt = deckAlt(p.xz, lee);
      float hFrac = clamp((p.y - alt) / uDeck.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 amb = mix(uSkyHor * 0.55, uSkyZen * 0.9 + uSkyHor * 0.2, hFrac) * uAmbient * 2.2;
      vec3 S = (uSunCol * uDirect * sunT * ph * 7.0 * (1.0 - 0.85 * uOvercast) + amb);
      float a = exp(-ext * dt);
      vec3 Sint = S * (1.0 - a);                                    // energy-conserving step
      // the air in front of this bit of cloud: it dims the cloud's light and adds its own
      vec3 inC; float tr = airTr(ro, rd, t, inC);
      acc += T * (Sint * tr + inC * (1.0 - tr) * (1.0 - a)); T *= a;
    }
    t += dt;
  }
  return vec4(acc, T);
}

// ── the cairns: stones stacked by the way (three, each smaller), hit by the ray directly
float cairnHit(vec3 ro, vec3 rd, out vec3 nOut) {
  float best = 1e9; nOut = vec3(0.0, 1.0, 0.0);
  for (int k = 0; k < 12; k++) {
    if (k >= uNCairns) break;
    vec4 c = uCairns[k];
    for (int j = 0; j < 3; j++) {
      float r = c.w * (0.55 - 0.13 * float(j)), y = c.y + c.w * (0.35 + 0.62 * float(j)) * 0.9;
      vec3 oc = ro - vec3(c.x, y, c.z);
      float b = dot(oc, rd), cc = dot(oc, oc) - r * r, h = b * b - cc;
      if (h < 0.0) continue;
      float t = -b - sqrt(h);
      if (t > 0.1 && t < best) { best = t; nOut = normalize(oc + rd * t); }
    }
  }
  return best;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec3 rd = eyeRay(gl_FragCoord.xy + uJit);
  vec3 ro = uEye;
  float jitter = hash12(gl_FragCoord.xy + uSeed * 17.0);
  float tmax = uWind.w > 0.0 ? min(2600.0, uWind.w * 6.0) : 2600.0;
  float t = marchLand(ro, rd, tmax);
  vec3 cn; float tc = cairnHit(ro, rd, cn);
  vec3 col; float tEnd;
  if (tc < 1e8 && (t < 0.0 || tc < t)) {
    vec3 p = ro + rd * tc;
    float lam = max(0.0, dot(cn, uSun)) * sunShadow(p, cn);
    vec3 skyAmb = mix(uSkyHor, uSkyZen, 0.5 + 0.5 * cn.y);
    col = vec3(0.16, 0.155, 0.15) * (uSunCol * uDirect * lam + skyAmb * uAmbient * 2.0 * (0.6 + 0.4 * cn.y));
    col = airIn(col, ro, rd, tc); tEnd = tc;
  } else if (t > 0.0) {
    vec3 p = ro + rd * t; float a;
    col = shade(p, rd, t, a);
    col = airIn(col, ro, rd, t); tEnd = t;
  } else {
    col = skyCol(rd) + sunDisk(rd);
    if (uWind.w > 0.0) col = airIn(col, ro, rd, 2600.0);
    tEnd = 2600.0;
  }
  vec4 cl = marchCloud(ro, rd, tEnd, jitter);
  col = col * cl.a + cl.rgb;
  col *= exp2(uExposure);
  col = aces(col * 0.9);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy * 1.7 + uSeed) - 0.5) / 255.0;    // dither: no bands in the sky
  outColor = vec4(col, 1.0);
}
`;

if (typeof module !== 'undefined' && module.exports) module.exports = { VERT, FRAG };
