import type { ChapterRule, ManuscriptText } from '../shared/types.ts'
import { chaptersFromTitles, orderFiles } from './chapters.ts'

/** One row of the slot card: a file (many-file input) or a detected chapter (single file). */
export interface Part {
  name: string
  /** File modification time; null for chapter rows of a single file. */
  lastModified: number | null
  label: number | null
  text: string
}

export interface Manuscript {
  title: string
  rule: ChapterRule
  /** Rows in display order (files: reading order; single file: chapter order). */
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
  const parts = ordered.map(({ index, label }) => {
    const f = files[index]!
    return { name: f.name, lastModified: f.lastModified, label, text: f.text }
  })
  // Reading order, not input order: the fallback title must not depend on how files were picked.
  return { title: commonTitle(parts.map((p) => p.name)), rule, parts }
}

function fromSingleFile(file: ParsedFile): Manuscript {
  const title = stem(file.name)
  const { rule, chapters } = chaptersFromTitles(file.text)
  if (rule === 'none') {
    return {
      title,
      rule,
      parts: [{ name: file.name, lastModified: file.lastModified, label: null, text: file.text }],
    }
  }
  const parts = chapters.map((c, i) => {
    const text = file.text.slice(c.start, chapters[i + 1]?.start ?? file.text.length)
    return { name: firstSentence(text), lastModified: null, label: c.label, text }
  })
  return { title, rule, parts }
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

/** Second non-empty line of a chapter (the first is its title), trimmed for the row label. */
function firstSentence(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return (lines[1] ?? lines[0] ?? '').slice(0, 60)
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
