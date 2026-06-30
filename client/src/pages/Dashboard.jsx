import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fmtINR } from '../api.js'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('thisMonth')

  useEffect(() => {
    loadDashboard()
  }, [period])

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getDashboard(period)
      setDashboardData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="content">
        <div className="skeleton" aria-label="Loading">
          <span /><span /><span /><span />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="content">
        <div className="error-banner" role="alert">
          <span>— {error} —</span>
          <button className="dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="content">
        <div className="empty">
          No dashboard data available.
        </div>
      </div>
    )
  }

  const { summary, entries, budgets } = dashboardData
  const budgetMap = Object.fromEntries(budgets.map(b => [b.category, b.amount]))

  // Calculate budget progress
  const budgetData = summary.breakdown
    .filter(item => budgetMap[item.Category])
    .map(item => {
      const budget = budgetMap[item.Category]
      const spent = item.Total
      const remaining = Math.max(0, budget - spent)
      const percent = Math.min(100, (spent / budget) * 100)
      const over = spent > budget
      return { category: item.Category, budget, spent, remaining, percent, over }
    })

  // Calculate key metrics
  const totalSpent = summary.total
  const categoryCount = summary.breakdown.length
  const entryCount = summary.breakdown.reduce((sum, b) => sum + b.count, 0)

  // Find top category
  const topCategory = summary.breakdown.length > 0
    ? summary.breakdown.reduce((max, b) => b.Total > max.Total ? b : max)
    : null

  // Prepare data for charts
  const chartData = summary.breakdown.map(item => ({
    name: item.Category,
    amount: item.Total,
    count: item.Count
  }))

  // Colors for charts
  const COLORS = ['#a8410e', '#c46431', '#d9cfb1', '#756650', '#4a3f2e', '#1a1611']

  // Month-over-month comparison
  const previousTotal = summary.previous?.Total || 0
  const diff = totalSpent - previousTotal
  const diffPercent = previousTotal > 0 ? ((diff / previousTotal) * 100) : 0
  const isIncrease = diff > 0

  return (
    <div className="content">
      <div className="panel-head" style={{ marginBottom: 'var(--s-4)' }}>
        <h1>Dashboard</h1>
      </div>

      {/* Period Selector */}
      <div className="period-toggle" style={{ marginBottom: 'var(--s-5)' }}>
        <button
          className={period === 'thisMonth' ? 'on' : ''}
          onClick={() => setPeriod('thisMonth')}
        >
          This month
        </button>
        <button
          className={period === 'lastMonth' ? 'on' : ''}
          onClick={() => setPeriod('lastMonth')}
        >
          Last month
        </button>
        <button
          className={period === 'last7Days' ? 'on' : ''}
          onClick={() => setPeriod('last7Days')}
        >
          7 days
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--s-4)',
        marginBottom: 'var(--s-5)'
      }}>
        <div className="panel">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem' }}>
              {fmtINR(totalSpent)}
            </div>
            <div className="kpi-sub">Total spent</div>
            {previousTotal > 0 && (
              <div style={{
                fontSize: '0.75rem',
                color: isIncrease ? 'var(--accent)' : 'var(--ink-fade)',
                marginTop: 'var(--s-2)'
              }}>
                {isIncrease ? '↑' : '↓'} {Math.abs(diffPercent).toFixed(1)}% vs last period
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--ink)' }}>
              {categoryCount}
            </div>
            <div className="kpi-sub">Categories</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body" style={{ textAlign: 'center' }}
>
            <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--ink)' }}>
              {entryCount}
            </div>
            <div className="kpi-sub">Entries</div>
          </div>
        </div>

        {topCategory && (
          <div className="panel">
            <div className="panel-body" style={{ textAlign: 'center' }}>
              <div className="kpi" style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>
                {topCategory.Category}
              </div>
              <div className="kpi-sub">Top category</div>
            </div>
          </div>
        )}
      </div>

      {/* Category Breakdown Charts */}
      <section className="panel">
        <div className="panel-head">
          <h2>Spending by Category</h2>
        </div>
        <div className="panel-body">
          {summary.breakdown.length === 0 ? (
            <div className="empty">
              No expenses in this period.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
              {/* Bar Chart */}
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--s-3)' }}>By Amount</h3>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`} />
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
                        labelFormatter={(value) => `Category: ${value}`}
                      />
                      <Bar dataKey="amount" name="Amount">
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie Chart */}
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--s-3)' }}>Distribution</h3>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="amount"
                        nameKey="name"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Budget Progress */}
      {budgetData.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Budget Progress</h2>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
              {budgetData.map((item, index) => (
                <div key={item.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
                    <span style={{ fontWeight: 600 }}>{item.category}</span>
                    <span>{fmtINR(item.spent)} of {fmtINR(item.budget)}</span>
                  </div>
                  <div style={{
                    height: '8px',
                    backgroundColor: 'var(--paper-edge)',
                    borderRadius: '0',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${item.percent}%`,
                        backgroundColor: item.over ? 'var(--warn)' : 'var(--accent)',
                        borderRadius: '0',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <div style={{
                    textAlign: 'right',
                    fontSize: '0.75rem',
                    color: item.over ? 'var(--warn)' : 'var(--ink-fade)',
                    marginTop: 'var(--s-1)'
                  }}>
                    {item.over ? `${fmtINR(item.spent - item.budget)} over budget` : `${fmtINR(item.remaining)} remaining`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Expenses */}
      <section className="panel">
        <div className="panel-head">
          <h2>Recent Expenses</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {entries.length === 0 ? (
            <div className="empty">
              No recent expenses.
            </div>
          ) : (
            <ul className="entries">
              {entries.slice(0, 5).map(e => (
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}