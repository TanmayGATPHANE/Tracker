import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, fmtINR } from '../api.js'
import CategoryPicker from '../components/CategoryPicker.jsx'

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AdminCategories() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const recurPrefill = params.get('recur') === '1'
  const prefillCat   = params.get('cat') || ''
  const prefillAmt   = params.get('amt') || ''
  const prefillNote  = params.get('note') || ''

  const [cats, setCats] = useState([])
  const [newName, setNewName] = useState('')
  const [actionError, setActionError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Recurring
  const [recurring, setRecurring] = useState([])
  const [rCategory, setRCategory] = useState(prefillCat)
  const [rAmount, setRAmount] = useState(prefillAmt)
  const [rDay, setRDay] = useState('1')
  const [rNote, setRNote] = useState(prefillNote)
  const [rStart, setRStart] = useState(currentYearMonth())
  const [rEnd, setREnd] = useState('')
  const [addingRecurring, setAddingRecurring] = useState(false)
  const [recurFlash, setRecurFlash] = useState(recurPrefill)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setActionError(null)
    Promise.all([api.listCategories(), api.listRecurring()])
      .then(([c, r]) => {
        if (cancelled) return
        setCats(c)
        setRecurring(r)
        if (c.length && !rCategory) setRCategory(c[0].name)
      })
      .catch(e => { if (!cancelled) setActionError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function onAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setActionError(null)
    try {
      await api.createCategory(name)
      setNewName('')
      const list = await api.listCategories()
      setCats(list)
    } catch (e) {
      setActionError(e.message)
    }
  }

  async function onDelete(c) {
    if (!confirm(`Delete category "${c.name}"?`)) return
    setActionError(null)
    try {
      await api.deleteCategory(c.id)
      const list = await api.listCategories()
      setCats(list)
    } catch (e) {
      setActionError(e.message)
    }
  }

  // ---- Recurring ----
  const rCanAdd = !!rCategory && /^\d+$/.test(rAmount.trim()) && parseInt(rAmount, 10) > 0
    && /^\d+$/.test(rDay) && parseInt(rDay, 10) >= 1 && parseInt(rDay, 10) <= 28
    && /^\d{4}-\d{2}$/.test(rStart)
    && (rEnd === '' || /^\d{4}-\d{2}$/.test(rEnd))

  async function onAddRecurring(e) {
    e.preventDefault()
    if (!rCanAdd || addingRecurring) return
    setAddingRecurring(true); setActionError(null)
    try {
      const created = await api.createRecurring({
        category: rCategory,
        amount: parseInt(rAmount, 10),
        note: rNote.trim() || null,
        dayOfMonth: parseInt(rDay, 10),
        startMonth: rStart,
        endMonth: rEnd.trim() || null,
      })
      setRecurring(rs => [...rs, created])
      setRAmount(''); setRNote('')
    } catch (e) {
      setActionError(e.message)
    } finally {
      setAddingRecurring(false)
    }
  }

  async function onToggleRecurring(r) {
    try {
      const updated = await api.toggleRecurring(r.id)
      setRecurring(rs => rs.map(x => x.id === r.id ? updated : x))
    } catch (e) {
      setActionError(e.message)
    }
  }

  async function onDeleteRecurring(r) {
    if (!confirm(`Delete recurring "${r.category} ${fmtINR(r.amount)}"? Past posted entries will remain in your ledger.`)) return
    try {
      await api.deleteRecurring(r.id)
      setRecurring(rs => rs.filter(x => x.id !== r.id))
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <>
      {actionError && (
        <div className="error-banner" role="alert" style={{ marginBottom: 'var(--s-4)' }}>
          <span>— {actionError} —</span>
          <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setActionError(null)}>×</button>
        </div>
      )}

      <form className="panel" onSubmit={onAdd} noValidate>
        <div className="panel-head">
          <h2>Categories</h2>
          <span className="meta num">{cats.length} on file</span>
        </div>
        <div className="panel-body">
          <div className="field">
            <label htmlFor="newcat">Add category</label>
            <input
              id="newcat"
              type="text"
              placeholder="Coffee, Subscriptions, Pet Care…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoComplete="off"
              maxLength={40}
            />
          </div>
        </div>
        <div className="form-footer">
          <div className="save-status" />
          <button type="submit" className="btn" disabled={!newName.trim()}>
            Add <kbd className="kbd">↵</kbd>
          </button>
        </div>
      </form>

      <section className="panel" aria-labelledby="cat-list-h">
        <div className="panel-head">
          <h2 id="cat-list-h">Master list</h2>
          <span className="meta">in use / total</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="skeleton" style={{ padding: 'var(--s-4)' }}>
              <span /><span /><span /><span />
            </div>
          ) : cats.length === 0 ? (
            <div className="empty">No categories on file.</div>
          ) : (
            <table className="cat-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="col-count">In use</th>
                  <th scope="col" className="col-action" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c.id}>
                    <td className="col-name">{c.name}</td>
                    <td className="col-count num">{c.count}</td>
                    <td className="col-action">
                      <button
                        className="btn-ghost del"
                        onClick={() => onDelete(c)}
                        disabled={c.count > 0}
                        title={c.count > 0 ? 'Reassign or delete its entries first' : 'Delete'}
                        aria-label={`Delete category ${c.name}`}
                        style={{ width: 36, height: 36, margin: 0, fontSize: '0.95rem' }}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <form className="panel" onSubmit={onAddRecurring} noValidate>
        <div className="panel-head">
          <h2>Add recurring</h2>
          <span className="meta">posts on the day each month</span>
        </div>
        <div className="panel-body">
          {recurFlash && prefillCat && (
            <div className="prefill-flash" role="status">
              Prefilled from your last entry — review and Add below.
            </div>
          )}
          <div className="field">
            <label htmlFor="rcat">Category</label>
            <CategoryPicker
              id="rcat"
              value={rCategory}
              onChange={setRCategory}
              options={cats.map(c => ({ value: c.name, label: c.name }))}
            />
          </div>

          <div className="recurring-grid">
            <div className="field recurring-amount">
              <label htmlFor="ramt">Amount</label>
              <div className="amount-row" style={{ borderBottomWidth: '1.5px' }}>
                <span className="prefix" aria-hidden="true">₹</span>
                <input
                  id="ramt"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="0"
                  value={rAmount}
                  onChange={e => setRAmount(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <div className="field recurring-day">
              <label htmlFor="rday">Day <span className="muted">1–28</span></label>
              <input
                id="rday"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={rDay}
                onChange={e => setRDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="rnote">Note <span className="muted">— optional</span></label>
            <input
              id="rnote"
              type="text"
              placeholder="monthly rent, Netflix, EMI…"
              value={rNote}
              onChange={e => setRNote(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="recurring-grid">
            <div className="field">
              <label htmlFor="rstart">Start month</label>
              <input
                id="rstart"
                type="text"
                inputMode="numeric"
                value={rStart}
                onChange={e => setRStart(e.target.value)}
                placeholder="YYYY-MM"
              />
            </div>
            <div className="field">
              <label htmlFor="rend">End month <span className="muted">— optional</span></label>
              <input
                id="rend"
                type="text"
                inputMode="numeric"
                value={rEnd}
                onChange={e => setREnd(e.target.value)}
                placeholder="YYYY-MM"
              />
            </div>
          </div>
        </div>
        <div className="form-footer">
          <div className="save-status" />
          <button type="submit" className="btn" disabled={!rCanAdd || addingRecurring}>
            Add <kbd className="kbd">↵</kbd>
          </button>
        </div>
      </form>

      <section className="panel" aria-labelledby="recurring-list-h">
        <div className="panel-head">
          <h2 id="recurring-list-h">Recurring</h2>
          <span className="meta num">{recurring.length} set</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="skeleton" style={{ padding: 'var(--s-4)' }}>
              <span /><span /><span /><span />
            </div>
          ) : recurring.length === 0 ? (
            <div className="empty">
              No recurring entries.
              <span className="hint">Add one above to auto-post each month.</span>
            </div>
          ) : (
            <table className="cat-table">
              <thead>
                <tr>
                  <th scope="col">Schedule</th>
                  <th scope="col" className="col-count">On</th>
                  <th scope="col" className="col-action" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {recurring.map(r => (
                  <tr key={r.id} className={!r.active ? 'is-inactive' : ''}>
                    <td>
                      <div className="recur-name">
                        <span className="col-name">{r.category}</span>
                        <span className="recur-amount num">{fmtINR(r.amount)}</span>
                      </div>
                      <div className="recur-meta">
                        every month on day {r.dayOfMonth}
                        {r.note && <> · <em>{r.note}</em></>}
                      </div>
                      <div className="recur-window num">
                        {r.startMonth}
                        {r.endMonth ? ` → ${r.endMonth}` : ' → ongoing'}
                        {r.lastPosted && <span className="recur-posted"> · last posted {r.lastPosted}</span>}
                      </div>
                    </td>
                    <td className="col-count">
                      <button
                        className="toggle"
                        onClick={() => onToggleRecurring(r)}
                        aria-label={r.active ? `Pause ${r.category} recurring` : `Resume ${r.category} recurring`}
                        aria-pressed={r.active}
                        title={r.active ? 'Pause' : 'Resume'}
                      >
                        <span className={'toggle-box' + (r.active ? ' on' : '')} aria-hidden="true">
                          <span className="toggle-knob" />
                        </span>
                      </button>
                    </td>
                    <td className="col-action">
                      <button
                        className="btn-ghost del"
                        onClick={() => onDeleteRecurring(r)}
                        aria-label={`Delete ${r.category} recurring`}
                        style={{ width: 36, height: 36, margin: 0, fontSize: '0.95rem' }}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}