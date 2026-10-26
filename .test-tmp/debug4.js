const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  await page.fill('#localProfileName','Alpha');
  await page.fill('#localProfileEmail','alpha@test.local');
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('#createLocalProfileBtn');
    if (!btn) return 'no btn';
    btn.click();
    return 'clicked';
  });
  await page.waitForTimeout(4000);
  console.log('CLICKED:', clicked);
  console.log('TOASTS:', (await page.textContent('#toasts').catch(e=>e.message)));
  console.log('EMAIL:', (await page.textContent('#accountEmail').catch(e=>e.message)));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
