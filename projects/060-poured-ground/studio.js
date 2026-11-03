// Poured Ground — print studio. A purpose-built panel over the same engine as the piece:
// every control writes a GenArt parameter (so the URL is always the recipe), and the panel
// re-reads the engine's state after each rebuild. Sliders that change the simulation apply
// on release; surface sliders only re-render, so they apply live.
(function () {
  'use strict';
  const app = window.PouredGroundApp, G = app.G, PG = window.PouredGround, PALS = window.PALETTES;
  const $ = (id) => document.getElementById(id);

  const SIM = ['interp', 'pours', 'energy', 'flow', 'levelling', 'border'];
  const LIVE = ['relief', 'gloss', 'tooth', 'labelSize', 'gusts', 'wind', 'memory'];
  const fmt = {
    interp: (v) => v.toFixed(2), pours: (v) => String(v), energy: (v) => v.toFixed(2) + '×', flow: (v) => v.toFixed(3),
    levelling: (v) => v.toFixed(3), border: (v) => v + ' mm',
    relief: (v) => v.toFixed(2), gusts: (v) => v + ' · ' + (v * 2 * Math.PI / 1.25).toFixed(0) + ' s', wind: (v) => v.toFixed(2) + '×', memory: (v) => v.toFixed(2) + '×', labelSize: (v) => v.toFixed(2) + '×', gloss: (v) => v.toFixed(2), tooth: (v) => v.toFixed(3),
  };
  const set = (k, v) => G.setParams({ [k]: v });

  // ---------------------------------------------------------------- palettes
  const list = $('palettes');
  const seedRow = document.createElement('div');
  seedRow.className = 'pal seed';
  seedRow.dataset.id = '-1';
  seedRow.innerHTML = '<div class="strip"></div><div class="t"><b>Chosen by seed</b><span></span></div>';
  list.appendChild(seedRow);
  const rows = PALS.map(function (p) {
    const el = document.createElement('div');
    el.className = 'pal';
    el.dataset.id = p.id;
    el.setAttribute('role', 'option');
    el.title = p.artist + ', ' + p.painting + '\n' + p.colors.join('  ');
    el.innerHTML = '<div class="strip">' + p.colors.map((c) => '<i style="background:' + c + '"></i>').join('') +
      '</div><div class="t"><b></b><span></span></div>';
    el.querySelector('b').textContent = p.artist;
    el.querySelector('span').textContent = p.painting;
    el._key = (p.artist + ' ' + p.painting).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    list.appendChild(el);
    return el;
  });
  $('palCount').textContent = PALS.length + ' colorlisa · Colorist Archive';
  // ---- the Colorist Archive: 367 artists, each loaded on demand (meditationsincolor.com)
  const archHead = document.createElement('div'); archHead.className = 'arch-head';
  archHead.textContent = 'Colorist Archive — loading…'; list.appendChild(archHead);
  const artRows = [];
  const swatches = (c) => '<div class="strip">' + c.map((h) => '<i style="background:' + h + '"></i>').join('') + '</div>';
  function workRow(id, w) {
    const el = document.createElement('div'); el.className = 'pal'; el.dataset.id = id; el.setAttribute('role', 'option');
    el.innerHTML = swatches(w.c) + '<div class="t"><b></b><span></span></div>';
    el.querySelector('b').textContent = w.t; el.querySelector('span').textContent = (w.d || '') + (w.a ? '' : ' · proportions unknown');
    el.title = w.t + (w.d ? ', ' + w.d : '') + '\n' + w.c.join('  ');
    return el;
  }
  app.archive.index().then(function (ix) {
    archHead.textContent = 'Colorist Archive — ' + ix.artists.length + ' artists, ' + ix.total.toLocaleString() + ' works';
    $('palCount').textContent = (PALS.length + ix.total).toLocaleString() + ' works';
    ix.artists.forEach(function (a) {
      const row = document.createElement('div'); row.className = 'art';
      row.innerHTML = '<b></b><span></span>';
      row.querySelector('b').textContent = a.name; row.querySelector('span').textContent = a.dates + ' · ' + a.n;
      row._key = (a.name + ' ' + (a.mov || '') + ' ' + (a.nat || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const box = document.createElement('div'); box.className = 'art-works'; box.hidden = true;
      row.onclick = function () {
        if (!box.hidden) { box.hidden = true; return; }
        box.hidden = false;
        if (!box.childElementCount) {
          box.textContent = 'loading…';
          app.archive.artist(a.id).then(function (works) {
            box.textContent = '';
            works.forEach(function (w, i) { box.appendChild(workRow(app.archive.BASE + a.o + i, w)); });
            refresh();
          });
        }
      };
      list.appendChild(row); list.appendChild(box); artRows.push(row);
    });
  });
  list.addEventListener('click', function (e) {
    const el = e.target.closest('.pal');
    if (el) set('palette', +el.dataset.id);
  });
  $('palSearch').addEventListener('input', function () {
    const q = this.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    rows.forEach((el) => { el.hidden = q && el._key.indexOf(q) < 0; });
    artRows.forEach((el) => { el.hidden = q && el._key.indexOf(q) < 0; if (el.hidden) el.nextSibling.hidden = true; });
    seedRow.hidden = !!q;
  });

  // ---------------------------------------------------------------- segmented controls
  ['mode', 'ground', 'style', 'label', 'labelPos', 'original', 'collection', 'proportions', 'landscape', 'dpi', 'bits'].forEach(function (k) {
    $(k).addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (b) set(k, +b.dataset.v);
    });
  });

  // ---------------------------------------------------------------- sliders & selects
  SIM.concat(LIVE).forEach(function (k) {
    const input = $(k), val = input.parentNode.querySelector('.val');
    input.addEventListener('input', function () {
      val.textContent = fmt[k](+input.value);
      if (LIVE.indexOf(k) >= 0) set(k, +input.value);
      else if (k === 'border') spec(+input.value);
    });
    input.addEventListener('change', function () { set(k, +input.value); });
  });
  const fsel = $('format');
  PG.FORMAT_KEYS.forEach(function (name, i) { fsel.add(new Option(name, i)); });
  fsel.addEventListener('change', function () { set('format', +fsel.value); });
  $('simres').addEventListener('change', function () { set('simres', +this.value); });

  // ---------------------------------------------------------------- seed & actions
  const seedIn = $('seed');
  seedIn.addEventListener('change', function () {
    const s = seedIn.value.trim();
    G.setSeed(/^\d+$/.test(s) ? Number(s) : GenArt._hashStr(s));
  });
  $('seedPrev').onclick = () => G.setSeed((G.seed - 1) >>> 0);
  $('seedNext').onclick = () => G.setSeed((G.seed + 1) >>> 0);
  $('seedRand').onclick = () => G.randomize();
  $('generate').onclick = () => app.generate();
  $('finish').onclick = () => { app.finish(); };
  $('exportPrint').onclick = () => app.exportPrint();
  $('exportPreview').onclick = () => app.exportPreview();
  $('copyLink').onclick = function () {
    const b = this, done = () => { b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy link'; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
  };
  $('pieceLink').addEventListener('click', function () { this.href = './' + location.search; });
  // motion
  $('motionOn').addEventListener('click', function (e) { const b = e.target.closest('button'); if (b) app.setMotion(b.dataset.v === '1'); refresh(); });
  $('playPause').onclick = function () { app.setPlaying(!app.motion.playing); };
  $('restart').onclick = function () { app.restartMotion(); };
  $('recordLoop').onclick = function () { app.recordLoop(1080, 30); };
  const PHASES = {
    creation: 'creation — the pour, from the empty sheet',
    living: 'living — the gusts mix and reshape the liquid inside the canvas',
    ending: 'ending — the paper absorbs the paint, a little at a time',
  };
  $('chips').addEventListener('click', function (e) {
    const c = e.target.closest('.chip[data-pig]');
    if (c) app.pigment = +c.dataset.pig;
  });

  // ---------------------------------------------------------------- print spec
  function mb(bytes) { return bytes >= 1e9 ? (bytes / 1e9).toFixed(2) + ' GB' : (bytes / 1e6).toFixed(0) + ' MB'; }
  function spec(borderOverride) {
    const S = app.state();
    const border = borderOverride !== undefined ? borderOverride : G.param('border');
    const dpi = G.param('dpi'), bits = G.param('bits');
    const sh = (function () { const x = app.sheet(dpi); return border === G.param('border') ? x : PG.sheet(G.param('format'), x.landscape, border, dpi, x.imgAspect); })();
    const inch = (mm) => (mm / 25.4).toFixed(1);
    const mp = sh.px[0] * sh.px[1];
    const raw = mp * 3 * (bits / 8);
    // sim cells per inch of image: below ~12 the paint's smallest folds get wide in print
    const long = Math.max(sh.imageMM[0], sh.imageMM[1]) / 25.4;
    const cpi = G.param('simres') / long;
    const rowsOut = [
      ['sheet', sh.mm[0].toFixed(0) + ' × ' + sh.mm[1].toFixed(0) + ' mm · ' + inch(sh.mm[0]) + ' × ' + inch(sh.mm[1]) + ' in'],
      ['image', sh.imageMM[0].toFixed(0) + ' × ' + sh.imageMM[1].toFixed(0) + ' mm' + (sh.imgAspect ? ' · proportions of the original' : ' · proportions unknown: fills the format')],
      ['pixels', sh.px[0].toLocaleString() + ' × ' + sh.px[1].toLocaleString() + ' (' + (mp / 1e6).toFixed(0) + ' MP)'],
      ['file', bits + '-bit RGB · sRGB · ' + dpi + ' dpi'],
      ['raw data', mb(raw) + ' (PNG smaller)'],
      ['sim grid', (S ? S.w + ' × ' + S.h : '–') + ' · ' + cpi.toFixed(0) + ' cells/in'],
    ];
    let html = rowsOut.map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
    if (cpi < 12) html += '<dt class="warn">note</dt><dd class="warn">raise sim detail for this size</dd>';
    if (mp > 180e6) html += '<dt class="warn">note</dt><dd class="warn">very large: export takes minutes</dd>';
    $('spec').innerHTML = html;
  }

  // ---------------------------------------------------------------- refresh from engine
  function seg(id, v) { $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === v)); }
  function chip(hex, label, extra) {
    return '<span class="chip ' + (extra || '') + '"' + (label.pig !== undefined ? ' data-pig="' + label.pig + '"' : '') + ' title="' + hex + '"><i style="background:' + hex + '"></i>' + label.text + ' ' + hex.toUpperCase() + '</span>';
  }
  function refresh() {
    const S = app.state();
    if (!S) return;
    const pid = G.param('palette');
    list.querySelectorAll('.pal.on').forEach((el) => el.classList.remove('on'));
    const sel = pid < 0 ? seedRow : pid < app.archive.BASE ? rows[pid] : list.querySelector('.pal[data-id="' + pid + '"]');
    if (sel) {
      sel.classList.add('on');
      if (!sel.hidden && document.activeElement !== $('palSearch')) sel.scrollIntoView({ block: 'nearest' });
    }
    // the seed row previews which palette the seed draws
    seedRow.querySelector('.strip').innerHTML = pid < 0 ? S.palette.colors.map((c) => '<i style="background:' + c + '"></i>').join('') : '';
    seedRow.querySelector('span').textContent = pid < 0 ? S.palette.artist + ' · ' + S.palette.painting : 'a different palette for every seed';
    ['mode', 'ground', 'style', 'label', 'labelPos', 'original', 'collection', 'proportions', 'landscape', 'dpi', 'bits'].forEach((k) => seg(k, G.param(k)));
    $('labelPos').classList.toggle('dim', G.param('label') !== 1);
    $('labelSize').parentNode.classList.toggle('dim', G.param('label') !== 1);
    const inspired = G.param('mode') === 0;
    $('freeOnly').classList.toggle('dim', inspired);
    $('freeOnly2').classList.toggle('dim', inspired);
    $('interpRow').classList.toggle('dim', !inspired);
    $('interpHint').classList.toggle('dim', !inspired);
    const w = $('work');
    if (S.brief) {
      w.hidden = false;
      w.innerHTML = '<b></b><span class="note"></span><div class="readings"></div><span class="basis"></span>';
      w.querySelector('b').textContent = 'After ' + S.palette.painting + ' — ' + S.palette.artist;
      w.querySelector('.note').textContent = 'Starting point: ' + S.brief.note + '.';
      w.querySelector('.readings').textContent = S.score.readings.length
        ? 'Our reading: ' + S.score.readings.join(' · ') + '.'
        : 'Our reading: kept close to the work.';
      w.querySelector('.basis').textContent = S.brief.k ? 'layout from the work' : 'layout inferred from title';
      // what rises in the paper before the paint is absorbed
      const src = app.source(), srcLine = document.createElement('div');
      srcLine.className = 'readings';
      if (src && src.kind === 'original') {
        srcLine.textContent = 'In motion, the original rises in the paper (' + src.meta.work_year + ', public domain, ';
        const a = document.createElement('a'); a.href = src.meta.source_url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = src.meta.source; a.style.color = 'var(--accent)'; srcLine.appendChild(a);
        srcLine.appendChild(document.createTextNode(').'));
        // the option: show the original over the canvas, to compare
        const btn = document.createElement('button');
        btn.textContent = app.originalView() ? 'Hide the original (O)' : 'Show the original (O)';
        btn.style.cssText = 'display:block;margin-top:8px;width:100%';
        btn.onclick = function () { app.setOriginalView(!app.originalView()); refresh(); };
        srcLine.appendChild(btn);
      } else srcLine.textContent = 'In motion, its composition map rises in the paper. The work is in copyright (or not yet sourced), so no image of it is shown or used.';
      w.insertBefore(srcLine, w.querySelector('.basis'));
      // where to view the painting itself (a link, for every work: nothing is copied)
      const L = (window.WORK_LINKS || {})[S.palette.id];
      if (L) {
        const v = document.createElement('div'); v.className = 'readings view';
        const a1 = document.createElement('a'); a1.href = L.url; a1.target = '_blank'; a1.rel = 'noopener';
        a1.textContent = 'View the painting ↗'; a1.title = L.site + (L.note ? ' — ' + L.note : '');
        const s1 = document.createElement('span'); s1.textContent = ' ' + L.site + '  ·  '; s1.style.color = 'var(--muted)';
        const a2 = document.createElement('a'); a2.href = L.search; a2.target = '_blank'; a2.rel = 'noopener'; a2.textContent = 'image search ↗';
        [a1, a2].forEach(function (a) { a.style.color = 'var(--accent)'; });
        v.appendChild(a1); v.appendChild(s1); v.appendChild(a2);
        w.insertBefore(v, w.querySelector('.basis'));
      }
      w.querySelector('.basis').title = S.brief.k
        ? 'The fields follow the documented composition of the painting.'
        : 'The composition of this work is not documented in the brief\'s sources; the layout follows its title and the artist\'s typical structure.';
    } else if (S.palette.archive) {
      // an archive work: composed from its palette (no layout brief), linked to its source
      const P = S.palette, L = app.viewLink(), src = app.source();
      w.hidden = false;
      w.innerHTML = '<b></b><span class="note"></span><div class="readings v"></div><div class="readings o"></div><span class="basis">Colorist Archive</span>';
      w.querySelector('b').textContent = P.painting + ' — ' + P.artist + (P.date ? ' (' + P.date + ')' : '');
      w.querySelector('.note').textContent = 'Composed from its palette: this work has no layout brief. Proportions: ' + (P.aspect ? 'as the original (' + P.aspect.toFixed(3) + ' : 1, from Wikidata).' : 'unknown, so it fills the format.');
      const v = w.querySelector('.v');
      if (L) { const a = document.createElement('a'); a.href = L.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View the painting ↗'; a.style.color = 'var(--accent)'; v.appendChild(a); v.appendChild(document.createTextNode(' ' + L.site)); }
      const o = w.querySelector('.o');
      if (src && (src.kind === 'original' || src.kind === 'view-only')) {
        o.textContent = 'Public domain (' + P.year + '): ';
        const btn = document.createElement('button'); btn.textContent = app.originalView() ? 'Hide the original (O)' : 'Show the original (O)';
        btn.style.cssText = 'display:block;margin-top:6px;width:100%'; btn.onclick = function () { app.setOriginalView(!app.originalView()); refresh(); };
        o.appendChild(btn);
      } else o.textContent = P.pd ? 'Public domain, but no image is available from the source.' : 'In copyright (or undated): no image of it is shown or used.';
    } else w.hidden = true;
    SIM.concat(LIVE).forEach(function (k) {
      const input = $(k);
      if (document.activeElement !== input) input.value = G.param(k);
      input.parentNode.querySelector('.val').textContent = fmt[k](G.param(k));
    });
    fsel.value = G.param('format');
    const sr = $('simres'), srv = String(G.param('simres'));
    if (![...sr.options].some((o) => o.value === srv)) sr.add(new Option(srv + ' (from link)', srv));
    sr.value = srv;
    if (document.activeElement !== seedIn) seedIn.value = G.seed;
    const c = S.colours;
    $('chips').innerHTML = chip(c.ground, { text: 'ground' }, 'ground') +
      c.pigments.map((h, i) => chip(h, { text: String(i + 1), pig: i }, i === app.pigment ? 'on' : '')).join('');
    spec();
  }
  window.addEventListener('pouredground:update', function () { requestAnimationFrame(refresh); });

  // live badge + button state
  function tick() {
    const S = app.state();
    if (S) {
      const done = S.t >= S.score.steps;
      $('badge').textContent = (S.brief ? 'after ' : '') + S.palette.painting + ' · ' + S.palette.artist + ' · seed ' + G.seed + ' · ' +
        (done ? 'settled' : 'pouring ' + Math.round(100 * S.t / S.score.steps) + '%') +
        (app.handTouched() ? ' · hand-touched' : '');
      $('finish').disabled = done;
    }
    const m = app.motion;
    if (m.on && app.state()) {
      const mi = app.motionInfo();
      $('cycleBar').style.width = (100 * Math.min(1, mi.seconds / mi.total)) + '%';
      $('phaseVal').textContent = mi.seconds.toFixed(1) + ' / ' + mi.total.toFixed(1) + ' s';
      $('phaseName').textContent = PHASES[mi.phase];
    } else { $('cycleBar').style.width = '0'; $('phaseVal').textContent = ''; $('phaseName').textContent = ''; }
    $('playPause').textContent = m.playing ? '⏸' : '▶';
    $('motionCtl').classList.toggle('dim', !m.on);
    seg('motionOn', m.on ? 1 : 0);
    $('recordLoop').disabled = m.recording || app.exporting();
    const busy = app.exporting() || m.recording;
    $('exportPrint').disabled = busy; $('exportPreview').disabled = busy;
    requestAnimationFrame(tick);
  }
  refresh();
  tick();
})();
