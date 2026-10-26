const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  const res = await page.evaluate(async () => {
    try {
      window.CURRENT_PROFILE_ID = 'alpha@test.local';
      document.querySelector('#authHost').style.display = 'none';
      if (document.querySelector('.app')) document.querySelector('.app').style.display = '';
      document.querySelector('#accountEmail').textContent = 'alpha@test.local';
      if (document.querySelector('#signOutBtn')) document.querySelector('#signOutBtn').style.display = 'none';
      // loadState is not global; try calling if exists
      if (typeof loadState === 'function') { await loadState(); return 'loadState ok'; }
      return 'no loadState';
    } catch (e) {
      console.log('ERR', e && e.stack);
      return 'error: ' + (e && e.message);
    }
  });
  await page.waitForTimeout(2000);
  console.log('RES:', res);
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
