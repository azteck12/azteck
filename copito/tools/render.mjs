// Renderiza cuadros [from, to) a JPEG: node tools/render.mjs outDir w h fps from to
import { createRequire } from 'module'; import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [,, outDir, w, h, fps, from, to] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:8123/index.html?w=${w}&h=${h}`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
for (let f = +from; f < +to; f++) {
  const file = `${outDir}/f${String(f).padStart(5, '0')}.jpg`;
  if (fs.existsSync(file)) continue;
  const url = await page.evaluate((t) => window.frameJPEG(t, .95), f / +fps);
  fs.writeFileSync(file + '.tmp', Buffer.from(url.split(',')[1], 'base64')); fs.renameSync(file + '.tmp', file);
  if (f % 25 === 0) console.log('frame', f, new Date().toISOString());
}
await browser.close();
