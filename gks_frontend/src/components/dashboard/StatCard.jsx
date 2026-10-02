const THEMES = {
  blue: {
    bg:       'bg-gradient-to-br from-blue-500 to-blue-600',
    iconBg:   'bg-white/20',
    text:     'text-white',
    sub:      'text-blue-100',
    badge:    'bg-white/20 text-white',
  },
  emerald: {
    bg:       'bg-gradient-to-br from-emerald-500 to-emerald-600',
    iconBg:   'bg-white/20',
    text:     'text-white',
    sub:      'text-emerald-100',
    badge:    'bg-white/20 text-white',
  },
  red: {
    bg:       'bg-gradient-to-br from-red-500 to-rose-600',
    iconBg:   'bg-white/20',
    text:     'text-white',
    sub:      'text-red-100',
    badge:    'bg-white/20 text-white',
  },
  amber: {
    bg:       'bg-gradient-to-br from-amber-400 to-orange-500',
    iconBg:   'bg-white/20',
    text:     'text-white',
    sub:      'text-amber-100',
    badge:    'bg-white/20 text-white',
  },
};

function StatCard({ label, value, subtext, color = 'blue', icon }) {
  const t = THEMES[color] ?? THEMES.blue;

  return (
    <div className={`${t.bg} rounded-2xl p-6 shadow-lg relative overflow-hidden`}>
      {/* Arka plan dekoratif daire */}
      <div className="absolute -right-4 -top-4 w-28 h-28 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-6 w-20 h-20 rounded-full bg-white/10" />

      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-wider ${t.sub}`}>{label}</p>
          <p className={`text-4xl font-black mt-1 ${t.text}`}>{value}</p>
          {subtext && (
            <p className={`text-xs font-medium mt-2 ${t.sub}`}>{subtext}</p>
          )}
        </div>
        {icon && (
          <div className={`${t.iconBg} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>
            <span className="text-white w-6 h-6">{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;
