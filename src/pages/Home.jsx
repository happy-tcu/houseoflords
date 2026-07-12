import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Home() {
  const { status, profile } = useAuth()

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src="/assets/isomo.png" alt="Isomo" />
        <span className="pill-tag">House of Lords</span>
        <h1 style={{marginTop: 14}}>Dissecting Vision 2050</h1>
        <p>Isomo Scholars' Debate &middot; 18 July 2026</p>

        {status === 'ready' && profile ? (
          <Link to="/me" className="btn-google" style={{textDecoration:'none'}}>
            Continue as {profile.code || profile.name || profile.email}
          </Link>
        ) : (
          <Link to="/login" className="btn-google" style={{textDecoration:'none'}}>
            Sign in
          </Link>
        )}

        <div className="auth-footer">Judges &middot; Scholars &middot; Admin</div>
      </div>
    </div>
  )
}
