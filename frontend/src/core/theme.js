// frontend/src/core/theme.js
// Light / dark theme system. Persists choice in localStorage.
// Requires CSS variables for both themes in main.css.

const THEME_KEY = 'bd_theme';
const DARK_VARIABLES = {
  '--bg': '#080B18',
  '--bg-secondary': '#0D1224',
  '--surface': '#141B31',
  '--surface-hover': '#1E263F',
  '--text': '#FFFFFF',
  '--text-muted': '#9FB0C9',
  '--text-dim': '#6B7A9B',
  '--accent-blue': '#397BFF',
  '--accent-purple': '#8B5CF6',
  '--accent-cyan': '#35D5F2',
  '--danger': '#EF4444',
  '--success': '#10B981',
  '--warning': '#F59E0B',
};

const LIGHT_VARIABLES = {
  '--bg': '#F8FAFC',
  '--bg-secondary': '#F1F5F9',
  '--surface': '#FFFFFF',
  '--surface-hover': '#E2E8F0',
  '--text': '#0F172A',
  '--text-muted': '#64748B',
  '--text-dim': '#94A3B8',
  '--accent-blue': '#2563EB',
  '--accent-purple': '#7C3AED',
  '--accent-cyan': '#0891B2',
  '--danger': '#DC2626',
  '--success': '#059669',
  '--warning': '#D97706',
};

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function setTheme(theme) {
  const root = document.documentElement;
  const vars = theme === 'light' ? LIGHT_VARIABLES : DARK_VARIABLES;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  localStorage.setItem(THEME_KEY, theme);
  root.dataset.theme = theme;
  if (document.body) document.body.dataset.theme = theme;
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function initTheme() {
  setTheme(getTheme());
}
