const { chromium } = require('playwright');
(async () => {
  const consoleMsgs = [];
  const networkReqs = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', m => consoleMsgs.push({type:m.type(), text:m.text()}));
  page.on('pageerror', e => consoleMsgs.push({type:'pageerror', text:e.message}));
  page.on('request', r => networkReqs.push(r.url()));
  const url = 'file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html';
  await page.goto(url);
  await page.waitForTimeout(2000);
  async function createProfile(name, email) {
    await page.fill('#localProfileName', name);
    await page.fill('#localProfileEmail', email);
    await page.click('#createLocalProfileBtn');
    await page.waitForTimeout(1500);
  }
  async function modalFill(text) {
    await page.fill('#pmIn', text);
    await page.click('[data-modal-ok]');
    await page.waitForTimeout(500);
  }
  async function clickAct(act, id) {
    const sel = id ? `[data-act="${act}"][data-id="${id}"]` : `[data-act="${act}"]`;
    await page.click(sel);
    await page.waitForTimeout(500);
  }
  async function projects() { return page.evaluate(() => { try { return eval('S').projects.map(p=>p.name); } catch(e){ return null; } }); }
  await createProfile('Alpha', 'alpha@test.local');
  console.log('PROFILE_A_EMAIL:', await page.textContent('#accountEmail'));
  await clickAct('new-project');
  await modalFill('AlphaProject');
  await page.waitForTimeout(1000);
  console.log('PROJECTS_A:', JSON.stringify(await projects()));
  await page.evaluate(() => document.querySelector('#signOutBtn').click());
  await page.waitForTimeout(1500);
  await createProfile('Beta', 'beta@test.local');
  console.log('PROFILE_B_EMAIL:', await page.textContent('#accountEmail'));
  await clickAct('new-project');
  await modalFill('BetaProject');
  await page.waitForTimeout(1000);
  console.log('PROJECTS_B:', JSON.stringify(await projects()));
  await page.evaluate(() => document.querySelector('#signOutBtn').click());
  await page.waitForTimeout(1500);
  await page.click('[data-local-profile="alpha@test.local"]');
  await page.waitForTimeout(1500);
  console.log('PROJECTS_A_AFTER_SWITCH:', JSON.stringify(await projects()));
  await page.reload();
  await page.waitForTimeout(3000);
  console.log('AFTER_RELOAD_EMAIL:', await page.textContent('#accountEmail').catch(()=>null));
  console.log('AFTER_RELOAD_PROJECTS:', JSON.stringify(await projects()));
  await page.evaluate(() => { location.hash = 'projects'; });
  await page.waitForTimeout(1000);
  const pid = await page.evaluate(() => eval('S').projects[0].id);
  console.log('PID:', pid);
  await clickAct('rename-project', pid);
  await page.waitForTimeout(500);
  await modalFill('AlphaProjectRenamed');
  await page.waitForTimeout(1000);
  console.log('RENAMED_PROJECTS:', JSON.stringify(await projects()));
  await page.evaluate(() => { location.hash = 'actions'; });
  await page.waitForTimeout(1000);
  await page.fill('#newTask', 'Test task');
  await page.fill('#newTaskAssigneeEmail', 'alpha@test.local');
  await page.click('[data-act="add-task"]');
  await page.waitForTimeout(1000);
  const tasks = await page.evaluate(() => eval('S').projects[0].actionItems.map(t=>t.title));
  console.log('TASKS:', JSON.stringify(tasks));
  const taskId = await page.evaluate(() => eval('S').projects[0].actionItems[0].id);
  await clickAct('delete-task', taskId);
  await page.waitForTimeout(500);
  const tasksAfterDelete = await page.evaluate(() => eval('S').projects[0].actionItems.length);
  console.log('TASKS_AFTER_DELETE:', tasksAfterDelete);
  const themeBefore = await page.getAttribute('html', 'data-theme');
  await page.click('#themeBtn');
  await page.waitForTimeout(500);
  const themeAfter = await page.getAttribute('html', 'data-theme');
  console.log('THEME_BEFORE:', themeBefore, 'THEME_AFTER:', themeAfter);
  await page.reload();
  await page.waitForTimeout(3000);
  console.log('THEME_RELOAD:', await page.getAttribute('html', 'data-theme'));
  await page.evaluate(() => { location.hash = 'data'; });
  await page.waitForTimeout(1000);
  console.log('EXPORT_JSON_BTN:', await page.$('[data-act="export-json"]') !== null);
  console.log('EXPORT_CSV_BTN:', await page.$('[data-act="export-csv"]') !== null);
  console.log('IMPORT_JSON_BTN:', await page.$('[data-act="import-json"]') !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(3000);
  console.log('OFFLINE_RELOAD_EMAIL:', await page.textContent('#accountEmail').catch(()=>null));
  await clickAct('new-project');
  await page.waitForTimeout(500);
  await modalFill('OfflineProject');
  await page.waitForTimeout(1000);
  console.log('OFFLINE_PROJECTS:', JSON.stringify(await projects()));
  await context.setOffline(false);
  console.log('CONSOLE:', JSON.stringify(consoleMsgs));
  console.log('NETWORK:', JSON.stringify(networkReqs));
  // cleanup
  await page.evaluate(() => document.querySelector('#signOutBtn').click());
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    try { localStorage.removeItem('bd_selected_profile_v1'); } catch(e){}
    let list = [];
    try { list = JSON.parse(localStorage.getItem('bd_local_profiles_v1')||'[]')||[]; } catch(e){list=[];}
    list = list.filter(p => !['alpha@test.local','beta@test.local'].includes(p.email));
    localStorage.setItem('bd_local_profiles_v1', JSON.stringify(list));
  });
  await page.evaluate(async () => {
    if (window.BD_STORAGE) {
      try { await window.BD_STORAGE.profileDelete('alpha@test.local'); } catch(e){}
      try { await window.BD_STORAGE.profileDelete('beta@test.local'); } catch(e){}
      try { await window.BD_STORAGE.stateDelete('alpha@test.local'); } catch(e){}
      try { await window.BD_STORAGE.stateDelete('beta@test.local'); } catch(e){}
    }
  });
  await browser.close();
})();
