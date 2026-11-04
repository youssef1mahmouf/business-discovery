// frontend/src/utils/lucide.js
// Lucide icon helper. Imports from vendored ESM build.
// Provides consistent icon rendering with accessible labels.

import { createElement, icons } from '../../assets/vendor/lucide/lucide.mjs';

const DEFAULT_SIZE = 20;
const DEFAULT_STROKE = 2;

/**
 * Render a Lucide icon into a container element.
 * @param {string} name - Icon name (e.g. 'User', 'Mail', 'Settings')
 * @param {HTMLElement} container - Target container (cleared first)
 * @param {Object} opts - { size, stroke, color, title }
 */
export function renderIcon(name, container, opts = {}) {
  if (!container) return null;
  const Icon = icons[name];
  if (!Icon) {
    console.warn('Lucide icon not found:', name);
    return null;
  }
  container.innerHTML = '';
  const { size = DEFAULT_SIZE, stroke = DEFAULT_STROKE, color = 'currentColor', title } = opts;
  const el = createElement(Icon);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('stroke-width', String(stroke));
  el.setAttribute('stroke', color);
  el.setAttribute('fill', color === 'currentColor' ? 'none' : color);
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'inline-block';
  el.style.verticalAlign = 'middle';
  container.appendChild(el);
  if (title) {
    const t = document.createElement('span');
    t.className = 'sr-only';
    t.textContent = title;
    t.style.position = 'absolute';
    t.style.width = '1px';
    t.style.height = '1px';
    t.style.padding = '0';
    t.style.margin = '-1px';
    t.style.overflow = 'hidden';
    t.style.clip = 'rect(0,0,0,0)';
    t.style.border = '0';
    container.style.position = 'relative';
    container.appendChild(t);
  }
  return el;
}

/**
 * Create a standalone Lucide icon element (not appended).
 */
export function createIcon(name, opts = {}) {
  const Icon = icons[name];
  if (!Icon) {
    console.warn('Lucide icon not found:', name);
    return document.createElement('span');
  }
  const { size = DEFAULT_SIZE, stroke = DEFAULT_STROKE, color = 'currentColor' } = opts;
  const el = createElement(Icon);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('stroke-width', String(stroke));
  el.setAttribute('stroke', color);
  el.setAttribute('fill', color === 'currentColor' ? 'none' : color);
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'inline-block';
  el.style.verticalAlign = 'middle';
  return el;
}

/**
 * Commonly used icon map for UI (consistent naming).
 */
export const ICONS = {
  dashboard: 'Layout',
  projects: 'Folder',
  participants: 'Users',
  friends: 'User',
  partners: 'Handshake',
  tasks: 'CheckCircle',
  notifications: 'Bell',
  chat: 'MessageCircle',
  settings: 'Settings',
  admin: 'Shield',
  logout: 'LogOut',
  user: 'User',
  mail: 'Mail',
  lock: 'Lock',
  plus: 'Plus',
  edit: 'Edit',
  delete: 'Trash2',
  search: 'Search',
  chevronRight: 'ChevronRight',
  chevronLeft: 'ChevronLeft',
};
