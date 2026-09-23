import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunStats } from '../shared/types.ts'
import { copyText } from './CopyButton.tsx'
import { Diagnostics, Shortcuts } from './Panels.tsx'

/** Props every result view takes from App. */
export interface ViewProps<R, F> {
  result: R
  titleA: string
  filter: F
  onFilter: (f: F) => void
  selected: number
  onSelect: (i: number) => void
  /** Findings are still streaming in from the worker. */
  running: boolean
  /** The user stopped the run, so the findings cover only part of the manuscript. */
  stopped: boolean
}

/** Row height in CSS pixels, fixed so the list can be windowed. Must match `.item` in styles/results.css. */
const ROW_H = 75
/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 6

export function Tab<F>({
  cur,
  value,
  label,
  count,
  onFilter,
}: {
  cur: F
  value: F
  label: React.ReactNode
  count: number
  onFilter: (f: F) => void
}) {
  return (
    <button
      className={`tab ${cur === value ? 'on' : ''}`}
      onClick={() => transition(() => onFilter(value))}
    >
      {label} <b>{count}</b>
    </button>
  )
}

/** Cross-fades the list when the whole set of rows is replaced. No-op where unsupported. */
function transition(change: () => void): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.startViewTransition) {
    change()
    return
  }
  document.startViewTransition(change)
}

interface ShellProps<T> {
  title: React.ReactNode
  tabs: React.ReactNode
  rows: T[]
  selected: number
  onSelect: (i: number) => void
  renderRow: (row: T) => React.ReactNode
  renderDetail: (row: T) => React.ReactNode
  /** Text `c` copies for the selected row. */
  copyOf: (row: T) => string
  query: string
  onQuery: (q: string) => void
  emptyText: string
  capped: string | null
  running: boolean
  stopped: boolean
  stats: RunStats
}

/**
 * Everything both result views share: windowed list, keyboard review, panels.
 * The two views differ only in what a row and a detail look like.
 */
export function ResultsShell<T>(p: ShellProps<T>) {
  const [diag, setDiag] = useState(false)
  const [keys, setKeys] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const find = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ from: 0, to: OVERSCAN * 4 })
  const row = p.rows[p.selected] ?? p.rows[0]

  const measure = useCallback((): void => {
    const el = list.current
    if (!el) return
    const from = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN)
    const to = Math.min(
      p.rows.length,
      Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + OVERSCAN,
    )
    setView((v) => (v.from === from && v.to === to ? v : { from, to }))
  }, [p.rows.length])
  useEffect(measure, [measure])
  useEffect(() => {
    // Keep the selected row visible without scrollIntoView: the row may not be rendered yet.
    const el = list.current
    if (!el) return
    const top = p.selected * ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + el.clientHeight)
      el.scrollTop = top + ROW_H - el.clientHeight
    measure()
  }, [p.selected, p.rows.length, measure])

  const flash = (text: string): void => {
    setToast(text)
    setTimeout(() => setToast(null), 1600)
  }
  const move = (to: number): void => p.onSelect(Math.min(p.rows.length - 1, Math.max(0, to)))
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.target === find.current) {
      if (e.key === 'Escape') {
        p.onQuery('')
        results.current?.focus()
      }
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key
    if (key === '/') {
      e.preventDefault()
      find.current?.focus()
      find.current?.select()
      return
    }
    if (key === 'Escape') {
      setKeys(false)
      setDiag(false)
      return
    }
    if (key === '?') return setKeys((v) => !v)
    if (key === 'd') return setDiag((v) => !v)
    if (key === 'c') {
      if (!row) return
      void copyText(p.copyOf(row)).then(() => flash('문장을 복사했어요'))
      return
    }
    const step = key === 'j' || key === 'ArrowDown' ? 1 : key === 'k' || key === 'ArrowUp' ? -1 : 0
    if (step !== 0) {
      e.preventDefault()
      return move(p.selected + step)
    }
    if (key === 'g' || key === 'Home') return move(0)
    if (key === 'G' || key === 'End') return move(p.rows.length - 1)
  }

  return (
    <div className="results" tabIndex={0} ref={results} onKeyDown={onKeyDown}>
      <div className="bar-top">
        <div className="title">
          {p.title}
          {p.capped && <span className="rng">{p.capped}</span>}
          {p.stopped && <span className="rng stop">중단됨 · 검사한 곳까지의 결과예요</span>}
        </div>
        <div className="tabs">
          <input
            ref={find}
            className="find"
            value={p.query}
            placeholder="회차·문장 찾기  /"
            spellCheck={false}
            onChange={(e) => p.onQuery(e.target.value)}
          />
          {p.tabs}
        </div>
      </div>
      <div className="split">
        {p.rows.length === 0 ? (
          <div className="empty-results">{p.running ? '찾는 중이에요…' : p.emptyText}</div>
        ) : (
          <>
            <div className="col">
              <div className="list" ref={list} onScroll={measure}>
                <div style={{ height: p.rows.length * ROW_H, position: 'relative' }}>
                  <div style={{ transform: `translateY(${view.from * ROW_H}px)` }}>
                    {p.rows.slice(view.from, view.to).map((r, i) => (
                      <div
                        key={view.from + i}
                        className={`item ${r === row ? 'on' : ''}`}
                        onClick={() => p.onSelect(view.from + i)}
                      >
                        {p.renderRow(r)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* key remounts the pane so a new selection starts at the top, not where the last one was scrolled. */}
            {row && (
              <div className="detail" key={p.rows.indexOf(row)}>
                {p.renderDetail(row)}
              </div>
            )}
          </>
        )}
      </div>
      {diag && <Diagnostics stats={p.stats} onClose={() => setDiag(false)} />}
      {keys && <Shortcuts onClose={() => setKeys(false)} />}
      {toast && <div className="toast">{toast}</div>}
      {!keys && (
        <button className="help" title="단축키" onClick={() => setKeys(true)}>
          ?
        </button>
      )}
    </div>
  )
}
