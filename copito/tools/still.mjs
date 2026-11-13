// Renderiza un fotograma con parámetros extra: node tools/still.mjs out.png w h t "query"
import { createRequire } from 'module'; import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [,, out, w, h, t, q = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:8123/index.html?w=${w}&h=${h}&nohud=1&${q}`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
const url = await page.evaluate((t) => { window.renderAt(t); return document.querySelector('canvas').toDataURL('image/png'); }, +t);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
