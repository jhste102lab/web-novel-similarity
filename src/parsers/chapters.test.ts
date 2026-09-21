import { describe, expect, it } from 'vitest'
import { chaptersFromTitles, orderFiles } from './chapters.ts'

describe('orderFiles', () => {
  it('uses the last number in the name and marks files without one', () => {
    const r = orderFiles(['검은달_2화.txt', '검은달_1화.txt', '검은달_외전.txt', '제3화.txt'])
    expect(r.rule).toBe('filename-number')
    expect(r.ordered).toEqual([
      { index: 1, label: 1 },
      { index: 0, label: 2 },
      { index: 3, label: 3 },
      { index: 2, label: null },
    ])
  })

  it('falls back to natural name order when no name has a number', () => {
    const r = orderFiles(['에필로그.txt', '프롤로그.txt', '첫 만남.txt'])
    expect(r.rule).toBe('filename-order')
    expect(r.ordered.map((o) => o.label)).toEqual([1, 2, 3])
  })
})

describe('chaptersFromTitles', () => {
  it('detects consecutive short title lines in several styles', () => {
    const text = '#1화\n본문\n\n제2화 - 부제\n본문\n\n3화\n본문\n\nChapter 4\n본문'
    const r = chaptersFromTitles(text)
    expect(r.rule).toBe('title-lines')
    expect(r.chapters.map((c) => c.label)).toEqual([1, 2, 3, 4])
    expect(r.chapters[1]!.start).toBe(text.indexOf('제2화'))
  })

  it('ignores numbers that are not consecutive titles', () => {
    const text = '1화\n그는 12화를 보았다.\n2022. 봄이었다.\n50화\n끝'
    expect(chaptersFromTitles(text).rule).toBe('none')
  })

  it('needs at least two titles', () => {
    expect(chaptersFromTitles('제1화\n본문').rule).toBe('none')
  })
})
