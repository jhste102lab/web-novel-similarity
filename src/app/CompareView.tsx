import { useMemo } from 'react'
import type { Around } from '../engine/context.ts'
import { charDiff } from '../engine/diff.ts'
import type { ChapterMatch, CompareResult, Passage, Tier } from '../shared/types.ts'
import { CopyButton, pairText } from './CopyButton.tsx'
import { Marked } from './Marked.tsx'
import { ResultsShell, Tab, type ViewProps } from './ResultsShell.tsx'
import {
  chapterLabel,
  filterMatches,
  firstLine,
  ordinal,
  searchMatches,
  sortMatches,
  TIER_CLASS,
  TIER_LABEL,
  type CompareFilter,
} from './results.ts'

export type AroundFn = (start: number, end: number) => Around
/** The file an engine-text offset came from. */
export type FileFn = (pos: number) => string

interface Props extends ViewProps<CompareResult, CompareFilter> {
  titleB: string
  rangeNote: string | null
  aroundA: AroundFn
  aroundB: AroundFn
  fileA: FileFn
  fileB: FileFn
}
/** A ↔ B results: one row per chapter pair, the detail pane shows its passages side by side. */
export function CompareView({
  result,
  titleA,
  titleB,
  rangeNote,
  aroundA,
  aroundB,
  fileA,
  fileB,
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
}: Props) {
  const rows = useMemo(
    () => searchMatches(filterMatches(sortMatches(result.matches, order), filter), query),
    [result, filter, query, order],
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
      order={order}
      onOrder={onOrder}
      scoreLabel="유사도순"
      query={query}
      onQuery={onQuery}
      emptyText={query ? '찾는 조건에 맞는 결과가 없습니다.' : '의심되는 유사 문장이 없습니다.'}
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
      renderDetail={(m) => (
        <MatchDetail m={m} aroundA={aroundA} aroundB={aroundB} fileA={fileA} fileB={fileB} />
      )}
    />
  )
}

function MatchDetail({
  m,
  aroundA,
  aroundB,
  fileA,
  fileB,
}: {
  m: ChapterMatch
  aroundA: AroundFn
  aroundB: AroundFn
  fileA: FileFn
  fileB: FileFn
}) {
  const first = m.passages[0]!
  return (
    <>
      <div className="head">
        <span className="pct files">
          A {fileA(first.a.start)} <span>↔</span> B {fileB(first.b.start)}
        </span>
        <span className="tier">{TIER_LABEL[m.tier]}</span>
        <span className="where">
          유사 문장 {m.count}개 · 구간 {m.runs}개
          {m.runs > m.passages.length && ` (상위 ${m.passages.length}개 표시)`}
        </span>
      </div>
      <div className="cmp chs">
        <div>{chapterLabel(m.a)}</div>
        <div>{chapterLabel(m.b)}</div>
      </div>
      {m.passages.map((p, i) => (
        <PassagePair
          key={i}
          p={p}
          aroundA={aroundA}
          aroundB={aroundB}
          fileA={fileA}
          fileB={fileB}
        />
      ))}
    </>
  )
}

function PassagePair({
  p,
  aroundA,
  aroundB,
  fileA,
  fileB,
}: {
  p: Passage
  aroundA: AroundFn
  aroundB: AroundFn
  fileA: FileFn
  fileB: FileFn
}) {
  const diff = useMemo(() => charDiff(p.a.text, p.b.text), [p])
  const a = aroundA(p.a.start, p.a.end)
  const b = aroundB(p.b.start, p.b.end)
  return (
    <div className="cmp">
      <div className="pane">
        <div className="k">
          <b>A</b> {fileA(p.a.start)} · {chapterLabel(p.a.chapter)} · {ordinal(p.a)}
          <CopyButton a={p.a.text} b={p.b.text} />
        </div>
        <Context around={a}>
          <Marked diff={diff} side="a" />
        </Context>
      </div>
      <div className="pane">
        <div className="k">
          <b>B</b> {fileB(p.b.start)} · {chapterLabel(p.b.chapter)} · {ordinal(p.b)}
        </div>
        <Context around={b}>
          <Marked diff={diff} side="b" />
        </Context>
      </div>
    </div>
  )
}

/** A finding between the sentences around it, which are dimmed and never marked. */
export function Context({ around, children }: { around: Around; children: React.ReactNode }) {
  return (
    <>
      {around.before && <span className="ctx">{around.before}</span>}
      {children}
      {around.after && <span className="ctx">{around.after}</span>}
    </>
  )
}
