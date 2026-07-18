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

// Ballot is unlocked as soon as the judge has a room + motion set. No time gate.
function computeUnlockInfo(pairing) {
  if (!pairing) return { locked: true, remaining: null, reason: 'no room' }
  return { locked: false, remaining: null, reason: 'open' }
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
  forfeit_side: '',   // 'aff' | 'opp' | '' — set when one speaker doesn't show
  speech_notes: { prop_const: '', opp_open: '', prop_rebut: '', opp_close: '', prop_close: '' },
})

export default function JudgePortal() {
  const { profile } = useAuth()
  const [ballot, setBallot] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [draftSyncing, setDraftSyncing] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [confirming, setConfirming] = useState(false)
  useTick(500)

  const { rows: rounds } = useRealtime('rounds', {}, [])
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const { rows: allMotions } = useRealtime('motions', {}, [])
  const { rows: ballots } = useRealtime('ballots', {}, [])
  const { rows: semiPanels } = useRealtime('semi_panels', {}, [])
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])

  const active = useMemo(() => (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done'), [rounds])
  const isSemiRound = active?.id === 'R4' || active?.id === 'R5'
  const myPanel = useMemo(
    () => (semiPanels || []).find(p => p.judge_code === profile?.code),
    [semiPanels, profile?.code]
  )
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

  // Load draft when room becomes known
  useEffect(() => {
    (async () => {
      if (!active || !mine || existing) return
      const { data } = await supabase.from('ballot_drafts').select('*')
        .eq('round_id', active.id).eq('room', mine.room).eq('judge_code', profile.code)
        .maybeSingle()
      if (data?.data) setBallot(prev => ({ ...prev, ...data.data }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, mine?.room, profile?.code, existing?.id])

  // Debounced autosave
  useEffect(() => {
    if (!active || !mine || existing) return
    const t = setTimeout(async () => {
      setDraftSyncing(true)
      const { error } = await supabase.from('ballot_drafts').upsert(
        { round_id: active.id, room: mine.room, judge_code: profile.code, data: ballot, updated_at: new Date().toISOString() },
        { onConflict: 'round_id,room,judge_code' }
      )
      setDraftSyncing(false)
      if (!error) setDraftSavedAt(new Date())
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballot])

  function set(field, val) { setBallot(b => ({ ...b, [field]: val })) }

  async function onSubmit(e) {
    e?.preventDefault?.()
    if (!confirming) { setConfirming(true); return }
    setBusy(true); setMsg(null)
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
      row.forfeit_side = ballot.forfeit_side || null
      row.aff_note = ballot.aff_note || null
      row.opp_note = ballot.opp_note || null
      row.speech_notes = ballot.speech_notes || {}
      const { error } = await supabase.from('ballots').insert(row)
      if (error) throw error
      // drop the draft
      await supabase.from('ballot_drafts').delete()
        .eq('round_id', active.id).eq('room', mine.room).eq('judge_code', profile.code)
      setMsg('Ballot submitted.'); setBallot(empty()); setConfirming(false)
    } catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(false)
  }

  const roundMotions = active ? (allMotions || []).filter(m => m.round_id === active.id) : []
  const inStrikePhase = active && mine && active.state === 'prep' && !mine.final_motion_id && roundMotions.length > 0
  const total = (s) => AXES.reduce((sum, a) => sum + (Number(ballot[`${s}_${a.key}`]) || 0), 0)

  // Semi-panel voting mode — 15 judges per Commons vote 1-click, majority wins.
  if (isSemiRound && myPanel) {
    return <SemiPanelVote
      profile={profile}
      active={active}
      myPanel={myPanel}
      pairings={pairings || []}
      motions={allMotions || []}
      semiVotes={semiVotes || []}
    />
  }

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
                      <span className="sn-hint">
                        {draftSyncing ? 'Saving draft…'
                          : draftSavedAt ? `Draft saved ${draftSavedAt.toLocaleTimeString()}`
                          : 'Auto-saved every second'}
                      </span>
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
                      <div className="ballot-lock-card">
                        <div className="blc-hdr">
                          <span className="lock-icon">🔒</span>
                          <div>
                            <b>Speaker points &amp; vote locked</b>
                            <span>Unlock 2:00 after Prop closing ends</span>
                          </div>
                        </div>
                        {unlock.reason === 'countdown' && unlock.remaining != null ? (
                          <>
                            <div className="blc-clock">{fmt(unlock.remaining)}</div>
                            <div className="blc-bar"><div className="blc-fill" style={{width: `${100 - Math.min(100, (unlock.remaining / 120) * 100)}%`}} /></div>
                            <div className="blc-hint">Ballot unlocks automatically at 0:00</div>
                          </>
                        ) : (
                          <>
                            <div className="blc-clock">— : —</div>
                            <div className="blc-hint">Countdown starts when Prop closing ends</div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="ballot-cols">
                      {['aff', 'opp'].map(side => {
                        const forfeited = ballot.forfeit_side === side
                        const otherForfeited = ballot.forfeit_side && ballot.forfeit_side !== side
                        return (
                        <div key={side} className={`ballot-col2 ${side} ${forfeited ? 'forfeited' : ''}`}>
                          <div className="col-hd">
                            <span className={`side-tag ${side}`}>{side === 'aff' ? 'PROP' : 'OPP'}</span>
                            <span className="col-code">{side === 'aff' ? mine.aff_code : mine.opp_code}</span>
                            {!scoresLocked && (
                              <button type="button"
                                      className={`forfeit-btn ${forfeited ? 'active' : ''}`}
                                      onClick={() => {
                                        if (forfeited) {
                                          set('forfeit_side', '')
                                        } else {
                                          // Mark this side as no-show → zero their scores + auto-set winner to other side.
                                          const patch = { forfeit_side: side, winner: side === 'aff' ? 'opp' : 'aff' }
                                          for (const a of AXES) patch[`${side}_${a.key}`] = '0'
                                          setBallot(prev => ({ ...prev, ...patch }))
                                        }
                                      }}
                                      title={forfeited ? 'Cancel forfeit' : 'Mark this speaker as no-show'}>
                                {forfeited ? '× Forfeit on' : 'No-show'}
                              </button>
                            )}
                          </div>
                          {forfeited && (
                            <div className="forfeit-banner">
                              Forfeit — {side === 'aff' ? 'Prop' : 'Opp'} did not show. Scores locked at 0. Winner auto-set to {side === 'aff' ? 'Opp' : 'Prop'}.
                            </div>
                          )}
                          {AXES.map(a => (
                            <div key={a.key} className="score-pill-row">
                              <span className="sr-name">{a.name}</span>
                              <div className={`score-pills side-${side}`}>
                                {[0,1,2,3,4,5].map(n => (
                                  <button type="button" key={n}
                                          disabled={scoresLocked || forfeited}
                                          className={`score-pill ${Number(ballot[`${side}_${a.key}`]) === n ? 'sel' : ''}`}
                                          onClick={() => set(`${side}_${a.key}`, String(n))}>{n}</button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="col-total">Total <b>{total(side)}<small> / 20</small></b></div>
                          <label className="note-row">
                            <span>Final one-liner (optional)</span>
                            <textarea rows="2"
                                      value={ballot[`${side}_note`]}
                                      onChange={e => set(`${side}_note`, e.target.value)}
                                      placeholder={forfeited ? 'No-show — no comment needed' : `One line the ${side === 'aff' ? 'Prop' : 'Opp'} speaker should hear`} />
                          </label>
                        </div>
                        )
                      })}
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
                        : busy ? 'Submitting…' : 'Review & submit'}
                    </button>
                  </form>

                  {confirming && !scoresLocked && (
                    <div className="ballot-confirm-sheet">
                      <div className="bcs-card">
                        <div className="bcs-title">Confirm this ballot</div>
                        <div className="bcs-summary">
                          <div className={`bcs-side ${ballot.winner === 'aff' ? 'winner' : ''}`}>
                            <span className="side-tag aff">PROP</span>
                            <span className="bcs-code">{mine.aff_code}</span>
                            <span className="bcs-total">{total('aff')}<small>/20</small></span>
                          </div>
                          <div className={`bcs-side ${ballot.winner === 'opp' ? 'winner' : ''}`}>
                            <span className="side-tag opp">OPP</span>
                            <span className="bcs-code">{mine.opp_code}</span>
                            <span className="bcs-total">{total('opp')}<small>/20</small></span>
                          </div>
                        </div>
                        <div className="bcs-winner">
                          Winner: <b>{ballot.winner === 'aff' ? `PROP · ${mine.aff_code}` : `OPP · ${mine.opp_code}`}</b>
                        </div>
                        <div className="bcs-actions">
                          <button className="btn-secondary" onClick={() => setConfirming(false)}>Back</button>
                          <button className="btn-primary" onClick={onSubmit} disabled={busy}>
                            {busy ? 'Submitting…' : '✓ Confirm submit'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )
            })()
          )}
        </>
      )}
    </PortalShell>
  )
}

/* ---------------- SEMI-PANEL VOTE ---------------- */
function SemiPanelVote({ profile, active, myPanel, pairings, motions, semiVotes }) {
  const room = myPanel.panel === 'A' ? 1 : 2
  const semiNum = myPanel.panel === 'A' ? 1 : 2
  const pairing = pairings.find(p => p.round_id === active.id && p.room === room)
  const motion = pairing ? motions.find(m => m.id === (pairing.final_motion_id || pairing.motion_id)) : null

  const myVote = semiVotes.find(v =>
    v.judge_code === profile.code && v.round_id === active.id && v.room === room
  )
  const roomVotes = semiVotes.filter(v => v.round_id === active.id && v.room === room)
  const affN = roomVotes.filter(v => v.vote === 'aff').length
  const oppN = roomVotes.filter(v => v.vote === 'opp').length
  const total = affN + oppN
  const target = 15
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function cast(side) {
    if (myVote || busy) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('semi_votes').insert({
      judge_code: profile.code,
      round_id: active.id,
      room,
      vote: side,
    })
    setBusy(false)
    if (error) setErr(error.message)
  }

  const decided = affN >= 8 || oppN >= 8
  const winner = affN > oppN ? 'aff' : oppN > affN ? 'opp' : null

  return (
    <PortalShell title="Judge Console">
      <div className="semi-hero">
        <span className="kicker">Panel {myPanel.panel} · {myPanel.location}</span>
        <h1 className="editorial-title">Semi {semiNum}.</h1>
        <div className="semi-hero-meta">
          <span>{profile?.code}</span>
          <span className="dot" />
          <span>{profile?.name}</span>
          <span className="dot" />
          <span>1 vote · majority wins</span>
        </div>
      </div>

      {pairing ? (
        <>
          <div className="semi-motion-card">
            <span className="kicker">The motion</span>
            <p className="semi-motion-text">
              {motion?.text || 'Motion not yet released. Wait for the striking to finish.'}
            </p>
            {motion?.kind && <span className={`semi-motion-kind kind-${motion.kind.toLowerCase()}`}>{motion.kind}</span>}
          </div>

          <div className="semi-tally">
            <div className="semi-tally-row">
              <div className="semi-tally-label"><b>Prop</b> · {pairing.aff_code}</div>
              <div className="semi-tally-bar"><div className="semi-tally-fill aff" style={{ width: `${(affN / target) * 100}%` }} /></div>
              <div className="semi-tally-count">{affN}</div>
            </div>
            <div className="semi-tally-row">
              <div className="semi-tally-label"><b>Opp</b> · {pairing.opp_code}</div>
              <div className="semi-tally-bar"><div className="semi-tally-fill opp" style={{ width: `${(oppN / target) * 100}%` }} /></div>
              <div className="semi-tally-count">{oppN}</div>
            </div>
            <div className="semi-tally-foot">
              {total} of {target} votes in
              {decided && winner && (
                <span className="semi-winner-tag">
                  Winner: {winner === 'aff' ? `Prop · ${pairing.aff_code}` : `Opp · ${pairing.opp_code}`}
                </span>
              )}
            </div>
          </div>

          {err && <div className="portal-msg">Error: {err}</div>}

          {myVote ? (
            <div className="semi-voted-card">
              <div className="semi-voted-check">✓</div>
              <div>
                <b>You voted {myVote.vote === 'aff' ? `Prop · ${pairing.aff_code}` : `Opp · ${pairing.opp_code}`}</b>
                <span>Locked in. Waiting on {target - total} more judges.</span>
              </div>
            </div>
          ) : (
            <div className="semi-vote-buttons">
              <button className="semi-vote-btn aff" disabled={busy || !motion} onClick={() => cast('aff')}>
                <span className="semi-vote-side">PROP</span>
                <span className="semi-vote-code">{pairing.aff_code}</span>
                <span className="semi-vote-cta">Cast vote</span>
              </button>
              <button className="semi-vote-btn opp" disabled={busy || !motion} onClick={() => cast('opp')}>
                <span className="semi-vote-side">OPP</span>
                <span className="semi-vote-code">{pairing.opp_code}</span>
                <span className="semi-vote-cta">Cast vote</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="portal-empty">
          <b>No matchup ready yet.</b>
          <span>Semi {semiNum} pairing not yet published. Admin builds it after prelims close.</span>
        </div>
      )}
    </PortalShell>
  )
}
