#!/usr/bin/env node
// strata-export.mjs — produce the assets of an Isometric Strata edition.
//
// For each requested token: verify the generator is still the frozen one,
// render the sheet headlessly at the export size (3000 × 4000, a 3:4 sheet at
// 2× the sheet units) from the vendored libraries, write the PNG and the
// token's ERC-721 metadata JSON (with the image file name and its hash), and
// record both files' SHA-256 in export/manifest.json. Each token also gets its
// companion drawing — the same seed through the other view (plan and section
// for an axonometric token, and vice versa), non-canonical, listed in the
// metadata's properties and in the manifest. Re-runs merge into the manifest
// and skip tokens whose files already exist with the recorded hashes, so an
// edition can be produced in parts or resumed.
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
  // one render of a seed in a given view (0 = the seed's own, 1 axon, 2 plan and section)
  async function render(seed, view) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('requestfailed', (r) => errs.push('failed request ' + r.url()));
    await page.goto(`http://localhost:8134/projects/011-isometric-strata/?seed=${seed}&gui=0${view ? '&p_view=' + view : ''}`);
    await page.waitForFunction(() => window.__strata && window.__strata.seed !== undefined, null, { timeout: 120000 });
    await page.waitForTimeout(300);
    const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; });
    if (size[0] !== W || size[1] !== H) throw new Error(`canvas is ${size.join('x')}, expected ${W}x${H}`);
    const png = await page.locator('canvas').first().screenshot({ type: 'png' });
    const meta = await page.evaluate(() => window.__strata.metadata);
    const specView = await page.evaluate(() => window.__strata.spec.view);
    await ctx.close();
    if (errs.length) throw new Error(errs.join(' | '));
    if (meta.properties.fingerprint !== freeze.fingerprint) throw new Error('page fingerprint differs from the freeze record');
    return { png, meta, view: specView };
  }

  for (const t of tokens) {
    const t0 = Date.now();
    const base = `${pad(t.edition)}-${t.seed}`;
    const imageFile = `${base}.png`, metaFile = `${base}.json`, compFile = `${base}-companion.png`;
    const prev = manifest.tokens[String(t.edition)];
    if (prev && prev.companion && [imageFile, metaFile, compFile].every((f) => fs.existsSync(path.join(outDir, f)))
        && sha(fs.readFileSync(path.join(outDir, imageFile))) === prev.image_sha256
        && sha(fs.readFileSync(path.join(outDir, compFile))) === prev.companion.image_sha256) {
      console.log(`${base}: already exported, skipped`);
      continue;
    }
    const main = await render(t.seed, 0);
    const { png, meta } = main;
    if (!meta.properties.edition || meta.properties.edition.number !== t.edition) throw new Error(`token ${t.seed} reports edition ${JSON.stringify(meta.properties.edition)}, expected ${t.edition}`);
    if (main.view !== t.view) throw new Error(`token ${t.seed} rendered as ${main.view}, edition record says ${t.view}`);
    // the companion: the same seed through the other view
    const comp = await render(t.seed, t.view === 'AXONOMETRIC' ? 2 : 1);
    if (comp.view === main.view) throw new Error('companion came out in the same view');
    const compHash = sha(comp.png);
    fs.writeFileSync(path.join(outDir, compFile), comp.png);

    const imageHash = sha(png);
    fs.writeFileSync(path.join(outDir, imageFile), png);
    meta.image = imageFile; // replace with the content URI once uploaded
    meta.image_sha256 = imageHash;
    meta.properties.companion = { view: comp.view, image: compFile, image_sha256: compHash, note: 'the same seed drawn through the other view by the same frozen generator; not the canonical work' };
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
      companion: { view: comp.view, image: compFile, image_sha256: compHash, image_bytes: comp.png.length },
      metadata: metaFile, metadata_sha256: sha(metaBuf), renderedAt: new Date().toISOString(), ms: Date.now() - t0,
    };
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${base}: ${t.view} ${(png.length / 1048576).toFixed(2)} MB ${imageHash.slice(0, 12)}… + companion ${comp.view} ${(comp.png.length / 1048576).toFixed(2)} MB ${compHash.slice(0, 12)}… in ${Date.now() - t0} ms`);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`manifest: ${manifestFile} (${Object.keys(manifest.tokens).length} tokens)`);
