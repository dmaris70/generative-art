#!/usr/bin/env node
// strata-publish.mjs — bind the exported metadata to its permanent content URIs.
//
// The export writes each token's metadata with local file names in `image`
// and `properties.companion.image`. Once the PNGs are on permanent storage
// (Arweave by decision; the map format is storage-agnostic), this tool
// rewrites those two fields to the content URIs, records the storage under
// `properties.storage`, and writes the bound metadata next to the export in
// export/published/ together with manifest-published.json, which carries the
// SHA-256 of every bound metadata file. Content hashes are not touched: the
// `image_sha256` fields still describe the bytes at the URI, so anyone can
// fetch the URI and check it against the metadata, the manifest and the
// on-sheet record.
//
//   node tools/strata-publish.mjs <uris.json> [--network arweave] [--gateway https://arweave.net/]
//
// uris.json maps every export file name to its URI, e.g.
//   { "001-940.png": "ar://TXID", "001-940-companion.png": "ar://TXID", ... }
// (an uploader's receipt can be converted to this shape; see README). The
// tool refuses to run if any image in the manifest is missing from the map,
// or if a mapped file's local bytes no longer match the manifest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const mapFile = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const network = opt('--network', 'arweave');
const gateway = opt('--gateway', 'https://arweave.net/');
if (!mapFile) { console.error('usage: node tools/strata-publish.mjs <uris.json> [--network arweave] [--gateway URL]'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proj = path.join(root, 'projects', '011-isometric-strata');
const exportDir = process.env.STRATA_EXPORT_DIR || path.join(proj, 'export');
const outDir = path.join(exportDir, 'published');
const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf8'));
const uris = JSON.parse(fs.readFileSync(path.resolve(mapFile), 'utf8'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// ar://TXID is the canonical form; the gateway URL is derived for wallets and
// marketplaces that do not resolve the scheme.
const httpOf = (uri) => uri.startsWith('ar://') ? gateway.replace(/\/?$/, '/') + uri.slice(5) : uri;

// 1. every image in the manifest must be mapped, and the local bytes must still match
const tokens = Object.values(manifest.tokens).sort((a, b) => a.edition - b.edition);
const missing = [], drift = [];
for (const t of tokens) {
  for (const [file, hash] of [[t.image, t.image_sha256], [t.companion.image, t.companion.image_sha256]]) {
    if (!uris[file]) missing.push(file);
    const p = path.join(exportDir, file);
    if (fs.existsSync(p) && sha(fs.readFileSync(p)) !== hash) drift.push(file);
  }
}
if (missing.length) { console.error(`${missing.length} files have no URI in ${mapFile}:\n  ` + missing.slice(0, 10).join('\n  ') + (missing.length > 10 ? '\n  …' : '')); process.exit(1); }
if (drift.length) { console.error(`${drift.length} local files no longer match the manifest:\n  ` + drift.join('\n  ')); process.exit(1); }

// 2. bind
fs.mkdirSync(outDir, { recursive: true });
const published = { series: manifest.series, generator: manifest.generator, edition: manifest.edition, storage: { network, gateway, boundAt: new Date().toISOString(), map_sha256: sha(fs.readFileSync(path.resolve(mapFile))) }, tokens: {} };
for (const t of tokens) {
  const meta = JSON.parse(fs.readFileSync(path.join(exportDir, t.metadata), 'utf8'));
  if (meta.image !== t.image || meta.image_sha256 !== t.image_sha256) { console.error(`${t.metadata}: image fields disagree with the manifest`); process.exit(1); }
  const img = uris[t.image], comp = uris[t.companion.image];
  meta.image = img;
  meta.properties.companion.image = comp;
  meta.properties.storage = {
    network,
    image: { uri: img, url: httpOf(img), sha256: t.image_sha256, bytes: t.image_bytes },
    companion: { uri: comp, url: httpOf(comp), sha256: t.companion.image_sha256, bytes: t.companion.image_bytes },
    note: 'sha256 is of the bytes at the uri; verify by fetching and hashing',
  };
  const buf = Buffer.from(JSON.stringify(meta, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, t.metadata), buf);
  published.tokens[String(t.edition)] = { edition: t.edition, seed: t.seed, name: t.name, image: img, image_sha256: t.image_sha256, companion: comp, companion_sha256: t.companion.image_sha256, metadata: t.metadata, metadata_sha256: sha(buf) };
}
fs.writeFileSync(path.join(outDir, 'manifest-published.json'), JSON.stringify(published, null, 2) + '\n');
console.log(`bound ${tokens.length} tokens to ${network}; metadata in ${outDir}, manifest-published.json written`);
