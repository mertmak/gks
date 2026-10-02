import api from './api/axios';
import { configureDemo } from './utils/demo';
import { useState, useEffect, useId, useRef, lazy, Suspense } from 'react';
import { readSession } from './utils/session';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
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
const Shifts = lazy(() => import('./pages/Shifts'));
const Leaves = lazy(() => import('./pages/Leaves'));
const Reports = lazy(() => import('./pages/Reports'));
const Simulation = lazy(() => import('./pages/Simulation'));
const Settings = lazy(() => import('./pages/Settings'));
const HesapEkle = lazy(() => import('./pages/HesapEkle'));
const Login = lazy(() => import('./pages/Login'));
const Overtimes = lazy(() => import('./pages/Overtimes'));

// Fixed texts only; logout events never carry server-provided content.
const LOGOUT_NOTICES = {
  'password-changed': { text: 'Şifreniz değiştirildi. Yeni şifrenizle yeniden giriş yapın.', tone: 'success' },
  'session-expired': { text: 'Oturumunuzun süresi doldu. Devam etmek için yeniden giriş yapın.', tone: 'warning' },
};

  // Açılır Menü (Dropdown) Kapsayıcı Bileşeni
  const DropdownMenu = ({ title, children, activePaths = [], align = 'left' }) => {
    const location = useLocation();
    const isMenuActive = activePaths.some(p => location.pathname.startsWith(p));
    const [open, setOpen] = useState(false);
    const button = useRef(null);
    const id = useId();
    
    return (
      <div className="relative" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }} onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
      }}>
        <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className={`flex items-center gap-1 px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${
          isMenuActive 
            ? 'bg-slate-800 text-cyan-400 shadow-inner' 
            : 'text-slate-300 hover:text-cyan-400 hover:bg-slate-800'
        }`}>
          {title}
          <svg className={`w-4 h-4 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        {open && <div id={id} className={`fixed left-4 right-4 lg:absolute lg:w-56 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden ${align === 'right' ? 'lg:left-auto lg:right-0' : 'lg:left-0 lg:right-auto'}`} onClick={event => { if (event.target.closest('a')) setOpen(false); }}>
          <div className="py-2 flex flex-col">
            {children}
          </div>
        </div>}
      </div>
    );
  };

  // Dropdown İçi Link Bileşeni
  const DropdownItem = ({ to, label }) => {
    const location = useLocation();
    return (
    <Link 
      to={to} 
      className={`px-4 py-3 text-sm font-bold transition-colors ${
        location.pathname === to ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50 hover:text-blue-500'
      }`}
    >
      {label}
    </Link>
  );
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
  const location = useLocation();
  const session = readSession();
  const userRole = session?.role;
  const username = session?.kullanici_adi || 'Kullanıcı';
  const isActive = path => location.pathname === path;
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
  if (!config) return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <section className="max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">GKS</h1>
      <p role={configError ? 'alert' : 'status'}>{configError || 'Uygulama hazırlanıyor…'}</p>
      {configError && <button type="button" className="rounded-lg bg-slate-900 text-white px-4 py-2" onClick={() => {
        setConfigError(''); setConfigAttempt(value => value + 1);
      }}>Tekrar dene</button>}
    </section>
  </main>;
  if (!isAuthenticated) return <Suspense fallback={<p className="p-8">Yükleniyor…</p>}><Login setAuth={setIsAuthenticated} demo={config.demo} notice={loginNotice} /></Suspense>;
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {config.demo && <p className="bg-amber-100 text-amber-950 px-6 py-3 text-sm">Salt okunur demo · Verilerin tamamı sentetiktir · Referans gün: {config.referenceDate}. Değişiklikler local kurulumda kullanılabilir.</p>}
      
      {/* ÜST MENÜ (NAVBAR) */}
      <nav className="bg-slate-900 px-6 py-4 shadow-lg flex flex-col lg:flex-row justify-between items-center gap-4 z-50 relative">
        <div className="flex items-center">
          <Link to ="/" className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tighter">
            GKS PANEL
          </Link>
        </div>
        
        {/* MERKEZİ MENÜ (Sayfa Düzeni) */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          
          <Link to="/" className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${isActive('/') ? 'bg-slate-800 text-cyan-400' : 'text-slate-300 hover:text-cyan-400 hover:bg-slate-800'}`}>Ana Sayfa</Link>

          {/* PERSONEL İŞLEMLERİ */}
          <DropdownMenu title="Personel" activePaths={['/personel']}>
            <DropdownItem to="/personel/liste" label="Personel Listesi" />
            {userRole === 'admin' && <DropdownItem to="/personel/bireysel" label="Bireysel İşlem Merkezi" />}
            {userRole === 'admin' && <DropdownItem to="/personel/toplu" label="Toplu İşlem Merkezi" />}
          </DropdownMenu>

          {/* KAPI İŞLEMLERİ */}
          <DropdownMenu title="Kapılar" activePaths={['/kapilar']}>
            <DropdownItem to="/kapilar/yonetim" label="Kapı Tanımlama ve Yönetim" />
            {/* İleride kapılarla ilgili yeni sayfalar eklersen buraya ekleyebilirsin */}
          </DropdownMenu>

          {/* VARDİYA & İZİN İŞLEMLERİ */}
          <DropdownMenu title="Vardiya & İzin" activePaths={['/vardiya', '/izinler', '/mesailer']}>
            <DropdownItem to="/vardiya" label="Vardiya Yönetimi" />
            <DropdownItem to="/izinler" label="İzin ve Rapor Girişi" />
            <DropdownItem to="/mesailer" label="Mesai Onay İşlemleri" /> {/* YENİ EKLENDİ */}
          </DropdownMenu>

          {/* PUANTAJ (Tek Sayfa) */}
          <Link to="/puantaj" className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${isActive('/puantaj') ? 'bg-slate-800 text-cyan-400' : 'text-slate-300 hover:text-cyan-400 hover:bg-slate-800'}`}>Puantaj</Link>

          {/* LOGLAR */}
          <DropdownMenu title="Loglar" activePaths={['/loglar']}>
            <DropdownItem to="/loglar/gecis" label={config.demo ? 'Sentetik Geçiş Logları' : 'Geçiş Logları (Canlı)'} />
            <DropdownItem to="/loglar/kapi" label="Kapı İşlem Logları" />
            <DropdownItem to="/loglar/ik" label="Sistem & İK Logları" />
          </DropdownMenu>

          {/* SİMÜLASYON (Admin) */}
          {userRole === 'admin' && import.meta.env.VITE_ENABLE_SIMULATION === 'true' && (
            <Link to="/simulasyon" className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${isActive('/simulasyon') ? 'bg-slate-800 text-amber-500' : 'text-amber-500/70 hover:text-amber-400 hover:bg-slate-800'}`}>Simülasyon</Link>
          )}

        </div>

        <DropdownMenu title={username + ' · ' + (userRole === 'admin' ? 'Yönetici' : 'Kullanıcı')} activePaths={['/settings', '/hesap-ekle']} align="right">
          {userRole === 'admin' && <DropdownItem to="/hesap-ekle" label="Yönetici Hesapları" />}
          {!config.demo && <DropdownItem to="/settings" label="Hesap Ayarları" />}
          <button type="button" onClick={handleLogout} className="px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 text-left">Güvenli Çıkış</button>
        </DropdownMenu>
      </nav>

      {/* SAYFALARIN GÖSTERİLECEĞİ ALAN */}
      <div className="px-6 pb-10">
        <Suspense fallback={<p role="status" className="p-8">Sayfa yükleniyor…</p>}><Routes>
          <Route path="/" element={<Dashboard />} />
          
          {/* Personel Rotası */}
          <Route path="/personel/liste" element={<Users />} />
          <Route path="/personel/bireysel" element={adminOnly(<PersonnelOperations />)} />
          <Route path="/personel/toplu" element={adminOnly(<BulkOperations />)} />

          {/* Kapı Rotası */}
          <Route path="/kapilar/yonetim" element={<Doors />} />

          {/* Vardiya ve İzin Rotaları */}
          <Route path="/vardiya" element={<Shifts />} />
          <Route path="/izinler" element={<Leaves />} />
          <Route path="/mesailer" element={<Overtimes />} />

          {/* Puantaj Rotası */}
          <Route path="/puantaj" element={<Reports />} />

          {/* Log Rotaları */}
          <Route path="/loglar/gecis" element={<Logs />} />
          <Route path="/loglar/kapi" element={<DoorLogs />} />
          <Route path="/loglar/ik" element={<SystemLogs />} />

          {/* Admin Rotaları */}
          <Route path="/simulasyon" element={adminOnly(<Simulation />)} />
          <Route path="/hesap-ekle" element={adminOnly(<HesapEkle />)} />
          
          {/* Ortak Rotalar */}
          <Route path="/settings" element={config.demo ? <Navigate to="/" replace /> : <Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes></Suspense>
      </div>

    </div>
  );
}

export default App;
