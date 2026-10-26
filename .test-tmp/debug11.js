const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  // inject before load
  await page.addInitScript(() => {
    const orig = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function(type, fn, opts) {
      if (this.id === 'createLocalProfileBtn') console.log('addEventListener on createBtn', type);
      return orig.call(this, type, fn, opts);
    };
  });
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
