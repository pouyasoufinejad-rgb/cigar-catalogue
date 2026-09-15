import { readFile, writeFile, rm } from 'node:fs/promises';

const target = 'src/index.js';
let source = await readFile(target, 'utf8');
const before = `const script = '<script type="module" src="/catalogue-runtime.mjs"></script>';`;
const after = `const script = '<script type="module" src="/catalogue-runtime.mjs?v=140"></script>';`;
if (!source.includes(before)) throw new Error('Expected unversioned runtime bootstrap was not found');
source = source.replace(before, after);
source = source.replace("headers.set('x-cigar-catalogue-version', '139');", "headers.set('x-cigar-catalogue-version', '140');");
await writeFile(target, source);
await rm('scripts/apply-runtime-cache-bust.mjs', { force: true });
