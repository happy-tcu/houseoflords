import { useEffect, useRef } from 'react'
import { SEGMENT_MAP, SEGMENTS, fmt, computeRemaining, warningLevel } from '../lib/segments'
import { useTick } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { beep, alarm } from '../lib/sound'

export default function JudgeTimer({ pairing }) {
  useTick(500)
  const cur = SEGMENT_MAP[pairing.segment] || SEGMENT_MAP.idle
  const remaining = computeRemaining(pairing.segment_ends_at)
  const warn = warningLevel(remaining)
  const nextKey = cur.next
  const timeUp = cur.seconds > 0 && remaining === 0

  const lastRef = useRef(remaining)
  useEffect(() => {
    const prev = lastRef.current
    const now = remaining
    if (cur.seconds > 0) {
      if (prev > 30 && now <= 30 && now > 0) beep({freq: 660, dur: 220, gain: 0.45})
      if (prev > 15 && now <= 15 && now > 0) beep({freq: 900, dur: 280, gain: 0.55, repeat: 2, gap: 90})
      if (prev > 0 && now === 0)             alarm({cycles: 14, hi: 1400, lo: 900, dur: 160, gap: 40})
    }
    lastRef.current = now
  }, [remaining, cur.seconds])

  async function startSegment(key) {
    const seg = SEGMENT_MAP[key]
    if (!seg) return
    const ends = seg.seconds > 0 ? new Date(Date.now() + seg.seconds * 1000).toISOString() : null
    const { error } = await supabase.from('pairings')
      .update({ segment: key, segment_ends_at: ends })
      .eq('id', pairing.id)
    if (error) alert(error.message)
  }

  async function restartSpeech() {
    if (cur.key === 'idle' || cur.key === 'done' || cur.seconds <= 0) return
    if (cur.key === 'voting') {
      alert("Can't restart the voting segment — it would re-lock the ballot.")
      return
    }
    if (!confirm(`Restart ${cur.label}?`)) return
    const ends = new Date(Date.now() + cur.seconds * 1000).toISOString()
    const { error } = await supabase.from('pairings')
      .update({ segment_ends_at: ends })
      .eq('id', pairing.id)
    if (error) alert(error.message)
  }

  return (
    <div className={`timer timer-${cur.kind} ${warn ? `timer-${warn}` : ''}`}>
      <div className="timer-top">
        <div className="timer-seg">
          <span className="timer-kicker">Current segment</span>
          <div className="timer-name">{cur.label}</div>
        </div>
        {cur.key !== 'idle' && cur.key !== 'done' && cur.seconds > 0 && (
          <button className="timer-reset" onClick={restartSpeech}>↻ Restart speech</button>
        )}
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
          <span className="timer-hint">Timer auto-starts on the first strike.</span>
        )}
        {cur.key !== 'idle' && cur.key !== 'done' && nextKey && (
          <button className={`btn-primary ${timeUp ? 'pulse' : ''}`} onClick={() => startSegment(nextKey)}>
            {timeUp ? `▶ Start — ${SEGMENT_MAP[nextKey].label}`
                    : `Skip to — ${SEGMENT_MAP[nextKey].label}`}
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
