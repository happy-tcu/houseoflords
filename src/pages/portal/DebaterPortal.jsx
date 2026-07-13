import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import DebaterTimer from '../../components/DebaterTimer'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/realtime'

export default function DebaterPortal() {
  const { profile } = useAuth()
  const { rows: rounds } = useRealtime('rounds', {}, [])
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const { rows: ballots } = useRealtime('ballots', {}, [])
  const [motion, setMotion] = useState(null)

  const mine = useMemo(() => (pairings || []).filter(
    p => p.aff_code === profile.code || p.opp_code === profile.code
  ), [pairings, profile?.code])

  const active = (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done')
  const activeMine = active ? mine.find(p => p.round_id === active.id) : null

  useEffect(() => {
    (async () => {
      if (!active) { setMotion(null); return }
      if (active.motion_id) {
        const { data } = await supabase.from('motions').select('*').eq('id', active.motion_id).maybeSingle()
        setMotion(data)
      } else { setMotion(null) }
    })()
  }, [active?.motion_id])

  const mySide = activeMine ? (activeMine.aff_code === profile.code ? 'Aff' : 'Opp') : null

  const rowsByRound = useMemo(() => {
    const map = {}
    for (const p of mine) map[p.round_id] = p
    return map
  }, [mine])

  return (
    <PortalShell title="Debater">
      <div className="dp-code-hero">
        <div className="dp-code">{profile?.code}</div>
        <div className="dp-name">{profile?.name || profile?.email}</div>
      </div>

      {activeMine ? (
        <div className="dp-live">
          <div className="dp-live-top">
            <span className={`state-pill st-${active.state}`}>{active.id} · {active.state}</span>
          </div>
          <div className="dp-live-grid">
            <div className="dp-live-block"><div className="k">Your Room</div><div className="v">#{activeMine.room}</div></div>
            <div className={`dp-live-block ${mySide === 'Aff' ? 'aff' : 'opp'}`}>
              <div className="k">Your Side</div>
              <div className="v">{mySide === 'Aff' ? 'PROP' : 'OPP'}</div>
            </div>
            <div className="dp-live-block">
              <div className="k">Opponent</div>
              <div className="v">{mySide === 'Aff' ? activeMine.opp_code : activeMine.aff_code}</div>
            </div>
            <div className="dp-live-block"><div className="k">Judge</div><div className="v">{activeMine.judge_code}</div></div>
          </div>

          <DebaterTimer pairing={activeMine} mySide={mySide} />

          {motion ? (
            <div className="jp-motion" style={{marginTop: 16}}>
              <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
              <p>{motion.text}</p>
            </div>
          ) : (
            <div className="portal-empty">
              <b>Motion not released yet.</b>
              <span>The moment admin drops it, it appears here.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="portal-empty">
          <b>No active round.</b>
          <span>Your assignments for the day are below.</span>
        </div>
      )}

      <h2 className="portal-h2">Your Schedule &amp; Results</h2>
      <div className="dp-schedule">
        {mine.length === 0 && (
          <div className="portal-empty">
            <b>No assignments yet.</b>
            <span>Pairings appear once admin publishes them.</span>
          </div>
        )}
        {(rounds || []).map(r => {
          const p = rowsByRound[r.id]
          if (!p) return null
          const mySideR = p.aff_code === profile.code ? 'Aff' : 'Opp'
          const oppCode = mySideR === 'Aff' ? p.opp_code : p.aff_code
          const b = (ballots || []).find(x => x.round_id === r.id && x.room === p.room)
          const won = b ? (b.winner === (mySideR === 'Aff' ? 'aff' : 'opp')) : null
          const myTotal = b ? ['argument','rebuttal','delivery','persuasion']
            .reduce((s,k) => s + (b[`${mySideR === 'Aff' ? 'aff' : 'opp'}_${k}`] || 0), 0) : null
          const myNote = b ? b[`${mySideR === 'Aff' ? 'aff' : 'opp'}_note`] : null

          return (
            <div key={r.id} className={`dp-row st-${r.state}`}>
              <span className="dp-round">{r.id}</span>
              <span className="dp-room">Room #{p.room}</span>
              <span className={`dp-side ${mySideR === 'Aff' ? 'aff' : 'opp'}`}>{mySideR === 'Aff' ? 'PROP' : 'OPP'}</span>
              <span className="dp-vs">vs</span>
              <span className="dp-opp">{oppCode}</span>
              <span className="dp-judge">Judge {p.judge_code}</span>
              {b ? (
                <span className={`dp-result ${won ? 'won' : 'lost'}`}>
                  {won ? 'W' : 'L'} · {myTotal}/20
                </span>
              ) : (
                <span className={`state-pill st-${r.state}`}>{r.state}</span>
              )}
              {myNote && <div className="dp-note">“{myNote}”</div>}
            </div>
          )
        })}
      </div>
    </PortalShell>
  )
}
