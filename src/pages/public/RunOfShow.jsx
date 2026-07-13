import PublicShell from '../../components/PublicShell'

const SLOTS = [
  ['10:30', '11:29', 'R1 — Prelim',                       '59 min', 'round'],
  ['11:29', '12:28', 'R2 — Prelim',                       '59 min', 'round'],
  ['12:28', '1:58',  'Lunch + Vision 2050 Wall',           '90 min', 'break'],
  ['1:58',  '2:57',  'R3 — Prelim',                        '59 min', 'round'],
  ['2:57',  '3:56',  'R4 — Semi',                          '59 min', 'showcase'],
  ['3:56',  '4:55',  'R5 — Final',                         '59 min', 'showcase'],
  ['4:55',  '5:55',  'Judges deliberate + awards + closing','60 min','ceremony'],
  ['5:55',  '7:00',  'Buffer / Personal Time',              '65 min', 'buffer'],
]

export default function RunOfShowPage() {
  return (
    <PublicShell>
      <section className="hero hero-center">
        <div className="hero-inner">
          <span className="kicker">Run of Show</span>
          <h1>18 July 2026 &middot; 10:30 &rarr; 7:00</h1>
          <div className="subtitle">5 rounds &middot; 60 speakers &middot; 30 judges &middot; one big finish</div>
          <p className="lede">
            Full-day timeline. Prelims (R1&ndash;R3) fill the morning through early afternoon,
            lunch doubles as the Vision 2050 Wall session, semi and final take the afternoon,
            awards close the day before dinner.
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
