import { useEffect, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fetchRounds, fetchPairings, fetchMotions, submitBallot } from '../../lib/tournament'

const AXES = [
  { key: 'argument',   name: 'Argument',       note: 'Clarity of claim, logic, evidence.' },
  { key: 'rebuttal',   name: 'Rebuttal & CX',  note: 'Direct engagement; quality of Q&A.' },
  { key: 'delivery',   name: 'Delivery',       note: 'Pace, clarity, presence, use of time.' },
  { key: 'persuasion', name: 'Persuasion',     note: 'Would you vote for their side?' },
]

export default function JudgePortal() {
  const { profile } = useAuth()
  const [rounds, setRounds] = useState([])
  const [myRoom, setMyRoom] = useState(null) // for the current active round
  const [motion, setMotion] = useState(null)
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [ballot, setBallot] = useState(makeEmpty)

  const active = rounds.find(r => r.state !== 'locked' && r.state !== 'done')

  useEffect(() => { load() }, [profile])

  async function load() {
    if (!profile?.code) return
    try {
      const rs = await fetchRounds(); setRounds(rs)
      const a = rs.find(r => r.state !== 'locked' && r.state !== 'done')
      if (!a) { setMyRoom(null); setMotion(null); setExisting(null); return }
      const p = await fetchPairings(a.id)
      const mine = p.find(x => x.judge_code === profile.code)
      setMyRoom(mine)
      if (a.state === 'debate' || a.state === 'voting' || a.state === 'prep') {
        if (a.motion_id) {
          const { data } = await supabase.from('motions').select('*').eq('id', a.motion_id).maybeSingle()
          setMotion(data)
        } else {
          const ms = await fetchMotions(a.id)
          setMotion(ms[0] || null)
        }
      }
      if (mine) {
        const { data: b } = await supabase.from('ballots').select('*')
          .eq('round_id', a.id).eq('room', mine.room).maybeSingle()
        setExisting(b || null)
      }
    } catch (e) { setMsg(`Load error: ${e.message}`) }
  }

  function makeEmpty() {
    return { aff_argument: '', aff_rebuttal: '', aff_delivery: '', aff_persuasion: '',
             opp_argument: '', opp_rebuttal: '', opp_delivery: '', opp_persuasion: '',
             winner: '' }
  }

  function set(field, val) { setBallot(b => ({ ...b, [field]: val })) }

  async function onSubmit(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const row = {
        round_id: active.id, room: myRoom.room, judge_code: profile.code,
        aff_code: myRoom.aff_code, opp_code: myRoom.opp_code,
      }
      for (const a of AXES) {
        row[`aff_${a.key}`] = Number(ballot[`aff_${a.key}`])
        row[`opp_${a.key}`] = Number(ballot[`opp_${a.key}`])
      }
      row.winner = ballot.winner
      await submitBallot(row)
      setMsg('Ballot submitted.'); await load()
    } catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(false)
  }

  if (!active) {
    return (
      <PortalShell title="Judge Console">
        <div className="portal-empty">
          <b>No active round.</b>
          <span>Wait for admin to open a round. Your assignments will appear here.</span>
        </div>
      </PortalShell>
    )
  }

  if (!myRoom) {
    return (
      <PortalShell title="Judge Console">
        <div className="portal-empty">
          <b>No assignment for {active.id}.</b>
          <span>Contact an organizer if this looks wrong.</span>
        </div>
      </PortalShell>
    )
  }

  const total = (s) => AXES.reduce((sum, a) => sum + (Number(ballot[`${s}_${a.key}`]) || 0), 0)

  return (
    <PortalShell title="Judge Console">
      {msg && <div className="portal-msg">{msg}</div>}

      <div className="jp-summary">
        <div className="jp-summary-block">
          <div className="k">Round</div><div className="v">{active.id}</div>
        </div>
        <div className="jp-summary-block">
          <div className="k">Room</div><div className="v">#{myRoom.room}</div>
        </div>
        <div className="jp-summary-block aff">
          <div className="k">Prop (Aff)</div><div className="v">{myRoom.aff_code}</div>
        </div>
        <div className="jp-summary-block opp">
          <div className="k">Opp</div><div className="v">{myRoom.opp_code}</div>
        </div>
      </div>

      {motion ? (
        <div className="jp-motion">
          <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
          <p>{motion.text}</p>
        </div>
      ) : (
        <div className="portal-empty">
          <b>Motion not released yet.</b>
          <span>You'll see it here the moment prep starts.</span>
        </div>
      )}

      {existing ? (
        <div className="portal-empty ok">
          <b>Ballot already submitted for Room #{myRoom.room}.</b>
          <span>Winner: <b>{existing.winner === 'aff' ? myRoom.aff_code : myRoom.opp_code}</b>.
                Aff total {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`aff_${k}`]||0),0)}/20.
                Opp total {['argument','rebuttal','delivery','persuasion'].reduce((s,k) => s+(existing[`opp_${k}`]||0),0)}/20.</span>
        </div>
      ) : (
        active.state === 'voting' || active.state === 'debate' ? (
          <form className="ballot-form" onSubmit={onSubmit}>
            <div className="ballot-cols">
              {['aff', 'opp'].map(side => (
                <div key={side} className={`ballot-col2 ${side}`}>
                  <div className="col-hd">
                    <span className={`side-tag ${side}`}>{side === 'aff' ? 'PROP' : 'OPP'}</span>
                    <span className="col-code">{side === 'aff' ? myRoom.aff_code : myRoom.opp_code}</span>
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
                </div>
              ))}
            </div>

            <div className="winner-row">
              <span>Winner</span>
              <label className={`w-choice ${ballot.winner === 'aff' ? 'sel' : ''}`}>
                <input type="radio" name="winner" value="aff" required
                       checked={ballot.winner === 'aff'}
                       onChange={e => set('winner', e.target.value)} />
                PROP · {myRoom.aff_code}
              </label>
              <label className={`w-choice ${ballot.winner === 'opp' ? 'sel' : ''}`}>
                <input type="radio" name="winner" value="opp"
                       checked={ballot.winner === 'opp'}
                       onChange={e => set('winner', e.target.value)} />
                OPP · {myRoom.opp_code}
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit ballot'}
            </button>
          </form>
        ) : (
          <div className="portal-empty">
            <b>Ballot closed.</b>
            <span>Wait for the debate to reach the voting stage.</span>
          </div>
        )
      )}
    </PortalShell>
  )
}
