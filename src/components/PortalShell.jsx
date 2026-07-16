import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Announcements from './Announcements'
import FAQCard from './FAQCard'

const ROLE_TITLES = {
  admin:   'Admin Console.',
  judge:   'Judge Console.',
  scholar: 'Debater Console.',
}
const ROLE_META = {
  admin:   ['Isomo', 'Tournament Control', 'Admin'],
  judge:   ['Isomo', 'Judge', 'One room · three rounds'],
  scholar: ['Isomo', 'Scholar', 'Your day, live'],
}

export default function PortalShell({ title, subtitle, children }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const heading = title || ROLE_TITLES[role] || 'Portal.'
  const meta = ROLE_META[role] || ['Isomo', 'House of Lords', role || '']

  return (
    <div className="pub-shell portal-shell">
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

      <section className="portal-hero">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="portal-hero-inner">
          <div className="meta-bar">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="dot" />}
                <span>{m}</span>
              </span>
            ))}
          </div>
          <span className="portal-kicker">{(role || 'Portal').toString().toUpperCase()} PORTAL</span>
          <h1 className="portal-h1">{heading}</h1>
          {subtitle && <div className="portal-subtitle">{subtitle}</div>}
        </div>
      </section>

      <main className="pub-main">
        <div className="container portal-container">
          {children}
        </div>
      </main>
      <Announcements />
      <FAQCard />
    </div>
  )
}
