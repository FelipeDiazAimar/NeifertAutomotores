import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import AppRouter from '@/routes/AppRouter'
import Spinner from '@/components/common/Spinner'
import ScrollProgressBar from '@/components/common/ScrollProgressBar'

export default function App() {
  return (
    <>
      <ScrollProgressBar />
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center">
            <Spinner size={32} />
          </div>
        }
      >
        <AppRouter />
      </Suspense>
      <Analytics />
    </>
  )
}
