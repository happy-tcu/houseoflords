import { useEffect, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import { fetchRounds, fetchBallots, fetchPairings, setRoundState, ROUND_STATES, ROUNDS_ALL, PRELIM_ROUNDS } from '../../lib/tournament'
import { supabase } from '../../lib/supabase'
import { ROUNDS as MOTION_ROUNDS } from '../../data/motions'

export default function AdminPortal() {
  const [rounds, setRounds] = useState([])
  const [ballotsByRound, setBallotsByRound] = useState({})
  const [pairingsCount, setPairingsCount] = useState({})
  const [motionsByRound, setMotionsByRound] = useState({})
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const rs = await fetchRounds()
      setRounds(rs)
      const bs = {}, ps = {}, ms = {}
      for (const r of rs) {
        const b = await fetchBallots(r.id); bs[r.id] = b
        const p = await fetchPairings(r.id); ps[r.id] = p.length
        const m = await supabase.from('motions').select('*').eq('round_id', r.id)
        ms[r.id] = m.data || []
      }
      setBallotsByRound(bs); setPairingsCount(ps); setMotionsByRound(ms)
    } catch (e) { setMsg(`Load error: ${e.message}`) }
  }

  async function onState(roundId, state) {
    setBusy(roundId); setMsg(null)
    try { await setRoundState(roundId, state); await load(); setMsg(`${roundId} → ${state}`) }
    catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(null)
  }

  async function seedMotionsFor(roundId) {
    setBusy(roundId); setMsg(null)
    try {
      const source = MOTION_ROUNDS.find(r => r.code === roundId)
      if (!source) throw new Error('no motion data for ' + roundId)
      const rows = source.motions.map(m => ({ round_id: roundId, kind: m.kind, text: m.text }))
      const { error } = await supabase.from('motions').insert(rows)
      if (error) throw error
      await load(); setMsg(`Seeded ${rows.length} motions for ${roundId}`)
    } catch (e) { setMsg(`Error: ${e.message}`) }
    setBusy(null)
  }

  const totalBallots = Object.values(ballotsByRound).reduce((s, arr) => s + arr.length, 0)
  const expectedBallots = PRELIM_ROUNDS.length * 30

  return (
    <PortalShell title="Admin">
      {msg && <div className="portal-msg">{msg}</div>}

      <div className="portal-stat-row">
        <div className="stat"><div className="k">Ballots in</div><div className="v">{totalBallots}<small> / {expectedBallots}</small></div></div>
        <div className="stat"><div className="k">Active round</div><div className="v" style={{fontSize: 22}}>{rounds.find(r => r.state !== 'locked' && r.state !== 'done')?.id || '—'}</div></div>
        <div className="stat"><div className="k">Rounds set up</div><div className="v">{rounds.filter(r => pairingsCount[r.id] > 0).length}<small> / 5</small></div></div>
        <div className="stat"><div className="k">Motions seeded</div><div className="v">{Object.values(motionsByRound).filter(a => a.length > 0).length}<small> / 5</small></div></div>
      </div>

      <div className="portal-block">
        <h2 className="portal-h2">Round Controls</h2>
        <div className="round-controls">
          {ROUNDS_ALL.map(rid => {
            const r = rounds.find(x => x.id === rid) || { id: rid, state: 'locked' }
            const b = ballotsByRound[rid] || []
            const pcount = pairingsCount[rid] || 0
            const mcount = (motionsByRound[rid] || []).length
            return (
              <div key={rid} className={`rc rc-${r.state}`}>
                <div className="rc-top">
                  <span className="rc-code">{rid}</span>
                  <span className={`rc-state rc-state-${r.state}`}>{r.state}</span>
                </div>
                <div className="rc-meta">
                  <span>Pairings: <b>{pcount}</b></span>
                  <span>Motions: <b>{mcount}</b></span>
                  <span>Ballots: <b>{b.length}</b></span>
                </div>
                <div className="rc-actions">
                  {mcount === 0 && (
                    <button onClick={() => seedMotionsFor(rid)} disabled={busy === rid}>Seed motions</button>
                  )}
                  {ROUND_STATES.map(st => (
                    st !== r.state && (
                      <button key={st} onClick={() => onState(rid, st)} disabled={busy === rid}
                              className={`rc-btn rc-btn-${st}`}>
                        → {st}
                      </button>
                    )
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </PortalShell>
  )
}
