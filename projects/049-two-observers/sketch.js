// Two Observers — a marbling bath in one bit, seen by two observers.
// The score (marble.js) is a seeded list of exact marbling maps. Each frame pulls every pixel
// back through the maps that have started, on the GPU, and asks the material's observer whether
// the pixel is ink or paper. Two observers come from physical work: Soto (a fixed striped panel
// behind ink that carries its own lines; the pointer moves the panel) and Mellan (one spiral line
// per drop, width as tone; V exports it for a pen plotter). The screens carried by the ink are
// painted by hand, after Polke: dots wander, swell, go missing or blot; lines waver and break.
// A wire field from a line etching is part of the ground: taut lines, hanging strokes, plate tone.
// Keys: Space pause · ←/→ scrub (Shift ×5) · N/B next/previous bath · O score overlay
// · P print (PNG) · V plotter layer (SVG) · J score (JSON) · S sheet PNG · R new seed.

(function () {
  'use strict';
  const M = window.Marble;
  const PAPER = [0.937, 0.929, 0.902], INK = [0.078, 0.078, 0.078];
  const PAPER_CSS = '#efede6', INK_CSS = '#141414', ACCENT = '#d9412f';

  const view = document.getElementById('view');
  const ctx = view.getContext('2d');
  const glc = document.createElement('canvas');
  const gl = glc.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });

  const url = new URL(location.href);
  let bath = Math.max(0, parseInt(url.searchParams.get('bath') || '0', 10) || 0);
  let t = Math.max(0, parseFloat(url.searchParams.get('t') || '0') || 0);
  let paused = url.searchParams.get('pause') === '1';
  let overlay = url.searchParams.get('overlay') === '1';
  let parallax = parseFloat(url.searchParams.get('par') || '0') || 0, parallaxTarget = parallax;
  let S = null, gw = 0, gh = 0, cell = 2, layout = null;
  let dirty = true, last = performance.now();
  let wipe = null;               // { from: canvas, start } — the last print sliding away

  const G = GenArt.create({
    title: 'Two Observers',
    params: {
      cell: { value: 2, min: 1, max: 4, step: 1, label: 'cell (px)' },
      speed: { value: 1, min: 0.25, max: 4, step: 0.25, label: 'speed' },
      lagrange: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'lagrangian share' },
      density: { value: 1, min: 0.5, max: 1.5, step: 0.1, label: 'gesture density' },
      resolve: { value: 2.5, min: 1, max: 6, step: 0.25, label: 'resolvable period (px)' },
      soto: { value: 0.7, min: 0, max: 1, step: 0.05, label: 'soto chance' },
      mellan: { value: 0.8, min: 0, max: 1, step: 0.05, label: 'mellan chance' },
      panel: { value: 4, min: 3, max: 10, step: 1, label: 'soto panel (cells)' },
      hand: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'hand (polke)' },
      wires: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'wire field chance' },
    },
    onReset: function () { if (!S) return; newScore(); doLayout(); },
  });
  window.saveCanvas = function (name) { download(view, (name || 'two-observers') + '.png'); };

  // ------------------------------------------------------------------ GPU
  const VS = `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision highp float; precision highp int;
  #define MAX_OPS ${M.MAX_OPS}
  uniform sampler2D uOps, uBlue;
  uniform int uNOps, uNWin, uBg;
  uniform float uT, uResolve, uPanel, uParallax;
  uniform vec2 uGrid;
  uniform vec4 uMat[${M.MAX_MATS * 3}];
  uniform uint uSalt[${M.MAX_MATS}];
  uniform vec4 uWin[${M.MAX_WINS * 2}];
  uniform vec3 uPaper, uInk;
  out vec4 outColor;

  uint h32(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
  float hv(int i, int j, uint salt){
    return float(h32((uint(i + 4096) * 0x8da6b343u) ^ (uint(j + 4096) * 0xd8163841u) ^ salt)) / 4294967296.0;
  }
  float vnoise(vec2 p, uint salt){
    vec2 f = p - floor(p); ivec2 i = ivec2(floor(p));
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hv(i.x, i.y, salt), b = hv(i.x + 1, i.y, salt), c = hv(i.x, i.y + 1, salt), d = hv(i.x + 1, i.y + 1, salt);
    return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  }
  float fbm(vec2 p){ return 0.55 * vnoise(p, 17u) + 0.3 * vnoise(p * 2.03, 71u) + 0.15 * vnoise(p * 4.1, 131u); }
  float bayer8(int x, int y){
    int v = 0;
    for (int i = 0; i < 3; i++){ int bx = (x >> i) & 1, by = (y >> i) & 1; v |= (((bx ^ by) << 1) | by) << (2 * (2 - i)); }
    return (float(v) + 0.5) / 64.0;
  }
  uint cellH(int cx, int cy, uint salt);
  float u01(uint h, uint n);
  bool wiresInk(int m, vec2 q, float k);
  float tone(int m, vec2 q, float rad, float k){
    vec4 A = uMat[3 * m];
    int pat = int(A.x); float c = cos(A.w), s = sin(A.w);
    float u = q.x * c + q.y * s, v = -q.x * s + q.y * c;
    float param = uMat[3 * m + 1].w;
    if (pat == 0) return A.y;
    if (pat == 1) return fract(u * A.z) < param ? 1.0 : 0.0;
    if (pat == 2){ float w = fract(u * A.z + param * sin(v * A.z * 0.9 + 1.7)); return w < 0.07 ? 1.0 : (w < 0.13 ? 0.0 : A.y); }
    if (pat == 3){
      vec2 g = vec2(u, v) * A.z; vec2 cc = floor(g); vec2 f = g - cc - 0.5;
      int odd = (int(cc.x) + int(cc.y)) & 1;
      if (abs(f.x) + abs(f.y) < 0.15) return odd == 1 ? 0.0 : 1.0;
      float blob = exp(-dot(f, f) / 0.05);
      return clamp(A.y + (odd == 1 ? -0.3 : 0.45) * blob, 0.0, 1.0);
    }
    if (pat == 4){
      float nv = fbm(q * A.z);
      float g = clamp(0.5 + 1.9 * (nv - 0.5), 0.0, 1.0);
      if (param > 0.0){ float k = fract(nv * param); if (k < 0.1) return 0.0; if (k < 0.16) return 1.0; }
      return g;
    }
    if (pat == 5){ float w = fract(length(q) * A.z); return w < 0.18 ? 0.0 : (w < 0.3 ? 1.0 : A.y); }
    if (pat == 7) return wiresInk(m, q, k) ? 0.0 : A.y;
    if (pat == 6){
      vec2 n = q / max(rad > 0.0 ? rad : 0.05, 1e-4);
      float nz = sqrt(max(0.0, 1.0 - dot(n, n)));
      float lit = dot(vec3(n, nz), vec3(cos(A.w) * 0.62, sin(A.w) * 0.62, 0.78));
      return min(1.0, 0.04 + 0.96 * max(0.0, lit));
    }
    return 0.5;
  }
  float blueAt(int x, int y){ return texelFetch(uBlue, ivec2(x & 63, y & 63), 0).r; }
  float threshold(int m, int x, int y, vec2 q, float k){
    vec4 B = uMat[3 * m + 1];
    int scr = int(B.x);
    if (scr == 5){
      if (1.0 / (B.y * max(k, 1e-9)) >= uResolve){
        float u = length(q) * B.y - atan(q.y, q.x) / 6.283185307;
        return 0.5 - 0.5 * cos(6.283185307 * u);
      }
      return blueAt(x, y);
    }
    if (scr >= 2){
      float period = 1.0 / (B.y * max(k, 1e-9));
      if (period >= uResolve){
        float c = cos(B.z), s = sin(B.z);
        vec2 uv = vec2(q.x * c + q.y * s, -q.x * s + q.y * c) * B.y;
        if (scr == 2) return 0.5 - 0.25 * (cos(6.283185307 * uv.x) + cos(6.283185307 * uv.y));
        return 0.5 - 0.5 * cos(6.283185307 * uv.y);
      }
      return blueAt(x, y);
    }
    if (scr == 1) return blueAt(x, y);
    return bayer8(x & 7, y & 7);
  }

  // Polke's hand: per-cell values of an ink's painted screen
  uint cellH(int cx, int cy, uint salt){ return h32((uint(cx + 4096) * 0x8da6b343u) ^ (uint(cy + 4096) * 0xd8163841u) ^ salt); }
  float u01(uint h, uint n){ return float(h32(h ^ (n * 0x9e3779b9u))) / 4294967296.0; }
  // The wire field (pattern 7): wire j and the stroke in slot s, from hashes of the ink's salt.
  bool wiresInk(int m, vec2 q, float k){
    vec4 A = uMat[3 * m], C = uMat[3 * m + 2]; uint salt = uSalt[m];
    float wt = max(0.0011, 0.55 * k), sw = max(0.0008, 0.42 * k), param = uMat[3 * m + 1].w;
    int K = min(${M.MAX_WIRES}, int(A.z));
    for (int j = 0; j < ${M.MAX_WIRES}; j++){
      if (j >= K) break;
      uint base = salt ^ (uint(j + 1) * 0x632be5abu);
      float rho = u01(base, 1u);
      bool bare = rho > 0.74;
      float y0 = C.z - C.w * 1.02 + rho * 2.04 * C.w;
      float slope = (u01(base, 2u) - 0.5) * (bare ? 0.26 : 0.06);
      float off = u01(base, 3u) * ${M.WIRE_SLOT};
      float dy = q.y - (y0 + slope * (q.x - C.y));
      if (abs(dy) < wt) return true;
      if (bare || dy < -0.06 || dy > 0.065) continue;
      float env = exp(-pow((rho - 0.36) / 0.24, 2.0));
      uint wsalt = h32(salt ^ (uint(j + 1) * 0x1b873593u));
      int s0 = int(floor((q.x + off) / ${M.WIRE_SLOT}));
      for (int ds = -1; ds <= 1; ds++){
        int s = s0 + ds;
        uint hh = h32(wsalt ^ (uint(s + 65536) * 0x85ebca6bu));
        float cluster = 0.35 + 1.3 * vnoise(vec2(float(s) * 0.045, 0.5), wsalt);
        if (u01(hh, 1u) >= param * env * cluster) continue;
        float down = 0.004 + 0.055 * pow(u01(hh, 2u), 3.0);
        float u4 = u01(hh, 4u);
        float up = (rho < 0.16 && u01(hh, 3u) < 0.35) ? 0.006 + 0.045 * u4 * u4 : 0.0015 + 0.004 * u4;
        float xs = (float(s) + 0.5) * ${M.WIRE_SLOT} - off + (u01(hh, 5u) - 0.5) * 0.4 * ${M.WIRE_SLOT};
        if (abs(q.x - xs) < sw && dy > -up && dy < down) return true;
      }
    }
    return false;
  }
  bool handDots(int m, vec2 q, float g){
    vec4 B = uMat[3 * m + 1]; float H = uMat[3 * m + 2].x; uint salt = uSalt[m];
    float c = cos(B.z), s = sin(B.z);
    float u = (q.x * c + q.y * s) * B.y, v = (-q.x * s + q.y * c) * B.y;
    int bx = int(floor(u)), by = int(floor(v));
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++){
      int cx = bx + dx, cy = by + dy;
      uint h = cellH(cx, cy, salt);
      float h0 = u01(h, 1u), h1 = u01(h, 2u), h2 = u01(h, 3u), h3 = u01(h, 4u), h4 = u01(h, 5u), h5 = u01(h, 6u);
      if (h3 > 1.0 - 0.05 * H) continue;
      float size = 1.0 + 0.6 * H * (h2 - 0.5);
      if (h3 < 0.015 * H) size *= 1.9;
      float r2 = (1.0 - g) / 3.141592654 * size * size;
      if (r2 <= 0.0) continue;
      float ex = u - (float(cx) + 0.5 + 0.32 * H * (h0 - 0.5));
      float ey = v - (float(cy) + 0.5 + 0.32 * H * (h1 - 0.5));
      float e = 0.45 * H * (h4 - 0.5);
      ex *= 1.0 + e; ey *= 1.0 - e;
      float wob = 1.0 + 0.14 * H * sin(3.0 * atan(ey, ex) + 6.283185307 * h5);
      if ((ex * ex + ey * ey) * wob * wob < r2) return true;
    }
    return false;
  }
  bool handLines(int m, vec2 q, float g){
    vec4 B = uMat[3 * m + 1]; float H = uMat[3 * m + 2].x; uint salt = uSalt[m];
    float c = cos(B.z), s = sin(B.z);
    float u = (q.x * c + q.y * s) * B.y, v = (-q.x * s + q.y * c) * B.y;
    int b = int(floor(v));
    for (int dl = -1; dl <= 1; dl++){
      int L = b + dl;
      uint sl = salt ^ (uint(L + 4096) * 0x27d4eb2du);
      float wob = 0.42 * H * (vnoise(vec2(u * 0.18, 0.5), sl) - 0.5);
      float width = 1.0 + 0.7 * H * (vnoise(vec2(u * 0.5, 7.5), sl) - 0.5);
      if (vnoise(vec2(u * 0.09, 13.5), sl) < 0.22 * H) continue;
      if (abs(v - (float(L) + 0.5 + wob)) < 0.5 * (1.0 - g) * width) return true;
    }
    return false;
  }

  // Soto: the fixed panel (period uPanel cells, moved by the viewer) or the ink's own lines.
  float sotoBit(int m, int ix, vec2 q, float k){
    vec4 A = uMat[3 * m], B = uMat[3 * m + 1];
    bool panelInk = fract((float(ix) + uParallax) / uPanel) < 0.5;
    float fL = B.y * uGrid.x / (uPanel * ${M.PLATE_W.toFixed(4)});
    bool lineInk = false;
    if (1.0 / (fL * max(k, 1e-9)) >= uResolve){
      float u = (q.x * cos(B.z) + q.y * sin(B.z)) * fL;
      lineInk = fract(u) < 0.3 + 0.35 * (1.0 - A.y);
    }
    return (panelInk || lineInk) ? 0.0 : 1.0;
  }

  void main(){
    int ix = int(gl_FragCoord.x), iy = int(uGrid.y) - 1 - int(gl_FragCoord.y);
    vec2 p = vec2(((float(ix) + 0.5) / uGrid.x - 0.5) * ${M.PLATE_W.toFixed(4)}, ((float(iy) + 0.5) / uGrid.y - 0.5) * ${M.PLATE_H.toFixed(4)});
    int mat = -1; vec2 q = p; float hitR = 0.0;
    for (int k = MAX_OPS - 1; k >= 0; --k){
      if (k >= uNOps || mat >= 0) continue;
      vec4 v0 = texelFetch(uOps, ivec2(0, k), 0);
      if (uT < v0.y) continue;
      vec4 a = texelFetch(uOps, ivec2(1, k), 0), b = texelFetch(uOps, ivec2(2, k), 0);
      float s = clamp((uT - v0.y) / v0.z, 0.0, 1.0); s = s * s * (3.0 - 2.0 * s);
      int type = int(v0.x);
      if (type == 1){
        vec2 v = q - a.xy; float L2 = dot(v, v), rr2 = a.z * a.z * s;
        if (L2 < rr2){ mat = int(v0.w); q = v / sqrt(max(s, 1e-4)); hitR = a.z; }
        else q = a.xy + v * sqrt(1.0 - rr2 / L2);
      } else if (type == 2){
        vec2 M = a.zw, N = vec2(-M.y, M.x);
        float d = dot(q - a.xy, N), half_ = (b.z - 1.0) * 0.5;
        float i = clamp(floor(d / b.w + half_ + 0.5), 0.0, b.z - 1.0);
        float dn = abs(d - (i - half_) * b.w);
        q -= (b.x * s * b.y / (dn + b.y)) * M;
      } else if (type == 3){
        vec2 M = a.xy, N = vec2(-M.y, M.x);
        float u = dot(q - b.yz, M);
        q -= (a.z * s * sin(a.w * u + b.x)) * N;
      } else if (type == 4){
        vec2 v = q - a.xy; float r = length(v);
        float th = -(a.w * s * b.x / (abs(r - a.z) + b.x)) / max(r, 1e-4);
        float c = cos(th), sn = sin(th);
        q = a.xy + vec2(v.x * c - v.y * sn, v.x * sn + v.y * c);
      }
    }
    if (mat < 0){
      mat = uBg;
      for (int i = 0; i < ${M.MAX_WINS}; i++){
        if (i >= uNWin) continue;
        vec4 w0 = uWin[2 * i], w1 = uWin[2 * i + 1];
        float c = cos(-w1.x), sn = sin(-w1.x);
        vec2 d = q - w0.xy; vec2 u = vec2(d.x * c - d.y * sn, d.x * sn + d.y * c);
        if (abs(u.x) < w0.z && abs(u.y) < w0.w) mat = int(w1.y);
      }
    }
    // material units per pixel, measured in uniform control flow
    float k = max(length(dFdx(q)), length(dFdy(q)));
    bool paper;
    vec4 B = uMat[3 * mat + 1];
    int scr = int(B.x); float hnd = uMat[3 * mat + 2].x;
    if (scr == 4) paper = sotoBit(mat, ix, q, k) > 0.5;
    else {
      float g = tone(mat, q, hitR, k);
      if (hnd > 0.0 && (scr == 2 || scr == 3) && 1.0 / (B.y * max(k, 1e-9)) >= uResolve)
        paper = !(scr == 2 ? handDots(mat, q, g) : handLines(mat, q, g));
      else paper = g > threshold(mat, ix, iy, q, k);
    }
    outColor = vec4(paper ? uPaper : uInk, 1.0);
  }`;

  let prog = null, U = {}, texOps = null, texBlue = null;
  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function initGL() {
    if (!gl) return false;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.error('two-observers: shader failed, using the CPU path', e); return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uOps', 'uBlue', 'uNOps', 'uNWin', 'uBg', 'uT', 'uResolve', 'uPanel', 'uParallax', 'uGrid', 'uMat', 'uSalt', 'uWin', 'uPaper', 'uInk']) U[n] = gl.getUniformLocation(prog, n);
    texOps = gl.createTexture(); texBlue = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texBlue);
    setNearest();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 64, 64, 0, gl.RED, gl.FLOAT, M.blueNoise());
    gl.uniform1i(U.uOps, 0); gl.uniform1i(U.uBlue, 1);
    gl.uniform3fv(U.uPaper, PAPER); gl.uniform3fv(U.uInk, INK);
    return true;
  }
  function setNearest() {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function upload() {
    if (!prog) return;
    const P = M.pack(S);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOps);
    setNearest();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 3, M.MAX_OPS, 0, gl.RGBA, gl.FLOAT, P.ops);
    gl.uniform4fv(U.uMat, P.mats); gl.uniform4fv(U.uWin, P.wins); gl.uniform1uiv(U.uSalt, P.salts);
    gl.uniform1i(U.uNOps, P.nOps); gl.uniform1i(U.uNWin, P.nWins); gl.uniform1i(U.uBg, P.bg);
  }
  const useGPU = initGL();

  // CPU fallback: the same arithmetic in marble.js, painted with putImageData.
  const cpuCanvas = document.createElement('canvas');
  function renderCPU(time) {
    cpuCanvas.width = gw; cpuCanvas.height = gh;
    const c2 = cpuCanvas.getContext('2d');
    const bits = M.render(S, time, gw, gh, { resolve: G.param('resolve'), panel: G.param('panel'), parallax: parallax });
    const img = c2.createImageData(gw, gh);
    for (let i = 0; i < bits.length; i++) {
      const col = bits[i] ? PAPER : INK;
      img.data[i * 4] = col[0] * 255; img.data[i * 4 + 1] = col[1] * 255; img.data[i * 4 + 2] = col[2] * 255; img.data[i * 4 + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
  }
  function plateCanvas() { return useGPU ? glc : cpuCanvas; }

  function renderPlate(time) {
    if (!useGPU) { renderCPU(time); return; }
    gl.viewport(0, 0, gw, gh);
    gl.uniform1f(U.uT, time);
    gl.uniform1f(U.uResolve, G.param('resolve'));
    gl.uniform1f(U.uPanel, G.param('panel'));
    gl.uniform1f(U.uParallax, parallax);
    gl.uniform2f(U.uGrid, gw, gh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ------------------------------------------------------------------ score & layout
  function newScore() {
    S = M.score(G.seed, bath, { lagrange: G.param('lagrange'), density: G.param('density'), soto: G.param('soto'), mellan: G.param('mellan'), hand: G.param('hand'), wires: G.param('wires') });
    upload();
    syncURL();
  }
  function frameTime() { return Math.min(t, S.settle); }   // during the hold the print is still

  function doLayout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
    view.style.width = W + 'px'; view.style.height = H + 'px';
    cell = Math.max(1, Math.round(G.param('cell') * dpr));     // a cell is measured in css px
    // plate height in device px, leaving paper margins; grid and plate snap to whole cells
    const maxH = view.height * 0.84, maxW = view.width * 0.86;
    let ph = Math.min(maxH, maxW * M.PLATE_H / M.PLATE_W);
    gh = Math.max(2, Math.floor(ph / cell / 2) * 2);
    gw = Math.max(2, Math.round(gh * M.PLATE_W / M.PLATE_H));
    glc.width = gw; glc.height = gh;
    const pw = gw * cell, phh = gh * cell;
    const m = Math.round(phh * 0.05);
    const sw = pw + 2 * m, sh = phh + 2 * m + Math.round(phh * 0.05);
    layout = { dpr, pw, ph: phh, m, sw, sh, sx: Math.round((view.width - sw) / 2), sy: Math.round((view.height - sh) / 2) };
    dirty = true;
  }

  // ------------------------------------------------------------------ drawing the sheet
  function drawSheet(c, L, src, caption, annot) {
    c.fillStyle = '#1a1a1c'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.fillStyle = PAPER_CSS; c.fillRect(L.sx, L.sy, L.sw, L.sh);
    const px = L.sx + L.m, py = L.sy + L.m;
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, gw, gh, px, py, L.pw, L.ph);
    if (wipe && src !== wipe.from) {
      const u = Math.min(1, (performance.now() - wipe.start) / 1400);
      const e = u * u * (3 - 2 * u), edge = Math.round(L.ph * e);
      // the last print is drawn off the plate, top first, like paper peeled from the bath
      if (u < 1) { c.save(); c.beginPath(); c.rect(px, py + edge, L.pw, L.ph - edge); c.clip();
        c.drawImage(wipe.from, 0, 0, wipe.from.width, wipe.from.height, px, py, L.pw, L.ph); c.restore(); }
      else wipe = null;
    }
    const rule = Math.max(1, Math.round(L.ph / 900));
    const inset = Math.round(L.m * 0.45);
    c.strokeStyle = INK_CSS; c.lineWidth = rule;
    c.strokeRect(px - inset + rule / 2, py - inset + rule / 2, L.pw + 2 * inset - rule, L.ph + 2 * inset - rule);
    if (annot) annot(c, px, py, L);
    const fs = Math.max(9, Math.round(L.ph * 0.0145));
    c.fillStyle = INK_CSS; c.font = `${fs}px ui-monospace, Menlo, Consolas, monospace`;
    c.textBaseline = 'alphabetic';
    const by = py + L.ph + inset + Math.round(fs * 1.9);
    c.textAlign = 'left'; c.fillText(caption[0], px - inset, by);
    const room = L.pw + 2 * inset - c.measureText(caption[0]).width - fs * 2;
    const by2 = c.measureText(caption[1]).width > room ? by + Math.round(fs * 1.5) : by;   // wrap when they would touch
    c.textAlign = 'right'; c.fillText(caption[1], px + L.pw + inset, by2);
  }

  function counts(time) {
    let started = 0; for (const o of S.ops) if (time >= o.t0) started++;
    let lag = 0, eul = 0; for (const m of S.mats) { if (m.screen >= M.SCR.DOTS && m.screen <= M.SCR.LINES) lag++; else if (m.screen <= M.SCR.BLUE) eul++; }
    return { started, lag, eul };
  }
  function captionFor(time) {
    const c = counts(time);
    const printing = t >= S.settle;
    const extra = (S.sotoMat >= 0 ? '  ·  soto' + (Math.abs(parallax) > 0.05 ? ' ' + (parallax > 0 ? '+' : '') + parallax.toFixed(1) : '') : '') + (S.mellanMat >= 0 ? '  ·  mellan' : '') + (S.wiresMat >= 0 ? '  ·  wires' : '') + (S.hand > 0 ? '  ·  hand ' + S.hand.toFixed(2).replace(/0$/, '') : '');
    const left = `TWO OBSERVERS  —  seed ${G.seed}  ·  bath ${bath + 1}${extra}`;
    const right = printing
      ? `PRINT  ·  ${S.ops.length} gestures  ·  ${c.eul} eulerian / ${c.lag} lagrangian inks`
      : `t ${time.toFixed(1)} s  ·  gesture ${c.started}/${S.ops.length}  ·  ${c.eul} E / ${c.lag} L`;
    return [left, right];
  }

  // The score drawn over the plate: what the hands are doing now.
  function annotate(c, px, py, L) {
    const time = frameTime();
    const sx = L.pw / M.PLATE_W, sy = L.ph / M.PLATE_H;
    const X = (x) => px + (x / M.PLATE_W + 0.5) * L.pw, Y = (y) => py + (y / M.PLATE_H + 0.5) * L.ph;
    c.save(); c.beginPath(); c.rect(px, py, L.pw, L.ph); c.clip();
    c.strokeStyle = ACCENT; c.fillStyle = ACCENT; c.lineWidth = Math.max(1, L.ph / 700);
    for (const o of S.ops) {
      if (time < o.t0 || time > o.t0 + o.dur + 1.5) continue;
      const s = M.progress(o, time);
      c.globalAlpha = time > o.t0 + o.dur ? Math.max(0, 1 - (time - o.t0 - o.dur) / 1.5) : 1;
      const a = o.a, b = o.b;
      c.beginPath();
      if (o.type === M.OP.DROP) c.arc(X(a[0]), Y(a[1]), a[2] * Math.sqrt(s) * sx, 0, 6.2832);
      else if (o.type === M.OP.COMB) {
        const n = b[2], half = (n - 1) / 2, nx = -a[3], ny = a[2];
        for (let i = 0; i < n; i++) {
          const ox = a[0] + nx * (i - half) * b[3], oy = a[1] + ny * (i - half) * b[3];
          c.moveTo(X(ox - a[2] * 2), Y(oy - a[3] * 2)); c.lineTo(X(ox + a[2] * 2), Y(oy + a[3] * 2));
        }
      } else if (o.type === M.OP.WAVE) {
        const nx = -a[1], ny = a[0];
        for (let i = 0; i <= 120; i++) {
          const u = (i / 120 - 0.5) * 2, w = a[2] * s * Math.sin(a[3] * u + b[0]);
          const x = b[1] + a[0] * u + nx * w, y = b[2] + a[1] * u + ny * w;
          i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y));
        }
      } else if (o.type === M.OP.SWIRL) {
        c.arc(X(a[0]), Y(a[1]), Math.max(2, a[2] * sx), 0, 6.2832);
      }
      c.stroke();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ time
  function nextBath(d) {
    if (d > 0 && t >= S.settle) { const snap = document.createElement('canvas'); snap.width = gw; snap.height = gh; snap.getContext('2d').drawImage(plateCanvas(), 0, 0); wipe = { from: snap, start: performance.now() }; }
    bath = Math.max(0, bath + d); t = 0; newScore(); dirty = true;
  }
  function syncURL() {
    const u = new URL(location.href);
    u.searchParams.set('bath', String(bath));
    if (paused) u.searchParams.set('t', t.toFixed(2)); else u.searchParams.delete('t');
    if (paused) u.searchParams.set('pause', '1'); else u.searchParams.delete('pause');
    if (paused && Math.abs(parallax) > 0.05) u.searchParams.set('par', parallax.toFixed(2)); else u.searchParams.delete('par');
    try { history.replaceState(null, '', u.toString()); } catch (e) { /* sandboxed frames refuse */ }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (Math.abs(parallaxTarget - parallax) > 0.01) {          // the third observer moves
      parallax += (parallaxTarget - parallax) * Math.min(1, dt * 6);
      if (S.sotoMat >= 0) dirty = true;
      if (Math.abs(parallaxTarget - parallax) <= 0.01 && paused) syncURL();
    }
    if (!paused) {
      t += dt * G.param('speed');
      if (t >= S.length) nextBath(1);
      dirty = true;
    }
    if (dirty || wipe) {
      const time = frameTime();
      if (dirty) renderPlate(time);
      drawSheet(ctx, layout, plateCanvas(), captionFor(time), overlay ? annotate : null);
      dirty = false;
    }
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ exports
  function download(canvas, name) {
    canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
  }
  // A print is the screen's bits enlarged by a whole factor — no resampling, no new pixels.
  function savePrint() {
    renderPlate(frameTime());
    const k = Math.max(1, Math.round(4000 / gh));
    const ph = gh * k, pw = gw * k, m = Math.round(ph * 0.05);
    const c = document.createElement('canvas');
    c.width = pw + 2 * m; c.height = ph + 2 * m + Math.round(ph * 0.05);
    const L = { pw, ph, m, sw: c.width, sh: c.height, sx: 0, sy: 0 };
    const keep = wipe; wipe = null;
    drawSheet(c.getContext('2d'), L, plateCanvas(), captionFor(frameTime()), null);
    wipe = keep;
    download(c, `two-observers-${G.seed}-bath${bath + 1}-t${frameTime().toFixed(1)}.png`);
  }
  function savePlotter() {
    const time = frameTime();
    const r = M.plotter(S, time, {});
    if (!r.layers) { console.info('two-observers: nothing for the plotter at this moment'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
    a.download = `two-observers-${G.seed}-bath${bath + 1}-t${time.toFixed(1)}.plotter.svg`; a.click();
  }
  function saveScore() {
    const blob = new Blob([JSON.stringify(M.describe(S), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `two-observers-${G.seed}-bath${bath + 1}.score.json`; a.click();
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === ' ') { paused = !paused; syncURL(); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      const d = (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1);
      t = Math.max(0, Math.min(S.length - 0.01, t + d)); dirty = true; syncURL();
    }
    else if (k === 'n' || k === 'N') nextBath(1);
    else if (k === 'b' || k === 'B') nextBath(-1);
    else if (k === 'o' || k === 'O') { overlay = !overlay; dirty = true; }
    else if (k === 'p' || k === 'P') savePrint();
    else if (k === 'j' || k === 'J') saveScore();
    else if (k === 'v' || k === 'V') savePlotter();
    else if (k === 's' || k === 'S') download(view, `two-observers-${G.seed}-sheet.png`);
    else if (k === 'r' || k === 'R') { bath = 0; t = 0; G.randomize(); }
  });
  window.addEventListener('resize', () => { doLayout(); });
  // the viewer's position moves Soto's panel: one full panel period across the window
  window.addEventListener('pointermove', (e) => {
    if (e.target !== view) return;
    parallaxTarget = (e.clientX / window.innerWidth - 0.5) * G.param('panel');
  });

  if (G.gui) {
    const f = G.gui.addFolder('Bath');
    const act = {
      pause: () => { paused = !paused; syncURL(); },
      next: () => nextBath(1), print: savePrint, score: saveScore, plotter: savePlotter,
      overlay: () => { overlay = !overlay; dirty = true; },
    };
    f.add(act, 'pause').name('pause / play (space)');
    f.add(act, 'next').name('next bath (N)');
    f.add(act, 'overlay').name('score overlay (O)');
    f.add(act, 'print').name('save print (P)');
    f.add(act, 'plotter').name('plotter layer SVG (V)');
    f.add(act, 'score').name('save score (J)');
  }

  // test hook: render a given moment synchronously and expose the grid
  window.__twoObservers = {
    get score() { return S; }, get grid() { return [gw, gh]; }, gpu: useGPU,
    renderAt(time) { renderPlate(Math.min(time, S.settle)); return plateCanvas(); },
    setParallax(p) { parallax = parallaxTarget = p; dirty = true; },
    get parallax() { return parallax; },
  };

  newScore();
  doLayout();
  requestAnimationFrame((n) => { last = n; tick(n); });
})();
