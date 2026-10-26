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
  await page.waitForTimeout(3000);
  console.log('EMAIL:', await page.textContent('#accountEmail').catch(e=>e.message));
  console.log('AUTHHOST_DISPLAY:', await page.$eval('#authHost',e=>e.style.display).catch(e=>e.message));
  console.log('APP_DISPLAY:', await page.$eval('.app',e=>e.style.display).catch(e=>e.message));
  console.log('BUTTONS:', await page.$$eval('[data-act]', els=>els.map(e=>e.getAttribute('data-act'))));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
