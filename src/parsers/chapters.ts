import type { Chapter, ChapterRule } from '../shared/types.ts'

/** Last number in a file name (extension excluded), e.g. `검은달_12화.txt` → 12. */
function chapterFromFilename(name: string): number | null {
  const stem = name.replace(/\.[^.]+$/, '')
  const m = /(\d{1,5})(?!.*\d)/.exec(stem)
  return m ? Number(m[1]) : null
}

const collator = new Intl.Collator('ko', { numeric: true })

export interface FileOrder {
  rule: Extract<ChapterRule, 'filename-number' | 'filename-order'>
  /** Files in reading order with their chapter label. */
  ordered: { index: number; label: number | null }[]
}

/**
 * Many files: chapter from the last number in each name when at least one file has
 * one (files without a number get null); otherwise natural name order 1..n.
 */
export function orderFiles(names: string[]): FileOrder {
  const labels = names.map(chapterFromFilename)
  if (labels.every((l) => l === null)) {
    const ordered = names
      .map((name, index) => ({ name, index }))
      .sort((x, y) => collator.compare(x.name, y.name))
      .map((f, k) => ({ index: f.index, label: k + 1 }))
    return { rule: 'filename-order', ordered }
  }
  const ordered = names
    .map((name, index) => ({ name, index, label: labels[index]! }))
    .sort((x, y) => {
      if (x.label === null || y.label === null)
        return x.label === null ? (y.label === null ? collator.compare(x.name, y.name) : 1) : -1
      return x.label - y.label || collator.compare(x.name, y.name)
    })
    .map(({ index, label }) => ({ index, label }))
  return { rule: 'filename-number', ordered }
}

// Short title lines: "#12화", "제12화 - 부제", "1부 12화", "12화", "12.", "Chapter 12", "EP.3", "Ch.3",
// optionally opened by a bracket ("[12화]", "【EP.3】 부제", "<12화>"), and a work name before
// the number when the line ends there ("검은달 12화", "[검은달] 12편."). Lines are NFKC-normalised
// first, so full-width "１２화" and "［12화］" count too.
const TITLE_MAX_CHARS = 40
const OPENER = /^[[(<{【〈《「『#*]\s*/u
const TITLE = new RegExp(
  [
    String.raw`^(?:제\s*)?(?:\d{1,3}\s*부\s*)?(?:제\s*)?(\d{1,5})\s*(?:화|회|장|편)(?:[\s.:\-–—|\])>}】〉》」』].*)?$`,
    String.raw`^(?:chapter|episode|ep|ch)\.?\s*(\d{1,5})\b.*$`,
    String.raw`^(\d{1,5})\.(?:\s.*)?$`,
    String.raw`^\S.{0,30}?\s(?:제\s*)?(\d{1,5})\s*(?:화|회|편)[\])>}】〉》」』.!]*$`,
  ].join('|'),
  'iu',
)

export interface TitleChapters {
  rule: Extract<ChapterRule, 'title-lines' | 'none'>
  chapters: Chapter[]
}

/** Chapter number of a title line, or null when the line is not one. */
export function titleNumber(line: string): number | null {
  if (line.length === 0 || line.length > TITLE_MAX_CHARS) return null
  const t = TITLE.exec(line.normalize('NFKC').replace(OPENER, ''))
  return t ? Number(t[1] ?? t[2] ?? t[3] ?? t[4]) : null
}

/**
 * One file: numbered title lines start chapters when there are at least two and the
 * numbers are (almost all) consecutive. Otherwise the manuscript has no chapters.
 * A title line directly followed by another with the same number ("[EP.3] 작품 3편." then
 * "작품 3편.") is one title.
 */
export function chaptersFromTitles(text: string): TitleChapters {
  const found: Chapter[] = []
  let prevEnd = -1
  const re = /^[^\S\n]*(.*?)[^\S\n]*$/gmu
  for (const m of text.matchAll(re)) {
    const label = titleNumber(m[1]!)
    if (label === null) continue
    const repeated =
      found.at(-1)?.label === label && text.slice(prevEnd, m.index).trim().length === 0
    prevEnd = m.index + m[0].length
    if (!repeated) found.push({ label, start: m.index })
  }
  if (found.length < 2) return { rule: 'none', chapters: [] }
  let consecutive = 0
  for (let i = 1; i < found.length; i++)
    if (found[i]!.label === found[i - 1]!.label! + 1) consecutive++
  if (consecutive < (found.length - 1) * 0.8) return { rule: 'none', chapters: [] }
  return { rule: 'title-lines', chapters: found }
}
