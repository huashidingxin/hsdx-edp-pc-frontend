const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('.js') && !res.url().includes('.css'))
      console.log('HTTP', res.status(), res.url().slice(0, 140));
  });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('ERR:', msg.text().slice(0, 200)); });
  await page.goto('https://dev.cpzhongzhou.com/#/auth/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  await page.locator('input:not([type]), input[type="text"]').first().fill('super');
  await page.locator('input[type="password"]').first().fill('12345678');

  const handle = page.locator('div[name="captcha-action"]');
  const track = await page.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((el) => el.className && /h-10 w-full/.test(String(el.className)) && /relative/.test(String(el.className)));
    const r = t.getBoundingClientRect();
    return { x: r.x, w: r.width };
  });
  const hb = await handle.boundingBox();
  console.log('track:', track, 'handle box:', hb && { x: hb.x, y: hb.y, w: hb.width, h: hb.height });

  if (hb) {
    const startX = hb.x + hb.width / 2;
    const startY = hb.y + hb.height / 2;
    const endX = track.x + track.w - 30;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(startX + (endX - startX) * (i / 40), startY, { steps: 2 });
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const passing = await page.evaluate(() => {
      const el = document.querySelector('div[name="captcha-action"]');
      return el ? el.getAttribute('is-passing') : null;
    });
    console.log('slider passing:', passing);
    await page.locator('button:has-text("登录")').click().catch(() => {});
    await page.waitForTimeout(4000);
  }

  console.log('url:', page.url());
  const text = await page.locator('body').innerText().catch(() => '');
  console.log('logged in:', text.includes('退出登录') || !page.url().includes('auth/login'));
  console.log('body:', text.replace(/\n+/g, ' | ').slice(0, 300));
  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
