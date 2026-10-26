const { chromium } = require('playwright');
(async () => {
  const msgs=[]; const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  page.on('console',m=>msgs.push(m.type()+':'+m.text()));
  page.on('pageerror',e=>msgs.push('pe:'+e.message));
  await page.goto('file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html');
  await page.waitForTimeout(2000);
  await page.fill('#localProfileName','Alpha'); await page.fill('#localProfileEmail','alpha@test.local'); await page.click('#createLocalProfileBtn'); await page.waitForTimeout(1500);
  await page.click('[data-act="new-project"]'); await page.waitForTimeout(300);
  await page.fill('#pmIn','AlphaProject'); await page.click('[data-modal-ok]'); await page.waitForTimeout(1000);
  await page.evaluate(()=>{location.hash='actions';}); await page.waitForTimeout(1000);
  await page.fill('#newTask','Test task'); await page.fill('#newTaskAssigneeEmail','alpha@test.local');
  await page.click('[data-act="add-task"]'); await page.waitForTimeout(1500);
  console.log('TASKS:', await page.evaluate(()=>{try{return eval('S').projects[0].actionItems.map(t=>t.title);}catch(e){return e.message;}}));
  console.log('MSGS:', JSON.stringify(msgs));
  await browser.close();
})();
