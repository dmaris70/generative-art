// The found, as prints: run Every 25-Token Sketch through a shelf and render every sketch the
// slow lane kept as a print-ready PNG, a contact sheet, an index and a catalogue PDF.
//   node tools/found-prints.js <url-of-neort.html> <out-dir> [programs=30905] [px=2400]
// e.g. node tools/found-prints.js http://localhost:8077/projects/045-every-25-token-sketch/neort.html /tmp/found
// A print is a square of px pixels (2400 px = 20.3 cm at 300 dpi): the 64 × 64 sketch enlarged
// without smoothing on the piece's dark ground, captioned with its number, its code as the
// library writes it and as people read it, its score, and the programs it held the lane for.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, out, programs = '30905', px = '2400'] = process.argv.slice(2);
  fs.mkdirSync(path.join(out, 'prints'), { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await pg.goto(url + '?at=' + programs, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.BABEL && window.BABEL.stats().next > 0, null, { timeout: 600000 });
  const found = await pg.evaluate(() => window.BABEL.found());
  const champ = await pg.evaluate(() => window.BABEL.champion());
  const stats = await pg.evaluate(() => window.BABEL.stats());
  found.reverse();                                          // oldest first: the order the library gave them
  if (champ) found.push(champ);                             // and the one still holding the lane, last
  const list = found.map((f, i) => ({ no: i + 1, ...f, held: f.until !== undefined ? Math.round((f.until - f.since) * 8) : null }));
  fs.writeFileSync(path.join(out, 'found.json'), JSON.stringify({ programs: +programs, stats, champion: champ, found: list.map(({ print, ...r }) => r) }, null, 1));
  const csv = ['no,program,tokens,postfix,infix,uses_t,score_at_arrival,score_when_dethroned,programs_held'];
  for (const f of list) csv.push([f.no, f.k + 1, f.n, JSON.stringify(f.postfix), JSON.stringify(f.code), f.moves ? 1 : 0, f.peak.toFixed(4), f.score.toFixed(4), f.held].join(','));
  fs.writeFileSync(path.join(out, 'found.csv'), csv.join('\n') + '\n');
  const G = '#0b0b0e', INK = 'rgb(232,230,223)', MONO = "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
  const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // one print as a block of size × size; the single-page document wraps it, the catalogue stacks them
  const printBlock = (f, size) => `<div class="p" style="position:relative;width:${size}px;height:${size}px;overflow:hidden;background:${G};font-family:${MONO};color:${INK}">
    <img src="${f.print}" style="position:absolute;left:${size * 0.125}px;top:${size * 0.075}px;width:${size * 0.75}px;height:${size * 0.75}px;image-rendering:pixelated">
    <div style="position:absolute;left:${size * 0.125}px;top:${size * 0.855}px;width:${size * 0.75}px;font-size:${size * 0.0135}px;line-height:1.6;opacity:.85">
      <div style="font-size:${size * 0.0175}px;color:rgb(240,163,94)">${f.code.replace(/</g, '&lt;')}</div>
      <div style="opacity:.7">as the library writes it: ${f.postfix}</div>
      <div style="opacity:.7">program ${grp(f.k + 1)} of the library · ${f.n} ${f.n === 1 ? 'token' : 'tokens'} · structure ${f.peak.toFixed(3)} · ${f.moves ? 'uses t' : 'no t'}${f.held !== null ? ' · held the lane for ' + grp(f.held) + ' programs' : ' · holds the lane'}</div>
      <div style="opacity:.45">Every 25-Token Sketch · the found, ${f.no} of ${list.length} through program ${grp(+programs)} · PCDTokyo2026</div>
    </div></div>`;
  const printHTML = (f, size) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${G}">${printBlock(f, size)}</body>`;
  const P = await b.newPage({ viewport: { width: +px, height: +px } });
  for (const f of list) {
    await P.setContent(printHTML(f, +px));
    await P.screenshot({ path: path.join(out, 'prints', String(f.no).padStart(3, '0') + '-program-' + (f.k + 1) + '.png') });
  }
  // the contact sheet: all of them, oldest first
  const cols = 12, cell = 200, rows = Math.ceil(list.length / cols);
  const sheet = await b.newPage({ viewport: { width: cols * cell + 120, height: rows * (cell + 34) + 160 } });
  await sheet.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:${G};color:${INK};font-family:${MONO};padding:60px">
    <div style="font-size:16px;margin-bottom:24px;opacity:.85">Every 25-Token Sketch · the found: ${list.length} sketches the slow lane kept through program ${grp(+programs)} (${stats.distinct.toLocaleString('en-US')} distinct pictures, ${stats.dups.toLocaleString('en-US')} repeats), oldest first</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},${cell - 20}px);gap:20px">${list.map((f) => `<div><img src="${f.print}" style="width:${cell - 20}px;height:${cell - 20}px;image-rendering:pixelated;display:block"><div style="font-size:10px;opacity:.6;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.no} · ${grp(f.k + 1)} · ${f.code.replace(/</g, '&lt;')}</div></div>`).join('')}</div></body>`);
  await sheet.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
  // the catalogue: one print a page, square pages
  const cat = await b.newPage();
  const page = 1200;
  await cat.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:${page}px ${page}px;margin:0}body{margin:0;background:${G}}.p{width:${page}px;height:${page}px;position:relative;page-break-after:always;break-after:page;background:${G};color:${INK};font-family:${MONO}}</style><body>
    <div class="p"><div style="position:absolute;left:150px;top:420px;width:900px;font-size:22px;line-height:1.7"><div style="font-size:34px">Every 25-Token Sketch</div><div style="opacity:.8">the found: ${list.length} sketches the slow lane kept through program ${grp(+programs)}</div><div style="opacity:.6;font-size:16px;margin-top:24px">A fifteen-symbol pixel language, every program of one to twenty-five tokens, read shortest first. A selector with a stated preference — tonal variety, moderate edges, two dimensions — held each of these longer; its claim faded, and the next took the lane. Through the fifth shelf: ${grp(+programs)} programs, ${stats.distinct.toLocaleString('en-US')} distinct pictures, ${stats.dups.toLocaleString('en-US')} repeats. Each print: the 64 × 64 field as it stood when dethroned, enlarged without smoothing. Edition of 25 sets. PCDTokyo2026.</div></div></div>
    ${list.map((f) => printBlock(f, page)).join('')}</body>`);
  await cat.pdf({ path: path.join(out, 'the-found-catalogue.pdf'), width: page + 'px', height: page + 'px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await b.close();
  console.log('found:', list.length, '| prints in', path.join(out, 'prints'), '| contact sheet, catalogue PDF, found.json, found.csv in', out);
})();
