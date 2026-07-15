import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'
import { loginWithCrmCredentials } from '@/services/crmAuth.service'
import { AuthContext } from './authContext'

const DEMO_KEY = 'nf-demo-session'

function readDemoSession() {
  const raw = localStorage.getItem(DEMO_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  // Estado inicial: en modo demo se resuelve de entrada desde localStorage,
  // así no hacemos setState sincrónico dentro del efecto.
  const demoInit = !isSupabaseConfigured ? readDemoSession() : null
  const [session, setSession] = useState(() =>
    demoInit ? { user: { email: demoInit.user } } : null
  )
  const [profile, setProfile] = useState(() =>
    demoInit ? { full_name: demoInit.nombre, role: demoInit.role } : null
  )
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

  // Carga del perfil (modo real) — tabla `perfiles` en español; se traduce al
  // shape en inglés que ya usa el resto de la app (full_name/role/avatar_url).
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return
    supabase
      .from('perfiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setProfile({
          full_name: data.nombre_completo,
          role: data.rol,
          avatar_url: data.foto_url,
        })
      })
  }, [session])

  // Login del panel: reutiliza el login real del CRM viejo (neifertcrm.com)
  // como fuente de verdad de usuario/contraseña, con o sin Supabase configurado.
  const signIn = useCallback(async (user, pass) => {
    const res = await loginWithCrmCredentials(user, pass)
    if (!res.ok) return { error: { message: res.error } }

    if (!isSupabaseConfigured) {
      // Sin Supabase: la sesión es local, pero con los datos reales del CRM.
      const demoSession = { user, nombre: res.nombre, role: res.role }
      localStorage.setItem(DEMO_KEY, JSON.stringify(demoSession))
      setSession({ user: { email: user } })
      setProfile({ full_name: res.nombre, role: res.role })
    }
    // Con Supabase configurado, verifyOtp (dentro de loginWithCrmCredentials)
    // ya disparó onAuthStateChange → session/profile se actualizan solos.
    return { error: null }
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
