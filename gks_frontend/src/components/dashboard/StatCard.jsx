const TONES = {
  blue: { bar: 'bg-info', icon: 'bg-info-soft text-info' },
  emerald: { bar: 'bg-success', icon: 'bg-success-soft text-success' },
  red: { bar: 'bg-danger', icon: 'bg-danger-soft text-danger' },
  amber: { bar: 'bg-warning', icon: 'bg-warning-soft text-warning' },
};

function StatCard({ label, value, subtext, color = 'blue', icon }) {
  const t = TONES[color] ?? TONES.blue;

  return (
    <div className="relative bg-surface border border-line rounded-xl p-5 pl-6 overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="text-4xl font-bold text-ink mt-1 tabular-nums">{value}</p>
          {subtext && <p className="text-xs text-muted mt-2">{subtext}</p>}
        </div>
        {icon && <div className={`${t.icon} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>{icon}</div>}
      </div>
    </div>
  );
}

export default StatCard;
