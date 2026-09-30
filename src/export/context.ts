import { indexSentences, sentenceText } from '../engine/sentences.ts'
import type { ManuscriptText, Occurrence } from '../shared/types.ts'

/** A repeated sentence where it occurs, with the sentences around it in the same 회차. */
export interface Context {
  before: string
  text: string
  after: string
}

/**
 * Looks occurrences up in the text the repeat search ran on: the same text indexes to the
 * same sentence ids. Neighbours from another 회차 are left out.
 */
export function contextOf(m: ManuscriptText): (o: Occurrence) => Context {
  const idx = indexSentences(m.text, m.chapters)
  const near = (o: Occurrence, id: number): string =>
    id >= 0 && id < idx.norm.length && idx.chapter[id] === idx.chapter[o.id]
      ? sentenceText(idx, id)
      : ''
  return (o) => ({
    before: near(o, o.id - 1),
    text: sentenceText(idx, o.id),
    after: near(o, o.id + 1),
  })
}
