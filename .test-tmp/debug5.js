const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    document.addEventListener('click', function(e){ console.log('GLOBAL CLICK', e.target && e.target.id); });
  });
  await page.fill('#localProfileName','Alpha');
  await page.fill('#localProfileEmail','alpha@test.local');
  await page.click('#createLocalProfileBtn');
  await page.waitForTimeout(2000);
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
