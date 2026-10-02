import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const PRESENT_COLOR  = '#10b981';
const ABSENT_COLOR   = '#e2e8f0';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-4 min-w-[160px]">
      <p className="text-xs font-black text-slate-700 mb-2 truncate max-w-[140px]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mt-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.fill }} />
            <span className="text-xs text-slate-500">{entry.name}</span>
          </div>
          <span className="text-sm font-black text-slate-800">{entry.value}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
          <span className="text-xs text-slate-400">Katılım</span>
          <span className="text-xs font-black text-emerald-600">
            {((payload[0].value / (payload[0].value + payload[1].value)) * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

function DeptChart({ data }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 pt-6 pb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-800">Departman Katılım Özeti</h3>
          </div>
          <p className="text-xs text-slate-400 font-medium">Gelen / Gelmeyen karşılaştırması</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-slate-500">Gelen</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" />
            <span className="text-slate-500">Gelmeyen</span>
          </div>
        </div>
      </div>

      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', radius: 6 }} />
            <Bar name="Gelen Personel" dataKey="gelen" fill={PRESENT_COLOR} radius={[5, 5, 0, 0]} maxBarSize={32}>
              {(data || []).map((_, i) => (
                <Cell key={i} fill={PRESENT_COLOR} />
              ))}
            </Bar>
            <Bar name="Gelmeyen / İzinli" dataKey="gelmeyen" fill={ABSENT_COLOR} radius={[5, 5, 0, 0]} maxBarSize={32}>
              {(data || []).map((_, i) => (
                <Cell key={i} fill={ABSENT_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DeptChart;
