import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { chartColors, useTheme } from '../../utils/theme';

const PRESENT_COLOR  = '#10b981';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-line rounded-2xl shadow-xl p-4 min-w-[160px]">
      <p className="text-xs font-black text-ink mb-2 truncate max-w-[140px]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mt-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.fill }} />
            <span className="text-xs text-muted">{entry.name}</span>
          </div>
          <span className="text-sm font-black text-ink">{entry.value}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-2 pt-2 border-t border-line flex justify-between items-center">
          <span className="text-xs text-muted">Katılım</span>
          <span className="text-xs font-black text-success">
            {((payload[0].value / (payload[0].value + payload[1].value)) * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

function DeptChart({ data }) {
  const colors = chartColors(useTheme().dark);
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
      <div className="px-6 pt-6 pb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center">
              <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
            <h2 className="text-base font-black text-ink">Departman Katılım Özeti</h2>
          </div>
          <p className="text-xs text-muted font-medium">Gelen / Gelmeyen karşılaştırması</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-muted">Gelen</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-surface-3 inline-block" />
            <span className="text-muted">Gelmeyen</span>
          </div>
        </div>
      </div>

      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: colors.tick, fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: colors.tick, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: colors.cursor, radius: 6 }} />
            <Bar name="Gelen Personel" dataKey="gelen" fill={PRESENT_COLOR} radius={[5, 5, 0, 0]} maxBarSize={32}>
              {(data || []).map((_, i) => (
                <Cell key={i} fill={PRESENT_COLOR} />
              ))}
            </Bar>
            <Bar name="Gelmeyen / İzinli" dataKey="gelmeyen" fill={colors.absent} radius={[5, 5, 0, 0]} maxBarSize={32}>
              {(data || []).map((_, i) => (
                <Cell key={i} fill={colors.absent} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DeptChart;
