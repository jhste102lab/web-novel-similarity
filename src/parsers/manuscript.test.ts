import { describe, expect, it } from 'vitest'
import { buildManuscript } from './manuscript.ts'

const file = (name: string, text: string) => ({ name, lastModified: 0, text })

describe('buildManuscript', () => {
  it('keeps the text before the first title in the first chapter', () => {
    const m = buildManuscript([file('검은달.txt', '프롤로그\n별이 졌다.\n1화\n본문\n2화\n본문')])
    expect(m.parts.map((p) => p.label)).toEqual([1, 2])
    expect(m.parts[0]!.text).toContain('별이 졌다.')
  })

  it('splits files that each hold several titled chapters', () => {
    const m = buildManuscript([
      file('검은달 3_4.txt', '3화\n셋\n4화\n넷'),
      file('검은달 1_2.txt', '1화\n하나\n2화\n둘'),
    ])
    expect(m.rule).toBe('title-lines')
    expect(m.files).toBe(2)
    expect(m.parts.map((p) => p.label)).toEqual([1, 2, 3, 4])
  })

  it('numbers one-chapter files by file name', () => {
    const m = buildManuscript([file('검은달_2.txt', '2화\n둘'), file('검은달_1.txt', '1화\n하나')])
    expect(m.rule).toBe('filename-number')
    expect(m.parts.map((p) => p.label)).toEqual([1, 2])
  })
})
