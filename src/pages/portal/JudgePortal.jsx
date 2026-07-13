import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import JudgeTimer from '../../components/JudgeTimer'
import MotionStriking from '../../components/MotionStriking'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/realtime'

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
})

export default function JudgePortal() {
  const { profile } = useAuth()
  const [ballot, setBallot] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const { rows: rounds } = useRealtime('rounds', {}, [])
  const active = useMemo(() => (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done'), [rounds])

  const { rows: pairings } = useRealtime('pairings',
    active ? { eq: { round_id: active.id } } : null,
    [active?.id])
  const mine = useMemo(
    () => (pairings || []).find(p => p.judge_code === profile.code),
    [pairings, profile?.code]
  )

  const { rows: allMotions } = useRealtime('motions', {}, [])
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

  const { rows: existingList } = useRealtime('ballots',
    active && mine ? { eq: { round_id: active.id, room: mine.room } } : null,
    [active?.id, mine?.room])
  const existing = existingList?.[0] || null

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
      const { error } = await supabase.from('ballots').insert(row)
      if (error) throw error
      setMsg('Ballot submitted.')
    } catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(false)
  }

  if (!active) return (
    <PortalShell title="Judge Console">
      <div className="portal-empty">
        <b>No active round.</b>
        <span>Wait for admin to open a round. Your assignments will appear here in real time.</span>
      </div>
    </PortalShell>
  )

  if (!mine) return (
    <PortalShell title="Judge Console">
      <div className="portal-empty">
        <b>No assignment for {active.id}.</b>
        <span>Contact an organizer if this looks wrong.</span>
      </div>
    </PortalShell>
  )

  const total = (s) => AXES.reduce((sum, a) => sum + (Number(ballot[`${s}_${a.key}`]) || 0), 0)

  return (
    <PortalShell title="Judge Console">
      {msg && <div className="portal-msg">{msg}</div>}

      <div className="jp-summary">
        <div className="jp-summary-block"><div className="k">Round</div><div className="v">{active.id}</div></div>
        <div className="jp-summary-block"><div className="k">Room</div><div className="v">#{mine.room}</div></div>
        <div className="jp-summary-block aff"><div className="k">Prop (Aff)</div><div className="v">{mine.aff_code}</div></div>
        <div className="jp-summary-block opp"><div className="k">Opp</div><div className="v">{mine.opp_code}</div></div>
      </div>

      {(() => {
        const roundMotions = (allMotions || []).filter(m => m.round_id === active.id)
        const inStrikePhase = active.state === 'prep' && !mine.final_motion_id && roundMotions.length > 0
        if (inStrikePhase) {
          return <MotionStriking pairing={mine} motions={roundMotions} mySide={null} canReset={true} />
        }
        return (
          <>
            <JudgeTimer pairing={mine} />
            {motion ? (
              <div className="jp-motion">
                <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
                <p>{motion.text}</p>
              </div>
            ) : (
              <div className="portal-empty">
                <b>Motion not selected.</b>
                <span>Waiting on the strike to finish.</span>
              </div>
            )}
          </>
        )
      })()}

      {existing ? (
        <div className="portal-empty ok">
          <b>Ballot submitted for Room #{mine.room}.</b>
          <span>Winner: <b>{existing.winner === 'aff' ? mine.aff_code : mine.opp_code}</b>.
                Aff {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`aff_${k}`]||0),0)}/20 ·
                Opp {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`opp_${k}`]||0),0)}/20.</span>
        </div>
      ) : (
        <form className="ballot-form" onSubmit={onSubmit}>
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
                           value={ballot[`${side}_${a.key}`]}
                           onChange={e => set(`${side}_${a.key}`, e.target.value)} />
                    <span className="sr-max">/ 5</span>
                  </label>
                ))}
                <div className="col-total">Total <b>{total(side)}<small> / 20</small></b></div>
                <label className="note-row">
                  <span>Feedback (optional)</span>
                  <textarea rows="3"
                            value={ballot[`${side}_note`]}
                            onChange={e => set(`${side}_note`, e.target.value)}
                            placeholder={`One line the ${side === 'aff' ? 'Prop' : 'Opp'} speaker should hear`} />
                </label>
              </div>
            ))}
          </div>

          <div className="winner-row">
            <span>Winner</span>
            <label className={`w-choice ${ballot.winner === 'aff' ? 'sel' : ''}`}>
              <input type="radio" name="winner" value="aff" required
                     checked={ballot.winner === 'aff'}
                     onChange={e => set('winner', e.target.value)} />
              PROP · {mine.aff_code}
            </label>
            <label className={`w-choice ${ballot.winner === 'opp' ? 'sel' : ''}`}>
              <input type="radio" name="winner" value="opp"
                     checked={ballot.winner === 'opp'}
                     onChange={e => set('winner', e.target.value)} />
              OPP · {mine.opp_code}
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit ballot'}
          </button>
        </form>
      )}
    </PortalShell>
  )
}
