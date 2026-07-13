import { useEffect, useRef } from 'react'
import { SEGMENT_MAP, fmt, computeRemaining, warningLevel } from '../lib/segments'
import { useTick } from '../lib/realtime'
import { beep } from '../lib/sound'

export default function DebaterTimer({ pairing, mySide }) {
  useTick(500)
  const cur = SEGMENT_MAP[pairing.segment] || SEGMENT_MAP.idle
  const remaining = computeRemaining(pairing.segment_ends_at)
  const warn = warningLevel(remaining)
  const lastRef = useRef(remaining)
  useEffect(() => {
    const prev = lastRef.current
    const now = remaining
    if (cur.seconds > 0) {
      if (prev > 30 && now <= 30 && now > 0) beep({freq: 660, dur: 180})
      if (prev > 15 && now <= 15 && now > 0) beep({freq: 880, dur: 220})
      if (prev > 0 && now === 0)             beep({freq: 1000, dur: 400, repeat: 3})
    }
    lastRef.current = now
  }, [remaining, cur.seconds])

  const speaking = whoIsSpeaking(cur.key)
  const yourTurn = speaking?.side && mySide && speaking.side.toLowerCase() === mySide.toLowerCase()

  return (
    <div className={`timer timer-${cur.kind} ${warn ? `timer-${warn}` : ''} ${yourTurn ? 'you-up' : ''}`}>
      <div className="timer-top">
        <div className="timer-seg">
          <span className="timer-kicker">
            {yourTurn ? "You're up" : speaking ? `${speaking.side} is speaking` : 'Round status'}
          </span>
          <div className="timer-name">{cur.label}</div>
        </div>
      </div>

      <div className="timer-clock">
        {cur.seconds > 0 ? fmt(remaining) : '—:—'}
      </div>

      <div className="timer-signals">
        <span className={`sig ${warn === 'w30' ? 'on' : ''}`}>30s</span>
        <span className={`sig ${warn === 'w15' ? 'on' : ''}`}>15s</span>
        <span className={`sig stop ${warn === 'stop' && cur.seconds > 0 ? 'on' : ''}`}>STOP</span>
      </div>
    </div>
  )
}

function whoIsSpeaking(key) {
  switch (key) {
    case 'prop_const':
    case 'prop_rebut':
    case 'prop_close':
      return { side: 'Aff' }
    case 'opp_open':
    case 'opp_close':
      return { side: 'Opp' }
    case 'cx_opp_asks':
      return { side: 'Aff', note: 'answering Opp' }
    case 'cx_prop_asks':
      return { side: 'Opp', note: 'answering Prop' }
    default:
      return null
  }
}
