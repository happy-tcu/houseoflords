import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Unauthorized from './pages/Unauthorized'
import Scholar from './pages/Scholar'
import Judge from './pages/Judge'
import Admin from './pages/Admin'
import Home from './pages/Home'

function Protected({ role, children }) {
  const { status, profile } = useAuth()
  if (status === 'loading') return <div className="loading">Loading…</div>
  if (status === 'anonymous') return <Navigate to="/login" replace />
  if (status === 'unauthorized') return <Navigate to="/unauthorized" replace />
  if (role && profile?.role !== role) return <Navigate to="/" replace />
  return children
}

function RoleRouter() {
  const { profile } = useAuth()
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'scholar') return <Navigate to="/scholar" replace />
  if (profile.role === 'judge')   return <Navigate to="/judge" replace />
  if (profile.role === 'admin')   return <Navigate to="/admin" replace />
  return <Navigate to="/unauthorized" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/me" element={<RoleRouter />} />
          <Route path="/scholar" element={<Protected role="scholar"><Scholar /></Protected>} />
          <Route path="/judge"   element={<Protected role="judge"><Judge /></Protected>} />
          <Route path="/admin"   element={<Protected role="admin"><Admin /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
