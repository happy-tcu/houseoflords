import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)   // { email, role, code, name } from allowed_users
  const [status, setStatus] = useState('loading') // 'loading' | 'anonymous' | 'unauthorized' | 'ready'

  useEffect(() => {
    let cancelled = false

    async function bootstrap(session) {
      if (!session?.user?.email) {
        if (!cancelled) { setProfile(null); setStatus('anonymous') }
        return
      }
      const { data, error } = await supabase
        .from('allowed_users')
        .select('email, role, code, name')
        .eq('email', session.user.email.toLowerCase())
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        setProfile(null)
        setStatus('unauthorized')
      } else {
        setProfile(data)
        setStatus('ready')
        // Fire-and-forget: record first_signed_in_at + last_seen_at
        supabase.rpc('touch_self').catch(() => {})
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      bootstrap(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess)
      bootstrap(sess)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setStatus('anonymous')
  }

  return (
    <AuthCtx.Provider value={{ session, profile, status, signInWithGoogle, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
