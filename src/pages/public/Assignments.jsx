import { useState } from 'react'
import PublicShell from '../../components/PublicShell'
import pairings from '../../data/pairings.json'

const PRELIMS = [
  { key: 'r1', code: 'R1', label: 'Round 1' },
  { key: 'r2', code: 'R2', label: 'Round 2 — Side Swap' },
  { key: 'r3', code: 'R3', label: 'Round 3 — Randomized Sides' },
]

export default function AssignmentsPage() {
  const [tab, setTab] = useState('r1')
  const pairs = pairings[tab] || []
  const judges = pairings.judges || []

  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>Prelims</span>
            <span className="dot" />
            <span>R1 &middot; R2 &middot; R3</span>
            <span className="dot" />
            <span>90 debates</span>
          </div>
          <span className="kicker">Team Assignments</span>
          <h1>Ninety debates, no repeats.</h1>
          <div className="subtitle">
            Every scholar debates three times. Always cross-class. Never the same opponent twice.
          </div>
          <p className="lede">
            Judges are fixed to a room (J1&nbsp;&rarr;&nbsp;Room&nbsp;#1). Rooms reorder each round so
            each judge sees six unique speakers. Sides swap R1&nbsp;&rarr;&nbsp;R2. R3 is randomized.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="stat-row">
            <div className="stat"><div className="k">Speakers</div><div className="v">60</div></div>
            <div className="stat"><div className="k">Classes</div><div className="v">A&ndash;F</div></div>
            <div className="stat"><div className="k">Rooms</div><div className="v">30</div></div>
            <div className="stat"><div className="k">Judges</div><div className="v">30</div></div>
          </div>

          <div className="subtabs">
            {PRELIMS.map(p => (
              <button
                key={p.key}
                className={tab === p.key ? 'active' : ''}
                onClick={() => setTab(p.key)}
              >{p.code} &middot; {p.label.split('—').slice(-1)[0].trim()}</button>
            ))}
          </div>

          <div className="pair-grid">
            {pairs.map(([aff, opp], idx) => (
              <div className="pair" key={idx}>
                <div className="pair-head">
                  <span className="room">Room #{idx + 1}</span>
                  <span className="judge">{judges[idx]}</span>
                </div>
                <div className="pair-body">
                  <span className="aff">{aff}</span>
                  <span className="vs">vs</span>
                  <span className="opp">{opp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
