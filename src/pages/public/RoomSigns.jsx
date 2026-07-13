import PublicShell from '../../components/PublicShell'

// Simple printable room signs, one per page. Scan on-site to jump to /room/:num.
export default function RoomSigns() {
  return (
    <PublicShell>
      <section className="hero hero-center">
        <div className="hero-inner">
          <span className="kicker">Room Signs</span>
          <h1>Printable Room Signs</h1>
          <div className="subtitle">30 signs — one per page when you print</div>
          <p className="lede">Post at each door. Debaters and judges glance to confirm they're in the right room.</p>
        </div>
      </section>

      <section className="block">
        <div className="container room-signs">
          {Array.from({length: 30}, (_, i) => i + 1).map(n => (
            <div className="room-sign-page" key={n}>
              <div className="rs-brand">Isomo · House of Lords</div>
              <div className="rs-num">Room #{n}</div>
              <div className="rs-tag">Judge J{n}</div>
              <div className="rs-foot">18 July 2026 · Dissecting Vision 2050</div>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  )
}
