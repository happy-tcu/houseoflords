import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Info tabs (public — everyone sees these).
const INFO_TABS = [
  { to: '/',            label: 'Home' },
  { to: '/register',    label: 'Register',   primary: true },
  { to: '/motions',     label: 'Motions' },
  { to: '/assignments', label: 'Team Assignments' },
  { to: '/format',      label: 'Format' },
  { to: '/runofshow',   label: 'Run of Show' },
  { to: '/judging',     label: 'Judging' },
]

// Utility tabs (auth-gated per-role).
const CERT_ROLES = ['scholar', 'judge', 'admin']

export default function PublicShell({ children }) {
  const { status, profile, signInWithGoogle } = useAuth()
  const signedIn = status === 'ready' && profile

  const utilityTabs = []
  if (signedIn && CERT_ROLES.includes(profile.role)) {
    utilityTabs.push({ to: '/certificate', label: 'Certificate' })
  }
  const tabs = [...INFO_TABS, ...utilityTabs]

  const portalHref = signedIn
    ? profile.role === 'admin'   ? '/admin'
    : profile.role === 'judge'   ? '/judge'
    : profile.role === 'scholar' ? '/debater'
    : '/unauthorized' : null

  return (
    <div className="pub-shell">
      <header className="pub-nav">
        <div className="pub-nav-inner">
          <Link to="/" className="pub-brand">
            <img src="/assets/isomo.png" alt="Isomo" />
            <span className="pill-tag">House of Lords</span>
          </Link>

          <nav className="pub-tabs">
            {tabs.map(t => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  [isActive ? 'active' : '', t.primary ? 'primary' : ''].filter(Boolean).join(' ')
                }
              >{t.label}</NavLink>
            ))}
          </nav>

          <div className="pub-nav-right">
            {signedIn ? (
              <Link to={portalHref} className="pub-portal-btn">
                <span className="code">{profile.code || (profile.role || '').toUpperCase()}</span>
                Portal
              </Link>
            ) : (
              <button className="pub-signin-btn" onClick={signInWithGoogle}>Sign in</button>
            )}
          </div>
        </div>
      </header>

      <main className="pub-main">{children}</main>

      <footer className="pub-foot">
        <div className="pub-foot-inner">
          <span>Isomo &middot; Scholars&rsquo; Debate</span>
          <span className="tag-line">What can we do now, with what we have?</span>
        </div>
      </footer>
    </div>
  )
}
