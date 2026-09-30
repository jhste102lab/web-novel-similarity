import type { Chapter, ChapterRule, ManuscriptText } from '../shared/types.ts'
import { chaptersFromTitles, orderFiles, titleNumber } from './chapters.ts'

/** One row of the slot card: a file (many-file input) or a chapter found by its title line. */
export interface Part {
  name: string
  /** File modification time; null for chapter rows found by title lines. */
  lastModified: number | null
  label: number | null
  text: string
}

export interface Manuscript {
  title: string
  rule: ChapterRule
  /** Number of source files. */
  files: number
  /** Rows in display order (files: reading order; title lines: chapter order). */
  parts: Part[]
}

export interface ParsedFile {
  name: string
  lastModified: number
  text: string
}

export function buildManuscript(files: ParsedFile[]): Manuscript {
  if (files.length === 1) return fromSingleFile(files[0]!)
  const { rule, ordered } = orderFiles(files.map((f) => f.name))
  const sorted = ordered.map(({ index, label }) => ({ file: files[index]!, label }))
  // Reading order, not input order: the fallback title must not depend on how files were picked.
  const title = commonTitle(sorted.map((s) => s.file.name))
  // Files that each hold several titled chapters ("1-100화.hwp", "101-200화.hwp") are split
  // by those titles; a file number would label a hundred chapters as one.
  const titled = sorted.map((s) => chaptersFromTitles(s.file.text).chapters)
  if (titled.every((chapters) => chapters.length > 0)) {
    const parts = sorted.flatMap((s, i) => titleParts(s.file.text, titled[i]!))
    return { title, rule: 'title-lines', files: files.length, parts }
  }
  const parts = sorted.map(({ file, label }) => ({
    name: file.name,
    lastModified: file.lastModified,
    label,
    text: file.text,
  }))
  return { title, rule, files: files.length, parts }
}

function fromSingleFile(file: ParsedFile): Manuscript {
  const title = stem(file.name)
  const { rule, chapters } = chaptersFromTitles(file.text)
  if (rule === 'none') {
    return {
      title,
      rule,
      files: 1,
      parts: [{ name: file.name, lastModified: file.lastModified, label: null, text: file.text }],
    }
  }
  return { title, rule, files: 1, parts: titleParts(file.text, chapters) }
}

/** One row per title. Text before the first title (a prologue, a header) stays with the first chapter. */
function titleParts(text: string, chapters: Chapter[]): Part[] {
  return chapters.map((c, i) => {
    const own = text.slice(c.start, chapters[i + 1]?.start ?? text.length)
    return {
      name: firstSentence(own),
      lastModified: null,
      label: c.label,
      text: i === 0 ? text.slice(0, c.start) + own : own,
    }
  })
}

/** Engine input in chapter order: labelled parts by label, unlabelled ones after them in row order. */
export function toEngineText(m: Manuscript): ManuscriptText {
  const parts = [...m.parts].sort((x, y) =>
    x.label === null || y.label === null
      ? Number(x.label === null) - Number(y.label === null)
      : x.label - y.label,
  )
  let text = ''
  const chapters = parts.map((p) => {
    const start = text.length
    text += p.text + '\n\n'
    return { label: p.label, start }
  })
  return { text, chapters: m.rule === 'none' ? [] : chapters }
}

/** First non-empty line after the title (and a repeated title line), trimmed for the row label. */
function firstSentence(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return (lines.find((l, i) => i > 0 && titleNumber(l) === null) ?? lines[0] ?? '').slice(0, 60)
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** Longest common prefix of the file stems without trailing separators/digits; falls back to the first stem. */
function commonTitle(names: string[]): string {
  const stems = names.map(stem)
  let prefix = stems[0] ?? ''
  for (const s of stems) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1)
  prefix = prefix.replace(/[\s_\-\d(]+$/, '')
  return prefix.length >= 2 ? prefix : stems[0]!
}
