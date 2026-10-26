const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const msgs=[]; page.on('console',m=>msgs.push(m.type()+':'+m.text())); page.on('pageerror',e=>msgs.push('pageerror:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(4000);
  // replicate create handler but call enterLocalApp by evaluating function if global?
  const res = await page.evaluate(async () => {
    try {
      // create profile record
      const email='alpha@test.local';
      const name='Alpha';
      const profile={email,name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await window.BD_STORAGE.profileSet(profile);
      localStorage.setItem('bd_local_profiles_v1', JSON.stringify([{email,name}]));
      localStorage.setItem('bd_selected_profile_v1', email);
      // now invoke enterLocalApp if defined in global? 
      if (typeof enterLocalApp === 'function') { await enterLocalApp(profile); return 'enterLocalApp called'; }
      return 'enterLocalApp not global';
    } catch(e){ console.log('ERR', e && e.stack); return 'error '+e.message; }
  });
  await page.waitForTimeout(2000);
  console.log('RES:', res);
  console.log('EMAIL:', await page.textContent('#accountEmail').catch(e=>e.message));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
