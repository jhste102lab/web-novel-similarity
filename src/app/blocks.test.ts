import { describe, expect, it } from 'vitest'
import { joinOf } from '../engine/context.ts'
import type { ManuscriptText, Passage, Span } from '../shared/types.ts'
import { blocksOf } from './blocks.ts'

// One chapter of 40 numbered lines; findings far apart never share neighbours.
const lines = (tag: string) => Array.from({ length: 40 }, (_, i) => `${tag} ${i}번 줄이다.`)
const doc = (ls: string[]): ManuscriptText => ({
  text: `#1화\n${ls.join('\n')}`,
  chapters: [{ label: 1, start: 0 }],
})
const span = (m: ManuscriptText, ls: string[], i: number): Span => {
  const start = m.text.indexOf(`\n${ls[i]}\n`) + 1
  return { chapter: 1, sentenceIndex: i, text: ls[i]!, start, end: start + ls[i]!.length }
}

describe('blocksOf', () => {
  it('shows each A stretch once, every B stretch it matched whole beside it', () => {
    const la = lines('가')
    const lb = lines('나')
    const A = doc(la)
    const B = doc(lb)
    const p = (a: number, b: number): Passage => ({
      tier: 'near',
      a: span(A, la, a),
      b: span(B, lb, b),
    })
    // A 2 and A 4 share neighbours; A 20 matches B 5 and B 30, which A 2 matched too.
    const blocks = blocksOf(
      [p(20, 5), p(2, 30), p(20, 30), p(4, 31)],
      joinOf(A),
      joinOf(B),
      () => 'a.txt',
      () => 'b.txt',
    )
    const shape = blocks.map((k) => [k.a.label, k.a.link, k.b.map((s) => [s.label, s.link])])
    expect(shape).toEqual([
      [
        'a.txt · 1화 · 3·5번째 문장',
        '↔ B 31·32번째 문장',
        [['b.txt · 1화 · 31·32번째 문장', '↔ A 3·5번째 문장']],
      ],
      [
        'a.txt · 1화 · 21번째 문장',
        '↔ B 6·31번째 문장',
        [
          ['b.txt · 1화 · 6번째 문장', '↔ A 21번째 문장'],
          ['b.txt · 1화 · 31번째 문장', '↔ A 21번째 문장'],
        ],
      ],
    ])
    // B 31 was shown beside A 3·5 already; beside A 21 it is whole again, marked against A 21.
    const again = blocks[1]!.b[1]!.pieces
    expect(again.filter((x) => x.other !== undefined)).toEqual([{ text: lb[30], other: la[20] }])
    expect(again.map((x) => x.text).join('')).toContain(lb[27])
    expect(again.map((x) => x.text).join('')).toContain(lb[34])
  })
})
