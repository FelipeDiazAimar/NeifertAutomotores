import StoryHero from '@/components/home/StoryHero'
import ZigZagSection from '@/components/home/ZigZagSection'
import StoryCTA from '@/components/home/StoryCTA'
import MapSection from '@/components/home/MapSection'
import { useSiteStore } from '@/store/useSiteStore'

export default function HomePage() {
  const stories = useSiteStore((s) => s.stories)
  const ordered = [...stories].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <StoryHero />
      <ZigZagSection stories={ordered} />
      <StoryCTA />
      <MapSection />
    </div>
  )
}
