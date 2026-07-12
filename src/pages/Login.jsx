import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signInWithGoogle } = useAuth()
  const [err, setErr] = useState(null)

  async function onClick() {
    try { await signInWithGoogle() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src="/assets/isomo.png" alt="Isomo" />
        <span className="pill-tag">House of Lords</span>
        <h1 style={{marginTop: 14}}>Sign in</h1>
        <p>Use your school Google account. Only whitelisted accounts can sign in.</p>

        <button className="btn-google" onClick={onClick}>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#fff" d="M5.84 14.12A6.98 6.98 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11.02 11.02 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"/>
            <path fill="#fff" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.47 14.97.5 12 .5 7.7.5 3.99 2.97 2.18 6.61l3.66 2.84C6.71 6.85 9.14 4.75 12 4.75z"/>
          </svg>
          Sign in with Google
        </button>

        {err && <div style={{color:'#e74c3c', marginTop: 14, fontSize: 13}}>{err}</div>}
        <div className="auth-footer">Not on the list? Ask an admin to add you.</div>
      </div>
    </div>
  )
}
