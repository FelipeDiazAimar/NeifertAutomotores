import { supabase, isSupabaseConfigured } from './supabaseClient'
import { MOCK_STORIES } from '@/lib/mockData'

export async function fetchStories() {
  if (!isSupabaseConfigured) {
    return [...MOCK_STORIES].sort((a, b) => a.order_index - b.order_index)
  }
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('published', true)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data
}
