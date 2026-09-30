import { useMemo } from 'react'
import type { Around } from '../engine/context.ts'
import { charDiff } from '../engine/diff.ts'
import type { PdfSide } from '../export/pdf.ts'
import type { ChapterMatch, CompareResult, Tier } from '../shared/types.ts'
import { blocksOf, type JoinFn } from './blocks.ts'
import { CopyButton, pairText } from './CopyButton.tsx'
import { Marked } from './Marked.tsx'
import { ResultsShell, Tab, type ViewProps } from './ResultsShell.tsx'
import {
  chapterLabel,
  filterMatches,
  firstLine,
  searchMatches,
  sortMatches,
  TIER_CLASS,
  TIER_LABEL,
  type CompareFilter,
  type FileFn,
} from './results.ts'

export type AroundFn = (start: number, end: number) => Around

interface Props extends ViewProps<CompareResult, CompareFilter> {
  titleB: string
  rangeNote: string | null
  joinA: JoinFn
  joinB: JoinFn
  fileA: FileFn
  fileB: FileFn
}
/** A ↔ B results: one row per chapter pair, the detail pane shows its findings side by side. */
export function CompareView({
  result,
  titleA,
  titleB,
  rangeNote,
  joinA,
  joinB,
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
        <MatchDetail m={m} joinA={joinA} joinB={joinB} fileA={fileA} fileB={fileB} />
      )}
    />
  )
}

function MatchDetail({
  m,
  joinA,
  joinB,
  fileA,
  fileB,
}: {
  m: ChapterMatch
  joinA: JoinFn
  joinB: JoinFn
  fileA: FileFn
  fileB: FileFn
}) {
  const first = m.passages[0]!
  const blocks = useMemo(
    () => blocksOf(m.passages, joinA, joinB, fileA, fileB),
    [m, joinA, joinB, fileA, fileB],
  )
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
      {blocks.map((rows, i) => (
        <div key={i} className="blk">
          {rows.map((r, j) => (
            <div key={j} className="cmp">
              <Stretch side={r.a} k="A" />
              <Stretch side={r.b} k="B" />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** One side's stretch: neighbours dimmed, each finding marked against the text it matched. */
function Stretch({ side, k }: { side: PdfSide; k: 'A' | 'B' }) {
  const found = side.pieces.filter((p) => typeof p.other === 'string')
  return (
    <div className="pane">
      <div className="k">
        <b>{k}</b> {side.label}
        {k === 'A' && (
          <CopyButton
            a={found.map((p) => p.text).join('\n')}
            b={found.map((p) => p.other).join('\n')}
          />
        )}
      </div>
      <div className="lnk">{side.link}</div>
      {side.pieces.map((p, i) =>
        typeof p.other === 'string' ? (
          <Marked
            key={i}
            diff={k === 'A' ? charDiff(p.text, p.other) : charDiff(p.other, p.text)}
            side={k === 'A' ? 'a' : 'b'}
          />
        ) : (
          <span key={i} className="ctx">
            {p.text}
          </span>
        ),
      )}
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
