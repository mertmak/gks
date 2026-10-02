import { demoSettings } from './demo';
export function readSession() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), c => c.charCodeAt(0))));
    return payload.exp * 1000 > Date.now() ? (demoSettings().demo ? {...payload, role: 'user', demo: true} : payload) : null;
  } catch { return null; }
}
