import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Unauthorized from './pages/Unauthorized'
import MotionsPage from './pages/public/Motions'
import AssignmentsPage from './pages/public/Assignments'
import FormatPage from './pages/public/Format'
import RunOfShowPage from './pages/public/RunOfShow'
import JudgingPage from './pages/public/Judging'
import Certificate from './pages/public/Certificate'
import AdminPortal from './pages/portal/AdminPortal'
import JudgePortal from './pages/portal/JudgePortal'
import DebaterPortal from './pages/portal/DebaterPortal'

function Protected({ role, roles, children }) {
  const { status, profile } = useAuth()
  if (status === 'loading') return <div className="loading">Loading…</div>
  if (status === 'anonymous') return <Navigate to="/" replace />
  if (status === 'unauthorized') return <Navigate to="/unauthorized" replace />
  if (role && profile?.role !== role) return <Navigate to="/me" replace />
  if (roles && !roles.includes(profile?.role)) return <Navigate to="/me" replace />
  return children
}

function RoleRouter() {
  const { status, profile } = useAuth()
  if (status === 'loading') return <div className="loading">Loading…</div>
  if (status !== 'ready' || !profile) return <Navigate to="/" replace />
  if (profile.role === 'admin')   return <Navigate to="/admin" replace />
  if (profile.role === 'judge')   return <Navigate to="/judge" replace />
  if (profile.role === 'scholar') return <Navigate to="/debater" replace />
  return <Navigate to="/unauthorized" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"            element={<Home />} />
          <Route path="/motions"     element={<MotionsPage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/format"      element={<FormatPage />} />
          <Route path="/runofshow"   element={<RunOfShowPage />} />
          <Route path="/judging"     element={<JudgingPage />} />
          <Route path="/certificate" element={
            <Protected roles={['scholar','judge','admin']}><Certificate /></Protected>
          } />

          {/* Auth */}
          <Route path="/login"          element={<Login />} />
          <Route path="/auth/callback"  element={<AuthCallback />} />
          <Route path="/unauthorized"   element={<Unauthorized />} />
          <Route path="/me"             element={<RoleRouter />} />

          {/* Portals */}
          <Route path="/admin"    element={<Protected role="admin"><AdminPortal /></Protected>} />
          <Route path="/judge"    element={<Protected role="judge"><JudgePortal /></Protected>} />
          <Route path="/debater"  element={<Protected role="scholar"><DebaterPortal /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
