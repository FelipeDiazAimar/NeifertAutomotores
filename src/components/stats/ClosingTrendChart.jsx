import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { useChartColors } from '@/hooks/useChartColors'
import { formatDelta } from '@/lib/formatters'

export default function ClosingTrendChart({ data, rate }) {
  const c = useChartColors()
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-4xl font-extrabold text-neifert">{rate.value}%</p>
        {rate.delta != null && (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <TrendingUp size={13} />
            {formatDelta(rate.delta)}
          </span>
        )}
      </div>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-close" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.red} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={c.red}
              strokeWidth={2.5}
              fill="url(#grad-close)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
