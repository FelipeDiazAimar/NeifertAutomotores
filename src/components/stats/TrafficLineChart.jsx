import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useChartColors } from '@/hooks/useChartColors'

export default function TrafficLineChart({ data }) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-web" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.red} stopOpacity={0.28} />
            <stop offset="100%" stopColor={c.red} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="day" stroke={c.muted} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={c.muted} fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            fontSize: 12,
            color: c.ink,
          }}
          labelStyle={{ color: c.inkSoft }}
        />
        <Area
          type="monotone"
          dataKey="showroom"
          name="Salón"
          stroke={c.ink}
          strokeWidth={2.5}
          fill="transparent"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="web"
          name="Web"
          stroke={c.red}
          strokeWidth={2.5}
          fill="url(#grad-web)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
