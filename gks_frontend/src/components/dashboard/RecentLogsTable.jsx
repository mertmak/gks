import { demoSettings } from '../../utils/demo';
import { Link } from 'react-router-dom';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-indigo-500',
  'bg-cyan-500', 'bg-teal-500',  'bg-sky-500',
];

function avatarColor(name) {
  if (!name) return 'bg-slate-400';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleTimeString('tr-TR', { timeZone: 'UTC',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function RecentLogsTable({ logs }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">

      {/* Başlık */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">{demoSettings().demo ? 'Sentetik Geçiş Örnekleri' : 'Canlı Geçiş İzleme'}</h3>
            <p className="text-xs text-slate-400">{demoSettings().demo ? 'Sabit senaryo dönemindeki hareketler' : 'Son hareketler gerçek zamanlı'}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {demoSettings().demo ? 'Demo' : 'Canlı'}
        </span>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Saat</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Personel</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Kapı</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length > 0 ? (
              logs.map((log, i) => (
                <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-3.5">
                    <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md group-hover:bg-slate-200 transition-colors">
                      {formatTime(log.Zaman)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(log.Ad_Soyad)} flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
                        {getInitials(log.Ad_Soyad)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 leading-tight">{log.Ad_Soyad || 'Bilinmeyen Kart'}</p>
                        <p className="text-xs text-slate-400">{log.Sicil_No || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="text-sm font-semibold text-slate-700">{log.Kapi_Adi || '-'}</p>
                    <p className="text-xs text-slate-400">{log.Kapi_Turu || '-'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {log.Basarili_Mi ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Onaylandı
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Yetkisiz
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-400">Henüz hareket bulunmuyor</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Altbilgi */}
      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
        <Link
          to="/loglar/gecis"
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
        >
          Tüm Geçiş Loglarını Görüntüle
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

    </div>
  );
}

export default RecentLogsTable;
