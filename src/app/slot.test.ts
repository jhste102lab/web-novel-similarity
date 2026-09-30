import { describe, expect, it } from 'vitest'
import { buildManuscript } from '../parsers/manuscript.ts'
import { slotEngineText, slotFileAt, type Slot } from './slot.ts'

describe('slotFileAt', () => {
  it('names the file each chapter of the engine text came from', () => {
    // Files split by title lines; the user then relabels 1~2화 as 3~4화 and the reverse, so
    // the engine text order differs from the row order.
    const manuscript = buildManuscript([
      { name: '뒤.txt', lastModified: 0, text: '#3화\n셋째 이야기.\n#4화\n넷째 이야기.' },
      { name: '앞.txt', lastModified: 0, text: '#1화\n첫째 이야기.\n#2화\n둘째 이야기.' },
    ])
    const slot: Slot = {
      manuscript,
      title: '',
      files: [],
      labels: [3, 4, 1, 2],
      range: null,
    }
    const { text } = slotEngineText(slot)
    const fileAt = slotFileAt(slot)
    expect(['첫째', '둘째', '셋째', '넷째'].map((w) => fileAt(text.indexOf(w)))).toEqual([
      '앞.txt',
      '앞.txt',
      '뒤.txt',
      '뒤.txt',
    ])
  })
})
