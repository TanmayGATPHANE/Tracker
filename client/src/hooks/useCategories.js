// Single shared categories cache. Every page that needs categories reads from
// the same promise; the actual network call happens once per page-load session.
//
// Why: AddExpense, History, and AdminCategories each independently called
// api.listCategories() in their useEffect — 3 round trips per session for the
// same data. On a Render free instance the cross-Atlantic latency is 800ms+,
// so this was a real UX cost.

import { useEffect, useState } from 'react'
import { api } from '../api.js'

let pending = null
let cache = null
const listeners = new Set()

function broadcast() {
  for (const l of listeners) l(cache)
}

async function load() {
  if (cache) return cache
  if (pending) return pending
  pending = api.listCategories()
    .then(c => { cache = c; pending = null; broadcast(); return c })
    .catch(e => { pending = null; throw e })
  return pending
}

/// Subscribe to the categories cache. Calls onChange with the current value
/// (or null while loading) and again whenever the cache updates.
export function useCategories() {
  const [cats, setCats] = useState(cache)
  useEffect(() => {
    const cb = (next) => setCats(next)
    listeners.add(cb)
    if (!cache) load().catch(() => { /* error already on the next call */ })
    return () => listeners.delete(cb)
  }, [])
  return cats ?? []
}

/// Invalidate the cache. Call after creating or deleting a category so other
/// pages see the change without a hard reload.
export function invalidateCategories() {
  cache = null
  load().catch(() => {})
}
