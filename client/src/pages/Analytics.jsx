import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fmtINR } from '../api.js'

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setLoading(true)
    setError(null)
    try {
      // For now, we'll use the dashboard data as a starting point
      const dashboardData = await api.getDashboard('thisMonth')
      setData(dashboardData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="content">
        <div className="panel-head" style={{ marginBottom: 'var(--s-4)' }}>
          <h1>Analytics</h1>
        </div>
        <div className="skeleton" aria-label="Loading">
          <span /><span /><span /><span />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="content">
        <div className="panel-head" style={{ marginBottom: 'var(--s-4)' }}>
          <h1>Analytics</h1>
        </div>
        <div className="error-banner" role="alert">
          <span>— {error} —</span>
          <button className="dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="panel-head" style={{ marginBottom: 'var(--s-4)' }}>
        <h1>Analytics</h1>
      </div>

      <div className="panel">
        <div className="panel-body">
          <div className="empty">
            <div style={{ textAlign: 'center', marginBottom: 'var(--s-4)' }}>
              <h2 style={{ marginBottom: 'var(--s-3)' }}>Advanced Analytics Coming Soon</h2>
              <p style={{ color: 'var(--ink-fade)', marginBottom: 'var(--s-4)' }}>
                This page will feature detailed spending trends, category analysis, and budget insights.
              </p>
            </div>

            {data && (
              <div>
                <h3 style={{ textAlign: 'center', marginBottom: 'var(--s-3)' }}>Current Month Summary</h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 'var(--s-4)',
                  marginBottom: 'var(--s-4)'
                }}>
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-body" style={{ textAlign: 'center' }}>
                      <div className="kpi" style={{ fontSize: '1.25rem' }}>
                        {fmtINR(data.summary.total)}
                      </div>
                      <div className="kpi-sub">Total Spent</div>
                    </div>
                  </div>

                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-body" style={{ textAlign: 'center' }}>
                      <div className="kpi" style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>
                        {data.summary.breakdown.length}
                      </div>
                      <div className="kpi-sub">Categories</div>
                    </div>
                  </div>

                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panel-body" style={{ textAlign: 'center' }}>
                      <div className="kpi" style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>
                        {data.entries.length}
                      </div>
                      <div className="kpi-sub">Entries</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}