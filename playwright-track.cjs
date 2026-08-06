const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('https://dev.cpzhongzhou.com/#/auth/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  const html = await page.evaluate(() => {
    const track = [...document.querySelectorAll('div')].find(
      (el) => el.className && /h-10 w-full/.test(String(el.className)) && /relative/.test(String(el.className)),
    );
    return track ? track.outerHTML.slice(0, 2500) : 'none';
  });
  console.log(html);
  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
