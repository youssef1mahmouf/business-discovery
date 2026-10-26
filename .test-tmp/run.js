const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleMsgs = [];
  const networkReqs = [];
  page.on('console', m => consoleMsgs.push({type:m.type(), text:m.text()}));
  page.on('pageerror', e => consoleMsgs.push({type:'pageerror', text:e.message}));
  page.on('request', r => networkReqs.push(r.url()));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(3000);
  console.log('TITLE:', await page.title());
  console.log('CONSOLE:', JSON.stringify(consoleMsgs));
  console.log('NETWORK:', JSON.stringify(networkReqs));
  await browser.close();
})();
