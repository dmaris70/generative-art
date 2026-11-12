// An account of a generation, in two registers, generated from the record rather than written
// about it. Every sentence carries a value that came out of the reading, the brief or the score;
// nothing here is decorative, and nothing is inferred. PG.narrate(read, brief, score, opts) returns
// ordered steps: the reading and the brief first (at step 0), then every event at the step it fires.
(function (g) {
  const PCT = function (x) { return Math.round(x * 100) + '%'; };
  const DEG = function (d) { return Math.round(d) + '°'; };
  const X3 = function (x) { return (Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, '') + '×'; };

  // where a point sits, in words a reader can check against the number
  function where(x, y) {
    const h = x < 0.3 ? 'left' : x > 0.7 ? 'right' : 'centre';
    const v = y < 0.3 ? 'high' : y > 0.7 ? 'low' : 'mid';
    if (h === 'centre' && v === 'mid') return 'in the middle';
    if (h === 'centre') return v === 'high' ? 'across the top' : 'across the bottom';
    if (v === 'mid') return 'down the ' + h + ' side';
    return (v === 'high' ? 'high ' : 'low ') + h;
  }
  // a share of the surface, as a reader would say it
  function part(a) {
    return a >= 0.47 ? 'nearly half the surface' : a >= 0.38 ? 'two fifths of the surface'
      : a >= 0.28 ? 'about a third of the surface' : a >= 0.22 ? 'about a quarter of the surface'
      : a >= 0.17 ? 'about a fifth of the surface' : a >= 0.12 ? 'about a seventh of the surface'
      : a >= 0.08 ? 'about a tenth of the surface' : a >= 0.05 ? 'a twentieth of the surface'
      : 'a sliver of the surface';
  }
  const KINDWORD = { light: 'a light mass', dark: 'a dark mass', color: 'a colour island', sparse: 'a scattered field' };
  const SHORT = { light: 'the light mass', dark: 'the dark mass', color: 'a colour island', sparse: 'the scattered field' };
  const CONFIGWORD = {
    value_opposition: ['value opposition', 'the strongest light-against-dark it found'],
    cross_axes: ['crossed axes', 'two fields whose directions disagree'],
    detail_interval: ['detail interval', 'the gap between where the detail gathers and where it does not'],
    color_recurrence: ['colour recurrence', 'the same colour found twice, apart'],
    subject_field: ['subject field', 'the field it measured as densest'],
  };
  const SHAPEWORD = { silhouette: 'as its measured silhouette', block: 'as a block filling its box', island: 'as an island on its own axis' };
  const COUNT = ['', 'a single stroke', 'two strokes', 'three strokes', 'four strokes', 'five strokes', 'six strokes', 'seven strokes', 'eight strokes', 'nine strokes'];
  function strokes(n) { return n < COUNT.length ? COUNT[n] : n + ' strokes'; }

  function narrate(read, brief, score, opts) {
    opts = opts || {};
    const out = [];
    const add = function (phase, at, tech, plain, data) { out.push({ phase: phase, at: at, tech: tech, plain: plain, data: data || null }); };

    // ---- what was read
    if (read && read.shares && read.px) {
      add('read', 0,
        'image ' + read.px[0] + '×' + read.px[1] + ' px, ' + read.source + ', sha256 ' + read.sha256.slice(0, 12) + '…, read ' + String(read.read_on).slice(0, 10) + ' by ' + read.reader,
        'The reader measured a photograph of the painting, ' + read.px[0] + ' by ' + read.px[1] + ' pixels, held by ' + read.source + '. It identifies nothing and traces nothing: it reports where the colour and the weight lie.',
        { px: read.px, sha256: read.sha256 });
      add('read', 0,
        'clusters → 5, shares ' + read.shares.map(PCT).join(' / ') + ', map6 [' + read.map6.join(',') + ']',
        'It sorted the picture into six colours and reduced them to five, the two nearest being merged. They hold ' + read.shares.map(PCT).join(', ') + ' of the surface.',
        { shares: read.shares });
      (Array.isArray(read.fields) ? read.fields : []).forEach(function (f) {
        const id = f[0], kind = f[1], occ = f[2], x0 = f[3], y0 = f[4], x1 = f[5], y1 = f[6], cx = f[7], cy = f[8], axis = f[9], vr = f[10];
        add('read', 0,
          id + ' ' + kind + ', occ ' + occ + ', box ' + [x0, y0, x1, y1].join(' ') + ', centroid ' + cx + ',' + cy + ', axis ' + (axis === null ? '\u2014' : DEG(axis)) + ', ' + (vr ? vr.toFixed(2) + ':1' : '\u2014'),
          (KINDWORD[kind] || 'a field').charAt(0).toUpperCase() + (KINDWORD[kind] || 'a field').slice(1) + ' (' + id + ') covers ' + part(f[2]) + ', ' + where(cx, cy) +
            (axis === null || axis === undefined ? '' : ', leaning at ' + DEG(axis)) +
            (vr > 1.8 ? ' and ' + vr.toFixed(1) + ' times longer than it is wide' : '') + '.',
          { field: id, kind: kind });
      });
      if (Array.isArray(read.configs) && read.configs.length) {
        const names = read.configs.map(function (c) { return (CONFIGWORD[c[1]] || [c[1]])[0] + ' (' + c[2].join('\u2013') + ')'; });
        add('read', 0, read.configs.map(function (c) { return c[0] + ' ' + c[1] + ' ' + c[2].join('\u2194'); }).join('; '),
          'It then names the relations between those fields: ' + names.join(', ') + '. Each one becomes a gesture, and nothing else does.',
          { configs: read.configs });
        read.configs.forEach(function (c) {
          const w = CONFIGWORD[c[1]] || [c[1], ''];
          add('read', 0, '  ' + c[0] + ': ' + c[1] + ' = ' + c[2].join(' \u2194 '),
            w[0].charAt(0).toUpperCase() + w[0].slice(1) + ': ' + w[1] + '.', { config: c[0] });
        });
      }
      if (read.ebins) {
        const top = read.ebins.map(function (v, i) { return [v, i * 22.5]; }).sort(function (a, b) { return b[0] - a[0]; });
        add('read', 0, 'grain: ' + top.slice(0, 2).map(function (b) { return DEG(b[1]) + ' ' + PCT(b[0]); }).join(', ') + ', density ' + read.edges[2],
          'The picture’s grain runs mostly at ' + DEG(top[0][1]) + ' — ' + PCT(top[0][0]) + ' of its strong edges — with ' + PCT(top[1][0]) + ' at ' + DEG(top[1][1]) + '.',
          { ebins: read.ebins });
      }
      if (read.cells && read.cells.length === 9) {
        const o = read.cells.map(function (d, i) { return [d, i]; }).sort(function (a, b) { return b[0] - a[0]; })[0];
        add('read', 0, 'detail by ninth, busiest cell ' + o[1] + ' at ' + PCT(o[0]),
          'Of the nine parts of the picture, the ' + where((o[1] % 3) / 3 + 0.17, Math.floor(o[1] / 3) / 3 + 0.17) + ' holds the most detail, ' + PCT(o[0]) + ' of it.',
          { cell: o[1] });
      }
    }

    // ---- what it says to the hand
    if (brief) {
      add('say', 0, 'ground = cluster ' + score.g + (read ? ' (' + read.colors[score.g] + ')' : ''),
        'The colour that covers most of the painting becomes the ground' + (read ? ' \u2014 here ' + read.colors[score.g] + ', ' + PCT(read.shares[score.g]) + ' of the surface' : '') + '. The sheet is poured in it first, and everything else is laid over it.',
        { ground: score.g });
      const z = brief.z || [], m = brief.m || [];
      add('say', 0, z.length + ' zones, ' + m.length + ' gestures' + (brief.r && brief.r.length ? ', ' + brief.r.length + ' reserve(s)' : ''),
        'From that the hand is given ' + z.length + ' masses to lay and ' + m.length + ' gestures to make. Everything below comes from a measurement; nothing is added for effect.',
        null);
    }

    // ---- what the interpretation did
    if (score && score.readings && score.readings.length) {
      add('interpret', 0, 'interp ' + (score.interp === undefined ? '?' : score.interp.toFixed(2)) + ': ' + score.readings.join('; '),
        'Before pouring, the layout was taken ' + (score.interp >= 0.8 ? 'a long way' : score.interp >= 0.45 ? 'some way' : 'a short way') + ' from what was measured: ' + score.readings.join(', ') + '.',
        { readings: score.readings });
    } else if (score) {
      add('interpret', 0, 'interp ' + (score.interp || 0).toFixed(2) + ': none applied',
        'The layout is poured as it was measured: nothing was moved, turned, split or exchanged.', null);
    }

    // ---- what happens, in order. Consecutive events that share a provenance are one step: a
    // configuration becomes a burst of strokes, and saying the same sentence seven times is noise.
    const byField = {};
    (read && read.fields || []).forEach(function (f) { byField[f[0]] = f; });
    const evs = (score.events || []).slice().sort(function (a, b) {
      return (a.t !== undefined ? a.t : a.t0) - (b.t !== undefined ? b.t : b.t0);
    });
    const groups = [];
    evs.forEach(function (e) {
      const k = e.type + '|' + JSON.stringify(e.why || {});
      const last = groups[groups.length - 1];
      if (last && last.k === k && e.type !== 'zone') { last.n++; last.to = e.t1 !== undefined ? e.t1 : e.t; return; }
      groups.push({ k: k, e: e, n: 1, from: e.t !== undefined ? e.t : e.t0, to: e.t !== undefined ? e.t : e.t1 });
    });
    groups.forEach(function (gr) {
      const e = gr.e, w = e.why || {}, n = gr.n;
      const many = n > 1 ? ' \u00d7' + n : '';
      let tech, plain;
      if (e.type === 'zone') {
        const f = byField[w.field];
        const place = f ? where(f[7], f[8]) : where(e.cx, 1 - e.cy);
        tech = 'step ' + gr.from + ': lay ' + (w.field || 'a mass') + ' (' + (w.kind || '?') + ', occ ' + w.occ + ', ' + (w.as || '?') + ') at ' + e.cx.toFixed(3) + ',' + e.cy.toFixed(3) + ', channel ' + e.chan;
        plain = 'It pours ' + (SHORT[w.kind] || 'a mass') + (w.field ? ' (' + w.field + ')' : '') + ' ' + place + ', ' + (SHAPEWORD[w.as] || 'as measured') + '.';
      } else if (e.type === 'pour') {
        tech = 'steps ' + gr.from + (n > 1 ? '\u2013' + gr.to : '') + ': ' + n + ' dab' + (n > 1 ? 's' : '') + ', pigment ' + e.pig + ', r ' + e.r.toFixed(3) + (w.what ? ' \u2014 ' + w.what : '');
        plain = (n > 1 ? n + ' dabs' : 'A dab') + ' of ' + (w.colour || 'a measured colour') + ', ' + where(e.x, 1 - e.y) + (w.what ? ' \u2014 ' + w.what : '') + '.';
      } else {
        const sp = 'steps ' + gr.from + '\u2013' + gr.to;
        if (w.grain) {
          tech = sp + ': comb at ' + DEG(w.deg) + ', share ' + w.share + ', ' + w.place + many;
          plain = 'It combs the whole sheet at ' + DEG(w.deg) + ' in ' + strokes(n) + ', following the picture\u2019s own grain' +
            (w.place === 'second' ? ', more lightly: that direction is the weaker of the two' : '') + '.';
        } else if (w.config) {
          const cw = CONFIGWORD[w.kind] || [w.kind, ''];
          const names = (w.pair || []).map(function (id) { const f = byField[id]; return (f ? (SHORT[f[1]] || 'a field') : 'a field') + ' (' + id + ')'; });
          tech = sp + ': ' + w.config + ' ' + w.kind + ' ' + (w.pair || []).join('\u2194') + (w.along ? ' along ' + w.along + ' @' + DEG(w.axis) : '') + ', rank ' + w.rank + many;
          plain = 'It makes the ' + cw[0] + ' between ' + names.join(' and ') + ' in ' + strokes(n) +
            (w.along ? ', combed along ' + w.along + '\u2019s own direction of ' + DEG(w.axis) : ', dragging paint from one to the other') +
            (w.rank >= 0.95 ? '. This is the heaviest relation in the picture, so it is made first and hardest.'
              : w.rank < 0.4 ? '. This is among the slightest, so it is made late and lightly.' : '.');
        } else if (w.cell) {
          tech = sp + ': scribble in cell ' + w.cell.join(',') + ', share ' + w.share + ', ' + w.place + many;
          plain = 'It scribbles ' + where(w.cell[0] / 3 + 0.17, w.cell[1] / 3 + 0.17) + ' in ' + strokes(n) + ', where it found the ' + (w.place === 'busiest' ? 'most' : 'next most') + ' detail.';
        } else if (w.field) {
          const f = byField[w.field];
          tech = sp + ': ' + (w.kind || '') + ' at ' + w.field + (w.what ? ' \u2014 ' + w.what : '') + many;
          plain = 'It works ' + (f ? where(f[7], f[8]) : 'the field') + ' in ' + strokes(n) + ': ' + (w.what || 'a stroke at ' + w.field) + '.';
        } else {
          tech = sp + ': ' + (w.via || 'stroke') + (w.what ? ' \u2014 ' + w.what : '') + many;
          plain = (w.what ? w.what.charAt(0).toUpperCase() + w.what.slice(1) : 'A stroke') + ' in ' + strokes(n) +
            (w.via === 'echo' ? ', repeating an earlier gesture because the interpretation called for an echo' : '') + '.';
        }
      }
      add('pour', gr.from, tech, plain, { type: e.type, why: e.why, n: n, from: gr.from, to: gr.to });
    });
    return out;
  }
  g.PouredGroundNarrate = narrate;
  if (g.PouredGround) g.PouredGround.narrate = narrate;
})(typeof window !== 'undefined' ? window : globalThis);
