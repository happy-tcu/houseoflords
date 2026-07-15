import PublicShell from '../../components/PublicShell'
import { ROUNDS, TAG_COLORS } from '../../data/motions'

export default function MotionsPage() {
  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>House of Lords</span>
            <span className="dot" />
            <span>Motions</span>
            <span className="dot" />
            <span>5 rounds &middot; 25</span>
          </div>
          <span className="kicker">Dissecting Vision 2050</span>
          <h1>Twenty-five ways to interrogate 2050.</h1>
          <div className="subtitle">
            Policy, value, and metaphor motions. One per debate. Struck down to one.
          </div>
          <p className="lede">
            Each round hands your room five motions. Opp cancels first, you alternate,
            the last one standing becomes the debate motion. Every motion centers the same question:
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
