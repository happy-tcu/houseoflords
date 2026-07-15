import { useEffect, useMemo, useState } from 'react'
import PublicShell from '../../components/PublicShell'
import { supabase } from '../../lib/supabase'

const DEADLINE = new Date('2026-07-16T12:00:00+02:00') // Rwanda time (CAT)

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
  const [speakers, setSpeakers] = useState([EMPTY_SPEAKER(), EMPTY_SPEAKER()])

  // Speaker codes are constrained by the chosen class letter.
  const usedCodes = useMemo(() => new Set(speakers.map(s => s.code).filter(Boolean)), [speakers])
  const availableCodes = useMemo(
    () => classLetter ? SLOTS.map(n => `${classLetter}${n}`) : [],
    [classLetter]
  )

  // If class letter changes, clear speaker codes that no longer match.
  useEffect(() => {
    setSpeakers(prev => prev.map(s =>
      s.code && classLetter && s.code.charAt(0) !== classLetter ? { ...s, code: '' } : s
    ))
  }, [classLetter])

  const filledSpeakers = useMemo(
    () => speakers.filter(s => s.name.trim().length > 0),
    [speakers]
  )

  const canSubmit = classLetter && teamName.trim() && captainName.trim()
    && /\S+@\S+\.\S+/.test(captainEmail)
    && filledSpeakers.length >= 2
    && filledSpeakers.every(s => s.code)
    && !closed

  function updateSpeaker(i, field, val) {
    setSpeakers(s => s.map((x, ix) => ix === i ? { ...x, [field]: val } : x))
  }
  function addSpeaker() {
    if (speakers.length >= 10) return
    // Auto-suggest first free code for this class.
    const nextCode = classLetter
      ? (SLOTS.map(n => `${classLetter}${n}`).find(c => !usedCodes.has(c)) || '')
      : ''
    setSpeakers(s => [...s, { ...EMPTY_SPEAKER(), code: nextCode }])
  }
  function removeSpeaker(i) {
    if (speakers.length <= 2) return
    setSpeakers(s => s.filter((_, ix) => ix !== i))
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
            <span>Captains</span>
            <span className="dot" />
            <span>One form per class</span>
            <span className="dot" />
            <span>Deadline: Thu 16 Jul · noon CAT</span>
          </div>
          <span className="kicker">Team Registration</span>
          <h1>Send us your speakers.</h1>
          <div className="subtitle">
            Class captains — this is the door in.
          </div>
          <p className="lede">
            One captain per class fills the form below with their squad. Minimum two speakers.
            Once the deadline hits, pairings lock and the bracket is drawn from what we have.
          </p>
        </div>
      </section>

      {step === 'done' ? (
        <SuccessCard regId={regId} classLetter={classLetter} teamName={teamName} count={filledSpeakers.length} />
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
                  <label className="reg-field span-4">
                    <span className="reg-label">School / institution</span>
                    <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)}
                      placeholder="Optional if not applicable" />
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
                    {classLetter ? `Codes ${classLetter}1–${classLetter}10` : 'Pick a class first'} · min 2 · max 10
                  </span>
                </legend>
                <div className="reg-speakers">
                  {speakers.map((s, i) => (
                    <div key={i} className="reg-speaker">
                      <div className="reg-speaker-code">
                        <label className="reg-field">
                          <span className="reg-label">Code{i < 2 ? ' *' : ''}</span>
                          <select
                            required={i < 2}
                            value={s.code}
                            onChange={e => updateSpeaker(i, 'code', e.target.value)}
                            disabled={!classLetter}
                          >
                            <option value="">—</option>
                            {availableCodes.map(c => (
                              <option key={c} value={c}
                                disabled={usedCodes.has(c) && c !== s.code}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="reg-speaker-fields">
                        <label className="reg-field">
                          <span className="reg-label">Full name{i < 2 ? ' *' : ''}</span>
                          <input type="text" required={i < 2} value={s.name}
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
                      <button type="button" className="reg-remove"
                        onClick={() => removeSpeaker(i)} disabled={speakers.length <= 2}
                        aria-label={`Remove speaker ${i + 1}`}>×</button>
                    </div>
                  ))}
                  <button type="button" className="reg-add" onClick={addSpeaker}
                    disabled={speakers.length >= 10 || !classLetter}>
                    + Add another speaker
                  </button>
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
                  <b>{filledSpeakers.length}</b> speaker{filledSpeakers.length === 1 ? '' : 's'} · captain: <b>{captainName || '—'}</b>
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
          <b>Thu 16 Jul · 12:00 noon (CAT)</b>
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
            <div className="reg-success-row"><span className="k">Speakers</span><b>{count} ({classLetter}1–{classLetter}{count})</b></div>
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
