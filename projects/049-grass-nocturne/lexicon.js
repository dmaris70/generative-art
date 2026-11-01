// 049 — Grass Nocturne: the lexicon of the journey.
//
// A vocabulary of dance travels with the meadow between the two schools: the ancient Greek words
// in which dance was first named, the court dances, the classical terms every school shares, the
// modern and contemporary words, the Greek folk dances. Which word is with the meadow is fixed by
// the clock and the homage's week, so every screen, and the logbook, agree:
//
//   · every 3 minutes a new term (a "window"); its entry is written in the margin, the word itself
//     grows in the field and is slowly eroded, the field moves in the term's motion
//   · on a crossing, the vocabulary travels through time: from Athens to London it runs from the
//     oldest words to the newest, on the way back from the newest to the oldest; among the terms
//     of that age, the one whose origin is nearest the meadow is chosen
//   · at a home, half of the terms belong to the place (Athens: Greek, ancient and folk; London:
//     the English school), half come from anywhere
//   · arrival: after the bow, the canto of the trip just ended (minutes 1–4: its eight milestone
//     terms); then the refrain (minutes 4–13: only terms that every school shares, what remains)
//   · once an hour at a home, minutes 30–33: the etymology of one word, from Greek to English
//   · a lost term is written with letters missing, and leaves the field faster
//
// Also here: Greek capitals in the same single-stroke letters as assets/strokefont.js (which is
// frozen, so the Greek lives in this file), and a renderer for mixed Greek and Latin text.
(function (global) {
  'use strict';
  const DAY = 864e5, WEEK = 7 * DAY, RES = 3 * DAY, TRIP = DAY / 2, WIN = 18e4;

  // ── letters. Grid 4 × 6 like the Latin; Greek letters with a Latin twin use the Latin glyph.
  const TWIN = { 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X' };
  const OWN = {
    'Γ': [[4, 0, 0, 0, 0, 6]],
    'Δ': [[0, 6, 2, 0, 4, 6, 0, 6]],
    'Λ': [[0, 6, 2, 0, 4, 6]],
    'Ξ': [[0, 0, 4, 0], [0.8, 3, 3.2, 3], [0, 6, 4, 6]],
    'Π': [[0, 6, 0, 0, 4, 0, 4, 6]],
    'Σ': [[4, 0, 0, 0, 2, 3, 0, 6, 4, 6]],
    'Φ': [[2, 0, 2, 6], [2, 1.5, 0.6, 1.9, 0, 3, 0.6, 4.1, 2, 4.5, 3.4, 4.1, 4, 3, 3.4, 1.9, 2, 1.5]],
    'Ψ': [[2, 0, 2, 6], [0, 0.5, 0, 2.6, 0.7, 3.7, 2, 4, 3.3, 3.7, 4, 2.6, 4, 0.5]],
    'Ω': [[0.6, 6, 1.4, 6, 1.4, 5.2, 0.5, 4.2, 0, 3, 0.3, 1.4, 1.2, 0.3, 2, 0, 2.8, 0.3, 3.7, 1.4, 4, 3, 3.5, 4.2, 2.6, 5.2, 2.6, 6, 3.4, 6]],
    "'": [[2, 0, 1.7, 1.2]],
    '?': [[0.4, 1, 1, 0.2, 2, 0, 3, 0.2, 3.6, 1, 3.4, 2, 2, 3, 2, 4.2], [2, 5.6, 2, 6]],
  };
  // upper case, accents dropped (the Latin font has none), final sigma as sigma
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[’`]/g, "'").replace(/[—–]/g, '-');
  function glyph(ch) {
    const F = global.StrokeFont ? global.StrokeFont.glyphs : {};
    if (OWN[ch]) { if (ch === 'Θ' && F.O) return F.O.concat([[1, 3, 3, 3]]); return OWN[ch]; }
    if (ch === 'Θ') return (F.O || []).concat([[1, 3, 3, 3]]);
    return F[TWIN[ch] || ch] || null;
  }
  const ADV = 5.4, G = 6;
  const width = (str, size) => Math.max(0, norm(str).length * ADV - (ADV - 4)) * size / G;
  // polylines of {x, y}, y the top of the capitals; drop(i) → true leaves letter i out (a lost word)
  function text(str, x, y, size, drop) {
    const s = size / G, out = [], chars = norm(str);
    for (let i = 0; i < chars.length; i++) {
      if (drop && chars[i] !== ' ' && drop(i)) continue;
      const g = glyph(chars[i]); if (!g) continue;
      const ox = x + i * ADV * s;
      for (const flat of g) { const pts = []; for (let k = 0; k < flat.length; k += 2) pts.push({ x: ox + flat[k] * s, y: y + flat[k + 1] * s }); out.push(pts); }
    }
    return out;
  }
  // words to lines of at most n characters
  function wrap(str, n) {
    const out = []; let line = '';
    for (const w of norm(str).split(/\s+/)) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) out.push(line); return out;
  }

  // ── deterministic choice
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R = Math.PI / 180;
  const km = (a, b, c, d) => { const p = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(p)); };
  const STATUS = { shared: 'WHAT REMAINS - SHARED BY EVERY SCHOOL', living: 'LIVING', rare: 'RARE NOW', historical: 'HISTORICAL - KNOWN FROM BOOKS', lost: 'LOST - ONLY THE WORD REMAINS' };
  const yearWords = (y) => (y < 0 ? 'C. ' + -y + ' BC' : (y % 100 === 0 || y % 50 === 0) && y < 1900 ? 'C. ' + y : String(y));

  function create(data, opts) {
    const Wx = opts.Wx, cfg = opts.cfg, homes = cfg.homes;
    const T = data.terms.map((t, i) => Object.assign({ i }, t)), E = data.etymology || [];
    const byYear = T.slice().sort((a, b) => a.year - b.year || a.i - b.i);
    const shared = T.filter((t) => t.status === 'shared');
    const tagged = (h) => T.filter((t) => t.home === (h === 0 ? 'athens' : 'london'));
    const pools = [tagged(0), tagged(1)];
    const tripStart = (n) => cfg.start + Math.floor(n / 2) * WEEK + (n % 2 ? 2 * RES + TRIP : RES);
    const rng = (k, salt) => mulberry(Math.imul(k, 2654435761) ^ salt);

    // on a crossing: the age by how far along, the place by the nearest origin
    function travelTerm(path, f, k) {
      const r = rng(k, 0x1e7), fwd = path.from.lat === homes[0].lat && path.from.lon === homes[0].lon;
      const n = byYear.length, c = Math.round((fwd ? f : 1 - f) * (n - 1));
      const q = Wx.alongPath(path, f);
      let best = null, bd = Infinity;
      for (let i = Math.max(0, c - 4); i <= Math.min(n - 1, c + 4); i++) {
        const t = byYear[i], d = km(q.lat, q.lon, t.lat, t.lon) + r() * 900 + Math.abs(i - c) * 150;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    // the eight milestones of a trip: the terms shown at its eight eighths
    function milestones(n) {
      const path = Wx.tripPath(n, homes), s0 = tripStart(n);
      return Array.from({ length: 8 }, (_, i) => { const f = (i + 0.5) / 8, ms = s0 + f * TRIP, k = Math.floor(ms / WIN), q = Wx.alongPath(path, f);
        return { term: travelTerm(path, f, k), f, lat: q.lat, lon: q.lon, ms }; });
    }
    function at(ms) {
      const PH = Wx.homagePhase(ms, cfg), k = Math.floor(ms / WIN), p = (ms % WIN) / WIN, r = rng(k, 0x7a3);
      const base = { k, p, ms, PH };
      if (PH.state === 'travel') {
        const term = travelTerm(PH.path, PH.f, k);
        return Object.assign(base, { mode: 'entry', term, lost: term.status === 'lost', field: k % 2 ? 'gr' : 't', move: term.move });
      }
      const m = PH.since / 6e4, h = PH.home;
      const lastTrip = h === 1 ? 2 * PH.week : 2 * PH.week - 1;
      if (m >= 1 && m < 4 && lastTrip >= 0) {
        const ms8 = milestones(lastTrip), q = (m - 1) / 3, i = Math.min(7, Math.floor(q * 8));
        return Object.assign(base, { mode: 'canto', n: lastTrip, p: q, list: ms8, step: i, term: ms8[i].term, field: 't', move: ms8[i].term.move, from: Wx.tripPath(lastTrip, homes).from, to: homes[h] });
      }
      if (m >= 4 && m < 13) {
        const term = shared[Math.floor(r() * shared.length)];
        return Object.assign(base, { mode: 'refrain', term, field: h === 0 ? 'gr' : 't', move: term.move });
      }
      const mh = (ms % 36e5) / 6e4;
      if (mh >= 30 && mh < 33 && E.length) {
        const e = E[Math.floor(ms / 36e5) % E.length], q = (mh - 30) / 3, step = Math.min(e.chain.length - 1, Math.floor(q * e.chain.length));
        return Object.assign(base, { mode: 'etym', p: q, etym: e, step, field: 'chain', move: 'still' });
      }
      const pool = r() < 0.5 && pools[h].length ? pools[h] : T;
      const term = pool[Math.floor(r() * pool.length)];
      return Object.assign(base, { mode: 'entry', term, lost: term.status === 'lost', field: h === 0 ? 'gr' : 't', move: term.move });
    }
    // the word that grows in the field now: the term in one tongue, then the other (or the chain, step by step)
    function fieldWord(L) {
      if (L.mode === 'etym') return L.etym.chain[L.step][0];
      const first = L.field === 'gr' ? L.term.gr : L.term.t, second = L.field === 'gr' ? L.term.t : L.term.gr;
      return L.mode === 'canto' ? L.term.t : L.p < 0.5 ? first : second;
    }
    return { at, milestones, fieldWord, terms: T, etymology: E, WIN, tripStart };
  }

  const api = { create, text, width, norm, wrap, glyph, STATUS, yearWords, WIN };
  global.Lexicon = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
