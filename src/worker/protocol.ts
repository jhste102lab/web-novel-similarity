import type { ChapterRange, CompareResult, ManuscriptText, RepeatResult } from '../shared/types.ts'

export type WorkerRequest =
  | {
      type: 'compare'
      a: ManuscriptText
      b: ManuscriptText
      rangeA?: ChapterRange
      rangeB?: ChapterRange
    }
  | { type: 'repeat'; a: ManuscriptText; rangeA?: ChapterRange }

export type WorkerResponse =
  | { type: 'progress'; pct: number }
  | { type: 'result'; result: CompareResult | RepeatResult }
  | { type: 'error'; message: string }
