import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, Copy, FileImage, FileText } from 'lucide-react'
import Button from '@/components/common/Button'

const OPCIONES_EXPORT = [
  { value: 'imagen', label: 'Imagen PNG', Icon: FileImage, testid: 'presupuesto-opcion-imagen' },
  { value: 'pdf', label: 'PDF', Icon: FileText, testid: 'presupuesto-opcion-pdf' },
  { value: 'copiar', label: 'Copiar imagen', Icon: Copy, testid: 'presupuesto-opcion-copiar' },
]

/** Botón Exportar con menú desplegable (PNG / PDF / copiar imagen). */
export default function ExportarMenu({ exportando = false, onElegir, deshabilitado = false }) {
  const [abierto, setAbierto] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const alClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setAbierto(false)
    }
    const alEscape = (e) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alClick)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClick)
      document.removeEventListener('keydown', alEscape)
    }
  }, [abierto])

  function elegir(formato) {
    setAbierto(false)
    onElegir?.(formato)
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        data-testid="presupuesto-exportar"
        onClick={() => setAbierto((v) => !v)}
        disabled={exportando || deshabilitado}
        icon={Download}
        iconRight={ChevronDown}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        {exportando ? 'Generando…' : 'Exportar'}
      </Button>
      {abierto && !exportando && (
        <div
          data-testid="presupuesto-menu"
          role="menu"
          className="glass glass-popover absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl p-1.5 shadow-glass"
        >
          {OPCIONES_EXPORT.map(({ value, label, Icon, testid }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              data-testid={testid}
              onClick={() => elegir(value)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              <Icon size={16} className="shrink-0 text-ink-3" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
