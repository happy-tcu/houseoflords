import PublicShell from '../../components/PublicShell'

const ROUND_ROWS = [
  ['Motion release + prep',       '30:00', 'Hard cutoff. Motions revealed at start; no early access.'],
  ['Prop constructive',           '5:00',  'Speaker cut at 5:00 — no grace.'],
  ['Cross-ex — Opp asks Prop',    '2:00',  'Timekeeper stops at 2:00 exactly.'],
  ['Opp opening',                 '6:00',  'Speaker cut at 6:00 — no grace.'],
  ['Cross-ex — Prop asks Opp',    '2:00',  'Timekeeper stops at 2:00 exactly.'],
  ['Prop rebuttal',               '3:00',  'Speaker cut at 3:00 — no grace.'],
  ['Opp closing',                 '5:00',  'Speaker cut at 5:00 — no grace.'],
  ['Prop closing',                '3:00',  'Speaker cut at 3:00 — no grace.'],
  ['Judge voting',                '3:00',  'Ballot submitted before speakers leave the room.'],
]

const RULES = [
  ['01', <><b>Cut at the cap.</b> Timekeeper stops the speaker the instant the clock hits 0:00. Mid-word is fine.</>],
  ['02', <><b>No verbal warnings.</b> Timekeeper holds visual signs at <em>30s</em> and <em>15s</em> remaining. Silent.</>],
  ['03', <><b>No grace period.</b> Zero extra seconds. Content spoken after the cap is not scored by the judge.</>],
  ['04', <><b>CX is bidirectional.</b> 2 min per direction, hard cap on the questioner — over-time steals from your own remaining minutes.</>],
  ['05', <><b>Prep is prep.</b> 30 min from motion release. No notes exchanged with anyone outside your room after the timer starts.</>],
  ['06', <><b>Judge votes in 3 min.</b> Ballot signed and submitted before the next round is called. No revisions.</>],
]

export default function FormatPage() {
  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>IPDA Impromptu</span>
            <span className="dot" />
            <span>1 v 1</span>
            <span className="dot" />
            <span>59 min / round</span>
          </div>
          <span className="kicker">Format &amp; Timing</span>
          <h1>Every second is measured.</h1>
          <div className="subtitle">
            30 minutes of prep. Eight timed segments. Zero grace when the clock hits zero.
          </div>
          <p className="lede">
            When the clock hits the cap, the speaker is <strong>cut off mid-word</strong> — no grace,
            no verbal warning, no exceptions. Timekeepers hold up silent signs at 30&nbsp;seconds and 15&nbsp;seconds.
            An alarm sounds at zero.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Round Structure &mdash; 59 min per round</h2>
            <div className="hint">Enforced by timekeeper</div>
          </div>
          <div className="table-wrap">
            <table className="fmt-table round-fmt">
              <thead><tr><th>Segment</th><th>Duration</th><th>Hard-Time Rule</th></tr></thead>
              <tbody>
                {ROUND_ROWS.map(([seg, t, note]) => (
                  <tr key={seg}><td className="seg">{seg}</td><td className="dur">{t}</td><td className="note">{note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="side-totals">
            <div className="side aff-side">
              <div className="label">Prop total speaking</div>
              <div className="value">11:00</div>
              <div className="sub">5 const · 3 rebut · 3 close</div>
            </div>
            <div className="side opp-side">
              <div className="label">Opp total speaking</div>
              <div className="value">11:00</div>
              <div className="sub">6 open · 5 close</div>
            </div>
            <div className="side cx-side">
              <div className="label">Cross-examination</div>
              <div className="value">4:00</div>
              <div className="sub">2 each direction</div>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Hard Time Rule</h2>
            <div className="hint">Applies to every speaker, every round</div>
          </div>
          <div className="rules-grid">
            {RULES.map(([n, body]) => (
              <div className="rule-card" key={n}>
                <div className="rule-num">{n}</div>
                <div className="rule-body">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
