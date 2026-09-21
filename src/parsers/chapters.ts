import type { Chapter, ChapterRule } from '../shared/types.ts'

/** Last number in a file name (extension excluded), e.g. `검은달_12화.txt` → 12. */
export function chapterFromFilename(name: string): number | null {
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

// Short title lines: "#12화", "제12화 - 부제", "12화", "12.", "Chapter 12", "EP.3".
const TITLE_MAX_CHARS = 40
const TITLE =
  /^(?:[#*]\s*)?(?:제\s*)?(\d{1,5})\s*(?:화|회|장|편)(?:[\s.:\-–—|].*)?$|^(?:chapter|episode|ep)\.?\s*(\d{1,5})\b.*$|^(\d{1,5})\.(?:\s.*)?$/iu

export interface TitleChapters {
  rule: Extract<ChapterRule, 'title-lines' | 'none'>
  chapters: Chapter[]
}

/**
 * One file: numbered title lines start chapters when there are at least two and the
 * numbers are (almost all) consecutive. Otherwise the manuscript has no chapters.
 */
export function chaptersFromTitles(text: string): TitleChapters {
  const found: Chapter[] = []
  const re = /^[^\S\n]*(.*?)[^\S\n]*$/gmu
  for (const m of text.matchAll(re)) {
    const line = m[1]!
    if (line.length === 0 || line.length > TITLE_MAX_CHARS) continue
    const t = TITLE.exec(line)
    if (!t) continue
    found.push({ label: Number(t[1] ?? t[2] ?? t[3]), start: m.index })
  }
  if (found.length < 2) return { rule: 'none', chapters: [] }
  let consecutive = 0
  for (let i = 1; i < found.length; i++)
    if (found[i]!.label === found[i - 1]!.label! + 1) consecutive++
  if (consecutive < (found.length - 1) * 0.8) return { rule: 'none', chapters: [] }
  return { rule: 'title-lines', chapters: found }
}
