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
      const existing = await window.BD_STORAGE.profileGet('alpha@test.local');
      console.log('existing', existing);
      const profile = existing || { email: 'alpha@test.local', name: 'Alpha', createdAt: new Date().toISOString() };
      profile.name = 'Alpha';
      profile.updatedAt = new Date().toISOString();
      const ok = await window.BD_STORAGE.profileSet(profile);
      console.log('profileSet ok', ok);
      return { ok, existing };
    } catch (e) {
      console.log('ERR', e && e.message);
      return { error: e && e.message };
    }
  });
  await page.waitForTimeout(2000);
  console.log('RES:', JSON.stringify(res));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
