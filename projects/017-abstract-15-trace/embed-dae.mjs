import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(directory, 'abstract-15.dae'), 'utf8');
writeFileSync(
  join(directory, 'model-data.js'),
  `// Generated from abstract-15.dae. Run: node embed-dae.mjs\nwindow.DAE_SOURCE = ${JSON.stringify(source)};\n`,
);
