import { demoSettings } from './demo';
export function readSession() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), c => c.charCodeAt(0))));
    if (payload.exp * 1000 <= Date.now()) return null;
    // On the demo only a personal simulation copy grants write access.
    if (!demoSettings().demo) return payload;
    return payload.sandbox ? {...payload, role: 'admin', demo: true} : {...payload, role: 'user', demo: true};
  } catch { return null; }
}
