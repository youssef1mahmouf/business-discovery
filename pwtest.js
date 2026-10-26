const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const url = 'file:///C:/Users/Sroor%20For%20Laptop/OneDrive/Desktop/business-discovery/index.html';
  await page.goto(url);
  await page.waitForTimeout(1000);
  async function register(user,email) {
    await page.click('#tabRegister');
    await page.fill('#rgUser', user);
    await page.fill('#rgEmail', email);
    await page.fill('#rgPw', 'password123');
    await page.fill('#rgPw2', 'password123');
    await page.click('#registerBtn');
    await page.waitForTimeout(2000);
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
  await register('datauserA','datauserA@example.com');
  await page.evaluate(() => { location.hash='projects'; });
  await page.waitForTimeout(500);
  await clickAct('new-project');
  await modalFill('AlphaProject');
  await page.waitForTimeout(1000);
  const projectsA = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('PROJECTS_A:', JSON.stringify(projectsA));
  const pidA = await page.evaluate(() => window.S.projects[0].id);
  await clickAct('rename-project', pidA);
  await page.waitForTimeout(500);
  await modalFill('AlphaProjectRenamed');
  await page.waitForTimeout(1000);
  const renamedA = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('RENAMED_A:', JSON.stringify(renamedA));
  await page.evaluate(() => { location.hash='actions'; });
  await page.waitForTimeout(1000);
  await page.fill('#newTask', 'TestTaskA');
  await page.click('[data-act="add-task"]');
  await page.waitForTimeout(1000);
  const tasksA = await page.evaluate(() => window.S.projects[0].actionItems.map(t=>t.title));
  console.log('TASKS_A:', JSON.stringify(tasksA));
  const taskIdA = await page.evaluate(() => window.S.projects[0].actionItems[0].id);
  await clickAct('delete-task', taskIdA);
  await page.waitForTimeout(500);
  const tasksAfterA = await page.evaluate(() => window.S.projects[0].actionItems.length);
  console.log('TASKS_AFTER_DELETE_A:', tasksAfterA);
  await page.click('#signOutBtn');
  await page.waitForTimeout(1500);
  await register('datauserB','datauserB@example.com');
  await page.evaluate(() => { location.hash='projects'; });
  await page.waitForTimeout(500);
  await clickAct('new-project');
  await modalFill('BetaProject');
  await page.waitForTimeout(1000);
  const projectsB = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('PROJECTS_B:', JSON.stringify(projectsB));
  console.log('B_SEES_ALPHA:', projectsB.includes('AlphaProjectRenamed'));
  await page.click('#signOutBtn');
  await page.waitForTimeout(1500);
  await page.fill('#liId', 'datauserA@example.com');
  await page.fill('#liPw', 'password123');
  await page.click('#loginBtn');
  await page.waitForTimeout(2000);
  const projectsA2 = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('PROJECTS_A_AFTER_SWITCH:', JSON.stringify(projectsA2));
  console.log('A_SEES_BETA:', projectsA2.includes('BetaProject'));
  await page.reload();
  await page.waitForTimeout(2000);
  const projectsAfterReload = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('PROJECTS_A_AFTER_RELOAD:', JSON.stringify(projectsAfterReload));
  const pidA2 = await page.evaluate(() => window.S.projects[0].id);
  await page.evaluate(() => { location.hash='projects'; });
  await page.waitForTimeout(500);
  await clickAct('delete-project', pidA2);
  await page.waitForTimeout(1000);
  const projectsAfterDelete = await page.evaluate(() => window.S.projects.map(p=>p.name));
  console.log('PROJECTS_A_AFTER_DELETE:', JSON.stringify(projectsAfterDelete));
  // cleanup
  await page.click('#signOutBtn');
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    if (window.BD_STORAGE) {
      for (const e of ['datauserA@example.com','datauserB@example.com']) {
        try { await window.BD_STORAGE.profileDelete(e); } catch(_){}
        try { await window.BD_STORAGE.stateDelete(e); } catch(_){}
      }
    }
    try { localStorage.removeItem('bd_selected_profile_v1'); } catch(_){}
    let list=[]; try { list=JSON.parse(localStorage.getItem('bd_local_profiles_v1')||'[]')||[]; }catch(_){list=[];}
    list=list.filter(p=>!['datauserA@example.com','datauserB@example.com'].includes(p.email));
    localStorage.setItem('bd_local_profiles_v1', JSON.stringify(list));
  });
  console.log('FINAL_ERRORS:', JSON.stringify(errors));
  await browser.close();
})();
