import { demoSettings } from '../utils/demo';
import { useState, useEffect } from 'react';
import api from '../api/axios';
import { socket } from '../api/socket';

import StatCard        from '../components/dashboard/StatCard';
import TrendChart      from '../components/dashboard/TrendChart';
import DeptChart       from '../components/dashboard/DeptChart';
import RecentLogsTable from '../components/dashboard/RecentLogsTable';
import QuickLinks      from '../components/dashboard/QuickLinks';

const TIME_FILTERS = [
  { key: 'gunluk',   label: 'Günlük' },
  { key: 'haftalik', label: 'Haftalık' },
  { key: 'aylik',    label: 'Aylık' },
];

function Dashboard() {
  const [loading, setLoading]         = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [timeFilter, setTimeFilter]   = useState('gunluk');
  const [currentTime, setCurrentTime] = useState(() => demoSettings().demo ? new Date(demoSettings().referenceDate + 'T12:00:00Z') : new Date());

  const [stats, setStats]           = useState({ AktifPersonel: 0, BugunGecis: 0, YetkisizGiris: 0, AktifKapi: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [trendData, setTrendData]   = useState([]);
  const [deptData, setDeptData]     = useState([]);

  useEffect(() => {
    if (demoSettings().demo) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let pending;
    const fetchData = async () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const res = await api.get('/dashboard/summary', { params: { filter: timeFilter }, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.data.success) {
          setError('');
          setStats(res.data.stats);
          setRecentLogs(res.data.recentLogs);
          setTrendData(res.data.trendData);
          setDeptData(res.data.deptData);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.response?.data?.message || 'Kontrol paneli yüklenemedi.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchData();
    socket.on('new_rfid_log',   fetchData);
    socket.on('system_updated', fetchData);
    socket.on('connect', fetchData);
    return () => {
      socket.off('new_rfid_log',   fetchData);
      pending?.abort();
      socket.off('system_updated', fetchData);
      socket.off('connect', fetchData);
    };
  }, [timeFilter, revision]);

  if (error) return <div role="alert" className="p-8 text-red-700">{error} <button type="button" className="underline" onClick={() => { setError(''); setLoading(true); setRevision(value => value + 1); }}>Tekrar dene</button></div>;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <span className="w-14 h-14 border-[3px] border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="font-bold text-slate-400 tracking-wide animate-pulse text-sm">Sistem Verileri Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-12 mt-6">

      {/* HERO BAŞLIK */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl px-8 py-7">
        {/* Dekoratif arka plan */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-blue-500/5 border border-blue-400/10" />
        <div className="absolute right-20 bottom-0 w-32 h-32 rounded-full bg-indigo-500/5" />

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">Geçiş Kontrol Sistemi</p>
            <h1 className="text-3xl font-black text-white tracking-tight">Kontrol Paneli</h1>
            <p className="text-slate-400 text-sm mt-1">{demoSettings().demo ? 'Sentetik senaryo döneminin özetini ve geçiş trendlerini inceleyin.' : 'Anlık sistem durumunu ve geçiş trendlerini buradan takip edin.'}</p>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="text-right hidden md:block">
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider">
                {currentTime.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-3xl font-black text-white leading-none mt-1 tabular-nums">
                {demoSettings().demo ? 'Demo referans günü' : currentTime.toLocaleTimeString('tr-TR')}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-1 rounded-xl border border-white/10 inline-flex">
              {TIME_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { if (key !== timeFilter) { setLoading(true); setTimeFilter(key); } }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    timeFilter === key
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Aktif Personel"
          value={stats.AktifPersonel}
          subtext="Sistemde kayıtlı çalışanlar"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          }
        />
        <StatCard
          label="Geçişler"
          value={stats.BugunGecis}
          subtext="Başarılı okutulan kartlar"
          color="emerald"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          }
        />
        <StatCard
          label="İzinsiz Hareket"
          value={stats.YetkisizGiris}
          subtext="Yetkisiz erişim denemesi"
          color="red"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          }
        />
        <StatCard
          label="Aktif Kapı"
          value={stats.AktifKapi}
          subtext="Tanımlı geçiş noktaları"
          color="amber"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          }
        />
      </div>

      {/* GRAFİKLER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrendChart data={trendData} timeFilter={timeFilter} />
        <DeptChart  data={deptData} />
      </div>

      {/* SON HAREKETLER + HIZLI ERİŞİM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <RecentLogsTable logs={recentLogs} />
        <QuickLinks />
      </div>

    </div>
  );
}

export default Dashboard;
