import { createRequire } from 'module'; import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/brand/compose.html'); await page.waitForFunction('window.OUT', null, { timeout: 60000 });
const out = await page.evaluate(() => window.OUT);
fs.writeFileSync('brand/copito_tv_perfil.png', Buffer.from(out.avatar.split(',')[1], 'base64'));
fs.writeFileSync('brand/copito_tv_banner.jpg', Buffer.from(out.banner.split(',')[1], 'base64'));
await browser.close();
