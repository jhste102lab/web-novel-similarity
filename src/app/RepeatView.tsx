import { useMemo, useState } from 'react'
import type { RepeatGroup, RepeatResult } from '../shared/types.ts'
import { CopyButton } from './CopyButton.tsx'
import { ResultsShell, Tab, type ViewProps } from './ResultsShell.tsx'
import { cappedNote, filterGroups, where, type RepeatFilter } from './results.ts'

/** A repeat group can occur hundreds of times; the detail pane lists only the first ones. */
const MAX_OCCURRENCES = 100

/** Repeats inside one manuscript: one row per recurring sentence, the detail pane lists where. */
export function RepeatView({
  result,
  titleA,
  filter,
  onFilter,
  selected,
  onSelect,
  running,
  stopped,
}: ViewProps<RepeatResult, RepeatFilter>) {
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
