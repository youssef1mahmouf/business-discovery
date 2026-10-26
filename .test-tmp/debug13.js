const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.addInitScript(() => {
    // wrap localEntryScreen not global; instead log when authHost innerHTML set
    const orig = Element.prototype.innerHTML;
    // can't easily; instead observe
  });
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    hasCreateBtn: !!document.querySelector('#createLocalProfileBtn'),
    authDisplay: document.querySelector('#authHost')?.style.display,
    appDisplay: document.querySelector('.app')?.style.display
  }));
  console.log('STATE:', JSON.stringify(state));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
