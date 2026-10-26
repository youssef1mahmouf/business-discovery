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
  const res = await page.evaluate(async () => {
    try {
      const name = (document.querySelector('#localProfileName').value||'').trim();
      const email = (document.querySelector('#localProfileEmail').value||'').trim().toLowerCase();
      console.log('name',name,'email',email);
      const existing = await window.BD_STORAGE.profileGet(email);
      const profile = existing || { email: email, name: name, createdAt: (typeof nowISO==='function'?nowISO():new Date().toISOString()) };
      profile.name = name;
      profile.updatedAt = (typeof nowISO==='function'?nowISO():new Date().toISOString());
      const ok = await window.BD_STORAGE.profileSet(profile);
      console.log('ok',ok);
      if (!ok) return 'profileSet false';
      let list = [];
      try { list = JSON.parse(localStorage.getItem('bd_local_profiles_v1') || '[]') || []; } catch (_) { list = []; }
      if (!list.some(p => p.email === email)) list.push({ email: email, name: name });
      localStorage.setItem('bd_local_profiles_v1', JSON.stringify(list));
      localStorage.setItem('bd_selected_profile_v1', email);
      // enterLocalApp
      return 'before enterLocalApp';
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
