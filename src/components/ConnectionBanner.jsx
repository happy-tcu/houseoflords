import { useConnection, useAuthRefresh } from '../lib/realtime'

export default function ConnectionBanner() {
  useAuthRefresh()
  const { online, realtime } = useConnection()

  const offline = !online
  const degraded = online && realtime === 'lost'
  if (!offline && !degraded) return null

  return (
    <div className={`conn-banner ${offline ? 'offline' : 'degraded'}`} role="status" aria-live="polite">
      <span className="conn-dot" />
      <span className="conn-msg">
        {offline
          ? 'You are offline. Reconnect to keep the round syncing.'
          : 'Live sync dropped — attempting to reconnect. Refresh if scores or timers freeze.'}
      </span>
      <button className="conn-refresh" onClick={() => window.location.reload()}>Refresh</button>
    </div>
  )
}
