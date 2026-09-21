/** A chapter boundary inside a manuscript text. `label` is null when the chapter number is unknown. */
export interface Chapter {
  label: number | null
  start: number
}

/** Engine input: one manuscript as a single text with chapter offsets. */
export interface ManuscriptText {
  text: string
  chapters: Chapter[]
}

export type ChapterRule = 'filename-number' | 'filename-order' | 'title-lines' | 'none'

export interface FileInfo {
  name: string
  lastModified: number
  chapter: number | null
  chars: number
  firstSentence: string
}

/** What the UI shows on a filled slot card. */
export interface ManuscriptInfo {
  title: string
  files: FileInfo[]
  chapterRule: ChapterRule
  totalChars: number
  /** Present only for chapter-bearing manuscripts. */
  chapterMax: number | null
}

export type Tier = 'near' | 'edited' | 'partial'

export interface Span {
  chapter: number | null
  sentenceIndex: number
  text: string
}

export interface Passage {
  tier: Tier
  /** 0–100 */
  score: number
  common: boolean
  a: Span
  b: Span
}

export interface CompareResult {
  kind: 'compare'
  passages: Passage[]
  /** Passages found before the MAX_RESULTS cap; equals passages.length when nothing was dropped. */
  total: number
}

export interface Occurrence {
  chapter: number | null
  sentenceIndex: number
}

export interface RepeatGroup {
  text: string
  common: boolean
  occurrences: Occurrence[]
}

export interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
  /** Groups found before the MAX_RESULTS cap. */
  total: number
}

export type DiffOp = { op: 'eq' | 'ins' | 'del'; text: string }

/** Inclusive chapter interval. */
export type ChapterRange = [number, number]
