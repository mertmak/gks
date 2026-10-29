import { useSyncExternalStore } from 'react';

const KEY = 'gks-theme';
export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABELS = { system: 'Sistem', light: 'Açık', dark: 'Koyu' };
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

export function readTheme() {
  try { const value = localStorage.getItem(KEY); return THEMES.includes(value) ? value : 'system'; }
  catch { return 'system'; }
}

function apply() {
  const choice = readTheme();
  const dark = choice === 'dark' || (choice === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
  listeners.forEach(listener => listener());
}

export function setTheme(choice) {
  try { localStorage.setItem(KEY, choice); } catch { /* Choice lasts for this page only. */ }
  apply();
}

if (typeof window !== 'undefined') {
  media().addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === KEY) apply(); });
}

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => `${readTheme()}:${document.documentElement.classList.contains('dark')}`;

// Returns { choice, dark } and re-renders when either changes.
export function useTheme() {
  const [choice, dark] = useSyncExternalStore(subscribe, snapshot).split(':');
  return { choice, dark: dark === 'true' };
}

// SVG chart attributes cannot read the CSS tokens reliably, so charts take these.
export const chartColors = dark => dark
  ? { grid: '#2b3946', tick: '#a1aebb', absent: '#3a4a59', cursor: '#1b2631' }
  : { grid: '#e6ebef', tick: '#56626e', absent: '#d5dbe0', cursor: '#f5f7f8' };
