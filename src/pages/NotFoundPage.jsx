import { Link } from 'react-router-dom'
import Button from '@/components/common/Button'
import Logo from '@/components/common/Logo'

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <Logo className="mx-auto h-10" />
        <p className="mt-8 font-display text-7xl font-extrabold text-neifert">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Página no encontrada</h1>
        <p className="mt-2 text-ink-2">La ruta que buscás no existe o fue movida.</p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Volver al inicio</Button>
        </Link>
      </div>
    </div>
  )
}
