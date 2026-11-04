// frontend/src/core/api.js
// Central API service layer. Wraps window.BD.api (common.js) with typed helpers.
// All endpoints match the existing backend contracts exactly.

const BASE = window.BD && window.BD.API ? window.BD.API : (location.hostname === 'localhost' ? 'http://localhost:3000' : '');

async function request(path, opts = {}) {
  if (window.BD && typeof window.BD.api === 'function') {
    return window.BD.api(path, opts);
  }
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const token = localStorage.getItem('bd_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Auth ----------
export const authApi = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, password) => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};

// ---------- Projects ----------
export const projectsApi = {
  list: () => request('/api/projects'),
  create: (data) => request('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  get: (id) => request('/api/projects/' + id),
  update: (id, data) => request('/api/projects/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request('/api/projects/' + id, { method: 'DELETE' }),
  addMember: (id, email) => request('/api/projects/' + id + '/members', { method: 'POST', body: JSON.stringify({ email }) }),
  removeMember: (id, email) => request('/api/projects/' + id + '/members/' + encodeURIComponent(email), { method: 'DELETE' }),
  updateMemberRole: (id, email, role) => request('/api/projects/' + id + '/members/' + encodeURIComponent(email) + '/role', { method: 'PUT', body: JSON.stringify({ role }) }),
};

// ---------- Participants ----------
export const participantsApi = {
  list: () => request('/api/participants'),
  create: (data) => request('/api/participants', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request('/api/participants/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request('/api/participants/' + id, { method: 'DELETE' }),
};

// ---------- Tasks ----------
export const tasksApi = {
  list: () => request('/api/tasks'),
  create: (data) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request('/api/tasks/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request('/api/tasks/' + id, { method: 'DELETE' }),
};

// ---------- Notifications ----------
export const notificationsApi = {
  list: () => request('/api/notifications'),
  markRead: (id) => request('/api/notifications/' + id + '/read', { method: 'POST' }),
  readAll: () => request('/api/notifications/read-all', { method: 'POST' }),
};

// ---------- Friends ----------
export const friendsApi = {
  list: () => request('/api/friends'),
  request: (to) => request('/api/friends/requests', { method: 'POST', body: JSON.stringify({ to }) }),
  accept: (id) => request('/api/friends/requests/' + id + '/accept', { method: 'POST' }),
  reject: (id) => request('/api/friends/requests/' + id + '/reject', { method: 'POST' }),
  removeRequest: (id) => request('/api/friends/requests/' + id, { method: 'DELETE' }),
  removeFriend: (email) => request('/api/friends/' + encodeURIComponent(email), { method: 'DELETE' }),
};

// ---------- Partners ----------
export const partnersApi = {
  list: () => request('/api/partners'),
};

// ---------- Chat ----------
export const chatApi = {
  conversations: () => request('/api/conversations'),
  create: (data) => request('/api/conversations', { method: 'POST', body: JSON.stringify(data) }),
  messages: (id) => request('/api/conversations/' + id + '/messages'),
  sendMessage: (id, data) => request('/api/conversations/' + id + '/messages', { method: 'POST', body: JSON.stringify(data) }),
  ai: (message) => request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
};

// ---------- Settings ----------
export const settingsApi = {
  get: () => request('/api/settings'),
  update: (data) => request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// ---------- Admin ----------
export const adminApi = {
  stats: () => request('/api/admin/stats'),
  users: (q) => request('/api/admin/users?q=' + encodeURIComponent(q || '')),
};

export { BASE };
