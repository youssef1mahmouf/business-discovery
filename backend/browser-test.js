const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://localhost:3000';
const outDir = path.join(__dirname, '..', 'test-output', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '430x932', width: 430, height: 932 },
  { name: '375x812', width: 375, height: 812 }
];

const publicPages = ['index.html', 'login.html', 'register.html'];
const authPages = ['projects.html','participants.html','friends.html','partners.html','tasks.html','notifications.html','chat.html','settings.html','admin.html'];

(async () => {
  // login to get token
  const loginRes = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'xss_test@example.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('token acquired:', !!token);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const results = [];

  async function testPage(pageName, auth) {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      if (auth && token) {
        await context.addInitScript((t) => {
          window.localStorage.setItem('bd_token', t);
        }, token);
      }
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('requestfailed', req => failedRequests.push(req.url() + ' :: ' + (req.failure() && req.failure().errorText)));
      const url = baseUrl + '/' + pageName;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('goto err', e.message));
      await page.waitForTimeout(1000);
      const title = await page.title();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const dir = pageName.replace('.html','');
      const folder = path.join(outDir, dir);
      fs.mkdirSync(folder, { recursive: true });
      const shotPath = path.join(folder, vp.name + '.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      results.push({ page: pageName, viewport: vp.name, title, url, overflow, scrollWidth, viewportWidth: vp.width, consoleErrors, failedRequests, shotPath });
      await context.close();
    }
  }

  for (const p of publicPages) await testPage(p, false);
  for (const p of authPages) await testPage(p, true);

  await browser.close();
  fs.writeFileSync(path.join(__dirname, '..', 'test-output', 'results.json'), JSON.stringify(results, null, 2));
  console.log('DONE, pages:', results.length);
})();
