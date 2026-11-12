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
    const h = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'centre';
    const v = y < 0.34 ? 'upper' : y > 0.66 ? 'lower' : 'middle';
    return v === 'middle' && h === 'centre' ? 'the middle' : (v === 'middle' ? 'the ' + h : h === 'centre' ? 'the ' + v : v + ' ' + h);
  }
  function span(x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0;
    if (w > 0.9 && h > 0.9) return 'the whole sheet';
    if (w > 0.9) return 'a band across the sheet, ' + PCT(h) + ' of its height';
    if (h > 0.9) return 'a band down the sheet, ' + PCT(w) + ' of its width';
    return PCT(w) + ' by ' + PCT(h) + ', at ' + where((x0 + x1) / 2, (y0 + y1) / 2);
  }
  const KINDWORD = { light: 'a light mass', dark: 'a dark mass', color: 'a colour island', sparse: 'a scattered field' };
  const CONFIGWORD = {
    value_opposition: ['value opposition', 'the strongest light-against-dark the reader found'],
    cross_axes: ['crossed axes', 'two fields whose directions disagree'],
    detail_interval: ['detail interval', 'the gap between where the detail gathers and where it does not'],
    color_recurrence: ['colour recurrence', 'the same colour found twice, apart'],
    subject_field: ['subject field', 'the field the reader measured as the densest'],
  };
  const SHAPEWORD = { silhouette: 'as its measured silhouette', block: 'as a block filling its box', island: 'as an island on its own axis' };

  function narrate(read, brief, score, opts) {
    opts = opts || {};
    const out = [];
    const add = function (phase, at, tech, plain, data) { out.push({ phase: phase, at: at, tech: tech, plain: plain, data: data || null }); };

    // ---- what was read
    if (read) {
      add('read', 0,
        'image ' + read.px[0] + '×' + read.px[1] + ' px, ' + read.source + ', sha256 ' + read.sha256.slice(0, 12) + '…, read ' + String(read.read_on).slice(0, 10) + ' by ' + read.reader,
        'The reader measured a photograph of the painting, ' + read.px[0] + ' by ' + read.px[1] + ' pixels, held by ' + read.source + '. It identifies nothing and traces nothing: it reports where the colour and the weight lie.',
        { px: read.px, sha256: read.sha256 });
      add('read', 0,
        'clusters → 5, shares ' + read.shares.map(PCT).join(' / ') + ', map6 [' + read.map6.join(',') + ']',
        'It sorted the picture into six colours and reduced them to five, the two nearest being merged. They hold ' + read.shares.map(PCT).join(', ') + ' of the surface.',
        { shares: read.shares });
      (read.fields || []).forEach(function (f) {
        const id = f[0], kind = f[1], occ = f[2], x0 = f[3], y0 = f[4], x1 = f[5], y1 = f[6], axis = f[9], vr = f[10];
        add('read', 0,
          id + ' ' + kind + ', occ ' + occ + ', box ' + [x0, y0, x1, y1].join(' ') + ', axis ' + (axis === null ? '—' : DEG(axis)) + ', ' + (vr ? vr.toFixed(2) + ':1' : '—'),
          KINDWORD[kind] + ' filling ' + PCT(occ) + ' of ' + span(x0, y0, x1, y1) +
            (axis === null || axis === undefined ? '' : ', running at ' + DEG(axis)) +
            (vr > 1.6 ? ', ' + vr.toFixed(1) + ' times longer than it is wide' : ''),
          { field: id });
      });
      (read.configs || []).forEach(function (c) {
        const w = CONFIGWORD[c[1]] || [c[1], c[1]];
        add('read', 0, c[0] + ' ' + c[1] + ' ' + c[2].join('↔'),
          'It also found a ' + w[0] + ' between ' + c[2].join(' and ') + ': ' + w[1] + '.', { config: c[0] });
      });
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
        'The largest or lightest of the five becomes the ground: the sheet is poured in that colour first, and the rest is laid over it.',
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

    // ---- what happens, in order
    const evs = (score.events || []).slice().sort(function (a, b) {
      return (a.t !== undefined ? a.t : a.t0) - (b.t !== undefined ? b.t : b.t0);
    });
    evs.forEach(function (e) {
      const at = e.t !== undefined ? e.t : e.t0;
      const w = e.why || {};
      let tech, plain;
      if (e.type === 'zone') {
        tech = 'step ' + at + ': lay ' + (w.field || 'a mass') + ' (' + (w.kind || '?') + ', occ ' + w.occ + ', ' + (w.as || '?') + ') at ' + e.cx.toFixed(3) + ',' + e.cy.toFixed(3) + ', channel ' + e.chan;
        plain = 'It pours ' + (KINDWORD[w.kind] || 'a mass') + ' — ' + (w.field || '') + ' — ' + (SHAPEWORD[w.as] || '') + ', at ' + where(e.cx, 1 - e.cy) + '.';
      } else if (e.type === 'pour') {
        tech = 'step ' + at + ': dab, pigment ' + e.pig + ', r ' + e.r.toFixed(3) + ', at ' + e.x.toFixed(3) + ',' + e.y.toFixed(3) + (w.what ? ' — ' + w.what : '');
        plain = 'A dab of ' + (w.colour || 'a measured colour') + ' at ' + where(e.x, 1 - e.y) + (w.what ? ': ' + w.what + '.' : '.');
      } else {
        const span2 = 'steps ' + e.t0 + '–' + e.t1;
        if (w.grain) {
          tech = span2 + ': comb at ' + DEG(w.deg) + ', share ' + w.share + ', ' + w.place;
          plain = 'The hand combs the whole sheet at ' + DEG(w.deg) + ', following the picture’s own grain' + (w.place === 'second' ? ', more lightly, because that direction is the weaker of the two' : '') + '.';
        } else if (w.config) {
          const cw = CONFIGWORD[w.kind] || [w.kind, ''];
          tech = span2 + ': ' + w.config + ' ' + w.kind + ' ' + (w.pair || []).join('↔') + (w.along ? ' along ' + w.along + ' @' + DEG(w.axis) : '') + ', rank ' + w.rank;
          plain = 'It makes the ' + cw[0] + ' between ' + (w.pair || []).join(' and ') +
            (w.along ? ', combing along ' + w.along + '’s own direction of ' + DEG(w.axis) : ', dragging paint from one to the other') +
            (w.rank >= 0.95 ? '. This is the heaviest relation the reader found, so it is made first and hardest.' : w.rank < 0.4 ? '. This is among the slightest, so it is made last and lightest.' : '.');
        } else if (w.cell) {
          tech = span2 + ': scribble in cell ' + w.cell.join(',') + ', share ' + w.share + ', ' + w.place;
          plain = 'It scribbles into the ' + where(w.cell[0] / 3 + 0.17, w.cell[1] / 3 + 0.17) + ', where the reader found the ' + (w.place === 'busiest' ? 'most' : 'next most') + ' detail.';
        } else if (w.field) {
          tech = span2 + ': ' + (w.kind || '') + ' at ' + w.field + (w.what ? ' — ' + w.what : '');
          plain = (w.what ? w.what.charAt(0).toUpperCase() + w.what.slice(1) : 'A stroke at ' + w.field) + '.';
        } else {
          tech = span2 + ': ' + (w.via || 'stroke') + (w.what ? ' — ' + w.what : '');
          plain = (w.what ? w.what.charAt(0).toUpperCase() + w.what.slice(1) : 'A stroke') + (w.via === 'echo' ? ', repeating an earlier gesture because the interpretation asked for an echo' : '') + '.';
        }
      }
      add('pour', at, tech, plain, { type: e.type, why: e.why });
    });
    return out;
  }
  g.PouredGroundNarrate = narrate;
  if (g.PouredGround) g.PouredGround.narrate = narrate;
})(typeof window !== 'undefined' ? window : globalThis);
