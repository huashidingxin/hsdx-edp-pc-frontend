const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  page.on('pageerror', (err) => console.log('PAGE_ERR:', String(err).slice(0, 250)));
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE_ERR:', msg.text().slice(0, 250)); });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && u.includes('/api/')) console.log('HTTP', res.status(), u.slice(0, 150));
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

  // 设置默认项目（测试080601项目）
  await page.evaluate(() => {
    localStorage.setItem('app', JSON.stringify({
      defaultProject: { id: 17859989151704, name: '测试080601项目', role: 'admin' },
    }));
  });

  await page.goto('https://dev.cpzhongzhou.com/#/supervision-logs', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(8000);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('has 9971105 row:', bodyText.includes('9971105'));
  console.log('body:', bodyText.replace(/\n+/g, ' | ').slice(0, 700));

  // 找行操作"查看"按钮（9971105 行）
  const rowBtn = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vxe-table--body .vxe-body--row')];
    for (const row of rows) {
      if (row.innerText.includes('9971105')) {
        const btns = [...row.querySelectorAll('button, a, [class*="action"]')];
        const btn = btns.find((b) => b.innerText.includes('查看') || b.innerText.includes('详情'));
        if (btn) { const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: btn.innerText.slice(0, 30) }; }
      }
    }
    return null;
  });
  console.log('view btn:', JSON.stringify(rowBtn));

  if (rowBtn) {
    await page.mouse.click(rowBtn.x, rowBtn.y);
    await page.waitForTimeout(6000);
    const drawer = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('.ant-drawer, [class*="drawer"]')];
      const el = panels[panels.length - 1];
      return el ? el.innerText.slice(0, 1200) : 'NO DRAWER';
    });
    console.log('DRAWER CONTENT:', drawer.replace(/\n+/g, ' | ').slice(0, 1200));
    await page.screenshot({ path: '/tmp/drawer.png' });
  }

  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
