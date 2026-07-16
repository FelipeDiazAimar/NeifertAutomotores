import { useState } from 'react'
import { useLenis } from 'lenis/react'

// Al menos 8% del alto de pantalla, para que el thumb nunca sea un punto
// invisible en páginas muy largas.
const MIN_THUMB_RATIO = 0.08

// Reemplaza la scrollbar nativa (oculta en index.css): una barra roja
// delgada que flota sobre el contenido, sin franja de color sólido propia.
export default function ScrollProgressBar() {
  const [progress, setProgress] = useState(0)
  const [thumbRatio, setThumbRatio] = useState(0.15)

  useLenis((lenis) => {
    setProgress(lenis.progress)
    const viewport = window.innerHeight
    const total = viewport + lenis.limit
    setThumbRatio(total > 0 ? Math.max(MIN_THUMB_RATIO, viewport / total) : 0.15)
  })

  if (progress >= 1 && thumbRatio >= 1) return null

  const thumbHeightPct = thumbRatio * 100
  const topPct = progress * (100 - thumbHeightPct)

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 hidden w-2 md:block">
      <div
        className="absolute right-1 w-1.5 rounded-full bg-neifert/85 shadow-[0_0_8px_rgba(190,30,45,0.5)] transition-opacity"
        style={{ height: `${thumbHeightPct}%`, top: `${topPct}%` }}
      />
    </div>
  )
}
