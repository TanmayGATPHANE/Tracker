import { PERIODS, useDateRange } from '../hooks/useDateRange.js'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

/// Shared period + custom-range selector. Reads and writes the shared
/// `useDateRange` context, so the selection is consistent across every page
/// that renders this. The precise queried window is surfaced by each page from
/// its API response — this component only owns the input controls.
export default function DateRangeFilter() {
  const {
    period, setPeriod,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
  } = useDateRange()

  // Convert string dates to Date objects for react-datepicker
  const fromDate = customFrom ? new Date(customFrom) : null
  const toDate = customTo ? new Date(customTo) : null

  return (
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

      {period === 'custom' && (
        <div className="custom-range" style={{
          display: 'flex',
          gap: 'var(--s-3)',
          alignItems: 'flex-end',
          marginLeft: 'var(--s-3)',
          padding: 'var(--s-2)',
          background: 'var(--paper)',
          border: '1px solid var(--rule)'
        }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="range-from">From</label>
            <div className="date-input-wrapper">
              <DatePicker
                id="range-from"
                selected={fromDate}
                onChange={(date) => {
                  if (date) {
                    // Format as YYYY-MM-DD
                    const formatted = date.toISOString().split('T')[0]
                    setCustomFrom(formatted)
                  } else {
                    setCustomFrom('')
                  }
                }}
                selectsStart
                startDate={fromDate}
                endDate={toDate}
                maxDate={toDate || undefined}
                placeholderText="DD/MM/YYYY"
                dateFormat="dd/MM/yyyy"
                className="date-input"
              />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="range-to">To</label>
            <div className="date-input-wrapper">
              <DatePicker
                id="range-to"
                selected={toDate}
                onChange={(date) => {
                  if (date) {
                    // Format as YYYY-MM-DD
                    const formatted = date.toISOString().split('T')[0]
                    setCustomTo(formatted)
                  } else {
                    setCustomTo('')
                  }
                }}
                selectsEnd
                startDate={fromDate}
                endDate={toDate}
                minDate={fromDate || undefined}
                placeholderText="DD/MM/YYYY"
                dateFormat="dd/MM/yyyy"
                className="date-input"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}