import api from './api/axios';
import { configureDemo } from './utils/demo';
import { useState, useEffect, lazy, Suspense } from 'react';
import { readSession } from './utils/session';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { connectSocket, disconnectSocket } from './api/socket';

// Sayfa Bileşenleri İçe Aktarımı
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Logs = lazy(() => import('./pages/Logs'));
const DoorLogs = lazy(() => import('./pages/DoorLogs'));
const SystemLogs = lazy(() => import('./pages/SystemLogs'));
const Users = lazy(() => import('./pages/Users'));
const PersonnelOperations = lazy(() => import('./pages/PersonnelOperations'));
const BulkOperations = lazy(() => import('./pages/BulkOperations'));
const Doors = lazy(() => import('./pages/Doors'));
const Facility = lazy(() => import('./pages/Facility'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Leaves = lazy(() => import('./pages/Leaves'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const HesapEkle = lazy(() => import('./pages/HesapEkle'));
const Login = lazy(() => import('./pages/Login'));
const Overtimes = lazy(() => import('./pages/Overtimes'));
import SandboxBanner from './components/SandboxBanner';
import AppShell from './components/layout/AppShell';
import { buildNav } from './utils/nav';

// Fixed texts only; logout events never carry server-provided content.
const OLD_PATHS = {
  '/personel/bireysel': '/personel/duzenleme',
  '/kapilar/yonetim': '/gecis-noktalari',
  '/kapilar/kat-plani': '/tesis-tasarimi',
  '/loglar/gecis': '/gecis-hareketleri',
  '/loglar/kapi': '/denetim/kapi',
  '/loglar/ik': '/denetim/sistem',
};

const LOGOUT_NOTICES = {
  'password-changed': { text: 'Şifreniz değiştirildi. Yeni şifrenizle yeniden giriş yapın.', tone: 'success' },
  'session-expired': { text: 'Oturumunuzun süresi doldu. Devam etmek için yeniden giriş yapın.', tone: 'warning' },
  'sandbox-expired': { text: 'Simülasyon alanınızın süresi doldu ve kopya silindi. Yeni bir alan başlatabilirsiniz.', tone: 'warning' },
};

function App() {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/public-config', {signal: controller.signal}).then(({data}) => {
      configureDemo(data);setConfig(data);
    }).catch(() => {if (!controller.signal.aborted) setConfigError('Sunucuya erişilemiyor. Bağlantınızı kontrol edip yeniden deneyin.');});
    return () => controller.abort();
  }, [configAttempt]);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!readSession());
  const [loginNotice, setLoginNotice] = useState(null);
  const session = readSession();
  const userRole = session?.role;
  const username = session?.kullanici_adi || 'Kullanıcı';
  const sandbox = !!session?.sandbox;
  const closeSandbox = async () => {
    try { await api.delete('/sandbox'); } catch { /* The copy also expires on its own. */ }
    handleLogout();
  };
  const handleLogout = () => {
    setLoginNotice(null);
    disconnectSocket();
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };
  const expiresAt = session?.exp;
  useEffect(() => {
    const logout = event => {
      setLoginNotice(LOGOUT_NOTICES[event?.detail?.reason] || null);
      disconnectSocket(); setIsAuthenticated(false);
    };
    window.addEventListener('gks:logout', logout);
    const onStorage = e => { if (e.key === 'token') window.location.reload(); };
    window.addEventListener('storage', onStorage);
    let timer;
    if (isAuthenticated && expiresAt) {
      connectSocket();
      timer = setTimeout(() => { localStorage.removeItem('token'); logout({ detail: { reason: 'session-expired' } }); }, Math.max(0, expiresAt * 1000 - Date.now()));
    }
    return () => { clearTimeout(timer); disconnectSocket(); window.removeEventListener('gks:logout', logout); window.removeEventListener('storage', onStorage); };
  }, [isAuthenticated, expiresAt]);
  const adminOnly = element => userRole === 'admin' ? element : <Navigate to="/" replace />;
  const simulationEnabled = userRole === 'admin' && (sandbox || import.meta.env.VITE_ENABLE_SIMULATION === 'true');
  if (!config) return <main className="min-h-screen bg-page flex items-center justify-center p-6">
    <section className="max-w-md bg-surface rounded-xl border border-line p-6 space-y-4">
      <h1 className="text-xl font-bold text-ink">GKS</h1>
      <p role={configError ? 'alert' : 'status'}>{configError || 'Uygulama hazırlanıyor…'}</p>
      {configError && <button type="button" className="rounded-lg bg-primary hover:bg-primary-hover text-white px-4 py-2" onClick={() => {
        setConfigError(''); setConfigAttempt(value => value + 1);
      }}>Tekrar dene</button>}
    </section>
  </main>;
  if (!isAuthenticated) return <Suspense fallback={<p className="p-8">Yükleniyor…</p>}><Login setAuth={setIsAuthenticated} demo={config.demo} sandbox={config.sandbox ? config.sandboxMinutes : null} notice={loginNotice} /></Suspense>;
  const menuItem = 'px-4 py-2.5 text-sm text-left text-ink hover:bg-surface-2';
  const account = {
    label: username + ' · ' + (userRole === 'admin' ? 'Yönetici' : 'Kullanıcı'),
    items: <>
      {userRole === 'admin' && !sandbox && <Link className={menuItem} to="/hesap-ekle">Yönetici Hesapları</Link>}
      {!config.demo && <Link className={menuItem} to="/settings">Hesap Ayarları</Link>}
      <button type="button" onClick={sandbox ? closeSandbox : handleLogout} className={menuItem + ' font-semibold text-danger'}>{sandbox ? 'Alanı Kapat ve Çık' : 'Güvenli Çıkış'}</button>
    </>,
  };
  const banner = sandbox
    ? <SandboxBanner expiresAt={expiresAt} referenceDate={config.referenceDate} onClose={closeSandbox} />
    : config.demo && <p className="bg-warning-soft text-ink px-4 lg:px-8 py-2 text-sm">Salt okunur demo · Verilerin tamamı sentetiktir · Referans gün: {config.referenceDate}. Değişiklikler local kurulumda kullanılabilir.</p>;
  return (
    <AppShell nav={buildNav({ admin: userRole === 'admin' })} banner={banner} account={account}>
        <Suspense fallback={<p role="status" className="p-8">Sayfa yükleniyor…</p>}><Routes>
          <Route path="/" element={<Dashboard />} />
          
          {/* Personel Rotası */}
          <Route path="/personel/liste" element={<Users />} />
          <Route path="/personel/duzenleme" element={adminOnly(<PersonnelOperations />)} />
          <Route path="/personel/toplu" element={adminOnly(<BulkOperations />)} />

          {/* Kapı Rotası */}
          <Route path="/gecis-noktalari" element={<Doors />} />
          <Route path="/tesis-tasarimi" element={<Facility />} />

          {/* Vardiya ve İzin Rotaları */}
          <Route path="/vardiya" element={<Shifts />} />
          <Route path="/izinler" element={<Leaves />} />
          <Route path="/mesailer" element={<Overtimes />} />

          {/* Puantaj Rotası */}
          <Route path="/puantaj" element={<Reports />} />

          {/* Geçiş ve Denetim Rotaları */}
          <Route path="/gecis-hareketleri" element={<Logs />} />
          <Route path="/denetim/kapi" element={<DoorLogs />} />
          <Route path="/denetim/sistem" element={<SystemLogs />} />

          {/* Admin Rotaları */}
          <Route path="/simulasyon" element={<Navigate to={simulationEnabled ? '/tesis-tasarimi?sekme=uretici' : '/'} replace />} />
          <Route path="/hesap-ekle" element={sandbox ? <Navigate to="/" replace /> : adminOnly(<HesapEkle />)} />
          
          {/* Ortak Rotalar */}
          <Route path="/settings" element={config.demo ? <Navigate to="/" replace /> : <Settings />} />
          {/* Eski adresler (yer imleri bozulmasın) */}
          {Object.entries(OLD_PATHS).map(([from, to]) => <Route key={from} path={from} element={<Navigate to={to} replace />} />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Suspense>
    </AppShell>
  );
}

export default App;
