// Folded Weather — five studies built on one engine: the fold-and-inversion density march from
// Yohei Nishitsuji's twigl cloud shader (see 057 After Nishitsuji). Everything here past the
// engine is new: the decomposition, the seeded parameter space, the gradings and the loops.
//
// The decomposition. The original accumulates, over N = 98 steps,
//     o += .01 - hsv(h, sat_i, v_i)          with hsv(h,s,v) = v * mix(1, H, s), H = hue(h)
// which is linear in v and v*sat, so
//     o = N*.01 - W + S*(1 - H)              W = Σ v_i,  S = Σ v_i*sat_i
// Two scalar fields reproduce the original exactly (h = .1 gives 1 - H = (0, .4, 1), the sky).
// A third, g (the final march depth), is a height map. Each study grades W, S and g differently.
//
// Studies
//   hours   a 96 s day: sunrise, noon, dusk, night with stars in the gaps (exact loop)
//   drift   the fold constants travel a seeded closed path; the weather re-forms (60 s loop)
//   sumi    ink on paper: density as ink load, sky as a dilute wash, paper grain
//   strata  the depth field read as a topographic survey: contours with index lines
//   slit    slit-scan: each column a different moment of the drift loop
//   aurora  a moonlit deck under aurora curtains
//   intaglio  engraved line work whose width carries tone, cross-hatch in deep shade
//   cyanotype Prussian-blue exposure on brushed emulsion
//   satellite simulated infrared enhancement with graticule
//   tessera   hex mosaic, one march per tile
//   atlas   nine seeds side by side; choose one to open it in drift
//
// URL: ?study=<key above> &seed=N &t=seconds (freezes) &q=lo|md|hi

(function () {
  'use strict';

  // ---------------------------------------------------------------- shader
  const VS = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `#version 300 es
precision highp float;
uniform vec2 r, uOrigin;
uniform float uTC, uPhase, uHue, uScale, uZoom, uGrain;
uniform vec4 uCam;                 // base, freq, amp, axis  (camera sway, as in the original)
uniform vec3 uOff, uBox, uAniso;   // fold offset, fold box, inversion anisotropy
uniform int uMode;                 // 0 original, 1 hours, 2 sumi, 3 strata, 4 intaglio, 5 cyanotype, 6 satellite, 7 tessera, 8 aurora, 9 raw
uniform float uTime;               // free-running seconds (aurora)
uniform float uSlit, uU;           // slit-scan: loop span across the width, base loop phase
uniform float uPK[5], uPP[5];      // drift path: integer frequencies and phases
uniform float uCell;               // tessera: cell size in pixels (0 = off)
out vec4 o;
const float TAU = 6.2831853;
const float DA[5] = float[5](.05, .07, .05, .05, .25);   // drift amplitudes (match DRIFT_AMP)

vec3 hue3(float h){ return clamp(abs(fract(h + vec3(1., 2./3., 1./3.)) * 6. - 3.) - 1., 0., 1.); }
mat3 rotate3D(float an, vec3 ax){
  vec3 a = normalize(ax); float s = sin(an), c = cos(an), k = 1. - c;
  return mat3(a.x*a.x*k + c, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s,
              a.x*a.y*k - a.z*s, a.y*a.y*k + c, a.z*a.y*k + a.x*s,
              a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, a.z*a.z*k + c);
}
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
}
// hex tiling: xy = offset from the cell centre (cell units), zw = cell id
vec4 hexCell(vec2 p){
  const vec2 k = vec2(1., 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(.5, 1.)) / k.xyxy) + .5;
  vec4 h = vec4(p - c.xy*k, p - (c.zw + .5)*k);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + .5);
}

// The engine: returns W, S, g.
vec3 fields(vec2 FC, vec3 OFF, vec3 BOX, float TC){
  float g = 0., e = 0., s = 0., W = 0., S = 0.;
  mat3 R = rotate3D(-uCam.x - cos(TC*uCam.y)*uCam.z, vec3(1., 11. + sin(TC)*uCam.w, -1.5));
  for (float i = 1.; i < 99.; i++) {
    vec3 p = vec3((FC - .5*r) / r.y * uZoom + vec2(0., 9.), g) * R;
    s = 2.;
    for (int j = 0; j < 19; j++) {
      e = uScale / dot(p, p*uAniso);
      s *= e;
      p = OFF - abs(abs(p)*e - BOX);
    }
    g += p.y / s;
    s = log2(s) / exp(e);
    float v = s / 2e2;
    W += v; S += v * (g*.016 - e*.3);
  }
  return vec3(W, S, g);
}

void main(){
  vec2 FC = gl_FragCoord.xy - uOrigin;
  vec2 FE = FC;                                   // where the march is evaluated
  vec4 hx = vec4(0.);
  if (uCell > 0.) { hx = hexCell(FC / uCell); FE = (FC / uCell - hx.xy) * uCell; }
  vec3 OFF = uOff, BOX = uBox; float TC = uTC;
  if (uSlit > 0.) {
    // slit-scan: each column sits at a different phase of the drift loop
    float u = uU + FE.x / r.x * uSlit;
    float v[5];
    for (int i = 0; i < 5; i++) v[i] = sin(TAU * uPK[i] * u + uPP[i]) * DA[i];
    float Y = max(3.7, uOff.y + v[4]);
    OFF = vec3(uOff.x + v[0], Y, uOff.z + v[1]);
    BOX = vec3(uBox.x + v[2], Y, uBox.z + v[3]);
    TC = 10. * 3.14159265 * uU;                   // camera held for the whole frame
  }
  vec3 f = fields(FE, OFF, BOX, TC);
  float W = f.x, S = f.y, g = f.z;
  vec2 uv = (FC - .5*r) / r.y;
  vec3 col;
  if (uMode == 9) { o = vec4(W, S, g, 1.); return; }   // raw fields, for screening seeds

  if (uMode == 0) {
    col = vec3(.98) - W + S * (1. - hue3(uHue));

  } else if (uMode == 1) {
    // hours: phase 0 = midnight, .25 sunrise, .5 noon, .75 sunset
    float el = -cos(6.2831853 * uPhase);                 // sun elevation, -1..1
    float day = smoothstep(-.18, .22, el);
    float low = (1. - smoothstep(.05, .55, el)) * day;   // golden hour weight
    float side = sin(6.2831853 * uPhase) < 0. ? -1. : 1.;
    side = -side;                                         // rises left, sets right
    vec3 sunC  = mix(vec3(1., .52, .26), vec3(1., .985, .95), smoothstep(.0, .5, el));
    vec3 moonC = vec3(.22, .27, .42);
    vec3 light = mix(moonC, sunC, day);
    vec3 skyC  = mix(vec3(.01, .03, .1), mix(vec3(.38, .28, .62), vec3(0., .4, 1.), smoothstep(.05, .45, el)), day);
    float lit  = 1. + low * .55 * side * uv.x;             // light falls across from the sun's side
    col = light * (.98 - W) * lit + S * skyC / .9;
    float far = smoothstep(42., 68., g);                   // haze toward the horizon
    vec3 haze = mix(vec3(.05, .07, .16), mix(vec3(1., .6, .42), vec3(.75, .85, 1.), smoothstep(.1, .6, el)), day);
    col = mix(col, haze, far * mix(.55, .25, day) * (.4 + .6*low + (1.-day)*.6));
    // stars where the deck opens (high sky weight, low density)
    float gap = smoothstep(.12, .3, S) * (1. - smoothstep(.35, .7, W));
    vec2 cell = floor(FC);
    float st = step(.9975, hash(cell)) * (.4 + .6 * hash(cell + 7.)) * (1. - day) * gap;
    col += st * 1.2 * vec3(.85, .9, 1.);

  } else if (uMode == 2) {
    // sumi: density is ink load; sky is a dilute blue-grey wash; grain from the paper
    vec3 paper = vec3(.945, .918, .862);
    vec3 ink   = vec3(.075, .07, .085);
    float load = smoothstep(.06, .8, W);
    float wash = clamp(S * 1.6, 0., 1.);
    float grain = hash(floor(FC * uGrain)) - .5;
    col = mix(paper, ink, load);
    col = mix(col, col * vec3(.78, .84, .9), wash * .55);
    col += grain * .035 * (1. - load * .6);
    // pooled edge: ink gathers where the load changes fast
    float edge = clamp(length(vec2(dFdx(load), dFdy(load))) * 9., 0., 1.);
    col = mix(col, ink, edge * .35);

  } else if (uMode == 4) {
    // intaglio: engraved lines that follow the depth field; line width carries the tone,
    // a second cross-hatch comes in for the darkest passages
    vec3 paper = vec3(.952, .936, .89), ink = vec3(.085, .14, .13);
    float D  = clamp(smoothstep(.04, .85, W) + S * .25, 0., 1.);
    float L  = min(130., r.y / 3.2);                    // lines per height, never finer than ~3 px
    float p1 = uv.y * L + g * .45 + W * 2.;
    float a1 = abs(fract(p1) - .5) * 2., w1 = fwidth(p1) * 2.;
    float i1 = 1. - smoothstep(D - w1, D + w1, a1);
    float D2 = clamp((D - .55) * 2.2, 0., 1.);
    float p2 = (uv.x * .55 + uv.y) * L * .88 + g * .3;
    float a2 = abs(fract(p2) - .5) * 2., w2 = fwidth(p2) * 2.;
    float i2 = 1. - smoothstep(D2 - w2, D2 + w2, a2);
    col = mix(paper, ink, max(i1, i2 * step(.001, D2)));
    col *= .975 + .025 * vnoise(FC * .015);            // plate tone left by the wipe

  } else if (uMode == 5) {
    // cyanotype: shadow and open sky expose to Prussian blue; lit cloud stays paper.
    // Emulsion brushed on by hand: streaky density, ragged edges, bare paper margin.
    vec3 paper = vec3(.945, .93, .885), prus = vec3(.035, .17, .39);
    float ex = clamp(smoothstep(.03, .7, W) * .92 + S * .45, 0., 1.);
    float streak = .8 + .2 * vnoise(uv * vec2(4., 46.));
    vec2 hs = vec2(.5 * r.x / r.y - .07, .43);
    float d = max(abs(uv.x) - hs.x, abs(uv.y) - hs.y);
    d += (vnoise(uv * vec2(3., 26.)) - .5) * .06 + (vnoise(uv * vec2(34., 3.)) - .5) * .025;
    float m = 1. - smoothstep(-.004, .004, d);
    vec3 blue = mix(paper, prus * streak, ex);
    col = mix(paper, blue, m);
    col = mix(col, vec3(.86, .89, .86), (1. - m) * smoothstep(.03, .0, d) * .5);   // faint stain past the edge
    col += (hash(floor(FC * uGrain)) - .5) * .03;

  } else if (uMode == 6) {
    // satellite: cloud-top coldness through an infrared enhancement table, with graticule and scan banding
    float c = clamp((.95 - W) * 1.15 - S * .2, 0., 1.);
    vec3 lut = mix(vec3(.06), vec3(.66), smoothstep(0., .45, c));
    lut = mix(lut, vec3(.12, .58, .62), smoothstep(.43, .5, c));
    lut = mix(lut, vec3(.1, .24, .82), smoothstep(.52, .58, c));
    lut = mix(lut, vec3(.16, .74, .26), smoothstep(.61, .67, c));
    lut = mix(lut, vec3(.96, .88, .2), smoothstep(.7, .75, c));
    lut = mix(lut, vec3(.88, .18, .1), smoothstep(.78, .83, c));
    lut = mix(lut, vec3(.04), smoothstep(.87, .9, c));
    lut = mix(lut, vec3(.97), smoothstep(.93, .96, c));
    col = lut;
    vec2 gq = vec2(uv.x * (1. + .12 * uv.y), uv.y + .05 * uv.x * uv.x);   // a little projection curvature
    vec2 gl = abs(fract(gq * 4. + .5) - .5) / fwidth(gq * 4.);
    float grid = 1. - clamp(min(gl.x, gl.y) - .3, 0., 1.);
    col = mix(col, vec3(.95, .95, .8), grid * .45);
    col *= .95 + .05 * hash(vec2(floor(FC.y / 2.), 3.));
    col += (hash(FC + uTC) - .5) * .04;

  } else if (uMode == 7) {
    // tessera: one march per tile, sampled at its centre; glass varies tile to tile; lead between
    col = vec3(.98) - W + S * (1. - hue3(uHue));
    col = pow(clamp(col, 0., 1.), vec3(1.25)) * (.88 + .24 * hash(hx.zw));
    float hd = max(dot(abs(hx.xy), vec2(.5, .8660254)), abs(hx.x));   // .5 at the edge
    float bevel = dot(normalize(hx.xy + 1e-4), vec2(-.55, .83)) * smoothstep(.3, .5, hd);
    col *= 1. + .09 * bevel;
    float lw = fwidth(hd) * 1.5;
    col = mix(col, vec3(.07, .065, .07), smoothstep(.455 - lw, .455 + lw, hd));

  } else if (uMode == 8) {
    // aurora: a night deck under moving curtains; the curtains light the cloud tops
    vec3 moon = vec3(.2, .24, .37), night = vec3(.01, .025, .08);
    col = moon * (.98 - W) + S * night / .9;
    float x = uv.x, T = uTime;
    float band = .27 + .06 * sin(x * 2.1 + T * .13) + .03 * sin(x * 5.3 - T * .21);
    float rays = .25 + .75 * pow(vnoise(vec2(x * 38. + sin(T * .17 + x * 3.) * 2., T * .15)), 2.);
    float dy = uv.y - band;
    float curtain = smoothstep(-.015, .02, dy) * exp(-max(dy, 0.) * 5.5) * rays;
    vec3 aur = mix(vec3(.12, 1., .5), vec3(.7, .22, .95), smoothstep(.03, .26, dy));
    float sky = smoothstep(40., 62., g);
    col += aur * curtain * sky * 1.1;
    float glow = .55 + .45 * sin(x * 2.1 + T * .13);
    col += vec3(.08, .55, .3) * (.98 - W) * .4 * glow * (1. - smoothstep(-.3, .45, -uv.y + band - .2) * .6);
    float gap = smoothstep(.12, .3, S) * (1. - smoothstep(.35, .7, W)) * (1. - curtain);
    float st = step(.9975, hash(floor(FC))) * (.4 + .6 * hash(floor(FC) + 7.)) * gap;
    col += st * vec3(.85, .9, 1.);

  } else {
    // strata: contours of march depth, index line every fifth, hypsometric tint from density
    float k = g / 1.15 + W * 5.;
    float w = fwidth(k);
    float d = abs(fract(k + .5) - .5) / max(w, 1e-4);
    float line = 1. - clamp(d - .25, 0., 1.);
    float idx  = 1. - clamp(abs(fract(k / 5. + .5) - .5) * 5. / max(w, 1e-4) - .6, 0., 1.);
    vec3 ground = mix(vec3(.93, .92, .88), vec3(.80, .86, .90), clamp(S * 2.2, 0., 1.));
    ground = mix(ground, ground * .86, clamp(W, 0., 1.));
    vec3 inkC = vec3(.12, .2, .42);
    col = mix(ground, inkC, line * .55);
    col = mix(col, vec3(.55, .2, .1), idx * .85);
    if (w > .9) col = mix(col, ground * .92, .7);         // steep: lines merge into hatch
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

  // ---------------------------------------------------------------- params
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ORIGINAL = { off: [0.08, 4, -1], box: [3, 4, 3], aniso: [0.51, 0.51, 0.51], scale: 7.1, hue: 0.1 };
  const HUES = [0.1, 0.1, 0.1, 0.1, 0.16, 0.62, 0.95];   // mostly sky blue; ultramarine, gold, teal skies
  const TAU = Math.PI * 2;

  // Seed 0 is the original. Others perturb every constant within the band that keeps a cloud deck.
  function seedParams(seed) {
    if (seed === 0) return Object.assign({ path: null }, ORIGINAL);
    const R = mulberry32(seed * 7919 + 13);
    const j = (c, a) => c + (R() * 2 - 1) * a;
    // The y components of offset and box must stay equal: apart by 0.05 the field collapses
    // (measured; see README). Tied, they hold from 3.7 to 5.
    const Y = 3.7 + R() * 1.1;
    const P = {
      off: [j(0.08, 0.25), Y, j(-1, 0.35)],
      box: [j(3, 0.3), Y, j(3, 0.3)],
      aniso: [j(0.51, 0.03), 0.51, j(0.51, 0.03)],
      scale: j(7.1, 0.3),
      hue: HUES[Math.floor(R() * HUES.length)],
    };
    // closed path for drift: integer frequencies, seeded phases
    P.path = [0, 1, 2, 3, 4].map(() => ({ k: 1 + Math.floor(R() * 2), ph: R() * TAU }));
    return P;
  }
  // Drift: the six fold constants (offset, box) circle their seeded values. u in [0,1) loops exactly.
  // Moves off.x, off.z, box.x, box.z and the tied y pair.
  const DRIFT_AMP = [0.05, 0.07, 0.05, 0.05, 0.25];
  function driftParams(P, u) {
    const base = P.path ? P : Object.assign({}, P, { path: [0, 1, 2, 3, 4].map((i) => ({ k: 1 + (i % 2), ph: i * 1.7 })) });
    const v = base.path.map((q, i) => Math.sin(TAU * q.k * u + q.ph) * DRIFT_AMP[i]);
    const Y = Math.max(3.7, base.off[1] + v[4]);
    return Object.assign({}, base, {
      off: [base.off[0] + v[0], Y, base.off[2] + v[1]],
      box: [base.box[0] + v[2], Y, base.box[2] + v[3]],
    });
  }

  // Screened seeds (tools/folded-weather-screen.mjs): raw seeds whose still and whole drift loop keep a
  // healthy deck. The visible seed number n maps to KEPT[n-1]; seed 0 is the original.
  const KEPT = [/*KEPT*/8, 12, 17, 21, 30, 32, 75, 78, 89, 95, 109, 110, 111, 120, 136, 139, 166, 172, 173, 201, 202, 222, 235, 242, 245, 282, 310, 334, 344, 358, 365, 371, 379, 388, 389, 396, 399, 408, 417, 442, 472, 483, 495, 501, 543, 544, 545, 548];
  const rawSeed = (n) => (n === 0 || !KEPT.length ? n : KEPT[(n - 1) % KEPT.length]);

  // Order sets the number keys 1–9 (atlas has no key; use the panel).
  const STUDIES = {
    hours:     { family: 'light', mode: 1, period: 96, note: 'A day over the deck in 96 s. Sun rises left and sets right; at night stars show through the gaps.' },
    drift:     { family: 'light', mode: 0, period: 60, note: 'The fold constants travel a closed path, so the weather re-forms. Loops exactly every 60 s.' },
    slit:      { family: 'light', mode: 0, period: 60, note: 'Slit-scan: each column is a different moment of the drift loop, so left to right reads as 27 s of weather.' },
    aurora:    { family: 'light', mode: 8, period: 0,  note: 'A moonlit deck under aurora curtains. The curtains hang over the horizon and tint the cloud tops green.' },
    sumi:      { family: 'print', mode: 2, period: 0,  note: 'Density read as ink load, open sky as a dilute wash, with paper grain and pooled edges.' },
    intaglio:  { family: 'print', mode: 4, period: 0,  note: 'Engraving: up to 130 lines per height follow the depth field and swell with tone; cross-hatch in the deepest shade.' },
    cyanotype: { family: 'print', mode: 5, period: 0,  note: 'Shadow and open sky expose to Prussian blue; lit cloud stays paper. Brushed emulsion with ragged edges.' },
    strata:    { family: 'survey', mode: 3, period: 0, note: 'The march depth read as terrain. Contour every 1.15 units, index line every fifth.' },
    satellite: { family: 'survey', mode: 6, period: 0, note: 'Simulated infrared: cloud-top coldness through an enhancement table (grey, teal, blue, green, yellow, red, black, white), with graticule.' },
    tessera:   { family: 'form', mode: 7, period: 0,   note: 'Mosaic: one march per hexagonal tile, read at its centre. Glass varies tile to tile; lead between.' },
    atlas:     { family: 'form', mode: 0, period: 0,   note: 'Nine seeds of the constants. Seed 0 is the original. Choose a tile to open it in Drift.' },
  };
  const SLIT_SPAN = 0.45;
  // twigl camera; drift uses camera time tc = 10πu so sin(tc) and cos(.2 tc) both close the loop
  const CAM = [1.15, 0.2, 0.05, 0.2];

  // ---------------------------------------------------------------- state
  const q = new URLSearchParams(location.search);
  const state = {
    study: STUDIES[q.get('study')] ? q.get('study') : 'hours',
    seed: q.has('seed') ? Math.max(0, parseInt(q.get('seed'), 10) || 0) : 0,
    q: ['lo', 'md', 'hi'].includes(q.get('q')) ? q.get('q') : (innerWidth < 640 ? 'lo' : 'md'),
    paused: q.has('t'),
    t: q.has('t') ? +q.get('t') : 0,
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && !q.has('t')) { state.paused = true; state.t = 40; }
  const QUAL = { lo: 0.45, md: 0.75, hi: 1.25 };

  // ---------------------------------------------------------------- GL
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  const fail = (m) => { const el = $('err'); if (el) { el.textContent = m; el.hidden = false; } };
  if (!gl) { fail('This browser has no WebGL2, so the studies cannot run here.'); return; }
  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { fail('Shader failed to compile: ' + e.message); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['r', 'uOrigin', 'uTC', 'uPhase', 'uHue', 'uScale', 'uZoom', 'uGrain', 'uCam', 'uOff', 'uBox', 'uAniso', 'uMode',
    'uTime', 'uSlit', 'uU', 'uPK', 'uPP', 'uCell']
    .forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

  function setParams(P, mode, tc, phase, w, h, ox, oy, zoom) {
    gl.uniform2f(U.r, w, h); gl.uniform2f(U.uOrigin, ox, oy);
    gl.uniform1f(U.uTC, tc); gl.uniform1f(U.uPhase, phase);
    gl.uniform1f(U.uHue, P.hue); gl.uniform1f(U.uScale, P.scale); gl.uniform1f(U.uZoom, zoom);
    gl.uniform1f(U.uGrain, Math.max(0.35, Math.min(1, 1 / (QUAL[state.q] * (devicePixelRatio || 1)))));
    gl.uniform4f(U.uCam, CAM[0], CAM[1], CAM[2], CAM[3]);
    gl.uniform3fv(U.uOff, P.off); gl.uniform3fv(U.uBox, P.box); gl.uniform3fv(U.uAniso, P.aniso);
    gl.uniform1i(U.uMode, mode);
    gl.uniform1f(U.uTime, state.t); gl.uniform1f(U.uSlit, 0); gl.uniform1f(U.uCell, 0);
  }
  function setPath(P, u) {
    const path = P.path || [0, 1, 2, 3, 4].map((i) => ({ k: 1 + (i % 2), ph: i * 1.7 }));
    gl.uniform1fv(U.uPK, path.map((x) => x.k)); gl.uniform1fv(U.uPP, path.map((x) => x.ph));
    gl.uniform1f(U.uU, u); gl.uniform1f(U.uSlit, SLIT_SPAN);
  }

  let tiles = [];
  function draw() {
    const k = Math.max(0.3, Math.min(1.5, QUAL[state.q] * Math.min(devicePixelRatio || 1, 2) / 1.5));
    const W = Math.max(1, Math.round(canvas.clientWidth * k)), H = Math.max(1, Math.round(canvas.clientHeight * k));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const S = STUDIES[state.study];
    const t = state.t;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, W, H); gl.clearColor(0.04, 0.06, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT);

    if (state.study === 'atlas') {
      const cols = W >= H ? 3 : 2, rows = W >= H ? 3 : 5, n = Math.min(9, cols * rows);
      const gap = Math.round(4 * k), tw = Math.floor((W - gap * (cols + 1)) / cols), th = Math.floor((H - gap * (rows + 1)) / rows);
      tiles = [];
      gl.enable(gl.SCISSOR_TEST);
      for (let i = 0; i < n; i++) {
        const cx = i % cols, cy = Math.floor(i / cols);
        const x = gap + cx * (tw + gap), y = H - (gap + (cy + 1) * th + cy * gap);
        const seed = state.seed + i;
        gl.viewport(x, y, tw, th); gl.scissor(x, y, tw, th);
        setParams(seedParams(rawSeed(seed)), 0, 3, 0, tw, th, x, y, 5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        tiles.push({ seed, x: x / W, y: 1 - (y + th) / H, w: tw / W, h: th / H });
      }
      gl.disable(gl.SCISSOR_TEST);
    } else {
      let P = seedParams(rawSeed(state.seed)), tc = t, phase = 0;
      if (state.study === 'drift') { const u = (t / S.period) % 1; P = driftParams(P, u); tc = 10 * Math.PI * u; }
      if (state.study === 'hours') { phase = ((t / S.period) + 0.2) % 1; tc = 10 * Math.PI * ((t / S.period) % 1); }
      if (S.family === 'print' || S.family === 'survey' || state.study === 'tessera') tc = t * 0.6;
      if (state.study === 'aurora') tc = t * 0.3;
      setParams(P, S.mode, tc, phase, W, H, 0, 0, 5);
      if (state.study === 'slit') setPath(P, (t / S.period) % 1);
      if (state.study === 'tessera') gl.uniform1f(U.uCell, Math.max(7, H / 34));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const clock = $('clock');
    if (clock) {
      let s = 'seed ' + state.seed + (state.seed === 0 ? ' (original)' : '');
      if (state.study === 'hours') {
        const ph = ((t / S.period) + 0.2) % 1, hh = Math.floor(ph * 24), mm = Math.floor((ph * 24 - hh) * 60);
        s = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' · ' + s;
      } else if (S.period) s = (t % S.period).toFixed(1) + ' / ' + S.period + ' s · ' + s;
      if (state.study === 'satellite') s = 'IR, enhanced (simulated) · ' + s;
      clock.textContent = s;
    }
  }

  let last = performance.now(), dirty = true;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const still = state.study === 'atlas';
    if (!state.paused && !still) { state.t += dt; dirty = true; }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- UI
  function sync() {
    document.querySelectorAll('[data-study]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.study === state.study));
    document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.q === state.q));
    const p = $('pause'); if (p) { p.setAttribute('aria-pressed', state.paused); p.textContent = state.paused ? 'play' : 'pause'; }
    const n = $('note'); if (n) n.textContent = STUDIES[state.study].note;
    const sd = $('seed'); if (sd) sd.textContent = state.seed;
    dirty = true;
  }
  function setSeed(s) { state.seed = Math.max(0, s); sync(); }
  document.querySelectorAll('[data-study]').forEach((b) => (b.onclick = () => { state.study = b.dataset.study; sync(); }));
  document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { state.q = b.dataset.q; sync(); }));
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on('pause', () => { state.paused = !state.paused; sync(); });
  on('prev', () => setSeed(state.seed - (state.study === 'atlas' ? 9 : 1)));
  on('next', () => setSeed(state.seed + (state.study === 'atlas' ? 9 : 1)));
  on('orig', () => setSeed(0));
  on('hide', () => document.body.classList.add('bare'));
  canvas.addEventListener('click', (e) => {
    if (document.body.classList.contains('bare')) { document.body.classList.remove('bare'); return; }
    if (state.study !== 'atlas') return;
    const rc = canvas.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height;
    const hit = tiles.find((T) => x >= T.x && x <= T.x + T.w && y >= T.y && y <= T.y + T.h);
    if (hit) { state.seed = hit.seed; state.study = 'drift'; state.t = 0; sync(); }
  });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key;
    if (k === ' ') { state.paused = !state.paused; sync(); e.preventDefault(); }
    else if (k === 'h' || k === 'H') document.body.classList.toggle('bare');
    else if (k === 'ArrowRight') setSeed(state.seed + 1);
    else if (k === 'ArrowLeft') setSeed(state.seed - 1);
    else if (k === '0') setSeed(0);
    else if (k >= '1' && k <= '9') { state.study = Object.keys(STUDIES)[+k - 1]; sync(); }
  });
  addEventListener('resize', () => (dirty = true));

  // Screening API (used by the tool, harmless otherwise): mean W, mean S, % unusable pixels.
  window.FoldedWeather = {
    seedParams, driftParams, KEPT,
    probe(raw, u) {
      const N = 40;
      if (!gl.getExtension('EXT_color_buffer_float')) return null;
      const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, N, N);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, N, N);
      let P = seedParams(raw), tc = 3;
      if (u != null) { P = driftParams(P, u); tc = 10 * Math.PI * u; }
      setParams(P, 9, tc, 0, N, N, 0, 0, 5); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const d = new Float32Array(N * N * 4); gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tx); dirty = true;
      let w = 0, s2 = 0, ww = 0, bad = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!isFinite(d[i]) || !isFinite(d[i + 1]) || d[i] < 0 || d[i] > 1.4) { bad++; continue; }
        w += d[i]; ww += d[i] * d[i]; s2 += d[i + 1]; n++;
      }
      n = Math.max(n, 1); const mw = w / n;
      return { W: mw, S: s2 / n, sd: Math.sqrt(Math.max(0, ww / n - mw * mw)), bad: bad / (N * N) };
    },
  };
  sync();
  requestAnimationFrame(frame);
})();
