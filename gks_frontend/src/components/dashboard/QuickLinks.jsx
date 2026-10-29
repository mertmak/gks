import { readSession } from '../../utils/session';
import { Link } from 'react-router-dom';

const LINKS = [
  {
    to: '/personel/duzenleme',
    adminOnly: true,
    label: 'Yeni Personel Ekle',
    desc: 'Sisteme kayıt oluştur',
    iconBg: 'bg-info-soft',
    iconText: 'text-info',
    hoverBorder: 'hover:border-info-line',
    hoverBg: 'hover:bg-info-soft',
    arrowHover: 'group-hover:text-info',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    to: '/izinler',
    label: 'İzin / Rapor Kayıtları',
    desc: 'İzin kayıtlarını incele',
    iconBg: 'bg-danger-soft',
    iconText: 'text-danger',
    hoverBorder: 'hover:border-danger-line',
    hoverBg: 'hover:bg-danger-soft',
    arrowHover: 'group-hover:text-danger',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/puantaj',
    label: 'Puantaj Raporları',
    desc: 'Günlük takip ve analiz',
    iconBg: 'bg-success-soft',
    iconText: 'text-success',
    hoverBorder: 'hover:border-success-line',
    hoverBg: 'hover:bg-success-soft',
    arrowHover: 'group-hover:text-success',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

function QuickLinks() {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden h-fit">
      <div className="px-6 py-4 border-b border-line flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-black text-ink">Hızlı Kısayollar</h2>
          <p className="text-xs text-muted">Sık kullanılan işlemler</p>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {LINKS.filter(link => !link.adminOnly || readSession()?.role === 'admin').map(({ to, label, desc, iconBg, iconText, hoverBorder, hoverBg, arrowHover, icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex items-center justify-between p-4 rounded-xl border border-line ${hoverBorder} ${hoverBg} transition-all duration-200 group`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconText} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 duration-200`}>
                {icon}
              </div>
              <div>
                <p className="text-sm font-bold text-ink">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
            </div>
            <svg className={`w-4 h-4 text-muted ${arrowHover} transition-all duration-200 group-hover:translate-x-0.5`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default QuickLinks;
