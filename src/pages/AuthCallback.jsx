import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function AuthCallback() {
  const { status } = useAuth()
  const nav = useNavigate()

  useEffect(() => {
    if (status === 'ready')        nav('/me', { replace: true })
    else if (status === 'unauthorized') nav('/unauthorized', { replace: true })
    else if (status === 'anonymous')    nav('/login', { replace: true })
  }, [status, nav])

  return <div className="loading">Signing you in…</div>
}
