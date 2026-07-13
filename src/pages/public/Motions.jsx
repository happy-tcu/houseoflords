import PublicShell from '../../components/PublicShell'
import { ROUNDS, TAG_COLORS } from '../../data/motions'

export default function MotionsPage() {
  return (
    <PublicShell>
      <section className="hero hero-center">
        <div className="hero-inner">
          <span className="kicker">House of Lords</span>
          <h1>Dissecting Vision 2050</h1>
          <div className="subtitle">IPDA-Style Debate Motions &middot; 5 Rounds &middot; 25 Motions</div>
          <p className="lede">
            Each round offers five motions &mdash; a mix of policy, value, and metaphor frames &mdash;
            so teams can pick the entry point that fits their voice. Motions center the question:
            <em> what can we do now, with what we have, to shape Rwanda&rsquo;s Vision 2050?</em>
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Rounds &amp; Motions</h2>
            <div className="chips">
              {Object.entries(TAG_COLORS).map(([k, c]) => (
                <span key={k} className="chip"><span className="dot" style={{background: c}} />{k}</span>
              ))}
            </div>
          </div>

          <div className="round-grid">
            {ROUNDS.map(r => (
              <article key={r.code} className="round-card">
                <div className="head">
                  <span className="badge">{r.code}</span>
                  <span className="title">{r.title}</span>
                </div>
                <ol>
                  {r.motions.map((m, i) => (
                    <li key={i} className="motion">
                      <span className="tag" style={{background: TAG_COLORS[m.kind]}}>{m.kind}</span>
                      <span className="text">{m.text}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
