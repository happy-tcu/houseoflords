import { useMemo, useRef, useState, useEffect } from 'react'

const FAQ = [
  // Getting there
  { cat: 'Getting there', q: 'Where is the event?',
    a: 'Agahozo-Shalom Youth Village (ASYV), Ntunga sector, Rwamagana District — about 1 hour east of Kigali via KN 3 Rd → RN 3.' },
  { cat: 'Getting there', q: 'What time does it start?',
    a: 'Saturday 18 July 2026, 10:30 CAT sharp. Arrive by 10:00 for check-in and coffee.' },
  { cat: 'Getting there', q: 'Where do I go first when I arrive?',
    a: 'Liquidnet High School — East Wing. Registration desk is in the lobby. Grab your badge before anything else. See the Venue tab for a map.' },
  { cat: 'Getting there', q: 'Where is lunch?',
    a: 'Dining Hall, 12:28 → 1:58 CAT. Also doubles as the Vision 2050 Wall session.' },

  // Sign in
  { cat: 'Sign in', q: 'How do I sign into the portal?',
    a: 'Go to houseoflords.vercel.app → Sign in → Sign in with Google using the exact email you registered with. If you use the wrong Google account, it will not let you in.' },
  { cat: 'Sign in', q: 'I did not get an invite email — what do I do?',
    a: 'Check spam / promotions first. If nothing there, ping an organizer with your class letter and speaker code so we can re-send.' },
  { cat: 'Sign in', q: 'Can I share my login with a teammate?',
    a: 'No. Each speaker code (e.g. B3) is tied to one email. Sharing breaks ballots and pairings.' },
  { cat: 'Sign in', q: 'What is my speaker code?',
    a: 'Class letter + slot number. E.g. Class B, slot 3 → B3. You receive it in the approval email once your captain has been approved by the organizers.' },

  // On the day
  { cat: 'On the day', q: 'How do I know which room I am in?',
    a: 'Sign in → your portal shows your next room, opponent, and side (Prop or Opp). The Assignments tab on the public site also lists all pairings.' },
  { cat: 'On the day', q: 'How does striking work?',
    a: 'Two motions per round. Opp strikes first, then Prop. One motion survives — that is what you debate. Prep is 30 min once the motion is set.' },
  { cat: 'On the day', q: 'What is the format?',
    a: 'IPDA Impromptu, 1 vs 1. Total round = 59 min. Prep 30 min · Prop 1 5 min · CX 2 · Opp 1 6 · CX 2 · Prop 2 3 · Opp 2 5 · Prop 3 3 · Vote 3.' },
  { cat: 'On the day', q: 'How are winners chosen?',
    a: 'Scored on 4 axes /5 each: Argument, Rebuttal & CX, Delivery, Persuasion. Total /20 per speaker. Tiebreakers: wins first, then total points.' },

  // Judges
  { cat: 'Judges', q: 'When is judge training?',
    a: 'Session 1: Friday 17 July, 8:00 p.m. via Zoom. Session 2: Saturday 18 July, 9:30 a.m. in person at ASYV.' },
  { cat: 'Judges', q: 'How do I get my judge code?',
    a: 'Register on /register → Judge tab → submit. An organizer approves you and emails your J-code (J1–J30) with your login link.' },

  // Trouble
  { cat: 'Trouble', q: 'My timer is not syncing with the judge.',
    a: 'Refresh the portal (⌘R). Timer state is stored server-side, so it should catch up within 1 second. If it still lags, flag your judge.' },
  { cat: 'Trouble', q: 'I need to withdraw or cannot attend.',
    a: 'Ping an organizer immediately — the sooner we know, the sooner we can reshuffle pairings.' },
  { cat: 'Trouble', q: 'Something is broken on the site.',
    a: 'Email an organizer with what you clicked + a screenshot. We push fixes in minutes.' },
]

const CATS = ['Getting there', 'Sign in', 'On the day', 'Judges', 'Trouble']

export default function FAQCard() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState(null)
  const panelRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FAQ.filter(f =>
      (!cat || f.cat === cat) &&
      (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
    )
  }, [query, cat])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        className={`faq-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close help' : 'Open help'}
      >
        {open ? '×' : (
          <>
            <span className="faq-fab-icon">?</span>
            <span className="faq-fab-label">Help</span>
          </>
        )}
      </button>

      {open && (
        <div className="faq-panel" ref={panelRef} role="dialog" aria-label="Frequently asked questions">
          <div className="faq-head">
            <div>
              <span className="faq-kicker">Help &middot; live</span>
              <div className="faq-title">Frequently asked.</div>
            </div>
            <button className="faq-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>

          <div className="faq-search">
            <input
              type="search"
              placeholder="Search a question…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="faq-cats">
            <button className={cat === null ? 'active' : ''} onClick={() => setCat(null)}>All</button>
            {CATS.map(c => (
              <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(cat === c ? null : c)}>{c}</button>
            ))}
          </div>

          <div className="faq-list">
            {filtered.length === 0 ? (
              <div className="faq-empty">
                <b>No match.</b>
                <span>Try a different search, or ping an organizer below.</span>
              </div>
            ) : (
              filtered.map((f, i) => (
                <details key={i} className="faq-item">
                  <summary>
                    <span className="faq-item-cat">{f.cat}</span>
                    <span className="faq-item-q">{f.q}</span>
                  </summary>
                  <div className="faq-item-a">{f.a}</div>
                </details>
              ))
            )}
          </div>

          <div className="faq-foot">
            <div>
              <span className="faq-kicker">Still stuck?</span>
              <div className="faq-foot-sub">Reach an organizer directly.</div>
            </div>
            <a className="faq-contact" href="mailto:h.niyorurema@tcu.edu?subject=House%20of%20Lords%20help">
              Email organizer &rarr;
            </a>
          </div>
        </div>
      )}
    </>
  )
}
