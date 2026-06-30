import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { api, getToken } from '../api.js'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = location.state?.from || '/add'

  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [showChange, setShowChange] = useState(false)

  // If we somehow land here with a token (e.g. user navigated back), bounce to app.
  const existingToken = getToken()
  if (existingToken) return <Navigate to={fromPath} replace />

  async function onSubmit(e) {
    e.preventDefault()
    if (!password || submitting) return
    setError(null); setSubmitting(true)
    try {
      const { token, user } = await api.login(password)
      localStorage.setItem('authToken', token)
      localStorage.setItem('authUser', JSON.stringify(user))
      setPassword('')
      // Hard reload so all in-memory state resets cleanly.
      window.location.replace(fromPath)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content">
    <form className="panel" onSubmit={onSubmit} noValidate>
      <div className="panel-head">
        <h2>Sign in</h2>
        <span className="meta">password required</span>
      </div>
      <div className="panel-body">
        {error && (
          <div className="error-banner" role="alert">
            <span>— {error} —</span>
            <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setError(null)}>×</button>
          </div>
        )}
        <div className="field">
          <label htmlFor="pwd">Password</label>
          <input
            id="pwd"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); if (error) setError(null) }}
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {!showChange ? (
          <button
            type="button"
            className="btn-ghost change-toggle"
            onClick={() => setShowChange(true)}
          >
            Change password
          </button>
        ) : (
          <ChangePassword onDone={() => setShowChange(false)} />
        )}
      </div>
      <div className="form-footer">
        <div className="save-status" />
        <button type="submit" className="btn" disabled={!password || submitting}>
          Sign in <kbd className="kbd">↵</kbd>
        </button>
      </div>
    </form>
    </div>
  )
}

function ChangePassword({ onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    if (!current || !next || submitting) return
    setError(null); setSubmitting(true)
    try {
      await api.changePassword(current, next)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="change-done">
        Password updated. Sign in again with the new password.
        <button type="button" className="btn-ghost" onClick={onDone} style={{ marginLeft: 'var(--s-3)' }}>
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <form className="change-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="cp-cur">Current password</label>
        <input id="cp-cur" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div className="field">
        <label htmlFor="cp-new">New password <span className="muted">— min 8 chars</span></label>
        <input id="cp-new" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      {error && <div className="field-error">— {error} —</div>}
      <div className="change-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-secondary" disabled={!current || !next || submitting}>
          {submitting ? 'Saving…' : 'Update'}
        </button>
      </div>
    </form>
  )
}