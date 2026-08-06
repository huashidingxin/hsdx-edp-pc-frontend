const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('ERR:', msg.text().slice(0, 250)); });
  page.on('pageerror', (err) => console.log('PAGE_ERR:', String(err).slice(0, 250)));
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && u.includes('/api/')) console.log('HTTP', res.status(), u.slice(0, 140));
  });

  await page.goto('https://dev.cpzhongzhou.com/#/auth/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('input:not([type]), input[type="text"]').first().fill('super');
  await page.locator('input[type="password"]').first().fill('12345678');
  await page.evaluate(() => {
    const handleEl = document.querySelector('div[name="captcha-action"]');
    const track = [...document.querySelectorAll('div')].find((el) => el.className && /h-10 w-full/.test(String(el.className)) && /relative/.test(String(el.className)));
    const r = handleEl.getBoundingClientRect();
    const sx = r.x + r.width / 2, sy = r.y + r.height / 2;
    const mk = (t, x, y) => new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pageX: x, pageY: y });
    (handleEl.querySelector('svg') || handleEl).dispatchEvent(mk('mousedown', sx, sy));
    for (let i = 1; i <= 50; i++) track.dispatchEvent(mk('mousemove', sx + 415 * (i / 50), sy));
    window.dispatchEvent(mk('mouseup', sx + 415, sy));
  });
  await page.locator('button:has-text("登录")').click().catch(() => {});
  await page.waitForTimeout(5000);

  console.log('logged in:', !page.url().includes('auth/login'));

  // 监理日志页
  await page.goto('https://dev.cpzhongzhou.com/#/supervision-logs', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(8000);
  console.log('log page:', page.url());

  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('table body:', bodyText.replace(/\n+/g, ' | ').slice(0, 700));

  // 找 9971105 行（可能需要在列表中找）
  const rowFound = bodyText.includes('9971105') || bodyText.includes('现场巡视检查');
  console.log('row found:', rowFound);

  await page.screenshot({ path: "/tmp/log-list.png" });
  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
