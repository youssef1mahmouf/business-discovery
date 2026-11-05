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
  if (!res.ok) {
  const errorMessages = {
    'email_in_use': 'هذا البريد الإلكتروني مستخدم بالفعل',
    'invalid_credentials': 'اسم المستخدم أو كلمة المرور غير صحيحة',
    'invalid_input': 'بيانات إدخال غير صحيحة',
    'invalid_json': 'بيانات غير صحيحة',
    'invalid_id': 'معرّف العنصر غير صالح',
    'invalid_status': 'حالة المهمة غير صالحة',
    'invalid_or_expired_code': 'رمز الاستعادة غير صحيح أو منتهي الصلاحية',
    'passwords_do_not_match': 'كلمتا المرور غير متطابقتين',
    'forbidden': 'ليست لديك صلاحية تنفيذ هذا الإجراء',
    'not_found': 'العنصر المطلوب غير موجود',
    'already_requested': 'أرسلت دعوة معلقة لهذا البريد بالفعل',
    'already_friends': 'هذا المستخدم موجود في قائمة أصدقائك',
    'request_received': 'لديك طلب صداقة وارد من هذا المستخدم',
    'already_invited': 'أرسلت دعوة شراكة معلقة لهذا البريد بالفعل',
    'already_partners': 'هذا المستخدم شريك بالفعل',
    'invitation_received': 'لديك دعوة شراكة واردة من هذا المستخدم',
    'already_member': 'هذا المستخدم عضو بالفعل في المشروع',
    'cannot_remove_owner': 'لا يمكن إزالة مالك المشروع'
  };
  throw new Error(errorMessages[data.error] || data.error || res.statusText);
}
  return data;
}
function showToast(message, type='success', duration=3000){
  const toast=document.createElement('div');
  toast.className='toast '+type;
  toast.setAttribute('role','status');
  toast.textContent=message;
  document.body.appendChild(toast);
  requestAnimationFrame(()=>toast.classList.add('show'));
  setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),300);},duration);
}
window.BD = { API, getToken, setToken, api, showToast };
function escapeHtml(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function requireAuth(){ if(!getToken()){ location.href='login.html'; } }
window.BD.requireAuth = requireAuth;
window.BD.escapeHtml = escapeHtml;
