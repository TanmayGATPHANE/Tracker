import { useEffect, useMemo, useState } from 'react'
import { api, fmtINR, formatWindow } from '../api.js'
import { useDateRange } from '../hooks/useDateRange.js'
import DateRangeFilter from '../components/DateRangeFilter.jsx'
import {
  ComposedChart, Area, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'

/// Analytics — the wide, desktop-first dashboard. Unlike the rest of the app
/// (capped at --content-max: 560px for quick mobile entry), this page breaks
/// out to a 12-column grid that uses the full screen on desktop and collapses
/// to a single column on narrow viewports.
///
/// Two fetches: the bundled dashboard payload (summary + budgets, already
/// enriched with MoM + budget context) and the raw expense list (up to 200,
/// the server cap) for trend / day-of-week / top-expense work that the
/// summary aggregates away.

// Earthy rust/brown/gold palette that reads on both light paper and dark ink.
const PALETTE = [
  '#a8410e', '#c46431', '#b8860b', '#8b5a2b', '#6b4226',
  '#9c6b3f', '#d9a06b', '#7a5c3a', '#a0522d', '#5c4a3a',
]
const colorFor = (i) => PALETTE[i % PALETTE.length]

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Shared tooltip style — uses CSS vars so it adapts to dark mode.
const tooltipStyle = {
  background: 'var(--paper)',
  border: '1px solid var(--ink)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  borderRadius: 0,
}
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`

export default function Analytics() {
  const { period, from, to, needsDates } = useDateRange()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

  useEffect(() => {
    if (needsDates) {
      setData(null)
      setLoading(false)
      return
    }
    loadAnalytics()
  }, [period, from, to, needsDates])

  async function loadAnalytics() {
    setLoading(true)
    setError(null)
    try {
      // Parallel: bundled summary + raw entries (cap 200) for trend analysis.
      const [dashboardData, expenses] = await Promise.all([
        api.getDashboard(period, from, to),
        api.listExpenses(period, 200, from, to),
      ])
      setData({ ...dashboardData, expenses })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ---- Derived analytics (memoized so chart arrays aren't rebuilt per render)
  const derived = useMemo(() => derive(data, categoryFilter, minAmount, maxAmount), [data, categoryFilter, minAmount, maxAmount])

  // Get original summary for comparison
  const originalSummary = useMemo(() => {
    if (!data) return null
    const { summary } = data
    const breakdown = summary?.breakdown || []
    const entryCount = breakdown.reduce((s, b) => s + b.count, 0)
    const from = new Date(summary.from)
    const to = new Date(summary.to)
    const msPerDay = 86400000
    const daysInRange = Math.max(1, Math.round((to - from) / msPerDay))

    return {
      total: summary.total,
      avgPerDay: Math.round(summary.total / daysInRange),
      avgPerEntry: entryCount > 0 ? Math.round(summary.total / entryCount) : 0,
      entryCount,
      categoryCount: breakdown.length,
    }
  }, [data])

  // Export data as CSV
  const exportData = () => {
    if (!data) return

    setExporting(true)

    try {
      // Create CSV content
      let csvContent = 'Date,Category,Amount,Note\n'

      // Add expense data
      data.expenses.forEach(expense => {
        const date = new Date(expense.occurredOn).toISOString().split('T')[0]
        const category = expense.category.replace(/,/g, '') // Remove commas
        const amount = expense.amount
        const note = (expense.note || '').replace(/,/g, '') // Remove commas
        csvContent += `${date},${category},${amount},"${note}"\n`
      })

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `expenses_${new Date().toISOString().slice(0, 10)}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="content content-wide">
      <div className="page-head">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 'var(--s-3)' }}>
          <h1>
            Analytics
            {(categoryFilter || minAmount || maxAmount) && (
              <span style={{ color: 'var(--accent)', fontSize: '0.8em', marginLeft: 'var(--s-2)' }}>
                (Filtered)
              </span>
            )}
          </h1>
          {data && formatWindow(data.summary.from, data.summary.to) && (
            <span className="meta num">{formatWindow(data.summary.from, data.summary.to)}</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--s-3)' }}>
          <DateRangeFilter />
          {data && !derived.empty && (
            <button
              className="btn btn-ghost"
              onClick={exportData}
              disabled={exporting}
              style={{ marginLeft: 'var(--s-3)', minWidth: '120px' }}
            >
              {exporting ? 'Exporting...' : 'Export Data'}
            </button>
          )}
        </div>

        {/* Filter controls */}
        {data && !derived.empty && (
          <div className="panel analytics-filters">
            {(categoryFilter || minAmount || maxAmount) && (
              <div style={{
                marginBottom: 'var(--s-3)',
                padding: 'var(--s-2) var(--s-3)',
                background: 'var(--paper-2)',
                borderLeft: '3px solid var(--accent)',
                fontSize: '0.8rem'
              }}>
                <strong>Active Filters:</strong>
                {categoryFilter && <span> Category: {categoryFilter}</span>}
                {minAmount && <span> Min Amount: ₹{minAmount}</span>}
                {maxAmount && <span> Max Amount: ₹{maxAmount}</span>}
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setCategoryFilter('')
                    setMinAmount('')
                    setMaxAmount('')
                  }}
                  style={{ marginLeft: 'var(--s-2)', fontSize: '0.7rem', padding: 'var(--s-1) var(--s-2)' }}
                >
                  Clear All
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s-3)' }}>
              <div className="field">
                <label htmlFor="category-filter">Category Filter</label>
                <select
                  id="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {data.summary.breakdown.map(b => (
                    <option key={b.category} value={b.category}>{b.category}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="min-amount">Min Amount</label>
                <input
                  id="min-amount"
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>

              <div className="field">
                <label htmlFor="max-amount">Max Amount</label>
                <input
                  id="max-amount"
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="Any"
                  min="0"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="skeleton" aria-label="Loading" style={{ marginTop: 'var(--s-5)' }}>
          <span /><span /><span /><span />
        </div>
      ) : error ? (
        <div className="error-banner" role="alert" style={{ marginTop: 'var(--s-5)' }}>
          <span>— {error} —</span>
          <button className="dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      ) : needsDates || !data ? (
        <div className="panel" style={{ marginTop: 'var(--s-5)' }}>
          <div className="panel-body">
            <div className="empty">Pick a From and To date to load analytics.</div>
          </div>
        </div>
      ) : derived.empty ? (
        <div className="panel" style={{ marginTop: 'var(--s-5)' }}>
          <div className="panel-body">
            <div className="empty">No expenses recorded in this range.</div>
          </div>
        </div>
      ) : (
        <AnalyticsBoard data={data} derived={derived} originalSummary={originalSummary} />
      )}
    </div>
  )
}

/* ----------------------------------------------------------------------- */
/* Board                                                                    */
/* ----------------------------------------------------------------------- */

function AnalyticsBoard({ data, derived, originalSummary }) {
  const { summary } = data
  const {
    kpis, daily, dow, topExpenses, breakdownSorted, budgetRows, capped, trendData,
  } = derived

  return (
    <>
      {/* KPI strip */}
      <div className="kpi-strip">
        <Kpi
          label="Total spent"
          value={fmtINR(kpis.total)}
          accent
          sub={kpis.deltaLabel}
          subTone={kpis.deltaTone}
          originalValue={originalSummary?.total}
        />
        <Kpi
          label="Avg / day"
          value={fmtINR(kpis.avgPerDay)}
          originalValue={originalSummary?.avgPerDay}
        />
        <Kpi
          label="Avg / entry"
          value={fmtINR(kpis.avgPerEntry)}
          originalValue={originalSummary?.avgPerEntry}
        />
        <Kpi
          label="Entries"
          value={kpis.entryCount}
          ink
          originalValue={originalSummary?.entryCount}
        />
        <Kpi
          label="Categories"
          value={kpis.categoryCount}
          ink
          originalValue={originalSummary?.categoryCount}
        />
        <Kpi
          label="Top category"
          value={kpis.topCategory}
          accent
          small
        />
        <Kpi
          label="Biggest single"
          value={fmtINR(kpis.biggestSingle)}
        />
        <Kpi
          label="Days in range"
          value={kpis.daysInRange}
          ink
        />
        <Kpi
          label="Entries per day"
          value={kpis.spendingVelocity}
          accent
        />
        <Kpi
          label="Spending consistency"
          value={`${(kpis.consistency * 100).toFixed(0)}%`}
          accent={kpis.consistency > 0.7}
          ink={kpis.consistency <= 0.7}
        />
      </div>

      {capped && (
        <div className="analytics-note">
          Showing the most recent 200 entries in this range — trend charts may undercount. Narrow the range for exact totals.
        </div>
      )}

      {/* Data summary */}
      <div className="panel" style={{ marginBottom: 'var(--s-3)' }}>
        <div className="panel-body">
          <div className="analytics-data-summary">
            <div>
              <div className="analytics-data-summary-label">PERIOD</div>
              <div className="analytics-data-summary-value">{formatWindow(summary.from, summary.to)}</div>
            </div>
            <div>
              <div className="analytics-data-summary-label">TOTAL SPENT</div>
              <div className="analytics-data-summary-value" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>
                {fmtINR(kpis.total)}
              </div>
            </div>
            <div>
              <div className="analytics-data-summary-label">CATEGORIES</div>
              <div className="analytics-data-summary-value">{kpis.categoryCount}</div>
            </div>
            <div>
              <div className="analytics-data-summary-label">ENTRIES</div>
              <div className="analytics-data-summary-value">{kpis.entryCount}</div>
            </div>
            <div>
              <div className="analytics-data-summary-label">CONSISTENCY</div>
              <div className="analytics-data-summary-value" style={{ color: kpis.consistency > 0.7 ? 'var(--accent)' : 'var(--ink)' }}>
                {(kpis.consistency * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trend prediction notice */}
      {trendData && trendData.trend !== 'stable' && (
        <div className="analytics-note" style={{ borderLeftColor: trendData.trend === 'increasing' ? 'var(--accent)' : 'var(--warn)' }}>
          Spending trend: {trendData.trend === 'increasing' ? '↑ Increasing' : '↓ Decreasing'} based on recent activity.
        </div>
      )}

      {/* Trend + distribution */}
      <div className="board-grid">
        <section className="panel col-8">
          <div className="panel-head">
            <h2>Daily spend trend</h2>
            <span className="meta">bars · daily &nbsp;|&nbsp; line · cumulative</span>
          </div>
          <div className="panel-body">
            <div className="chart-fixed chart-tall">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={[...daily, ...(trendData?.prediction || []).map((p, i) => ({
                  label: p.day,
                  spend: p.spend,
                  cumulative: daily[daily.length - 1]?.cumulative + p.spend * (i + 1)
                }))]} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tickFormatter={(value) => value.length > 4 ? value.substring(0, 4) + '…' : value}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={inr} width={64} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, n) => [inr(v), n === 'cumulative' ? 'Cumulative' : 'Spend']}
                    labelFormatter={(l) => l}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    name="spend"
                    fill="var(--accent)"
                    fillOpacity={0.18}
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="cumulative"
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  {/* Trend prediction line */}
                  {trendData?.prediction && (
                    <Line
                      type="monotone"
                      dataKey="spend"
                      name="prediction"
                      stroke="var(--ink-fade)"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {trendData && (
              <div className="trend-prediction">
                <div className="trend-prediction-header">
                  <strong>Trend Prediction (Next 7 Days)</strong>
                  <span>Total: {fmtINR(trendData.prediction.reduce((sum, p) => sum + p.spend, 0))}</span>
                </div>
                <div className="trend-prediction-grid">
                  {trendData.prediction.map((day, index) => (
                    <div key={index} className="trend-prediction-item">
                      <div className="trend-prediction-day">Day {index + 1}</div>
                      <div className="trend-prediction-amount">{fmtINR(day.spend)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 'var(--s-2)', fontSize: '0.75rem', color: 'var(--ink-fade)', textAlign: 'center' }}>
                  Based on {trendData.trend === 'increasing' ? 'increasing' : trendData.trend === 'decreasing' ? 'decreasing' : 'stable'} spending trend
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel col-4">
          <div className="panel-head"><h2>Category share</h2></div>
          <div className="panel-body">
            <div className="donut-wrap">
              <div className="chart-fixed chart-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdownSorted}
                      dataKey="total"
                      nameKey="category"
                      cx="50%" cy="50%"
                      innerRadius="58%" outerRadius="88%"
                      paddingAngle={1}
                      stroke="var(--paper-2)"
                      strokeWidth={2}
                    >
                      {breakdownSorted.map((b, i) => (
                        <Cell key={b.category} fill={colorFor(i)} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [inr(v), n]} />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="donut-center">
                <div className="donut-center-num num">{fmtINR(kpis.total)}</div>
                <div className="donut-center-sub">total</div>
              </div>
            </div>
          </div>
        </section>

        {/* Category bars + day-of-week */}
        <section className="panel col-7">
          <div className="panel-head"><h2>Spending by category</h2><span className="meta">vs prior period</span></div>
          <div className="panel-body">
            <div className="chart-fixed chart-medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={breakdownSorted}
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={inr} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={96} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [inr(v), 'Amount']} />
                  <Bar dataKey="total" name="Amount" radius={0}>
                    {breakdownSorted.map((b, i) => (
                      <Cell key={b.category} fill={colorFor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="panel col-5">
          <div className="panel-head"><h2>By day of week</h2></div>
          <div className="panel-body">
            <div className="chart-fixed chart-medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dow} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={inr} width={56} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [inr(v), 'Spend']} />
                  <Bar dataKey="total" name="Spend" radius={0}>
                    {dow.map((d, i) => (
                      <Cell
                        key={d.day}
                        fill={colorFor(i)}
                        opacity={d.total === Math.max(...dow.map(d => d.total)) ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {dow.some(d => d.total > 0) && (
              <div style={{ marginTop: 'var(--s-2)', fontSize: '0.75rem', color: 'var(--ink-fade)', textAlign: 'center' }}>
                Highest spending: {dow.reduce((max, d) => d.total > max.total ? d : max, dow[0]).day}
              </div>
            )}
          </div>
        </section>

        {/* Budget vs actual + top expenses */}
        <section className="panel col-6">
          <div className="panel-head">
            <h2>Budget vs actual</h2>
            {summary.totalOver && <span className="meta" style={{ color: 'var(--warn)' }}>over budget</span>}
          </div>
          <div className="panel-body">
            {budgetRows.length === 0 ? (
              <div className="empty">No budgets set for this period.</div>
            ) : (
              <ul className="analytics-budget">
                {budgetRows.map((b) => (
                  <li key={b.category} className={b.over ? 'over' : ''}>
                    <div className="ab-top">
                      <span className="ab-name">{b.category}</span>
                      <span className="ab-amt num">{fmtINR(b.total)} <span className="muted">/ {fmtINR(b.budget)}</span></span>
                    </div>
                    <div className="ab-bar">
                      <span className="ab-fill" style={{ width: `${Math.min(100, b.pctOfBudget)}%` }} />
                      {b.over && <span className="ab-over" style={{ width: `${Math.min(100, b.pctOfBudget - 100)}%` }} />}
                    </div>
                    <div className={'ab-status ' + (b.over ? 'over' : '')}>
                      {b.over ? `${fmtINR(b.total - b.budget)} over` : `${fmtINR(b.budget - b.total)} left · ${b.pctOfBudget}%`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel col-6">
          <div className="panel-head"><h2>Top expenses</h2><span className="meta">{topExpenses.length} shown</span></div>
          <div className="panel-body" style={{ padding: 0 }}>
            {topExpenses.length === 0 ? (
              <div className="empty">No entries.</div>
            ) : (
              <ul className="analytics-top">
                {topExpenses.map((e) => (
                  <li key={e.id}>
                    <span className="at-date num">{new Date(e.occurredOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    <span className="at-main">
                      <span className="at-cat">{e.category}</span>
                      {e.note && <span className="at-note">{e.note}</span>}
                    </span>
                    <span className="at-amt num">{fmtINR(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Category Velocity Chart */}
        {derived.categoryVelocity && derived.categoryVelocity.length > 0 && (
          <section className="panel col-6">
            <div className="panel-head">
              <h2>Category Frequency</h2>
              <span className="meta">entries per day</span>
            </div>
            <div className="panel-body">
              <div className="chart-fixed chart-medium">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={derived.categoryVelocity.slice(0, 10)}
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => {
                        if (name === 'velocity') return [value, 'Entries/day']
                        if (name === 'entries') return [value, 'Total entries']
                        if (name === 'total') return [inr(value), 'Total amount']
                        return [value, name]
                      }}
                    />
                    <Bar dataKey="velocity" name="Entries per day" radius={0}>
                      {derived.categoryVelocity.slice(0, 10).map((c, i) => (
                        <Cell key={c.category} fill={colorFor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* Full breakdown table */}
        <section className="panel col-12">
          <div className="panel-head"><h2>Category breakdown</h2></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="ta-right">Entries</th>
                  <th className="ta-right">Total</th>
                  <th className="ta-right">Avg / entry</th>
                  <th className="ta-right">Share</th>
                  <th>Share</th>
                  <th className="ta-right">vs prev</th>
                </tr>
              </thead>
              <tbody>
                {breakdownSorted.map((b, i) => (
                  <tr key={b.category}>
                    <td className="cell-name">
                      <span className="swatch" style={{ background: colorFor(i) }} />
                      {b.category}
                    </td>
                    <td className="ta-right num">{b.count}</td>
                    <td className="ta-right num strong">{fmtINR(b.total)}</td>
                    <td className="ta-right num">{fmtINR(Math.round(b.total / b.count))}</td>
                    <td className="ta-right num">{b.sharePct}%</td>
                    <td className="cell-share">
                      <span className="share-bar" style={{ width: `${b.sharePct}%`, background: colorFor(i) }} />
                    </td>
                    <td className={'ta-right num ' + deltaClass(b.diff)}>
                      {b.diff == null ? '—' : `${b.diff > 0 ? '+' : ''}${fmtINR(Math.abs(b.diff))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------------- */
/* Small pieces                                                            */
/* ----------------------------------------------------------------------- */

function Kpi({ label, value, accent, ink, small, sub, subTone, originalValue }) {
  return (
    <div className="panel kpi-card">
      <div className="panel-body">
        <div
          className="kpi"
          style={{
            fontSize: small ? '1.05rem' : '1.4rem',
            color: accent ? 'var(--accent)' : (ink ? 'var(--ink)' : 'var(--accent)'),
            lineHeight: 1.15,
          }}
        >
          {value}
        </div>
        <div className="kpi-sub">{label}</div>
        {sub && <div className={'kpi-delta ' + (subTone || '')}>{sub}</div>}
        {originalValue !== undefined && originalValue !== value && (
          <div className="kpi-delta" style={{ fontSize: '0.7rem', marginTop: 'var(--s-1)' }}>
            Original: {fmtINR(originalValue)}
          </div>
        )}
      </div>
    </div>
  )
}

function deltaClass(diff) {
  if (diff == null) return 'muted'
  if (diff > 0) return 'delta-up'
  if (diff < 0) return 'delta-down'
  return 'muted'
}

/* ----------------------------------------------------------------------- */
/* Derivation                                                              */
/* ----------------------------------------------------------------------- */

function derive(data, categoryFilter = '', minAmount = '', maxAmount = '') {
  if (!data) return { empty: true }
  const { summary, expenses: originalExpenses = [] } = data
  const breakdown = summary?.breakdown || []

  // Apply filters to expenses
  let expenses = [...originalExpenses]

  // Filter by category
  if (categoryFilter) {
    expenses = expenses.filter(e => e.category === categoryFilter)
  }

  // Filter by min amount
  if (minAmount !== '') {
    const min = parseFloat(minAmount)
    if (!isNaN(min)) {
      expenses = expenses.filter(e => e.amount >= min)
    }
  }

  // Filter by max amount
  if (maxAmount !== '') {
    const max = parseFloat(maxAmount)
    if (!isNaN(max)) {
      expenses = expenses.filter(e => e.amount <= max)
    }
  }

  if (!summary || summary.total === 0 && breakdown.length === 0) {
    return { empty: true }
  }

  const from = new Date(summary.from)
  const to = new Date(summary.to)
  const msPerDay = 86400000
  const daysInRange = Math.max(1, Math.round((to - from) / msPerDay))

  // Recalculate breakdown based on filtered expenses
  const breakdownMap = new Map()
  for (const e of expenses) {
    const current = breakdownMap.get(e.category) || { total: 0, count: 0 }
    breakdownMap.set(e.category, {
      total: current.total + e.amount,
      count: current.count + 1
    })
  }

  // Get original breakdown data for budget info
  const originalBreakdownMap = new Map()
  for (const b of breakdown) {
    originalBreakdownMap.set(b.category, b)
  }

  // Create new breakdown array with filtered data
  const filteredBreakdown = Array.from(breakdownMap.entries()).map(([category, data]) => {
    const original = originalBreakdownMap.get(category) || {}
    return {
      category,
      total: data.total,
      count: data.count,
      budget: original.budget,
      over: original.over,
      diff: original.diff
    }
  })

  const breakdownSorted = [...filteredBreakdown]
    .sort((a, b) => b.total - a.total)
    .map((b) => ({
      ...b,
      sharePct: summary.total > 0 ? Math.round((b.total / summary.total) * 1000) / 10 : 0,
    }))

  const entryCount = filteredBreakdown.reduce((s, b) => s + b.count, 0)
  const totalFiltered = filteredBreakdown.reduce((s, b) => s + b.total, 0)
  const topCategory = breakdownSorted[0]?.category || '—'
  const biggestSingle = expenses.reduce((m, e) => Math.max(m, e.amount), 0)

  // MoM delta line (keep original since it's period-based)
  const prevTotal = summary.previous?.total || 0
  const diff = totalFiltered - prevTotal
  const diffPct = summary.previous?.diffPercent
  let deltaLabel = ''
  let deltaTone = 'muted'
  if (prevTotal > 0) {
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→'
    deltaLabel = `${arrow} ${fmtINR(Math.abs(diff))} (${Math.abs(diffPct).toFixed(1)}%) vs prev`
    deltaTone = diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'muted'
  }

  // Daily series — fill every day in [from, to) so the x-axis is continuous.
  const byDay = new Map()
  for (const e of expenses) {
    const key = String(e.occurredOn).slice(0, 10) // UTC date, deterministic
    byDay.set(key, (byDay.get(key) || 0) + e.amount)
  }
  const daily = []
  let cum = 0
  for (let d = 0; d < daysInRange; d++) {
    const day = new Date(from.getTime() + d * msPerDay)
    const key = day.toISOString().slice(0, 10)
    const spend = byDay.get(key) || 0
    cum += spend
    daily.push({
      key,
      label: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      spend,
      cumulative: cum,
    })
  }

  // Day-of-week bucketing (Mon=0 … Sun=6)
  const dowBuckets = [0, 0, 0, 0, 0, 0, 0]
  for (const e of expenses) {
    const wd = new Date(e.occurredOn).getUTCDay() // 0=Sun
    const idx = (wd + 6) % 7 // convert to Mon=0
    dowBuckets[idx] += e.amount
  }
  const dow = DOW.map((day, i) => ({ day, total: dowBuckets[i] }))

  // Top expenses
  const topExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)

  // Category-wise spending velocity (entries per day by category)
  const categoryVelocity = new Map()
  const categoryDays = new Map()

  // Calculate days for each category
  for (const e of expenses) {
    if (!categoryDays.has(e.category)) {
      categoryDays.set(e.category, new Set())
    }
    const dateKey = String(e.occurredOn).slice(0, 10)
    categoryDays.get(e.category).add(dateKey)

    if (!categoryVelocity.has(e.category)) {
      categoryVelocity.set(e.category, 0)
    }
    categoryVelocity.set(e.category, categoryVelocity.get(e.category) + 1)
  }

  // Calculate velocity per category
  const categoryVelocityData = []
  for (const [category, count] of categoryVelocity) {
    const days = categoryDays.get(category).size
    const velocity = days > 0 ? (count / days).toFixed(1) : 0
    categoryVelocityData.push({
      category,
      entries: count,
      days,
      velocity: parseFloat(velocity),
      total: breakdownSorted.find(b => b.category === category)?.total || 0
    })
  }

  // Sort by velocity
  categoryVelocityData.sort((a, b) => b.velocity - a.velocity)

  // Budget rows (categories with a budget set this period)
  const budgetRows = breakdownSorted
    .filter((b) => b.budget != null && b.budget > 0)
    .map((b) => ({
      category: b.category,
      total: b.total,
      budget: b.budget,
      pctOfBudget: Math.round((b.total / b.budget) * 1000) / 10,
      over: b.over,
    }))

  // Calculate trend prediction (simple linear regression)
  const calculateTrend = (dailyData) => {
    if (dailyData.length < 2) return { slope: 0, prediction: 0 }

    // Simple linear regression: y = mx + b
    const n = dailyData.length
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

    dailyData.forEach((point, i) => {
      sumX += i
      sumY += point.spend
      sumXY += i * point.spend
      sumXX += i * i
    })

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Predict next 7 days
    const next7Days = []
    for (let i = 1; i <= 7; i++) {
      next7Days.push({
        spend: Math.max(0, Math.round(slope * (n + i - 1) + intercept)),
        day: `+${i}d`
      })
    }

    return {
      slope,
      prediction: next7Days,
      trend: slope > 10 ? 'increasing' : slope < -10 ? 'decreasing' : 'stable'
    }
  }

  const trendData = calculateTrend(daily)

  // Calculate spending velocity (entries per day)
  const spendingVelocity = daysInRange > 0 ? (entryCount / daysInRange).toFixed(1) : 0

  // Calculate spending consistency (standard deviation of daily spending)
  const dailyAmounts = daily.map(d => d.spend)
  const mean = dailyAmounts.reduce((a, b) => a + b, 0) / dailyAmounts.length
  const variance = dailyAmounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyAmounts.length
  const stdDev = Math.sqrt(variance)
  const consistency = mean > 0 ? (1 - stdDev / mean).toFixed(2) : 0

  const capped = expenses.length >= 200

  return {
    empty: false,
    capped,
    kpis: {
      total: totalFiltered,
      avgPerDay: Math.round(totalFiltered / daysInRange),
      avgPerEntry: entryCount > 0 ? Math.round(totalFiltered / entryCount) : 0,
      entryCount,
      categoryCount: filteredBreakdown.length,
      topCategory,
      biggestSingle,
      daysInRange,
      deltaLabel,
      deltaTone,
      spendingVelocity,
      consistency: parseFloat(consistency),
    },
    daily,
    dow,
    topExpenses,
    breakdownSorted,
    budgetRows,
    trendData,
    categoryVelocity: categoryVelocityData,
  }
}