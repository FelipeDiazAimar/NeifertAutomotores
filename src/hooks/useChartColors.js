import { useUiStore } from '@/store/useUiStore'

/** Colores para Recharts que se adaptan al tema activo. */
export function useChartColors() {
  const theme = useUiStore((s) => s.theme)
  const dark = theme === 'dark'
  return {
    red: '#BE1E2D',
    ink: dark ? '#F5F6F8' : '#0B0B0F',
    inkSoft: dark ? '#9AA0A8' : '#5F5E5A',
    muted: dark ? '#6B7280' : '#9AA0A8',
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(11,11,15,0.08)',
    surface: dark ? '#141418' : '#ffffff',
    border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(11,11,15,0.1)',
  }
}
