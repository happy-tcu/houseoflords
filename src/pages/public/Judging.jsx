import PublicShell from '../../components/PublicShell'

const AXES = [
  { name: 'Argument',       note: 'Clarity of claim, logic, evidence.',                          pts: 5, num: '01', color: '#1dafec' },
  { name: 'Rebuttal & CX',  note: 'Direct engagement with opponent; quality of Q&A.',           pts: 5, num: '02', color: '#8cc63e' },
  { name: 'Delivery',       note: 'Pace, clarity, presence, use of time.',                       pts: 5, num: '03', color: '#efb34a' },
  { name: 'Persuasion',     note: 'Overall impact — would you vote for their side?',            pts: 5, num: '04', color: '#7c5cff' },
]

const SEGS = [
  ['Prep',           'Motion release + prep',       '30:00', 'prep'],
  ['Prop 1',         'Prop constructive',           '5:00',  'prop'],
  ['CX → Prop',      'Opp asks Prop',               '2:00',  'cx'],
  ['Opp 1',          'Opp opening',                 '6:00',  'opp'],
  ['CX → Opp',       'Prop asks Opp',               '2:00',  'cx'],
  ['Prop 2',         'Prop rebuttal',               '3:00',  'prop'],
  ['Opp 2',          'Opp closing',                 '5:00',  'opp'],
  ['Prop 3',         'Prop closing',                '3:00',  'prop'],
  ['Vote',           'Judge voting',                '3:00',  'vote'],
]

export default function JudgingPage() {
  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>4 axes</span>
            <span className="dot" />
            <span>/20 total</span>
            <span className="dot" />
            <span>binary winner</span>
          </div>
          <span className="kicker">Judging</span>
          <h1>Four axes. One winner.</h1>
          <div className="subtitle">
            Rubric, ballot, judge card. Everything a judge needs, in one console.
          </div>
          <p className="lede">
            Judges also keep time &mdash; one person per room, staying across all three prelim rounds.
            Score each speaker on 4 axes, tick a winner, submit the ballot before the next round is called.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Rubric</h2>
            <div className="hint">/20 per speaker</div>
          </div>
          <div className="jaxis-grid">
            {AXES.map(a => (
              <article key={a.num} className="jaxis" style={{'--accent': a.color}}>
                <div className="jaxis-top">
                  <span className="jaxis-num">{a.num}</span>
                  <span className="jaxis-pts">/ {a.pts}</span>
                </div>
                <div className="jaxis-name">{a.name}</div>
                <div className="jaxis-note">{a.note}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>Judge Card</h2>
            <div className="hint">Timekeeper sequence &middot; 59 min</div>
          </div>

          <div className="jcard">
            <div className="jcard-top">
              <div>
                <div className="jcard-kicker">Room #___ &middot; J___</div>
                <div className="jcard-title">Round Timing</div>
              </div>
              <div className="jcard-signals">
                <span className="signal warn">30s</span>
                <span className="signal warn">15s</span>
                <span className="signal stop">STOP</span>
              </div>
            </div>
            <div className="jcard-note">
              Lift signs silently. Cut the speaker the instant the clock hits <b>0:00</b> &mdash; no grace, no verbal warning.
            </div>

            <ol className="tl">
              {SEGS.map(([tag, name, t, kind]) => (
                <li key={tag} className={`tl-item tl-${kind}`}>
                  <span className="tl-dot" />
                  <div className="tl-body">
                    <div className="tl-top"><span className="tl-tag">{tag}</span><span className="tl-time">{t}</span></div>
                    <div className="tl-name">{name}</div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="jcard-foot">
              <span>Sequence total</span><b>59 min</b>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
