import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { charDiff } from '../engine/diff.ts'
import type {
  ChapterMatch,
  CompareResult,
  Grid,
  GridCell,
  Passage,
  RepeatGroup,
  RepeatResult,
  RunStats,
  Tier,
} from '../shared/types.ts'
import { Dotplot } from './Dotplot.tsx'
import { Marked } from './Marked.tsx'
import { Diagnostics, Shortcuts } from './Panels.tsx'
import {
  cappedNote,
  chapterLabel,
  filterGroups,
  filterMatches,
  firstLine,
  ordinal,
  TIER_CLASS,
  TIER_LABEL,
  where,
  type CompareFilter,
  type RepeatFilter,
} from './results.ts'

interface Common {
  titleA: string
  selected: number
  onSelect: (i: number) => void
  /** Findings are still streaming in from the worker. */
  running: boolean
  /** The user stopped the run, so the findings cover only part of the manuscript. */
  stopped: boolean
}

interface CompareProps extends Common {
  result: CompareResult
  titleB: string
  rangeNote: string | null
  filter: CompareFilter
  onFilter: (f: CompareFilter) => void
}

interface RepeatProps extends Common {
  result: RepeatResult
  filter: RepeatFilter
  onFilter: (f: RepeatFilter) => void
}

/** A repeat group can occur hundreds of times; the detail pane lists only the first ones. */
const MAX_OCCURRENCES = 100

/** Row height in CSS pixels, fixed so the list can be windowed. Must match `.item` in styles.css. */
const ROW_H = 75
/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 6

function Tab<F>({
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

/** navigator.clipboard is undefined on plain-http origins (LAN/Tailscale), so fall back to execCommand. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

function CopyButton({ a, b }: { a: string; b?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`copy ${done ? 'done' : ''}`}
      onClick={() => {
        void copyText(pairText(a, b)).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? '✓ 복사 완료' : '문장 복사'}
    </button>
  )
}

function pairText(a: string, b?: string): string {
  return b ? `A: ${a}\n\nB: ${b}` : a
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
  grid: Grid | null
  axis: [string, string]
  /** Chapter pair of the selected row, for the dotplot crosshair. */
  cursorOf: (row: T) => { a: number | null; b: number | null } | null
  /** Row index for a dotplot cell, or -1 when that pair is below the result cap. */
  rowOfCell: (cell: GridCell) => number
}

/**
 * Everything both result views share: windowed list, keyboard review, dotplot, panels.
 * The two views differ only in what a row and a detail look like.
 */
function ResultsShell<T>(p: ShellProps<T>) {
  const [map, setMap] = useState(false)
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
    if (key === 'm') return setMap((v) => !v)
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
          {p.grid && (
            <button
              className={`tab ${map ? 'on' : ''}`}
              title="회차 지도 (m)"
              onClick={() => setMap((v) => !v)}
            >
              지도
            </button>
          )}
        </div>
      </div>
      <div className="split">
        {p.rows.length === 0 ? (
          <EmptyResults>{p.running ? '찾는 중이에요…' : p.emptyText}</EmptyResults>
        ) : (
          <>
            <div className="col">
              {map && p.grid && (
                <Dotplot
                  grid={p.grid}
                  axis={p.axis}
                  cursor={row ? p.cursorOf(row) : null}
                  onPick={(cell) => {
                    const i = p.rowOfCell(cell)
                    if (i >= 0) p.onSelect(i)
                    // The map covers every chapter pair; the list is capped and filtered.
                    else flash('이 회차쌍은 지금 목록에 없어요')
                  }}
                />
              )}
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

export function CompareView({
  result,
  titleA,
  titleB,
  rangeNote,
  filter,
  onFilter,
  selected,
  onSelect,
  running,
  stopped,
}: CompareProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () => searchMatches(filterMatches(result.matches, filter), query),
    [result, filter, query],
  )
  const tierTab = (t: Tier) => (
    <Tab
      cur={filter}
      value={t}
      label={
        <>
          <i className={`dot ${TIER_CLASS[t]}`} />
          {TIER_LABEL[t]}
        </>
      }
      count={filterMatches(result.matches, t).length}
      onFilter={onFilter}
    />
  )
  return (
    <ResultsShell
      title={
        <>
          {titleA}
          <span>↔</span>
          {titleB}
          {rangeNote && <span className="rng">{rangeNote}</span>}
        </>
      }
      tabs={
        <>
          <Tab
            cur={filter}
            value="all"
            label="전체"
            count={result.matches.length}
            onFilter={onFilter}
          />
          {tierTab('near')}
          {tierTab('edited')}
        </>
      }
      rows={rows}
      selected={selected}
      onSelect={onSelect}
      query={query}
      onQuery={setQuery}
      emptyText={query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 유사 문장이 없습니다.'}
      capped={cappedNote(result.matches.length, result.total)}
      running={running}
      stopped={stopped}
      stats={result.stats}
      grid={result.grid}
      axis={['A', 'B']}
      cursorOf={(m) => ({ a: m.a, b: m.b })}
      rowOfCell={(cell) => rows.findIndex((m) => m.a === cell.a && m.b === cell.b)}
      copyOf={(m) => pairText(m.passages[0]!.a.text, m.passages[0]!.b.text)}
      renderRow={(q) => (
        <>
          <i className={`dot ${TIER_CLASS[q.tier]}`} />
          <div className="b">
            <div className="pos">
              <span style={{ color: 'inherit', margin: 0 }}>
                A {chapterLabel(q.a)} ↔ B {chapterLabel(q.b)}
              </span>
              <span>유사 문장 {q.count}개</span>
            </div>
            <div className="ex">{firstLine(q.passages[0]!.a)}</div>
          </div>
        </>
      )}
      renderDetail={(m) => <MatchDetail m={m} />}
    />
  )
}

/** Matches whose chapter labels or passage text contain the query. */
function searchMatches(matches: ChapterMatch[], query: string): ChapterMatch[] {
  const q = query.trim()
  if (q === '') return matches
  return matches.filter(
    (m) =>
      `${chapterLabel(m.a)} ${chapterLabel(m.b)}`.includes(q) ||
      m.passages.some((p) => p.a.text.includes(q) || p.b.text.includes(q)),
  )
}

function EmptyResults({ children }: { children: React.ReactNode }) {
  return <div className="empty-results">{children}</div>
}

function MatchDetail({ m }: { m: ChapterMatch }) {
  return (
    <>
      <div className="head">
        <span className="pct">
          A {chapterLabel(m.a)} ↔ B {chapterLabel(m.b)}
        </span>
        <span className="tier">{TIER_LABEL[m.tier]}</span>
        <span className="where">
          유사 문장 {m.count}개 · 구간 {m.runs}개
          {m.runs > m.passages.length && ` (상위 ${m.passages.length}개 표시)`}
        </span>
      </div>
      {m.passages.map((p, i) => (
        <PassagePair key={i} p={p} />
      ))}
    </>
  )
}

function PassagePair({ p }: { p: Passage }) {
  const diff = useMemo(() => charDiff(p.a.text, p.b.text), [p])
  return (
    <div className="cmp">
      <div className="pane">
        <div className="k">
          <b>A</b> {ordinal(p.a)}
          <CopyButton a={p.a.text} b={p.b.text} />
        </div>
        <Marked diff={diff} side="a" />
      </div>
      <div className="pane">
        <div className="k">
          <b>B</b> {ordinal(p.b)}
        </div>
        <Marked diff={diff} side="b" />
      </div>
    </div>
  )
}

export function RepeatView({
  result,
  titleA,
  filter,
  onFilter,
  selected,
  onSelect,
  running,
  stopped,
}: RepeatProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () => searchGroups(filterGroups(result.groups, filter), query),
    [result, filter, query],
  )
  const count = (f: RepeatFilter): number => filterGroups(result.groups, f).length
  const span = (q: RepeatGroup): string =>
    `${where(q.occurrences[0]!)}~${where(q.occurrences[q.occurrences.length - 1]!)}`
  return (
    <ResultsShell
      title={
        <>
          {titleA}
          <span>안에서 반복</span>
        </>
      }
      tabs={
        <>
          <Tab cur={filter} value="all" label="전체" count={count('all')} onFilter={onFilter} />
          <Tab cur={filter} value={3} label="3회 이상" count={count(3)} onFilter={onFilter} />
          <Tab cur={filter} value={5} label="5회 이상" count={count(5)} onFilter={onFilter} />
        </>
      }
      rows={rows}
      selected={selected}
      onSelect={onSelect}
      query={query}
      onQuery={setQuery}
      emptyText={query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 반복 문장이 없습니다.'}
      capped={cappedNote(result.groups.length, result.total)}
      running={running}
      stopped={stopped}
      stats={result.stats}
      grid={result.grid}
      axis={['회차', '회차']}
      cursorOf={(g) => ({
        a: g.occurrences[0]!.chapter,
        b: g.occurrences[g.occurrences.length - 1]!.chapter,
      })}
      rowOfCell={(cell) =>
        rows.findIndex((g) => {
          const chapters = new Set(g.occurrences.map((o) => o.chapter))
          return chapters.has(cell.a) && chapters.has(cell.b)
        })
      }
      copyOf={(g) => g.text}
      renderRow={(q) => (
        <>
          <i className="dot t2" />
          <div className="b">
            <div className="pos">
              <span style={{ color: 'inherit', margin: 0 }}>{q.occurrences.length}회</span>
              <span>{span(q)}</span>
            </div>
            <div className="ex">{q.text}</div>
          </div>
        </>
      )}
      renderDetail={(g) => (
        <>
          <div className="head">
            <span className="pct">{g.occurrences.length}회</span>
            <CopyButton a={g.text} />
            <span className="where">{span(g)}</span>
          </div>
          {g.occurrences.slice(0, MAX_OCCURRENCES).map((o, i) => (
            <div key={i} className="occ">
              <span className="ch">{where(o)}</span>
              <span>{g.text}</span>
            </div>
          ))}
          {g.occurrences.length > MAX_OCCURRENCES && (
            <div className="occ">
              <span className="ch">…</span>
              <span>외 {(g.occurrences.length - MAX_OCCURRENCES).toLocaleString()}곳</span>
            </div>
          )}
        </>
      )}
    />
  )
}

/** Repeat groups whose text or chapter labels contain the query. */
function searchGroups(groups: RepeatGroup[], query: string): RepeatGroup[] {
  const q = query.trim()
  if (q === '') return groups
  return groups.filter((g) => g.text.includes(q) || g.occurrences.some((o) => where(o).includes(q)))
}
