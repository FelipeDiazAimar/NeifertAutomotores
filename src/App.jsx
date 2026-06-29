import { Suspense } from 'react'
import AppRouter from '@/routes/AppRouter'
import Spinner from '@/components/common/Spinner'

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center">
          <Spinner size={32} />
        </div>
      }
    >
      <AppRouter />
    </Suspense>
  )
}
