import { useMemo, useState } from 'react'
import type { RepeatGroup, RepeatResult } from '../shared/types.ts'
import { Context, type AroundFn } from './CompareView.tsx'
import { CopyButton } from './CopyButton.tsx'
import { ResultsShell, Tab, type ViewProps } from './ResultsShell.tsx'
import {
  filterGroups,
  groupSpan,
  searchGroups,
  sortGroups,
  where,
  type RepeatFilter,
} from './results.ts'

/** A repeat group can occur hundreds of times; the detail pane lists the first ones until asked. */
const MAX_OCCURRENCES = 100

/** Repeats inside one manuscript: one row per recurring sentence, the detail pane lists where. */
export function RepeatView({
  result,
  titleA,
  around,
  filter,
  onFilter,
  query,
  onQuery,
  selected,
  onSelect,
  order,
  onOrder,
  running,
  stopped,
}: ViewProps<RepeatResult, RepeatFilter> & { around: AroundFn }) {
  const rows = useMemo(
    () => searchGroups(filterGroups(sortGroups(result.groups, order), filter), query),
    [result, filter, query, order],
  )
  const count = (f: RepeatFilter): number => filterGroups(result.groups, f).length
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
      order={order}
      onOrder={onOrder}
      scoreLabel="반복 많은 순"
      query={query}
      onQuery={onQuery}
      emptyText={query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 반복 문장이 없습니다.'}
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
              <span>{groupSpan(q)}</span>
            </div>
            <div className="ex">{q.text}</div>
          </div>
        </>
      )}
      renderDetail={(g) => <GroupDetail g={g} around={around} />}
    />
  )
}

function GroupDetail({ g, around }: { g: RepeatGroup; around: AroundFn }) {
  // The pane remounts per row, so every group opens collapsed.
  const [all, setAll] = useState(false)
  const shown = all ? g.occurrences : g.occurrences.slice(0, MAX_OCCURRENCES)
  const rest = g.occurrences.length - shown.length
  return (
    <>
      <div className="head">
        <span className="pct">{g.occurrences.length}회</span>
        <CopyButton a={g.text} />
        <span className="where">{groupSpan(g)}</span>
      </div>
      {shown.map((o, i) => {
        const at = around(o.start, o.end)
        return (
          <div key={i} className="occ">
            <span className="ch">{where(o)}</span>
            <span>
              <Context around={at}>
                <mark>{at.text}</mark>
              </Context>
            </span>
          </div>
        )
      })}
      {rest > 0 && (
        <button className="occ more" onClick={() => setAll(true)}>
          <span className="ch">…</span>
          <span>외 {rest.toLocaleString()}곳 더 보기</span>
        </button>
      )}
    </>
  )
}
