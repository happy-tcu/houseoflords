import { useEffect, useState } from 'react'
import { useRealtime } from '../lib/realtime'
import { useAuth } from '../lib/auth'

const SHOW_MS = 10000

const AUDIENCE_MAP = {
  scholar: ['all', 'scholars'],
  judge:   ['all', 'judges'],
  admin:   ['all', 'admins'],
}

export default function Announcements() {
  const { profile } = useAuth()
  const allowed = new Set(AUDIENCE_MAP[profile?.role] || ['all'])
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
    if (!(age >= 0 && age < SHOW_MS)) return false
    if (dismissed.has(a.id)) return false
    return allowed.has(a.audience || 'all')
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
