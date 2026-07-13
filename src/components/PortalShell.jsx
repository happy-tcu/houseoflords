import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Announcements from './Announcements'

export default function PortalShell({ title, children }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="pub-shell">
      <header className="pub-nav">
        <div className="pub-nav-inner">
          <Link to="/" className="pub-brand">
            <img src="/assets/isomo.png" alt="Isomo" />
            <span className="pill-tag">House of Lords</span>
          </Link>
          <div className="pub-nav-right">
            <span className="portal-who">
              {profile?.code && <span className="code">{profile.code}</span>}
              <span className="name">{profile?.name || profile?.email}</span>
            </span>
            <button className="pub-signin-btn ghost" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="pub-main">
        <div className="container portal-container">
          <div className="portal-heading">
            <span className="portal-kicker">{profile?.role} portal</span>
            <h1>{title}</h1>
          </div>
          {children}
        </div>
      </main>
      <Announcements />
    </div>
  )
}
