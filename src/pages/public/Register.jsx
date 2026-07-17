import { useEffect, useMemo, useState } from 'react'
import PublicShell from '../../components/PublicShell'
import { supabase } from '../../lib/supabase'

const DEADLINE = new Date('2026-07-17T16:00:00+02:00') // Rwanda time (CAT)

const EMPTY_SPEAKER = () => ({ code: '', name: '', email: '', phone: '', year: '' })
const CLASS_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const SLOTS = Array.from({ length: 10 }, (_, i) => i + 1)

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000 * 30)
    return () => clearInterval(t)
  }, [])
  const diff = target.getTime() - now
  const closed = diff <= 0
  const abs = Math.max(0, diff)
  const d = Math.floor(abs / 86400000)
  const h = Math.floor((abs % 86400000) / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  return { closed, d, h, m }
}

export default function RegisterPage() {
  const { closed, d, h, m } = useCountdown(DEADLINE)
  const [mode, setMode] = useState('team')   // 'team' | 'judge'

  const [step, setStep] = useState('form')   // 'form' | 'saving' | 'done' | 'error'
  const [error, setError] = useState(null)
  const [regId, setRegId] = useState(null)

  const [classLetter, setClassLetter] = useState('')
  const [teamName, setTeamName]       = useState('')
  const [schoolName, setSchoolName]   = useState('')
  const [captainName, setCaptainName] = useState('')
  const [captainEmail, setCaptainEmail] = useState('')
  const [captainPhone, setCaptainPhone] = useState('')
  const [cohort, setCohort] = useState('')
  const [notes, setNotes] = useState('')
  // Exactly 10 speakers per class — codes auto-assigned by row index.
  const [speakers, setSpeakers] = useState(
    () => Array.from({ length: 10 }, () => EMPTY_SPEAKER())
  )

  // When class letter is picked (or changes), auto-assign codes {letter}1..{letter}10 by row.
  useEffect(() => {
    setSpeakers(prev => prev.map((s, i) => ({
      ...s,
      code: classLetter ? `${classLetter}${i + 1}` : '',
    })))
  }, [classLetter])

  const filledSpeakers = useMemo(
    () => speakers.filter(s => s.name.trim().length > 0),
    [speakers]
  )

  const canSubmit = classLetter && teamName.trim() && captainName.trim()
    && /\S+@\S+\.\S+/.test(captainEmail)
    && filledSpeakers.length === 10
    && !closed

  function updateSpeaker(i, field, val) {
    setSpeakers(s => s.map((x, ix) => ix === i ? { ...x, [field]: val } : x))
  }
  async function submit(e) {
    e?.preventDefault?.()
    if (!canSubmit || step === 'saving') return
    setStep('saving'); setError(null)
    const payload = {
      p_class_letter:  classLetter,
      p_team_name:     teamName.trim(),
      p_school_name:   schoolName.trim() || null,
      p_captain_name:  captainName.trim(),
      p_captain_email: captainEmail.trim().toLowerCase(),
      p_captain_phone: captainPhone.trim() || null,
      p_cohort:        cohort || null,
      p_notes:         notes.trim() || null,
      p_speakers:      filledSpeakers.map(s => ({
        code:  s.code,
        name:  s.name.trim(),
        email: s.email.trim().toLowerCase() || null,
        phone: s.phone.trim() || null,
        year:  s.year || null,
      })),
    }
    const { data, error } = await supabase.rpc('submit_registration', payload)
    if (error) {
      setStep('error')
      setError(error.message || 'Something went wrong. Try again in a moment.')
      return
    }
    setRegId(data)
    setStep('done')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Fire confirmation to captain (best-effort — don't block success on it).
    supabase.functions.invoke('send-invite', {
      body: {
        kind: 'confirm-team',
        email: captainEmail.trim().toLowerCase(),
        name: captainName.trim(),
        context: `${teamName.trim()} · Class ${classLetter}`,
      }
    }).catch(() => {})
  }

  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>{mode === 'team' ? 'Captains' : 'Judges'}</span>
            <span className="dot" />
            <span>{mode === 'team' ? 'One form per class' : 'One form per judge'}</span>
            <span className="dot" />
            <span>Deadline: Fri 17 Jul · 4pm CAT</span>
          </div>
          <span className="kicker">{mode === 'team' ? 'Team Registration' : 'Judge Registration'}</span>
          <h1>{mode === 'team' ? 'Send us your speakers.' : 'Judge the day.'}</h1>
          <div className="subtitle">
            {mode === 'team' ? 'Class captains — this is the door in.' : 'Volunteer to judge — you\'ll get a room and three rounds.'}
          </div>
          <p className="lede">
            {mode === 'team'
              ? 'One captain per class fills the form below with their squad. Exactly ten speakers per class. Once the deadline hits, pairings lock and the bracket is drawn from what we have.'
              : 'Judges keep time, score speakers, and submit ballots. Sign up individually — you\'ll be approved and assigned a room code after review.'}
          </p>
        </div>
      </section>

      <div className="reg-mode-switch">
        <div className="container">
          <div className="reg-mode-tabs">
            <button
              className={`reg-mode-tab ${mode === 'team' ? 'active' : ''}`}
              onClick={() => { setMode('team'); setStep('form'); setError(null) }}
              type="button">
              <span className="reg-mode-kicker">01</span>
              <span className="reg-mode-name">Register a class</span>
              <span className="reg-mode-sub">Captain submits their squad of ten</span>
            </button>
            <button
              className={`reg-mode-tab ${mode === 'judge' ? 'active' : ''}`}
              onClick={() => { setMode('judge'); setStep('form'); setError(null) }}
              type="button">
              <span className="reg-mode-kicker">02</span>
              <span className="reg-mode-name">Register as a judge</span>
              <span className="reg-mode-sub">Individual signup · admin approves</span>
            </button>
          </div>
        </div>
      </div>

      {step === 'done' && mode === 'team' ? (
        <SuccessCard regId={regId} classLetter={classLetter} teamName={teamName} count={filledSpeakers.length} />
      ) : mode === 'judge' ? (
        <JudgeForm closed={closed} d={d} h={h} m={m} />
      ) : (
        <>
          <DeadlineBanner closed={closed} d={d} h={h} m={m} />
          <form className="reg-form" onSubmit={submit}>
            <div className="container">
              <fieldset className="reg-sec">
                <legend>
                  <span className="reg-sec-num">01</span>
                  <span className="reg-sec-title">The class</span>
                </legend>
                <div className="reg-grid four">
                  <label className="reg-field small">
                    <span className="reg-label">Class *</span>
                    <select required value={classLetter} onChange={e => setClassLetter(e.target.value)}>
                      <option value="">— Pick —</option>
                      {CLASS_LETTERS.map(l => <option key={l} value={l}>Class {l}</option>)}
                    </select>
                  </label>
                  <label className="reg-field span-2">
                    <span className="reg-label">Team name *</span>
                    <input type="text" required value={teamName} onChange={e => setTeamName(e.target.value)}
                      placeholder="e.g. The Vision Cabinet" />
                  </label>
                  <label className="reg-field">
                    <span className="reg-label">Cohort</span>
                    <select value={cohort} onChange={e => setCohort(e.target.value)}>
                      <option value="">— Select —</option>
                      <option value="y1">Year Ones (Y1)</option>
                      <option value="y2">Year Twos (Y2)</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset className="reg-sec">
                <legend>
                  <span className="reg-sec-num">02</span>
                  <span className="reg-sec-title">The captain</span>
                </legend>
                <div className="reg-grid three">
                  <label className="reg-field">
                    <span className="reg-label">Your name *</span>
                    <input type="text" required value={captainName} onChange={e => setCaptainName(e.target.value)}
                      placeholder="Captain full name" />
                  </label>
                  <label className="reg-field">
                    <span className="reg-label">Email *</span>
                    <input type="email" required value={captainEmail} onChange={e => setCaptainEmail(e.target.value)}
                      placeholder="you@example.com" />
                  </label>
                  <label className="reg-field">
                    <span className="reg-label">Phone (WhatsApp)</span>
                    <input type="tel" value={captainPhone} onChange={e => setCaptainPhone(e.target.value)}
                      placeholder="+250 …" />
                  </label>
                </div>
              </fieldset>

              <fieldset className="reg-sec">
                <legend>
                  <span className="reg-sec-num">03</span>
                  <span className="reg-sec-title">The speakers</span>
                  <span className="reg-sec-hint">
                    {classLetter ? `${classLetter}1 → ${classLetter}10 · all 10 required` : 'Pick a class first'}
                  </span>
                </legend>
                <div className="reg-speakers">
                  {speakers.map((s, i) => (
                    <div key={i} className="reg-speaker locked">
                      <div className="reg-speaker-code">
                        <span className="reg-label">Code</span>
                        <div className="reg-code-badge">
                          {classLetter ? `${classLetter}${i + 1}` : '—'}
                        </div>
                      </div>
                      <div className="reg-speaker-fields">
                        <label className="reg-field">
                          <span className="reg-label">Full name *</span>
                          <input type="text" required value={s.name}
                            onChange={e => updateSpeaker(i, 'name', e.target.value)}
                            placeholder="Speaker full name" />
                        </label>
                        <label className="reg-field">
                          <span className="reg-label">Email</span>
                          <input type="email" value={s.email}
                            onChange={e => updateSpeaker(i, 'email', e.target.value)}
                            placeholder="speaker@example.com" />
                        </label>
                        <label className="reg-field">
                          <span className="reg-label">Phone</span>
                          <input type="tel" value={s.phone}
                            onChange={e => updateSpeaker(i, 'phone', e.target.value)}
                            placeholder="+250 …" />
                        </label>
                        <label className="reg-field small">
                          <span className="reg-label">Year</span>
                          <select value={s.year} onChange={e => updateSpeaker(i, 'year', e.target.value)}>
                            <option value="">—</option>
                            <option value="Y1">Y1</option>
                            <option value="Y2">Y2</option>
                            <option value="S5">S5</option>
                            <option value="S6">S6</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <fieldset className="reg-sec">
                <legend>
                  <span className="reg-sec-num">04</span>
                  <span className="reg-sec-title">Anything else?</span>
                  <span className="reg-sec-hint">Optional</span>
                </legend>
                <label className="reg-field">
                  <span className="reg-label">Notes for the organizers</span>
                  <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Accessibility needs, conflicts, absences, etc." />
                </label>
              </fieldset>

              {error && <div className="reg-error">{error}</div>}

              <div className="reg-submit-bar">
                <div className="reg-count">
                  <b>{filledSpeakers.length}</b> / 10 speakers · captain: <b>{captainName || '—'}</b>
                </div>
                <button type="submit" className="reg-submit"
                  disabled={!canSubmit || step === 'saving'}>
                  {step === 'saving' ? 'Submitting…' : closed ? 'Registration closed' : 'Submit registration'}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </PublicShell>
  )
}

function DeadlineBanner({ closed, d, h, m }) {
  return (
    <div className={`reg-banner ${closed ? 'closed' : ''}`}>
      <div className="container reg-banner-inner">
        <span className="reg-banner-kicker">Deadline</span>
        <div className="reg-banner-body">
          <b>Fri 17 Jul · 4:00 pm (CAT)</b>
          {closed
            ? <span>Registration is now closed.</span>
            : <span>{d}d {h}h {m}m to submit your class.</span>}
        </div>
      </div>
    </div>
  )
}

function SuccessCard({ regId, classLetter, teamName, count }) {
  return (
    <section className="block">
      <div className="container">
        <div className="reg-success">
          <div className="reg-success-tick" aria-hidden>✓</div>
          <span className="kicker">Registered</span>
          <h2>Class received.</h2>
          <div className="reg-success-body">
            <div className="reg-success-row"><span className="k">Class</span><b>Class {classLetter}</b></div>
            <div className="reg-success-row"><span className="k">Team</span><b>{teamName}</b></div>
            <div className="reg-success-row"><span className="k">Speakers</span><b>10 ({classLetter}1–{classLetter}10)</b></div>
            <div className="reg-success-row"><span className="k">Reference</span><code>{regId?.slice(0, 8)}</code></div>
          </div>
          <p className="reg-success-note">
            You’ll get an email confirmation shortly. Watch your inbox for Judges’ Training Session 1
            (Fri 17 Jul, 8:00 p.m. via Zoom) and Session 2 (Sat 18 Jul, 9:30 a.m. in person).
          </p>
          <a className="reg-success-cta" href="/runofshow">See the run of show →</a>
        </div>
      </div>
    </section>
  )
}

function JudgeForm({ closed, d, h, m }) {
  const [step, setStep] = useState('form')
  const [error, setError] = useState(null)
  const [regId, setRegId] = useState(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [org, setOrg] = useState('')
  const [exp, setExp] = useState('')
  const [canAttend, setCanAttend] = useState(false)
  const [notes, setNotes] = useState('')

  const canSubmit = fullName.trim() && /\S+@\S+\.\S+/.test(email) && canAttend && !closed

  async function submit(e) {
    e?.preventDefault?.()
    if (!canSubmit || step === 'saving') return
    setStep('saving'); setError(null)
    const { data, error } = await supabase.rpc('submit_judge_registration', {
      p_full_name: fullName.trim(),
      p_email: email.trim().toLowerCase(),
      p_phone: phone.trim() || null,
      p_organization: org.trim() || null,
      p_experience: exp || null,
      p_can_attend: canAttend,
      p_notes: notes.trim() || null,
    })
    if (error) { setStep('error'); setError(error.message || 'Something went wrong.'); return }
    setRegId(data); setStep('done')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Fire confirmation to the judge (best-effort).
    supabase.functions.invoke('send-invite', {
      body: {
        kind: 'confirm-judge',
        email: email.trim().toLowerCase(),
        name: fullName.trim(),
      }
    }).catch(() => {})
  }

  if (step === 'done') {
    return (
      <section className="block">
        <div className="container">
          <div className="reg-success">
            <div className="reg-success-tick" aria-hidden>✓</div>
            <span className="kicker">Registered</span>
            <h2>You're on the list.</h2>
            <div className="reg-success-body">
              <div className="reg-success-row"><span className="k">Name</span><b>{fullName}</b></div>
              <div className="reg-success-row"><span className="k">Email</span><b>{email}</b></div>
              <div className="reg-success-row"><span className="k">Reference</span><code>{regId?.slice(0, 8)}</code></div>
            </div>
            <p className="reg-success-note">
              An organizer will review your registration and email you a judge code within 24 hours.
              After approval you'll receive login instructions and details for Judges' Training Session 1
              (Fri 17 Jul, 8:00 p.m. via Zoom).
            </p>
            <a className="reg-success-cta" href="/judging">See the judging rubric →</a>
          </div>
        </div>
      </section>
    )
  }

  return (
    <>
      <DeadlineBanner closed={closed} d={d} h={h} m={m} />
      <form className="reg-form" onSubmit={submit}>
        <div className="container">
          <fieldset className="reg-sec">
            <legend>
              <span className="reg-sec-num">01</span>
              <span className="reg-sec-title">About you</span>
            </legend>
            <div className="reg-grid three">
              <label className="reg-field">
                <span className="reg-label">Full name *</span>
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </label>
              <label className="reg-field">
                <span className="reg-label">Email *</span>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="reg-field">
                <span className="reg-label">Phone (WhatsApp)</span>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+250 …" />
              </label>
              <label className="reg-field span-2">
                <span className="reg-label">Organization / affiliation</span>
                <input type="text" value={org} onChange={e => setOrg(e.target.value)} placeholder="e.g. Isomo · TCU · IDebate Rwanda" />
              </label>
              <label className="reg-field">
                <span className="reg-label">Debate experience</span>
                <select value={exp} onChange={e => setExp(e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="none">None — will train</option>
                  <option value="some">Some — a few tournaments</option>
                  <option value="experienced">Experienced — coach / veteran</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="reg-sec">
            <legend>
              <span className="reg-sec-num">02</span>
              <span className="reg-sec-title">Availability</span>
            </legend>
            <label className="reg-checkbox">
              <input type="checkbox" checked={canAttend} onChange={e => setCanAttend(e.target.checked)} />
              <span>
                <b>I can attend Saturday 18 July 2026, 10:30 – 19:00 CAT</b>
                <em>Held at ASYV (Rwamagana · Ntunga). Includes lunch. Judges' training session Fri 17 Jul 8pm via Zoom.</em>
              </span>
            </label>
          </fieldset>

          <fieldset className="reg-sec">
            <legend>
              <span className="reg-sec-num">03</span>
              <span className="reg-sec-title">Anything else?</span>
              <span className="reg-sec-hint">Optional</span>
            </legend>
            <label className="reg-field">
              <span className="reg-label">Notes for the organizers</span>
              <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Prior judging, accessibility needs, questions..." />
            </label>
          </fieldset>

          {error && <div className="reg-error">{error}</div>}

          <div className="reg-submit-bar">
            <div className="reg-count">
              <b>Judge:</b> {fullName || '—'} · {canAttend ? 'available' : 'availability required'}
            </div>
            <button type="submit" className="reg-submit" disabled={!canSubmit || step === 'saving'}>
              {step === 'saving' ? 'Submitting…' : closed ? 'Registration closed' : 'Submit judge registration'}
            </button>
          </div>
        </div>
      </form>
    </>
  )
}
