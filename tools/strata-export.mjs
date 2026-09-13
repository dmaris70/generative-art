#!/usr/bin/env node
// strata-export.mjs — produce the assets of an Isometric Strata edition.
//
// For each requested token: verify the generator is still the frozen one,
// render the sheet headlessly at the export size (3000 × 4000, a 3:4 sheet at
// 2× the sheet units) from the vendored libraries, write the PNG and the
// token's ERC-721 metadata JSON (with the image file name and its hash), and
// record both files' SHA-256 in export/manifest.json. Re-runs merge into the
// manifest, so an edition can be produced in parts.
//
//   node tools/strata-export.mjs 1            one edition number
//   node tools/strata-export.mjs 1-12         a range
//   node tools/strata-export.mjs all          the whole edition
//   env: STRATA_EXPORT_DIR (default projects/011-isometric-strata/export)
//        STRATA_EXPORT_W (default 3000)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const proj = path.join(root, 'projects', '011-isometric-strata');
const outDir = process.env.STRATA_EXPORT_DIR || path.join(proj, 'export');
const W = Number(process.env.STRATA_EXPORT_W) || 3000, H = Math.round(W * 4 / 3);
const arg = process.argv[2] || '1';

// 1. the generator must be the frozen one
const verify = execSync(`node ${path.join(here, 'strata-freeze.mjs')} verify`, { cwd: root }).toString().trim();
const freeze = JSON.parse(fs.readFileSync(path.join(proj, 'edition', 'freeze-1.0.json'), 'utf8'));
const edition = JSON.parse(fs.readFileSync(path.join(proj, 'edition', 'edition-256.json'), 'utf8'));
const decisionsFile = path.join(proj, 'edition', 'decisions.json');
const decisions = fs.existsSync(decisionsFile) ? JSON.parse(fs.readFileSync(decisionsFile, 'utf8')) : null;
const reservesFile = path.join(proj, 'edition', 'reserves-256.json');
const reserves = fs.existsSync(reservesFile) ? JSON.parse(fs.readFileSync(reservesFile, 'utf8')) : null;

// 2. which tokens
let wanted;
if (arg === 'all') wanted = edition.tokens.map((t) => t.edition);
else if (/^\d+-\d+$/.test(arg)) { const [a, b] = arg.split('-').map(Number); wanted = []; for (let i = a; i <= b; i++) wanted.push(i); }
else wanted = arg.split(',').map(Number);
const tokens = wanted.map((n) => edition.tokens.find((t) => t.edition === n)).filter(Boolean);
if (!tokens.length) { console.error('no such tokens'); process.exit(2); }

fs.mkdirSync(outDir, { recursive: true });
const manifestFile = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { tokens: {} };
Object.assign(manifest, {
  series: edition.series, generator: { version: freeze.version, fingerprint: freeze.fingerprint, commit: freeze.commit, verified: verify },
  edition: { size: edition.size, record_sha256: freeze.edition, reserved: reserves ? reserves.reserved : 0, offered: reserves ? reserves.offered : edition.size },
  decisions: decisions ? { platform: decisions.platform.choice, chain: decisions.chain.choice, licence: decisions.licence, title: decisions.title.choice, artist: decisions.artist.choice } : null, export: { width: W, height: H, format: 'image/png', renderer: 'Chromium headless, vendored p5 1.9.4, deviceScaleFactor 1' },
  updatedAt: new Date().toISOString(),
});
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pad = (n) => String(n).padStart(3, '0');

// 3. render
const server = spawn('python3', ['-m', 'http.server', '8134'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  for (const t of tokens) {
    const t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('requestfailed', (r) => errs.push('failed request ' + r.url()));
    await page.goto(`http://localhost:8134/projects/011-isometric-strata/?seed=${t.seed}&gui=0`);
    await page.waitForFunction(() => window.__strata && window.__strata.seed !== undefined, null, { timeout: 120000 });
    await page.waitForTimeout(300);
    const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; });
    if (size[0] !== W || size[1] !== H) throw new Error(`canvas is ${size.join('x')}, expected ${W}x${H}`);
    const png = await page.locator('canvas').first().screenshot({ type: 'png' });
    const meta = await page.evaluate(() => window.__strata.metadata);
    if (errs.length) throw new Error(errs.join(' | '));
    if (!meta.properties.edition || meta.properties.edition.number !== t.edition) throw new Error(`token ${t.seed} reports edition ${JSON.stringify(meta.properties.edition)}, expected ${t.edition}`);
    if (meta.properties.fingerprint !== freeze.fingerprint) throw new Error('page fingerprint differs from the freeze record');
    await ctx.close();

    const base = `${pad(t.edition)}-${t.seed}`;
    const imageFile = `${base}.png`, metaFile = `${base}.json`;
    const imageHash = sha(png);
    fs.writeFileSync(path.join(outDir, imageFile), png);
    meta.image = imageFile; // replace with the content URI once uploaded
    meta.image_sha256 = imageHash;
    if (decisions) {
      meta.artist = decisions.artist.choice;
      meta.license = decisions.licence.image;
      meta.properties.artist = decisions.artist.choice;
      meta.properties.licence = { image: decisions.licence.image, code: decisions.licence.code };
      meta.properties.platform = { platform: decisions.platform.choice, chain: decisions.chain.choice };
    }
    if (reserves) {
      const r = reserves.reserves.find((q) => q.edition === t.edition);
      meta.properties.reserve = r ? { kind: r.kind, rule: r.rule } : null;
      if (r) meta.attributes.push({ trait_type: 'Reserve', value: r.kind });
    }
    const metaBuf = Buffer.from(JSON.stringify(meta, null, 2) + '\n');
    fs.writeFileSync(path.join(outDir, metaFile), metaBuf);
    manifest.tokens[String(t.edition)] = {
      edition: t.edition, seed: t.seed, name: meta.name, style: t.style, view: t.view,
      image: imageFile, image_sha256: imageHash, image_bytes: png.length,
      metadata: metaFile, metadata_sha256: sha(metaBuf), renderedAt: new Date().toISOString(), ms: Date.now() - t0,
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${base}: ${W}x${H} png ${(png.length / 1048576).toFixed(2)} MB sha256 ${imageHash.slice(0, 16)}… in ${Date.now() - t0} ms`);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`manifest: ${manifestFile} (${Object.keys(manifest.tokens).length} tokens)`);
