const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  page.on('pageerror', (err) => console.log('PAGE_ERR:', String(err).slice(0, 200)));
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && u.includes('/api/')) console.log('HTTP', res.status(), u.slice(0, 140));
  });

  // 登录
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

  // 找全局项目切换器
  await page.goto('https://dev.cpzhongzhou.com/#/workspace', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(4000);
  const switcher = await page.evaluate(() => {
    const all = [...document.querySelectorAll('span, div, button')];
    const el = all.find((e) => e.innerText && e.innerText.trim() === '黔西南州天然气支线管网二期工程项目' && e.offsetWidth > 0 && e.offsetWidth < 400);
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.tagName + '.' + String(el.className).slice(0, 60) };
    }
    return null;
  });
  console.log('project switcher:', JSON.stringify(switcher));

  if (switcher) {
    await page.mouse.click(switcher.x, switcher.y);
    await page.waitForTimeout(1500);
    // 选择测试080601项目
    const target = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.ant-select-item-option, [role="option"], li, div')];
      const el = items.find((e) => e.innerText && e.innerText.includes('测试080601项目'));
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return null;
    });
    console.log('target project:', JSON.stringify(target));
    if (target) { await page.mouse.click(target.x, target.y); await page.waitForTimeout(1500); }
  }

  // 监理日志
  await page.goto('https://dev.cpzhongzhou.com/#/supervision-logs', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(7000);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const hasTestRow = bodyText.includes('080602施工') || bodyText.includes('9971105');
  console.log('test row visible:', hasTestRow);
  console.log('body:', bodyText.replace(/\n+/g, ' | ').slice(-800));

  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
