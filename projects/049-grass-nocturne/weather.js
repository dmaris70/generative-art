// 049 — Grass Nocturne: the journey, and the weather where it has got to.
//
// The meadow travels once round the earth in a year: its longitude moves east 0.9856° a day
// (360° in 365.25 days) from a starting meridian, and its latitude swings between 60°N and 45°S
// over 547.875 days (a year and a half), so the track does not repeat for three years. Where it
// is follows from the date alone; every screen is in the same place.
//
// The weather there is read live (Open-Meteo, no key) every 15 minutes, for coordinates rounded to
// 0.1°, and eased in over five minutes. With no reading for an hour, the piece falls back to its
// own built-in weather; it never stops.
//
// What the readings do, abstractly:
//   sun there → the light's height and bearing; night there → a darker meadow
//   temperature → the dichroic pair       wind and gusts → the gusts, and how often glitches come
//   cloud cover → cloud shadows          humidity, visibility, fog → haze and how far one can see
//   rain → falling lines                 snow → slowness, lighter greys, colour drained
//   pressure → the camera's height       pressure trend → the horizon tilts
//   thunderstorm → single-frame flashes
(function (global) {
  'use strict';
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const START = Date.UTC(2026, 10, 1);                   // day 0 of the journey: 1 Nov 2026

  // ───────────────────────── where the meadow is ─────────────────────────
  function journey(ms, fromLon = 0) {
    const days = (ms - START) / 864e5;
    let lon = fromLon + days * 360 / 365.25;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    const lat = 7.5 + 52.5 * Math.sin(TAU * days / 547.875 + 0.6);
    return { lat, lon, day: Math.floor(days), days };
  }
  // the sun's height and compass bearing at a place and moment (NOAA's approximation, ±0.5°)
  function sunAt(ms, lat, lon) {
    const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
    const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = ((gmst * 15 + lon) * RAD - ra);
    const la = lat * RAD;
    const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));   // from north, east positive
    return { el: el / RAD, az: ((az / RAD) % 360 + 360) % 360 };
  }
  const solarClock = (ms, lon) => { const h = ((ms / 36e5 + lon / 15) % 24 + 24) % 24; return Math.floor(h) * 60 + Math.floor((h % 1) * 60); };

  // ───────────────────────── a reading ─────────────────────────
  const WMO = {
    0: 'CLEAR', 1: 'MAINLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST', 45: 'FOG', 48: 'RIME FOG',
    51: 'LIGHT DRIZZLE', 53: 'DRIZZLE', 55: 'DENSE DRIZZLE', 56: 'FREEZING DRIZZLE', 57: 'FREEZING DRIZZLE',
    61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN', 66: 'FREEZING RAIN', 67: 'FREEZING RAIN',
    71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW', 77: 'SNOW GRAINS', 80: 'RAIN SHOWERS', 81: 'RAIN SHOWERS',
    82: 'VIOLENT RAIN SHOWERS', 85: 'SNOW SHOWERS', 86: 'SNOW SHOWERS', 95: 'THUNDERSTORM', 96: 'THUNDERSTORM, HAIL', 99: 'THUNDERSTORM, HAIL',
  };
  function url(lat, lon) {
    const v = 'temperature_2m,relative_humidity_2m,precipitation,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day';
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(1) + '&longitude=' + lon.toFixed(1)
      + '&current=' + v + '&hourly=pressure_msl&past_hours=3&forecast_hours=1&wind_speed_unit=ms&timezone=GMT';
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  // an Open-Meteo answer → the values the meadow uses (missing values get calm defaults)
  function parse(j) {
    const c = (j && j.current) || {}, hp = (j && j.hourly && j.hourly.pressure_msl) || [];
    const p = num(c.pressure_msl, 1013), p0 = num(hp[0], p);
    return {
      temp: num(c.temperature_2m, 14), rh: num(c.relative_humidity_2m, 60) / 100, precip: num(c.precipitation, 0),
      snow: num(c.snowfall, 0), code: num(c.weather_code, 1), cloud: num(c.cloud_cover, 30) / 100, pressure: p,
      trend: p - p0, speed: num(c.wind_speed_10m, 3), dir: num(c.wind_direction_10m, 240), gusts: num(c.wind_gusts_10m, 5),
      vis: num(c.visibility, 24000), isDay: num(c.is_day, 1), time: c.time || '',
    };
  }
  // the built-in weather, for when there is no reading: calm, slowly varying, from the clock
  function builtIn(ms) {
    const h = ms / 36e5;
    return { temp: 12 + 6 * Math.sin(TAU * h / 24), rh: 0.6 + 0.2 * Math.sin(TAU * h / 31), precip: 0, snow: 0, code: 2,
      cloud: 0.35 + 0.25 * Math.sin(TAU * h / 5), pressure: 1013 + 6 * Math.sin(TAU * h / 70), trend: 0, speed: 4 + 2 * Math.sin(TAU * h / 9),
      dir: (240 + 60 * Math.sin(TAU * h / 40) + 360) % 360, gusts: 7, vis: 24000, isDay: 1, time: '', builtIn: true };
  }
  const KEYS = ['temp', 'rh', 'precip', 'snow', 'cloud', 'pressure', 'trend', 'speed', 'gusts', 'vis'];
  function lerpState(a, b, t) {
    const o = Object.assign({}, b);
    for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
    const dd = ((b.dir - a.dir + 540) % 360) - 180; o.dir = (a.dir + dd * t + 360) % 360;
    return o;
  }

  // what the meadow does with a state: numbers the renderer reads
  function effects(w, sun) {
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const code = w.code, storm = code >= 95 ? 1 : 0, fogCode = code === 45 || code === 48 ? 1 : 0;
    const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 1 : 0, snowy = (code >= 71 && code <= 77) || code === 85 || code === 86 ? 1 : 0;
    const night = smooth(2, -8, sun.el);
    return {
      // wind: toward the bearing opposite where it comes from; north is −z
      windX: Math.sin((w.dir + 180) * RAD), windZ: -Math.cos((w.dir + 180) * RAD),
      windStrength: clamp(w.speed / 12, 0.06, 1.25), gustiness: clamp((w.gusts - w.speed) / 10, 0, 1),
      stormFactor: clamp(Math.max(storm, (w.gusts - 10) / 12), 0, 1), storm,
      cover: 0.86 - 0.86 * clamp(w.cloud, 0, 1),                               // the cloud-shadow threshold
      fog: 0.025 + 0.05 * w.rh * w.rh + 0.22 * Math.max(fogCode, smooth(3000, 150, w.vis)),
      mistBoost: 0.02 * w.rh + 0.05 * Math.max(fogCode, smooth(3000, 150, w.vis)),
      rain: rain ? clamp(0.25 + w.precip / 6, 0, 1) : clamp(w.precip / 6, 0, 1) * (1 - snowy),
      snow: snowy ? clamp(0.4 + w.snow / 2, 0, 1) : clamp(w.snow, 0, 1),
      heightScale: 0.6 + clamp((w.pressure - 980) / 60, 0, 1),                  // low pressure keeps the eye in the grass
      tilt: clamp(w.trend * 0.6, -2, 2) * RAD,                                  // hPa over 3 h → up to ±2°
      night, temp: w.temp,
    };
  }
  // temperature → the dichroic pair, from cold cyan/violet to hot copper/magenta
  const PAIRS = [[-10, [0.1, 0.85, 1.0], [0.55, 0.25, 1.0]], [5, [0.1, 0.9, 1.0], [1.0, 0.15, 0.85]], [15, [0.3, 1.0, 0.45], [0.62, 0.2, 1.0]],
    [24, [1.0, 0.72, 0.18], [0.16, 0.36, 1.0]], [34, [1.0, 0.45, 0.2], [1.0, 0.15, 0.6]]];
  function pairFor(t) {
    if (t <= PAIRS[0][0]) return [PAIRS[0][1], PAIRS[0][2]];
    for (let i = 1; i < PAIRS.length; i++) if (t <= PAIRS[i][0]) {
      const a = PAIRS[i - 1], b = PAIRS[i], f = (t - a[0]) / (b[0] - a[0]);
      return [a[1].map((v, k) => v + (b[1][k] - v) * f), a[2].map((v, k) => v + (b[2][k] - v) * f)];
    }
    const z = PAIRS[PAIRS.length - 1]; return [z[1], z[2]];
  }

  // ───────────────────────── the live reader ─────────────────────────
  function createReader({ fromLon = 0, fetchFn = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), every = 15 * 60000, ease = 5 * 60000 } = {}) {
    let last = null, prev = null, gotAt = 0, asked = 0, place = null, error = '';
    function poll(ms) {
      const q = Math.floor(ms / every);
      if (q === asked) return;
      asked = q;
      const j = journey(ms, fromLon);
      fetchFn(url(j.lat, j.lon)).then((data) => {
        if (data && data.error) throw new Error(data.reason || 'refused');
        prev = last ? current(ms) : null; last = parse(data); gotAt = Date.now(); place = j; error = '';
      }).catch((e) => { error = String(e.message || e); });
    }
    function current(ms) {
      const age = last ? Date.now() - gotAt : Infinity;
      if (!last || age > 60 * 60000) return Object.assign(builtIn(ms), { error });
      const t = Math.min(1, age / ease);
      return Object.assign(prev ? lerpState(prev, last, t) : last, { ageMin: age / 60000, error });
    }
    return { poll, current, get place() { return place; } };
  }

  const api = { journey, sunAt, solarClock, url, parse, builtIn, effects, pairFor, createReader, lerpState, WMO, START };
  global.Weather = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
