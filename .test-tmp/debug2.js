const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(2000);
  await page.fill('#localProfileName','Alpha');
  await page.fill('#localProfileEmail','alpha@test.local');
  await page.click('#createLocalProfileBtn');
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => {
    return { name: document.querySelector('#localProfileName')?.value, email: document.querySelector('#localProfileEmail')?.value, bdStorage: !!window.BD_STORAGE };
  });
  console.log('INPUTS:', JSON.stringify(result));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
