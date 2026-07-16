import { useState } from 'react'
import StatsDateFilter from '@/components/stats/StatsDateFilter'
import VehicleAnalytics from '@/components/stats/VehicleAnalytics'
import ShareLinksCard from '@/components/stats/ShareLinksCard'

export default function StatsPage() {
  const [range, setRange] = useState({ from: null, to: null, label: 'Todo el período' })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="rounded-full bg-neifert px-4 py-1.5 text-sm font-semibold text-white shadow-glow-red">
            Dashboard de Analítica
          </span>
          <p className="mt-2 text-sm text-ink-3">
            Vistas, consultas y conversión por vehículo y procedencia.
          </p>
        </div>
        <StatsDateFilter value={range} onChange={setRange} />
      </header>

      <VehicleAnalytics range={range} />
      <ShareLinksCard />
    </div>
  )
}
