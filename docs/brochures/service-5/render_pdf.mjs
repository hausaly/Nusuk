// brochure.html -> NUSUK-CONSULT-Service-5-Saudi-Partner-Contracting-Brochure.pdf (A4) + page previews in preview/
//   python3 -I build.py && node render_pdf.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'NUSUK-CONSULT-Service-5-Saudi-Partner-Contracting-Brochure.pdf');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext()).newPage();
await page.goto(pathToFileURL(join(HERE, 'brochure.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
// report any page whose content overflows its A4 box
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, n) => {
  let max = 0; p.querySelectorAll('*').forEach(e => { if (e.closest('.pf,.cv-ft')) return; max = Math.max(max, e.getBoundingClientRect().bottom - p.getBoundingClientRect().top); });
  return { page: n + 1, contentBottom: Math.round(max), pageHeight: Math.round(p.getBoundingClientRect().height) };
}));
console.log(over.map(o => `p${o.page}: content ends at ${o.contentBottom}px of ${o.pageHeight}px` + (o.contentBottom > o.pageHeight - 52 ? '  <-- TOO TIGHT/OVERFLOW' : '')).join('\n'));
await page.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log('wrote', OUT);
await browser.close();
