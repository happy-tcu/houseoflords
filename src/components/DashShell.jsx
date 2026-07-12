import { useAuth } from '../lib/auth'

export default function DashShell({ children }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <div className="dash-topbar-inner">
          <div className="brand-left">
            <img className="logo" src="/assets/isomo.png" alt="Isomo" />
            <span className="pill-tag">House of Lords</span>
          </div>
          <div className="who">
            {profile?.code && <span className="code">{profile.code}</span>}
            <span>{profile?.name || profile?.email}</span>
            <button className="signout" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="dash-main">{children}</main>
    </div>
  )
}
