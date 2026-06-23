import { useEffect, useId, useRef, useState } from 'react'

/**
 * Custom category picker. Replaces the native <select> so the open dropdown
 * matches the rest of the design system (paper/ink, sharp corners, mono).
 *
 * Keyboard:
 *   ArrowDown / ArrowUp — move highlight
 *   Enter / Space       — commit
 *   Home / End          — first / last
 *   Escape              — close without committing
 *   type-to-jump        — focus the first option whose label starts with the key
 *   Tab                 — close, return focus to the trigger
 */
export default function CategoryPicker({ value, options, onChange, autoFocus, id }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const generatedId = useId()
  const listId = id ? `${id}-list` : `${generatedId}-list`
  const labelId = id ? `${id}-label` : `${generatedId}-label`

  const currentIndex = Math.max(0, options.findIndex(o => o.value === value))

  useEffect(() => {
    if (open) {
      setHighlight(currentIndex)
      // focus the listbox so arrow keys work without a click
      requestAnimationFrame(() => listRef.current?.focus())
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (!triggerRef.current) return
      if (triggerRef.current.contains(e.target)) return
      if (listRef.current && listRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function commit(idx) {
    if (idx < 0 || idx >= options.length) return
    onChange(options[idx].value)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlight(h => Math.min(options.length - 1, h + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlight(h => Math.max(0, h - 1))
        break
      case 'Home':
        e.preventDefault()
        setHighlight(0)
        break
      case 'End':
        e.preventDefault()
        setHighlight(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        commit(highlight)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        // type-to-jump
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const ch = e.key.toLowerCase()
          const idx = options.findIndex(o => o.label.toLowerCase().startsWith(ch))
          if (idx >= 0) setHighlight(idx)
        }
    }
  }

  const current = options[currentIndex]

  return (
    <div className="picker">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={'picker-trigger' + (open ? ' open' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
      >
        <span className="picker-value">{current ? current.label : <span className="muted">Select…</span>}</span>
        <span className="picker-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="picker-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          onKeyDown={onKeyDown}
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={
                'picker-option'
                + (i === highlight ? ' highlight' : '')
                + (opt.value === value ? ' selected' : '')
              }
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(i)}
            >
              <span>{opt.label}</span>
              {opt.value === value && <span className="picker-tick" aria-hidden="true">●</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
