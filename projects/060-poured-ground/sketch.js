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
  // proportions of colorlisa's works (width / height of the original), when known, with the record they come from
  PALS.forEach(function (p) { const r = (window.PROPORTIONS || {})[p.id]; if (r && r.aspect) { p.aspect = r.aspect; p.aspectSource = r.source || 'Wikidata'; } });
  // where an archive work's size comes from (field `as`); absent means Wikidata
  const ASPECT_SOURCES = { wd: 'Wikidata', met: 'The Met', aic: 'Art Institute of Chicago', cma: 'Cleveland Museum of Art',
    nga: 'National Gallery of Art', rijks: 'Rijksmuseum', tate: 'Tate', smk: 'SMK (National Gallery of Denmark)', va: 'V&A',
    commons: 'the Wikimedia Commons artwork record' };

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
  }
  float hash1(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash1(i),hash1(i+vec2(1,0)),f.x), mix(hash1(i+vec2(0,1)),hash1(i+vec2(1,1)),f.x), f.y); }`;

  const FS = {
    // wind (the living phase): 048 Plotted Field's gusts, as a force in the same velocity field
    // the hand uses. Bands of gust cross along the wind, bent by a slow warp (1.25 rad/s: one
    // gust every 5.03 s); the flow is turned locally by a slow noise so it curls rather than
    // sheets, and it dies near the edges, so paint turns along the walls and never leaves.
    // Its speed straddles mofu's movement threshold: paint moves in the gusts, rests in lulls.
    wind: HEAD + `
    uniform sampler2D uVel; uniform vec2 uWdir; uniform float uTsec, uAmp, uAmt;
    void main(){
      vec2 v = texture(uVel, vUv).xy;
      vec2 p = (vUv - 0.5) * uAspect;
      float along = dot(p, uWdir);
      float warp = 2.2 * vn(p * 1.4 + 31.7);
      float gust = 0.5 + 0.5 * sin(along * 4.0 - uTsec * 1.25 + warp);
      float amount = 0.25 + 0.75 * gust * gust;
      vec2 e = min(vUv, 1. - vUv) * uAspect;
      float wall = smoothstep(0.0, 0.1, min(e.x, e.y));
      float a = (vn(p * 0.9 + vec2(uTsec * 0.021, -uTsec * 0.017) + 7.) - 0.5) * 1.6;
      vec2 d = vec2(cos(a) * uWdir.x - sin(a) * uWdir.y, sin(a) * uWdir.x + cos(a) * uWdir.y);
      o = vec4(mix(v, d * uAmp * amount * wall, uAmt * wall), 0., 1.);
    }`,
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
    uniform sampler2D uH, uVel, uH0; uniform vec2 uTh; uniform float uK, uLevel, uMem;
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
      // elastic memory (living phase): a slow pull back toward the painting as poured, so the
      // liquid breathes, mixes and reshapes without collapsing into one colour
      o = mix(o, texelFetch(uH0, c, 0), uMem);
    }`,
    // mofu alpha.frag: the historical maximum of coverage, per pigment
    history: HEAD + `
    uniform sampler2D uHist, uH, uHist0; uniform float uMem;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      o = max(texelFetch(uHist,c,0), smoothstep(vec4(0), vec4(0.01/0.7), texelFetch(uH,c,0)));
      // living phase: the traces remember too, so washes left by passing liquid recede
      o = mix(o, texelFetch(uHist0, c, 0), uMem);
    }`,
    // the source rising in the paper: a public-domain original fitted whole inside the image
    // area (uFit = its rect in sim uv), or the work's composition map; alpha marks where it lies
    dyeInit: HEAD + `
    uniform sampler2D uOrig; uniform vec4 uFit;
    void main(){
      vec2 q = (vUv - uFit.xy) / uFit.zw;
      float inside = step(0., q.x) * step(0., q.y) * step(q.x, 1.) * step(q.y, 1.);
      o = vec4(texture(uOrig, vec2(q.x, 1. - q.y)).rgb, inside);
    }`,
    // the source liquefies: carried by the same velocity field as the paint, through mofu's
    // threshold (it moves only where the liquid moves)
    dyeAdvect: HEAD + `
    uniform sampler2D uDye, uVel, uDye0; uniform vec2 uTh; uniform float uFollow, uMem;
    void main(){
      vec2 v = texture(uVel, vUv).xy;
      float s = smoothstep(uTh.x, uTh.y, length(v)) * uFollow;
      vec4 here = texture(uDye, vUv), src = texture(uDye, vUv - v * DT / uAspect);
      // an elastic memory of the source, like the paint's: it ripples and liquefies with the
      // gusts but stays legible; released in the ending, when it is carried and drunk
      o = mix(mix(here, src, s), texture(uDye0, vUv), uMem);
    }`,
    // a laid field (rectangle or ellipse): covers whatever paint lies beneath, then lays its own
    // pigment as a flat slab with a bevelled shoulder (the shoulder is what catches the light).
    // uMask = 0 clears to the ground (a cut-out).
    zone: HEAD + `
    uniform sampler2D uH; uniform vec2 uC, uHalf; uniform float uAng, uShape, uTh; uniform vec4 uMask;
    // uShape 2: a silhouette. uSil is the field's smoothed mask over the whole image (sim
    // orientation); it is sampled in its own frame: uM0 its original centre, uScale its size now
    uniform sampler2D uSil; uniform vec2 uM0, uPad; uniform float uScale, uCell;
    void main(){
      vec2 p = (vUv - uC)*uAspect;
      float c = cos(uAng), s = sin(uAng);
      vec2 q = vec2(c*p.x + s*p.y, -s*p.x + c*p.y);
      float d;
      if (uShape < 0.5) { vec2 dd = abs(q) - uHalf; d = length(max(dd, 0.)) + min(max(dd.x, dd.y), 0.); }
      else if (uShape < 1.5) d = (length(q/uHalf) - 1.) * min(uHalf.x, uHalf.y);
      else {
        vec2 mu = uM0 + q / (uScale * uAspect);
        // the mask texture carries an empty ring around the reader's grid, so the silhouette
        // closes inside its own frame: image coords run [-uPad, 1+uPad] across the texture
        vec2 mt = (mu + uPad) / (1. + 2. * uPad);
        float inside = step(0., mt.x) * step(mt.x, 1.) * step(0., mt.y) * step(mt.y, 1.);
        float v = texture(uSil, clamp(mt, 0., 1.)).r * inside;   // 0..1, smooth across cells
        d = (0.5 - v) * uCell * uScale;                            // a distance-like signed value, short units
      }
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

    // ---- engine v2 -------------------------------------------------------------------------
    // Multigrid pressure: the same Poisson problem as the Jacobi pass (L+R+B+T − 4p = div, walls
    // by clamping), solved with V-cycles so it converges at every grid size. The flow is then the
    // same in sheet units whether the sheet is simulated on 512 or 2048 cells.
    mgSmooth: HEAD + `   // weighted Jacobi
    uniform sampler2D uP, uRhs; uniform float uOmega;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float p = texelFetch(uP, c, 0).x;
      float L = texelFetch(uP, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uP, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uP, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uP, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      o = vec4(mix(p, (L+R+B+T - texelFetch(uRhs,c,0).x)*0.25, uOmega), 0., 0., 1.);
    }`,
    mgResidual: HEAD + `
    uniform sampler2D uP, uRhs;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float p = texelFetch(uP, c, 0).x;
      float L = texelFetch(uP, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uP, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uP, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uP, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      o = vec4(texelFetch(uRhs,c,0).x - (L+R+B+T - 4.*p), 0., 0., 1.);
    }`,
    // fine residual → coarse right-hand side: the sum of the 2×2 block (coarse cells are twice
    // as wide, so the Laplacian in coarse units is 4× the fine one; the sum is 4× the mean)
    mgRestrict: HEAD + `
    uniform sampler2D uR; uniform vec2 uFine;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy)*2, m = ivec2(uFine);
      float s = 0.;
      for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
        ivec2 f = c + ivec2(x,y);
        if (f.x < m.x && f.y < m.y) s += texelFetch(uR, f, 0).x;
      }
      o = vec4(s, 0., 0., 1.);
    }`,
    // coarse correction → fine: bilinear in coarse cell coordinates, added to the fine pressure
    mgProlong: HEAD + `
    uniform sampler2D uP, uE; uniform vec2 uCoarse;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uCoarse)-1;
      vec2 q = (vec2(c)+0.5)*0.5 - 0.5; vec2 i = floor(q), f = q - i;
      ivec2 a = clamp(ivec2(i), ivec2(0), m), b = clamp(ivec2(i)+1, ivec2(0), m);
      float e = mix(mix(texelFetch(uE,a,0).x, texelFetch(uE,ivec2(b.x,a.y),0).x, f.x),
                    mix(texelFetch(uE,ivec2(a.x,b.y),0).x, texelFetch(uE,b,0).x, f.x), f.y);
      o = vec4(texelFetch(uP, c, 0).x + e, 0., 0., 1.);
    }`,
    // projection with walls: the outermost cells carry no flow, after the projection as well as
    // after the advection, so paint is never drawn in from beyond the sheet's edge
    projectWall: HEAD + `
    uniform sampler2D uVel, uP;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float L = texelFetch(uP, clamp(c-ivec2(1,0),ivec2(0),m),0).x, R = texelFetch(uP, clamp(c+ivec2(1,0),ivec2(0),m),0).x;
      float B = texelFetch(uP, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uP, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      vec2 v = texelFetch(uVel,c,0).xy - 0.5*vec2(R-L, T-B);
      if (c.x < 1 || c.y < 1 || c.x >= m.x || c.y >= m.y) v = vec2(0);
      o = vec4(v, 0., 1.);
    }`,
    // Conservative transport, in mofu's terms. What leaves a cell is mofu's "removed"
    // (threshold × 0.3 × height, the threshold taken where the paint is); what arrives is that
    // outflow, gathered from the backtraced source (mofu's "added"). Each step the arrivals of a
    // pigment are scaled so they total exactly what left, so paint is neither made nor lost.
    tOut: HEAD + `
    uniform sampler2D uH, uVel; uniform vec2 uTh; uniform float uK; uniform vec4 uMob;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      float s = smoothstep(uTh.x, uTh.y, length(texelFetch(uVel, c, 0).xy));
      o = texelFetch(uH, c, 0) * (s * uK) * uMob;   // uMob: each pigment's mobility (paint body), else 1
    }`,
    tArrive: HEAD + `
    uniform sampler2D uOut, uVel;
    void main(){
      vec2 v = texelFetch(uVel, ivec2(gl_FragCoord.xy), 0).xy;
      o = bilin(uOut, vUv - v*DT/uAspect);
    }`,
    // ---- engine v3: keep the eddies -------------------------------------------------------
    // MacCormack velocity advection: a forward semi-Lagrangian step (uHat, from the advect pass),
    // traced back again; half the round-trip error is added back, then clamped to the four source
    // texels so it can never overshoot. Second-order, so small swirls survive the step.
    advectMC: HEAD + `
    uniform sampler2D uVel, uHat; uniform float uDamp;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      vec2 v = texelFetch(uVel, c, 0).xy;
      vec2 hat = texelFetch(uHat, c, 0).xy;
      vec2 back = bilin(uHat, vUv + v*DT/uAspect).xy;            // the forward result, traced back
      vec2 r = hat + 0.5*(v - back);
      vec2 p = (vUv - v*DT/uAspect)*uSize - 0.5; ivec2 i = ivec2(floor(p));
      vec2 a = texelFetch(uVel, clamp(i, ivec2(0), m), 0).xy, b = texelFetch(uVel, clamp(i+ivec2(1,0), ivec2(0), m), 0).xy;
      vec2 d = texelFetch(uVel, clamp(i+ivec2(0,1), ivec2(0), m), 0).xy, e = texelFetch(uVel, clamp(i+ivec2(1,1), ivec2(0), m), 0).xy;
      r = clamp(r, min(min(a,b),min(d,e)), max(max(a,b),max(d,e)));  // limiter
      r *= uDamp;
      if (c.x < 1 || c.y < 1 || c.x >= m.x || c.y >= m.y) r = vec2(0);
      o = vec4(r, 0., 1.);
    }`,
    // vorticity (curl) of the velocity, per cell: velocity difference across two cells
    curl: HEAD + `
    uniform sampler2D uVel;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float L = texelFetch(uVel, clamp(c-ivec2(1,0),ivec2(0),m),0).y, R = texelFetch(uVel, clamp(c+ivec2(1,0),ivec2(0),m),0).y;
      float B = texelFetch(uVel, clamp(c-ivec2(0,1),ivec2(0),m),0).x, T = texelFetch(uVel, clamp(c+ivec2(0,1),ivec2(0),m),0).x;
      o = vec4(0.5*((R-L) - (T-B)), 0., 0., 1.);
    }`,
    // separable gaussian of the curl (sigma in cells; 17 taps over ±2 sigma)
    blur1: HEAD + `
    uniform sampler2D uT; uniform vec2 uDir; uniform float uSigma;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float acc = 0., ws = 0.;
      for (int k = -8; k <= 8; k++) {
        float x = float(k) * uSigma * 0.25, w = exp(-0.5 * (x*x) / (uSigma*uSigma));
        ivec2 q = clamp(c + ivec2(round(uDir * x)), ivec2(0), m);
        acc += w * texelFetch(uT, q, 0).x; ws += w;
      }
      o = vec4(acc / ws, 0., 0., 1.);
    }`,
    // vorticity confinement (Fedkiw et al.): a force along N × ω, N pointing up the gradient of
    // |ω|, which spins up the small eddies numerical diffusion removes. In this per-cell form the
    // force shrinks with the cell size, so it restores what the grid loses and converges with
    // resolution. uEps is the strength.
    vort: HEAD + `
    uniform sampler2D uVel, uCurl; uniform float uEps, uSigma;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float w = texelFetch(uCurl, c, 0).x;
      float L = abs(texelFetch(uCurl, clamp(c-ivec2(1,0),ivec2(0),m),0).x), R = abs(texelFetch(uCurl, clamp(c+ivec2(1,0),ivec2(0),m),0).x);
      float B = abs(texelFetch(uCurl, clamp(c-ivec2(0,1),ivec2(0),m),0).x), T = abs(texelFetch(uCurl, clamp(c+ivec2(0,1),ivec2(0),m),0).x);
      vec2 g = 0.5*vec2(R-L, T-B);
      vec2 N = g / (length(g) + 1e-6);
      // Δv = Δt · ε · ℓ · (N × ω): ω is the physical vorticity of the smoothed field (w · cells per
      // short side), ℓ the smoothing scale in short-side units, so ε is dimensionless and the force
      // is the same at every grid size; w · uSigma = ω · ℓ.
      vec2 f = uEps * DT * uSigma * vec2(N.y, -N.x) * w;
      vec2 v = texelFetch(uVel, c, 0).xy + f;
      if (c.x < 1 || c.y < 1 || c.x >= m.x || c.y >= m.y) v = vec2(0);
      o = vec4(v, 0., 1.);
    }`,
    // v3 wall memory, zero-sum: within ~5% of the walls the paint is drawn further toward the
    // painting as poured (weight w), so paint the wind piles against the frame dissolves back. The
    // pull is made to add no paint: its total is taken back in proportion to w × paint (wallFix).
    wallPull: HEAD + `
    uniform sampler2D uH, uH0; uniform float uK;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      vec2 e = min(vUv, 1. - vUv) * uAspect;
      float w = uK * (1. - smoothstep(0.0, 0.05, min(e.x, e.y)));
      o = w * (texelFetch(uH0, c, 0) - texelFetch(uH, c, 0));
    }`,
    wallW: HEAD + `   // weight × paint present: where the pull's total is taken back (never below zero)
    uniform sampler2D uH; uniform float uK;
    void main(){
      vec2 e = min(vUv, 1. - vUv) * uAspect;
      o = uK * (1. - smoothstep(0.0, 0.05, min(e.x, e.y))) * texelFetch(uH, ivec2(gl_FragCoord.xy), 0);
    }`,
    wallFix: HEAD + `
    uniform sampler2D uH, uD, uW, uSumD, uSumW;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      vec4 sd = texelFetch(uSumD, ivec2(0), 0), sw = texelFetch(uSumW, ivec2(0), 0);
      o = max(vec4(0), texelFetch(uH, c, 0) + texelFetch(uD, c, 0) - texelFetch(uW, c, 0) * sd / max(sw, vec4(1e-12)));
    }`,
    // ---- paint body: ridges where colours meet, a lip where a film ends ------------------------
    // The share of each pigment, and of bare ground, changes sharply at an interface. Half the sum
    // of those changes (per short-side unit) marks every boundary once, between colours and at a
    // film's edge alike. The ridge stands in proportion to the paint present there (capped), and is
    // smoothed over a fixed width in sheet units afterwards (blur1), so it is the same at any grid.
    bodyRaw: HEAD + `
    uniform sampler2D uH;
    vec4 share(ivec2 q, out float g){
      vec4 h = max(texelFetch(uH, q, 0), vec4(0)); float t = h.x+h.y+h.z+h.w;
      float c = smoothstep(0., 0.004, t);          // coverage, as the render's film threshold
      g = 1. - c;                                  // bare ground, the fifth share
      return t > 1e-6 ? h / t * c : vec4(0);
    }
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      float gL, gR, gB, gT;
      vec4 L = share(clamp(c-ivec2(1,0),ivec2(0),m), gL), R = share(clamp(c+ivec2(1,0),ivec2(0),m), gR);
      vec4 B = share(clamp(c-ivec2(0,1),ivec2(0),m), gB), T = share(clamp(c+ivec2(0,1),ivec2(0),m), gT);
      float minS = min(uSize.x, uSize.y);
      vec4 dx = (R - L) * 0.5 * minS, dy = (T - B) * 0.5 * minS;
      float gx = (gR - gL) * 0.5 * minS, gy = (gT - gB) * 0.5 * minS;
      float edge = 0.5 * (length(vec2(dx.x,dy.x)) + length(vec2(dx.y,dy.y)) + length(vec2(dx.z,dy.z)) + length(vec2(dx.w,dy.w)) + length(vec2(gx,gy)));
      vec4 h = max(texelFetch(uH, c, 0), vec4(0));
      float t = h.x+h.y+h.z+h.w;
      // where the boundary is a film edge the paint here may be thin: take the thicker neighbour
      float tn = max(t, max(max(dot(texelFetch(uH, clamp(c-ivec2(1,0),ivec2(0),m),0), vec4(1)), dot(texelFetch(uH, clamp(c+ivec2(1,0),ivec2(0),m),0), vec4(1))),
                            max(dot(texelFetch(uH, clamp(c-ivec2(0,1),ivec2(0),m),0), vec4(1)), dot(texelFetch(uH, clamp(c+ivec2(0,1),ivec2(0),m),0), vec4(1)))));
      o = vec4(edge * min(tn, 0.1), 0., 0., 1.);
    }`,
    // sum of a 4×4 block (a reduction step; repeated down to one texel)
    sum4: HEAD + `
    uniform sampler2D uT; uniform vec2 uFine;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy)*4, m = ivec2(uFine);
      vec4 s = vec4(0);
      for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
        ivec2 f = c + ivec2(x,y);
        if (f.x < m.x && f.y < m.y) s += texelFetch(uT, f, 0);
      }
      o = s;
    }`,
    tCombine: HEAD + `
    uniform sampler2D uH, uOut, uArr, uSumOut, uSumArr, uH0; uniform float uMem;
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy);
      vec4 so = texelFetch(uSumOut, ivec2(0), 0), sa = texelFetch(uSumArr, ivec2(0), 0);
      // arrivals rescaled to the outflow; a pigment that barely moves keeps ratio 1
      vec4 k = mix(vec4(1.), clamp(so / max(sa, vec4(1e-12)), 0.5, 2.0), step(vec4(1e-9), sa));
      vec4 h = max(vec4(0), texelFetch(uH, c, 0) - texelFetch(uOut, c, 0) + texelFetch(uArr, c, 0) * k);
      // elastic memory (living phase), as in v1
      o = mix(h, texelFetch(uH0, c, 0), uMem);
    }`,
    // Levelling as an exchange between neighbours: each pair trades paint in proportion to the
    // difference in height, where either side is moving. What one cell gives the other takes, so
    // levelling conserves paint too. uD is per sub-step, already scaled to sheet units.
    tLevel: HEAD + `
    uniform sampler2D uH, uVel; uniform vec2 uTh; uniform float uD;
    float mob(ivec2 c){ return smoothstep(uTh.x, uTh.y, length(texelFetch(uVel, c, 0).xy)); }
    void main(){
      ivec2 c = ivec2(gl_FragCoord.xy), m = ivec2(uSize)-1;
      vec4 h = texelFetch(uH, c, 0); float s = mob(c);
      vec4 acc = vec4(0);
      ivec2 n[4] = ivec2[4](ivec2(-1,0), ivec2(1,0), ivec2(0,-1), ivec2(0,1));
      for (int i = 0; i < 4; i++) {
        ivec2 q = c + n[i];
        if (q.x < 0 || q.y < 0 || q.x > m.x || q.y > m.y) continue;   // the wall: no exchange
        acc += max(s, mob(q)) * (texelFetch(uH, q, 0) - h);
      }
      o = h + uD * acc;
    }`,
  };

  // render: one pass, any output size. Output pixel → sheet uv → image uv → sim.
  const RENDER = `#version 300 es
  precision highp float; precision highp sampler2D;
  out vec4 o;
  uniform sampler2D uH, uHist;
  uniform sampler2D uBody;    // paint body: ridge height field (x), smoothed in sheet units
  uniform float uBodyOn, uBodyK;
  uniform vec4 uOpq;          // each pigment's hiding power (paint body), else 1
  uniform vec2 uSize, uAspect;
  uniform vec2 uOut;          // output size in px (whole sheet)
  uniform vec2 uOrigin;       // this tile's top-left in output px
  uniform float uTileH;
  uniform vec4 uImg;          // image rect in sheet uv (x0, y0, x1, y1), y down
  uniform float uPxPerMM;
  uniform vec3 uGround, uPaper;
  uniform vec3 uKS[4];        // Kubelka–Munk K/S per pigment (linear RGB)
  uniform vec4 uP;            // impurity index: each pigment's own non-selective scattering
  uniform float uMix;         // 0 single-constant, 1 with the impurity index
  uniform float uFilm;        // 0 blend the masstone over the ground, 1 the two-layer solution
  uniform float uFilmX;       // sheet units of paint to optical thickness
  uniform float uRelief, uGloss, uTooth, uLinearOut, uTrace;
  // the animated version's ending: absorption into the paper (uEnd 0→1). The movement itself is
  // the simulation; nothing here displaces the paint.
  uniform float uAnim, uEnd, uReveal;
  uniform sampler2D uDye;      // the source in the paper (sRGB, alpha = where it lies)
  uniform vec4 uAbsorb;        // each pigment's absorbency (seeded, 0.75–1.25)
  uniform float uSeed;
  uniform sampler2D uLabel;   // the caption, drawn in Cedarville Cursive at output resolution
  uniform vec4 uLabelRect;    // its box in output px (x, y, w, h), y down
  uniform float uLabelOn;
  uniform vec3 uInk;

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
  // the body field's gradient, from the same cubic B-spline
  vec2 bodyGrad(vec2 uv){
    vec2 p = uv*uSize - 0.5, i = floor(p), f = p - i;
    vec4 wx, dx, wy, dy; bspline(f.x, wx, dx); bspline(f.y, wy, dy);
    ivec2 m = ivec2(uSize)-1, b = ivec2(i) - 1;
    vec2 g = vec2(0);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      float v = texelFetch(uBody, clamp(b + ivec2(x,y), ivec2(0), m), 0).x;
      g += v * vec2(dx[x]*wy[y], wx[x]*dy[y]);
    }
    return g;
  }
  vec3 ks2r(vec3 ks){ return 1. + ks - sqrt(ks*ks + 2.*ks); }
  vec3 srgb(vec3 c){ c = clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
  vec3 srgb2lin(vec3 c){ c = clamp(c,0.,1.); return mix(c/12.92, pow((c + 0.055)/1.055, vec3(2.4)), step(0.04045, c)); }

  void main(){
    vec2 px = vec2(uOrigin.x + gl_FragCoord.x, uOrigin.y + (uTileH - gl_FragCoord.y));
    vec2 su = px / uOut;                         // sheet uv, y down
    vec2 mm = px / uPxPerMM;
    vec3 col;
    // Everything below runs for every pixel (uniform control flow), so fwidth() is defined at
    // the border edge too; the border/image choice is made only at the end.
    bool inImage = !(su.x < uImg.x || su.y < uImg.y || su.x > uImg.z || su.y > uImg.w);
    {
      vec2 iu = clamp((su - uImg.xy) / (uImg.zw - uImg.xy), 0., 1.);
      vec2 uv = vec2(iu.x, 1. - iu.y);            // sim textures: y up
      // ---- ending: the paper drinks the paint a little at a time, where it lies.
      // The paper's pores and fibres (noise at three scales, fixed to the sheet) decide when each
      // point drinks: holes open in the open pores first and spread along ragged lines.
      vec2 uvS = uv; vec4 k4 = vec4(1.);
      float pore = 0., soak = 0., drinkBase = 0., edgeW = 0.07, endGate = 1., soakMix = 0.;
      float poreT = 0.;
      if (uAnim > 0.5 || uReveal > 0.) {
        vec2 p = (uv - 0.5) * uAspect;
        pore = 0.55 * vnoise(p * 22. + 3.1) + 0.3 * vnoise(p * 7.5 + 11.7) + 0.15 * vnoise(p * 2.6 + 5.3);
        // summed noise bunches near its middle (10–90% within 0.36–0.74, measured): spread it
        poreT = smoothstep(0.36, 0.76, pore);
        soak = uEnd;
        drinkBase = 0.02 + 0.66 * poreT;
        endGate = 1. - smoothstep(0.985, 1.0, uEnd);
      }
      vec4 H, Hx, Hy, Q; sampleCubic(uvS, H, Hx, Hy, Q);
      H *= k4; Hx *= k4; Hy *= k4; Q *= k4;
      vec4 Hc = H;                                   // the paint as laid: its colour weights
      if (uAnim > 0.5 && soak > 0.) {
        // when each pigment here is drunk: the paper's pore timing, later where the paint is
        // thick, and each pigment at its own absorbency. All times fall at or before 0.82, so paint
        // (+0.09) and stain (+0.16) are gone by the end of the loop, which closes exactly.
        vec4 thick = clamp(Hc / 0.2, 0., 1.);
        vec4 drink = (vec4(drinkBase) + 0.12 * thick) * (1.3 - 0.4 * uAbsorb);  // ≤ 0.82 + edge 0.07 + stain 0.16 < 1
        vec4 film = 1. - smoothstep(drink, drink + edgeW, vec4(soak));   // paint still on top
        float sink = 1. - 0.7 * smoothstep(0., 0.8, soak);               // flattens as it sinks
        H = Hc * film * endGate;
        Hx *= film * sink; Hy *= film * sink;
        // the stain it leaves in the paper lingers, then is drunk in turn
        vec4 stain = 1. - smoothstep(drink + 0.08, drink + 0.16, vec4(soak));
        Q *= stain * endGate;
        float tot = dot(Hc, vec4(1.));
        soakMix = tot > 1e-5 ? 1. - dot(film, Hc) / tot : 0.;
      }
      float total = H.x+H.y+H.z+H.w;
      // gradient of total thickness per short-side unit
      float minS = min(uSize.x, uSize.y);
      vec2 g = vec2(Hx.x+Hx.y+Hx.z+Hx.w, Hy.x+Hy.y+Hy.z+Hy.w) * minS;
      // paint body: ridges and lips add to the relief (the field fades with the paint in the ending)
      if (uBodyOn > 0.5) g += bodyGrad(uvS) * minS * uBodyK * (uAnim > 0.5 ? clamp(total / max(dot(Hc, vec4(1.)), 1e-6), 0., 1.) : 1.);
      // The relief runs with the film too. The gradient alone makes a thin strand's edge stand as
      // tall as a deep pool's, which is the other half of why every form wore the same sheen.
      float wet = smoothstep(0.004, 0.055, total);
      vec3 N = normalize(vec3(-g*uRelief*mix(0.25, 1.1, wet), 1.));
      // like light over a field in wind: the sheen leans with each gust as it passes
      // coverage, per pigment: mofu's alpha = 0.5·(trace history) + 0.5·(present film), both
      // near-binary at sim scale. Here each is thresholded on the smooth cubic field and
      // anti-aliased over one *output* pixel (fwidth), so edges stay crisp at any dpi.
      vec4 fwH = max(fwidth(H), vec4(1e-7)), fwQ = max(fwidth(Q), vec4(1e-5));
      vec4 film  = smoothstep(vec4(0.004) - fwH, vec4(0.004) + fwH, H);
      vec4 stain = smoothstep(vec4(0.5) - fwQ, vec4(0.5) + fwQ, Q);
      // uTrace: how much the sheet remembers. 0 keeps only the present film; 1 keeps the whole
      // record of where paint has been, which holds the silhouettes as laid behind the moved
      // paint. 0.5 is what every print before this setting was made with.
      vec4 a4 = uTrace*max(stain, film) + (1. - uTrace)*film;
      float A = max(max(a4.x,a4.y), max(a4.z,a4.w));
      // Kubelka–Munk: mix absorption/scatter weighted by thickness; stains weigh in where thin
      vec4 w = max(Hc, vec4(0)) + 0.015*a4;          // hue of the paint as laid, even once soaked in
      float ws = w.x+w.y+w.z+w.w;
      // Single-constant Kubelka-Munk assumes one scattering power for every pigment, so a mixture
      // is the concentration-weighted mean of K/S. That holds when a white substrate does the
      // scattering; these pigments are masstones, applied pure, and the assumption fails for them.
      // The impurity index gives each pigment its own non-selective scattering p (Moghareh Abed
      // and Berns), so K = sum(c p K/S) and S = sum(c p): the mean is weighted by c*p, and the
      // pigment that scatters more carries the mixture. uMix 0 keeps the plain mean.
      // p governs the mixture only. How much of the ground a film hides keeps its own term:
      // tried together, a pigment with a low p stopped hiding as well as it mixed, and the
      // Gauguin's near-black, the lowest p of any pigment here at 0.20, came out warm grey.
      vec4 cw = mix(w, w * uP, uMix);
      float cs = cw.x+cw.y+cw.z+cw.w;
      vec3 ks = cs > 1e-6 ? (uKS[0]*cw.x + uKS[1]*cw.y + uKS[2]*cw.z + uKS[3]*cw.w)/cs : uKS[0];
      vec3 paint = ks2r(ks);                         // the masstone: an infinitely thick film
      // a thin film lets the ground through
      float hide, cover;
      if (uBodyOn > 0.5) {
        // paint body: each pigment hides the ground by its own power, so a glaze lets it glow through
        float O = dot(w, uOpq) / max(ws, 1e-6);
        hide = 1. - exp(-total*40.*O);
        cover = A * mix(0.9 - 0.5*max(0., 1. - O), 1., hide);
      } else {
        hide = 1. - exp(-total*40.);
        cover = A * mix(0.9, 1., hide);
      }
      vec3 ground = uGround * (1. + tooth(mm));
      // the source rises through the paper's pores beneath the paint (open pores first), the
      // paint thinning to a veil so both are seen; in the ending the paper drinks it too
      float show = 0.;                                   // how far the original has risen here
      if (uReveal > 0.) {
        vec4 dy = texture(uDye, uvS);
        float rise = smoothstep(0.75 * poreT, 0.75 * poreT + 0.25, uReveal);
        float rt = 0.05 + 0.75 * poreT;
        float gone = smoothstep(rt, rt + 0.12, soak) + (1. - endGate);
        show = clamp(dy.a * rise * (1. - gone), 0., 1.);
        vec3 lin = srgb2lin(dy.rgb);   // exact inverse of srgb(): a 2.2 power crushed the shadows
        ground = mix(ground, lin * (1. + tooth(mm)), show);
        // the paint becomes a thin veil and takes on the source's colour where they meet, so the
        // two read as one liquid rather than a picture under a cover
        cover *= 1. - 0.8 * show;
        paint = mix(paint, lin, 0.45 * show);
      }
      paint = mix(paint, ground, 0.35 * soakMix);       // soaked into the paper: lighter, sunk
      // A film of finite thickness over the paper. Light crosses the paint, meets the ground,
      // scatters back and crosses again, which is what decides how much of the sheet shows. The
      // closed form of the two-flux equations is
      //     a = 1 + K/S,  b = sqrt(a*a - 1)
      //     R = (1 - Rg(a - b coth(bSX))) / (a - Rg + b coth(bSX))
      // with Rg the ground beneath (in the moving version, the original once it has risen) and X
      // the film's own thickness. It needs S on its own, which single-constant K/S cannot give;
      // the impurity index supplies it, so this became possible only with p. At X = 0 it returns
      // the ground exactly, as X grows it returns the masstone, and with no scattering it is
      // Beer-Lambert. Where it is on, it replaces the blend between masstone and ground, and the
      // hiding power and the thin-film nudge that stood in for it.
      vec3 base;
      if (uFilm > 0.5) {
        float Sm = cs > 1e-6 ? dot(cw, uP) / cs : 1.;            // the mixture's scattering
        vec3 aa = 1. + ks, bb = sqrt(max(ks*ks + 2.*ks, vec3(1e-9)));
        // as the original rises the film thins to a veil, which here means its own thickness
        // falls: without this the film keeps its full depth and hides the painting underneath
        float X = ws * uFilmX * (1. - 0.8 * show);
        vec3 ct = 1. / tanh(clamp(bb * Sm * X, vec3(1e-3), vec3(16.)));
        vec3 R = (1. - ground * (aa - bb*ct)) / max(aa - ground + bb*ct, vec3(1e-5));
        base = clamp(R, 0., 1.);
      } else {
        base = mix(ground, paint, cover);
      }
      // light: flat paint renders as its palette colour exactly; relief adds key light and gloss
      vec3 L = normalize(vec3(-0.45, 0.55, 0.70)), Hh = normalize(L + vec3(0,0,1));
      float shade = 1. + 0.9*(dot(N,L) - L.z);
      // The highlight says how thick the paint is. A deep pool holds a smooth surface and takes a
      // tight, bright sheen; a thin strand sits on the paper's tooth and takes a broad, dim one.
      // With one sharpness for both, a filament and a pool wore the same slick highlight and the
      // surface read as liquid plastic rather than as paint of varying body.
      float sh = mix(10., 90., wet);
      float spec = max(0., pow(max(dot(N,Hh),0.), sh) - pow(Hh.z, sh));
      col = base*mix(1., shade, cover) + uGloss*spec*cover*mix(0.12, 1.15, wet)*vec3(1.);
    }
    if (!inImage) col = uPaper * (1. + tooth(mm));
    if (uLabelOn > 0.5) {
      vec2 lu = (px - uLabelRect.xy) / uLabelRect.zw;
      if (lu.x >= 0. && lu.y >= 0. && lu.x <= 1. && lu.y <= 1.) col = mix(col, uInk, 0.92 * textureLod(uLabel, lu, 0.).a);   // explicit LOD: no derivatives in this branch
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
    gl.activeTexture(gl.TEXTURE0);
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

  // ---- the works: colorlisa's 133 (ids 0–132, each with a hand-written brief) and the Colorist
  // Archive from meditationsincolor.com (ids 1000 + n; 20,367 works by 367 artists, loaded per
  // artist on demand). An archive work has a palette, title, date, source link and, when known,
  // the proportions of the original; it composes from its palette (no layout brief), and an image
  // is referenced only when it is public domain by our rule.
  const ARCHIVE_BASE = 1000;
  const archive = { index: null, files: {}, pending: {}, loading: null, readings: null, readingsLoading: null };
  // the painting reader's readings of archive works (tools/painting-reader/read_works.py --archive)
  function loadArchiveReadings() {
    if (archive.readings) return Promise.resolve(archive.readings);
    if (!archive.readingsLoading) archive.readingsLoading = fetch('archive/readings.json').then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; }).then(function (d) { archive.readings = d || {}; return archive.readings; });
    return archive.readingsLoading;
  }
  // the reading of a work, if the painting reader has read its image (null otherwise)
  function readingFor(pal) {
    if (!pal) return null;
    if (pal.archive) return archive.readings ? archive.readings[String(pal.id)] || null : null;
    return (window.READINGS || {})[String(pal.id)] || null;
  }
  function loadArchiveIndex() {
    if (archive.index || archive.loading) return archive.loading;
    archive.loading = fetch('archive/index.json').then(function (r) { return r.json(); })
      .then(function (j) { archive.index = j; return j; }).catch(function () { archive.index = { artists: [], total: 0 }; });
    return archive.loading;
  }
  function artistAt(n) {           // the artist record holding flat archive index n
    const A = archive.index && archive.index.artists; if (!A) return null;
    let lo = 0, hi = A.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (A[mid].o <= n) lo = mid; else hi = mid - 1; }
    return A[lo];
  }
  function loadArtist(id) {
    if (archive.files[id]) return Promise.resolve(archive.files[id]);
    if (!archive.pending[id]) archive.pending[id] = fetch('archive/' + id + '.json').then(function (r) { return r.json(); })
      .then(function (w) { archive.files[id] = w; return w; });
    return archive.pending[id];
  }
  function archiveWork(n) {        // a loaded archive work as a palette-like record, or null
    const a = artistAt(n); if (!a) return null;
    const w = (archive.files[a.id] || [])[n - a.o]; if (!w) return null;
    return { id: ARCHIVE_BASE + n, archive: true, artist: a.name, painting: w.t, date: w.d, year: w.y, colors: w.c,
             aspect: w.a, aspectSource: w.a ? ASPECT_SOURCES[w.as || 'wd'] || 'Wikidata' : null, link: w.u, img: w.pd ? w.i : null, pd: w.pd, source: w.src, artistId: a.id, artistDied: a.died };
  }
  function workFor(id, cb) {       // resolve any work id; cb(work) once its data is loaded
    if (id < ARCHIVE_BASE) { cb(PALS[id]); return; }
    loadArchiveIndex().then(function () {
      const n = id - ARCHIVE_BASE, a = artistAt(n);
      if (!a || n >= archive.index.total) { cb(PALS[0]); return; }
      loadArtist(a.id).then(function () { cb(archiveWork(n)); });
    });
  }
  // the work for this seed (or the chosen one). Returns null while archive data is still loading;
  // build() then waits and runs again when it arrives.
  function paletteFor(seed) {
    const id = G.param('palette');
    if (id >= 0 && id < ARCHIVE_BASE) return PALS[id];
    let target = id;
    if (id < 0) {
      const r = GenArt._mulberry32(seed ^ 0x9e3779b9), c = G.param('collection');
      const fromArchive = c === 1 || (c === 2 && r() >= 0.25);
      if (!fromArchive) return PALS[r() * PALS.length | 0];
      if (!archive.index) { loadArchiveIndex().then(function () { simKey = ''; G.reset(); }); return null; }
      const A = archive.index.artists, a = A[r() * A.length | 0];
      target = ARCHIVE_BASE + a.o + (r() * a.n | 0);
    }
    const n = target - ARCHIVE_BASE;
    if (archive.index) { const a = artistAt(n); if (a && archive.files[a.id]) return archiveWork(n); }
    workFor(target, function () { simKey = ''; G.reset(); });
    return null;
  }

  function bind(prog, tex, size) {   // size: [w, h] of a coarser grid (multigrid, reductions)
    gl.useProgram(prog.p);
    let unit = 0;
    for (const name in tex) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex[name]);
      gl.uniform1i(prog.u[name], unit++);
    }
    if (prog.u.uSize) gl.uniform2f(prog.u.uSize, size ? size[0] : S.w, size ? size[1] : S.h);
    if (prog.u.uAspect) gl.uniform2f(prog.u.uAspect, S.aspect[0], S.aspect[1]);
  }
  function run(dst) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------------------------------------------------------------- build
  // The sheet for the current work: proportions of the original kept when known (and asked).
  function workAspect(pal) {
    if (G.param('proportions') !== 1 || !pal) return null;
    return pal.aspect && isFinite(pal.aspect) && pal.aspect > 0 ? pal.aspect : null;
  }
  function orientation(pal) { const o = G.param('landscape'); return o === 2 ? 'auto' : o === 1; }
  function sheetFor(dpi, pal) {
    pal = pal || (S && S.palette);
    return PG.sheet(G.param('format'), orientation(pal), G.param('border'), dpi, workAspect(pal));
  }
  function build() {
    let pal0 = paletteFor(G.seed);
    if (!pal0) { say('Loading the Colorist Archive…'); return; }   // runs again when the data arrives
    // mode 2, from the reading: the painting reader's measurements of the work's image set the
    // colours, the fields and the gestures (engine.js readBrief). Without a reading the work
    // falls back to its brief (colorlisa) or its palette (archive), and says so.
    let reading = null, readingMissing = false;
    if (G.param('mode') === 2) {
      if (pal0.archive && !archive.readings) { loadArchiveReadings().then(function () { simKey = ''; G.reset(); }); say('Loading the readings…'); return; }
      reading = readingFor(pal0);
      readingMissing = !reading;
      if (reading) pal0 = Object.assign({}, pal0, { colors: reading.colors.slice(), reading: reading });
    }
    say('');
    const sh = sheetFor(300, pal0);
    const long = G.param('simres');
    const a = sh.aspect, big = Math.max(a[0], a[1]);
    const w = Math.max(64, Math.round(long * a[0] / big)), h = Math.max(64, Math.round(long * a[1] / big));
    if (S) { freeV2(S); S.vel.free(); S.p.free(); S.hgt.free(); S.hist.free(); [S.h0, S.hist0, S.dye0].forEach(function (x) { if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } }); if (S.dye) S.dye.free(); gl.deleteTexture(S.div.t); gl.deleteFramebuffer(S.div.f); }
    // a fresh generator from the seed: the same sequence G.rng gives after a reset, so the
    // animated cycle can rebuild the identical composition each time it begins again
    const rng = GenArt._mulberry32(G.seed);
    const pal = pal0;
    // mode 0, after the work: the palette's brief sets the ground, the fields and the gestures.
    // mode 1, free gestures: the palette's colours with the seeded gesture styles.
    // mode 2, from the reading: the reader's measurements (above); archive works without one: from the palette
    const brief = reading ? PG.readBrief(reading, a) : (G.param('mode') !== 1 && !pal.archive ? window.BRIEFS[pal.id] : null);
    const score = brief
      ? PG.composeBrief(rng, brief, { energy: G.param('energy'), aspect: a, interp: G.param('interp'), handling: G.param('handling'), reserve: G.param('reserve') })
      : PG.compose(rng, { style: G.param('style'), pours: G.param('pours'), energy: G.param('energy'), aspect: a });
    // the interpretation may exchange ground and figure, so colours follow the score
    const cols = brief ? PG.briefColours(pal.colors, { g: score.g }) : PG.assignColours(pal.colors, G.param('ground'), rng);
    S = {
      w: w, h: h, aspect: a, sheet: sh, palette: pal, colours: cols, score: score, brief: brief,
      t: 0, live: 0,
      vel: pair(w, h, gl.RGBA16F, gl.LINEAR),
      p: pair(w, h, gl.RGBA16F, gl.NEAREST),
      div: target(w, h, gl.RGBA16F, gl.NEAREST),
      hgt: pair(w, h, gl.RGBA32F, gl.NEAREST),
      hist: pair(w, h, gl.RGBA16F, gl.NEAREST),
      pours: {},
      engine: G.param('engine'),
      reading: reading, readingMissing: readingMissing,
    };
    if (S.engine >= 2) allocV2(S);
    if (S.engine >= 3) { S.curlT = target(w, h, gl.RGBA16F, gl.NEAREST); S.curlB = target(w, h, gl.RGBA16F, gl.NEAREST); S.velHat = target(w, h, gl.RGBA16F, gl.LINEAR); }
    for (const e of score.events) if (e.type === 'pour' || e.type === 'zone') (S.pours[e.t] = S.pours[e.t] || []).push(e);
    if (brief) sourceFor(pal.id);   // fetch the source now, long before the animated version reveals it
    if (origView) setTimeout(placeOriginal, 0);
    handTouched = false;
    updateCaption();
    dirty = true;
  }

  // a field's silhouette as a texture: the reader's cells, upsampled 4× and softened, so the
  // laid shape has a drawn contour rather than a stepped one. Cached by the mask's bits.
  const silhouettes = {};
  function silhouette(m) {
    if (silhouettes[m.bits]) return silhouettes[m.bits];
    // The reader's cells, inside a ring of empty cells. Half of all silhouettes have cells on the
    // grid's own border, and the frame the mask is sampled in rarely lands exactly on the sheet's
    // edge (it is placed by the field's box and scaled), so without the ring a shape that reached
    // the border was cut off along a straight, axis-aligned line inside the picture. With it the
    // contour closes before the frame ends and the cut has nothing left to cut.
    const PAD = 1, c0 = m.cols, r0 = m.rows, cols = c0 + 2 * PAD, rows = r0 + 2 * PAD;
    const raw = atob(m.bits), cell = new Float32Array(cols * rows);
    for (let i = 0; i < c0 * r0; i++) {
      if (!((raw.charCodeAt(i >> 3) >> (i & 7)) & 1)) continue;
      cell[(((i / c0) | 0) + PAD) * cols + (i % c0) + PAD] = 1;
    }
    const U = 4, W = cols * U, H = rows * U, up = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // bilinear upsample, y flipped to sim (up)
      const fx = (x + 0.5) / U - 0.5, fy = (rows - (y + 0.5) / U) - 0.5;
      const x0 = Math.max(0, Math.min(cols - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
      const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1), tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      up[y * W + x] = (cell[y0 * cols + x0] * (1 - tx) + cell[y0 * cols + x1] * tx) * (1 - ty) + (cell[y1 * cols + x0] * (1 - tx) + cell[y1 * cols + x1] * tx) * ty;
    }
    let a = up, b = new Float32Array(W * H);   // two box blurs of one cell: a soft, round contour
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0, n = 0;
        for (let dy = -U / 2; dy <= U / 2; dy++) for (let dx = -U / 2; dx <= U / 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { sum += a[yy * W + xx]; n++; } }
        b[y * W + x] = sum / n;
      }
      const t = a; a = b; b = t;
    }
    const bytes = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) bytes[i] = Math.round(a[i] * 255);
    gl.activeTexture(gl.TEXTURE1);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    return (silhouettes[m.bits] = { t: t, cell: 1 / Math.max(c0, r0), pad: [PAD / c0, PAD / r0] });
  }
  function zone(e) {
    const u = P.zone.u;
    bind(P.zone, { uH: S.hgt.a.t });
    if (e.shape === 2) {
      const sil = silhouette(e.mask);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sil.t); gl.uniform1i(u.uSil, 1); gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(u.uM0, e.m0[0], e.m0[1]); gl.uniform1f(u.uScale, e.scale);
      gl.uniform2f(u.uPad, sil.pad[0], sil.pad[1]);
      gl.uniform1f(u.uCell, sil.cell * Math.max(S.aspect[0], S.aspect[1]));   // one grid cell, short-side units
    } else { gl.uniform1i(u.uSil, 1); gl.uniform2f(u.uM0, 0, 0); gl.uniform2f(u.uPad, 0, 0); gl.uniform1f(u.uScale, 1); gl.uniform1f(u.uCell, 0.03); }
    gl.uniform2f(u.uC, e.cx, e.cy); gl.uniform2f(u.uHalf, Math.max(1e-4, e.hx), Math.max(1e-4, e.hy));
    gl.uniform1f(u.uAng, e.ang); gl.uniform1f(u.uShape, e.shape); gl.uniform1f(u.uTh, e.th);
    gl.uniform4f(u.uMask, e.chan === 0 ? 1 : 0, e.chan === 1 ? 1 : 0, e.chan === 2 ? 1 : 0, e.chan === 3 ? 1 : 0);
    run(S.hgt.b); S.hgt.swap();
  }
  function after() { // "after A Bigger Splash, David Hockney" — the work this generation starts from
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

  // ---------------------------------------------------------------- engine v2
  // v1 (the original) is kept unchanged for reproducing earlier prints: p_engine=1.
  // v2: multigrid pressure (converged at every grid size), walls held after projection,
  // conservative transport and levelling, levelling in sheet units. Pressure in 32-bit float.
  const REF_LONG = 1024;                 // v1's default grid: v2's levelling matches it there
  function allocV2(s) {
    s.mg = [];
    let w = s.w, h = s.h;
    for (;;) {
      s.mg.push({ w: w, h: h, p: pair(w, h, gl.RGBA32F, gl.NEAREST), rhs: target(w, h, gl.RGBA32F, gl.NEAREST), r: target(w, h, gl.RGBA32F, gl.NEAREST) });
      if (Math.min(w, h) <= 4) break;
      w = Math.ceil(w / 2); h = Math.ceil(h / 2);
    }
    s.out = target(s.w, s.h, gl.RGBA32F, gl.NEAREST);
    s.arr = target(s.w, s.h, gl.RGBA32F, gl.NEAREST);
    s.sumChain = function () {               // targets for a reduction down to 1×1
      const c = []; let w2 = s.w, h2 = s.h;
      do { w2 = Math.ceil(w2 / 4); h2 = Math.ceil(h2 / 4); c.push(target(w2, h2, gl.RGBA32F, gl.NEAREST)); } while (w2 > 1 || h2 > 1);
      return c;
    };
    s.sumOut = s.sumChain(); s.sumArr = s.sumChain(); s.sumVol = s.sumChain();
  }
  function freeT(x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
  function freeV2(s) {
    if (s.bodyA) { freeT(s.bodyA); freeT(s.bodyB); s.bodyA = s.bodyB = null; }
    if (s.curlT) { freeT(s.curlT); freeT(s.curlB); freeT(s.velHat); s.curlT = s.curlB = s.velHat = null; }
    if (s.sumVol) { s.sumVol.forEach(freeT); s.sumVol = null; }
    if (!s.mg) return;
    s.mg.forEach(function (l) { l.p.free(); freeT(l.rhs); freeT(l.r); });
    [s.out, s.arr].forEach(freeT);
    [s.sumOut, s.sumArr].forEach(function (c) { c.forEach(freeT); });
    s.mg = null;
  }
  function reduce(src, chain) {            // sum of every texel of src into chain's last (1×1)
    let from = src, fw = S.w, fh = S.h;
    for (const t of chain) {
      bind(P.sum4, { uT: from.t }, [t.w, t.h]); gl.uniform2f(P.sum4.u.uFine, fw, fh); run(t);
      from = t; fw = t.w; fh = t.h;
    }
    return from;
  }
  function vcycle(l) {
    const L = S.mg[l], sz = [L.w, L.h];
    const smooth = function (n) {
      for (let i = 0; i < n; i++) {
        bind(P.mgSmooth, { uP: L.p.a.t, uRhs: L.rhs.t }, sz); gl.uniform1f(P.mgSmooth.u.uOmega, 0.8);
        run(L.p.b); L.p.swap();
      }
    };
    if (l === S.mg.length - 1) { smooth(40); return; }
    smooth(2);
    bind(P.mgResidual, { uP: L.p.a.t, uRhs: L.rhs.t }, sz); run(L.r);
    const C = S.mg[l + 1];
    bind(P.mgRestrict, { uR: L.r.t }, [C.w, C.h]); gl.uniform2f(P.mgRestrict.u.uFine, L.w, L.h); run(C.rhs);
    bind(P.scale, { uT: C.p.a.t }, [C.w, C.h]); gl.uniform1f(P.scale.u.uK, 0); run(C.p.b); C.p.swap();   // e = 0
    vcycle(l + 1);
    bind(P.mgProlong, { uP: L.p.a.t, uE: C.p.a.t }, sz); gl.uniform2f(P.mgProlong.u.uCoarse, C.w, C.h); run(L.p.b); L.p.swap();
    smooth(2);
  }
  const TH = [0.02, 0.22], KMOVE = 0.3;      // mofu's movement threshold and transfer factor
  // v2's wind gain. v1's living motion was partly paint vanishing and smearing; v2 conserves
  // paint, so the same wind moves it less. Tuned by eye and by measure (A Bigger Splash, Broadway
  // Boogie Woogie, The Starry Night; seed 7): at 2.2× v2 moves 72–96% as much as v1 while
  // 85–98% of the image stays within 24/255 of the painting as poured (v1: 80–96%).
  const V2_WIND = 2.2;
  function stepV2() {
    const top = S.mg[0];
    bind(P.divergence, { uVel: S.vel.a.t }); run(top.rhs);
    bind(P.scale, { uT: top.p.a.t }); gl.uniform1f(P.scale.u.uK, 0.8); run(top.p.b); top.p.swap();   // warm start, as v1
    vcycle(0); vcycle(0);
    bind(P.projectWall, { uVel: S.vel.a.t, uP: top.p.a.t }); run(S.vel.b); S.vel.swap();
    // transport: outflow, arrivals, the two totals, then the conserving combination
    bind(P.tOut, { uH: S.hgt.a.t, uVel: S.vel.a.t }); gl.uniform2f(P.tOut.u.uTh, TH[0], TH[1]); gl.uniform1f(P.tOut.u.uK, KMOVE);
    const mob = bodyProps().mob; gl.uniform4f(P.tOut.u.uMob, mob[0], mob[1], mob[2], mob[3]); run(S.out);
    bind(P.tArrive, { uOut: S.out.t, uVel: S.vel.a.t }); run(S.arr);
    const so = reduce(S.out, S.sumOut), sa = reduce(S.arr, S.sumArr);
    bind(P.tCombine, { uH: S.hgt.a.t, uOut: S.out.t, uArr: S.arr.t, uSumOut: so.t, uSumArr: sa.t, uH0: S.h0 ? S.h0.t : S.hgt.a.t });
    gl.uniform1f(P.tCombine.u.uMem, S.h0 ? S.mem : 0);
    run(S.hgt.b); S.hgt.swap();
    if (S.engine >= 3 && S.h0 && S.mem > 0) wallMemory();
    // levelling, in sheet units: v1's per-step strength at the 1024 grid, scaled by (cells per
    // sheet)² so the same film levels the same at any resolution; sub-steps keep it stable
    const lv = G.param('levelling');
    if (lv > 0) {
      const f = Math.pow(Math.max(S.w, S.h) / REF_LONG, 2), D = lv / 4 * f, n = Math.max(1, Math.ceil(D / 0.2));
      for (let i = 0; i < n; i++) {
        bind(P.tLevel, { uH: S.hgt.a.t, uVel: S.vel.a.t }); gl.uniform2f(P.tLevel.u.uTh, TH[0], TH[1]); gl.uniform1f(P.tLevel.u.uD, D / n);
        run(S.hgt.b); S.hgt.swap();
      }
    }
  }
  // ---------------------------------------------------------------- engine v3
  // v2 plus: vorticity confinement, MacCormack velocity advection, and a stronger memory at the
  // walls. Paint transport is v2's, so paint is still conserved exactly.
  const V3_EPS = 2, V3_SCALE = 0.015, V3_EDGE_MEM = 8;
  function wallMemory() {
    const k = S.mem * V3_EDGE_MEM;
    bind(P.wallPull, { uH: S.hgt.a.t, uH0: S.h0.t }); gl.uniform1f(P.wallPull.u.uK, k); run(S.out);
    bind(P.wallW, { uH: S.hgt.a.t }); gl.uniform1f(P.wallW.u.uK, k); run(S.arr);
    const sd = reduce(S.out, S.sumOut), sw = reduce(S.arr, S.sumArr);
    bind(P.wallFix, { uH: S.hgt.a.t, uD: S.out.t, uW: S.arr.t, uSumD: sd.t, uSumW: sw.t }); run(S.hgt.b); S.hgt.swap();
  }
  function advectV3() {
    bind(P.curl, { uVel: S.vel.a.t }); run(S.curlT);
    // eddies at the painting's scale, not the grid's: smooth the curl over 1.5% of the short side
    const sigma = V3_SCALE * Math.min(S.w, S.h);
    bind(P.blur1, { uT: S.curlT.t }); gl.uniform2f(P.blur1.u.uDir, 1, 0); gl.uniform1f(P.blur1.u.uSigma, sigma); run(S.curlB);
    bind(P.blur1, { uT: S.curlB.t }); gl.uniform2f(P.blur1.u.uDir, 0, 1); gl.uniform1f(P.blur1.u.uSigma, sigma); run(S.curlT);
    // window.__V3_EPS overrides the strength (tests only)
    bind(P.vort, { uVel: S.vel.a.t, uCurl: S.curlT.t }); gl.uniform1f(P.vort.u.uEps, typeof window.__V3_EPS === 'number' ? window.__V3_EPS : V3_EPS); gl.uniform1f(P.vort.u.uSigma, sigma);
    run(S.vel.b); S.vel.swap();
    bind(P.advect, { uVel: S.vel.a.t }); gl.uniform1f(P.advect.u.uDamp, 1); run(S.velHat);
    bind(P.advectMC, { uVel: S.vel.a.t, uHat: S.velHat.t }); gl.uniform1f(P.advectMC.u.uDamp, G.param('flow')); run(S.vel.b); S.vel.swap();
  }
  // total paint per pigment (sum of heights), read back: for checks, not used by the simulation
  function volume() {
    if (!S) return null;
    const chain = S.sumVol || (S.sumVol = (function () { const c = []; let w2 = S.w, h2 = S.h; do { w2 = Math.ceil(w2 / 4); h2 = Math.ceil(h2 / 4); c.push(target(w2, h2, gl.RGBA32F, gl.NEAREST)); } while (w2 > 1 || h2 > 1); return c; })());
    const t = reduce(S.hgt.a, chain), px = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.f); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    return Array.from(px);
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
    // v3's eddies act in the moving version only (living and ending): the pour, and so every still
    // print, is exactly v2's, which keeps prints the same at every sim resolution. Measured on the
    // finished pour, 256 vs 1024 cells: v2 2.5% of pixels differ, eddies throughout 5.1%.
    if (S.engine >= 3 && motion.on && motion.phase !== 'creation') advectV3();
    else { bind(P.advect, { uVel: S.vel.a.t }); gl.uniform1f(P.advect.u.uDamp, G.param('flow')); run(S.vel.b); S.vel.swap(); }
    if (S.engine >= 2) stepV2(); else {
      // engine v1, unchanged: 30 Jacobi iterations (by default), mofu's height rule as published
      bind(P.divergence, { uVel: S.vel.a.t }); run(S.div);
      bind(P.scale, { uT: S.p.a.t }); gl.uniform1f(P.scale.u.uK, 0.8); run(S.p.b); S.p.swap();
      const iters = G.param('iterations');
      for (let i = 0; i < iters; i++) { bind(P.pressure, { uP: S.p.a.t, uDiv: S.div.t }); run(S.p.b); S.p.swap(); }
      bind(P.project, { uVel: S.vel.a.t, uP: S.p.a.t }); run(S.vel.b); S.vel.swap();
      bind(P.height, { uH: S.hgt.a.t, uVel: S.vel.a.t, uH0: S.h0 ? S.h0.t : S.hgt.a.t });
      gl.uniform1f(P.height.u.uMem, S.h0 ? S.mem : 0);
      gl.uniform2f(P.height.u.uTh, 0.02, 0.22);
      gl.uniform1f(P.height.u.uK, 0.3);
      gl.uniform1f(P.height.u.uLevel, G.param('levelling'));
      run(S.hgt.b); S.hgt.swap();
    }
    bind(P.history, { uHist: S.hist.a.t, uH: S.hgt.a.t, uHist0: S.hist0 ? S.hist0.t : S.hist.a.t });
    gl.uniform1f(P.history.u.uMem, S.hist0 ? S.mem * 2 : 0);
    run(S.hist.b); S.hist.swap();
    S.t++;
  }

  // ---------------------------------------------------------------- render
  function linRGB(hex) { return PG.hexToSRGB(hex).map(PG.toLinear); }

  // ---------------------------------------------------------------- label
  // The work's title over the artist's name, bottom right, in Cedarville Cursive (OFL, served
  // from assets/fonts so a print never depends on a font CDN). The text is drawn on a 2D canvas
  // at the output's own resolution and composited in the render pass, so it is as sharp at
  // 360 dpi as on screen. Sizes are fractions of the sheet's short side, so the label keeps its
  // proportion on every format.
  const FONT = 'Cedarville Cursive';
  const fontReady = (function () {
    try {
      const f = new FontFace(FONT, 'url(../../assets/fonts/cedarville-cursive/Cedarville-Cursive.ttf)');
      return f.load().then(function (ff) { document.fonts.add(ff); labelKey = ''; dirty = true; }, function () {});
    } catch (e) { return Promise.resolve(); }
  })();
  const labelTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, labelTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let labelKey = '', labelBox = null;
  function labelFor(outW, outH, pxPerMM) {
    if (!S || G.param('label') !== 1) return null;
    const sh = S.sheet, short = Math.min(sh.mm[0], sh.mm[1]);
    const fs = Math.max(6, short * 0.016 * G.param('labelSize') * pxPerMM); // title size, px
    const fs2 = fs * 0.74;
    const lines = [S.palette.painting, S.palette.artist];
    const key = lines.join('|') + '|' + fs.toFixed(2) + '|' + document.fonts.check('12px "' + FONT + '"');
    if (key !== labelKey) {
      const c = document.createElement('canvas'), x = c.getContext('2d');
      const f1 = fs + 'px "' + FONT + '", cursive', f2 = fs2 + 'px "' + FONT + '", cursive';
      x.font = f1; const w1 = x.measureText(lines[0]).width;
      x.font = f2; const w2 = x.measureText(lines[1]).width;
      const pad = fs * 0.4;
      c.width = Math.ceil(Math.max(w1, w2) + 2 * pad); c.height = Math.ceil(fs * 1.2 + fs2 * 1.3 + 2 * pad);
      x.fillStyle = '#fff'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.font = f1; x.fillText(lines[0], c.width - pad, pad + fs * 0.95);
      x.font = f2; x.fillText(lines[1], c.width - pad, pad + fs * 1.2 + fs2 * 0.95);
      gl.bindTexture(gl.TEXTURE_2D, labelTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      labelKey = key; labelBox = { w: c.width, h: c.height, pad: pad };
    }
    // position: bottom right of the image, or centred in the bottom border when it is deep enough
    const kx = outW / sh.mm[0], ky = outH / sh.mm[1];
    const imgR = (sh.mm[0] - sh.bx) * kx, imgB = (sh.mm[1] - sh.by) * ky;
    const inset = short * 0.02 * pxPerMM - labelBox.pad;
    let inBorder = G.param('labelPos') === 1 && sh.by * ky >= labelBox.h * 0.9;
    let x0 = imgR - inset - labelBox.w, y0 = imgB - inset - labelBox.h;
    if (inBorder) { x0 = imgR + labelBox.pad - labelBox.w; y0 = imgB + (sh.by * ky - labelBox.h) / 2; }
    // ink: on paper a warm black; on the image the palette colour that contrasts most with the ground
    let ink = '#2B2926';
    if (!inBorder) {
      const gl0 = PG.luminance(S.colours.ground);
      let best = -1;
      S.palette.colors.forEach(function (h) { const d = Math.abs(PG.luminance(h) - gl0); if (d > best) { best = d; ink = h; } });
      if (best < 0.25) ink = gl0 > 0.3 ? '#1E1C1A' : '#F4F1EA';
    }
    return { x: x0, y: y0, w: labelBox.w, h: labelBox.h, ink: linRGB(ink), inBorder: inBorder, text: lines.join(', ') };
  }
  // ---------------------------------------------------------------- paint body
  // Each pigment's mobility (heavier paint spreads less) and hiding power (a glaze lets the ground
  // through), seeded per work from their own stream so no other seeded choice changes.
  // body off: both 1, and the ridge field is not drawn, which reproduces every earlier print.
  const BODY_SIGMA = 0.003, BODY_K = 0.8;    // ridge width (short-side units), ridge height factor
  function bodyProps() {
    if (!S || G.param('body') !== 1) return { mob: [1, 1, 1, 1], opq: [1, 1, 1, 1] };
    const r = GenArt._mulberry32((G.seed ^ 0x1b873593) >>> 0), mob = [], opq = [];
    for (let i = 0; i < 4; i++) { mob.push(+(0.75 + 0.5 * r()).toFixed(3)); opq.push(+(0.7 + 0.6 * r()).toFixed(3)); }
    return { mob: mob, opq: opq };
  }
  function updateBody() {
    if (!S.bodyA) { S.bodyA = target(S.w, S.h, gl.RGBA16F, gl.NEAREST); S.bodyB = target(S.w, S.h, gl.RGBA16F, gl.NEAREST); }
    const sigma = Math.max(1, BODY_SIGMA * Math.min(S.w, S.h));
    bind(P.bodyRaw, { uH: S.hgt.a.t }); run(S.bodyA);
    bind(P.blur1, { uT: S.bodyA.t }); gl.uniform2f(P.blur1.u.uDir, 1, 0); gl.uniform1f(P.blur1.u.uSigma, sigma); run(S.bodyB);
    bind(P.blur1, { uT: S.bodyB.t }); gl.uniform2f(P.blur1.u.uDir, 0, 1); gl.uniform1f(P.blur1.u.uSigma, sigma); run(S.bodyA);
  }
  function setRenderUniforms(outW, outH, pxPerMM, linearOut) {
    const bodyOn = G.param('body') === 1;
    if (bodyOn) {
      // the body pass renders into its own targets: restore the caller's target and viewport, or the
      // render would draw into the body texture it also reads (a feedback loop: a black screen)
      const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING), vp = gl.getParameter(gl.VIEWPORT);
      updateBody();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    }
    const u = P.render.u, sh = S.sheet;
    const lab = labelFor(outW, outH, pxPerMM);
    bind(P.render, { uH: S.hgt.a.t, uHist: S.hist.a.t, uLabel: labelTex });
    gl.uniform2f(u.uOut, outW, outH);
    gl.uniform1f(u.uLabelOn, lab ? 1 : 0);
    if (lab) { gl.uniform4f(u.uLabelRect, lab.x, lab.y, lab.w, lab.h); gl.uniform3f(u.uInk, lab.ink[0], lab.ink[1], lab.ink[2]); }
    gl.uniform4f(u.uImg, sh.bx / sh.mm[0], sh.by / sh.mm[1], 1 - sh.bx / sh.mm[0], 1 - sh.by / sh.mm[1]);
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
    // the impurity index of each pigment, from its own reflectance: a pale pigment scatters, a
    // dark saturated one mostly absorbs. Measured K and S would be better; these are not measured.
    const imp = S.colours.pigments.map(function (hex) {
      const Y = PG.luminance(hex);
      return Math.min(1, Math.max(0.1, 0.1 + 0.9 * Math.sqrt(Y)));
    });
    while (imp.length < 4) imp.push(1);
    gl.uniform4f(u.uP, imp[0], imp[1], imp[2], imp[3]);
    gl.uniform1f(u.uMix, G.param('mixing'));
    gl.uniform1f(u.uFilm, G.param('film'));
    gl.uniform1f(u.uFilmX, 70);
    gl.uniform1f(u.uRelief, G.param('relief'));
    gl.uniform1f(u.uGloss, G.param('gloss'));
    gl.uniform1f(u.uTooth, G.param('tooth'));
    gl.uniform1f(u.uTrace, G.param('trace'));
    gl.uniform1f(u.uLinearOut, linearOut ? 1 : 0);
    gl.uniform1f(u.uSeed, G.seed % 100000);
    const ending = motion.on && motion.phase === 'ending';
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, S.dye ? S.dye.a.t : S.hgt.a.t); gl.uniform1i(u.uDye, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.uReveal, motion.on && S.dye ? revealAmount() : 0);
    gl.uniform1f(u.uAnim, ending ? 1 : 0);
    gl.uniform1f(u.uEnd, ending ? motion.et / motion.endSteps() : 0);
    const ar = GenArt._mulberry32((G.seed ^ 0x2545f491) >>> 0);
    gl.uniform4f(u.uAbsorb, 0.75 + 0.5 * ar(), 0.75 + 0.5 * ar(), 0.75 + 0.5 * ar(), 0.75 + 0.5 * ar());
    const bp = bodyProps();
    gl.uniform1f(u.uBodyOn, bodyOn ? 1 : 0);
    gl.uniform1f(u.uBodyK, (typeof window.__BODY_K === 'number' ? window.__BODY_K : BODY_K) * BODY_SIGMA * 2.5066);   // override: tests only   // the smoothed field peaks at ≈ thickness / (σ√2π): ridge ≈ BODY_K × thickness
    gl.uniform4f(u.uOpq, bp.opq[0], bp.opq[1], bp.opq[2], bp.opq[3]);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, bodyOn && S.bodyA ? S.bodyA.t : S.hgt.a.t); gl.uniform1i(u.uBody, 5);
    gl.activeTexture(gl.TEXTURE0);
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
    if (origView) placeOriginal();
  }

  // ---------------------------------------------------------------- loop
  function frame() {
    if (!exporting && S && !(typeof motion !== 'undefined' && motion.recording)) {
      let stepped = false;
      if (motion.on) {
        // the animated version runs at the simulation's own clock: one step per 1/60 s
        if (motion.playing) {
          const now = performance.now();
          let n = Math.min(4, Math.floor((now - motion.last) / (1000 / 60)));
          if (n > 0) motion.last += n * (1000 / 60);
          for (let i = 0; i < n; i++) motionStep();
          stepped = n > 0;
        }
        if (handQueue.length) { step(); stepped = true; }
      } else {
        const spf = G.param('speed');
        for (let i = 0; i < spf; i++) {
          if (S.t < S.score.steps || S.live > 0 || handQueue.length) { step(); stepped = true; if (S.live > 0) S.live--; }
        }
      }
      if (stepped) dirty = true;
      if (dirty) { drawScreen(); dirty = false; }
      progress.style.width = (100 * Math.min(1, S.t / S.score.steps)) + '%';
      progress.parentNode.classList.toggle('done', S.t >= S.score.steps);
    }
    requestAnimationFrame(frame);
  }
  function finishSim() { if (!S) return; while (S.t < S.score.steps) step(); dirty = true; }

  // ---------------------------------------------------------------- motion
  // The animated version is the simulation itself, as in mofu's method: one velocity field
  // moves every pigment, paint moves only where the flow passes the threshold, pigments mix by
  // thickness and colour stays where liquid has passed. Nothing is drawn moving that the liquid
  // does not do, and the walls keep it all on the sheet.
  //   creation  the pour itself, from the empty sheet (the seed's score of fields and hands)
  //   living    048 Plotted Field's gusts flow through the same field; the wind veers through a
  //             full turn so nothing piles against one wall; an elastic memory pulls the paint
  //             gently back toward the painting, so it breathes, mixes and reshapes
  //   ending    the paper absorbs the paint where it lies, back to the empty sheet, and the
  //             pour begins again; a recorded loop is therefore seamless
  const GUST = 2 * Math.PI / 1.25;                       // s: one gust of 048's wind
  const motion = {
    on: false, playing: true, recording: false, phase: 'creation', lt: 0, et: 0, last: performance.now(), lag: 0,
    livingSteps: function () { return Math.round(G.param('gusts') * GUST * 60); },
    endSteps: function () { return Math.round(2 * GUST * 60); },   // two gusts
  };
  function loopSeconds() { return S ? (S.score.steps + motion.livingSteps() + motion.endSteps()) / 60 : 0; }
  function windAngle0() { return GenArt._mulberry32((G.seed ^ 0x3c6ef372) >>> 0)() * Math.PI * 2; }
  function restartMotion() {
    build(); motion.phase = 'creation'; motion.lt = 0; motion.et = 0; motion.last = performance.now(); dirty = true;
  }
  function wind() {
    const total = motion.livingSteps() + motion.endSteps(), k = motion.lt + motion.et;
    const ang = windAngle0() + 2 * Math.PI * k / total;  // one full veer per cycle
    bind(P.wind, { uVel: S.vel.a.t });
    gl.uniform2f(P.wind.u.uWdir, Math.cos(ang), Math.sin(ang));
    gl.uniform1f(P.wind.u.uTsec, k / 60);
    gl.uniform1f(P.wind.u.uAmp, 0.3 * G.param('wind') * (S.engine >= 2 ? V2_WIND : 1));
    gl.uniform1f(P.wind.u.uAmt, 0.06);
    run(S.vel.b); S.vel.swap();
  }
  // ---- the source: the original (public domain) or the composition map (in copyright)
  // An image of a work is used only when originals.json lists it as public domain, the artist
  // died in or before 1955 (EU: life + 70) and the work dates from 1930 or earlier (US). The
  // rule is checked here again, not only in the manifest. Every other work gets its composition
  // map: the brief's own fields, uninterpreted, in the work's five colours: our description of
  // its layout, never its image.
  const sources = {};
  function originalOK(m) { return !!(m && m.public_domain === true && m.artist_died <= 1955 && m.work_year <= 1930 && m.file); }
  function sourceFor(id) {
    if (sources[id]) return sources[id];
    if (id >= ARCHIVE_BASE) return archiveSource(id);
    const m = (window.ORIGINALS || {})[id];
    const src = sources[id] = { ready: false, kind: originalOK(m) ? 'original' : 'map', meta: m || null, canvas: null, aspect: 1 };
    if (src.kind === 'original') {
      const img = new Image();
      img.onload = function () {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        src.canvas = c; src.aspect = img.naturalWidth / img.naturalHeight; src.ready = true;
      };
      img.onerror = function () { src.kind = 'map'; drawMap(src, id); };  // missing file: fall back
      img.src = 'originals/' + m.file;
    } else drawMap(src, id);
    src.url = src.kind === 'original' ? 'originals/' + m.file : null;
    return src;
  }
  function archiveSource(id) {
    const w = S && S.palette && S.palette.id === id ? S.palette : archiveWork(id - ARCHIVE_BASE);
    const ok = !!(w && w.pd && w.img && w.artistDied && w.artistDied <= 1955 && w.year && w.year <= 1930);
    const src = sources[id] = { ready: false, kind: ok ? 'original' : 'none', canvas: null, aspect: 1, url: ok ? w.img : null,
      meta: ok ? { work_year: w.year, source: w.source, source_url: w.link, license: 'Public domain (artist died ' + w.artistDied + ', work ' + w.year + ')', file: w.img } : null };
    if (ok) {
      const img = new Image();
      img.crossOrigin = 'anonymous';                 // needed to carry it into the paint (WebGL)
      img.onload = function () {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        src.canvas = c; src.aspect = img.naturalWidth / img.naturalHeight; src.ready = true;
      };
      img.onerror = function () { src.kind = 'view-only'; };  // the source's server refuses: it can still be viewed
      img.src = w.img;
    }
    return src;
  }
  function drawMap(src, id) {
    // the brief laid exactly as written (interpretation 0, fixed seed), on a square-ish sheet
    const pal = PALS[id], brief = window.BRIEFS[id], W = 512, H = 512;
    const score = PG.composeBrief(GenArt._mulberry32(1), brief, { energy: 1, aspect: [1, 1], interp: 0 });
    const cols = PG.briefColours(pal.colors, { g: brief.g });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = cols.ground; x.fillRect(0, 0, W, H);
    x.filter = 'blur(' + Math.round(W * 0.012) + 'px)';
    score.events.forEach(function (e) {
      if (e.type === 'drag') return;
      const hex = e.type === 'pour' ? cols.pigments[e.pig] : (e.chan < 0 ? cols.ground : cols.pigments[e.chan]);
      x.fillStyle = hex; x.save();
      if (e.type === 'pour') { x.beginPath(); x.arc(e.x * W, (1 - e.y) * H, e.r * W, 0, Math.PI * 2); x.fill(); x.restore(); return; }
      x.translate(e.cx * W, (1 - e.cy) * H); x.rotate(-e.ang);
      if (e.shape === 1) { x.beginPath(); x.ellipse(0, 0, e.hx * W, e.hy * H, 0, 0, Math.PI * 2); x.fill(); }
      else x.fillRect(-e.hx * W, -e.hy * H, 2 * e.hx * W, 2 * e.hy * H);
      x.restore();
    });
    src.canvas = c; src.aspect = 1; src.ready = true;
  }
  // Revealed over the last 45% of the living phase; it stays through the ending, where the
  // paper drinks it with the paint.
  // ---- show the original (key O): the public-domain original over the canvas, fitted whole
  // inside the image area, to compare with the interpretation at any moment. Only for works
  // listed in originals.js; for a work in copyright it is unavailable and nothing is loaded.
  // It is a view only: prints and recordings never include it.
  let origView = false, origEl = null;
  function canShowOriginal() { const k = S ? sourceFor(S.palette.id).kind : ''; return k === 'original' || k === 'view-only'; }
  function setOriginalView(on) {
    origView = !!on && canShowOriginal();
    placeOriginal(); updateCaption();
    return origView;
  }
  function placeOriginal() {
    if (!origView || !S || !canShowOriginal()) { origView = origView && canShowOriginal(); if (origEl) origEl.hidden = true; return; }
    const src = sourceFor(S.palette.id);
    if (!src.ready && src.kind !== 'view-only') { setTimeout(placeOriginal, 150); return; }
    if (src.kind === 'view-only' && !src.aspect2) { const t = new Image(); t.onload = function () { src.aspect = src.aspect2 = t.naturalWidth / t.naturalHeight; placeOriginal(); }; t.src = src.url; return; }
    if (!origEl) {
      origEl = document.createElement('img');
      origEl.style.cssText = 'position:absolute;pointer-events:none;z-index:5;box-shadow:0 10px 34px rgba(0,0,0,.4)';
      document.body.appendChild(origEl);
    }
    const url = src.url;
    if (origEl.getAttribute('src') !== url) origEl.setAttribute('src', url);
    origEl.alt = S.palette.painting + ', ' + S.palette.artist + ' (public domain, ' + src.meta.source + ')';
    const box = canvas.getBoundingClientRect(), dpr = canvas.width / box.width, sh = S.sheet;
    const vx = box.left + window.scrollX + view.x / dpr, vy = box.top + window.scrollY + view.y / dpr, vw = view.w / dpr, vh = view.h / dpr;
    const bx = sh.bx / sh.mm[0] * vw, by = sh.by / sh.mm[1] * vh, iw = vw - 2 * bx, ih = vh - 2 * by;
    const w = src.aspect > iw / ih ? iw : ih * src.aspect, h = src.aspect > iw / ih ? iw / src.aspect : ih;
    origEl.style.left = (vx + bx + (iw - w) / 2) + 'px'; origEl.style.top = (vy + by + (ih - h) / 2) + 'px';
    origEl.style.width = w + 'px'; origEl.style.height = h + 'px';
    origEl.hidden = false;
  }
  function revealAmount() {
    if (G.param('original') === 0) return 0;         // the option: the source does not rise
    if (motion.phase === 'ending') return 1;
    if (motion.phase !== 'living') return 0;
    const f = motion.lt / motion.livingSteps();
    return Math.max(0, Math.min(1, (f - 0.55) / 0.4));
  }
  function initDye() {
    const src = sourceFor(S.palette.id);
    if (src.kind !== 'original' && src.kind !== 'map') return false;   // nothing to raise for this work
    if (!src.ready) return false;                    // image still loading: try next step
    if (!S.dye) S.dye = pair(S.w, S.h, gl.RGBA16F, gl.LINEAR);
    // created before the source is bound: making a target binds it on unit 0
    if (!S.dye0) S.dye0 = target(S.w, S.h, gl.RGBA16F, gl.LINEAR);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // fit the source whole inside the image area, centred ("contain"): nothing of it is cropped
    const ia = S.aspect[0] / S.aspect[1], sa = src.aspect;
    const fw = sa > ia ? 1 : sa / ia, fh = sa > ia ? ia / sa : 1;
    bind(P.dyeInit, { uOrig: tex });
    gl.uniform4f(P.dyeInit.u.uFit, (1 - fw) / 2, (1 - fh) / 2, fw, fh);
    run(S.dye.a); run(S.dye.b);
    run(S.dye0);                                     // the source as it first rises: its memory
    gl.deleteTexture(tex);
    S.dyeReady = true;
    return true;
  }
  function advectDye() {
    bind(P.dyeAdvect, { uDye: S.dye.a.t, uVel: S.vel.a.t, uDye0: S.dye0.t });
    gl.uniform2f(P.dyeAdvect.u.uTh, 0.02, 0.22);
    gl.uniform1f(P.dyeAdvect.u.uFollow, 0.6);
    gl.uniform1f(P.dyeAdvect.u.uMem, motion.phase === 'ending' ? 0 : 0.02);
    run(S.dye.b); S.dye.swap();
  }
  function motionStep() {
    if (motion.phase === 'creation') {
      step();
      if (S.t >= S.score.steps) {
        // the painting as poured: the shape the living liquid remembers
        if (!S.h0) S.h0 = target(S.w, S.h, gl.RGBA32F, gl.NEAREST);
        if (!S.hist0) S.hist0 = target(S.w, S.h, gl.RGBA16F, gl.NEAREST);
        bind(P.scale, { uT: S.hgt.a.t }); gl.uniform1f(P.scale.u.uK, 1); run(S.h0);
        bind(P.scale, { uT: S.hist.a.t }); gl.uniform1f(P.scale.u.uK, 1); run(S.hist0);
        motion.phase = 'living';
      }
    } else if (motion.phase === 'living') {
      S.mem = 0.003 * G.param('memory');             // ~5 s pull back toward the painting
      wind(); step(); motion.lt++;
      if (revealAmount() > 0) { if (!S.dyeReady) initDye(); if (S.dyeReady) advectDye(); }
      if (motion.lt >= motion.livingSteps()) motion.phase = 'ending';
    } else {
      wind(); step(); motion.et++;                       // it keeps moving while it is drunk
      if (!S.dyeReady) initDye(); if (S.dyeReady) advectDye();
      if (motion.et >= motion.endSteps()) restartMotion();
    }
  }
  function setMotion(on) {
    motion.on = !!on;
    if (motion.on) restartMotion();
    else { motion.phase = 'creation'; build(); finishSim(); }   // back to the painting itself
    dirty = true; updateCaption();
  }
  function setPlaying(p) { motion.playing = !!p; motion.last = performance.now(); updateCaption(); }
  function motionInfo() {
    const c = S ? S.score.steps : 0;
    const at = motion.phase === 'creation' ? S.t : motion.phase === 'living' ? c + motion.lt : c + motion.livingSteps() + motion.et;
    return { phase: motion.phase, seconds: at / 60, total: loopSeconds() };
  }
  // run the animation forward n steps (tests, and the recorder)
  function advance(n) { for (let i = 0; i < n; i++) motionStep(); dirty = true; }

  // Record one whole cycle (pour → living → absorbed) as WebM. It starts and ends on the empty
  // sheet, so it loops seamlessly. Frames are simulated at a fixed 60 steps per second of video,
  // so the content never depends on timing; MediaRecorder still stamps them in real time.
  async function recordLoop(longSide, fps) {
    if (motion.recording || exporting) return;
    if (!window.MediaRecorder || !canvas.captureStream) { say('This browser cannot record video.'); return; }
    longSide = longSide || 1080; fps = fps || 30;
    const wasOn = motion.on;
    motion.on = true; motion.recording = true;
    restartMotion();
    const sh = S.sheet, k = longSide / Math.max(sh.mm[0], sh.mm[1]);
    const W = Math.round(sh.mm[0] * k / 2) * 2, H = Math.round(sh.mm[1] * k / 2) * 2;
    const keep = [canvas.width, canvas.height];
    canvas.width = W; canvas.height = H;
    const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(function (t) { return MediaRecorder.isTypeSupported(t); });
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
    const chunks = [];
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(function (r) { rec.onstop = r; });
    rec.start();
    const per = Math.max(1, Math.round(60 / fps));
    const n = Math.ceil((S.score.steps + motion.livingSteps() + motion.endSteps()) / per);
    const tStart = performance.now();
    try {
      for (let i = 0; i < n; i++) {
        if (i > 0) for (let j = 0; j < per; j++) motionStep();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        setRenderUniforms(W, H, k, false);
        gl.uniform2f(P.render.u.uOrigin, 0, 0); gl.uniform1f(P.render.u.uTileH, H);
        gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (track.requestFrame) track.requestFrame();
        say('Recording — ' + motion.phase + ', ' + Math.round(100 * i / n) + '%');
        await new Promise(function (r) { setTimeout(r, 1000 / fps); });
      }
    } finally {
      rec.stop(); await done;
      motion.lag = (performance.now() - tStart) / (n * 1000 / fps);
      canvas.width = keep[0]; canvas.height = keep[1];
      motion.recording = false; motion.on = wasOn;
      restartMotion(); if (!wasOn) finishSim();
      dirty = true;
    }
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename('-cycle-' + G.param('gusts') + 'gusts.webm');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    window.__lastVideo = { width: W, height: H, frames: n, seconds: n / fps, bytes: blob.size, type: type, lag: motion.lag };
    say(motion.lag > 1.1
      ? 'Saved, but this machine drew frames ' + motion.lag.toFixed(1) + '× slower than real time, so the video runs slow. Record at a smaller size.'
      : 'Saved cycle — ' + W + '×' + H + ', ' + (n / fps).toFixed(1) + ' s, ' + (blob.size / 1048576).toFixed(1) + ' MB');
    setTimeout(function () { say(''); }, motion.lag > 1.1 ? 9000 : 4000);
  }

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
      Software: 'Poured Ground (projects/060-poured-ground), WebGL2' + (S.brief && S.brief.k === 2 ? ' + painting reader ' + S.brief.read.reader : '') + ', engine v' + S.engine + (S.engine === 3 ? ' (v2 + vorticity confinement, MacCormack advection, wall memory)' : S.engine === 2 ? ' (multigrid pressure, conservative transport)' : ' (original)'),
      Source: 'Palette: ' + paletteCredit(p) + ' - ' + p.artist + ', ' + p.painting + ' [' + p.colors.join(' ') + ']',
      Description: (S.brief ? 'Starting point: ' + S.brief.note + ' (' + basisText(S.brief) + '). Interpretation ' + S.score.interp.toFixed(2) + (S.score.readings.length ? ': ' + S.score.readings.join('; ') : ': close to the starting layout') + '. ' + (S.brief.k === 2 ? 'The work\'s image was measured by the painting reader (tools/painting-reader, ' + S.brief.read.reader + ', ' + S.brief.read.read_on + '; image SHA-256 ' + S.brief.read.sha256 + ', ' + S.brief.read.source + '): ' + S.brief.read.fields + ' fields, ' + S.brief.read.configurations.length + ' configurations; the five colours are its clusters. Nothing is traced: the masses are laid where they were measured and the configurations become the hand\'s gestures. ' : 'No image of the work is used; only its five colorlisa colours and a description of its layout. ') : p.archive && G.param('mode') !== 1 ? 'Composed from the work\'s palette (' + (S.readingMissing ? 'the painting reader has not read this work yet; ' : '') + 'Colorist Archive works have no layout brief). ' : 'Free gestures. ') +
        'Ground ' + S.colours.ground + '; pigments ' + S.colours.pigments.join(' ') + '. Sheet ' + S.sheet.name +
        (S.sheet.landscape ? ' landscape' : ' portrait') + ', image ' + S.sheet.imageMM[0].toFixed(0) + '×' + S.sheet.imageMM[1].toFixed(0) + ' mm' + (S.sheet.imgAspect ? ' in the proportions of the original (' + S.sheet.imgAspect.toFixed(3) + ' : 1, size from ' + (S.palette.aspectSource || 'Wikidata') + ')' : '') + ', borders ' + S.sheet.bx.toFixed(1) + '/' + S.sheet.by.toFixed(1) + ' mm, ' + W + '×' + H + ' px at ' + dpi + ' dpi, ' + bits + '-bit sRGB.' +
        (G.param('label') === 1 ? ' Label: "' + S.palette.painting + '", ' + S.palette.artist + ' (Cedarville Cursive, ' + (G.param('labelPos') === 1 ? 'border' : 'image') + ').' : ' No label.') +
        (motion.on && S.dyeReady ? (sourceFor(S.palette.id).kind === 'original'
          ? ' The original rises in the paper: ' + S.palette.painting + ' (' + sourceFor(S.palette.id).meta.work_year + '), ' + S.palette.artist + ', public domain, image: ' + sourceFor(S.palette.id).meta.source + ', ' + sourceFor(S.palette.id).meta.source_url + ' (' + sourceFor(S.palette.id).meta.license + ').'
          : ' Its composition map rises in the paper (the work is in copyright: no image of it is used).') : '') +
        (motion.on ? ' An instant of the animated version: ' + motionInfo().phase + ', ' + motionInfo().seconds.toFixed(2) + ' s into a ' + loopSeconds().toFixed(2) + ' s cycle (living ' + G.param('gusts') + ' gusts of 048 Plotted Field\'s wind).' : '') +
        (handTouched ? ' Hand-touched: contains marks made by pointer, not reproducible from the URL.' : ' Reproducible from the URL below.'),
      Comment: location.href,
    };
  }

  async function exportImage(dpi, bits, label) {
    if (exporting) return;
    exporting = true;
    try {
      await fontReady;
      if (!motion.on) finishSim();                 // animated: export this very instant
      const sh = sheetFor(dpi);
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
    const sh = sheetFor(1);
    const dpi = Math.max(20, Math.round(2400 / (Math.max(sh.mm[0], sh.mm[1]) / 25.4)));
    return exportImage(dpi, 8, 'Preview');
  }
  window.saveCanvas = function () { exportPreview(); }; // the harness's "Save PNG" button

  // ---------------------------------------------------------------- caption
  const cap = document.getElementById('caption');
  function swatch(hex) { return '<i style="background:' + hex + '" title="' + hex + '"></i>'; }
  function viewLink(p) {
    if (!p) return null;
    if (!p.archive) return (window.WORK_LINKS || {})[p.id] || null;
    const q = encodeURIComponent(p.artist + ' ' + p.painting + ' painting').replace(/%20/g, '+');
    return { url: p.link || ('https://www.google.com/search?tbm=isch&q=' + q), site: (p.link || '').replace(/^https?:\/\/(www\.)?([^/]+).*$/, '$2') || 'image search',
             search: 'https://www.google.com/search?tbm=isch&q=' + q, note: 'Colorist Archive source page' };
  }
  // where the palette comes from: colorlisa's 133 works or the Colorist Archive
  function paletteCredit(p) { return p.reading ? 'measured by the painting reader from the image held by ' + p.reading.source : p.archive ? 'Colorist Archive, meditationsincolor.com' : 'colorlisa.com'; }
  // the basis of a brief: k 1 documented, 0 inferred, 2 read from the image by the painting reader
  function basisText(b) {
    return b.k === 2 ? 'layout read from the museum image by the painting reader: measurements only, value masses, colour islands and detail, no subject identification'
      : b.k ? 'layout follows the documented composition' : 'layout inferred from the title and the artist\'s typical structure';
  }
  function updateCaption() {
    // nothing to describe while an archive work is still loading; build() calls this again
    if (!S) return;
    window.dispatchEvent(new CustomEvent('pouredground:update'));
    if (!cap) return;
    const p = S.palette, c = S.colours;
    const sh = sheetFor(G.param('dpi'));
    cap.innerHTML =
      '<b>Poured Ground</b>' + (S.brief ? ' — <em>' + after() + '</em>' : '') + ' · seed ' + G.seed + '<br>' +
      (S.brief ? '<span class="src">' + (S.brief.k === 2 ? 'read from the image · ' : '') + (S.score.readings.length ? S.score.readings.join(' · ') : 'close to the work') + '</span><br>' : S.readingMissing ? '<span class="src">no reading of this work yet · composed from its palette</span><br>' : '') +
      (viewLink(S.palette) ? '<a class="view" target="_blank" rel="noopener" href="' + viewLink(S.palette).url + '">view the painting ↗</a> <span class="src">' + viewLink(S.palette).site + '</span> · <a class="view" target="_blank" rel="noopener" href="' + viewLink(S.palette).search + '">image search ↗</a><br>' : '') +
      'palette: ' + p.artist + ', <em>' + p.painting + '</em> <span class="src">(' + paletteCredit(p) + ')</span><br>' +
      '<span class="sw">ground ' + swatch(c.ground) + ' paint ' + c.pigments.map(function (h, i) { return '<span class="pig' + (i === pigment ? ' on' : '') + '">' + (i + 1) + swatch(h) + '</span>'; }).join('') + '</span><br>' +
      '<span class="src">print ' + sh.name + ' · ' + sh.px[0] + '×' + sh.px[1] + ' px @ ' + G.param('dpi') + ' dpi · ' + G.param('bits') + '-bit · sim ' + S.w + '×' + S.h + '</span>';
  }

  // ---------------------------------------------------------------- pointer
  let last = null;
  function toUV(e) {
    const box = canvas.getBoundingClientRect(), dpr = canvas.width / box.width, sh = S.sheet;
    const sx = ((e.clientX - box.left) * dpr - view.x) / view.w, sy = ((e.clientY - box.top) * dpr - view.y) / view.h;
    const b0 = sh.bx / sh.mm[0], b1 = sh.by / sh.mm[1];
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
    else if (k === 'm') setMotion(!motion.on);
    else if (k === 'o') setOriginalView(!origView);
    else if (k === ' ' && motion.on) { e.preventDefault(); setPlaying(!motion.playing); }
    else if (k === 'backspace' && motion.on) { e.preventDefault(); restartMotion(); }
    else if (k.length === 1 && '1234'.indexOf(k) >= 0) { pigment = +k - 1; updateCaption(); }
  });
  function generate() {
    G.shuffle(function (key) {
      // a new composition; the print setup (format, border, dpi, bits) and quality settings stay
      if (['engine', 'body', 'format', 'landscape', 'border', 'dpi', 'bits', 'simres', 'iterations', 'speed'].indexOf(key) >= 0) return G.param(key);
      if (key === 'palette') return -1;
      if (key === 'collection') return G.param('collection');
      if (key === 'mode') return G.param('mode');
      if (key === 'interp') return G.param('interp');
      if (key === 'flow') return 0.97 + Math.random() * 0.025;
      return undefined;
    });
  }

  // ---------------------------------------------------------------- harness
  const SIM_KEYS = ['engine', 'body', 'handling', 'reserve', 'mode', 'interp', 'proportions', 'collection', 'palette', 'ground', 'style', 'pours', 'energy', 'flow', 'levelling', 'iterations', 'simres', 'format', 'landscape', 'border'];
  G = GenArt.create({
    title: 'Poured Ground',
    resetOnFinish: true,
    closedGroups: ['simulation', 'surface'],
    params: {
      // default 2: from the reading where the painting reader has read the work's image, else the
      // work's brief (colorlisa) or palette (archive), exactly as 'after the work' would
      mode: { value: 2, options: { 'from the reading': 2, 'after the work': 0, 'free gestures': 1 }, label: 'composition', group: 'colour' },
      interp: { value: 0.65, min: 0, max: 1, step: 0.05, label: 'interpretation', group: 'colour' },
      collection: { value: 2, options: { 'colorlisa + Colorist Archive': 2, colorlisa: 0, 'Colorist Archive': 1 }, label: 'collection', group: 'colour' },
      palette: { value: -1, options: PAL_OPTIONS, label: 'palette', group: 'colour' },
      ground: { value: 0, options: { 'lightest colour': 0, 'darkest colour': 1, 'paper white': 2 }, label: 'ground', group: 'colour' },
      style: { value: 4, options: PG.STYLES, label: 'gesture', group: 'composition' },
      film: { value: 0, options: { 'the masstone blended over the ground (prints before Nov 2026)': 0, 'a film of its own thickness over the paper': 1 }, label: 'film over the paper', group: 'surface' },
      mixing: { value: 0, options: { 'single constant (prints before Nov 2026)': 0, 'impurity index: each pigment scatters on its own': 1 }, label: 'pigment mixing', group: 'surface' },
      reserve: { value: 0, options: { 'the hand crosses every interval': 0, 'the hand keeps out of the intervals the reading found': 1 }, label: 'intervals', group: 'composition' },
      handling: { value: 1, options: { 'layered · the hand works between the pours, strokes travel less': 1, 'sweeping · one pour, then every gesture at full reach (prints before Nov 2026)': 0 }, label: 'handling', group: 'composition' },
      pours: { value: 12, min: 2, max: 24, step: 1, label: 'pours', group: 'composition' },
      energy: { value: 1, min: 0.4, max: 2, step: 0.05, label: 'hand speed', group: 'composition' },
      flow: { value: 0.985, min: 0.9, max: 0.998, step: 0.001, label: 'flow (momentum)', group: 'simulation' },
      levelling: { value: 0.03, min: 0, max: 0.2, step: 0.005, label: 'levelling', group: 'simulation' },
      engine: { value: 3, options: { 'v3 · v2 with eddies kept': 3, 'v2 · same at every resolution, conserves paint': 2, 'v1 · original (prints before Nov 2026)': 1 }, label: 'engine', group: 'simulation' },
      iterations: { value: 30, min: 8, max: 80, step: 1, label: 'pressure iterations (v1)', group: 'simulation' },
      simres: { value: 1024, options: { '512': 512, '768': 768, '1024': 1024, '1536': 1536, '2048': 2048 }, label: 'sim long side', group: 'simulation' },
      speed: { value: 4, min: 1, max: 24, step: 1, label: 'steps / frame', group: 'simulation' },
      gusts: { value: 6, min: 2, max: 24, step: 1, label: 'living (gusts of 5.03 s)', group: 'motion' },
      original: { value: 1, options: { 'rises before the absorption': 1, off: 0 }, label: 'original in motion', group: 'motion' },
      wind: { value: 1, min: 0.3, max: 2.5, step: 0.05, label: 'wind', group: 'motion' },
      memory: { value: 1, min: 0, max: 3, step: 0.05, label: 'memory of the painting', group: 'motion' },
      label: { value: 1, options: { 'work and artist': 1, off: 0 }, label: 'label', group: 'label' },
      labelPos: { value: 1, options: { 'on the image': 0, 'in the border': 1 }, label: 'label position', group: 'label' },
      labelSize: { value: 1, min: 0.5, max: 2.5, step: 0.05, label: 'label size', group: 'label' },
      relief: { value: 0.22, min: 0, max: 0.8, step: 0.01, label: 'relief', group: 'surface' },
      gloss: { value: 0.25, min: 0, max: 1, step: 0.01, label: 'gloss', group: 'surface' },
      body: { value: 1, options: { 'paint body': 1, 'flat (prints before Nov 2026)': 0 }, label: 'paint body', group: 'surface' },
      tooth: { value: 0.035, min: 0, max: 0.15, step: 0.005, label: 'paper tooth', group: 'surface' },
      trace: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'memory of the pour', group: 'surface' },
      format: { value: 5, options: FMT_OPTIONS, label: 'format', group: 'print' },
      landscape: { value: 2, options: { 'as the original': 2, portrait: 0, landscape: 1 }, label: 'orientation', group: 'print' },
      proportions: { value: 1, options: { 'as the original': 1, 'fill the format': 0 }, label: 'proportions', group: 'print' },
      border: { value: 40, min: 0, max: 120, step: 1, label: 'border (mm)', group: 'print' },
      dpi: { value: 300, options: { '150': 150, '200': 200, '240': 240, '300': 300, '360': 360 }, label: 'dpi', group: 'print' },
      bits: { value: 16, options: { '16-bit': 16, '8-bit': 8 }, label: 'bit depth', group: 'print' },
    },
    onReset: function () {
      const key = G.seed + '|' + SIM_KEYS.map(function (k) { return G.param(k); }).join('|');
      if (key !== simKey) { simKey = key; if (motion.on) restartMotion(); else build(); }
      else { updateCaption(); dirty = true; }
    },
  });
  if (G.gui) {
    G.gui.add({ g: generate }, 'g').name('✨ Generate (G)');
    G.gui.add({ p: exportPrint }, 'p').name('🖨 Export print PNG (P)');
    G.gui.add({ f: function () { finishSim(); } }, 'f').name('⏭ Finish pour');
    G.gui.add({ m: function () { setMotion(!motion.on); } }, 'm').name('〰 Motion on/off (M)');
    G.gui.add({ o: function () { if (!setOriginalView(!origView) && !canShowOriginal()) say('No original to show: the work is in copyright (or not yet sourced). Its composition map is used instead.'), setTimeout(function () { say(''); }, 3500); } }, 'o').name('🖼 Show the original (O)');
    G.gui.add({ v: function () { recordLoop(1080, 30); } }, 'v').name('🎞 Record cycle (WebM)');
  }
  window.PouredGroundApp = {
    G: G, finish: finishSim, exportPrint: exportPrint, exportPreview: exportPreview, exportImage: exportImage, generate: generate,
    state: function () { return S; },
    sheet: function (dpi) { return sheetFor(dpi); },
    archive: { index: function () { return loadArchiveIndex(); }, artist: function (id) { return loadArtist(id); }, BASE: ARCHIVE_BASE },
    viewLink: function () { return S ? viewLink(S.palette) : null; },
    volume: volume, engine: function () { return S ? S.engine : null; },
    reading: function () { return S && S.brief && S.brief.k === 2 ? S.brief.read : null; }, readings: { load: loadArchiveReadings, of: readingFor },
    motion: motion, setMotion: setMotion, setPlaying: setPlaying, restartMotion: restartMotion, advance: advance, motionInfo: motionInfo, recordLoop: recordLoop, loopSeconds: loopSeconds,
    after: function () { return S ? after() : null; },
    source: function () { return S ? sourceFor(S.palette.id) : null; }, revealAmount: function () { return revealAmount(); },
    canShowOriginal: function () { return canShowOriginal(); }, setOriginalView: setOriginalView, originalView: function () { return origView; },
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
  if (new URLSearchParams(location.search).get('motion') === '1') setMotion(true);
  requestAnimationFrame(frame);
})();
