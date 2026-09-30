import { describe, expect, it } from 'vitest'
import type { ManuscriptText } from '../shared/types.ts'
import { compare } from './compare.ts'
import { charDiff } from './diff.ts'
import { boundedEditDistance } from './editDistance.ts'
import { findRepeats } from './repeats.ts'
import { indexSentences, sentenceText } from './sentences.ts'

const doc = (chapters: string[][]): ManuscriptText => {
  let text = ''
  const list = chapters.map((lines, i) => {
    const start = text.length
    text += `#${i + 1}화\n${lines.join('\n')}\n\n`
    return { label: i + 1, start }
  })
  return { text, chapters: list }
}

describe('indexSentences', () => {
  it('splits on terminators followed by closing quotes and on line breaks', () => {
    const idx = indexSentences('“물러서라.” 낮게 깔린 목소리였다.\n빗줄기가 굵어지고 있었다', [])
    expect(idx.norm).toEqual(
      ['물러서라', '낮게깔린목소리였다', '빗줄기가굵어지고있었다'].filter((n) => n.length >= 8),
    )
  })
})

describe('boundedEditDistance', () => {
  it('returns the exact distance within the band and maxDist+1 beyond it', () => {
    expect(boundedEditDistance('kitten', 'sitting', 3)).toBe(3)
    expect(boundedEditDistance('kitten', 'sitting', 2)).toBe(3)
    expect(boundedEditDistance('abc', 'abc', 0)).toBe(0)
  })
})

describe('compare', () => {
  it('tiers identical and lightly edited sentences and drops reordered ones', () => {
    const a = doc([
      [
        '그는 천천히 검을 뽑아 들었다.',
        '칼날 위로 달빛이 미끄러졌다.',
        '장로들은 서로 눈짓을 주고받았고, 누구도 먼저 입을 열지 않았다.',
      ],
    ])
    const b = doc([
      ['전혀 다른 문장이 여기에 있다.'],
      ['그는 천천히 검을 뽑아 들었다.', '아무 관계 없는 이야기가 이어진다.'],
      ['칼날 위로 달빛이 흘러내렸다.', '아무 관계 없는 이야기가 이어진다.'],
      ['누구도 먼저 입을 열지 않았고, 장로들은 서로 눈짓을 주고받았다.'],
    ])
    const r = compare(a, b)
    const tiers = Object.fromEntries(r.matches.map((m) => [m.b, m.tier]))
    expect(tiers).toEqual({ 2: 'near', 3: 'edited' })
  })

  it('chains consecutive matched sentences into one passage', () => {
    const lines = [
      '첫 번째 문장이 여기에 있다.',
      '두 번째 문장이 이어서 나온다.',
      '세 번째 문장으로 끝난다.',
    ]
    const r = compare(doc([lines]), doc([['무관한 문장.', ...lines]]))
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]!.passages).toHaveLength(1)
    expect(r.matches[0]!.count).toBe(lines.length)
    expect(r.matches[0]!.passages[0]!.a.text).toBe(lines.join('\n'))
  })

  it('splits a copied run at chapter boundaries so each chapter pair is its own finding', () => {
    const first = ['성문 앞에서 말을 세우고 기다렸다.', '북소리가 세 번 울린 뒤에야 문이 열렸다.']
    const second = [
      '약재상은 저울추를 내려놓으며 한숨을 쉬었다.',
      '장부의 마지막 줄은 비어 있었다.',
    ]
    // B is A copied whole, so the matched sentences form one unbroken diagonal.
    const r = compare(doc([first, second]), doc([first, second]))
    expect(r.matches.map((m) => [m.a, m.b, m.count])).toEqual([
      [1, 1, 2],
      [2, 2, 2],
    ])
  })

  it('honours the chapter range', () => {
    const a = doc([['범위 밖의 문장이 있다.'], ['범위 안의 문장이 있다.']])
    const b = doc([['범위 밖의 문장이 있다.', '범위 안의 문장이 있다.']])
    const r = compare(a, b, { rangeA: [2, 2] })
    expect(r.matches.flatMap((m) => m.passages.map((p) => p.a.text))).toEqual([
      '범위 안의 문장이 있다.',
    ])
  })
})
describe('findRepeats', () => {
  it('groups recurring sentences across chapters and skips adjacent duplicates', () => {
    const m = doc([
      [
        '반복되는 문장이 있다.',
        '반복되는 문장이 있다.',
        '아무 관계 없는 이야기.',
        '다른 이야기가 이어진다.',
      ],
      ['또 다른 이야기가 이어진다.', '이야기는 계속된다.', '반복되는 문장이 있다.'],
    ])
    const r = findRepeats(m)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]!.occurrences.map((o) => o.chapter)).toEqual([1, 2])
    const idx = indexSentences(m.text, m.chapters)
    expect(r.groups[0]!.occurrences.map((o) => sentenceText(idx, o.id))).toEqual([
      '반복되는 문장이 있다.',
      '반복되는 문장이 있다.',
    ])
  })
})

describe('charDiff', () => {
  it('yields minimal insert/delete segments', () => {
    expect(charDiff('달빛이 미끄러졌다', '달빛이 흘러내렸다')).toEqual([
      { op: 'eq', text: '달빛이 ' },
      { op: 'del', text: '미끄러졌' },
      { op: 'ins', text: '흘러내렸' },
      { op: 'eq', text: '다' },
    ])
  })

  it('anchors a whole-chapter diff on sentences and keeps both texts intact', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `${i}번째 사람이 길을 따라 천천히 걸어갔다.`)
    const a = lines.join(' ')
    const b = lines
      .map((l, i) => (i === 30 ? '그리고 ' + l.replace('천천히', '빠르게') : l))
      .join(' ')
    expect(a.length * b.length).toBeGreaterThan(250_000)
    const d = charDiff(a, b)
    const side = (skip: 'ins' | 'del'): string =>
      d
        .filter((o) => o.op !== skip)
        .map((o) => o.text)
        .join('')
    expect(side('ins')).toBe(a)
    expect(side('del')).toBe(b)
    expect(d.filter((o) => o.op !== 'eq').map((o) => o.text)).toEqual([
      '그리고 ',
      '천천히',
      '빠르게',
    ])
  })
})
