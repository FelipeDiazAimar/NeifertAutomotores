import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'
import { MOCK_PROFILE } from '@/lib/mockData'
import { AuthContext } from './authContext'

const DEMO_KEY = 'nf-demo-session'

export function AuthProvider({ children }) {
  // Estado inicial: en modo demo se resuelve de entrada desde localStorage,
  // así no hacemos setState sincrónico dentro del efecto.
  const demoInit = !isSupabaseConfigured ? localStorage.getItem(DEMO_KEY) : null
  const [session, setSession] = useState(() =>
    demoInit ? { user: { email: demoInit } } : null
  )
  const [profile, setProfile] = useState(() => (demoInit ? MOCK_PROFILE : null))
  const [loading, setLoading] = useState(() => isSupabaseConfigured)

  // Inicialización (solo backend real)
  useEffect(() => {
    if (!isSupabaseConfigured) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Carga del perfil (modo real)
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  const signIn = useCallback(async (email, password) => {
    if (!isSupabaseConfigured) {
      const demoEmail = email || 'demo@neifert.com'
      localStorage.setItem(DEMO_KEY, demoEmail)
      setSession({ user: { email: demoEmail } })
      setProfile(MOCK_PROFILE)
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem(DEMO_KEY)
      setSession(null)
      setProfile(null)
      return
    }
    await supabase.auth.signOut()
  }, [])

  const value = {
    session,
    profile,
    loading,
    isAuthenticated: Boolean(session),
    isDemo: !isSupabaseConfigured,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
