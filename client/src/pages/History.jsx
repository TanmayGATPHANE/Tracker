import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtINR } from '../api.js'
import CategoryPicker from '../components/CategoryPicker.jsx'
import { useCategories } from '../hooks/useCategories.js'

const PERIODS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last7Days', label: '7 days' },
]

const SEGMENTS = 16

const PERIOD_LABEL = {
  thisMonth: 'this month',
  lastMonth: 'last month',
  last7Days: 'last 7 days',
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function History() {
  const [period, setPeriod] = useState('thisMonth')
  const [summary, setSummary] = useState(null)
  const [entries, setEntries] = useState([])
  const [budgets, setBudgets] = useState({}) // { Category: amount }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filtering states
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategories, setSelectedCategories] = useState([])
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

  // Inline edit state for budget rows
  const [editing, setEditing] = useState(null) // category | null
  const [editValue, setEditValue] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)

  // Add-budget state — categories come from the dashboard response.
  const [categories, setCategories] = useState([])
  const [addCategory, setAddCategory] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addingBudget, setAddingBudget] = useState(false)

  const cats = useCategories()

  // Filter entries based on search and filters
  const filteredEntries = useMemo(() => {
    if (!entries) return []

    return entries.filter(entry => {
      // Search term filter
      if (searchTerm &&
          !entry.category.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !(entry.note && entry.note.toLowerCase().includes(searchTerm.toLowerCase()))) {
        return false
      }

      // Category filter
      if (selectedCategories.length > 0 && !selectedCategories.includes(entry.category)) {
        return false
      }

      // Amount filters
      const amount = entry.amount
      if (minAmount && amount < parseInt(minAmount)) {
        return false
      }
      if (maxAmount && amount > parseInt(maxAmount)) {
        return false
      }

      return true
    })
  }, [entries, searchTerm, selectedCategories, minAmount, maxAmount])

  // Export to CSV function
  function exportToCSV() {
    if (filteredEntries.length === 0) return

    // Create CSV content
    const headers = ['Date', 'Category', 'Amount', 'Note']
    const rows = filteredEntries.map(entry => [
      new Date(entry.occurredOn).toISOString().split('T')[0],
      entry.category,
      entry.amount,
      entry.note || ''
    ])

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n')

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `expenses-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Re-fetch when the period changes. We dedupe simultaneous in-flight
  // requests for the same period: StrictMode's double-mount fires the
  // effect twice back-to-back, both calls would otherwise hit the network.
  // The ref's `current` is set immediately on the first call so the second
  // mount reuses the same promise instead of firing its own request.
  const inflight = useRef(new Map())
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    let promise = inflight.current.get(period)
    if (!promise) {
      promise = api.getDashboard(period)
      inflight.current.set(period, promise)
      promise.finally(() => inflight.current.delete(period))
    }
    promise.then(d => {
      if (cancelled) return
      setSummary(d.summary)
      setEntries(d.entries)
      const map = {}
      for (const row of d.budgets) map[row.category] = row.amount
      setBudgets(map)
      setCategories(d.categories)
      if (d.categories.length && !addCategory) setAddCategory(d.categories[0].name)
    }).catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  async function onDelete(entry) {
    if (!confirm(`Delete ${entry.category} entry for ₹${entry.amount}?`)) return
    try {
      await api.deleteExpense(entry.id)
      setEntries(es => es.filter(e => e.id !== entry.id))
      const s = await api.getSummary(period)
      setSummary(s)
    } catch (e) {
      setError(e.message)
    }
  }

  // ---- Budget editing ----
  function startEdit(category, currentAmount) {
    setEditing(category)
    setEditValue(currentAmount ? String(currentAmount) : '')
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue('')
  }

  async function commitEdit(category) {
    const trimmed = editValue.trim()
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
      cancelEdit()
      return
    }
    const amount = parseInt(trimmed, 10)
    const ym = currentYearMonth()
    setSavingBudget(true)
    try {
      await api.upsertBudget(category, ym, amount)
      setBudgets(prev => ({ ...prev, [category]: amount }))
      const s = await api.getSummary(period)
      setSummary(s)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingBudget(false)
      cancelEdit()
    }
  }

  async function clearBudget(category) {
    const ym = currentYearMonth()
    try {
      await api.deleteBudget(category, ym)
      setBudgets(prev => {
        const next = { ...prev }
        delete next[category]
        return next
      })
      const s = await api.getSummary(period)
      setSummary(s)
    } catch (e) {
      setError(e.message)
    }
  }

  // ---- Add a new budget ----
  const canAdd = !!addCategory && /^\d+$/.test(addAmount.trim()) && parseInt(addAmount, 10) >= 0
  async function addBudget(e) {
    e.preventDefault()
    if (!canAdd || addingBudget) return
    const amount = parseInt(addAmount, 10)
    const ym = currentYearMonth()
    setAddingBudget(true)
    try {
      await api.upsertBudget(addCategory, ym, amount)
      setBudgets(prev => ({ ...prev, [addCategory]: amount }))
      setAddAmount('')
      const s = await api.getSummary(period)
      setSummary(s)
    } catch (e) {
      setError(e.message)
    } finally {
      setAddingBudget(false)
    }
  }

  // ---- Derived view data ----
  const breakdown = summary?.breakdown ?? []
  const sortedBreakdown = useMemo(
    () => breakdown.slice().sort((a, b) => b.total - a.total),
    [breakdown]
  )
  const max = breakdown.length ? Math.max(...breakdown.map(b => b.total)) : 0
  const totalEntries = breakdown.reduce((s, b) => s + b.count, 0)
  const showBudgets = period === 'thisMonth'

  // Budget rows = categories that have a budget set, sorted by % used desc.
  // If no budgets at all, show a single prompt row to encourage setting one.
  const budgetRows = useMemo(() => {
    if (!showBudgets) return []
    const rows = Object.entries(budgets).map(([cat, amt]) => {
      const spent = breakdown.find(b => b.category === cat)?.total ?? 0
      return { category: cat, budget: amt, spent, over: spent > amt }
    })
    return rows.sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))
  }, [budgets, breakdown, showBudgets])

  return (
    <>
      {/* Filter Controls */}
      <div className="panel">
        <div className="panel-head">
          <h2>Filters</h2>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
            <div className="field">
              <label htmlFor="search">Search</label>
              <input
                id="search"
                type="text"
                placeholder="Search categories or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="categories">Categories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
                {cats.map(cat => (
                  <button
                    key={cat.name}
                    type="button"
                    className={`btn-ghost ${selectedCategories.includes(cat.name) ? 'on' : ''}`}
                    onClick={() => {
                      if (selectedCategories.includes(cat.name)) {
                        setSelectedCategories(selectedCategories.filter(c => c !== cat.name))
                      } else {
                        setSelectedCategories([...selectedCategories, cat.name])
                      }
                    }}
                    style={{
                      fontSize: '0.75rem',
                      padding: 'var(--s-1) var(--s-2)',
                      backgroundColor: selectedCategories.includes(cat.name) ? 'var(--ink)' : 'transparent',
                      color: selectedCategories.includes(cat.name) ? 'var(--paper)' : 'var(--ink-fade)',
                      border: '1px solid var(--rule)',
                      borderRadius: 0
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="min-amount">Min Amount</label>
              <input
                id="min-amount"
                type="number"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="max-amount">Max Amount</label>
              <input
                id="max-amount"
                type="number"
                placeholder="Any"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--s-3)' }}>
            <button
              className="btn-ghost"
              onClick={() => {
                setSearchTerm('')
                setSelectedCategories([])
                setMinAmount('')
                setMaxAmount('')
              }}
              style={{ fontSize: '0.75rem' }}
            >
              Clear Filters
            </button>
            <button
              className="btn-ghost"
              onClick={exportToCSV}
              style={{ fontSize: '0.75rem' }}
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <section className="panel" aria-labelledby="statement-h">
        <div className="panel-head">
          <h2 id="statement-h">Statement</h2>
          <span className="meta num">{PERIOD_LABEL[period]}</span>
        </div>
        <div className="panel-body">
          <div className="period-toggle" role="tablist" aria-label="Period">
            {PERIODS.map(p => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={period === p.value}
                className={period === p.value ? 'on' : ''}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>— {error} —</span>
              <button className="dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
            </div>
          )}

          {loading ? (
            <div className="skeleton" aria-label="Loading">
              <span /><span /><span /><span />
            </div>
          ) : (
            <>
              <div className="kpi num" aria-live="polite">
                <span className="unit">₹</span>{summary.total.toLocaleString('en-IN')}
              </div>
              <div className="kpi-sub">
                {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
                {' · '}
                {breakdown.length} {breakdown.length === 1 ? 'category' : 'categories'}
              </div>

              {summary.previous && (summary.previous.total > 0 || summary.total > 0) && (
                <DeltaLine delta={summary.previous} />
              )}

              {showBudgets && summary.totalBudget > 0 && (
                <BudgetHeadline total={summary.total} totalBudget={summary.totalBudget} over={summary.totalOver} />
              )}

              {breakdown.length === 0 ? (
                <div className="empty">
                  No debits in this period.
                </div>
              ) : (
                <div className="breakdown" role="list">
                  {sortedBreakdown.map(b => {
                    const filled = max ? Math.round((b.total / max) * SEGMENTS) : 0
                    return (
                      <div key={b.category} className="breakdown-row" role="listitem">
                        <div>
                          <span className="name">{b.category}</span>
                          <span className="count num">×{b.count}</span>
                        </div>
                        <div className="amount-cell">
                          <span className="amount num">{fmtINR(b.total)}</span>
                          {b.previousTotal != null && (
                            <CategoryDelta current={b.total} previous={b.previousTotal} pct={b.diffPercent} />
                          )}
                        </div>
                        <div
                          className="bar"
                          aria-label={`${b.category}: ${fmtINR(b.total)} of ${fmtINR(max)}`}
                        >
                          {Array.from({ length: SEGMENTS }).map((_, i) => (
                            <span key={i} className={i < filled ? 'filled' : ''} />
                          ))}
                        </div>
                        {b.percentOfBudget != null && (
                          <div className={'budget-line num' + (b.over ? ' over' : '')}>
                            {b.percentOfBudget.toFixed(1)}% of {fmtINR(b.budget)}
                            {b.over && <> · {fmtINR(b.total - b.budget)} over</>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {showBudgets && (
        <section className="panel" aria-labelledby="budgets-h">
          <div className="panel-head">
            <h2 id="budgets-h">Budgets</h2>
            <span className="meta num">{currentYearMonth()}</span>
          </div>
          <div className="panel-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
            {loading ? (
              <div className="skeleton" aria-label="Loading" style={{ padding: 'var(--s-4) 0' }}>
                <span /><span /><span />
              </div>
            ) : (
              <>
                {budgetRows.length === 0 && (
                  <div className="empty">
                    No budgets set for this month.
                    <span className="hint">Pick a category and enter a rupee amount below.</span>
                  </div>
                )}

                {budgetRows.length > 0 && (
                  <ul className="budget-list">
                    {budgetRows.map(row => {
                      const pct = Math.min(100, Math.round((row.spent / row.budget) * 100))
                      const isEditing = editing === row.category
                      return (
                        <li key={row.category} className={'budget-row' + (row.over ? ' over' : '')}>
                          <div className="budget-name">{row.category}</div>
                          {isEditing ? (
                            <input
                              className="budget-input num"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoFocus
                              value={editValue}
                              placeholder="0"
                              onChange={e => setEditValue(e.target.value.replace(/\D/g, ''))}
                              onBlur={() => commitEdit(row.category)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit(row.category)
                                else if (e.key === 'Escape') cancelEdit()
                              }}
                              disabled={savingBudget}
                            />
                          ) : (
                            <button
                              className="budget-amount num"
                              onClick={() => startEdit(row.category, row.budget)}
                              title="Click to edit"
                              aria-label={`Edit ${row.category} budget, currently ${row.budget} rupees`}
                            >
                              {fmtINR(row.budget)}
                            </button>
                          )}
                          <div className="budget-progress" aria-hidden="true">
                            <div
                              className={'budget-progress-fill' + (row.over ? ' over' : '')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className={'budget-status num' + (row.over ? ' over' : '')}>
                            {row.over
                              ? `+${fmtINR(row.spent - row.budget)} over`
                              : `${fmtINR(row.budget - row.spent)} left`}
                          </div>
                          <button
                            className="btn-ghost budget-clear"
                            onClick={() => clearBudget(row.category)}
                            aria-label={`Remove ${row.category} budget`}
                            title="Remove budget"
                          >×</button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <BudgetAddForm
                  categories={categories}
                  value={addCategory}
                  onCategory={setAddCategory}
                  amount={addAmount}
                  onAmount={setAddAmount}
                  onSubmit={addBudget}
                  canAdd={canAdd}
                  adding={addingBudget}
                />
              </>
            )}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="entries-h">
        <div className="panel-head">
          <h2 id="entries-h">Recent entries</h2>
          <span className="meta num">{filteredEntries.length}{filteredEntries.length !== entries.length ? ` of ${entries.length}` : ''}</span>
        </div>
        <div className="panel-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          {loading ? (
            <div className="skeleton" aria-label="Loading" style={{ padding: 'var(--s-4) 0' }}>
              <span /><span /><span /><span /><span />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="empty">Ledger is empty for this period.</div>
          ) : (
            <ul className="entries">
              {filteredEntries.map(e => (
                <li key={e.id} className="entry">
                  <div className="date num">
                    {new Date(e.occurredOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </div>
                  <div>
                    <div className="cat">{e.category}</div>
                    {e.note && <div className="note">{e.note}</div>}
                  </div>
                  <div className="right">
                    <span className="amount num">₹ {e.amount.toLocaleString('en-IN')}</span>
                    <button
                      className="del"
                      onClick={() => onDelete(e)}
                      aria-label={`Delete ${e.category} entry for rupees ${e.amount}`}
                    >×</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

function BudgetHeadline({ total, totalBudget, over }) {
  const pct = Math.round((total / totalBudget) * 1000) / 10
  return (
    <div className={'budget-headline' + (over ? ' over' : '')}>
      {over
        ? <>Over monthly budget by <span className="num">{fmtINR(total - totalBudget)}</span> ({pct.toFixed(1)}%)</>
        : <>{pct.toFixed(1)}% of monthly budget · <span className="num">{fmtINR(totalBudget - total)}</span> remaining</>}
    </div>
  )
}

/// Top-level month-over-month delta, shown under the Statement total.
/// Per the design: rust arrow when more, flat dim when less, no green.
function DeltaLine({ delta }) {
  if (!delta || delta.previous == null) return null
  // Server returns `diff` (this - prev). Positive = spent more, negative = spent less.
  const diff = delta.diff
  if (diff === 0) {
    return (
      <div className="delta-line delta-flat">
        <span className="arrow" aria-hidden="true">·</span>
        <span>Same as {delta.period}</span>
      </div>
    )
  }
  const more = diff > 0
  const abs = Math.abs(diff)
  return (
    <div className={'delta-line num' + (more ? ' delta-up' : ' delta-down')}>
      <span className="arrow" aria-hidden="true">{more ? '↑' : '↓'}</span>
      <span className="amount">{fmtINR(abs)} {more ? 'more' : 'less'}</span>
      {delta.diffPercent != null && (
        <span className="pct">({Math.abs(delta.diffPercent).toFixed(1)}%)</span>
      )}
      <span className="muted"> vs {delta.period}</span>
    </div>
  )
}

/// Per-category delta shown next to each amount.
/// Same color rules: rust for up, dim for down. Tiny.
function CategoryDelta({ current, previous, pct }) {
  const diff = current - previous
  if (diff === 0 && current === 0) return null
  const more = diff > 0
  return (
    <span
      className={'cat-delta num' + (more ? ' delta-up' : ' delta-down')}
      title={`Was ${fmtINR(previous)} last period`}
    >
      {diff === 0 ? '·' : (more ? '↑' : '↓')}
      {' '}
      {pct != null ? `${Math.abs(pct).toFixed(1)}%` : fmtINR(Math.abs(diff))}
    </span>
  )
}

function BudgetAddForm({ categories, value, onCategory, amount, onAmount, onSubmit, canAdd, adding }) {
  return (
    <form className="budget-add" onSubmit={onSubmit} noValidate>
      <div className="budget-add-field budget-add-cat">
        <label htmlFor="bcat">Add category</label>
        <CategoryPicker
          id="bcat"
          value={value}
          onChange={onCategory}
          options={categories.map(c => ({ value: c.name, label: c.name }))}
        />
      </div>
      <div className="budget-add-field budget-add-amt">
        <label htmlFor="bamt">Monthly cap</label>
        <div className="amount-row" style={{ borderBottomWidth: '1.5px' }}>
          <span className="prefix" aria-hidden="true">₹</span>
          <input
            id="bamt"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={e => onAmount(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <button
        type="submit"
        className="btn budget-add-btn"
        disabled={!canAdd || adding}
      >
        Set
      </button>
    </form>
  )
}