import { useEffect, useState, useMemo } from 'react'
import { api, fmtINR } from '../api.js'
import DateRangeFilter from '../components/DateRangeFilter.jsx'
import { useDateRange } from '../hooks/useDateRange.js'

/// Admin Transactions — View and manage all transactions in a spreadsheet-like format
export default function AdminTransactions() {
  const { period, from, to, needsDates } = useDateRange()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTransactions, setSelectedTransactions] = useState(new Set())
  const [sortBy, setSortBy] = useState('occurredOn')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    if (needsDates) {
      setTransactions([])
      setLoading(false)
      return
    }
    loadTransactions()
  }, [period, from, to, needsDates])

  async function loadTransactions() {
    setLoading(true)
    setError(null)
    try {
      // Fetch transactions for the selected period
      const data = await api.listExpenses(period, 500, from, to)
      setTransactions(data)
      setSelectedTransactions(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Sorting function
  const sortedTransactions = useMemo(() => {
    if (!transactions) return []
    return [...transactions].sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'amount':
          aVal = a.amount
          bVal = b.amount
          break
        case 'category':
          aVal = a.category.toLowerCase()
          bVal = b.category.toLowerCase()
          break
        case 'note':
          aVal = (a.note || '').toLowerCase()
          bVal = (b.note || '').toLowerCase()
          break
        default:
          aVal = new Date(a.occurredOn)
          bVal = new Date(b.occurredOn)
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
  }, [transactions, sortBy, sortOrder])

  // Delete a single transaction
  async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return
    try {
      await api.deleteExpense(id)
      setTransactions(transactions.filter(t => t.id !== id))
      // Remove from selected if it was selected
      if (selectedTransactions.has(id)) {
        const newSelected = new Set(selectedTransactions)
        newSelected.delete(id)
        setSelectedTransactions(newSelected)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  // Delete selected transactions
  async function deleteSelectedTransactions() {
    if (selectedTransactions.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedTransactions.size} transaction(s)?`)) return

    try {
      // Delete all selected transactions
      const deletePromises = Array.from(selectedTransactions).map(id =>
        api.deleteExpense(id)
      )
      await Promise.all(deletePromises)

      // Remove deleted transactions from the list
      setTransactions(transactions.filter(t => !selectedTransactions.has(t.id)))
      setSelectedTransactions(new Set())
    } catch (e) {
      setError(e.message)
    }
  }

  // Select/deselect a transaction
  function toggleTransaction(id) {
    const newSelected = new Set(selectedTransactions)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedTransactions(newSelected)
  }

  // Select/deselect all transactions
  function toggleAll() {
    if (selectedTransactions.size === sortedTransactions.length) {
      setSelectedTransactions(new Set())
    } else {
      setSelectedTransactions(new Set(sortedTransactions.map(t => t.id)))
    }
  }

  // Format date for display
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="content content-wide">
      <div className="page-head">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 'var(--s-3)' }}>
          <h1>Admin - Transactions</h1>
          <span className="meta num">
            {sortedTransactions.length} transaction{sortedTransactions.length === 1 ? '' : 's'}
          </span>
        </div>
        <DateRangeFilter />
      </div>

      {error && (
        <div className="error-banner" role="alert" style={{ marginBottom: 'var(--s-4)' }}>
          <span>— {error} —</span>
          <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 'var(--s-4)' }}>
        <div className="panel-head">
          <h2>Transaction Management</h2>
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <button
              className="btn-ghost"
              onClick={loadTransactions}
              disabled={loading}
              style={{ fontSize: '0.75rem', padding: 'var(--s-2) var(--s-3)' }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            {selectedTransactions.size > 0 && (
              <button
                className="btn-danger"
                onClick={deleteSelectedTransactions}
                style={{ fontSize: '0.75rem', padding: 'var(--s-2) var(--s-3)' }}
              >
                Delete Selected ({selectedTransactions.size})
              </button>
            )}
          </div>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="skeleton" style={{ padding: 'var(--s-4)' }}>
              <span /><span /><span /><span />
            </div>
          ) : sortedTransactions.length === 0 ? (
            <div className="empty">
              {needsDates
                ? 'Select a date range to view transactions.'
                : 'No transactions found for the selected period.'}
            </div>
          ) : (
            <div className="scroll-table">
              <table className="cat-table" style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedTransactions.size === sortedTransactions.length && sortedTransactions.length > 0}
                        onChange={toggleAll}
                        aria-label="Select all transactions"
                      />
                    </th>
                    <th scope="col" onClick={() => {
                      setSortBy('occurredOn')
                      setSortOrder(sortBy === 'occurredOn' && sortOrder === 'desc' ? 'asc' : 'desc')
                    }} style={{ cursor: 'pointer' }}>
                      Date <span className="sort-indicator">{sortBy === 'occurredOn' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                    </th>
                    <th scope="col" onClick={() => {
                      setSortBy('category')
                      setSortOrder(sortBy === 'category' && sortOrder === 'asc' ? 'desc' : 'asc')
                    }} style={{ cursor: 'pointer' }}>
                      Category <span className="sort-indicator">{sortBy === 'category' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                    </th>
                    <th scope="col" onClick={() => {
                      setSortBy('note')
                      setSortOrder(sortBy === 'note' && sortOrder === 'asc' ? 'desc' : 'asc')
                    }} style={{ cursor: 'pointer' }}>
                      Note <span className="sort-indicator">{sortBy === 'note' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                    </th>
                    <th scope="col" className="col-count" onClick={() => {
                      setSortBy('amount')
                      setSortOrder(sortBy === 'amount' && sortOrder === 'asc' ? 'desc' : 'asc')
                    }} style={{ cursor: 'pointer', textAlign: 'right' }}>
                      Amount <span className="sort-indicator">{sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
                    </th>
                    <th scope="col" className="col-action" aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map(transaction => (
                    <tr
                      key={transaction.id}
                      className={selectedTransactions.has(transaction.id) ? 'selected-row' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTransactions.has(transaction.id)}
                          onChange={() => toggleTransaction(transaction.id)}
                          aria-label={`Select transaction for ${transaction.category} on ${formatDate(transaction.occurredOn)}`}
                        />
                      </td>
                      <td>{formatDate(transaction.occurredOn)}</td>
                      <td>{transaction.category}</td>
                      <td>{transaction.note || ''}</td>
                      <td className="col-count num" style={{ textAlign: 'right' }}>
                        {fmtINR(transaction.amount)}
                      </td>
                      <td className="col-action">
                        <button
                          className="btn-ghost del"
                          onClick={() => deleteTransaction(transaction.id)}
                          aria-label={`Delete transaction for ${transaction.category} on ${formatDate(transaction.occurredOn)}`}
                          style={{ width: 36, height: 36, margin: 0, fontSize: '0.95rem' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}