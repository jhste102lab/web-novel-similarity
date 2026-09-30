import { describe, expect, it } from 'vitest'
import { renderPdf, type Canvas, type PdfInput } from './pdf.ts'

/** Records what would be drawn; every character is 0.6 em wide. */
function recorder() {
  const texts: { t: string; x: number; y: number; size: number }[] = []
  let pages = 0
  const canvas: Canvas = {
    addPage: () => void pages++,
    text: (t, x, y, size) => void texts.push({ t, x, y, size }),
    rect: () => {},
    circle: () => {},
    width: () => 0.6,
  }
  return { canvas, texts, pages: () => pages }
}

const side = (text: string, label = '1화 · 1번째 문장') => ({
  label,
  pieces: [{ text: '앞 문장이다.\n' }, { text, other: text }, { text: '\n뒤 문장이다.' }],
})

describe('renderPdf', () => {
  it('splits a long passage across pages and numbers every page against the total', async () => {
    const long = '겹치는 문장이 이어진다. '.repeat(900)
    const input: PdfInput = {
      kind: 'compare',
      heading: '유사도 검사 결과',
      date: '2026. 9. 30.',
      manuscripts: [
        { key: 'A', title: 'A', files: ['a.txt'] },
        { key: 'B', title: 'B', files: ['b.txt'] },
      ],
      facts: [],
      rows: [
        {
          a: 'a.txt · 1화',
          b: 'b.txt · 1화',
          tier: 'near',
          blocks: [{ a: [side(long)], b: [side(long), side('겹친다.', '1화 · 9번째 문장')] }],
        },
      ],
    }
    const r = recorder()
    const pages = await renderPdf(input, r.canvas, () => {})
    expect(pages).toBeGreaterThan(3)
    expect(r.pages()).toBe(pages)
    const footers = r.texts.filter((t) => / \/ \d+$/.test(t.t)).map((t) => t.t)
    expect(footers).toEqual(Array.from({ length: pages }, (_, i) => `${i + 1} / ${pages}`))
    expect(r.texts.filter((t) => t.t.endsWith('(계속)'))).toHaveLength(pages - 1)
    // A second B stretch in the same block gets its own label under the first one.
    const labels = r.texts.filter((t) => t.t.endsWith('번째 문장'))
    expect(labels.map((t) => t.t)).toEqual([
      '1화 · 1번째 문장',
      '1화 · 1번째 문장',
      '1화 · 9번째 문장',
    ])
    // Nothing runs past the right margin (A4 width minus 40 pt) or into the footer rule.
    for (const t of r.texts) {
      expect(t.x + [...t.t].length * 0.6 * t.size).toBeLessThanOrEqual(595.28 - 40 + 0.01)
      if (!/ \/ \d+$|^2026/.test(t.t)) expect(t.y).toBeLessThanOrEqual(841.89 - 40)
    }
  })
})
