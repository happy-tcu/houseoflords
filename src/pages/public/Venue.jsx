import { useEffect, useRef } from 'react'
import PublicShell from '../../components/PublicShell'

const VENUES = [
  { n: 1, name: 'Liquidnet HS · East Wing', role: 'Check-in · drop-off · Prelims R1–R3',       tag: 'Prelim',  ll: [-2.0285309800667926, 30.379097336650453] },
  { n: 2, name: 'Dining Hall',              role: 'Balcony rooms · lunch · Vision 2050 Wall',  tag: 'Lunch',   ll: [-2.030515741198399,  30.38052045713727] },
  { n: 3, name: 'Green House',              role: 'Quarterfinal room A',                       tag: 'Quarter', ll: [-2.0346583794589463, 30.383267024371563] },
  { n: 4, name: 'Orange House',             role: 'Quarterfinal room B',                       tag: 'Quarter', ll: [-2.0344059952362854, 30.384603319245095] },
  { n: 5, name: 'Amphitheatre',             role: 'Final · awards · closing',                  tag: 'Final',   ll: [-2.0355843358685246, 30.383417694093897] },
]

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.L) return Promise.resolve(window.L)
  return new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }
    const existing = document.getElementById('leaflet-js')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L))
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.id = 'leaflet-js'
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    s.crossOrigin = ''
    s.async = true
    s.onload = () => resolve(window.L)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function VenuePage() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !L || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, {
        scrollWheelZoom: true, zoomControl: true, attributionControl: true,
      })
      // Satellite basemap + labels overlay (Esri World Imagery + Esri Reference).
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }
      )
      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.9, attribution: '' }
      )
      const streets = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, attribution: '© OpenStreetMap contributors' }
      )
      satellite.addTo(map)
      labels.addTo(map)
      L.control.layers(
        { 'Satellite': satellite, 'Street map': streets },
        { 'Place labels': labels },
        { position: 'topright', collapsed: true }
      ).addTo(map)
      const markers = []
      for (const v of VENUES) {
        const icon = L.divIcon({
          className: 'venue-pin-wrap',
          html: `<div class="venue-map-pin">${v.n}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        })
        const [lat, lng] = v.ll
        const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        const m = L.marker(v.ll, { icon }).addTo(map)
          .bindPopup(
            `<div class="pin-pop">` +
              `<div class="pin-pop-title">${v.n}. ${v.name}</div>` +
              `<div class="pin-pop-role">${v.role}</div>` +
              `<a class="pin-pop-cta" href="${dirUrl}" target="_blank" rel="noreferrer">Directions →</a>` +
            `</div>`
          )
        markers.push(m)
      }
      const group = L.featureGroup(markers)
      map.fitBounds(group.getBounds().pad(0.25))
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 120)
    })
    return () => {
      cancelled = true
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [])

  return (
    <PublicShell>
      <section className="hero hero-editorial">
        <div className="home-bg" aria-hidden="true">
          <div className="home-grid" />
          <img className="home-watermark" src="/assets/isomo.png" alt="" />
        </div>
        <div className="hero-inner">
          <div className="meta-bar">
            <span>ASYV</span>
            <span className="dot" />
            <span>Rubona</span>
            <span className="dot" />
            <span>~1hr east of Kigali</span>
          </div>
          <span className="kicker">The Venue</span>
          <h1>One campus, five rooms.</h1>
          <div className="subtitle">
            Where the day happens — from check-in to the closing gavel.
          </div>
          <p className="lede">
            Prelims in the high school; quarters in the family houses; final under the dome.
            Tap a pin on the map to see what happens there.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="container">
          <div className="block-head">
            <h2>The map</h2>
            <div className="hint">Numbered pins match the venue list</div>
          </div>
          <div className="venue-map-wrap">
            <div ref={mapRef} id="venue-map" role="img" aria-label="Interactive map of ASYV showing five venues" />
            <div className="venue-map-legend">
              {VENUES.map(v => (
                <div key={v.n} className={`venue-row tag-${v.tag.toLowerCase()}`}>
                  <span className="venue-num">{v.n}</span>
                  <div className="venue-body">
                    <span className="venue-name">{v.name}</span>
                    <span className="venue-role">{v.role}</span>
                  </div>
                  <span className={`venue-tag ${v.tag.toLowerCase()}`}>{v.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="block block-alt">
        <div className="container">
          <div className="block-head">
            <h2>Getting there</h2>
            <div className="hint">Rubona · Rwamagana District</div>
          </div>
          <div className="venue-getting-there">
            <div className="vgt-card">
              <span className="vgt-kicker">Drive time</span>
              <div className="vgt-value">~1 hr</div>
              <div className="vgt-note">from Kigali city centre via KN 3 Rd → RN 3 east toward Rwamagana</div>
            </div>
            <div className="vgt-card">
              <span className="vgt-kicker">Drop-off</span>
              <div className="vgt-value">Liquidnet HS</div>
              <div className="vgt-note">Enter at ASYV main gate — signs point to the East Wing for check-in</div>
            </div>
            <div className="vgt-card">
              <span className="vgt-kicker">First stop</span>
              <div className="vgt-value">Check-in</div>
              <div className="vgt-note">Registration desk in the East Wing lobby — collect badges before your first prelim</div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
