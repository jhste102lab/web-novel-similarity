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
  it('puts every box beside what it matched and shows each stretch whole only once', () => {
    const la = lines('가')
    const lb = lines('나')
    const A = doc(la)
    const B = doc(lb)
    const p = (a: number, b: number): Passage => ({
      tier: 'near',
      a: span(A, la, a),
      b: span(B, lb, b),
    })
    // A 2 matches B 30 (late in B); A 20 matches B 5 and B 30; A 2 and A 4 share neighbours.
    const blocks = blocksOf(
      [p(20, 5), p(2, 30), p(20, 30), p(4, 31)],
      joinOf(A),
      joinOf(B),
      () => 'a.txt',
      () => 'b.txt',
    )
    expect(blocks).toHaveLength(1)
    const rows = blocks[0]!.map((r) => [r.a.label, r.b.label])
    expect(rows).toEqual([
      ['a.txt · 1화 · 3·5번째 문장', 'b.txt · 1화 · 31·32번째 문장'],
      ['a.txt · 1화 · 21번째 문장', 'b.txt · 1화 · 6번째 문장'],
      // Both stretches were shown above: only the sentences this row links.
      ['a.txt · 1화 · 21번째 문장', 'b.txt · 1화 · 31번째 문장'],
    ])
    expect(blocks[0]![0]!.a.link).toBe('↔ B 31·32번째 문장')
    expect(blocks[0]![1]!.a.link).toBe('↔ B 6·31번째 문장')
    expect(blocks[0]![2]!.b.pieces).toEqual([{ text: lb[30], other: la[20] }])
    expect(blocks[0]![2]!.b.link).toBe('↑ 위에 나온 칸 · 겹친 문장만')
  })
})
