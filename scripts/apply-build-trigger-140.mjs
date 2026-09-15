import { readFile, writeFile, rm } from 'node:fs/promises';

const path = 'public/index.html';
let html = await readFile(path, 'utf8');
const marker = '<!-- catalogue-runtime-build-v140 -->';
if (!html.includes(marker)) {
  if (!html.includes('</head>')) throw new Error('Expected </head> in public/index.html');
  html = html.replace('</head>', `  ${marker}\n</head>`);
  await writeFile(path, html);
}
await rm('scripts/apply-build-trigger-140.mjs', { force: true });
