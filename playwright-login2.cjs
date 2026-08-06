const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('.js') && !res.url().includes('.css'))
      console.log('HTTP', res.status(), res.url().slice(0, 140));
  });
  await page.goto('https://dev.cpzhongzhou.com/#/auth/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  await page.locator('input:not([type]), input[type="text"]').first().fill('super');
  await page.locator('input[type="password"]').first().fill('12345678');

  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const handleEl = document.querySelector('div[name="captcha-action"]');
    if (!handleEl) return 'no handle';
    const track = [...document.querySelectorAll('div')].find(
      (el) => el.className && /h-10 w-full/.test(String(el.className)) && /relative/.test(String(el.className)),
    );
    const r = handleEl.getBoundingClientRect();
    const startX = r.x + r.width / 2;
    const startY = r.y + r.height / 2;
    const handleTarget = handleEl.querySelector('svg') || handleEl;
    const mk = (type, x, y) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pageX: x, pageY: y });
    handleTarget.dispatchEvent(mk('mousedown', startX, startY));
    for (let i = 1; i <= 50; i++) {
      track.dispatchEvent(mk('mousemove', startX + 415 * (i / 50), startY));
    }
    window.dispatchEvent(mk('mouseup', startX + 415, startY));
    return new Promise((resolve) => setTimeout(() => {
      const el = document.querySelector('div[name="captcha-action"]');
      resolve({ passing: el?.getAttribute('is-passing'), left: el ? el.style.left : null });
    }, 800));
  });
  console.log('slider result:', JSON.stringify(result));

  await page.locator('button:has-text("登录")').click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log('url:', page.url());
  const text = await page.locator('body').innerText().catch(() => '');
  console.log('logged in:', !page.url().includes('auth/login'));
  console.log('body:', text.replace(/\n+/g, ' | ').slice(0, 250));
  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
