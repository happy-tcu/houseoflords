import { useAuth } from '../lib/auth'

export default function Unauthorized() {
  const { session, signOut } = useAuth()
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src="/assets/isomo.png" alt="Isomo" />
        <span className="pill-tag" style={{background:'rgba(231,76,60,0.12)', color:'#c0392b'}}>Not Authorized</span>
        <h1 style={{marginTop: 14}}>You're not on the list</h1>
        <p>
          {session?.user?.email && (<><b>{session.user.email}</b><br/></>)}
          isn't in the House of Lords whitelist. If this looks wrong, ping an admin to add you.
        </p>
        <button className="btn-google" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
