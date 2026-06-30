import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useCategories, invalidateCategories } from '../hooks/useCategories.js'
import CategoryPicker from '../components/CategoryPicker.jsx'

export default function AddExpense() {
  const categories = useCategories()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(() => {
    // Load last used category from localStorage
    const lastCategory = localStorage.getItem('lastExpenseCategory')
    return lastCategory || (categories.length > 0 ? categories[0].name : '')
  })
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [todayTotal, setTodayTotal] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [receipt, setReceipt] = useState(null) // For future receipt capture

  const amountRef = useRef(null)
  const statusTimer = useRef(null)
  // Guards the initial-today fetch so React 18 StrictMode's double-mount in
  // dev doesn't fire the network request twice. `mounted` survives across
  // the cleanup → re-mount cycle because the ref is part of the component
  // instance, but a fresh component instance (real remount) resets it.
  const initialFetched = useRef(false)

  useEffect(() => {
    if (categories.length && !category) {
      // Try to use last used category, fallback to first category
      const lastCategory = localStorage.getItem('lastExpenseCategory')
      const categoryExists = categories.some(c => c.name === lastCategory)
      setCategory(categoryExists ? lastCategory : categories[0].name)
    }
    if (!initialFetched.current) {
      initialFetched.current = true
      refreshToday()
    }
    return () => clearTimeout(statusTimer.current)
  }, [categories, category])

  // Use the server-side 'today' filter instead of fetching 200 and reducing
  // client-side. Way fewer documents, and the response is small.
  function refreshToday() {
    api.listExpenses('today', 50).then(items => {
      setTodayCount(items.length)
      setTodayTotal(items.reduce((s, e) => s + e.amount, 0))
    }).catch(() => {})
  }

  function isValid() {
    const n = parseInt(amount, 10)
    return Number.isFinite(n) && n > 0 && !!category && isValidDate(date)
  }

  function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const d = new Date(s + 'T00:00:00')
    return !isNaN(d.getTime())
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!isValid() || saving) return
    setError(null)
    setStatus('saving')
    setSaving(true)
    const amt = parseInt(amount, 10)
    const occurredOn = new Date(date + 'T' + new Date().toISOString().slice(11, 19) + 'Z')
    try {
      await api.createExpense({
        amount: amt,
        category,
        note: note || null,
        occurredOn: occurredOn.toISOString(),
      })
      // Save the category for next time
      localStorage.setItem('lastExpenseCategory', category)
      setAmount(''); setNote('')
      setDate(new Date().toISOString().slice(0, 10))
      setStatus('saved')
      clearTimeout(statusTimer.current)
      statusTimer.current = setTimeout(() => setStatus('idle'), 1400)
      refreshToday()
      amountRef.current?.focus()
    } catch (e) {
      setError(e.message)
      setStatus('idle')
    } finally {
      setSaving(false)
      setReceipt(null) // Clear receipt after submission
    }
  }

  return (
    <>
      <form className="panel" onSubmit={onSubmit} noValidate>
        <div className="panel-head">
          <h2>New entry</h2>
          <span className="meta">single-line debit</span>
        </div>
        <div className="panel-body">
          {error && (
            <div className="error-banner" role="alert">
              <span>— {error} —</span>
              <button
                type="button"
                className="dismiss"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >×</button>
            </div>
          )}

          <div className="field amount-field">
            <label htmlFor="amt">Amount</label>
            <div className="amount-row">
              <span className="prefix" aria-hidden="true">₹</span>
              <input
                id="amt"
                ref={amountRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                placeholder="0"
                value={amount}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '')
                  setAmount(v)
                  if (error) setError(null)
                }}
                aria-invalid={!!error && error.includes('positive')}
                aria-describedby={error ? 'amt-error' : undefined}
                autoFocus
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="cat">Category</label>
            <CategoryPicker
              id="cat"
              value={category}
              onChange={setCategory}
              options={categories.map(c => ({ value: c.name, label: c.name }))}
            />
          </div>

          <div className="field date-field">
            <label htmlFor="date">Date <span className="muted">— defaults to today</span></label>
            <div className="date-row">
              <input
                id="date"
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => {
                  setDate(e.target.value)
                  if (error) setError(null)
                }}
                aria-invalid={!!error && error.includes('date')}
              />
              {date !== new Date().toISOString().slice(0, 10) && (
                <button
                  type="button"
                  className="btn-ghost date-today"
                  onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                  aria-label="Reset date to today"
                  title="Reset to today"
                >Today</button>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="note">Note <span className="muted">— optional</span></label>
            <input
              id="note"
              type="text"
              placeholder="lunch, auto, rent share…"
              autoComplete="off"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="receipt">Receipt <span className="muted">— optional</span></label>
            <input
              id="receipt"
              type="file"
              accept="image/*"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  setReceipt(e.target.files[0])
                }
              }}
            />
            {receipt && (
              <div style={{ marginTop: 'var(--s-2)', fontSize: '0.75rem', color: 'var(--ink-fade)' }}>
                Selected: {receipt.name} ({(receipt.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>
        </div>

        <div className="form-footer">
          <Link
            className="recur-link"
            to={`/admin?recur=1&cat=${encodeURIComponent(category)}&amt=${encodeURIComponent(amount)}&note=${encodeURIComponent(note)}`}
            aria-label="Add this entry as a recurring monthly expense"
            title="Open admin with this entry pre-filled as a recurring monthly"
          >
            ↻ Make recurring
          </Link>
          <div
            className={'save-status' + (status === 'saved' ? ' success' : '')}
            aria-live="polite"
          >
            {status === 'saved' && 'Saved'}
            {status === 'saving' && 'Posting…'}
          </div>
          <button
            type="submit"
            className="btn"
            disabled={!isValid() || saving}
            aria-keyshortcuts="Enter"
          >
            Save <kbd className="kbd">↵</kbd>
          </button>
        </div>
      </form>

      <section className="panel" aria-labelledby="today-h">
        <div className="panel-head">
          <h2 id="today-h">Today</h2>
          <span className="meta">{todayCount} {todayCount === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div className="panel-body">
          {todayCount === 0 ? (
            <div className="empty">
              No entries today.
              <span className="hint">Add your first one above</span>
            </div>
          ) : (
            <>
              <div className="kpi num">
                <span className="unit">₹</span>{todayTotal.toLocaleString('en-IN')}
              </div>
              <div className="kpi-sub">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}
