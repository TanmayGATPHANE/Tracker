// Bulk-import panel for the Admin page. Paste a JSON array, get a preview of
// what will happen, click once to commit. Server does the actual validation
// and dedup; this component mirrors that validation client-side so the preview
// matches what the server will do.

import { useMemo, useState } from 'react'
import { api, fmtINR } from '../api.js'
import { invalidateCategories } from '../hooks/useCategories.js'

const SAMPLE = `[
  { "amount": 402, "category": "Groceries", "date": "2026-06-22", "note": "Shree Lakshmi Super mart" },
  { "amount": 530, "category": "Groceries", "date": "2026-06-21", "note": "Zepto Marketplace" }
]`

/// Cheap validators — mirror the server's checks so the preview is accurate.
function validateRow(row, i) {
  if (row == null || typeof row !== 'object') return `row ${i}: not an object`
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0)
    return `row ${i}: amount must be > 0`
  if (typeof row.category !== 'string' || row.category.trim() === '')
    return `row ${i}: category is required`
  if (typeof row.date !== 'string' || row.date.trim() === '')
    return `row ${i}: date is required`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim()) || isNaN(new Date(row.date + 'T00:00:00Z').getTime()))
    return `row ${i}: invalid date "${row.date}"`
  return null
}

function parseAndValidate(text) {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'paste some JSON first' }

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e.message}` }
  }

  if (!Array.isArray(parsed))
    return { ok: false, error: 'expected a JSON array' }

  const rows = []
  for (let i = 0; i < parsed.length; i++) {
    const err = validateRow(parsed[i], i)
    if (err) {
      rows.push({ index: i, error: err, raw: parsed[i] })
    } else {
      rows.push({
        index: i,
        amount: Math.round(parsed[i].amount),
        originalAmount: parsed[i].amount,
        category: parsed[i].category.trim(),
        date: parsed[i].date.trim(),
        note: (parsed[i].note || '').trim() || null,
        raw: parsed[i],
      })
    }
  }

  const valid = rows.filter(r => !r.error)
  const errors = rows.filter(r => r.error)
  const distinctCats = [...new Set(valid.map(r => r.category))]
  const roundedCount = valid.filter(r => r.originalAmount !== r.amount).length

  return { ok: true, rows, valid, errors, distinctCats, roundedCount }
}

export default function ImportPanel() {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)  // result of parseAndValidate
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)    // server response
  const [importError, setImportError] = useState(null)

  const summary = useMemo(() => {
    if (!preview || !preview.ok) return null
    return {
      total: preview.rows.length,
      valid: preview.valid.length,
      errors: preview.errors.length,
      categories: preview.distinctCats.length,
      rounded: preview.roundedCount,
      totalAmount: preview.valid.reduce((s, r) => s + r.amount, 0),
    }
  }, [preview])

  function onPreview() {
    setResult(null)
    setImportError(null)
    setPreview(parseAndValidate(text))
  }

  async function onImport() {
    if (!preview || !preview.ok || preview.valid.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const rows = preview.valid.map(r => ({
        amount: r.amount,
        category: r.category,
        date: r.date,
        note: r.note,
      }))
      const resp = await api.importExpenses(rows)
      setResult(resp)
      // The categories cache is now stale — invalidate so other pages see new cats.
      invalidateCategories()
      if (resp.imported > 0) {
        // Clear the textarea on success, leaving a small "imported" banner.
        setText('')
        setPreview(null)
      }
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  function onClear() {
    setText('')
    setPreview(null)
    setResult(null)
    setImportError(null)
  }

  return (
    <section className="panel" aria-labelledby="import-h">
      <div className="panel-head">
        <h2 id="import-h">Bulk import</h2>
        <span className="meta">paste JSON</span>
      </div>
      <div className="panel-body">
        <p className="import-help">
          Paste a JSON array of <code>{'{ amount, category, date, note }'}</code> objects.
          Categories that don't exist will be created automatically. Duplicate
          rows (same amount + category + date + note) are skipped silently —
          safe to re-paste.
        </p>

        <textarea
          className="import-textarea"
          value={text}
          onChange={e => { setText(e.target.value); setResult(null); setPreview(null) }}
          placeholder={SAMPLE}
          rows={8}
          spellCheck={false}
          autoComplete="off"
          aria-label="JSON to import"
        />

        <div className="import-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onPreview}
            disabled={!text.trim() || importing}
          >
            Preview
          </button>
          <button
            type="button"
            className="btn"
            onClick={onImport}
            disabled={!preview || !preview.ok || preview.valid.length === 0 || importing}
            aria-keyshortcuts="Enter"
          >
            {importing
              ? 'Importing…'
              : preview && preview.ok && preview.valid.length > 0
                ? `Import ${preview.valid.length} ${preview.valid.length === 1 ? 'row' : 'rows'}`
                : 'Import'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClear}
            disabled={!text && !result}
          >
            Clear
          </button>
        </div>

        {importError && (
          <div className="error-banner" role="alert" style={{ marginTop: 'var(--s-4)' }}>
            <span>— {importError} —</span>
            <button className="dismiss" onClick={() => setImportError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {preview && !preview.ok && (
          <div className="import-error" role="alert">
            <strong>Cannot preview:</strong> {preview.error}
          </div>
        )}

        {preview && preview.ok && summary && (
          <div className="import-preview" aria-live="polite">
            <div className="import-summary">
              <SummaryCell label="rows"        value={summary.total} />
              <SummaryCell label="valid"       value={summary.valid} />
              <SummaryCell label="errors"      value={summary.errors} accent={summary.errors > 0 ? 'warn' : null} />
              <SummaryCell label="categories"  value={summary.categories} />
              <SummaryCell label="total"       value={fmtINR(summary.totalAmount)} />
            </div>
            {summary.rounded > 0 && (
              <div className="import-note">
                <span className="meta">—</span>
                {summary.rounded} {summary.rounded === 1 ? 'row' : 'rows'} had decimal amounts,
                rounded to nearest rupee.
              </div>
            )}
            {summary.errors > 0 && (
              <details className="import-errors">
                <summary>{summary.errors} {summary.errors === 1 ? 'row' : 'rows'} will be skipped</summary>
                <ul>
                  {preview.errors.map(r => (
                    <li key={r.index}><span className="num">#{r.index}</span> {r.error}</li>
                  ))}
                </ul>
              </details>
            )}
            <details className="import-rows">
              <summary>show first 10 rows</summary>
              <ul>
                {preview.valid.slice(0, 10).map(r => (
                  <li key={r.index}>
                    <span className="num">{r.date}</span>
                    {' · '}
                    <span className="cat-tag">{r.category}</span>
                    {' · '}
                    <span className="num">{fmtINR(r.amount)}</span>
                    {r.note && <span className="muted"> · {r.note}</span>}
                  </li>
                ))}
                {preview.valid.length > 10 && (
                  <li className="muted">… and {preview.valid.length - 10} more</li>
                )}
              </ul>
            </details>
          </div>
        )}

        {result && (
          <div className="import-result" role="status">
            <div className="import-summary">
              <SummaryCell label="imported" value={result.imported} accent="good" />
              <SummaryCell label="skipped"  value={result.skipped}  accent={result.skipped > 0 ? 'warn' : null} />
              <SummaryCell label="errors"   value={result.errors.length} accent={result.errors.length > 0 ? 'warn' : null} />
            </div>
            {result.errors.length > 0 && (
              <details className="import-errors" open>
                <summary>{result.errors.length} {result.errors.length === 1 ? 'error' : 'errors'} on import</summary>
                <ul>
                  {result.errors.map((e, i) => (
                    <li key={i}><span className="num">row {e.row}</span> · {e.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function SummaryCell({ label, value, accent }) {
  return (
    <div className={'import-cell' + (accent ? ' ' + accent : '')}>
      <div className="import-cell-label">{label}</div>
      <div className="import-cell-value num">{value}</div>
    </div>
  )
}