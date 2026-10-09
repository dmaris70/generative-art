/*
 * canon.js — the listening canon: one drawing per musical work.
 *
 * Reads the DMCF collection (data/dmcf-v1.csv) and associates every work with a
 * generative drawing. The association is total and deterministic:
 *
 *   - the SEED is a hash of the work's catalogue id — the same piece always
 *     produces the same drawing, forever;
 *   - the SYSTEM (SYS-001…020, the collection's own taxonomy of music-making)
 *     chooses the visual grammar — each musical system's generative principle is
 *     re-stated as a drawing principle;
 *   - the PHASE (early / peak / diffusion / revival) applies one grammatical
 *     transformation to the whole composition;
 *   - the YEAR sets the diagonal of the sheet — 1900 shallow, 2020s steep.
 *
 * System identities are INFERRED from the works filed under them (Cage and
 * stochastic programs under 001, Schaeffer under 006, Radigue under 012…).
 * If the collection's own definitions differ, correct the texts here.
 *
 * Depends on marks.js (the drawing vocabulary) and strokefont.js (lettering).
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------ systems
  //
  // For each: what the music does and why it was made (principle / practice),
  // and how the drawing re-states it (drawing). The recipe returns layers for
  // the studio's element vocabulary: [type, params, pen].
  //
  // Pens: 0 ink · 1 sanguine · 2 blue · 3 sepia  (phase grammar recolors below)

  const SYSTEMS = {
    'SYS-001': {
      name: 'Chance & Algorithm',
      principle: 'Composition handed to procedure — Cage tossing coins through the I Ching, Stockhausen’s mobile Klavierstück XI, stochastic programs, live code. Born of a mid-century wish to get taste out of the way and let a rule-set speak.',
      practice: 'These pieces fix a procedure, not a result: every performance or run is one sample from a space of possibilities.',
      drawing: 'The sheet is one seed of a rule-set. Marks land where the seeded generator puts them — order without intention, different at every seed, identical at the same one.',
      recipe: (R, A) => [
        ['rulings', { density: 70 + Math.round(R() * 50), angle: A, dot: 5 + R() * 4, drift: 0.6 + R() * 0.3, vertical: 0.3 + R() * 0.3, mirror: R() < 0.5 ? 1 : 0 }, 0],
        ['bars', { count: 6 + Math.round(R() * 8), length: 0.12, weight: 5 + Math.round(R() * 4), frags: 3, spread: 0.3, tilt: Math.round(R() * 24 - 12), occlude: 1 }, 0],
      ],
    },
    'SYS-002': {
      name: 'Serial Order',
      principle: 'Total organization: an ordered row governs pitch, then dynamics and duration too — Babbitt, Kreuzspiel, Dallapiccola. Built after 1945 as a reconstruction of music from axioms.',
      practice: 'Everything audible is derived from permutations of one ordered set; nothing is free, everything is accounted for.',
      drawing: 'A twelve-column grid with near-zero jitter; every interval derived, every mark in its row. The permutation is the picture.',
      recipe: (R, A) => [
        ['grid', { cols: 12, rows: 6 + Math.round(R() * 3), jitter: 0.02, split: 0.15, depth: 1, weight: 1 }, 0],
        ['rulings', { density: 44, angle: A, dot: 3, drift: 0.06, vertical: 1, mirror: 0 }, 0],
        ['bars', { count: 5, length: 0.08, weight: 3, frags: 1, spread: 0.02, tilt: 0, occlude: 1 }, 0],
      ],
    },
    'SYS-003': {
      name: 'Process & Pattern',
      principle: 'Interlocking modules, repeated and slowly changed — In C, kecak, Glass’s additive lines, Fullman’s long strings. The rule is simple; the accumulation is not.',
      practice: 'They make the process itself audible: you hear the mechanism working, cycle against cycle.',
      drawing: 'Two ruling families a few degrees apart. Neither is the piece — the interference between them is.',
      recipe: (R, A) => [
        ['rulings', { density: 55, angle: A, dot: 2.5, drift: 0.15, vertical: 0, mirror: 0 }, 0],
        ['rulings', { density: 55, angle: Math.min(90, A + 4), dot: 2.5, drift: 0.15, vertical: 0, mirror: 0 }, 0],
      ],
    },
    'SYS-004': {
      name: 'The Score as Prompt',
      principle: 'Graphic and verbal notation — Wolff’s cueing games, Braxton’s diagrams, Cardew’s Great Learning. The score stops prescribing sounds and starts prescribing situations.',
      practice: 'Players complete the work; the notation is an invitation with rules.',
      drawing: 'A field of prompts — subdivided frames and loose gestures — deliberately unfinished. The empty regions are the interpreter’s share.',
      recipe: (R, A) => [
        ['grid', { cols: 4 + Math.round(R() * 2), rows: 3, jitter: 0.15, split: 0.75, depth: 3, weight: 1 }, 0],
        ['flow', { count: 14, steps: 40, scale: 1.0, step: 5, turns: 1.2, dash: 1 }, 0],
        ['bars', { count: 3, length: 0.1, weight: 4, frags: 2, spread: 0.3, tilt: Math.round(R() * 20 - 10), occlude: 1 }, 0],
      ],
    },
    'SYS-005': {
      name: 'The Computed Sound',
      principle: 'Sound calculated rather than performed — Bell Labs synthesis, Risset’s illusions, HPSCHD’s subroutines, data made audible in Earth’s Magnetic Field. The computer promised any specifiable sound.',
      practice: 'Each piece makes a function audible; the score is source code, the performance a run.',
      drawing: 'Plotted traces: long computed curves through a field, a dashed layer riding them like sample points, sparse verticals as graph rules.',
      recipe: (R, A) => [
        ['rulings', { density: 16, angle: A, dot: 8, drift: 0.05, vertical: 1, mirror: 0 }, 0],
        ['flow', { count: 50, steps: 220, scale: 0.8, step: 3.5, turns: 0.9, dash: 0 }, 0],
        ['flow', { count: 26, steps: 120, scale: 0.8, step: 3.5, turns: 0.9, dash: 1 }, 0],
      ],
    },
    'SYS-006': {
      name: 'Cut Tape',
      principle: 'Musique concrète — Schaeffer, 1948: recorded sound as raw material, cut, spliced, reversed, transformed; listening reduced to the sound itself, origin bracketed away.',
      practice: 'The pieces are montages: fragments of the recorded world reorganized entirely by ear.',
      drawing: 'Splices. Fragmented heavy bars at competing tilts over a thin ruled ground — composition by cutting, the edit as the mark.',
      recipe: (R, A) => [
        ['rulings', { density: 22, angle: A, dot: 6, drift: 0.4, vertical: 0.4, mirror: 0 }, 0],
        ['bars', { count: 14, length: 0.2, weight: 6, frags: 5, spread: 0.38, tilt: 8 + Math.round(R() * 8), occlude: 1 }, 0],
        ['bars', { count: 8, length: 0.16, weight: 5, frags: 4, spread: 0.3, tilt: -(6 + Math.round(R() * 8)), occlude: 1 }, 0],
      ],
    },
    'SYS-007': {
      name: 'The Framed Field',
      principle: 'Field recording as composition — Presque rien, Lockwood’s river sound-maps, Winderen’s hydrophones. The recordist chooses where and when to listen; the place plays.',
      practice: 'What is composed is the frame: a duration, a location, an attention.',
      drawing: 'A terrain of broken contour rings with one long path walked across it — a sound map with the listener’s route drawn in.',
      recipe: (R, A) => [
        ['rings', { count: 16, radius: 0.5, x: 0.35 + R() * 0.3, y: 0.35 + R() * 0.3, wobble: 0.45, broken: 0.75, occlude: 0 }, 0],
        ['flow', { count: 6, steps: 320, scale: 0.55, step: 4, turns: 0.5, dash: 0 }, 0],
      ],
    },
    'SYS-008': {
      name: 'Loop & Feedback',
      principle: 'Tape loops drifting out of phase (Reich), delay lines feeding back on themselves (Oliveros, Frippertronics, Discreet Music). A short cell plus a copying machine equals form.',
      practice: 'Accumulation and drift do the composing; the musician sets the loop and tends it.',
      drawing: 'One family of near-parallel lines, repeated and slowly drifting. The moiré where copies disagree is the phasing made visible.',
      recipe: (R, A) => [
        ['rulings', { density: 110, angle: 4 + R() * 6, dot: 7, drift: 0.3, vertical: 0, mirror: 0 }, 0],
      ],
    },
    'SYS-009': {
      name: 'The Word Unmade',
      principle: 'Sound poetry — Ursonate, Jandl, Gysin’s permutation poems: language stripped of meaning until only its sound and rhythm remain, permutation as the engine.',
      practice: 'Syllables become material; the mouth becomes an instrument; sense is optional.',
      drawing: 'The work’s own title, broken into syllables and permuted across the sheet in single-stroke type — the piece’s name unmade the way it unmade language.',
      recipe: (R, A, work, helpers) => {
        const layers = [['rulings', { density: 12, angle: A, dot: 9, drift: 0.3, vertical: 0.5, mirror: 0 }, 0]];
        const syl = helpers.syllables(work.title, R);
        for (let i = 0; i < syl.length; i++) {
          layers.push(['label', { size: 12 + Math.round(R() * 26), x: 0.05 + R() * 0.75, y: 0.08 + R() * 0.8, weight: R() < 0.3 ? 2 : 1, occlude: 1 }, 0, syl[i]]);
        }
        return layers;
      },
    },
    'SYS-010': {
      name: 'Speech Made Music',
      principle: 'The spoken voice as musical material — Dodge’s synthetic Speech Songs, Reich transcribing the melody of testimony in Different Trains, Ashley’s talking operas.',
      practice: 'They notate the tune already present in talk, then orchestrate it.',
      drawing: 'Wobbly near-horizontal rulings like pitch traces, with the title’s words set beneath them — speech above, its transcription below.',
      recipe: (R, A, work, helpers) => {
        const layers = [['rulings', { density: 16, angle: 4 + R() * 5, dot: 12, drift: 0.55, vertical: 0, mirror: 0 }, 0]];
        const words = helpers.words(work.title).slice(0, 4);
        words.forEach((w, i) => {
          layers.push(['label', { size: 13, x: 0.04 + i * 0.24, y: 0.9, weight: 1, occlude: 1 }, 0, w]);
        });
        return layers;
      },
    },
    'SYS-011': {
      name: 'Drawn Sound',
      principle: 'Score as image, image as sound — Wehinger’s listening score for Artikulation, Oram drawing sound directly onto film, Ikeda’s data graphics. Eye and ear share one notation.',
      practice: 'These works close the loop between seeing and hearing; the picture is playable.',
      drawing: 'The literal case: a graphic score of bars, arcs, a hatched mass and sparse rulings — marks composed to be read as sound.',
      recipe: (R, A) => [
        ['rulings', { density: 18, angle: A, dot: 7, drift: 0.15, vertical: 0.6, mirror: 0 }, 0],
        ['hatch', { angle: 20 + R() * 40, spacing: 6, size: 0.2, x: 0.25 + R() * 0.5, y: 0.3 + R() * 0.4, cross: 0, outline: 1, occlude: 1 }, 0],
        ['rings', { count: 4, radius: 0.12, x: 0.2 + R() * 0.6, y: 0.2 + R() * 0.5, wobble: 0.1, broken: 0.5, occlude: 0 }, 0],
        ['bars', { count: 9, length: 0.14, weight: 6, frags: 2, spread: 0.34, tilt: Math.round(R() * 30 - 15), occlude: 1 }, 0],
      ],
    },
    'SYS-012': {
      name: 'The Held Tone',
      principle: 'Drone and just intonation — Radigue, Conrad, Niblock, an hour inside one chord. Tuning ratios beat against each other; nothing happens, and everything does.',
      practice: 'They slow music down until only tuning remains audible.',
      drawing: 'Long unbroken rulings at one or two degrees. Where nearly-parallel lines approach, they beat — the interference pattern is the chord.',
      recipe: (R, A) => [
        ['rulings', { density: 120, angle: 2 + R() * 3, dot: 16, drift: 0.08, vertical: 0, mirror: 0 }, 0],
        ['rulings', { density: 60, angle: 3 + R() * 3, dot: 16, drift: 0.08, vertical: 0, mirror: 0 }, 0],
      ],
    },
    'SYS-013': {
      name: 'Modal Law',
      principle: 'Court modal systems — gamelan’s nested colotomic cycles, maqam and shashmaqam’s melodic law. Centuries of codified practice; mode as constitution, not scale.',
      practice: 'A performance unfolds a mode inside cyclic time — cycles within cycles, each with its gate.',
      drawing: 'Nested rings: the large cycle, the inner cycle, the gap where the mode opens. Wobble is low — the law is old and steady.',
      recipe: (R, A) => [
        ['rings', { count: 22, radius: 0.44, x: 0.5, y: 0.5, wobble: 0.08, broken: 0.15, occlude: 0 }, 0],
        ['rings', { count: 8, radius: 0.16, x: 0.5, y: 0.5, wobble: 0.05, broken: 0.3, occlude: 0 }, 0],
      ],
    },
    'SYS-014': {
      name: 'The Code Is the Piece',
      principle: 'sc140 and live coding: the whole work is a program short enough to read — a single SuperCollider statement of at most 140 characters. Running it is the performance; the tweet is the score.',
      practice: 'Source, score, title and piece are one object; anyone who runs the text gets the work, exactly.',
      drawing: 'The listing itself, set in single-stroke type — glyphs the font cannot carry drop out as glitches — over a thin computed trace: the program’s output running beneath its text.',
      recipe: (R, A, work, helpers) => {
        const layers = [
          ['flow', { count: 18, steps: 200, scale: 1.6, step: 3, turns: 0.12, dash: 1 }, 0],
        ];
        const code = String(work.title || '');
        const rows = [];
        for (let i = 0; i < code.length && rows.length < 9; i += 26) rows.push(code.slice(i, i + 26));
        rows.forEach((row, i) => {
          layers.push(['label', { size: 15, x: 0.04, y: 0.08 + i * 0.09, weight: 1, occlude: 1 }, 0, row]);
        });
        return layers;
      },
    },
    'SYS-015': {
      name: 'The Groove Engine',
      principle: 'Trance by repetition — vodou drumming, Jajouka, Robert Hood’s Minimal Nation, footwork. Repeat until repetition itself transports.',
      practice: 'The groove is the whole argument: small displacements inside a fixed pulse.',
      drawing: 'Ranked heavy bars at pulse intervals over a dense vertical ruling. The tiny misalignments are the swing.',
      recipe: (R, A) => [
        ['rulings', { density: 40, angle: A, dot: 3, drift: 0.1, vertical: 1, mirror: 0 }, 0],
        ['bars', { count: 18, length: 0.1, weight: 8, frags: 1, spread: 0.06, tilt: 0, occlude: 1 }, 0],
      ],
    },
    'SYS-019': {
      name: 'The Carried Song',
      principle: 'Oral lineage — raga, launeddas, Appalachian ballads, tanbur: music held in bodies and handed person to person. Each performance is the archive.',
      practice: 'The same melody, never identical; variation is how it survives.',
      drawing: 'A few long continuous lines, each a re-telling from its own seed — the same song, carried three ways.',
      recipe: (R, A) => [
        // flow's mean heading is π·turns — keep it low so the song runs across the
        // sheet like a melodic line, not off the bottom corner
        ['flow', { count: 3, steps: 400, scale: 1.2, step: 3, turns: 0.1, dash: 0 }, 0],
        ['flow', { count: 3, steps: 380, scale: 1.2, step: 3, turns: 0.12, dash: 0 }, 0],
        ['flow', { count: 3, steps: 360, scale: 1.2, step: 3, turns: 0.14, dash: 0 }, 0],
      ],
    },
    'SYS-021': {
      name: 'The Round',
      principle: 'Imitation as law — Moondog\u2019s rounds and canons: one line that must obey itself at a fixed distance. The rule is the entry; everything after is consequence. Opened by AMEND-055.',
      practice: 'Write one melody; the second voice is the first, later. Strictness is the medium.',
      drawing: 'The same circle three times, entering along a diagonal \u2014 identical wheels at a fixed delay. Low wobble: the law is strict. A sparse vertical pulse beneath, the snaketime meter.',
      recipe: (R, A) => [
        ['rulings', { density: 22, angle: A, dot: 6, drift: 0.08, vertical: 1, mirror: 0 }, 0],
        ['rings', { count: 8, radius: 0.24, x: 0.30, y: 0.38, wobble: 0.03, broken: 0.35, occlude: 0 }, 0],
        ['rings', { count: 8, radius: 0.24, x: 0.50, y: 0.50, wobble: 0.03, broken: 0.35, occlude: 0 }, 0],
        ['rings', { count: 8, radius: 0.24, x: 0.70, y: 0.62, wobble: 0.03, broken: 0.35, occlude: 0 }, 0],
      ],
    },
    'SYS-022': {
      name: 'The Comma',
      principle: 'Temperament as the piece \u2014 the ratios chosen before a note exists: just lattices, polymicrotonality, the scale as composition. The number is the medium. Opened by AMEND-055.',
      practice: 'Fix the tuning; the music is what the numbers permit, and the comma is where they refuse.',
      drawing: 'Two ruled fields almost aligned \u2014 close densities, two degrees apart. The moir\u00e9 where they disagree is the comma, drawn.',
      recipe: (R, A) => [
        ['rulings', { density: 58, angle: A, dot: 4, drift: 0.05, vertical: 0, mirror: 0 }, 0],
        ['rulings', { density: 61, angle: A + 2, dot: 4, drift: 0.05, vertical: 0, mirror: 0 }, 0],
      ],
    },
    'SYS-020': {
      name: 'The Sounding Room',
      principle: 'Resonance as instrument — Lucier’s long thin wire and echolocating rooms, Tudor’s Rainforest, Kirkegaard recording the ear hearing itself. The object or space composes.',
      practice: 'Excite a resonator; listen to what it, not you, decides to do.',
      drawing: 'Rings radiating from two source points over a faint ground. Where wavefronts cross, the room answers.',
      recipe: (R, A) => [
        ['rulings', { density: 10, angle: A, dot: 10, drift: 0.2, vertical: 0.5, mirror: 0 }, 0],
        ['rings', { count: 14, radius: 0.3, x: 0.3 + R() * 0.1, y: 0.35 + R() * 0.1, wobble: 0.05, broken: 0.1, occlude: 0 }, 0],
        ['rings', { count: 10, radius: 0.22, x: 0.62 + R() * 0.12, y: 0.58 + R() * 0.12, wobble: 0.05, broken: 0.1, occlude: 0 }, 0],
      ],
    },
  };

  // ------------------------------------------------------------ phase grammar
  //
  // One transformation, applied to the whole composition. Pens: the accent
  // colour names the phase, so a wall of these drawings reads chronologically.
  //   early     → the sketch: sparser, first layer in sepia
  //   peak      → the statement: full, all ink
  //   diffusion → the spread: a void opens, one layer turns blue
  //   revival   → the re-reading: the first layer re-drawn in sanguine on top

  const PHASES = {
    early: {
      note: 'early — the sketch: the system is young, the drawing sparser, its first layer in sepia.',
      apply: (layers, R) => {
        if (layers.length > 2) layers = layers.slice(0, layers.length - 1);
        const first = layers.find((l) => l[0] !== 'label');
        if (first) first[2] = 3;
        return layers;
      },
    },
    peak: {
      note: 'peak — the statement: the system at full strength, all ink.',
      apply: (layers) => layers,
    },
    diffusion: {
      note: 'diffusion — the spread: the system dissolves outward; a void opens and one layer turns blue.',
      apply: (layers, R) => {
        const structural = layers.filter((l) => l[0] !== 'label');
        if (structural.length > 1) structural[structural.length - 1][2] = 2;
        layers.unshift(['voidPatch', { size: 0.3 + R() * 0.2, x: 0.25 + R() * 0.5, y: 0.25 + R() * 0.5, wobble: 0.35, squash: 0.8 + R() * 0.8 }, 0]);
        return layers;
      },
    },
    revival: {
      note: 'revival — the re-reading: the first layer drawn again in sanguine, on top of the original.',
      apply: (layers, R) => {
        const first = layers.find((l) => l[0] !== 'label' && l[0] !== 'voidPatch');
        if (first) {
          const copy = [first[0], Object.assign({}, first[1]), 1, first[3]];
          if (copy[1].angle !== undefined) copy[1].angle = Math.min(90, copy[1].angle + 2);
          if (copy[1].x !== undefined) copy[1].x = Math.min(1, copy[1].x + 0.03);
          layers.push(copy);
        }
        return layers;
      },
    },
  };

  const PENS = [
    { name: 'ink', color: '#1a1a1a' },
    { name: 'sanguine (revival)', color: '#a83b2c' },
    { name: 'blue (diffusion)', color: '#2f4c86' },
    { name: 'sepia (early)', color: '#8a6a3d' },
  ];

  // ---------------------------------------------------------------- helpers

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const helpers = {
    // crude seeded syllabifier — chunks of 2–4 letters, permuted
    syllables: function (title, R) {
      const letters = String(title).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ');
      const words = letters.split(' ').filter(Boolean);
      const out = [];
      for (const w of words) {
        let i = 0;
        while (i < w.length) {
          const n = 2 + Math.floor(R() * 3);
          out.push(w.slice(i, i + n));
          i += n;
        }
      }
      // permute (Fisher–Yates on the seeded stream) and cap
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out.slice(0, 12);
    },
    words: function (title) {
      return String(title).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    },
  };

  // year → the sheet's diagonal: 1900 shallow, 2020s steep
  function yearAngle(year) {
    const y = Math.max(1900, Math.min(2030, Number(year) || 1960));
    return Math.round(15 + ((y - 1900) / 130) * 55);
  }

  // The full association for one work: layers + everything the caption needs.
  function generate(work) {
    const sys = SYSTEMS[work.system];
    if (!sys) return null;
    const seed = hashStr(work.work_id);
    const R = Marks._mulberry32(seed);
    const A = yearAngle(work.year);
    let layers = sys.recipe(R, A, work, helpers).map((l) => l.slice());
    const phase = PHASES[work.phase] || PHASES.peak;
    layers = phase.apply(layers, R);
    // every sheet carries its catalogue line and frame
    layers.push(['frame', { corners: 1, border: 0, rule: 0, ticks: 0, weight: 1 }, 0]);
    layers.push(['label', { size: 9, x: 0.0, y: 1.045, weight: 1, occlude: 0 }, 0,
                 work.work_id + ' ' + work.year + ' ' + work.system]);
    return { seed: seed, angle: A, layers: layers, phaseNote: phase.note, system: sys };
  }

  // ------------------------------------------------------------------- csv

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const head = splitCSVLine(lines[0]);
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i]);
      if (cells.length < 3) continue;
      const row = {};
      head.forEach((h, k) => { row[h] = cells[k] || ''; });
      if (row.work_id) out.push(row);
    }
    return out;
  }

  function splitCSVLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  global.Canon = {
    SYSTEMS: SYSTEMS,
    PHASES: PHASES,
    PENS: PENS,
    generate: generate,
    parseCSV: parseCSV,
    hashStr: hashStr,
    yearAngle: yearAngle,
  };
})(window);
