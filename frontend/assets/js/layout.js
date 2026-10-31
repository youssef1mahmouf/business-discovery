(function(){
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    participants: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 11a4 4 0 0 1 4 4v2"/></svg>',
    friends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    partners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z"/></svg>'
  };
  function getTokenPayload() {
    try {
      const t = (window.BD && BD.getToken) ? BD.getToken() : localStorage.getItem('bd_token');
      if (!t) return null;
      const part = t.split('.')[1];
      return JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
    } catch(e){ return null; }
  }
  function normalizeRole(p){
    if (!p) return 'regular_user';
    if (String(p.email||'').toLowerCase() === 'youssef1mahmouf24@gmail.com') return 'main_super_admin';
    const r = p.role;
    if (r === 'main_super_admin' || r === 'site_admin') return r;
    return 'regular_user';
  }
  function isAdmin(p){ const r = normalizeRole(p); return r === 'site_admin' || r === 'main_super_admin'; }
  function pageTitles(){
    const map = { 'index.html':'لوحة التحكم','projects.html':'المشاريع','participants.html':'المشاركون','friends.html':'الأصدقاء','partners.html':'الشركاء','tasks.html':'المهام','notifications.html':'الإشعارات','chat.html':'الدردشة','settings.html':'الإعدادات','admin.html':'الإدارة' };
    const name = (location.pathname.split('/').pop() || 'index.html');
    return map[name] || document.title || 'Business Discovery';
  }
  document.addEventListener('DOMContentLoaded', function(){
    const shell = document.getElementById('appShell');
    if (!shell) return;
    const payload = getTokenPayload();
    const admin = isAdmin(payload);
    const nav = document.getElementById('bdSidebarNav');
    const items = [
      {href:'index.html', label:'لوحة التحكم', icon:'dashboard'},
      {href:'projects.html', label:'المشاريع', icon:'projects'},
      {href:'participants.html', label:'المشاركون', icon:'participants'},
      {href:'friends.html', label:'الأصدقاء', icon:'friends'},
      {href:'partners.html', label:'الشركاء', icon:'partners'},
      {href:'tasks.html', label:'المهام', icon:'tasks'},
      {href:'notifications.html', label:'الإشعارات', icon:'notifications'},
      {href:'chat.html', label:'الدردشة', icon:'chat'},
      {href:'settings.html', label:'الإعدادات', icon:'settings'}
    ];
    if (admin) items.push({href:'admin.html', label:'الإدارة', icon:'admin'});
    const current = (location.pathname.split('/').pop() || 'index.html');
    if (nav) nav.innerHTML = items.map(it => {
      const active = it.href === current ? 'active' : '';
      return '<a class="nav-item '+active+'" href="'+it.href+'"><span class="nav-icon">'+icons[it.icon]+'</span><span class="nav-label">'+it.label+'</span></a>';
    }).join('');
    const titleEl = document.getElementById('bdPageTitle');
    if (titleEl) titleEl.textContent = pageTitles();
    const emailEl = document.getElementById('bdUserEmail');
    if (emailEl && payload && payload.email) emailEl.textContent = payload.email;
    const menuBtn = document.getElementById('bdMenuBtn');
    const sidebar = document.getElementById('bdSidebar');
    const overlay = document.getElementById('bdOverlay');
    function closeMenu(){ if(sidebar) sidebar.classList.remove('open'); if(overlay) overlay.classList.remove('open'); }
    function openMenu(){ if(sidebar) sidebar.classList.add('open'); if(overlay) overlay.classList.add('open'); }
    if (menuBtn) menuBtn.addEventListener('click', function(){ if(sidebar && sidebar.classList.contains('open')) closeMenu(); else openMenu(); });
    if (overlay) overlay.addEventListener('click', closeMenu);
    const collapseBtn = document.getElementById('bdCollapseBtn');
    if (collapseBtn) collapseBtn.addEventListener('click', function(){ if(sidebar) sidebar.classList.toggle('collapsed'); });
    const profileBtn = document.getElementById('bdProfileBtn');
    const dropdown = document.getElementById('bdProfileDropdown');
    if (profileBtn && dropdown) {
      profileBtn.addEventListener('click', function(e){ e.stopPropagation(); dropdown.classList.toggle('open'); });
      document.addEventListener('click', function(){ dropdown.classList.remove('open'); });
    }
    const logout = document.getElementById('bdLogout');
    if (logout) logout.addEventListener('click', function(e){
      e.preventDefault();
      if (window.BD && BD.setToken) BD.setToken(null); else localStorage.removeItem('bd_token');
      location.href = 'login.html';
    });
    const countEl = document.getElementById('bdNotifCount');
    if (window.BD && BD.api && countEl) {
      BD.api('/api/notifications').then(function(d){
        const n = (d.notifications||[]).filter(function(x){ return !x.read; }).length;
        if (n > 0) { countEl.textContent = n; countEl.style.display='inline-block'; }
        else countEl.style.display='none';
      }).catch(function(){ if(countEl) countEl.style.display='none'; });
    }
    const searchInput = document.getElementById('bdSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', function(e){
        if (e.key === 'Enter') {
          const q = document.getElementById('q');
          if (q) { q.value = searchInput.value; const btn = document.querySelector('button[onclick="search()"]'); if (btn) btn.click(); }
        }
      });
    }
  });
})();

