import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, outDir='snaps', w='540', h='960', ...times] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', m => console.log('console:', m.text()));
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:8123/index.html?w=${w}&h=${h}`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
for (const t of times) {
  const t0 = Date.now();
  const url = await page.evaluate((t) => window.frameJPEG(t, .9), +t);
  fs.writeFileSync(`${outDir}/t${t}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('t', t, Date.now() - t0, 'ms');
}
await browser.close();
