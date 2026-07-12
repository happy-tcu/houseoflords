import { useAuth } from '../lib/auth'

export default function Unauthorized() {
  const { session, signOut } = useAuth()

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <header className="landing-nav">
        <div className="landing-brand">
          <img src="/assets/isomo.png" alt="Isomo" />
        </div>
        <div className="landing-nav-right">
          <span className="pill-live"><span className="dot" style={{background:'#e74c3c', boxShadow:'0 0 0 4px rgba(231,76,60,0.25)'}} /> Not Authorized</span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-copy">
          <span className="landing-kicker" style={{background:'rgba(231,76,60,0.12)', color:'#c0392b'}}>Access Denied</span>
          <h1>You&rsquo;re not on the list.</h1>
          <p className="landing-lede">
            {session?.user?.email && (<><b style={{color:'var(--brand-dark)'}}>{session.user.email}</b> isn&rsquo;t in the House of Lords whitelist. </>)}
            If this looks wrong, ping an admin to add your account and try again.
          </p>

          <div className="landing-cta">
            <button className="btn-primary" onClick={signOut}>Sign out</button>
            <span className="landing-cta-note">Try a different account</span>
          </div>
        </section>

        <aside className="landing-card">
          <div className="lc-head">
            <span className="lc-kicker">Who can sign in?</span>
          </div>
          <div className="unauth-list">
            <div><b>Judges</b><span>Pre-registered J-code accounts.</span></div>
            <div><b>Scholars</b><span>Isomo school Google accounts (Y1 & Y2).</span></div>
            <div><b>Admin</b><span>Tournament organizers only.</span></div>
          </div>
          <div className="lc-foot">
            <span>Need access?</span>
            <b>DM an organizer</b>
          </div>
        </aside>
      </main>

      <footer className="landing-foot">
        <span>Isomo &middot; Scholars&rsquo; Debate</span>
        <span>What can we do now, with what we have?</span>
      </footer>
    </div>
  )
}
