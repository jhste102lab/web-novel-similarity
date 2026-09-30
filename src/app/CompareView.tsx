import { useMemo } from 'react'
import { charDiff } from '../engine/diff.ts'
import type { ChapterMatch, CompareResult, Passage, Tier } from '../shared/types.ts'
import { CopyButton, pairText } from './CopyButton.tsx'
import { Marked } from './Marked.tsx'
import { ResultsShell, Tab, type ViewProps } from './ResultsShell.tsx'
import {
  cappedNote,
  chapterLabel,
  filterMatches,
  firstLine,
  matchKey,
  ordinal,
  searchMatches,
  TIER_CLASS,
  TIER_LABEL,
  type CompareFilter,
} from './results.ts'

interface Props extends ViewProps<CompareResult, CompareFilter> {
  titleB: string
  rangeNote: string | null
}

/** A ↔ B results: one row per chapter pair, the detail pane shows its passages side by side. */
export function CompareView({
  result,
  titleA,
  titleB,
  rangeNote,
  filter,
  onFilter,
  query,
  onQuery,
  selected,
  onSelect,
  picked,
  onPick,
  running,
  stopped,
}: Props) {
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
      picked={picked}
      onPick={onPick}
      keyOf={matchKey}
      query={query}
      onQuery={onQuery}
      emptyText={query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 유사 문장이 없습니다.'}
      capped={cappedNote(result.matches.length, result.total)}
      running={running}
      stopped={stopped}
      stats={result.stats}
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
