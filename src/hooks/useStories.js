import { useQuery } from '@tanstack/react-query'
import { fetchStories } from '@/services/stories.service'

export function useStories() {
  return useQuery({ queryKey: ['stories'], queryFn: fetchStories })
}
