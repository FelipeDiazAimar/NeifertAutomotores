import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import { useChartColors } from '@/hooks/useChartColors'

export default function LeadsByChannelBar({ data }) {
  const c = useChartColors()
  const palette = [c.red, c.ink, c.inkSoft, c.muted]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="channel"
          stroke={c.muted}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: c.grid }}
          contentStyle={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            fontSize: 12,
            color: c.ink,
          }}
        />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
