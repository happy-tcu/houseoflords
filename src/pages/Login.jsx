import { Navigate } from 'react-router-dom'

// /login is a legacy alias — the landing (Home) IS the sign-in surface now.
export default function Login() {
  return <Navigate to="/" replace />
}
