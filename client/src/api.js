// Thin fetch wrapper. All paths are relative to /api/* — in dev Vite proxies
// them to the .NET server, in prod VITE_API_URL rewrites the base.
const base = import.meta.env.VITE_API_URL || ''

// Listeners notified when auth state changes (login / logout / 401).
const authListeners = new Set()
export function onAuthChange(cb) {
  authListeners.add(cb)
  return () => authListeners.delete(cb)
}
function emitAuth() { for (const cb of authListeners) cb() }

export function getToken() {
  return localStorage.getItem('authToken')
}

export function logout() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('authUser')
  emitAuth()
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }

  // Attach JWT to every API call except login itself.
  if (path !== '/api/auth/login') {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(base + path, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  // 401 means the token is missing/expired — force a logout so the UI shows
  // the login page instead of failing silently.
  if (res.status === 401 && path !== '/api/auth/login') {
    logout()
    throw new Error('session expired — please sign in')
  }

  if (!res.ok) {
    let msg
    try {
      const j = await res.json()
      msg = j.error || j.message || `HTTP ${res.status}`
    } catch {
      msg = `HTTP ${res.status}`
    }
    throw new Error(msg)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Auth
  login:           (password) => request('/api/auth/login', { method: 'POST', body: { password } }),
  me:              () => request('/api/auth/me'),
  changePassword:  (currentPassword, newPassword) =>
    request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // Version (public — no auth required)
  getVersion:      () => request('/api/version'),

  // Expenses. `period` may be 'thisMonth' | 'lastMonth' | 'last7Days' | 'today' | 'custom'.
  // For 'custom', pass `from`/`to` as YYYY-MM-DD strings; the server treats `to`
  // as inclusive end-of-day. Omitting them keeps the preset behavior.
  listExpenses:   (period = 'thisMonth', limit = 50, from, to) =>
    request(`/api/expenses?period=${period}&limit=${limit}`
      + (from && to ? `&from=${from}&to=${to}` : '')),
  createExpense:  (body) =>
    request('/api/expenses', { method: 'POST', body }),
  deleteExpense:  (id) =>
    request(`/api/expenses/${id}`, { method: 'DELETE' }),
  importExpenses: (rows) =>
    request('/api/expenses/import', { method: 'POST', body: { rows } }),
  getSummary:     (period = 'thisMonth', from, to) =>
    request(`/api/expenses/summary?period=${period}`
      + (from && to ? `&from=${from}&to=${to}` : '')),

  // Dashboard — single round trip for everything the History and Admin pages
  // need to render. Cuts page load by ~4x vs fetching each endpoint separately.
  // `from`/`to` (YYYY-MM-DD) opt into a custom range; omit for presets.
  getDashboard:  (period = 'thisMonth', from, to) =>
    request(`/api/dashboard?period=${period}`
      + (from && to ? `&from=${from}&to=${to}` : '')),

  // Categories
  listCategories: () => request('/api/categories'),
  createCategory: (name) => request('/api/categories', { method: 'POST', body: { name } }),
  deleteCategory: (id)   => request(`/api/categories/${id}`, { method: 'DELETE' }),

  // Budgets
  listBudgets:    (yearMonth) => request(`/api/budgets?yearMonth=${yearMonth}`),
  upsertBudget:   (category, yearMonth, amount) =>
    request(`/api/budgets/${encodeURIComponent(category)}?yearMonth=${yearMonth}`,
            { method: 'PUT', body: { amount } }),
  deleteBudget:   (category, yearMonth) =>
    request(`/api/budgets/${encodeURIComponent(category)}?yearMonth=${yearMonth}`,
            { method: 'DELETE' }),

  // Recurring
  listRecurring:  () => request('/api/recurring'),
  createRecurring: (body) => request('/api/recurring', { method: 'POST', body }),
  deleteRecurring: (id) => request(`/api/recurring/${id}`, { method: 'DELETE' }),
  toggleRecurring: (id) => request(`/api/recurring/${id}/toggle`, { method: 'PATCH' }),
}

export const fmtINR = (n) =>
  '₹ ' + Number(n).toLocaleString('en-IN')

/// Format the half-open [from, to) window the server reports (summary.from /
/// summary.to) as an inclusive-day label, e.g. "01 Jun 2026 → 30 Jun 2026".
/// `to` is exclusive (the server queries OccurredOn < to), so the inclusive
/// last day is one tick before it. Returns '' if either bound is missing.
export function formatWindow(fromIso, toIso) {
  if (!fromIso || !toIso) return ''
  const f = new Date(fromIso)
  const inclEnd = new Date(new Date(toIso).getTime() - 1)
  if (isNaN(f.getTime()) || isNaN(inclEnd.getTime())) return ''
  const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(f)} → ${fmt(inclEnd)}`
}