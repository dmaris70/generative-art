// 049 — Grass Nocturne: what is under the journey — land or sea, height, coast, climate, names.
//
// The ground is read from a 0.25° grid built from public data (data/build_geo.py): Natural Earth
// for countries, seas and places, NOAA's ETOPO 2022 for elevation, and, when it has been added,
// the Köppen-Geiger V3 climate map of Beck et al. (2023, CC BY 4.0). Nothing is fetched from
// elsewhere: the piece knows the earth offline.
//
// The track also passes lines on the globe. Crossing them is an event:
//   the equator → the image mirrors for an hour · the date line → ten minutes of time slice
//   a tropic → a day of twice as many colour minutes · a coastline, a border, 15° of longitude
//   → written into the log of crossings that a measurement reads.
(function (global) {
  'use strict';
  const RAD = Math.PI / 180, TROPIC = 23.44;
  const KG = ['', 'Af', 'Am', 'Aw', 'BWh', 'BWk', 'BSh', 'BSk', 'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc',
    'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd', 'ET', 'EF'];
  // climate group → the kind of meadow: density, height, how combed by wind, how pale
  const BIOME = {
    A: { name: 'TROPICAL', density: 1.25, height: 1.35, comb: 0, pale: 0 },
    BW: { name: 'DESERT', density: 0.25, height: 0.45, comb: 0.1, pale: 0.25 },
    BS: { name: 'STEPPE', density: 0.6, height: 0.7, comb: 0.35, pale: 0.15 },
    C: { name: 'TEMPERATE', density: 1, height: 1, comb: 0, pale: 0 },
    D: { name: 'COLD', density: 0.85, height: 0.75, comb: 0.1, pale: 0.2 },
    ET: { name: 'TUNDRA', density: 0.45, height: 0.3, comb: 0.2, pale: 0.3 },
    EF: { name: 'ICE', density: 0.08, height: 0.2, comb: 0.3, pale: 0.5 },
  };
  const groupOf = (k) => { const c = KG[k] || ''; return c[0] === 'B' ? c.slice(0, 2) : c[0] === 'E' ? c : c[0] || ''; };

  let grid = null, meta = null;
  function load(bin, json) { grid = bin; meta = json; return api; }
  async function fetchData(base) {
    const jr = await fetch(base + 'geo.json');
    let br = await fetch(base + 'geo.bin.gz').catch(() => null), body;
    if (br && br.ok) body = br.body;
    else {                                   // hosts that serve no binaries get the same bytes as base64 text
      const tr = await fetch(base + 'geo.bin.gz.b64.txt');
      if (!tr.ok) throw new Error('geography data missing');
      const bin = atob((await tr.text()).trim()), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      body = new Blob([u]).stream();
    }
    if (!jr.ok) throw new Error('geography data missing');
    const buf = await new Response(body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return load(new Uint8Array(buf), await jr.json());
  }
  const ready = () => !!grid;

  function cell(lat, lon) {
    const W = meta.w, H = meta.h;
    const y = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * 4))), x = ((Math.floor((lon + 180) * 4) % W) + W) % W;
    const i = y * W + x, L = W * H;
    return { i, x, y, country: grid[i], sea: grid[L + i], elev: grid[2 * L + i], coast: grid[3 * L + i], kg: meta.layers > 4 ? grid[4 * L + i] : 0 };
  }
  const elevM = (b) => (b / 255) ** 2 * 6000;
  // the ground at a place, with its neighbours for roughness
  function at(lat, lon) {
    if (!grid) return null;
    const c = cell(lat, lon), land = c.country > 0;
    let rough = 0;
    if (land) { let s = 0, s2 = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const e = elevM(cell(lat + dy * 0.25, lon + dx * 0.25).elev); s += e; s2 += e * e; n++; }
      rough = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); }
    const kg = c.kg, grp = groupOf(kg);
    return {
      land, country: meta.countries[c.country] || '', sea: meta.seas[c.sea] || '', elev: land ? elevM(c.elev) : 0, rough,
      coastKm: c.coast * 10 * (land ? 1 : -1),        // positive inland, negative offshore
      climate: kg ? KG[kg] : '', biome: BIOME[grp] || null, hasClimate: meta.layers > 4,
    };
  }
  function haversine(a, b, c, d) {
    const p = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(p));
  }
  function bearing(a, b, c, d) {
    const y = Math.sin((d - b) * RAD) * Math.cos(c * RAD), x = Math.cos(a * RAD) * Math.sin(c * RAD) - Math.sin(a * RAD) * Math.cos(c * RAD) * Math.cos((d - b) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  function nearestPlace(lat, lon) {
    if (!meta) return null;
    let best = null, bd = Infinity;
    for (const p of meta.places) { const d = haversine(lat, lon, p[0], p[1]); if (d < bd) { bd = d; best = p; } }
    return best && { name: best[2], country: best[3], pop: best[4], km: bd, bearing: bearing(lat, lon, best[0], best[1]) };
  }

  // ── the track, read through the journey function
  function travelled(J, ms, fromLon) {
    let km = 0, prev = J(J.START || 0, fromLon);
    const start = J.START, step = 6 * 36e5;
    for (let t = start + step; t <= ms; t += step) { const p = J(t, fromLon); km += haversine(prev.lat, prev.lon, p.lat, p.lon); prev = p; }
    const p = J(ms, fromLon); return km + haversine(prev.lat, prev.lon, p.lat, p.lon);
  }
  function nextChange(J, ms, fromLon, wantLand, maxDays = 200) {
    for (let h = 1; h <= maxDays * 24; h += 2) {
      const t = ms + h * 36e5, p = J(t, fromLon), g = at(p.lat, p.lon);
      if (g && g.land === wantLand) return { hours: h, at: p, ground: g };
    }
    return null;
  }
  // the most recent crossing, searching back hour by hour (60 days at most)
  function lastCrossing(J, ms, fromLon) {
    let cur = J(ms, fromLon), gc = at(cur.lat, cur.lon);
    for (let h = 1; h <= 60 * 24; h++) {
      const t = ms - h * 36e5, p = J(t, fromLon), g = at(p.lat, p.lon);
      const when = t + 18e5;
      if (Math.sign(p.lat) !== Math.sign(cur.lat)) return { what: 'THE EQUATOR', when };
      if ((Math.abs(p.lat) - TROPIC) * (Math.abs(cur.lat) - TROPIC) < 0) return { what: cur.lat > 0 || p.lat > 0 ? 'THE TROPIC OF CANCER' : 'THE TROPIC OF CAPRICORN', when };
      if (Math.abs(cur.lon - p.lon) > 180) return { what: 'THE DATE LINE', when };
      if (Math.floor((cur.lon + 180) / 15) !== Math.floor((p.lon + 180) / 15)) return { what: 'MERIDIAN ' + Math.abs(Math.round(Math.round(cur.lon / 15) * 15)) + (cur.lon >= 0 ? ' E' : ' W') + ', ONE HOUR OF SUN', when };
      if (g && gc && g.land !== gc.land) return { what: gc.land ? 'LANDFALL: ' + gc.country : 'TO SEA: ' + gc.sea, when };
      if (g && gc && gc.land && g.land && g.country !== gc.country) return { what: 'INTO ' + gc.country + ' FROM ' + g.country, when };
      if (g && gc && !gc.land && !g.land && g.sea !== gc.sea) return { what: 'INTO THE ' + gc.sea, when };
      cur = p; gc = g;
    }
    return null;
  }
  // events the score answers: how long since the equator, the date line, a tropic
  function events(J, ms, fromLon) {
    const now = J(ms, fromLon), h1 = J(ms - 36e5, fromLon), m10 = J(ms - 6e5, fromLon), d1 = J(ms - 864e5, fromLon);
    return {
      equator: Math.sign(now.lat) !== Math.sign(h1.lat),                     // within the last hour → mirror
      dateLine: Math.abs(now.lon - m10.lon) > 180,                           // within the last 10 min → time slice
      tropic: (Math.abs(now.lat) - TROPIC) * (Math.abs(d1.lat) - TROPIC) < 0,  // within the last day → more colour
    };
  }
  const antipode = (lat, lon) => ({ lat: -lat, lon: lon > 0 ? lon - 180 : lon + 180 });

  const api = { load, fetchData, ready, at, nearestPlace, travelled, nextChange, lastCrossing, events, antipode, haversine, BIOME, KG };
  global.Geography = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
