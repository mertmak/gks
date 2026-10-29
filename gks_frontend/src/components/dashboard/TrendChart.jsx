import { demoSettings } from '../../utils/demo';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors, useTheme } from '../../utils/theme';

const FILTER_LABELS = {
  gunluk:   'Referans Gün · Saatlik',
  haftalik: 'Son 7 Gün',
  aylik:    'Son 28 Gün',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-line rounded-2xl shadow-xl p-4 min-w-[160px]">
      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 mt-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted">{entry.name}</span>
          </div>
          <span className="text-sm font-black" style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ data, timeFilter }) {
  const colors = chartColors(useTheme().dark);
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
      <div className="px-6 pt-6 pb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center">
              <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <h3 className="text-base font-black text-ink">Geçiş Trendi</h3>
          </div>
          <p className="text-xs text-muted font-medium">{timeFilter === 'gunluk' && !demoSettings().demo ? 'Bugün · Saatlik' : FILTER_LABELS[timeFilter] ?? ''}</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded bg-sky-500 inline-block" />
            <span className="text-muted">Başarılı</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded bg-rose-500 inline-block" />
            <span className="text-muted">İzinsiz</span>
          </div>
        </div>
      </div>

      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradBasarili" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#0ea5e9" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradYetkisiz" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f43f5e" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: colors.tick, fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: colors.tick, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              name="Başarılı Geçiş"
              dataKey="basarili"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              fill="url(#gradBasarili)"
            />
            <Area
              type="monotone"
              name="İzinsiz Deneme"
              dataKey="yetkisiz"
              stroke="#f43f5e"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              fill="url(#gradYetkisiz)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default TrendChart;
