// 040 — Ridge, encounters, shaded.
//
// 028's engine (parts.js + compose.js, loaded unchanged from its folder) decides everything
// about a seed: the place (invented, or one of the surveyed ranges), where the body stands and
// looks, the light, the register of the weather. 028 draws that with arithmetic on the CPU, in
// tone. Here the same land is handed to the GPU and lit: the heightfield, its smoothed form
// and its materials go up as textures, and one fragment shader (glsl.js) marches every pixel's
// ray over the land, shades what it meets with the sun and the sky, marches the cloud deck as a
// volume and adds the air. It runs live: the cloud drifts along 028's wind, the sun can be
// turned, and the body can look round and walk.

const UI = { status: 'loading the places…' };
let G = null;                // the panel (assets/genart.js)
let gl = null, prog = null, U = {}, TEX = {}, SC = null, VIEW = null;
let built = '', lastFrame = 0, scale = 0.6, moving = false, frames = 0, tStart = performance.now(), driftT = 0;
let lastChange = 0, needFull = true, pass = 0;   // a change redraws at the frame rate; once still, PASSES full-resolution frames averaged
const PASSES = 8;
function touch() { lastChange = performance.now(); needFull = true; pass = 0; }
const QS = new URLSearchParams(location.search);
const STILL = QS.get('still') === '1';   // render once at full resolution, then stop (tests, saving)
const canvas = document.getElementById('view');
const note = document.getElementById('note');
const N = 1024;

// ───────────────────────── boot ─────────────────────────
loadDEMs().then(start, start);

function start() {
  const places = { 'by seed': 0 };
  Compose.places().forEach((p, k) => { places[p === 'invented' ? 'invented ground' : p] = k + 1; });
  const SN = 'Scene', LI = 'Light', AI = 'Air and cloud', RE = 'Render';
  G = GenArt.create({
    title: 'Ridge, encounters — shaded',
    closedGroups: [RE],
    params: {
      regime: { value: 0, options: { 'by seed': 0, exposure: 1, looming: 2, whiteout: 3, passage: 4, clearing: 5 }, label: 'register', group: SN },
      event: { value: 0, options: { 'by seed': 0, none: 1, tarn: 2, hut: 3, bird: 4, moon: 5 }, label: 'rare event (as 028)', group: SN },
      place: { value: 0, options: places, label: 'place', group: SN },
      framing: { value: 0, options: { 'live view (look, walk)': 0, "028's two sheets": 1 }, label: 'framing', group: SN },
      sunTurn: { value: 0, min: -180, max: 180, step: 1, label: 'turn the sun (°)', group: LI },
      sunLift: { value: 0, min: -30, max: 50, step: 0.5, label: 'raise the sun (°)', group: LI },
      sunMoves: { value: 0, min: 0, max: 2, step: 0.05, label: 'sun moves (° / s)', group: LI },
      exposure: { value: 0, min: -2.5, max: 2.5, step: 0.05, label: 'exposure (EV)', group: LI },
      cover: { value: 1, min: 0, max: 2, step: 0.05, label: 'cloud cover (× the register)', group: AI },
      deck: { value: 0, min: -1.5, max: 1.5, step: 0.05, label: 'deck height (± spread of the land)', group: AI },
      drift: { value: 1, min: 0, max: 4, step: 0.05, label: 'cloud drift (× wind)', group: AI },
      haze: { value: 1, min: 0, max: 4, step: 0.05, label: 'haze', group: AI },
      quality: { value: 1, options: { draft: 0, normal: 1, fine: 2 }, label: 'quality', group: RE },
      res: { value: 0, options: { 'auto (holds the frame rate)': 0, '50 %': 0.5, '75 %': 0.75, '100 %': 1 }, label: 'resolution', group: RE },
    },
    onReset: () => touch(),
  });
  addControls();
  window.saveCanvas = (name) => savePNG(name);
  if (!initGL()) return;
  requestAnimationFrame(loop);
}

// ───────────────────────── the scene from 028 ─────────────────────────
function sceneKey() { return [G.seed, G.param('regime'), G.param('event'), G.param('place')].join('|'); }

function build() {
  const t0 = performance.now();
  UI.status = 'building the place…';
  const seed = G.seed >>> 0 || 1, o = { seed, regime: G.param('regime'), event: G.param('event'), place: G.param('place') };
  const sh = Compose.sheets(PARTS, o);                                     // also caches the scene
  const S = Compose._scene(PARTS, seed, o.regime | 0, o.place || 0, null, o.event | 0, '');
  const T = S.T, L = S.light;
  // textures: height and smoothed height; shading normal and occlusion; materials
  const HH = new Float32Array(N * N * 2);
  let maxH = -1e9;
  for (let i = 0; i < N * N; i++) { HH[2 * i] = T.H[i]; HH[2 * i + 1] = T.Hs[i]; if (T.H[i] > maxH) maxH = T.H[i]; }
  upload('H', N, N, gl.RG32F, gl.RG, gl.FLOAT, HH, false);
  upload('Nrm', N, N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, normalsAndAO(T), true, true);
  const mat = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    mat[4 * i] = 255 * clamp01(T.rock[i]); mat[4 * i + 1] = 255 * clamp01(T.snow[i]); mat[4 * i + 2] = 255 * clamp01(T.alb[i]);
    mat[4 * i + 3] = T.water && T.water[i] ? 255 : Math.round(229 * clamp01(T.trk ? T.trk[i] : 0));
  }
  upload('Mat', N, N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mat, true, true);
  // the fine ground at the standpoint (028 grows it for the first gaze)
  const NG = T.near;
  if (NG) {
    upload('NearH', NG.M, NG.M, gl.R32F, gl.RED, gl.FLOAT, NG.h, false);
    const rk = new Uint8Array(NG.M * NG.M); for (let i = 0; i < rk.length; i++) rk[i] = 255 * clamp01(NG.rk[i]);
    upload('NearR', NG.M, NG.M, gl.R8, gl.RED, gl.UNSIGNED_BYTE, rk, false);
  } else {                                                                 // none: placeholders, never read
    upload('NearH', 1, 1, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(1), false);
    upload('NearR', 1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1), false);
  }
  if (!TEX.Noise) TEX.Noise = noise3D();
  // the weather, as 028 sets it: the deck against the land actually in view
  const cam0 = S.frames[0].cam;
  const W = landInView(T, cam0), R = mulberry(seed ^ 0x40c10ad5);
  const reg = S.regime, r1 = R(), r2 = R();
  const deck = reg === 'whiteout' ? cam0.y + 6 : reg === 'passage' ? W.hm + (r1 - 0.3) * W.hv : reg === 'looming' ? W.hm + (0.5 + r1 * 0.8) * W.hv : W.hm + (r1 - 0.65) * 1.2 * W.hv;
  const thick = reg === 'whiteout' ? 60 : Math.max(14, W.hv * (0.45 + r2 * 0.5));
  const cover = { exposure: 0.42, looming: 0.5, whiteout: 0, passage: 0.62, clearing: 0.7 }[reg];   // a whiteout is fog all round, not a deck
  const wind = [Math.cos(cam0.wind), Math.sin(cam0.wind)];
  const deckT = deckTexture(T, W.hm, wind);
  upload('DeckT', 256, 256, gl.RG16F, gl.RG, gl.FLOAT, deckT, true, true);
  SC = {
    S, T, L, sh, maxH, near: NG, deck, thick, hm: W.hm, hv: W.hv, cover, wind, reg,
    vis: reg === 'whiteout' ? 60 + R() * 90 : 0,
    cairns: (T.cairns || []).slice(0, 12).map((c) => [c[0], bil(T.H, c[0], c[1]), c[1], c[2]]),
    label: sh[0].placeLabel + ' · ' + reg + ' · ' + L.mode + (S.event !== 'none' ? ' · ' + S.event : '') + ' · ' + S.pair,
  };
  resetView();
  built = sceneKey();
  UI.status = 'built in ' + Math.round(performance.now() - t0) + ' ms';
}

// where the body stands and looks: 028's first gaze (the live view starts there)
function resetView() {
  const c = SC.S.frames[0].cam;
  VIEW = { x: c.x, z: c.z, eye: c.y - groundAt(c.x, c.z), yaw: c.yaw, pitch: c.pitch, roll: c.roll, focal: c.focal, zoom: 1 };
  touch();
}

// the land seen from the standpoint, coarsely: its mean height and spread set the deck (028)
function landInView(T, cam) {
  let m = 0, v = 0, n = 0;
  const fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw), rx = -fz, rz = fx;
  for (let j = 0; j < 30; j++) for (let i = 0; i < 48; i++) {
    const kx = ((i + 0.5) / 48 - 0.5) * 900 / cam.focal, ky = (0.5 - (j + 0.5) / 30) * 596 / cam.focal + Math.tan(cam.pitch);
    const dx = fx + rx * kx, dz = fz + rz * kx;
    for (let t = 1.2; t < 1500; t += Math.max(0.5, t * 0.01)) {
      const x = cam.x + dx * t, z = cam.z + dz * t;
      if (x < 1 || z < 1 || x > N - 2 || z > N - 2) break;
      const h = bil(T.H, x, z);
      if (cam.y + ky * t < h) { m += h; v += h * h; n++; break; }
    }
  }
  m /= Math.max(1, n);
  return { hm: m, hv: Math.sqrt(Math.max(1, v / Math.max(1, n) - m * m)) };
}

// shading normals as 028 lights the land: on steep ground (and under snow) the normal comes from
// a smoothed height, so a wall's micro-relief does not shade as stripes; and the occlusion of
// the sky by the land around (how far the land rises above a point at three radii)
function normalsAndAO(T) {
  const H = T.H, Hn = boxBlur(Float32Array.from(H), 2, 2), out = new Uint8Array(N * N * 4);
  const B = [[3, 2], [10, 2], [30, 2]].map(([r, p]) => boxBlur(Float32Array.from(H), r, p));
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, xl = x > 0 ? i - 1 : i, xr = x < N - 1 ? i + 1 : i, zu = z > 0 ? i - N : i, zd = z < N - 1 ? i + N : i;
    const rx = H[xl] - H[xr], rz = H[zu] - H[zd], st = Math.max(sstep(0.7, 1.8, Math.hypot(rx, rz) * 0.5), 0.8 * T.snow[i]);
    const nx = rx + (Hn[xl] - Hn[xr] - rx) * st, nz = rz + (Hn[zu] - Hn[zd] - rz) * st, il = 1 / Math.sqrt(nx * nx + 4 + nz * nz);
    let occ = 0;
    B.forEach((b, k) => { const r = [3, 10, 30][k]; occ += clamp01((b[i] - H[i]) / (r * 0.7)); });
    out[4 * i] = 127.5 + 127.5 * nx * il; out[4 * i + 1] = 127.5 + 127.5 * 2 * il; out[4 * i + 2] = 127.5 + 127.5 * nz * il;
    out[4 * i + 3] = 255 * (1 - 0.75 * occ / 3);
  }
  return out;
}

// the deck's rise over the land and its lee factor, on a 256² grid (as 028's weather)
function deckTexture(T, hm, wind) {
  const G2 = 256, out = new Float32Array(G2 * G2 * 2), wx = wind[0] * 12, wz = wind[1] * 12;
  for (let z = 0; z < G2; z++) for (let x = 0; x < G2; x++) {
    const X = (x + 0.5) * 4, Z = (z + 0.5) * 4, hs = bil(T.Hs, X, Z);
    const g = (bil(T.Hs, X + wx, Z + wz) - bil(T.Hs, X - wx, Z - wz)) / 24;
    out[2 * (z * G2 + x)] = 0.3 * (hs - hm);
    out[2 * (z * G2 + x) + 1] = 1 - 0.85 * sstep(0.02, 0.4, -g) + 0.5 * sstep(0.02, 0.4, g);
  }
  return out;
}

// a tiling 64³ noise for the cloud and the grain: R fbm, G billows (inverted cells), B fine fbm
function noise3D() {
  const S = 64, data = new Uint8Array(S * S * S * 4), R = mulberry(0x5eed);
  const lat = (p) => { const L = new Float32Array(p * p * p); for (let i = 0; i < L.length; i++) L[i] = R(); return L; };
  const L8 = lat(8), L16 = lat(16), L32 = lat(32), L64 = lat(64);
  const vn = (L, p, x, y, z) => {   // tiling value noise with smooth interpolation
    const f = (v) => v * v * (3 - 2 * v), xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const at = (a, b, c) => L[(((c % p) + p) % p) * p * p + (((b % p) + p) % p) * p + (((a % p) + p) % p)];
    const x0 = at(xi, yi, zi) * (1 - u) + at(xi + 1, yi, zi) * u, x1 = at(xi, yi + 1, zi) * (1 - u) + at(xi + 1, yi + 1, zi) * u;
    const x2 = at(xi, yi, zi + 1) * (1 - u) + at(xi + 1, yi, zi + 1) * u, x3 = at(xi, yi + 1, zi + 1) * (1 - u) + at(xi + 1, yi + 1, zi + 1) * u;
    return (x0 * (1 - v) + x1 * v) * (1 - w) + (x2 * (1 - v) + x3 * v) * w;
  };
  // cells for the billows: one feature point in each of 6³ cells, tiling
  const C = 6, pts = new Float32Array(C * C * C * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = R();
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = ((z * S + y) * S + x) * 4;
    const fx = x / S, fy = y / S, fz = z / S;
    const fbm = 0.5 * vn(L8, 8, fx * 8, fy * 8, fz * 8) + 0.25 * vn(L16, 16, fx * 16, fy * 16, fz * 16) + 0.125 * vn(L32, 32, fx * 32, fy * 32, fz * 32) + 0.0625 * vn(L64, 64, fx * 64, fy * 64, fz * 64);
    let dmin = 9;
    const cx = Math.floor(fx * C), cy = Math.floor(fy * C), cz = Math.floor(fz * C);
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ax = cx + i, ay = cy + j, az = cz + k, q = ((((az % C) + C) % C) * C * C + (((ay % C) + C) % C) * C + (((ax % C) + C) % C)) * 3;
      const px = (ax + pts[q]) / C, py = (ay + pts[q + 1]) / C, pz = (az + pts[q + 2]) / C;
      dmin = Math.min(dmin, Math.hypot(px - fx, py - fy, pz - fz));
    }
    const fine = 0.5 * vn(L32, 32, fx * 32 + 7, fy * 32, fz * 32) + 0.5 * vn(L64, 64, fx * 64, fy * 64 + 3, fz * 64);
    data[o] = 255 * clamp01((fbm - 0.2) / 0.75); data[o + 1] = 255 * clamp01(1 - dmin * C * 0.9); data[o + 2] = 255 * fine; data[o + 3] = 255;
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, S, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
  return t;
}

// ───────────────────────── WebGL ─────────────────────────
function initGL() {
  gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) { fail('This piece needs WebGL2, which this browser does not offer.'); return false; }
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); fail('shader: ' + gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return false;
  prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fail('link: ' + gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(prog, i), name = a.name.replace(/\[0\]$/, ''); U[name] = gl.getUniformLocation(prog, a.name); }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the screen
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return true;
}

function upload(name, w, h, ifmt, fmt, type, data, linear, mirror) {
  if (TEX[name]) gl.deleteTexture(TEX[name]);
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
  const f = linear ? gl.LINEAR : gl.NEAREST, wr = mirror ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  TEX[name] = t;
}

// the light: 028's sun (or moon) for this seed, turned and raised by hand, and the sky it makes
function lightNow() {
  const L = SC.L, el0 = L.el, az0 = L.az;
  const moves = G.param('sunMoves') * (performance.now() - tStart) / 1000;
  const el = el0 + (G.param('sunLift') * Math.PI) / 180, az = az0 + ((G.param('sunTurn') + moves) * Math.PI) / 180;
  const sun = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
  const night = L.mode === 'moon' ? 1 : 0, over = L.mode === 'overcast' ? 1 : 0;
  const e = Math.max(0, Math.sin(el)), low = 1 - sstep(0.0, 0.45, e), dusk = sstep(0.02, -0.08, Math.sin(el));
  let sunCol = mixv([1.0, 0.96, 0.9], [1.0, 0.58, 0.32], low * 0.85);
  sunCol = mixv(sunCol, [0.25, 0.12, 0.08], dusk);
  let zen = mixv([0.16, 0.3, 0.6], [0.13, 0.2, 0.36], low * 0.6), hor = mixv([0.58, 0.66, 0.76], [0.85, 0.62, 0.48], low * 0.7);
  zen = mixv(zen, [0.02, 0.025, 0.05], dusk); hor = mixv(hor, [0.12, 0.08, 0.1], dusk);
  let glow = mixv([1.0, 0.9, 0.75], [1.0, 0.55, 0.3], low);
  if (night) { sunCol = [0.75, 0.82, 1.0]; zen = [0.006, 0.01, 0.025]; hor = [0.02, 0.028, 0.05]; glow = [0.25, 0.3, 0.4]; }
  const direct = night ? 0.22 : over ? 0.25 : L.direct, amb = night ? 0.03 : L.ambient;
  if (over) { zen = [0.62, 0.64, 0.67]; hor = [0.74, 0.75, 0.76]; glow = [0.5, 0.5, 0.48]; }   // overcast (and inside the cloud): no blue, light from everywhere
  return { sun, sunCol: sunCol.map((v) => v * (night ? 1 : 2.1) * (1 - dusk * 0.8)), zen, hor, glow, night, over, direct, amb };
}

// ───────────────────────── a frame ─────────────────────────
function loop(now) {
  if (STILL && window.DONE) return;
  requestAnimationFrame(loop);
  if (!G) return;
  if (built !== sceneKey()) build();
  const animate = (G.param('drift') > 0 || G.param('sunMoves') > 0) && !STILL;
  const active = animate || moving || now - lastChange < 250;
  if (!active && !needFull) return;
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  driftT += dt * G.param('drift');
  // resolution: fixed, or held to the frame rate while anything moves, full once still
  const fixed = G.param('res');
  if (STILL) scale = 1;
  else if (fixed) scale = fixed;
  else if (!active) scale = 1;
  else if (dt > 0) scale = Math.max(0.3, Math.min(0.85, scale * (dt > 1 / 30 ? 0.93 : dt < 1 / 50 ? 1.04 : 1)));
  // once still, the frame is averaged over PASSES passes, each with its own jitter of the cloud
  // march and of the pixel: the grain of a single pass goes, and the edges are smoothed
  if (active) pass = 0;
  draw(active ? 0 : pass);
  frames++;
  if (!active && ++pass >= PASSES) needFull = false;
  if (STILL && !needFull) { gl.finish(); window.DONE = true; }
}

function draw(k = 0) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(2, Math.round(innerWidth * dpr * scale)), H = Math.max(2, Math.round(innerHeight * dpr * scale));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const L = lightNow(), q = G.param('quality');
  const b = (unit, name, target) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target || gl.TEXTURE_2D, TEX[name]); gl.uniform1i(U['u' + name], unit); };
  b(0, 'H'); b(1, 'Nrm'); b(2, 'Mat'); b(3, 'NearH'); b(4, 'NearR'); b(5, 'Noise', gl.TEXTURE_3D); b(6, 'DeckT');
  gl.uniform1f(U.uN, N);
  gl.uniform1f(U.uMaxH, SC.maxH + 2);
  const NG = SC.near;
  gl.uniform4f(U.uNear, NG ? NG.x0 : 0, NG ? NG.z0 : 0, NG ? NG.cell : 1, NG ? NG.M : 0);
  gl.uniform3fv(U.uSun, L.sun); gl.uniform3fv(U.uSunCol, L.sunCol);
  gl.uniform3fv(U.uSkyZen, L.zen); gl.uniform3fv(U.uSkyHor, L.hor); gl.uniform3fv(U.uGlow, L.glow);
  gl.uniform1f(U.uNight, L.night); gl.uniform1f(U.uOvercast, L.over); gl.uniform1f(U.uRime, SC.L.rime || 0);
  gl.uniform1f(U.uDirect, L.direct); gl.uniform1f(U.uAmbient, L.amb);
  const cover = SC.cover * G.param('cover');
  gl.uniform4f(U.uDeck, SC.deck + G.param('deck') * SC.hv, SC.thick, SC.hm, cover > 0.01 ? Math.min(1, cover) : 0);
  gl.uniform4f(U.uWind, SC.wind[0], SC.wind[1], driftT * 6, SC.vis);
  gl.uniform1f(U.uHaze, G.param('haze') * (SC.reg === 'clearing' ? 2.3 : 1));
  gl.uniform1f(U.uExposure, G.param('exposure') + (L.night ? 1.2 : 0));
  gl.uniform1f(U.uTime, driftT);
  gl.uniform1f(U.uQuality, q);
  gl.uniform1f(U.uSeed, k ? k * 7.13 : frames % 64);
  const hal = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  gl.uniform2f(U.uJit, k ? hal(k, 2) - 0.5 : 0, k ? hal(k, 3) - 0.5 : 0);
  // pass k is blended over the passes before it at 1 / (k + 1): the canvas holds their mean
  if (k > 0) { gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, 1 / (k + 1)); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA); } else gl.disable(gl.BLEND);
  const cs = new Float32Array(48); SC.cairns.forEach((c, k) => cs.set(c, 4 * k));
  gl.uniform4fv(U.uCairns, cs); gl.uniform1i(U.uNCairns, SC.cairns.length);

  if (G.param('framing') === 1) drawSheets(W, H);
  else {
    // the live view: the body's own eyes, the frame as wide as the window
    gl.viewport(0, 0, W, H);
    const v = VIEW, y = groundAt(v.x, v.z) + v.eye;
    camUniforms([v.x, y, v.z], v.yaw, v.pitch, v.roll, [W, H, 0, (v.focal * v.zoom * W) / 900], [0, 0], [W, H]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  note.textContent = SC.label + ' · seed ' + G.seed + (G.param('framing') === 1 ? '' : ' · drag to look, shift-drag or WASD to walk, wheel to zoom, R to stand where 028 stood');
}

// 028's diptych: two sheets on the mat, each its own gaze (or one view cut in two)
function drawSheets(W, H) {
  gl.clearColor(247 / 255, 247 / 255, 245 / 255, 1);
  if (!gl.isEnabled(gl.BLEND)) { gl.viewport(0, 0, W, H); gl.clear(gl.COLOR_BUFFER_BIT); }
  const S = SC.S, sw = 450, shh = S.h, gap = 0.035;
  const k = Math.min((W * 0.86) / (2 * sw * (1 + gap)), (H * 0.8) / shh);
  const pw = Math.round(sw * k), ph = Math.round(shh * k), g = Math.round(sw * k * gap), x0 = Math.round((W - 2 * pw - g) / 2), y0 = Math.round((H - ph) / 2);
  gl.enable(gl.SCISSOR_TEST);
  for (let s = 0; s < 2; s++) {
    const one = S.frames.length === 1, fr = S.frames[one ? 0 : s], c = fr.cam, ox = x0 + s * (pw + g);
    const fw = one ? 2 * pw : pw, off = one ? s * pw : 0;
    gl.viewport(ox, y0, pw, ph); gl.scissor(ox, y0, pw, ph);
    camUniforms([c.x, c.y, c.z], c.yaw, c.pitch, c.roll, [fw, ph, off, (c.focal * fw) / (one ? 900 : 450)], [ox, y0], [pw, ph]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.SCISSOR_TEST);
}

function camUniforms(eye, yaw, pitch, roll, frame, origin, view) {
  gl.uniform3fv(U.uEye, eye);
  gl.uniform2f(U.uYawPitch, yaw, pitch);
  gl.uniform1f(U.uRoll, roll);
  gl.uniform4fv(U.uFrame, frame);
  gl.uniform2fv(U.uOrigin, origin);
  gl.uniform2fv(U.uView, view);
}

// the ground under the feet: the fine ground where it holds, else the survey
function groundAt(x, z) {
  const NG = SC.near;
  if (NG) {
    const gx = (x - NG.x0) / NG.cell, gz = (z - NG.z0) / NG.cell;
    if (gx > 1 && gz > 1 && gx < NG.M - 2 && gz < NG.M - 2) return bilA(NG.h, NG.M, gx, gz);
  }
  return bil(SC.T.H, x, z);
}

// ───────────────────────── looking and walking ─────────────────────────
function addControls() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, walk: e.shiftKey || e.button === 2 }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); moving = true; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !VIEW) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (G.param('framing') === 1) return;
    if (drag.walk) walk(-dy * 0.06, dx * 0.06);
    else { VIEW.yaw += dx * 0.0035 / VIEW.zoom; VIEW.pitch = Math.max(-1.1, Math.min(0.9, VIEW.pitch - dy * 0.0035 / VIEW.zoom)); }
    touch();
  });
  const end = () => { drag = null; canvas.classList.remove('dragging'); moving = false; touch(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!VIEW) return; VIEW.zoom = Math.max(0.4, Math.min(6, VIEW.zoom * Math.exp(-e.deltaY * 0.0012))); touch(); }, { passive: false });
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.lil-gui')) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'r' || e.key === 'R') resetView();
    if (e.key === 'p' || e.key === 'P') savePNG();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  const tick = () => {
    const f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0), s = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if ((f || s) && VIEW && G && G.param('framing') !== 1) { walk(f * 0.35, s * 0.35); touch(); }
    setTimeout(tick, 33);
  };
  tick();
  window.addEventListener('resize', () => touch());
}
function walk(fwd, side) {
  const fx = Math.cos(VIEW.yaw), fz = Math.sin(VIEW.yaw);
  VIEW.x = Math.max(2, Math.min(N - 3, VIEW.x + fx * fwd - fz * side));
  VIEW.z = Math.max(2, Math.min(N - 3, VIEW.z + fz * fwd + fx * side));
}

function savePNG(name) {
  const keep = scale; scale = 1;
  for (let k = 0; k < PASSES; k++) draw(k);
  scale = keep;
  const a = document.createElement('a');
  a.download = (name || 'ridge-encounters-shaded-' + G.seed) + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  touch();
}

function fail(msg) { note.textContent = msg; note.style.opacity = 1; console.warn('040:', msg); window.DONE = true; }

// ───────────────────────── small helpers ─────────────────────────
// (clamp01 comes with 038's tools.js)
function sstep(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function mixv(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function bilA(A, n, x, z) {
  x = Math.max(0, Math.min(n - 1.001, x)); z = Math.max(0, Math.min(n - 1.001, z));
  const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi, o = zi * n + xi;
  return (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fz) + (A[o + n] * (1 - fx) + A[o + n + 1] * fx) * fz;
}
function bil(A, x, z) { return bilA(A, N, x, z); }
// separable box blur, `passes` times (≈ gaussian), radius r, on the N×N grid
function boxBlur(a, r, passes) {
  const t = new Float32Array(N * N);
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < N; z++) {
      let s = 0; const row = z * N;
      for (let x = -r; x <= r; x++) s += a[row + Math.max(0, Math.min(N - 1, x))];
      for (let x = 0; x < N; x++) { t[row + x] = s / (2 * r + 1); s += a[row + Math.min(N - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let z = -r; z <= r; z++) s += t[Math.max(0, Math.min(N - 1, z)) * N + x];
      for (let z = 0; z < N; z++) { a[z * N + x] = s / (2 * r + 1); s += t[Math.min(N - 1, z + r + 1) * N + x] - t[Math.max(0, z - r) * N + x]; }
    }
  }
  return a;
}
