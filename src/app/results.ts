import type { ChapterMatch, RepeatGroup, Span, Tier } from '../shared/types.ts'

export const TIER_LABEL: Record<Tier, string> = { near: '거의 동일', edited: '일부 수정' }
export const TIER_CLASS: Record<Tier, string> = { near: 't1', edited: 't2' }

export type CompareFilter = 'all' | Tier
export type RepeatFilter = 'all' | 3 | 5

export function filterMatches(matches: ChapterMatch[], f: CompareFilter): ChapterMatch[] {
  return f === 'all' ? matches : matches.filter((m) => m.tier === f)
}

export function filterGroups(groups: RepeatGroup[], f: RepeatFilter): RepeatGroup[] {
  return f === 'all' ? groups : groups.filter((g) => g.occurrences.length >= f)
}

/** Matches whose chapter labels or passage text contain the query. */
export function searchMatches(matches: ChapterMatch[], query: string): ChapterMatch[] {
  const q = query.trim()
  if (q === '') return matches
  return matches.filter(
    (m) =>
      `${chapterLabel(m.a)} ${chapterLabel(m.b)}`.includes(q) ||
      m.passages.some((p) => p.a.text.includes(q) || p.b.text.includes(q)),
  )
}

/** Repeat groups whose text or chapter labels contain the query. */
export function searchGroups(groups: RepeatGroup[], query: string): RepeatGroup[] {
  const q = query.trim()
  if (q === '') return groups
  return groups.filter((g) => g.text.includes(q) || g.occurrences.some((o) => where(o).includes(q)))
}

/** Identity of a result row for the export selection; stable across streamed updates. */
export function matchKey(m: ChapterMatch): string {
  return `${m.a}:${m.b}`
}

export function groupKey(g: RepeatGroup): string {
  return g.text
}

/** Warning shown when the MAX_RESULTS cap dropped the weakest findings. */
export function cappedNote(shown: number, total: number): string | null {
  return total > shown
    ? `전체 ${total.toLocaleString()}개 중 상위 ${shown.toLocaleString()}개만 표시해요`
    : null
}

/** "127화", or "본문" for a manuscript without chapters. */
export function chapterLabel(chapter: number | null): string {
  return chapter === null ? '본문' : `${chapter}화`
}

/** "27화~39화": first and last place of a repeat group. */
export function groupSpan(g: RepeatGroup): string {
  return `${where(g.occurrences[0]!)}~${where(g.occurrences[g.occurrences.length - 1]!)}`
}

/** "127화" or "1,532번째 문장" when the manuscript has no chapters. */
export function where(s: { chapter: number | null; sentenceIndex: number }): string {
  return s.chapter === null
    ? `${(s.sentenceIndex + 1).toLocaleString()}번째 문장`
    : `${s.chapter}화`
}

/** Position inside its chapter; the chapter itself is already in the row header. */
export function ordinal(s: { sentenceIndex: number }): string {
  return `${(s.sentenceIndex + 1).toLocaleString()}번째 문장`
}

export function firstLine(s: Span): string {
  return s.text.split('\n')[0] ?? ''
}
