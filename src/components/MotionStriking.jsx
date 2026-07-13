import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const KIND_COLORS = { Policy: '#1dafec', Value: '#efb34a', Metaphor: '#8cc63e' }

export default function MotionStriking({ pairing, motions, mySide, canReset }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const struck = new Set(pairing.struck_motion_ids || [])
  const finalId = pairing.final_motion_id
  const remaining = motions.filter(m => !struck.has(m.id))
  const yourTurn = mySide && pairing.strike_turn === mySide.toLowerCase()

  const strikeCountLabel = useMemo(() => {
    const total = motions.length
    const done = struck.size
    return `${done} / ${total - 1} strikes`
  }, [motions, struck])

  async function strike(motionId) {
    setErr(null); setBusy(true)
    const { error } = await supabase.rpc('strike_motion', { p_pairing: pairing.id, p_motion: motionId })
    if (error) setErr(error.message)
    setBusy(false)
  }

  async function reset() {
    if (!confirm('Reset all strikes for this room?')) return
    setErr(null); setBusy(true)
    const { error } = await supabase.rpc('reset_strikes', { p_pairing: pairing.id })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="strike-block">
      <div className="strike-head">
        <div>
          <div className="strike-kicker">Motion striking</div>
          <div className="strike-title">
            {finalId
              ? 'Motion locked'
              : yourTurn
                ? "Your turn to strike"
                : `Waiting on ${pairing.strike_turn.toUpperCase()}`
            }
          </div>
        </div>
        <div className="strike-status">
          <span className="strike-count">{strikeCountLabel}</span>
          {canReset && <button className="btn-secondary" onClick={reset} disabled={busy}>Reset</button>}
        </div>
      </div>

      {err && <div className="landing-err">{err}</div>}

      <ol className="strike-list">
        {motions.map((m, idx) => {
          const isStruck = struck.has(m.id)
          const isFinal = finalId === m.id
          const strikableNow = !finalId && !isStruck && yourTurn
          return (
            <li key={m.id}
                className={`strike-motion ${isStruck ? 'struck' : ''} ${isFinal ? 'final' : ''}`}>
              <span className="strike-idx">{idx + 1}</span>
              <span className="tag" style={{background: KIND_COLORS[m.kind]}}>{m.kind}</span>
              <p>{m.text}</p>
              {isFinal ? (
                <span className="strike-badge final">Debate this</span>
              ) : isStruck ? (
                <span className="strike-badge struck">Struck</span>
              ) : strikableNow ? (
                <button className="btn-primary strike-btn" onClick={() => strike(m.id)} disabled={busy}>
                  Strike
                </button>
              ) : (
                <span className="strike-badge waiting">—</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
