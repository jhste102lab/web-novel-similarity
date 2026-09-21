import { MIN_SENTENCE_CHARS } from '../shared/constants.ts'
import type { Chapter } from '../shared/types.ts'

/** Sentence-indexed view of one manuscript. Arrays are parallel, indexed by sentence id. */
export interface SentenceIndex {
  text: string
  /** Offsets into `text`. */
  starts: Uint32Array
  ends: Uint32Array
  /** Normalised sentence (letters/digits only, NFC, lower-case). */
  norm: string[]
  /** Chapter label per sentence, -1 when unknown. */
  chapter: Int32Array
  /** Index of the sentence in its chapter (0-based), used for "N번째 문장" display. */
  ordinal: Uint32Array
}

// A sentence ends at ., !, ? (repeated), optionally followed by closing quotes/brackets, or at a line break.
const BOUNDARY = /[.!?]+[”’"'」』)\]]*(?=\s|$)|\n+/gu
const NOT_WORD = /[^\p{L}\p{N}]+/gu

export function normalize(s: string): string {
  return s.normalize('NFC').replace(NOT_WORD, '').toLowerCase()
}

/** Splits text into sentences and drops those too short to index. */
export function indexSentences(text: string, chapters: Chapter[]): SentenceIndex {
  const starts: number[] = []
  const ends: number[] = []
  const norm: string[] = []
  let cursor = 0
  const push = (from: number, to: number): void => {
    const n = normalize(text.slice(from, to))
    if (n.length < MIN_SENTENCE_CHARS) return
    starts.push(from)
    ends.push(to)
    norm.push(n)
  }
  for (const m of text.matchAll(BOUNDARY)) {
    const end = m.index + m[0].length
    push(cursor, end)
    cursor = end
  }
  push(cursor, text.length)

  const chapter = new Int32Array(starts.length)
  const ordinal = new Uint32Array(starts.length)
  let ci = -1
  let ord = 0
  for (let i = 0; i < starts.length; i++) {
    while (ci + 1 < chapters.length && chapters[ci + 1]!.start <= starts[i]!) {
      ci++
      ord = 0
    }
    chapter[i] = ci < 0 ? -1 : (chapters[ci]!.label ?? -1)
    ordinal[i] = ord++
  }
  return {
    text,
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
    norm,
    chapter,
    ordinal,
  }
}

/** Original text of sentence `i`, trimmed. */
export function sentenceText(idx: SentenceIndex, i: number): string {
  return idx.text.slice(idx.starts[i], idx.ends[i]).trim()
}
