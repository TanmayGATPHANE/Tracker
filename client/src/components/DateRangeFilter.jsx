import { PERIODS, useDateRange } from '../hooks/useDateRange.js'

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
            <input
              id="range-from"
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)}
              className="date-input"
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="range-to">To</label>
            <input
              id="range-to"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              className="date-input"
            />
          </div>
        </div>
      )}
    </div>
  )
}