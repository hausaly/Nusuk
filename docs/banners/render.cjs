// node docs/banners/render.cjs  → docs/banners/out/*.png (1920×160) + .webp copies
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1920, height: 2500 } });
  await pg.goto('file://' + path.join(__dirname, 'banners.html'));
  await pg.evaluate(() => document.fonts.ready);
  const names = ['haramain-train', 'hotels-makkah-madinah', 'diy-all-in-one', 'b2b-green-zone', 'agent-bootcamp', 'transfers', 'saudi-partner', 'flights', 'mutawef-ground', 'packages'];
  for (let i = 0; i < names.length; i++) {
    const id = '#b' + String(i + 1).padStart(2, '0');
    await pg.locator(id).screenshot({ path: path.join(__dirname, 'out', `nusuk-banner-${String(i + 1).padStart(2, '0')}-${names[i]}.png`) });
  }
  await br.close();
})();
