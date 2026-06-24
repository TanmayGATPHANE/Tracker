import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import AddExpense from './pages/AddExpense.jsx'
import History from './pages/History.jsx'
import AdminCategories from './pages/AdminCategories.jsx'
import Login from './pages/Login.jsx'
import VersionFooter from './components/VersionFooter.jsx'
import { getToken, logout, onAuthChange } from './api.js'

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())

  useEffect(() => {
    return onAuthChange(() => setAuthed(!!getToken()))
  }, [])

  if (!authed) {
    return (
      <div className="app">
        <header className="masthead">
          <div className="masthead-inner">
            <div className="wordmark">Ledger<em>.</em></div>
            <div className="kicker">Personal expense tracker</div>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<RequireAuth><Shell /></RequireAuth>} />
          </Routes>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="wordmark">Ledger<em>.</em></div>
          <div className="kicker">Personal expense tracker</div>
        </div>
      </header>

      <nav className="tabs" aria-label="Primary">
        <NavLink
          to="/add"
          className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          aria-current={({ isActive }) => isActive ? 'page' : undefined}
        >
          Add
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          aria-current={({ isActive }) => isActive ? 'page' : undefined}
        >
          History
        </NavLink>
        <NavLink
          to="/admin/categories"
          className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          aria-current={({ isActive }) => isActive ? 'page' : undefined}
        >
          Admin
        </NavLink>
        <button
          type="button"
          className="tab tab-logout"
          onClick={() => {
            logout()
            window.location.replace('/login')
          }}
          aria-label="Sign out"
          title="Sign out"
        >
          Sign out
        </button>
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/add" replace />} />
          <Route path="/add" element={<AddExpense />} />
          <Route path="/history" element={<History />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="*" element={<Navigate to="/add" replace />} />
        </Routes>
      </main>

      <VersionFooter />
    </div>
  )
}

/// Placeholder shell used inside the not-authed branch. Never renders content
/// because RequireAuth below immediately redirects to /login.
function Shell() { return null }

/// If authed, render children. Otherwise redirect to /login (remembering where
/// the user was trying to go).
function RequireAuth({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    navigate('/login', { replace: true, state: { from: location.pathname + location.search } })
  }, [navigate, location])
  return null
}