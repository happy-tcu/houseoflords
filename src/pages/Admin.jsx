import DashShell from '../components/DashShell'

export default function Admin() {
  return (
    <DashShell>
      <h1 style={{fontFamily:'Montserrat', fontWeight:800, fontSize:28, margin:0}}>Admin</h1>
      <p style={{color:'var(--muted)', marginTop: 8}}>Round state controls and live standings — coming soon.</p>
    </DashShell>
  )
}
