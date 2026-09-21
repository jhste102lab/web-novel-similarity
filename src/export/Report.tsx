import { useMemo } from 'react'
import { charDiff } from '../engine/diff.ts'
import { Marked } from '../app/Marked.tsx'
import { TIER_CLASS, TIER_LABEL, where } from '../app/results.ts'
import type { Passage, RepeatGroup } from '../shared/types.ts'

export interface ReportMeta {
  date: string
  a: string
  b?: string
}

interface CompareReportProps {
  meta: ReportMeta
  all: Passage[]
  rows: Passage[]
}

interface RepeatReportProps {
  meta: ReportMeta
  all: RepeatGroup[]
  rows: RepeatGroup[]
}

const FOOT = '문자 유사도 기반 참고 자료'

function Meta({ meta }: { meta: ReportMeta }) {
  return (
    <div className="meta">
      <span>비교 날짜</span>
      <span>{meta.date}</span>
      <span>A</span>
      <span>{meta.a}</span>
      {meta.b && (
        <>
          <span>B</span>
          <span>{meta.b}</span>
        </>
      )}
    </div>
  )
}

export function CompareReport({ meta, all, rows }: CompareReportProps) {
  const n = (t: Passage['tier']): number => all.filter((p) => p.tier === t && !p.common).length
  return (
    <div className="rp">
      <h1>유사도 검사 결과</h1>
      <Meta meta={meta} />
      <div className="nums">
        <div>
          유사 구간<b>{all.filter((p) => !p.common).length}</b>
        </div>
        <div>
          거의 동일<b>{n('near')}</b>
        </div>
        <div>
          일부 수정<b>{n('edited')}</b>
        </div>
        <div>
          부분 유사<b>{n('partial')}</b>
        </div>
      </div>
      {rows.map((q, i) => (
        <PassageRow key={i} q={q} />
      ))}
      <div className="foot">{FOOT}</div>
    </div>
  )
}

// ponytail: the LCS table is O(n·m); long passages in a 500-row report are shown unmarked.
const MAX_DIFF_CELLS = 250_000

/** Marked A and B nodes for report rows; very long passages are returned unmarked. */
function useMarkedPair(a: string, b: string): [React.ReactNode, React.ReactNode] {
  const diff = useMemo(
    () => (a.length * b.length <= MAX_DIFF_CELLS ? charDiff(a, b) : null),
    [a, b],
  )
  return diff
    ? [<Marked key="a" diff={diff} side="a" />, <Marked key="b" diff={diff} side="b" />]
    : [a, b]
}

function PassageRow({ q }: { q: Passage }) {
  const [a, b] = useMarkedPair(q.a.text, q.b.text)
  return (
    <div className="row">
      <div className="h">
        <i className={`dot ${TIER_CLASS[q.tier]}`} />
        {TIER_LABEL[q.tier]} {q.score}%
        <span>
          A {where(q.a)} · B {where(q.b)}
        </span>
      </div>
      <div className="ab">
        <div>
          <i>A {where(q.a)}</i>
          {a}
        </div>
        <div>
          <i>B {where(q.b)}</i>
          {b}
        </div>
      </div>
    </div>
  )
}

export function RepeatReport({ meta, all, rows }: RepeatReportProps) {
  const n = (min: number): number =>
    all.filter((g) => g.occurrences.length >= min && !g.common).length
  return (
    <div className="rp">
      <h1>내부 반복 검사 결과</h1>
      <Meta meta={meta} />
      <div className="nums">
        <div>
          반복 그룹<b>{all.filter((g) => !g.common).length}</b>
        </div>
        <div>
          3회 이상<b>{n(3)}</b>
        </div>
        <div>
          5회 이상<b>{n(5)}</b>
        </div>
      </div>
      {rows.map((g, i) => (
        <div className="row" key={i}>
          <div className="h">
            <i className="dot t2" />
            {g.occurrences.length}회
            <span>
              {where(g.occurrences[0]!)}~{where(g.occurrences[g.occurrences.length - 1]!)}
            </span>
          </div>
          <div>{g.text}</div>
          <div style={{ color: 'var(--meta)', fontSize: 13, marginTop: 6 }}>
            {g.occurrences.slice(0, 100).map(where).join(' · ')}
            {g.occurrences.length > 100 && ` 외 ${g.occurrences.length - 100}곳`}
          </div>
        </div>
      ))}
      <div className="foot">{FOOT}</div>
    </div>
  )
}
