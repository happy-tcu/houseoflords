import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import JudgeTimer from '../../components/JudgeTimer'
import MotionStriking from '../../components/MotionStriking'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtime, useTick } from '../../lib/realtime'
import { SEGMENT_MAP, fmt } from '../../lib/segments'

const SPEECHES = [
  { key: 'prop_const',  label: 'Prop constructive' },
  { key: 'opp_open',    label: 'Opp opening' },
  { key: 'prop_rebut',  label: 'Prop rebuttal' },
  { key: 'opp_close',   label: 'Opp closing' },
  { key: 'prop_close',  label: 'Prop closing (last Aff)' },
]

const UNLOCK_AFTER_PROP_CLOSE_SECONDS = 120  // 2 minutes

function computeUnlockInfo(pairing) {
  if (!pairing) return { locked: true, remaining: null, reason: 'no room' }
  if (pairing.segment === 'voting' || pairing.segment === 'done') {
    // voting starts right after prop_close ends; treat voting_started_at as segment_ends_at - voting_duration
    const votingDur = (SEGMENT_MAP.voting?.seconds ?? 180) * 1000
    const votingEnds = pairing.segment_ends_at ? new Date(pairing.segment_ends_at).getTime() : Date.now()
    const votingStarted = pairing.segment === 'voting' ? votingEnds - votingDur : Date.now()
    const unlockAt = votingStarted + UNLOCK_AFTER_PROP_CLOSE_SECONDS * 1000
    const remaining = Math.max(0, Math.floor((unlockAt - Date.now()) / 1000))
    return { locked: remaining > 0, remaining, reason: 'countdown' }
  }
  return { locked: true, remaining: null, reason: 'before-voting' }
}

const AXES = [
  { key: 'argument',   name: 'Argument',       note: 'Clarity of claim, logic, evidence.' },
  { key: 'rebuttal',   name: 'Rebuttal & CX',  note: 'Direct engagement; quality of Q&A.' },
  { key: 'delivery',   name: 'Delivery',       note: 'Pace, clarity, presence, use of time.' },
  { key: 'persuasion', name: 'Persuasion',     note: 'Would you vote for their side?' },
]

const empty = () => ({
  aff_argument: '', aff_rebuttal: '', aff_delivery: '', aff_persuasion: '', aff_note: '',
  opp_argument: '', opp_rebuttal: '', opp_delivery: '', opp_persuasion: '', opp_note: '',
  winner: '',
  speech_notes: { prop_const: '', opp_open: '', prop_rebut: '', opp_close: '', prop_close: '' },
})

export default function JudgePortal() {
  const { profile } = useAuth()
  const [ballot, setBallot] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useTick(500)

  const { rows: rounds } = useRealtime('rounds', {}, [])
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const { rows: allMotions } = useRealtime('motions', {}, [])
  const { rows: ballots } = useRealtime('ballots', {}, [])

  const active = useMemo(() => (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done'), [rounds])
  const myAssignments = useMemo(
    () => (pairings || []).filter(p => p.judge_code === profile.code),
    [pairings, profile?.code]
  )
  const mine = active ? myAssignments.find(p => p.round_id === active.id) : null

  const [motion, setMotion] = useState(null)
  useEffect(() => {
    (async () => {
      if (!active || !mine) { setMotion(null); return }
      const mid = mine.final_motion_id || active.motion_id
      if (mid) {
        const { data } = await supabase.from('motions').select('*').eq('id', mid).maybeSingle()
        setMotion(data)
      } else { setMotion(null) }
    })()
  }, [active?.motion_id, mine?.final_motion_id])

  const existing = active && mine
    ? (ballots || []).find(b => b.round_id === active.id && b.room === mine.room)
    : null

  function set(field, val) { setBallot(b => ({ ...b, [field]: val })) }

  async function onSubmit(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const row = {
        round_id: active.id, room: mine.room, judge_code: profile.code,
        aff_code: mine.aff_code, opp_code: mine.opp_code,
      }
      for (const a of AXES) {
        row[`aff_${a.key}`] = Number(ballot[`aff_${a.key}`])
        row[`opp_${a.key}`] = Number(ballot[`opp_${a.key}`])
      }
      row.winner = ballot.winner
      row.aff_note = ballot.aff_note || null
      row.opp_note = ballot.opp_note || null
      row.speech_notes = ballot.speech_notes || {}
      const { error } = await supabase.from('ballots').insert(row)
      if (error) throw error
      setMsg('Ballot submitted.'); setBallot(empty())
    } catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(false)
  }

  const roundMotions = active ? (allMotions || []).filter(m => m.round_id === active.id) : []
  const inStrikePhase = active && mine && active.state === 'prep' && !mine.final_motion_id && roundMotions.length > 0
  const total = (s) => AXES.reduce((sum, a) => sum + (Number(ballot[`${s}_${a.key}`]) || 0), 0)

  return (
    <PortalShell title="Judge Console">
      {msg && <div className="portal-msg">{msg}</div>}

      {/* Judge identity + summary */}
      <div className="dp-code-hero">
        <div className="dp-code">{profile?.code}</div>
        <div className="dp-name">{profile?.name || profile?.email} · Judge</div>
      </div>

      {/* Assignments across all rounds — always visible */}
      <h2 className="portal-h2">Your Rooms</h2>
      <div className="dp-schedule">
        {(rounds || []).filter(r => ['R1','R2','R3','R4','R5'].includes(r.id)).map(r => {
          const p = myAssignments.find(x => x.round_id === r.id)
          if (!p) return null
          const b = (ballots || []).find(x => x.round_id === r.id && x.room === p.room)
          const isActive = active?.id === r.id
          return (
            <div key={r.id} className={`dp-row st-${r.state} ${isActive ? 'active' : ''}`}>
              <span className="dp-round">{r.id}</span>
              <span className="dp-room">Room #{p.room}</span>
              <span className="dp-side aff">{p.aff_code}</span>
              <span className="dp-vs">vs</span>
              <span className="dp-opp">{p.opp_code}</span>
              {b ? (
                <span className="dp-result won">Ballot ✓</span>
              ) : (
                <span className={`state-pill st-${r.state}`}>{r.state}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Live console */}
      {!active && (
        <div className="portal-empty">
          <b>No round active yet.</b>
          <span>When admin opens a round, this section becomes your live console: motion striking → timer → ballot.</span>
        </div>
      )}

      {active && !mine && (
        <div className="portal-empty">
          <b>You have no assignment for {active.id}.</b>
          <span>Check with an organizer if this looks wrong.</span>
        </div>
      )}

      {active && mine && (
        <>
          <h2 className="portal-h2">Live · {active.id} · Room #{mine.room}</h2>

          <div className="jp-summary">
            <div className="jp-summary-block"><div className="k">Round</div><div className="v">{active.id}</div></div>
            <div className="jp-summary-block"><div className="k">Room</div><div className="v">#{mine.room}</div></div>
            <div className="jp-summary-block aff"><div className="k">Prop (Aff)</div><div className="v">{mine.aff_code}</div></div>
            <div className="jp-summary-block opp"><div className="k">Opp</div><div className="v">{mine.opp_code}</div></div>
          </div>

          <JudgeTimer pairing={mine} />

          {inStrikePhase && (
            <MotionStriking pairing={mine} motions={roundMotions} mySide={null} canReset={false} />
          )}

          {!inStrikePhase && motion && (
            <div className="jp-motion">
              <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
              <p>{motion.text}</p>
            </div>
          )}

          {existing ? (
            <div className="portal-empty ok" style={{marginTop: 16}}>
              <b>Ballot submitted for Room #{mine.room}.</b>
              <span>Winner: <b>{existing.winner === 'aff' ? mine.aff_code : mine.opp_code}</b>.
                    Aff {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`aff_${k}`]||0),0)}/20 ·
                    Opp {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`opp_${k}`]||0),0)}/20.</span>
            </div>
          ) : (
            (active.state === 'debate' || active.state === 'voting' || active.state === 'prep') && (() => {
              const unlock = computeUnlockInfo(mine)
              const scoresLocked = unlock.locked
              return (
                <>
                  {/* Per-speech notes — always editable */}
                  <div className="speech-notes-card">
                    <div className="sn-hdr">
                      <span className="sn-kicker">Speech Notes</span>
                      <span className="sn-hint">Take notes as speeches happen. Auto-saved when you submit.</span>
                    </div>
                    {SPEECHES.map(sp => (
                      <label key={sp.key} className="sn-row">
                        <span className="sn-label">{sp.label}</span>
                        <textarea rows="2"
                                  value={ballot.speech_notes[sp.key] || ''}
                                  onChange={e => setBallot(b => ({
                                    ...b, speech_notes: { ...b.speech_notes, [sp.key]: e.target.value }
                                  }))}
                                  placeholder={`Key points during ${sp.label.toLowerCase()}…`} />
                      </label>
                    ))}
                  </div>

                  <form className={`ballot-form ${scoresLocked ? 'ballot-locked' : ''}`} onSubmit={onSubmit} style={{marginTop: 16}}>
                    {scoresLocked && (
                      <div className="ballot-lock-banner">
                        <span className="lock-icon">🔒</span>
                        <div>
                          <b>Speaker points &amp; vote unlock 2:00 after Prop closing.</b>
                          <span>
                            {unlock.reason === 'before-voting'
                              ? 'Waiting for the last Aff speech to conclude.'
                              : unlock.remaining != null
                                ? `Unlocks in ${fmt(unlock.remaining)}`
                                : 'Waiting…'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="ballot-cols">
                      {['aff', 'opp'].map(side => (
                        <div key={side} className={`ballot-col2 ${side}`}>
                          <div className="col-hd">
                            <span className={`side-tag ${side}`}>{side === 'aff' ? 'PROP' : 'OPP'}</span>
                            <span className="col-code">{side === 'aff' ? mine.aff_code : mine.opp_code}</span>
                          </div>
                          {AXES.map(a => (
                            <label key={a.key} className="score-input-row">
                              <span className="sr-name">{a.name}</span>
                              <input type="number" min="0" max="5" required
                                     disabled={scoresLocked}
                                     value={ballot[`${side}_${a.key}`]}
                                     onChange={e => set(`${side}_${a.key}`, e.target.value)} />
                              <span className="sr-max">/ 5</span>
                            </label>
                          ))}
                          <div className="col-total">Total <b>{total(side)}<small> / 20</small></b></div>
                          <label className="note-row">
                            <span>Final one-liner (optional)</span>
                            <textarea rows="2"
                                      value={ballot[`${side}_note`]}
                                      onChange={e => set(`${side}_note`, e.target.value)}
                                      placeholder={`One line the ${side === 'aff' ? 'Prop' : 'Opp'} speaker should hear`} />
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className={`winner-row ${scoresLocked ? 'locked' : ''}`}>
                      <span>Winner</span>
                      <label className={`w-choice ${ballot.winner === 'aff' ? 'sel' : ''} ${scoresLocked ? 'disabled' : ''}`}>
                        <input type="radio" name="winner" value="aff" required
                               disabled={scoresLocked}
                               checked={ballot.winner === 'aff'}
                               onChange={e => set('winner', e.target.value)} />
                        PROP · {mine.aff_code}
                      </label>
                      <label className={`w-choice ${ballot.winner === 'opp' ? 'sel' : ''} ${scoresLocked ? 'disabled' : ''}`}>
                        <input type="radio" name="winner" value="opp"
                               disabled={scoresLocked}
                               checked={ballot.winner === 'opp'}
                               onChange={e => set('winner', e.target.value)} />
                        OPP · {mine.opp_code}
                      </label>
                    </div>

                    <button type="submit" className="btn-primary" disabled={busy || scoresLocked}>
                      {scoresLocked
                        ? (unlock.remaining != null ? `Locked — unlocks in ${fmt(unlock.remaining)}` : 'Locked')
                        : busy ? 'Submitting…' : 'Submit ballot'}
                    </button>
                  </form>
                </>
              )
            })()
          )}
        </>
      )}
    </PortalShell>
  )
}
