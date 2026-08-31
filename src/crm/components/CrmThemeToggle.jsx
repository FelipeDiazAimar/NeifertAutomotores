import { Moon, Sun } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { Button } from '@/components/ui/button'

export default function CrmThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const toggle = useUiStore((s) => s.toggleTheme)
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
    >
      {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  )
}
