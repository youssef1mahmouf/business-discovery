window.BD_API_BASE = window.BD_API_BASE || (location.hostname === 'localhost' ? 'http://localhost:3000' : '');
const API = window.BD_API_BASE;
const commonScriptUrl = document.currentScript ? document.currentScript.src : document.baseURI;
const storedTheme = localStorage.getItem('bd_theme');
if (storedTheme === 'light') document.documentElement.dataset.theme = 'light';
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
    'username_in_use': 'اسم المستخدم مستخدم بالفعل',
    'invalid_username': 'اسم المستخدم يجب أن يتكون من 3 إلى 30 حرفاً أو رقماً أو _',
    'invalid_profile': 'تحقق من الاسم وبيانات السيرة الذاتية',
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
    'cannot_remove_owner': 'لا يمكن إزالة مالك المشروع',
    'invalid_assessment': 'أكمل التقييم واختر إجابة صحيحة لكل سؤال',
    'invalid_assignee': 'المكلف يجب أن يكون عضواً في المشروع',
    'ai_unavailable': 'مساعد Ollama غير متاح حالياً. تحقق من تشغيله وإعداد الخادم.',
    'ollama_offline': 'تعذر الوصول إلى Ollama. شغّل الخدمة وتحقق من عنوان OLLAMA_BASE_URL.',
    'ollama_model_missing': 'النموذج غير مثبت في Ollama. ثبّت النموذج المحدد في OLLAMA_MODEL.',
    'ollama_unavailable': 'تعذر على Ollama إكمال الطلب. تحقق من سجلات الخدمة وإصدار النموذج.',
    'invalid_ollama_response': 'أعاد Ollama استجابة غير صالحة.',
    'invalid_ai_response': 'أعاد المساعد نتيجة غير صالحة. حاول مرة أخرى.',
    'invalid_product': 'تحقق من اسم المنتج والسعر والوصف',
    'invalid_import': 'تعذر قراءة الملف. تحقق من نوعه ومحتواه وحجمه.',
    'invalid_import_headers': 'يجب أن يحتوي الملف على أعمدة اسم المنتج والسعر',
    'unsupported_import_format': 'الأنواع المدعومة: CSV وExcel XLSX وPDF وWord DOCX',
    'provider_disabled': 'التحويل اليدوي غير مفعّل حالياً من إدارة المنصة',
    'shop_unavailable': 'المتجر غير جاهز لاستقبال الطلبات',
    'invalid_order': 'بيانات الطلب أو الكمية غير صالحة',
    'invalid_transfer_reference': 'أدخل مرجع التحويل كما يظهر في تطبيق البنك',
    'invalid_order_transition': 'حالة الطلب تغيرت أو لا تسمح بهذا الإجراء',
    'duplicate_reference': 'مرجع التحويل مستخدم في طلب آخر',
    'invalid_payment_settings': 'إعدادات الدفع أو نسبة العمولة غير صالحة',
    'import_document_too_large': 'الملف كبير أو يحتوي على بيانات مضغوطة أكثر من المسموح',
    'import_document_too_long': 'المستند يتجاوز حد الصفحات أو النص المسموح'
  };
  const error = new Error(errorMessages[data.error] || data.error || res.statusText);
  error.status = res.status;
  throw error;
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
window.BD.setTheme = function(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  if (value === 'light') document.documentElement.dataset.theme = 'light';
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('bd_theme', value);
};
function escapeHtml(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function requireAuth(){ if(!getToken()){ location.href='login.html'; } }
window.BD.requireAuth = requireAuth;
window.BD.escapeHtml = escapeHtml;

function tokenPayload(){
  try {
    const token = getToken();
    if (!token) return null;
    const part = token.split('.')[0];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
window.BD.getTokenPayload = tokenPayload;

function createLink(href, label, className){
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = className;
  return link;
}

async function updatePublicNavigation(){
  const cta = document.querySelector('.rd-nav-cta');
  if (!cta) return;
  const homepageSignup = document.querySelectorAll('.homepage-signup');
  const homepageCta = document.querySelector('.home-cta');
  if (!getToken()) return;
  homepageSignup.forEach((element) => { element.hidden = true; });
  if (homepageCta) homepageCta.hidden = true;
  const payload = tokenPayload();
  let name = payload && payload.email ? payload.email.split('@')[0] : 'حسابي';
  try {
    const auth = await api('/api/auth/me');
    if (!auth.user) throw new Error('Authenticated user not returned.');
    name = auth.user.email.split('@')[0] || name;
    const data = await api('/api/profile');
    if (data.profile && data.profile.displayName) name = data.profile.displayName;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      setToken(null);
      homepageSignup.forEach((element) => { element.hidden = false; });
      if (homepageCta) homepageCta.hidden = false;
      return;
    }
    console.error('Unable to verify homepage account navigation:', error);
  }
  cta.replaceChildren(
    createLink('dashboard.html', 'لوحة التحكم', 'rd-btn ghost'),
    createLink('profile.html', name, 'rd-btn primary'),
  );
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'rd-btn ghost';
  logout.textContent = 'تسجيل الخروج';
  logout.addEventListener('click', () => {
    setToken(null);
    location.href = 'index.html';
  });
  cta.appendChild(logout);
}

function initPageScene(){
  if (document.getElementById('hero3d') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'bdAmbientScene';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const path = location.pathname.toLowerCase();
  const palettes = [
    [/profile|cv/, 0xf0b95b, 0x8b5cf6],
    [/assessment|project/, 0x35d5f2, 0x8b5cf6],
    [/task|assistant/, 0x34d399, 0x35d5f2],
    [/commerce|order|payment/, 0xf0b95b, 0x35d5f2],
  ];
  const palette = palettes.find(([pattern]) => pattern.test(path));
  const color = palette ? palette[1] : 0x35d5f2;
  const innerColor = palette ? palette[2] : 0x8b5cf6;
  const sceneModuleUrl = new URL('../../src/animations/three-scene.js', commonScriptUrl);
  import(sceneModuleUrl.href)
    .then(({ ThreeSceneManager }) => {
      const scene = new ThreeSceneManager(canvas, {
        color,
        innerColor,
        particleCount: 48,
        pixelRatioCap: 1.15,
        rotationSpeed: 0.00018,
        pointerTracking: true,
      });
      if (!scene.init()) canvas.remove();
      window.addEventListener('beforeunload', () => scene.dispose(), { once: true });
    })
    .catch((error) => {
      canvas.remove();
      console.error('Unable to load the page background scene:', error);
    });
}

function loadLocalScript(relativePath) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(relativePath, commonScriptUrl).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load local animation library: ' + relativePath));
    document.head.appendChild(script);
  });
}

function initSharedMotion() {
  if (document.body.classList.contains('home-page')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  import(new URL('../../src/animations/lenis.js', commonScriptUrl).href)
    .then(({ initLenis, destroyLenis }) => {
      if (initLenis()) {
        window.addEventListener('beforeunload', destroyLenis, { once: true });
      }
    })
    .catch((error) => console.error('Unable to initialize smooth page scrolling:', error));

  loadLocalScript('../vendor/gsap.js')
    .then(() => {
      if (!window.gsap) throw new Error('GSAP loaded without exposing its animation API.');
      const gsap = window.gsap;
      const sections = Array.from(document.querySelectorAll(
        '.main-area .content > .container > .card, .main-area .content > .container > section:not([hidden]), .rd-auth-card'
      )).filter((element) => !element.hidden);

      if (sections.length) {
        gsap.from(sections, {
          autoAlpha: 0,
          y: 16,
          duration: 0.55,
          stagger: 0.07,
          ease: 'power2.out',
          clearProps: 'opacity,visibility,transform',
        });
      }

      document.querySelectorAll('.settings-card, .dashboard-stat').forEach((card) => {
        card.addEventListener('pointermove', (event) => {
          if (event.pointerType === 'touch') return;
          const bounds = card.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - 0.5;
          const y = (event.clientY - bounds.top) / bounds.height - 0.5;
          gsap.to(card, {
            rotationY: x * 3,
            rotationX: y * -3,
            y: -3,
            duration: 0.25,
            overwrite: 'auto',
          });
        });
        card.addEventListener('pointerleave', () => {
          gsap.to(card, {
            rotationX: 0,
            rotationY: 0,
            y: 0,
            duration: 0.35,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        });
      });
    })
    .catch((error) => console.error('Unable to initialize shared page animations:', error));
}

function updateFooterText() {
  const year = new Date().getFullYear();
  document.querySelectorAll('.sidebar-footer, .app-footer, .rd-footer').forEach((footer) => {
    footer.textContent = footer.classList.contains('sidebar-footer')
      ? '© ' + year + ' Business Discovery'
      : 'Business Discovery © ' + year + ' — جميع الحقوق محفوظة';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateFooterText();
  updatePublicNavigation();
  initPageScene();
  initSharedMotion();
});
