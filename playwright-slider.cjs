const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('https://dev.cpzhongzhou.com/#/auth/login', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  // 找滑块相关元素
  const els = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div,span,button').forEach((el) => {
      const t = (el.className || '') + '|' + (el.innerText || '').slice(0, 20);
      if (/slider|滑块|drag|verify|captcha/i.test(t)) out.push({ tag: el.tagName, cls: t.slice(0, 80) });
    });
    return out.slice(0, 15);
  });
  console.log('slider els:', JSON.stringify(els, null, 1));

  const html = await page.content();
  const m = html.match(/<div[^>]*slider[^>]*>/i);
  console.log('slider html fragment:', m ? m[0].slice(0, 300) : 'none');
  await browser.close();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
