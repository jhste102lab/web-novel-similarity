import type { Passage, RepeatGroup, Span, Tier } from '../shared/types.ts'

export const TIER_LABEL: Record<Tier, string> = {
  near: '거의 동일',
  edited: '일부 수정',
  partial: '부분 유사',
}
export const TIER_CLASS: Record<Tier, string> = { near: 't1', edited: 't2', partial: 't3' }

export type CompareFilter = 'all' | Tier | 'common'
export type RepeatFilter = 'all' | 3 | 5 | 'common'
export type Filter = CompareFilter | RepeatFilter

export function filterPassages(passages: Passage[], f: CompareFilter): Passage[] {
  if (f === 'all') return passages
  if (f === 'common') return passages.filter((p) => p.common)
  return passages.filter((p) => p.tier === f && !p.common)
}

export function filterGroups(groups: RepeatGroup[], f: RepeatFilter): RepeatGroup[] {
  if (f === 'all') return groups
  if (f === 'common') return groups.filter((g) => g.common)
  return groups.filter((g) => g.occurrences.length >= f && !g.common)
}

/** Warning shown when the MAX_RESULTS cap dropped the lowest-scoring findings. */
export function cappedNote(shown: number, total: number): string | null {
  return total > shown
    ? `전체 ${total.toLocaleString()}개 중 상위 ${shown.toLocaleString()}개만 표시해요`
    : null
}

/** "127화" or "1,532번째 문장" when the manuscript has no chapters. */
export function where(s: { chapter: number | null; sentenceIndex: number }): string {
  return s.chapter === null
    ? `${(s.sentenceIndex + 1).toLocaleString()}번째 문장`
    : `${s.chapter}화`
}

export function firstLine(s: Span): string {
  return s.text.split('\n')[0] ?? ''
}
