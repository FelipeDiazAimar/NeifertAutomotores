import PublicNavbar from './PublicNavbar'
import Footer from './Footer'
import MobileSidebar from './MobileSidebar'
import AnimatedOutlet from './AnimatedOutlet'
import WhatsAppFab from '@/components/common/WhatsAppFab'
import AiSearchOverlay from '@/components/search/AiSearchOverlay'

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <AnimatedOutlet />
      </main>
      <Footer />
      <MobileSidebar />
      <WhatsAppFab />
      <AiSearchOverlay />
    </div>
  )
}
