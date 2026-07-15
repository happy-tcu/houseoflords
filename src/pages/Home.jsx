import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PublicShell from '../components/PublicShell'
import { useAuth } from '../lib/auth'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="18" height="18">
      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#fff" d="M5.84 14.12A6.98 6.98 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11.02 11.02 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"/>
      <path fill="#fff" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.47 14.97.5 12 .5 7.7.5 3.99 2.97 2.18 6.61l3.66 2.84C6.71 6.85 9.14 4.75 12 4.75z"/>
    </svg>
  )
}

export default function Home() {
  const { status, profile, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const signedIn = status === 'ready' && profile

  async function onSignIn() {
    setErr(null); setBusy(true)
    try { await signInWithGoogle() }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const portalHref = signedIn
    ? profile.role === 'admin'   ? '/admin'
    : profile.role === 'judge'   ? '/judge'
    : profile.role === 'scholar' ? '/debater'
    : '/unauthorized' : null

  return (
    <PublicShell>
      <section className="home-hero v2">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>

        <div className="home-hero-inner">
          <div className="home-copy">
            <span className="landing-kicker">House of Lords &middot; 2026</span>

            <div className="home-meta-bar">
              <span>Saturday</span>
              <span className="dot" />
              <span>18 July 2026</span>
              <span className="dot" />
              <span>Kigali</span>
            </div>

            <h1 className="editorial-title">Dissecting Vision&nbsp;2050.</h1>
            <p className="home-deck">
              Five rounds. Twenty-five motions. Sixty voices interrogating Rwanda&rsquo;s next twenty-five years.
            </p>

            <ul className="landing-features">
              <li><b>Judges</b> <span>Ballot, timer, submit &mdash; all in one console.</span></li>
              <li><b>Scholars</b> <span>Your room, your side, your motion, live.</span></li>
              <li><b>Admin</b> <span>Release rounds, watch standings unfold.</span></li>
            </ul>

            {signedIn && (
              <div className="landing-cta">
                <button className="btn-primary" onClick={() => nav(portalHref)}>
                  <GoogleIcon /> Open {profile.role} portal
                </button>
              </div>
            )}
            {err && <div className="landing-err">{err}</div>}
          </div>

          <aside className="programme-card brackets">
            <span className="br tl" /><span className="br tr" />
            <span className="br bl" /><span className="br br" />
            <div className="pc-head">
              <span className="pc-kicker">Programme No. 01 / 2026</span>
              <span className="pc-tag">18 JUL</span>
            </div>
            <div className="pc-grid">
              <div className="pc-cell"><div className="pc-v">5</div><div className="pc-k">Rounds</div></div>
              <div className="pc-cell"><div className="pc-v">25</div><div className="pc-k">Motions</div></div>
              <div className="pc-cell"><div className="pc-v">60</div><div className="pc-k">Speakers</div></div>
              <div className="pc-cell"><div className="pc-v">30</div><div className="pc-k">Judges</div></div>
            </div>
            <div className="pc-foot">
              <span>Format</span>
              <b>IPDA Impromptu &middot; 59 min / round</b>
            </div>
          </aside>
        </div>
      </section>
    </PublicShell>
  )
}
