import PublicShell from '../../components/PublicShell'

const SLOTS = [
  ['10:30', '11:29', 'R1 — Prelim',                       '59 min', 'round'],
  ['11:29', '12:28', 'R2 — Prelim',                       '59 min', 'round'],
  ['12:28', '1:58',  'Lunch + Vision 2050 Wall',           '90 min', 'break'],
  ['1:58',  '2:57',  'R3 — Prelim',                        '59 min', 'round'],
  ['2:57',  '3:56',  'R4 — Quarters',                      '59 min', 'showcase'],
  ['3:56',  '4:55',  'R5 — Final',                         '59 min', 'showcase'],
  ['4:55',  '5:55',  'Judges deliberate + awards + closing','60 min','ceremony'],
  ['5:55',  '7:00',  'Buffer / Personal Time',              '65 min', 'buffer'],
]

export default function RunOfShowPage() {
  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>Saturday</span>
            <span className="dot" />
            <span>18 July 2026</span>
            <span className="dot" />
            <span>Kigali</span>
          </div>
          <span className="kicker">Run of Show</span>
          <h1>Ten thirty to seven.</h1>
          <div className="subtitle">
            Five rounds. Sixty speakers. Thirty judges. One long day. One big finish.
          </div>
          <p className="lede">
            Prelims (R1&ndash;R3) fill the morning through early afternoon; lunch doubles as the
            Vision&nbsp;2050 Wall session; quarters and final take the afternoon; awards close the day
            before dinner. Winners advance to the final by wins + speaker points.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Day Schedule</h2>
            <div className="hint">All times enforced &mdash; move on the minute</div>
          </div>

          <div className="ros-list">
            {SLOTS.map(([start, end, label, dur, kind]) => (
              <div key={start} className={`ros-slot ros-${kind}`}>
                <div className="ros-time">
                  <span className="ros-start">{start}</span>
                  <span className="ros-arrow">&rarr;</span>
                  <span className="ros-end">{end}</span>
                </div>
                <div className="ros-body">
                  <div className="ros-label">{label}</div>
                  <div className="ros-dur">{dur}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ros-legend">
            <span className="ros-chip round">Debate round</span>
            <span className="ros-chip showcase">Showcase (whole room watches)</span>
            <span className="ros-chip break">Lunch / Wall</span>
            <span className="ros-chip ceremony">Awards</span>
            <span className="ros-chip buffer">Buffer</span>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
