import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, fmtINR } from '../api.js'
import { useCategories, invalidateCategories } from '../hooks/useCategories.js'
import CategoryPicker from '../components/CategoryPicker.jsx'
import ImportPanel from '../components/ImportPanel.jsx'
import ImportPdf from '../components/ImportPdf.jsx'

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

  const cats = useCategories()
  const [newName, setNewName] = useState('')
  const [actionError, setActionError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [importTab, setImportTab] = useState('json') // 'json' | 'pdf'

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

  // This page only needs the recurring list, so hit /api/recurring directly
  // instead of pulling the whole dashboard. Dedupe via an in-flight ref so
  // React 18 StrictMode's double-mount in dev fires one request, not two.
  const recurringPromise = useRef(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setActionError(null)
    if (!recurringPromise.current) {
      recurringPromise.current = api.listRecurring()
    }
    recurringPromise.current.then(list => {
      if (cancelled) return
      setRecurring(list)
      if (cats.length && !rCategory) setRCategory(cats[0].name)
    }).catch(e => { if (!cancelled) setActionError(e.message) })
      .finally(() => { if (!cancelled) { setLoading(false); recurringPromise.current = null } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (cats.length && !rCategory) setRCategory(cats[0].name)
  }, [cats])

  async function onAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setActionError(null)
    try {
      await api.createCategory(name)
      setNewName('')
      invalidateCategories()
    } catch (e) {
      setActionError(e.message)
    }
  }

  async function onDelete(c) {
    if (!confirm(`Delete category "${c.name}"?`)) return
    setActionError(null)
    try {
      await api.deleteCategory(c.id)
      invalidateCategories()
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

  // ---- Derived KPIs for the header strip ----
  const inUse = cats.filter(c => c.count > 0).length
  const recurActive = recurring.filter(r => r.active).length
  const recurMonthly = recurring.filter(r => r.active).reduce((s, r) => s + r.amount, 0)

  return (
    <div className="content content-wide">
      <div className="page-head">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 'var(--s-3)' }}>
          <h1>Admin</h1>
          <span className="meta num">
            {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} · {recurring.length} recurring
          </span>
        </div>
      </div>

      {/* KPI strip — at-a-glance counts, like the Dashboard */}
      <div className="kpi-strip">
        <div className="panel kpi-card">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem' }}>{cats.length}</div>
            <div className="kpi-sub">Categories</div>
          </div>
        </div>
        <div className="panel kpi-card">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--ink)' }}>{inUse}</div>
            <div className="kpi-sub">In use</div>
          </div>
        </div>
        <div className="panel kpi-card">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--ink)' }}>
              {recurActive}<span style={{ color: 'var(--ink-fade)', fontSize: '1rem' }}> / {recurring.length}</span>
            </div>
            <div className="kpi-sub">Recurring active</div>
          </div>
        </div>
        <div className="panel kpi-card">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>{fmtINR(recurMonthly)}</div>
            <div className="kpi-sub">Monthly auto-posted</div>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="error-banner" role="alert" style={{ marginBottom: 'var(--s-5)' }}>
          <span>— {actionError} —</span>
          <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setActionError(null)}>×</button>
        </div>
      )}

      <div className="board-grid">
        {/* Categories — compact add + capped, scrollable master list */}
        <section className="panel col-7" aria-labelledby="cat-list-h">
          <div className="panel-head">
            <h2 id="cat-list-h">Categories</h2>
            <span className="meta num">{cats.length} on file</span>
          </div>
          <div className="panel-body">
            <form className="inline-form" onSubmit={onAdd}>
              <input
                id="newcat"
                type="text"
                placeholder="Add a category — Coffee, Subscriptions, Pet Care…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoComplete="off"
                maxLength={40}
                aria-label="New category name"
              />
              <button type="submit" className="btn" disabled={!newName.trim()}>
                Add <kbd className="kbd">↵</kbd>
              </button>
            </form>
          </div>
          <div className="scroll-table">
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

        {/* Recurring — add form + capped, scrollable list */}
        <section className="panel col-5" aria-labelledby="recurring-list-h">
          <div className="panel-head">
            <h2 id="recurring-list-h">Recurring</h2>
            <span className="meta num">{recurring.length} set</span>
          </div>
          <form onSubmit={onAddRecurring} noValidate>
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
          <div className="scroll-table">
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

        {/* Import — full width */}
        <div className="col-12">
          <div className="import-tabs" role="tablist" aria-label="Import method">
            <button
              type="button"
              role="tab"
              aria-selected={importTab === 'json'}
              className={'import-tab' + (importTab === 'json' ? ' active' : '')}
              onClick={() => setImportTab('json')}
            >
              Paste JSON
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={importTab === 'pdf'}
              className={'import-tab' + (importTab === 'pdf' ? ' active' : '')}
              onClick={() => setImportTab('pdf')}
            >
              PhonePe PDF
            </button>
          </div>
          {importTab === 'pdf' ? <ImportPdf /> : <ImportPanel />}
        </div>
      </div>
    </div>
  )
}