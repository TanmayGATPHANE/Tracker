import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

// The shared date range for the data pages (Dashboard / Analytics / History).
// One selection, shared across pages and persisted to localStorage so a reload
// — or navigating Dashboard → History → Analytics — keeps the same range.

export const PERIODS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last7Days', label: '7 days' },
  { value: 'custom', label: 'Custom' },
]

const STORAGE_KEY = 'ledgerDateRange'
const DEFAULT = { period: 'thisMonth', customFrom: '', customTo: '' }

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return DEFAULT
    return {
      period: PERIODS.some(p => p.value === v.period) ? v.period : DEFAULT.period,
      customFrom: typeof v.customFrom === 'string' ? v.customFrom : '',
      customTo: typeof v.customTo === 'string' ? v.customTo : '',
    }
  } catch {
    return DEFAULT
  }
}

const DateRangeContext = createContext(null)

export function DateRangeProvider({ children }) {
  const [{ period, customFrom, customTo }, setState] = useState(loadStored)

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, customFrom, customTo }))
    } catch {
      // ignore quota / privacy-mode failures
    }
  }, [period, customFrom, customTo])

  const setPeriod = (p) => setState(s => ({ ...s, period: p }))
  const setCustomFrom = (v) => setState(s => ({ ...s, customFrom: v }))
  const setCustomTo = (v) => setState(s => ({ ...s, customTo: v }))

  // The custom range is only "armed" when both dates are filled. `from`/`to`
  // are the API args — undefined for presets so the server uses its own
  // ResolvePeriod, and undefined for an incomplete custom selection so callers
  // can skip the fetch via `needsDates`.
  const needsDates = period === 'custom' && (!customFrom || !customTo)
  const from = period === 'custom' && !needsDates ? customFrom : undefined
  const to   = period === 'custom' && !needsDates ? customTo : undefined

  const value = useMemo(
    () => ({
      period, customFrom, customTo,
      setPeriod, setCustomFrom, setCustomTo,
      from, to, needsDates,
    }),
    [period, customFrom, customTo, from, to, needsDates]
  )

  return createElement(DateRangeContext.Provider, { value }, children)
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used inside <DateRangeProvider>')
  return ctx
}