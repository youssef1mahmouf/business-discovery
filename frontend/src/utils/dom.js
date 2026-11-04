// frontend/src/utils/dom.js
// DOM helpers: toast, empty state, etc.

export function showToast(message, type = 'success', duration = 3000) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

export function emptyState(container, { icon = '📁', title = '', description = '', actionLabel = null, actionHandler = null } = {}) {
  if (!container) return;
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  wrap.innerHTML = `<span class="empty-icon">${icon}</span><h3>${title}</h3><p>${description}</p>`;
  if (actionLabel && typeof actionHandler === 'function') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = actionLabel;
    btn.onclick = actionHandler;
    wrap.appendChild(btn);
  }
  container.appendChild(wrap);
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setLoading(btn, loading, label = '') {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> جاري...';
  } else {
    btn.disabled = false;
    btn.innerHTML = label || btn.dataset.originalText || '';
  }
}
