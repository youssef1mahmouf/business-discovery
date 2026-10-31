window.BD_API_BASE = window.BD_API_BASE || (location.hostname === 'localhost' ? 'http://localhost:3000' : '');
const API = window.BD_API_BASE;
function getToken(){ return localStorage.getItem('bd_token'); }
function setToken(t){ if(t) localStorage.setItem('bd_token',t); else localStorage.removeItem('bd_token'); }
async function api(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const t = getToken();
  if (t) headers.Authorization = 'Bearer '+t;
  const res = await fetch(API+path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
window.BD = { API, getToken, setToken, api };
function escapeHtml(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function requireAuth(){ if(!getToken()){ location.href='login.html'; } }
window.BD.requireAuth = requireAuth;
window.BD.escapeHtml = escapeHtml;
