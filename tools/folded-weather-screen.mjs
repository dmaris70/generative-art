// Screen seeds for 058 Folded Weather and write the KEPT list into sketch.js.
//   node tools/folded-weather-screen.mjs [count=24] [maxRaw=400]
// A raw seed is kept when its still frame and 12 points around its drift loop all keep a usable
// deck: mean density W in [0.15, 0.62], texture (sd of W) >= 0.08, unusable pixels <= 2%.
// Uses the page's own shader through its window.FoldedWeather.probe, in headless Chromium.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(root, 'projects/058-folded-weather/index.html');
const sketch = path.join(root, 'projects/058-folded-weather/sketch.js');
const want = +(process.argv[2] || 24), maxRaw = +(process.argv[3] || 400);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 64, height: 64 } });
await p.goto('file://' + page + '?study=atlas&t=0');
await p.waitForFunction(() => window.FoldedWeather);
const kept = [];
for (let raw = 1; raw <= maxRaw && kept.length < want; raw++) {
  const r = await p.evaluate((raw) => {
    const F = window.FoldedWeather, pts = [null];
    for (let i = 0; i < 12; i++) pts.push(i / 12);
    const ok = (m) => m && m.W >= 0.15 && m.W <= 0.62 && m.sd >= 0.08 && m.bad <= 0.02;
    for (const u of pts) { const m = F.probe(raw, u); if (!ok(m)) return { pass: false, u, m }; }
    return { pass: true, m: F.probe(raw, null) };
  }, raw);
  if (r.pass) { kept.push(raw); console.log('keep', raw, JSON.stringify(r.m)); }
}
await b.close();
const src = fs.readFileSync(sketch, 'utf8').replace(/const KEPT = \[[^\]]*\];/, `const KEPT = [/*KEPT*/${kept.join(', ')}];`);
fs.writeFileSync(sketch, src);
console.log(`kept ${kept.length}: ${kept.join(', ')}`);
