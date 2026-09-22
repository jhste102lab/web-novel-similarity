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

export type Tier = 'near' | 'edited'

export interface Span {
  chapter: number | null
  sentenceIndex: number
  text: string
}

export interface Passage {
  tier: Tier
  a: Span
  b: Span
}

/** Every suspicious passage between one chapter of A and one chapter of B. */
export interface ChapterMatch {
  a: number | null
  b: number | null
  /** 'near' when at least one passage is 거의 동일. */
  tier: Tier
  /** Suspicious sentences in this chapter pair, including those not shown. */
  count: number
  /** Passages (diagonal runs) found, including those beyond MAX_PASSAGES_PER_MATCH. */
  runs: number
  passages: Passage[]
}

/** Where the run spent its time and how much work the fingerprint index avoided. */
export interface RunStats {
  /** Milliseconds per phase; `total` also covers the parts not broken out. */
  indexMs: number
  fingerprintMs: number
  scanMs: number
  groupMs: number
  totalMs: number
  chars: number
  sentencesA: number
  sentencesB: number
  /** Sentence pairs a naive all-pairs comparison would score. */
  pairsNaive: number
  /** Sentence pairs the fingerprint index actually scored. */
  pairsScored: number
}

/** One cell of the chapter × chapter density map. */
export interface GridCell {
  a: number
  b: number
  count: number
  near: number
}

/**
 * Chapter × chapter density behind the dotplot. Unlike `matches` this covers every
 * chapter pair found, including those the MAX_RESULTS cap drops from the list.
 */
export interface Grid {
  cells: GridCell[]
  aMin: number
  aMax: number
  bMin: number
  bMax: number
  /** True when the cell cap dropped the sparsest cells. */
  truncated: boolean
}

export interface CompareResult {
  kind: 'compare'
  matches: ChapterMatch[]
  /** Chapter pairs found before the MAX_RESULTS cap. */
  total: number
  grid: Grid | null
  stats: RunStats
}

export interface Occurrence {
  chapter: number | null
  sentenceIndex: number
}

export interface RepeatGroup {
  text: string
  occurrences: Occurrence[]
}

export interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
  /** Groups found before the MAX_RESULTS cap. */
  total: number
  /** Chapters that share a repeated sentence; symmetric, so only a ≤ b cells exist. */
  grid: Grid | null
  stats: RunStats
}

export type DiffOp = { op: 'eq' | 'ins' | 'del'; text: string }

/** Inclusive chapter interval. */
export type ChapterRange = [number, number]
