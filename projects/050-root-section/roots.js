// 050 — Root Section: a floor-to-ceiling cut through the soil, in which roots grow with the real season.
//
// The rules, in brief:
//   • A growth cycle lasts `days` (92 by default) from `start` (1 Nov 2026). Each cycle has its own root
//     network, made from a hash of the cycle number, so every screen grows the same roots.
//   • Every root segment has a birth time in "growth units" (0…1). How far the network has grown is
//     G = 1 − exp(−E / K), where E is the effective warmth accumulated since the cycle began:
//     the sum over days of max(0, T_mean − 5 °C) × a soil-moisture factor (a simple water bucket fed by
//     rain and drained by evapotranspiration). Warm, moist seasons grow full networks; cold or dry ones
//     stay sparse. Nothing is stored: on load the piece re-downloads the last 92 days of weather
//     (Open-Meteo, no key), so a restart reproduces the same network at the same moment.
//   • The graphics card does the growing: each frame the vertex shader decides from G how much of each
//     segment exists, tapers the growing tips and lights them; the CPU only uploads one number.
//   • Real-time motion: sap pulses travel from the tips toward the stems at a rate set by the sun's
//     height where the soil is (transpiration), and rain soaks down as wetting fronts.
//   • The last 3% of each cycle the network fades back into the soil; the next cycle starts again.
(function () {
  'use strict';
  const RAD = Math.PI / 180, DAY = 864e5;
  const Q = new URLSearchParams(location.search);
  const num = (k, d) => (Q.has(k) && isFinite(+Q.get(k)) ? +Q.get(k) : d);

  // ───────────────────────── settings ─────────────────────────
  const place = (() => { const m = String(Q.get('place') || '').split(',').map(Number);
    return m.length === 2 && m.every(isFinite) ? { lat: m[0], lon: m[1] } : { lat: 37.98, lon: 23.73 }; })();   // default: Athens
  const CYCLE_DAYS = Math.max(7, num('days', 92));
  const START = (() => { const s = Q.get('start'); const t = s ? Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s) : NaN; return isFinite(t) ? t : Date.UTC(2026, 10, 1); })();
  const K = num('k', 450);                 // effective degree-days for G to reach 63%
  const SEED = num('seed', 50);
  const SPEED = num('speed', 1);
  const DEMO = num('demo', 0);             // >0: the whole cycle replays in this many seconds
  const G_FIX = Q.has('g') ? Math.max(0, Math.min(1, num('g', 0))) : null;
  const STILL = Q.get('still') === '1';
  const USE_WEATHER = Q.get('weather') !== '0';
  const SCALE = Math.max(0.25, Math.min(2, num('scale', 1)));
  const HUD = Q.get('hud') !== '0';
  const DIM = (() => { const s = Q.has('dim') ? Q.get('dim') : '19-22:0.6,22-7:0.35';
    return String(s).split(',').map((p) => { const m = p.match(/^(\d+)-(\d+):([\d.]+)$/); return m && { a: +m[1], b: +m[2], v: +m[3] }; }).filter(Boolean); })();

  const at0 = Q.has('at') ? Date.parse(Q.get('at')) : NaN;
  const wall0 = Date.now(), perf0 = performance.now();
  const now = () => (isFinite(at0) ? at0 : wall0) + (STILL ? 0 : (performance.now() - perf0) * SPEED);

  // ───────────────────────── deterministic randomness ─────────────────────────
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ───────────────────────── the sun (NOAA approximation, ±0.5°) ─────────────────────────
  function sunEl(ms, lat, lon) {
    const d = (ms - Date.UTC(2000, 0, 1, 12)) / DAY;
    const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = (gmst * 15 + lon) * RAD - ra, la = lat * RAD;
    return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / RAD;
  }

  // ───────────────────────── weather: live, or a climate model offline ─────────────────────────
  // days: Map 'YYYY-MM-DD' (UTC) → { t: mean °C, p: rain mm, e: ET0 mm }
  const W = { days: new Map(), source: 'CLIMATE MODEL', fetched: 0, error: '' };
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  function climate(ms) {             // smooth seasonal model of the place, used for missing days
    const lat = place.lat, doy = (ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)) / DAY;
    const tAvg = 28 - 0.006 * lat * lat, amp = Math.min(12, 0.2 * Math.abs(lat)), peak = lat >= 0 ? 200 : 20;   // ±3 °C for most cities
    const t = tAvg + amp * Math.cos(2 * Math.PI * (doy - peak) / 365.25);
    const wet = 0.5 + 0.5 * Math.cos(2 * Math.PI * (doy - peak - 182) / 365.25);   // wetter in the cool half
    return { t, p: 0.6 + 2.2 * wet, e: Math.max(0.3, 0.8 + 0.17 * t) };
  }
  const dayData = (ms) => W.days.get(isoDay(ms)) || climate(ms);
  async function fetchWeather() {
    if (!USE_WEATHER) return;
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(2)}&longitude=${place.lon.toFixed(2)}` +
      '&daily=temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&past_days=92&forecast_days=1&timezone=GMT';
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(u, { cache: 'no-store', signal: ac.signal }); clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), d = j.daily, m = new Map();
      d.time.forEach((day, i) => { const t = d.temperature_2m_mean[i], p = d.precipitation_sum[i], e = d.et0_fao_evapotranspiration[i];
        if (t != null) m.set(day, { t, p: p || 0, e: e != null ? e : climate(Date.parse(day)).e }); });
      W.days = m; W.source = 'OPEN-METEO'; W.fetched = Date.now(); W.error = '';
    } catch (err) { W.error = String(err.message || err).toUpperCase().slice(0, 40); if (!W.fetched) W.source = 'CLIMATE MODEL'; }
  }

  // ───────────────────────── the season → G, moisture, wetting fronts ─────────────────────────
  function season(ms) {
    const ci = Math.floor((ms - START) / (CYCLE_DAYS * DAY)), c0 = START + ci * CYCLE_DAYS * DAY;
    const pos = (ms - c0) / (CYCLE_DAYS * DAY);
    let E = 0, bucket = 25, mf = 1, today = null;
    const nDays = Math.floor((ms - c0) / DAY);
    for (let i = 0; i <= nDays; i++) {
      const dm = c0 + i * DAY, d = dayData(dm), frac = i < nDays ? 1 : ((ms - c0) / DAY) - nDays;
      bucket = Math.max(0, Math.min(60, bucket + (d.p - 0.7 * d.e) * frac));
      mf = 0.25 + 0.75 * Math.min(1, bucket / 30);
      E += Math.max(0, Math.min(20, d.t - 5)) * mf * frac;
      today = d;
    }
    // wetting fronts: the four most recent rain days in the last 12, each soaking downward
    const fronts = [];
    for (let i = 0; i < 12 && fronts.length < 4; i++) {
      const dm = Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate()) - i * DAY, d = dayData(dm);
      if (d.p > 2) { const h = Math.max(0, (ms - (dm + 12 * 36e5)) / 36e5); if (h <= 0 && i === 0) continue;
        fronts.push([Math.min(1.1, 0.03 * Math.sqrt(h) * Math.pow(d.p / 10, 0.3)), Math.min(1, d.p / 15) * Math.exp(-h / 140)]); }
    }
    while (fronts.length < 4) fronts.push([0, 0]);
    const G = 1 - Math.exp(-E / K);
    return { ci, c0, pos, E, G, bucket, mf, today, fronts, day: nDays + 1 };
  }

  // ───────────────────────── the root network of one cycle (made once per cycle) ─────────────────────────
  // World: x ∈ [0, WORLD_W], depth y ∈ [0, 1] (0 = surface, 1 = floor); stems rise to y ≈ −0.055.
  const WORLD_W = 4.2, SKY = 0.06;
  const STRIDE = 12;   // x0 y0 x1 y1  w0 w1  t0 t1  order dist  kind rnd
  function generate(seed) {
    const R = rng(seed), out = [];
    let tone = 0.5;
    const push = (x0, y0, x1, y1, w0, w1, t0, t1, order, dist, kind) => out.push(x0, y0, x1, y1, w0, w1, t0, t1, order, dist, kind, tone);
    const STEP = 0.005, DOWN = Math.PI / 2;
    const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
    function root(o) {   // iterative: a stack of growing roots
      const stack = [o];
      while (stack.length) {
        let r = stack.pop(); tone = R(); let x = r.x, y = r.y, a = r.a, l = 0, t = r.t, dist = r.dist, drift = 0;
        while (l < r.len) {
          a += r.grav * turn(a, DOWN) + (R() - 0.5) * r.wig + drift;
          drift = drift * 0.92 + (R() - 0.5) * 0.03;
          if (y < 0.012) a += 0.3 * turn(a, DOWN);
          const nx = x + Math.cos(a) * STEP, ny = y + Math.sin(a) * STEP;
          if (ny > 0.992 || nx < 0 || nx > WORLD_W || out.length / STRIDE > 220000) break;
          const w0 = Math.max(r.wMin, r.w * (1 - 0.8 * l / r.len)), w1 = Math.max(r.wMin, r.w * (1 - 0.8 * (l + STEP) / r.len));
          const t1 = t + STEP / r.speed;
          push(x, y, nx, ny, w0, w1, t, t1, r.order, dist, r.kind);
          x = nx; y = ny; l += STEP; t = t1; dist += STEP;
          if (r.order < r.maxOrder && l < r.len * 0.92 && R() < r.branch) {
            const side = R() < 0.5 ? -1 : 1, rem = r.len - l;
            stack.push({ x, y, a: a + side * (0.8 + R() * 0.7), w: Math.max(r.wMin, w1 * (0.45 + R() * 0.2)), wMin: r.wMin,
              order: r.order + 1, maxOrder: r.maxOrder, t: t + 0.01 + R() * 0.05, dist,
              len: Math.max(0.02, (0.12 + R() * 0.5) * Math.min(0.55, rem + 0.25) * Math.pow(0.7, r.order)),
              grav: r.grav * 0.35, wig: r.wig * 1.15, branch: r.branch * 1.25, speed: r.speed * 0.85, kind: r.kind });
          }
          if (r.order >= 2 && R() < 0.012) hypha(x, y, t + 0.15 + R() * 0.3, dist);   // fungal threads from fine roots
        }
      }
    }
    function hypha(x, y, t, dist) {
      let a = R() * Math.PI * 2; const n = 6 + Math.floor(R() * 14);
      for (let i = 0; i < n; i++) {
        a += (R() - 0.5) * 1.1; const s = 0.004, nx = x + Math.cos(a) * s, ny = Math.max(0.004, Math.min(0.99, y + Math.sin(a) * s));
        push(x, y, nx, ny, 0.0006, 0.0005, t, t + 0.004, 5, dist, 2); x = nx; y = ny; t += 0.004; dist += s;
      }
    }
    function stem(x, t, type) {   // what is above ground: a short silhouette, so the cut reads as a cut
      const blades = type === 1 ? 7 : type === 0 ? 3 : 4;
      for (let b = 0; b < blades; b++) {
        let a = -Math.PI / 2 + (R() - 0.5) * (type === 1 ? 1.1 : 0.7), px = x, py = 0, tt = t, h = (0.025 + R() * 0.028) * (type === 2 ? 1.1 : 1);
        const curl = (R() - 0.5) * 0.06, w = type === 1 ? 0.0016 : 0.0026;
        for (let l = 0; l < h; l += 0.003) {
          a += curl; const nx = px + Math.cos(a) * 0.003, ny = py + Math.sin(a) * 0.003;
          push(px, py, nx, ny, w * (1 - l / h) + 0.0004, w * (1 - (l + 0.003) / h) + 0.0004, tt, tt + 0.006, 0, 0, 1); px = nx; py = ny; tt += 0.006;
        }
      }
    }
    // plants across the cut: tap-rooted forbs, grasses, shrubs
    let x = 0.06 + R() * 0.1;
    while (x < WORLD_W - 0.05) {
      const type = R() < 0.4 ? 1 : R() < 0.65 ? 0 : 2, t0 = R() * 0.12;
      stem(x, t0, type);
      if (type === 0) root({ x, y: 0.004, a: Math.PI / 2 + (R() - 0.5) * 0.3, w: 0.011 + R() * 0.005, wMin: 0.0009, order: 0, maxOrder: 4, t: t0, dist: 0,
        len: 0.55 + R() * 0.4, grav: 0.07, wig: 0.10, branch: 0.06, speed: 1.0, kind: 0 });
      else if (type === 1) { const n = 9 + Math.floor(R() * 7);
        for (let i = 0; i < n; i++) root({ x: x + (R() - 0.5) * 0.02, y: 0.004, a: Math.PI / 2 + (R() - 0.5) * 2.0, w: 0.0032 + R() * 0.0015, wMin: 0.0007, order: 1, maxOrder: 3,
          t: t0 + R() * 0.08, dist: 0, len: 0.18 + R() * 0.4, grav: 0.025, wig: 0.13, branch: 0.035, speed: 0.9, kind: 0 }); }
      else { const n = 3 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1;
          root({ x, y: 0.006, a: Math.PI / 2 + side * (0.55 + R() * 0.7), w: 0.008 + R() * 0.004, wMin: 0.0008, order: 0, maxOrder: 4, t: t0 + R() * 0.05, dist: 0,
            len: 0.45 + R() * 0.5, grav: 0.012, wig: 0.09, branch: 0.075, speed: 0.95, kind: 0 }); } }
      x += 0.16 + R() * 0.26;
    }
    // normalise births to 0…0.97 so G = 1 is a full network
    // and spread them so the number of segments grows roughly in step with G (a monotone remap: order within a root is kept)
    let tMax = 0; for (let i = 7; i < out.length; i += STRIDE) tMax = Math.max(tMax, out[i]);
    const ts = []; for (let i = 6; i < out.length; i += STRIDE) ts.push(out[i]); ts.sort((a, b) => a - b);
    const q = (t) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; } return lo / ts.length; };
    const remap = (t) => 0.97 * (0.65 * q(t) + 0.35 * t / tMax);
    for (let i = 0; i < out.length; i += STRIDE) { const a = remap(out[i + 6]), b = remap(out[i + 7]); out[i + 6] = a; out[i + 7] = Math.max(b, a + 1e-5); }
    // draw thick and old first, fine and young on top
    const n = out.length / STRIDE, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => out[b * STRIDE + 4] - out[a * STRIDE + 4]);
    const arr = new Float32Array(out.length); idx.forEach((s, d) => { for (let k = 0; k < STRIDE; k++) arr[d * STRIDE + k] = out[s * STRIDE + k]; });
    return arr;
  }

  // ───────────────────────── WebGL2 ─────────────────────────
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: STILL || Q.has('capture') });
  if (!gl) { document.getElementById('hud').textContent = 'WEBGL2 NOT AVAILABLE'; return; }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setTimeout(() => location.reload(), 2000); });

  const HEAD = '#version 300 es\nprecision highp float;\n';
  const VIEW = `uniform vec4 u_view; // x0 (world), px per unit, canvas w, canvas h
  vec2 toClip(vec2 w) { vec2 p = vec2((w.x - u_view.x) * u_view.y, (w.y + ${SKY.toFixed(3)}) * u_view.y); return vec2(p.x / u_view.z * 2.0 - 1.0, 1.0 - p.y / u_view.w * 2.0); }`;
  const NOISE = `
  uvec2 pcg2d(uvec2 v) { v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
    v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; return v; }
  float h21(vec2 p) { return float(pcg2d(uvec2(ivec2(floor(p)) + 65536)).x) * (1.0 / 4294967295.0); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  vec2 cell(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, id = 0.0;   // nearest feature point in a jittered grid, and its cell
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + vec2(311.0, 173.0)));
      float d = length(g + o - f); if (d < d1) { d1 = d; id = h21(i + g + vec2(-97.0, 541.0)); } } return vec2(d1, id); }`;

  // soil: strata, grain, stones; moisture and wetting fronts; a thin strip of air above
  const soilVS = HEAD + 'void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0, 1); }';
  const soilFS = HEAD + NOISE + `
  uniform vec4 u_view; uniform float u_moist, u_sun, u_exp, u_life; uniform vec4 u_fd, u_fs; out vec4 o;
  void main() {
    vec2 w = vec2(u_view.x + gl_FragCoord.x / u_view.y, (u_view.w - gl_FragCoord.y) / u_view.y - ${SKY.toFixed(3)});
    float d = w.y;
    vec3 col;
    if (d < 0.0) {                                    // air: dim, lit by the day above
      float day = clamp(u_sun / 25.0 + 0.15, 0.0, 1.0);
      col = mix(vec3(0.010, 0.011, 0.014), vec3(0.11, 0.115, 0.12), day * smoothstep(-${SKY.toFixed(3)}, 0.0, d) * 0.8);
    } else {
      float wob = (fbm(vec2(w.x * 2.2, 3.0)) - 0.5) * 0.08;
      float h1 = 0.17 + wob, h2 = 0.47 + wob * 1.6 + (fbm(vec2(w.x * 1.3, 9.0)) - 0.5) * 0.06, h3 = 0.76 + wob * 2.0;
      vec3 top = vec3(0.090, 0.066, 0.050), sub = vec3(0.140, 0.088, 0.055), clay = vec3(0.125, 0.105, 0.085), rock = vec3(0.085, 0.082, 0.080);
      float b = 0.012;
      col = mix(top, sub, smoothstep(h1 - b, h1 + b, d));
      col = mix(col, clay, smoothstep(h2 - b, h2 + b * 2.0, d));
      col = mix(col, rock, smoothstep(h3 - b, h3 + b * 3.0, d));
      float grain = fbm(w * vec2(90.0, 110.0)), fine = h21(w * 900.0);
      col *= 0.78 + 0.38 * grain + 0.10 * (fine - 0.5);
      col *= 0.92 + 0.16 * fbm(w * vec2(3.0, 22.0));                         // horizontal banding
      // stones: few near the top, more with depth, large in the weathered rock
      // stones: two fixed scales (scale must not vary with depth, or the cells shear into streaks)
      for (int k = 0; k < 2; k++) {
        float sz = k == 0 ? 26.0 : 10.0, dens = k == 0 ? 0.05 + 0.15 * smoothstep(0.1, 0.6, d) : 0.22 * smoothstep(0.55, 1.0, d);
        vec2 sp = w * sz + (vec2(fbm(w * 30.0), fbm(w * 30.0 + 5.0)) - 0.5) * 0.5;
        vec2 c = cell(sp + float(k) * 50.0); float r = c.x + 0.12 * (fbm(w * 120.0) - 0.5), id = c.y;
        if (id < dens) {
          float rr = 0.16 + 0.2 * fract(id * 137.7), st = smoothstep(rr + 0.025, rr - 0.025, r);
          vec3 sc = mix(vec3(0.13, 0.12, 0.11), vec3(0.22, 0.20, 0.17), fract(id * 71.3)) * (0.8 + 0.4 * fbm(w * 260.0));
          col = mix(col * (1.0 - 0.3 * smoothstep(rr + 0.08, rr, r)), sc, st);
        }
      }
      // the litter at the surface
      col = mix(vec3(0.17, 0.14, 0.10) * (0.6 + 0.8 * fbm(w * 300.0)), col, smoothstep(0.0, 0.010 + 0.006 * fbm(w * 40.0), d));
      // moisture: the bucket wets the top and fades with depth; each rain soaks down as a front
      float wet = u_moist * exp(-d * 3.0);
      for (int i = 0; i < 4; i++) { float f = u_fd[i]; if (u_fs[i] > 0.0) wet += u_fs[i] * (smoothstep(f + 0.03, f - 0.02, d) * 0.7 + 0.5 * exp(-pow((d - f) / 0.015, 2.0))); }
      wet = clamp(wet, 0.0, 1.2);
      col *= 1.0 - 0.38 * wet; col += vec3(0.010, 0.012, 0.016) * wet * fbm(w * 400.0);
    }
    col *= u_exp;
    col += (h21(gl_FragCoord.xy + fract(u_life * 7.0)) - 0.5) / 255.0;    // dither for 8-bit panels
    o = vec4(col, 1);
  }`;

  // roots: one instance per segment; the vertex shader decides how much of it exists at G
  const rootVS = HEAD + VIEW + `
  layout(location=0) in vec4 a_p; layout(location=1) in vec2 a_w; layout(location=2) in vec2 a_t; layout(location=3) in vec4 a_m;
  uniform float u_G;
  out float v_side; out float v_half; out float v_alpha; out float v_u; out float v_grow; out float v_age; out vec4 v_m;
  void main() {
    int c = gl_VertexID; float s = (c == 1 || c == 2 || c == 4) ? 1.0 : 0.0; float side = (c == 2 || c == 4 || c == 5) ? 1.0 : -1.0;
    float f = clamp((u_G - a_t.x) / max(1e-6, a_t.y - a_t.x), 0.0, 1.0);
    if (f <= 0.0) { gl_Position = vec4(2, 2, 2, 1); return; }
    vec2 p0 = a_p.xy, p1 = mix(a_p.xy, a_p.zw, f), dir = normalize(a_p.zw - a_p.xy + 1e-9), nrm = vec2(-dir.y, dir.x);
    float w = mix(a_w.x, mix(a_w.x, a_w.y, f), s);
    float growing = f < 1.0 ? 1.0 : 0.0;
    if (growing > 0.5) w *= mix(1.0, 0.35, s);                                  // a growing tip is a point
    float px = w * u_view.y, alpha = 1.0;
    if (px < 1.1) { alpha = px / 1.1; px = 1.1; }                                // thin roots stay lines
    float half_ = px * 0.5 + 1.0;
    vec2 wp = mix(p0 - dir * a_w.x * 0.5, p1 + dir * a_w.y * 0.5, s) + nrm * side * half_ / u_view.y;
    gl_Position = vec4(toClip(wp), 0, 1);
    v_side = side * half_; v_half = px * 0.5; v_alpha = alpha; v_u = s; v_grow = growing; v_age = u_G - a_t.y; v_m = a_m;
  }`;
  const rootFS = HEAD + `
  uniform float u_time, u_tr, u_exp, u_life;
  in float v_side; in float v_half; in float v_alpha; in float v_u; in float v_grow; in float v_age; in vec4 v_m; out vec4 o;
  void main() {
    float a = clamp(v_half - abs(v_side) + 0.5, 0.0, 1.0) * v_alpha * u_life;
    if (a <= 0.0) discard;
    float x = clamp(v_side / max(v_half, 0.5), -1.0, 1.0), shade = 0.45 + 0.55 * sqrt(1.0 - x * x) * (0.85 + 0.15 * -x);
    float order = v_m.x, dist = v_m.y, kind = v_m.z, rnd = v_m.w;
    vec3 young = vec3(0.92, 0.86, 0.74), old = vec3(0.46, 0.33, 0.22);
    vec3 col = mix(young, old, smoothstep(0.02, 0.45, v_age) * (1.0 - order * 0.16));      // older roots brown and corky
    col *= 0.85 + 0.3 * rnd;
    if (kind > 1.5) { col = vec3(0.80, 0.84, 0.86); a *= 0.55; }                            // fungal threads
    if (kind > 0.5 && kind < 1.5) { col = vec3(0.30, 0.32, 0.26) * (0.8 + 0.4 * rnd); shade = 0.6 + 0.4 * shade; }  // stems above ground
    col *= shade;
    // sap: pulses travel from the tips toward the stem, as fast as the sun makes the plant drink
    float pulse = pow(max(0.0, sin(dist * 34.0 + u_time * (0.6 + 2.4 * u_tr) + rnd * 6.283)), 28.0) * u_tr * step(kind, 0.5);
    col += vec3(0.55, 0.62, 0.66) * pulse * 0.45;
    col += vec3(1.0, 0.95, 0.85) * v_grow * smoothstep(0.4, 1.0, v_u) * 0.35;                 // growing tips glow
    o = vec4(col * u_exp, a);
  }`;

  function prog(vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  const SOIL = prog(soilVS, soilFS), ROOT = prog(rootVS, rootFS);
  const vao = gl.createVertexArray(), buf = gl.createBuffer(), empty = gl.createVertexArray();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const B = STRIDE * 4;
  [[0, 4, 0], [1, 2, 16], [2, 2, 24], [3, 4, 32]].forEach(([loc, size, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, off); gl.vertexAttribDivisor(loc, 1); });
  gl.bindVertexArray(null);

  let net = { ci: null, n: 0, data: null };
  function ensureNetwork(ci) {
    if (net.ci === ci) return;
    const data = generate(hash(SEED, ci + 1000));
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    net = { ci, n: data.length / STRIDE, data };
  }

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1) * SCALE, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function view() {
    const w = canvas.width, h = canvas.height; let ppu = h / (1 + SKY);
    if (w / ppu > WORLD_W) ppu = w / WORLD_W;
    return [(WORLD_W - w / ppu) / 2, ppu, w, h];
  }
  const dimAt = (ms) => { if (isFinite(at0) || DEMO) return 1; const h = new Date(ms).getHours();
    for (const d of DIM) if (d.a < d.b ? h >= d.a && h < d.b : h >= d.a || h < d.b) return d.v; return 1; };

  // ───────────────────────── the frame ─────────────────────────
  let S = null, gShown = null, lastSeason = -1e9, frames = 0;
  function frame() {
    resize();
    const ms = now(), t = (performance.now() - perf0) / 1000;
    if (ms - lastSeason > 2000 || !S || STILL) { S = season(ms); lastSeason = ms; }
    let G = S.G, life = Math.min(1, Math.max(0, (1 - S.pos) / 0.03)), ci = S.ci;
    if (DEMO > 0) { const p = (t % DEMO) / DEMO; G = Math.min(1, p / 0.9); life = Math.min(1, (1 - p) / 0.04); ci = Math.floor(t / DEMO); }
    if (G_FIX !== null) { G = G_FIX; life = 1; }
    gShown = gShown === null || DEMO || G_FIX !== null ? G : gShown + (G - gShown) * 0.02;   // eases a refetch in
    ensureNetwork(ci);
    const el = sunEl(ms, place.lat, place.lon), tr = Math.max(0, Math.min(1, Math.sin(Math.max(0, el) * RAD) * 1.4)) * S.mf * (S.today && S.today.t > 5 ? 1 : 0.3) + 0.06;
    const exp = dimAt(ms), v = view(), tm = DEMO ? (t * 6) % 3600 : (ms / 1000) % 3600;   // sap follows the clock, so every screen pulses together

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(SOIL.p); gl.bindVertexArray(empty);
    gl.uniform4fv(SOIL.u.u_view, v); gl.uniform1f(SOIL.u.u_moist, Math.min(1, S.bucket / 45)); gl.uniform1f(SOIL.u.u_sun, el);
    gl.uniform1f(SOIL.u.u_exp, exp); gl.uniform1f(SOIL.u.u_life, (frames % 64) / 64);
    gl.uniform4fv(SOIL.u.u_fd, S.fronts.map((f) => f[0])); gl.uniform4fv(SOIL.u.u_fs, S.fronts.map((f) => f[1]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(ROOT.p); gl.bindVertexArray(vao);
    gl.uniform4fv(ROOT.u.u_view, v); gl.uniform1f(ROOT.u.u_G, gShown); gl.uniform1f(ROOT.u.u_time, tm);
    gl.uniform1f(ROOT.u.u_tr, tr); gl.uniform1f(ROOT.u.u_exp, exp); gl.uniform1f(ROOT.u.u_life, life);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, net.n);
    gl.bindVertexArray(null);
    frames++;
    if (frames % 30 === 1) hud(ms, G, el, tr, life);
    if (!STILL) requestAnimationFrame(frame); else document.body.dataset.ready = '1';
  }

  function hud(ms, G, el, tr, life) {
    const el_ = document.getElementById('hud'); if (!HUD) { el_.textContent = ''; return; }
    let drawn = 0; const d = net.data; for (let i = 6; i < d.length; i += STRIDE) if (d[i] < gShown) drawn++;
    const T = S.today ? S.today.t.toFixed(1) : '—';
    el_.textContent = [
      `ROOT SECTION   ${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}   ${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      `CYCLE ${S.ci + 1}  DAY ${S.day}/${CYCLE_DAYS}   EFFECTIVE WARMTH ${S.E.toFixed(0)} DEG-DAYS   G ${G.toFixed(3)}${DEMO ? '  (DEMO)' : G_FIX !== null ? '  (FIXED)' : ''}`,
      `TODAY ${T} °C   SOIL WATER ${S.bucket.toFixed(1)} MM   SUN ${el.toFixed(1)}°   SAP ${tr.toFixed(2)}`,
      `SEGMENTS ${drawn.toLocaleString('en')} / ${net.n.toLocaleString('en')}   WEATHER ${W.source}${W.error ? ' (' + W.error + ')' : ''}`,
    ].join('\n');
  }

  // ───────────────────────── running indefinitely ─────────────────────────
  if (navigator.wakeLock) { const lock = () => navigator.wakeLock.request('screen').catch(() => {}); lock(); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lock()); }
  if (!isFinite(at0) && !STILL) setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0 && performance.now() > 36e5) location.reload(); }, 30000);
  window.RootSection = { season: (iso) => season(Date.parse(iso)), weather: W, generate };

  fetchWeather().finally(() => { S = null; requestAnimationFrame(frame); });
  if (!STILL) setInterval(fetchWeather, 36e5);
})();
