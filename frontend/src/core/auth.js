// frontend/src/core/auth.js
// Token management, role detection, and auth guards.
// Reuses window.BD (from common.js) where available; falls back to localStorage.

const TOKEN_KEY = 'bd_token';

export function getToken() {
  if (window.BD && typeof window.BD.getToken === 'function') return window.BD.getToken();
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (window.BD && typeof window.BD.setToken === 'function') window.BD.setToken(token);
  else if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getPayload() {
  try {
    const t = getToken();
    if (!t) return null;
    const part = t.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch (e) {
    return null;
  }
}

export function getEmail() {
  const p = getPayload();
  return p && p.email ? p.email : null;
}

export function getRole() {
  const p = getPayload();
  if (!p) return 'regular_user';
  const r = p.role;
  if (r === 'main_super_admin' || r === 'site_admin') return r;
  return 'regular_user';
}

export function isAdmin() {
  const r = getRole();
  return r === 'site_admin' || r === 'main_super_admin';
}

export function isSuperAdmin() {
  return getRole() === 'main_super_admin';
}

export function requireAuth() {
  if (!getToken()) location.href = 'login.html';
}

export function requireAdmin() {
  requireAuth();
  if (!isAdmin()) location.href = 'projects.html';
}

export function logout() {
  setToken(null);
  location.href = 'login.html';
}
