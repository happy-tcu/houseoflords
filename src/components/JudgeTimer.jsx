import { SEGMENT_MAP, SEGMENTS, fmt, computeRemaining, warningLevel } from '../lib/segments'
import { useTick } from '../lib/realtime'
import { supabase } from '../lib/supabase'

export default function JudgeTimer({ pairing }) {
  useTick(500)
  const cur = SEGMENT_MAP[pairing.segment] || SEGMENT_MAP.idle
  const remaining = computeRemaining(pairing.segment_ends_at)
  const warn = warningLevel(remaining)
  const nextKey = cur.next

  async function startSegment(key) {
    const seg = SEGMENT_MAP[key]
    if (!seg) return
    const ends = seg.seconds > 0 ? new Date(Date.now() + seg.seconds * 1000).toISOString() : null
    const { error } = await supabase.from('pairings')
      .update({ segment: key, segment_ends_at: ends })
      .eq('id', pairing.id)
    if (error) alert(error.message)
  }

  async function resetRound() {
    if (!confirm('Reset this room\'s timer to idle?')) return
    await supabase.from('pairings').update({ segment: 'idle', segment_ends_at: null }).eq('id', pairing.id)
  }

  return (
    <div className={`timer timer-${cur.kind} ${warn ? `timer-${warn}` : ''}`}>
      <div className="timer-top">
        <div className="timer-seg">
          <span className="timer-kicker">Current segment</span>
          <div className="timer-name">{cur.label}</div>
        </div>
        <button className="timer-reset" onClick={resetRound}>Reset</button>
      </div>

      <div className="timer-clock">
        {cur.seconds > 0 ? fmt(remaining) : '—:—'}
      </div>

      <div className="timer-signals">
        <span className={`sig ${warn === 'w30' ? 'on' : ''}`}>30s</span>
        <span className={`sig ${warn === 'w15' ? 'on' : ''}`}>15s</span>
        <span className={`sig stop ${warn === 'stop' && cur.seconds > 0 ? 'on' : ''}`}>STOP</span>
      </div>

      <div className="timer-actions">
        {cur.key === 'idle' && (
          <button className="btn-primary" onClick={() => startSegment('prep')}>Start prep</button>
        )}
        {cur.key !== 'idle' && cur.key !== 'done' && nextKey && (
          <button className="btn-primary" onClick={() => startSegment(nextKey)}>
            Next → {SEGMENT_MAP[nextKey].label}
          </button>
        )}
        {cur.key === 'done' && (
          <button className="btn-secondary" onClick={() => startSegment('idle')}>Reset</button>
        )}
      </div>

      <div className="timer-strip">
        {SEGMENTS.filter(s => s.key !== 'idle' && s.key !== 'done').map(s => (
          <span key={s.key} className={`chip-seg chip-${s.kind} ${cur.key === s.key ? 'now' : ''}`}>
            {s.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}
