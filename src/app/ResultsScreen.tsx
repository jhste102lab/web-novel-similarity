import { useMemo } from 'react'
import { charDiff } from '../engine/diff.ts'
import { Marked } from './Marked.tsx'
import type { CompareResult, Passage, RepeatGroup, RepeatResult, Tier } from '../shared/types.ts'
import {
  filterGroups,
  filterPassages,
  cappedNote,
  firstLine,
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

const Tag = () => <span className="tag">흔한 표현</span>

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
  const rows = filterPassages(result.passages, filter)
  const capped = cappedNote(result.passages.length, result.total)
  const count = (f: CompareFilter): number => filterPassages(result.passages, f).length
  const p = rows[selected] ?? rows[0]
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
      count={count(t)}
      onFilter={onFilter}
    />
  )
  return (
    <div className="results">
      <div className="bar-top">
        <div className="title">
          {titleA}
          <span>↔</span>
          {titleB}
          {rangeNote && <span className="rng">{rangeNote}</span>}
          {capped && <span className="rng">{capped}</span>}
        </div>
        <div className="tabs">
          <Tab cur={filter} value="all" label="전체" count={count('all')} onFilter={onFilter} />
          {tierTab('near')}
          {tierTab('edited')}
          {tierTab('partial')}
          <Tab
            cur={filter}
            value="common"
            label="흔한 표현"
            count={count('common')}
            onFilter={onFilter}
          />
        </div>
      </div>
      <div className="split">
        <div className="list">
          {rows.map((q, i) => (
            <div key={i} className={`item ${q === p ? 'on' : ''}`} onClick={() => onSelect(i)}>
              <i className={`dot ${TIER_CLASS[q.tier]}`} />
              <div className="b">
                <div className="pos">
                  <span style={{ color: 'inherit', margin: 0 }}>
                    {where(q.a)} ↔ {where(q.b)}
                    {q.common && <Tag />}
                  </span>
                  <span>{q.score}%</span>
                </div>
                <div className="ex">{firstLine(q.a)}</div>
              </div>
            </div>
          ))}
        </div>
        {p && <PassageDetail p={p} />}
      </div>
    </div>
  )
}

function PassageDetail({ p }: { p: Passage }) {
  const diff = useMemo(() => charDiff(p.a.text, p.b.text), [p])
  return (
    <div className="detail">
      <div className="head">
        <span className="pct">{p.score}%</span>
        <span className="tier">{TIER_LABEL[p.tier]}</span>
        {p.common && <Tag />}
        <span className="where">
          A {where(p.a)} · B {where(p.b)}
        </span>
      </div>
      <div className="cmp">
        <div className="pane">
          <div className="k">
            <b>A</b> {where(p.a)}
          </div>
          <Marked diff={diff} side="a" />
        </div>
        <div className="pane">
          <div className="k">
            <b>B</b> {where(p.b)}
          </div>
          <Marked diff={diff} side="b" />
        </div>
      </div>
    </div>
  )
}

export function RepeatView({ result, titleA, filter, onFilter, selected, onSelect }: RepeatProps) {
  const rows = filterGroups(result.groups, filter)
  const count = (f: RepeatFilter): number => filterGroups(result.groups, f).length
  const g = rows[selected] ?? rows[0]
  const capped = cappedNote(result.groups.length, result.total)
  const span = (q: RepeatGroup): string =>
    `${where(q.occurrences[0]!)}~${where(q.occurrences[q.occurrences.length - 1]!)}`
  return (
    <div className="results">
      <div className="bar-top">
        <div className="title">
          {titleA}
          <span>안에서 반복</span>
          {capped && <span className="rng">{capped}</span>}
        </div>
        <div className="tabs">
          <Tab cur={filter} value="all" label="전체" count={count('all')} onFilter={onFilter} />
          <Tab cur={filter} value={3} label="3회 이상" count={count(3)} onFilter={onFilter} />
          <Tab cur={filter} value={5} label="5회 이상" count={count(5)} onFilter={onFilter} />
          <Tab
            cur={filter}
            value="common"
            label="흔한 표현"
            count={count('common')}
            onFilter={onFilter}
          />
        </div>
      </div>
      <div className="split">
        <div className="list">
          {rows.map((q, i) => (
            <div key={i} className={`item ${q === g ? 'on' : ''}`} onClick={() => onSelect(i)}>
              <i className="dot t2" />
              <div className="b">
                <div className="pos">
                  <span style={{ color: 'inherit', margin: 0 }}>
                    {q.occurrences.length}회{q.common && <Tag />}
                  </span>
                  <span>{span(q)}</span>
                </div>
                <div className="ex">{q.text}</div>
              </div>
            </div>
          ))}
        </div>
        {g && (
          <div className="detail">
            <div className="head">
              <span className="pct">{g.occurrences.length}회</span>
              {g.common && <Tag />}
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
          </div>
        )}
      </div>
    </div>
  )
}
