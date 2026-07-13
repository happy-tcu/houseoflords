import { useEffect, useState } from 'react'
import PublicShell from '../../components/PublicShell'
import { supabase } from '../../lib/supabase'

export default function StandingsPage() {
  const [rows, setRows] = useState([])
  useEffect(() => { load() }, [])
  async function load() {
    const { data: pairings } = await supabase.from('pairings').select('*')
    const { data: ballots }  = await supabase.from('ballots').select('*')
    const s = {}
    for (const b of (ballots || [])) {
      const p = (pairings || []).find(x => x.round_id === b.round_id && x.room === b.room)
      if (!p) continue
      for (const side of ['aff','opp']) {
        const code = side === 'aff' ? p.aff_code : p.opp_code
        s[code] ||= { code, wins: 0, points: 0, debates: 0 }
        s[code].debates++
        s[code].points += (b[`${side}_argument`]||0)+(b[`${side}_rebuttal`]||0)+(b[`${side}_delivery`]||0)+(b[`${side}_persuasion`]||0)
        if (b.winner === side) s[code].wins++
      }
    }
    setRows(Object.values(s).sort((a,b) => b.wins - a.wins || b.points - a.points))
  }

  return (
    <PublicShell>
      <section className="hero hero-center">
        <div className="hero-inner">
          <span className="kicker">Standings</span>
          <h1>House of Lords &middot; Live Standings</h1>
          <div className="subtitle">Top 4 → semifinal · winner + runner-up decided in final</div>
        </div>
      </section>

      <section className="block">
        <div className="container">
          {rows.length === 0 ? (
            <div className="portal-empty"><b>No debates yet.</b><span>Standings appear once ballots come in.</span></div>
          ) : (
            <div className="table-wrap">
              <table className="fmt-table">
                <thead><tr><th>#</th><th>Speaker</th><th>Wins</th><th>Points</th><th>Debates</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.code} className={i < 4 ? 'top-4' : ''}>
                      <td>{i+1}</td><td><b>{r.code}</b></td>
                      <td><b>{r.wins}</b></td><td>{r.points}</td><td>{r.debates}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </PublicShell>
  )
}
