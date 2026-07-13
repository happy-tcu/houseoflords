import { useEffect, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { fetchRounds, fetchPairings } from '../../lib/tournament'

export default function DebaterPortal() {
  const { profile } = useAuth()
  const [rounds, setRounds] = useState([])
  const [assignments, setAssignments] = useState([]) // list of {round, room, side, opponent}
  const [motion, setMotion] = useState(null)
  const [msg, setMsg] = useState(null)

  const active = rounds.find(r => r.state !== 'locked' && r.state !== 'done')

  useEffect(() => { load() }, [profile])

  async function load() {
    if (!profile?.code) return
    try {
      const rs = await fetchRounds(); setRounds(rs)
      const out = []
      for (const r of rs) {
        const p = await fetchPairings(r.id)
        const mine = p.find(x => x.aff_code === profile.code || x.opp_code === profile.code)
        if (mine) {
          out.push({
            round: r,
            room: mine.room,
            side: mine.aff_code === profile.code ? 'Aff' : 'Opp',
            opponent: mine.aff_code === profile.code ? mine.opp_code : mine.aff_code,
            judge: mine.judge_code,
          })
        }
      }
      setAssignments(out)

      const a = rs.find(r => r.state !== 'locked' && r.state !== 'done')
      if (a && (a.state === 'prep' || a.state === 'debate' || a.state === 'voting')) {
        if (a.motion_id) {
          const { data } = await supabase.from('motions').select('*').eq('id', a.motion_id).maybeSingle()
          setMotion(data)
        } else {
          const { data } = await supabase.from('motions').select('*').eq('round_id', a.id).limit(1).maybeSingle()
          setMotion(data)
        }
      } else { setMotion(null) }
    } catch (e) { setMsg(`Load error: ${e.message}`) }
  }

  const activeAssignment = active ? assignments.find(a => a.round.id === active.id) : null

  return (
    <PortalShell title="Debater">
      {msg && <div className="portal-msg">{msg}</div>}

      <div className="dp-code-hero">
        <div className="dp-code">{profile?.code}</div>
        <div className="dp-name">{profile?.name || profile?.email}</div>
      </div>

      {active && activeAssignment ? (
        <div className="dp-live">
          <div className="dp-live-top">
            <span className={`state-pill st-${active.state}`}>{active.id} · {active.state}</span>
          </div>
          <div className="dp-live-grid">
            <div className="dp-live-block">
              <div className="k">Your Room</div><div className="v">#{activeAssignment.room}</div>
            </div>
            <div className={`dp-live-block ${activeAssignment.side === 'Aff' ? 'aff' : 'opp'}`}>
              <div className="k">Your Side</div>
              <div className="v">{activeAssignment.side === 'Aff' ? 'PROP' : 'OPP'}</div>
            </div>
            <div className="dp-live-block">
              <div className="k">Opponent</div><div className="v">{activeAssignment.opponent}</div>
            </div>
            <div className="dp-live-block">
              <div className="k">Judge</div><div className="v">{activeAssignment.judge}</div>
            </div>
          </div>

          {motion ? (
            <div className="jp-motion" style={{marginTop: 16}}>
              <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
              <p>{motion.text}</p>
            </div>
          ) : (
            <div className="portal-empty">
              <b>Motion not released yet.</b>
              <span>Sit tight — the moment the admin drops the motion, it appears here.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="portal-empty">
          <b>No active round.</b>
          <span>Your assignments for the day are below.</span>
        </div>
      )}

      <h2 className="portal-h2">Your Schedule</h2>
      <div className="dp-schedule">
        {assignments.length === 0 && (
          <div className="portal-empty">
            <b>No assignments yet.</b>
            <span>Pairings will show up once the admin publishes them.</span>
          </div>
        )}
        {assignments.map(a => (
          <div key={a.round.id} className={`dp-row st-${a.round.state}`}>
            <span className="dp-round">{a.round.id}</span>
            <span className="dp-room">Room #{a.room}</span>
            <span className={`dp-side ${a.side === 'Aff' ? 'aff' : 'opp'}`}>{a.side === 'Aff' ? 'PROP' : 'OPP'}</span>
            <span className="dp-vs">vs</span>
            <span className="dp-opp">{a.opponent}</span>
            <span className="dp-judge">Judge {a.judge}</span>
            <span className={`state-pill st-${a.round.state}`}>{a.round.state}</span>
          </div>
        ))}
      </div>
    </PortalShell>
  )
}
