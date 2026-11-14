// Plain, unmodified headless Chromium: loads the public page once and reports what it got. No stealth, no header changes.
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://www.housebets.com/house-games';
const browser = await chromium.launch();
const page = await browser.newPage();
const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ err: e.message }));
await page.waitForTimeout(4000);
const title = await page.title();
const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
console.log(JSON.stringify({ url, status: resp?.status?.() ?? resp?.err, title, ua: await page.evaluate(() => navigator.userAgent), text }, null, 1));
await page.screenshot({ path: '/tmp/plain_check.png' });
await browser.close();
