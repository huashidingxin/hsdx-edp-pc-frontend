const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONSOLE_ERR:', msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => console.log('PAGE_ERR:', String(err).slice(0, 300)));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('HTTP', res.status(), res.url().slice(0, 120));
  });

  await page.goto('https://dev.cpzhongzhou.com/#/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);

  const inputs = await page.locator('input').count();
  console.log('login inputs:', inputs);

  // 尝试自动填充登录
  try {
    const accountInput = page.locator('input[type="text"], input#form_item_account, input[placeholder*="账号"]').first();
    const passInput = page.locator('input[type="password"]').first();
    await accountInput.fill('super');
    await passInput.fill('12345678');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    console.log('after login url:', page.url());
  } catch (e) {
    console.log('login fill failed:', e.message.slice(0, 200));
  }

  // 直接导航到监理日志
  await page.goto('https://dev.cpzhongzhou.com/#/supervision-logs', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(6000);
  console.log('log page url:', page.url());

  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 500);
  console.log('body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));

  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
