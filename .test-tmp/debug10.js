const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const orig = window.BD_STORAGE.profileSet.bind(window.BD_STORAGE);
    window.BD_STORAGE.profileSet = async (p) => { console.log('profileSet called', p && p.email); const r = await orig(p); console.log('profileSet result', r); return r; };
    const origGet = window.BD_STORAGE.profileGet.bind(window.BD_STORAGE);
    window.BD_STORAGE.profileGet = async (e) => { console.log('profileGet called', e); const r = await origGet(e); console.log('profileGet result', r); return r; };
  });
  await page.fill('#localProfileName','Alpha');
  await page.fill('#localProfileEmail','alpha@test.local');
  await page.click('#createLocalProfileBtn');
  await page.waitForTimeout(5000);
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
