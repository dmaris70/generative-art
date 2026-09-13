#!/usr/bin/env node
// strata-audit.mjs — the rendered-image audit of an Isometric Strata edition.
//
// Renders every token of edition/edition-<size>.json headlessly, measures the
// drawing inside its frame from the pixels — ink coverage, colour presence,
// how far the ink's centroid sits from the frame's centre — and flags outliers
// against the style's own median (per view) plus absolute floors. Flagged
// seeds go to edition/exclusions.json with their reason and measurements, so
// tools/strata-select.mjs replaces them deterministically on the next run.
// Metrics for seeds already audited are kept, so re-runs only render new tokens.
//
//   node tools/strata-audit.mjs [size=256]
//   requires: playwright (global), Chromium at /opt/pw-browsers, a vendored p5 + lil-gui
//   in the scratch dir (or a network path for the CDN)

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const proj = path.join(root, 'projects', '011-isometric-strata');
const SIZE = Number(process.argv[2]) || 256;
const VENDOR = process.env.STRATA_VENDOR || '/tmp/claude-0/-home-user-generative-art/ed30c8c8-4e18-5688-8df1-114b9e3936ad/scratchpad';
const edition = JSON.parse(fs.readFileSync(path.join(proj, 'edition', `edition-${SIZE}.json`), 'utf8'));
const auditFile = path.join(proj, 'edition', `audit-${SIZE}.json`);
const exclFile = path.join(proj, 'edition', 'exclusions.json');
const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : { measured: {} };
const exclusions = fs.existsSync(exclFile) ? JSON.parse(fs.readFileSync(exclFile, 'utf8')) : { seeds: {} };

const RULES = {
  coverageFloor: 0.25, // relative to the median of every token of the same view: an empty frame
  coverageLow: 0.5, coverageHigh: 1.8, // relative to the style's median, same view
  colourLow: 0.25, colourAbs: 0.002, // relative to the median of the same style and palette, and near-zero in absolute terms
  centroidMax: 0.16, // of the frame width; axonometric sheets only (a two-view sheet splits its ink by layout)
  inkBelowPaper: 45, // a pixel is ink when its luminance sits this far under the sheet's own paper
};

const todo = edition.tokens.filter((t) => !audit.measured[String(t.seed)]);
process.stderr.write(`${todo.length} tokens to render, ${edition.tokens.length - todo.length} already measured\n`);

if (todo.length) {
  const server = spawn('python3', ['-m', 'http.server', '8131'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 2000 }, deviceScaleFactor: 1 });
  await page.route('**/p5.min.js', (r) => r.fulfill({ path: path.join(VENDOR, 'p5.min.js'), contentType: 'application/javascript' }));
  await page.route('**/lil-gui.umd.min.js', (r) => r.fulfill({ path: path.join(VENDOR, 'lil-gui.umd.min.js'), contentType: 'application/javascript' }));
  await page.route('**/favicon.ico', (r) => r.fulfill({ status: 204 }));
  try {
    let n = 0;
    for (const t of todo) {
      await page.addInitScript((v) => { window.__auditInk = v; }, RULES.inkBelowPaper);
      await page.goto(`http://localhost:8131/projects/011-isometric-strata/?seed=${t.seed}&gui=0`);
      await page.waitForFunction(() => window.__strata && window.__strata.seed !== undefined, null, { timeout: 60000 });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const ctx = c.getContext('2d');
        const L = Sheet.layout({ schedule: true });
        const U = c.width / 1500;
        const fx = Math.round(L.frame.x * U), fy = Math.round(L.frame.y * U), fw = Math.round(L.frame.w * U), fh = Math.round(L.frame.h * U);
        const d = ctx.getImageData(fx, fy, fw, fh).data;
        // the paper's own luminance: the median over a coarse sample of the frame
        const lum = [];
        for (let y = 0; y < fh; y += 7) for (let x = 0; x < fw; x += 7) { const i = (y * fw + x) * 4; lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); }
        lum.sort((a, b) => a - b);
        const paper = lum[Math.floor(lum.length * 0.5)];
        const INK = window.__auditInk || 45;
        let ink = 0, col = 0, sx = 0, sy = 0, n = 0;
        for (let y = 0; y < fh; y += 2) for (let x = 0; x < fw; x += 2) {
          const i = (y * fw + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          n++;
          if (luma < paper - INK) { ink++; sx += x; sy += y; } // ink is line and dark fill; a flat colour field is not mud
          if (sat > 45) col++;
        }
        const cx = ink ? sx / ink / fw - 0.5 : 0, cy = ink ? sy / ink / fh - 0.5 : 0;
        return { coverage: ink / n, colour: col / n, centroid: Math.hypot(cx, cy * (fh / fw)), cx: cx, cy: cy, paper: Math.round(paper) };
      });
      audit.measured[String(t.seed)] = { seed: t.seed, style: t.style, view: t.view, coverage: +m.coverage.toFixed(4), colour: +m.colour.toFixed(4), centroid: +m.centroid.toFixed(3), cx: +m.cx.toFixed(3), cy: +m.cy.toFixed(3), paper: m.paper };
      if (++n % 20 === 0) { process.stderr.write(`${n}/${todo.length}\n`); fs.writeFileSync(auditFile, JSON.stringify(audit, null, 1)); }
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

// ---- flag outliers against the style's median, per view ----
const groups = {}, palGroups = {};
for (const t of edition.tokens) {
  const m = audit.measured[String(t.seed)];
  if (!m) continue;
  const k = t.style + '|' + t.view;
  (groups[k] = groups[k] || []).push(m);
  const pk = t.style + '|' + t.palette;
  (palGroups[pk] = palGroups[pk] || []).push(m);
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const viewMed = {};
for (const v of ['AXONOMETRIC', 'PLAN + SECTION']) {
  const all = edition.tokens.map((t) => audit.measured[String(t.seed)]).filter((m) => m && m.view === v).map((m) => m.coverage);
  viewMed[v] = all.length ? median(all) : 0;
}
const flags = [];
for (const t of edition.tokens) {
  const m = audit.measured[String(t.seed)];
  if (!m) continue;
  const g = groups[t.style + '|' + t.view];
  const medCov = median(g.map((q) => q.coverage)), medCol = median(palGroups[t.style + '|' + t.palette].map((q) => q.colour));
  const reasons = [];
  if (m.coverage < viewMed[t.view] * RULES.coverageFloor) reasons.push('empty frame');
  if (m.coverage < medCov * RULES.coverageLow) reasons.push('ink coverage below half the style median');
  if (m.coverage > medCov * RULES.coverageHigh) reasons.push('ink coverage above 1.8x the style median');
  if (medCol > 0.004 && m.colour < medCol * RULES.colourLow && m.colour < RULES.colourAbs) reasons.push('colour washed out against the same palette');
  if (t.view === 'AXONOMETRIC' && m.centroid > RULES.centroidMax) reasons.push('drawing off-centre');
  if (reasons.length) flags.push({ seed: t.seed, edition: t.edition, style: t.style, view: t.view, reasons, measured: m, medians: { coverage: +medCov.toFixed(4), colour: +medCol.toFixed(4) } });
}
audit.rules = RULES;
audit.lastRun = { at: new Date().toISOString(), tokens: edition.tokens.length, flagged: flags.length, flags };
fs.writeFileSync(auditFile, JSON.stringify(audit, null, 1));
for (const f of flags) exclusions.seeds[String(f.seed)] = { reasons: f.reasons, measured: f.measured, at: audit.lastRun.at };
fs.writeFileSync(exclFile, JSON.stringify(exclusions, null, 1));
console.log(`audited ${edition.tokens.length}; flagged ${flags.length}; exclusions now ${Object.keys(exclusions.seeds).length}`);
for (const f of flags) console.log(`  ${f.edition}/${SIZE} seed ${f.seed} ${f.style} ${f.view}: ${f.reasons.join('; ')} (cov ${f.measured.coverage} vs ${f.medians.coverage}, col ${f.measured.colour} vs ${f.medians.colour}, centroid ${f.measured.centroid})`);
