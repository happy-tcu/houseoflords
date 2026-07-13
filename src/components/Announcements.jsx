import { useEffect, useState } from 'react'
import { useRealtime } from '../lib/realtime'

const SHOW_MS = 10000

export default function Announcements() {
  const { rows } = useRealtime('announcements',
    { order: { column: 'created_at', ascending: false } }, [])
  const [dismissed, setDismissed] = useState(new Set())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const visible = (rows || []).filter(a => {
    const age = now - new Date(a.created_at).getTime()
    return age >= 0 && age < SHOW_MS && !dismissed.has(a.id)
  })

  if (visible.length === 0) return null
  return (
    <div className="ann-toast-wrap">
      {visible.map(a => (
        <div key={a.id} className={`ann-toast ann-${a.kind}`}>
          <span className="ann-toast-body">{a.body}</span>
          <button onClick={() => setDismissed(s => new Set(s).add(a.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
