import DashShell from '../components/DashShell'

export default function Judge() {
  return (
    <DashShell>
      <h1 style={{fontFamily:'Montserrat', fontWeight:800, fontSize:28, margin:0}}>Judge Console</h1>
      <p style={{color:'var(--muted)', marginTop: 8}}>Ballot and timekeeper — coming online at kickoff.</p>
    </DashShell>
  )
}
