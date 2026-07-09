// Import expenses from a PhonePe statement PDF.
//
// Flow: pick a .pdf → extract text with pdf.js → parse debit rows → show an
// editable preview (include checkbox, date, amount, note, category dropdown) →
// on Import, POST the included rows to the existing /api/expenses/import
// endpoint (same one ImportPanel uses). No backend changes.
//
// Categories are pre-filled by a keyword heuristic (guessCategory) and are
// editable per-row. Import is blocked until every included row has a category,
// so we never silently file a transaction under a blank category.
//
// When no matching category is found, we provide smart suggestions based on
// the transaction note content.

import { useMemo, useRef, useState } from 'react'
import { api, fmtINR } from '../api.js'
import { useCategories, invalidateCategories } from '../hooks/useCategories.js'
import {
  extractTextFromPdf,
  parsePhonePeTransactions,
  guessCategory,
  suggestCategories,
} from '../utils/phonepeParse.js'

export default function ImportPdf() {
  const categories = useCategories()
  const catNames = useMemo(
    () => categories.map(c => (typeof c === 'string' ? c : c.name)),
    [categories],
  )

  // Common categories that users often need
  const commonCategories = ['Miscellaneous', 'Transfers', 'Other', 'Uncategorized', 'Services']

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null)        // editable preview rows, or null
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [warnings, setWarnings] = useState(null) // { count, samples }
  const [bulkCat, setBulkCat] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryCreationError, setCategoryCreationError] = useState(null)
  const fileRef = useRef(null)

  const summary = useMemo(() => {
    if (!rows) return null
    const included = rows.filter(r => r.include)
    const valid = included.filter(r => r.category && r.category.trim())
    const withSuggestions = included.filter(r => (!r.category || r.category === '') && r.suggestions && r.suggestions.length > 0)
    return {
      total: rows.length,
      included: included.length,
      unassigned: included.length - valid.length,
      withSuggestions: withSuggestions.length,
      totalAmount: valid.reduce((s, r) => s + r.amount, 0),
    }
  }, [rows])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    resetPreview()
    setFileName(file.name)
    setParsing(true)
    setParseError(null)
    try {
      const text = await extractTextFromPdf(file)
      const { rows: parsed, unparsedLines } = parsePhonePeTransactions(text)
      if (parsed.length === 0) {
        setParseError(
          unparsedLines.length > 0
            ? `Found ${unparsedLines.length} lines but no debit transactions. The parser likely needs tuning for this statement format.`
            : 'No transactions found. Is this a PhonePe statement PDF?',
        )
        setRows(null)
      } else {
        setRows(parsed.map((r, i) => {
          const guessedCategory = guessCategory(r.note, catNames)
          const suggestions = suggestCategories(r.note, categories)
          // Auto-select the first suggestion if there's only one and no category was guessed
          const category = guessedCategory || (suggestions.length === 1 ? suggestions[0] : '')
          return {
            id: i,
            date: r.date,
            amount: r.amount,
            note: r.note,
            category: category,
            suggestions: suggestions,
            include: true,
          }
        }))
        if (unparsedLines.length > 0) {
          setWarnings({
            count: unparsedLines.length,
            samples: unparsedLines.slice(0, 5),
          })
        }
      }
    } catch (err) {
      setParseError(`Could not read PDF: ${err.message || err}`)
    } finally {
      setParsing(false)
    }
  }

  function resetPreview() {
    setRows(null)
    setWarnings(null)
    setResult(null)
    setImportError(null)
    setBulkCat('')
  }

  function onClear() {
    setFileName('')
    setRows(null)
    setWarnings(null)
    setResult(null)
    setImportError(null)
    setParseError(null)
    setBulkCat('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function updateRow(id, patch) {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function applyBulk() {
    if (!bulkCat) return
    setRows(rs => rs.map(r => (r.include ? { ...r, category: bulkCat } : r)))
  }

  async function createCategory(name) {
    setCreatingCategory(true)
    setCategoryCreationError(null)
    try {
      await api.createCategory(name)
      invalidateCategories()
      // Update any rows that might benefit from the new category
      setRows(prevRows => {
        if (!prevRows) return prevRows
        return prevRows.map(row => {
          if ((!row.category || row.category === '') && row.suggestions && row.suggestions.includes(name)) {
            return { ...row, category: name }
          }
          return row
        })
      })
    } catch (e) {
      setCategoryCreationError(e.message)
    } finally {
      setCreatingCategory(false)
    }
  }

  async function onImport() {
    const included = rows.filter(r => r.include && r.category && r.category.trim())
    if (included.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const payload = included.map(r => ({
        amount: r.amount,
        category: r.category.trim(),
        date: r.date,
        note: r.note,
      }))
      const resp = await api.importExpenses(payload)
      setResult(resp)
      invalidateCategories()
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const canImport =
    !!summary && summary.included > 0 && summary.unassigned === 0 && !importing

  return (
    <section className="panel" aria-labelledby="import-pdf-h">
      <div className="panel-head">
        <h2 id="import-pdf-h">Import from PhonePe PDF</h2>
        <span className="meta">debits only</span>
      </div>
      <div className="panel-body">
        <p className="import-help">
          Upload a PhonePe statement PDF. Money you <em>sent</em> is extracted as
          expenses; received money is ignored. Categories are guessed from the
          merchant name — check and fix them in the preview before importing.
          Re-uploading the same PDF is safe (duplicates are skipped).
        </p>

        <div className="import-drop">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFile}
            disabled={parsing || importing}
            aria-label="Choose a PhonePe statement PDF"
          />
          {fileName && <span className="meta">Selected: {fileName}</span>}
          {!fileName && <span className="meta">No file chosen</span>}
        </div>

        <div className="import-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClear}
            disabled={!fileName && !rows}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn"
            onClick={onImport}
            disabled={!canImport}
            aria-keyshortcuts="Enter"
          >
            {importing
              ? 'Importing…'
              : summary && summary.included > 0
                ? `Import ${summary.included} ${summary.included === 1 ? 'row' : 'rows'}`
                : 'Import'}
          </button>
        </div>

        {parsing && <div className="import-note"><span className="meta">—</span> reading PDF…</div>}

        {parseError && (
          <div className="import-error" role="alert">
            <strong>Cannot preview:</strong> {parseError}
          </div>
        )}

        {importError && (
          <div className="error-banner" role="alert" style={{ marginTop: 'var(--s-4)' }}>
            <span>— {importError} —</span>
            <button className="dismiss" onClick={() => setImportError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {warnings && (
          <details className="import-errors">
            <summary>{warnings.count} line{warnings.count === 1 ? '' : 's'} could not be parsed</summary>
            <p className="muted" style={{ margin: 'var(--s-2) 0' }}>
              Parser may need tuning for this format. Sample lines:
            </p>
            <ul>
              {warnings.samples.map((l, i) => (
                <li key={i} className="muted">{l}</li>
              ))}
            </ul>
          </details>
        )}

        {summary && (
          <div className="import-preview" aria-live="polite">
            <div className="import-summary">
              <SummaryCell label="rows" value={summary.total} />
              <SummaryCell label="included" value={summary.included} />
              <SummaryCell
                label="unassigned"
                value={summary.unassigned}
                accent={summary.unassigned > 0 ? 'warn' : null}
              />
              <SummaryCell label="total" value={fmtINR(Math.round(summary.totalAmount))} />
            </div>
            {(summary.unassigned > 0 || summary.withSuggestions > 0) && (
              <div className="import-note">
                <span className="meta">—</span>
                {summary.unassigned > 0 && (
                  <span>
                    {summary.unassigned} row{summary.unassigned === 1 ? '' : 's'} need a category
                    before importing.
                  </span>
                )}
                {summary.unassigned > 0 && summary.withSuggestions > 0 && <br />}
                {summary.withSuggestions > 0 && (
                  <span>
                    {summary.withSuggestions} row{summary.withSuggestions === 1 ? '' : 's'} have smart suggestions.
                  </span>
                )}
              </div>
            )}

            {/* Show missing common categories with quick add buttons */}
            {categories && (
              <div style={{ margin: 'var(--s-3) 0' }}>
                {commonCategories.filter(cat => !catNames.includes(cat)).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    className="btn-ghost"
                    onClick={() => createCategory(cat)}
                    disabled={creatingCategory}
                    style={{
                      marginRight: 'var(--s-2)',
                      marginBottom: 'var(--s-2)',
                      fontSize: '0.75rem',
                      minHeight: '32px',
                      padding: '0 var(--s-3)'
                    }}
                  >
                    {creatingCategory ? `Adding ${cat}...` : `Add ${cat} category`}
                  </button>
                ))}
              </div>
            )}

            {categoryCreationError && (
              <div className="error-banner" role="alert" style={{ marginTop: 'var(--s-2)' }}>
                <span>— {categoryCreationError} —</span>
                <button
                  className="dismiss"
                  onClick={() => setCategoryCreationError(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            <div className="import-bulk">
              <select
                value={bulkCat}
                onChange={e => setBulkCat(e.target.value)}
                aria-label="Bulk category"
              >
                <option value="">Set all included to…</option>
                {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                {commonCategories.filter(cat => !catNames.includes(cat)).map(cat => (
                  <option key={cat} value={cat} disabled>
                    {cat} (add category first)
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost"
                onClick={applyBulk}
                disabled={!bulkCat}
              >
                Apply
              </button>
            </div>

            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th className="amt">Amount</th>
                    <th>Note</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.id}
                      className={!r.include ? 'excluded' : '' + ((!r.category || r.category === '') && r.suggestions && r.suggestions.length > 0 ? ' has-suggestions' : '')}
                      style={(!r.category || r.category === '') && r.suggestions && r.suggestions.length > 0 ? {
                        borderLeft: '2px solid var(--accent)',
                        paddingLeft: 'var(--s-1)'
                      } : {}}
                    >
                      <td className="chk">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={() => updateRow(r.id, { include: !r.include })}
                          aria-label={`Include ${r.date} ${r.note}`}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="date"
                          value={r.date}
                          onChange={e => updateRow(r.id, { date: e.target.value })}
                          className="date-input"
                          aria-label={`Date for ${r.note}`}
                        />
                      </td>
                      <td className="amt num">{fmtINR(r.amount)}</td>
                      <td className="note">{r.note}</td>
                      <td className="cat">
                        <div>
                          <select
                            value={r.category}
                            onChange={e => updateRow(r.id, { category: e.target.value })}
                            aria-label={`Category for ${r.note}`}
                            style={{ width: '100%' }}
                          >
                            <option value="">— pick —</option>
                            {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {(!r.category || r.category === '') && r.suggestions && r.suggestions.length > 0 && (
                            <div className="category-suggestions">
                              <span>Suggestions:</span>
                              {r.suggestions.slice(0, 3).map((suggestion, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => updateRow(r.id, { category: suggestion })}
                                  className="category-suggestion-btn"
                                  aria-label={`Use ${suggestion} category`}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="import-result" role="status">
            <div className="import-summary">
              <SummaryCell label="imported" value={result.imported} accent="good" />
              <SummaryCell label="skipped" value={result.skipped} accent={result.skipped > 0 ? 'warn' : null} />
              <SummaryCell label="errors" value={result.errors.length} accent={result.errors.length > 0 ? 'warn' : null} />
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