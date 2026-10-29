import { demoSettings } from '../../utils/demo';
import { Link } from 'react-router-dom';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-700', 'bg-violet-700', 'bg-indigo-700',
  'bg-cyan-800', 'bg-teal-700',  'bg-sky-800',
];

function avatarColor(name) {
  if (!name) return 'bg-slate-600';
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
    <div className="xl:col-span-2 bg-surface rounded-2xl shadow-sm border border-line overflow-hidden flex flex-col">

      {/* Başlık */}
      <div className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-black text-ink">{demoSettings().demo ? 'Sentetik Geçiş Örnekleri' : 'Canlı Geçiş İzleme'}</h3>
            <p className="text-xs text-muted">{demoSettings().demo ? 'Sabit senaryo dönemindeki hareketler' : 'Son hareketler gerçek zamanlı'}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-success bg-success-soft px-3 py-1.5 rounded-full border border-success-line">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {demoSettings().demo ? 'Demo' : 'Canlı'}
        </span>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="px-6 py-3 text-xs font-bold text-muted uppercase tracking-wider">Saat</th>
              <th className="px-6 py-3 text-xs font-bold text-muted uppercase tracking-wider">Personel</th>
              <th className="px-6 py-3 text-xs font-bold text-muted uppercase tracking-wider">Kapı</th>
              <th className="px-6 py-3 text-xs font-bold text-muted uppercase tracking-wider text-center">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.length > 0 ? (
              logs.map((log, i) => (
                <tr key={i} className="hover:bg-surface-2 transition-colors group">
                  <td className="px-6 py-3.5">
                    <span className="text-xs font-mono font-bold text-muted bg-surface-3 px-2 py-1 rounded-md group-hover:bg-surface-3 transition-colors">
                      {formatTime(log.Zaman)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(log.Ad_Soyad)} flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
                        {getInitials(log.Ad_Soyad)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-ink leading-tight">{log.Ad_Soyad || 'Bilinmeyen Kart'}</p>
                        <p className="text-xs text-muted">{log.Sicil_No || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="text-sm font-semibold text-ink">{log.Kapi_Adi || '-'}</p>
                    <p className="text-xs text-muted">{log.Kapi_Turu || '-'}</p>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {log.Basarili_Mi ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-soft text-success border border-success-line">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Onaylandı
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger-soft text-danger border border-danger-line">
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
                    <div className="w-12 h-12 rounded-2xl bg-surface-3 flex items-center justify-center">
                      <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-muted">Henüz hareket bulunmuyor</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Altbilgi */}
      <div className="px-6 py-3 border-t border-line bg-surface-2">
        <Link
          to="/gecis-hareketleri"
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-info hover:text-info transition-colors"
        >
          Tüm Geçiş Hareketlerini Görüntüle
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

    </div>
  );
}

export default RecentLogsTable;
