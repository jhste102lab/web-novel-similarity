import { useMemo } from 'react'
import { charDiff } from '../engine/diff.ts'
import { indexSentences } from '../engine/sentences.ts'
import { Marked } from '../app/Marked.tsx'
import { chapterLabel, groupSpan, ordinal, TIER_CLASS, TIER_LABEL, where } from '../app/results.ts'
import type { ChapterMatch, Occurrence, Passage, RepeatGroup } from '../shared/types.ts'
import type { Context } from './context.ts'

/** 요약표만 / 일부 / 전부. */
export type Amount = 'summary' | 'part' | 'full'

/** Sentences per passage (compare) and places per group (repeat) under 일부. */
const PART = 3

export interface ReportMeta {
  date: string
  a: string
  b?: string
  /** "전체 26개" or "1,560개 중 3개". */
  scope: string
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
      <span>범위</span>
      <span>{meta.scope}</span>
    </div>
  )
}

/** End offset of the first `n` sentences (as the engine splits them) and how many follow. */
function firstSentences(text: string, n: number): { end: number; rest: number } {
  const { ends } = indexSentences(text, [])
  return ends.length <= n
    ? { end: text.length, rest: 0 }
    : { end: ends[n - 1]!, rest: ends.length - n }
}

export function CompareReport({
  meta,
  rows,
  amount,
}: {
  meta: ReportMeta
  rows: ChapterMatch[]
  amount: Amount
}) {
  return (
    <div className="rp">
      <h1>유사도 검사 결과</h1>
      <Meta meta={meta} />
      <div className="nums">
        <div>
          유사 회차<b>{rows.length.toLocaleString()}</b>
        </div>
        <div>
          거의 동일<b>{rows.filter((m) => m.tier === 'near').length.toLocaleString()}</b>
        </div>
        <div>
          일부 수정<b>{rows.filter((m) => m.tier === 'edited').length.toLocaleString()}</b>
        </div>
      </div>
      {amount === 'summary' ? (
        <table className="sum">
          <thead>
            <tr>
              <th>등급</th>
              <th>A</th>
              <th>B</th>
              <th className="n">유사 문장</th>
              <th className="n">구간</th>
              <th>첫 문장</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const first = m.passages[0]!.a.text
              return (
                <tr key={i}>
                  <td className="nw">
                    <i className={`dot ${TIER_CLASS[m.tier]}`} /> {TIER_LABEL[m.tier]}
                  </td>
                  <td className="nw">{chapterLabel(m.a)}</td>
                  <td className="nw">{chapterLabel(m.b)}</td>
                  <td className="n">{m.count.toLocaleString()}개</td>
                  <td className="n">{m.runs.toLocaleString()}개</td>
                  <td>{first.slice(0, firstSentences(first, 1).end).trim()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <>
          <div className="legend">
            <mark>겹치는 부분</mark>
          </div>
          {rows.map((m, i) => (
            <MatchRow key={i} m={m} part={amount === 'part'} />
          ))}
        </>
      )}
      <div className="foot">{FOOT}</div>
    </div>
  )
}

function MatchRow({ m, part }: { m: ChapterMatch; part: boolean }) {
  return (
    <div className="row">
      <div className="h">
        <i className={`dot ${TIER_CLASS[m.tier]}`} />
        <b>{TIER_LABEL[m.tier]}</b>
        <span>
          A {chapterLabel(m.a)} · B {chapterLabel(m.b)} · 유사 문장 {m.count}개 · 구간 {m.runs}개
          {m.runs > m.passages.length && ` (상위 ${m.passages.length}개 표시)`}
        </span>
      </div>
      {m.passages.map((p, i) => (
        <PassageRow key={i} p={p} part={part} />
      ))}
    </div>
  )
}

function PassageRow({ p, part }: { p: Passage; part: boolean }) {
  const diff = useMemo(() => charDiff(p.a.text, p.b.text), [p])
  const a = part ? firstSentences(p.a.text, PART) : { end: Infinity, rest: 0 }
  const b = part ? firstSentences(p.b.text, PART) : { end: Infinity, rest: 0 }
  return (
    <div className="ab">
      <div>
        <i>A {ordinal(p.a)}</i>
        <Marked diff={diff} side="a" limit={a.end} />
        {a.rest > 0 && <div className="more">… 외 {a.rest}문장</div>}
      </div>
      <div>
        <i>B {ordinal(p.b)}</i>
        <Marked diff={diff} side="b" limit={b.end} />
        {b.rest > 0 && <div className="more">… 외 {b.rest}문장</div>}
      </div>
    </div>
  )
}

/** "1화 ×4 · 2화 · 5화 ×2": each place once, with how often the sentence occurs there. */
function placesLine(occurrences: Occurrence[]): string {
  const counts = new Map<string, number>()
  for (const o of occurrences) counts.set(where(o), (counts.get(where(o)) ?? 0) + 1)
  return [...counts].map(([w, n]) => (n > 1 ? `${w} ×${n}` : w)).join(' · ')
}

export function RepeatReport({
  meta,
  rows,
  amount,
  context,
}: {
  meta: ReportMeta
  rows: RepeatGroup[]
  amount: Amount
  context: (o: Occurrence) => Context
}) {
  const atLeast = (n: number): number => rows.filter((g) => g.occurrences.length >= n).length
  return (
    <div className="rp">
      <h1>내부 반복 검사 결과</h1>
      <Meta meta={meta} />
      <div className="nums">
        <div>
          반복 그룹<b>{rows.length.toLocaleString()}</b>
        </div>
        <div>
          3회 이상<b>{atLeast(3).toLocaleString()}</b>
        </div>
        <div>
          5회 이상<b>{atLeast(5).toLocaleString()}</b>
        </div>
      </div>
      {amount === 'summary' ? (
        <table className="sum">
          <thead>
            <tr>
              <th className="n">횟수</th>
              <th>위치</th>
              <th>문장</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <td className="n">{g.occurrences.length}회</td>
                <td className="places">{placesLine(g.occurrences)}</td>
                <td>{g.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="legend">
            <mark>반복된 문장</mark>
          </div>
          {rows.map((g, i) => {
            const shown = amount === 'part' ? g.occurrences.slice(0, PART) : g.occurrences
            return (
              <div className="row" key={i}>
                <div className="h">
                  <i className="dot t2" />
                  <b>{g.occurrences.length}회</b>
                  <span>{groupSpan(g)}</span>
                </div>
                {shown.map((o, k) => {
                  const c = context(o)
                  return (
                    <div className="occ2" key={k}>
                      <div className="w">
                        {o.chapter === null ? where(o) : `${where(o)} · ${ordinal(o)}`}
                      </div>
                      <div>
                        {c.before && <span className="ctx">{c.before} </span>}
                        <mark>{c.text}</mark>
                        {c.after && <span className="ctx"> {c.after}</span>}
                      </div>
                    </div>
                  )
                })}
                {g.occurrences.length > shown.length && (
                  <div className="more">… 외 {g.occurrences.length - shown.length}곳</div>
                )}
              </div>
            )
          })}
        </>
      )}
      <div className="foot">{FOOT}</div>
    </div>
  )
}
