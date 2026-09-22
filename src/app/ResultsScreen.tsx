import { useEffect, useMemo, useRef, useState } from 'react'
import { charDiff } from '../engine/diff.ts'
import { Marked } from './Marked.tsx'
import type {
  ChapterMatch,
  CompareResult,
  Passage,
  RepeatGroup,
  RepeatResult,
  Tier,
} from '../shared/types.ts'
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
    <button className={`tab ${cur === value ? 'on' : ''}`} onClick={() => onFilter(value)}>
      {label} <b>{count}</b>
    </button>
  )
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="find"
      value={value}
      placeholder="회차·문장 찾기"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** ↑/↓ move the selection; the list scrolls the selected row into view. */
function useListNav(count: number, selected: number, onSelect: (i: number) => void) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Effects must return a cleanup function or nothing; scrollIntoView's value would be called.
    row.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || count === 0) return
    e.preventDefault()
    onSelect(Math.min(count - 1, Math.max(0, selected + step)))
  }
  return { row, onKeyDown }
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
      className="copy"
      onClick={() => {
        const text = b ? `A: ${a}\n\nB: ${b}` : a
        void copyText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? '복사됨' : '복사'}
    </button>
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
}: CompareProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () => searchMatches(filterMatches(result.matches, filter), query),
    [result, filter, query],
  )
  const capped = cappedNote(result.matches.length, result.total)
  const m = rows[selected] ?? rows[0]
  const nav = useListNav(rows.length, selected, onSelect)
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
    <div className="results" tabIndex={0} onKeyDown={nav.onKeyDown}>
      <div className="bar-top">
        <div className="title">
          {titleA}
          <span>↔</span>
          {titleB}
          {rangeNote && <span className="rng">{rangeNote}</span>}
          {capped && <span className="rng">{capped}</span>}
        </div>
        <div className="tabs">
          <Search value={query} onChange={setQuery} />
          <Tab
            cur={filter}
            value="all"
            label="전체"
            count={result.matches.length}
            onFilter={onFilter}
          />
          {tierTab('near')}
          {tierTab('edited')}
        </div>
      </div>
      <div className="split">
        {rows.length === 0 ? (
          <EmptyResults>
            {query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 유사 문장이 없습니다.'}
          </EmptyResults>
        ) : (
          <>
            <div className="list">
              {rows.map((q, i) => (
                <div
                  key={i}
                  ref={q === m ? nav.row : null}
                  className={`item ${q === m ? 'on' : ''}`}
                  onClick={() => onSelect(i)}
                >
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
                </div>
              ))}
            </div>
            {/* key remounts the pane so a new selection starts at the top, not where the last one was scrolled. */}
            {m && <MatchDetail key={rows.indexOf(m)} m={m} />}
          </>
        )}
      </div>
    </div>
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
    <div className="detail">
      <div className="head">
        <span className="pct">
          A {chapterLabel(m.a)} ↔ B {chapterLabel(m.b)}
        </span>
        <span className="tier">{TIER_LABEL[m.tier]}</span>
        <span className="where">
          유사 문장 {m.count}개
          {m.count > m.passages.length && ` · 상위 ${m.passages.length}개 표시`}
        </span>
      </div>
      {m.passages.map((p, i) => (
        <PassagePair key={i} p={p} />
      ))}
    </div>
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

export function RepeatView({ result, titleA, filter, onFilter, selected, onSelect }: RepeatProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () => searchGroups(filterGroups(result.groups, filter), query),
    [result, filter, query],
  )
  const count = (f: RepeatFilter): number => filterGroups(result.groups, f).length
  const g = rows[selected] ?? rows[0]
  const nav = useListNav(rows.length, selected, onSelect)
  const capped = cappedNote(result.groups.length, result.total)
  const span = (q: RepeatGroup): string =>
    `${where(q.occurrences[0]!)}~${where(q.occurrences[q.occurrences.length - 1]!)}`
  return (
    <div className="results" tabIndex={0} onKeyDown={nav.onKeyDown}>
      <div className="bar-top">
        <div className="title">
          {titleA}
          <span>안에서 반복</span>
          {capped && <span className="rng">{capped}</span>}
        </div>
        <div className="tabs">
          <Search value={query} onChange={setQuery} />
          <Tab cur={filter} value="all" label="전체" count={count('all')} onFilter={onFilter} />
          <Tab cur={filter} value={3} label="3회 이상" count={count(3)} onFilter={onFilter} />
          <Tab cur={filter} value={5} label="5회 이상" count={count(5)} onFilter={onFilter} />
        </div>
      </div>
      <div className="split">
        {rows.length === 0 ? (
          <EmptyResults>
            {query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 반복 문장이 없습니다.'}
          </EmptyResults>
        ) : (
          <>
            <div className="list">
              {rows.map((q, i) => (
                <div
                  key={i}
                  ref={q === g ? nav.row : null}
                  className={`item ${q === g ? 'on' : ''}`}
                  onClick={() => onSelect(i)}
                >
                  <i className="dot t2" />
                  <div className="b">
                    <div className="pos">
                      <span style={{ color: 'inherit', margin: 0 }}>{q.occurrences.length}회</span>
                      <span>{span(q)}</span>
                    </div>
                    <div className="ex">{q.text}</div>
                  </div>
                </div>
              ))}
            </div>
            {g && (
              <div className="detail" key={rows.indexOf(g)}>
                <div className="head">
                  <span className="pct">{g.occurrences.length}회</span>
                  <span className="where">{span(g)}</span>
                  <CopyButton a={g.text} />
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Groups whose sentence or chapter labels contain the query. */
function searchGroups(groups: RepeatGroup[], query: string): RepeatGroup[] {
  const q = query.trim()
  if (q === '') return groups
  return groups.filter((g) => g.text.includes(q) || g.occurrences.some((o) => where(o).includes(q)))
}
