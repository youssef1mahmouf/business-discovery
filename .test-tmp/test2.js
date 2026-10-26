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
  // Test 1/2 profiles
  await createProfile('Alpha', 'alpha@test.local');
  const emailA = await page.textContent('#accountEmail');
  console.log('PROFILE_A_EMAIL:', emailA);
  await clickAct('new-project');
  await modalFill('AlphaProject');
  await page.waitForTimeout(1000);
  const projectsA = await page.evaluate(() => (window.S && window.S.projects ? window.S.projects.map(p=>p.name) : null));
  console.log('PROJECTS_A:', JSON.stringify(projectsA));
  await page.evaluate(() => document.querySelector('#signOutBtn').click());
  await page.waitForTimeout(1500);
  await createProfile('Beta', 'beta@test.local');
  const emailB = await page.textContent('#accountEmail');
  console.log('PROFILE_B_EMAIL:', emailB);
  await clickAct('new-project');
  await modalFill('BetaProject');
  await page.waitForTimeout(1000);
  const projectsB = await page.evaluate(() => (window.S && window.S.projects ? window.S.projects.map(p=>p.name) : null));
  console.log('PROJECTS_B:', JSON.stringify(projectsB));
  await page.evaluate(() => document.querySelector('#signOutBtn').click());
  await page.waitForTimeout(1500);
  await page.click('[data-local-profile="alpha@test.local"]');
  await page.waitForTimeout(1500);
  const projectsA2 = await page.evaluate(() => (window.S && window.S.projects ? window.S.projects.map(p=>p.name) : null));
  console.log('PROJECTS_A_AFTER_SWITCH:', JSON.stringify(projectsA2));
  // Test 3 reload persistence
  await page.reload();
  await page.waitForTimeout(3000);
  const afterReloadEmail = await page.textContent('#accountEmail').catch(()=>null);
  const afterReloadProjects = await page.evaluate(() => (window.S && window.S.projects ? window.S.projects.map(p=>p.name) : null));
  console.log('AFTER_RELOAD_EMAIL:', afterReloadEmail);
  console.log('AFTER_RELOAD_PROJECTS:', JSON.stringify(afterReloadProjects));
  // project editing
  await page.evaluate(() => { location.hash = 'projects'; });
  await page.waitForTimeout(1000);
  const pid = await page.evaluate(() => window.S.projects[0].id);
  console.log('PID:', pid);
  await clickAct('rename-project', pid);
  await page.waitForTimeout(500);
  await modalFill('AlphaProjectRenamed');
  await page.waitForTimeout(1000);
  const renamed = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('RENAMED_PROJECTS:', JSON.stringify(renamed));
  // task creation
  await page.evaluate(() => { location.hash = 'actions'; });
  await page.waitForTimeout(1000);
  await page.fill('#newTask', 'Test task');
  await page.click('[data-act="add-task"]');
  await page.waitForTimeout(1000);
  const tasks = await page.evaluate(() => window.S.projects[0].actionItems.map(t=>t.title));
  console.log('TASKS:', JSON.stringify(tasks));
  const taskId = await page.evaluate(() => window.S.projects[0].actionItems[0].id);
  await clickAct('delete-task', taskId);
  await page.waitForTimeout(500);
  const tasksAfterDelete = await page.evaluate(() => window.S.projects[0].actionItems.length);
  console.log('TASKS_AFTER_DELETE:', tasksAfterDelete);
  // theme
  const themeBefore = await page.getAttribute('html', 'data-theme');
  await page.click('#themeBtn');
  await page.waitForTimeout(500);
  const themeAfter = await page.getAttribute('html', 'data-theme');
  console.log('THEME_BEFORE:', themeBefore, 'THEME_AFTER:', themeAfter);
  await page.reload();
  await page.waitForTimeout(3000);
  const themeReload = await page.getAttribute('html', 'data-theme');
  console.log('THEME_RELOAD:', themeReload);
  // data view buttons
  await page.evaluate(() => { location.hash = 'data'; });
  await page.waitForTimeout(1000);
  const exportJsonExists = await page.$('[data-act="export-json"]') !== null;
  const exportCsvExists = await page.$('[data-act="export-csv"]') !== null;
  const importJsonExists = await page.$('[data-act="import-json"]') !== null;
  console.log('EXPORT_JSON_BTN:', exportJsonExists, 'EXPORT_CSV_BTN:', exportCsvExists, 'IMPORT_JSON_BTN:', importJsonExists);
  // offline
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(3000);
  const offlineEmail = await page.textContent('#accountEmail').catch(()=>null);
  console.log('OFFLINE_RELOAD_EMAIL:', offlineEmail);
  await clickAct('new-project');
  await page.waitForTimeout(500);
  await modalFill('OfflineProject');
  await page.waitForTimeout(1000);
  const offlineProjects = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('OFFLINE_PROJECTS:', JSON.stringify(offlineProjects));
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

