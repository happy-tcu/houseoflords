import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import DebaterTimer from '../../components/DebaterTimer'
import MotionStriking from '../../components/MotionStriking'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/realtime'

export default function DebaterPortal() {
  const { profile } = useAuth()
  const { rows: rounds } = useRealtime('rounds', {}, [])
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const { rows: ballots } = useRealtime('ballots', {}, [])
  const { rows: allMotions } = useRealtime('motions', {}, [])
  const { rows: settings } = useRealtime('app_settings', {}, [])
  const feedbackVisible = useMemo(() => {
    const s = (settings || []).find(x => x.key === 'feedback_visible')
    return s?.value === true
  }, [settings])
  const [motion, setMotion] = useState(null)

  const mine = useMemo(() => (pairings || []).filter(
    p => p.aff_code === profile.code || p.opp_code === profile.code
  ), [pairings, profile?.code])

  const active = (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done')
  const activeMine = active ? mine.find(p => p.round_id === active.id) : null

  useEffect(() => {
    (async () => {
      if (!active || !activeMine) { setMotion(null); return }
      const finalId = activeMine.final_motion_id
      const mid = finalId || active.motion_id
      if (mid) {
        const { data } = await supabase.from('motions').select('*').eq('id', mid).maybeSingle()
        setMotion(data)
      } else { setMotion(null) }
    })()
  }, [active?.motion_id, activeMine?.final_motion_id])

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

          {/* Full-width side banner — biggest, boldest fact of the round */}
          <div className={`side-banner ${mySide === 'Aff' ? 'side-aff' : 'side-opp'}`}>
            <div className="sb-mark">{mySide === 'Aff' ? 'PROP' : 'OPP'}</div>
            <div className="sb-sub">
              You argue <b>{mySide === 'Aff' ? 'for' : 'against'}</b> the motion
            </div>
          </div>

          <div className="dp-live-grid">
            <div className="dp-live-block"><div className="k">Your Room</div><div className="v">#{activeMine.room}</div></div>
            <div className="dp-live-block">
              <div className="k">Opponent</div>
              <div className="v">{mySide === 'Aff' ? activeMine.opp_code : activeMine.aff_code}</div>
            </div>
            <div className="dp-live-block"><div className="k">Judge</div><div className="v">{activeMine.judge_code}</div></div>
          </div>

          {(() => {
            const roundMotions = (allMotions || []).filter(m => m.round_id === active.id)
            const inStrikePhase = active.state === 'prep' && !activeMine.final_motion_id && roundMotions.length > 0
            return (
              <>
                <DebaterTimer pairing={activeMine} mySide={mySide} />
                {inStrikePhase && (
                  <MotionStriking pairing={activeMine} motions={roundMotions} mySide={mySide} canReset={false} />
                )}
                {!inStrikePhase && motion && (
                  <div className="jp-motion" style={{marginTop: 16}}>
                    <span className="tag" style={{background:'#8cc63e'}}>Motion</span>
                    <p>{motion.text}</p>
                  </div>
                )}
              </>
            )
          })()}
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
          const myPrefix = mySideR === 'Aff' ? 'aff' : 'opp'
          const oppPrefix = mySideR === 'Aff' ? 'opp' : 'aff'
          const won = b ? (b.winner === myPrefix) : null
          const AXES = [
            ['argument', 'Argument'],
            ['rebuttal', 'Rebuttal & CX'],
            ['delivery', 'Delivery'],
            ['persuasion', 'Persuasion'],
          ]
          const myScores = b ? AXES.map(([k]) => b[`${myPrefix}_${k}`] || 0) : null
          const oppScores = b ? AXES.map(([k]) => b[`${oppPrefix}_${k}`] || 0) : null
          const myTotal = myScores ? myScores.reduce((s, n) => s + n, 0) : null
          const oppTotal = oppScores ? oppScores.reduce((s, n) => s + n, 0) : null
          const myNote = b ? b[`${myPrefix}_note`] : null
          const forfeited = b?.forfeit_side === myPrefix

          return (
            <div key={r.id} className={`dp-row st-${r.state}`}>
              <div className="dp-row-head">
                <span className="dp-round">{r.id}</span>
                <span className="dp-room">Room #{p.room}</span>
                <span className={`dp-side ${mySideR === 'Aff' ? 'aff' : 'opp'}`}>{mySideR === 'Aff' ? 'PROP' : 'OPP'}</span>
                <span className="dp-vs">vs</span>
                <span className="dp-opp">{oppCode}</span>
                <span className="dp-judge">Judge {p.judge_code}</span>
                {b ? (
                  feedbackVisible ? (
                    <span className={`dp-result ${won ? 'won' : 'lost'}`}>
                      {won ? 'W' : 'L'} · {myTotal}/20
                    </span>
                  ) : (
                    <span className="dp-result pending">Result — pending release</span>
                  )
                ) : (
                  <span className={`state-pill st-${r.state}`}>{r.state}</span>
                )}
              </div>
              {b && feedbackVisible && (
                <div className="dp-feedback">
                  {forfeited && <div className="dp-forfeit-flag">Forfeit recorded — you did not appear for this round.</div>}
                  <table className="dp-scorecard">
                    <thead>
                      <tr><th></th><th>You ({profile?.code})</th><th>Opp ({oppCode})</th></tr>
                    </thead>
                    <tbody>
                      {AXES.map(([k, label], i) => (
                        <tr key={k}>
                          <td className="axis">{label}</td>
                          <td className={`score ${myScores[i] > oppScores[i] ? 'higher' : ''}`}>{myScores[i]}/5</td>
                          <td className={`score ${oppScores[i] > myScores[i] ? 'higher' : ''}`}>{oppScores[i]}/5</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td>Total</td>
                        <td><b>{myTotal}/20</b></td>
                        <td><b>{oppTotal}/20</b></td>
                      </tr>
                    </tbody>
                  </table>
                  {myNote && (
                    <div className="dp-note-block">
                      <span className="dp-note-label">Note from Judge {p.judge_code}</span>
                      <div className="dp-note">“{myNote}”</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </PortalShell>
  )
}
