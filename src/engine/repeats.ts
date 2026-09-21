import { REPEAT_MIN_GAP, TIER_EDITED, PROGRESS_EVERY, MAX_RESULTS } from '../shared/constants.ts'
import type { ManuscriptText, RepeatGroup, RepeatResult } from '../shared/types.ts'
import { CandidateFinder } from './candidates.ts'
import { commonPhrases, inRange } from './common.ts'
import type { RunOptions } from './compare.ts'
import { similarity } from './editDistance.ts'
import { buildFingerprintIndex } from './fingerprints.ts'
import { indexSentences, sentenceText } from './sentences.ts'

/** Finds sentences that recur (verbatim or lightly edited) inside one manuscript. */
export function findRepeats(a: ManuscriptText, opts: RunOptions = {}): RepeatResult {
  const idx = indexSentences(a.text, a.chapters)
  const include = inRange(idx, opts.rangeA)
  const fp = buildFingerprintIndex(idx.norm, include)
  const finder = new CandidateFinder(fp, idx.norm.length)
  const n = idx.norm.length

  // Union-find over sentence ids; near-duplicate pairs join the same group.
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  for (let i = 0; i < n; i++) {
    if (i % PROGRESS_EVERY === 0) opts.onProgress?.(i / n)
    if (!include[i]) continue
    const cands = finder.find(fp, i, i)
    for (let k = 0; k < cands.length; k += 2) {
      const j = cands[k]!
      if (similarity(idx.norm[i]!, idx.norm[j]!, TIER_EDITED) > 0) parent[find(j)] = find(i)
    }
  }

  const members = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    if (!include[i]) continue
    const root = find(i)
    const list = members.get(root)
    if (list) list.push(i)
    else members.set(root, [i])
  }
  const common = commonPhrases([idx])
  const groups: RepeatGroup[] = []
  for (const ids of members.values()) {
    ids.sort((x, y) => x - y)
    const kept: number[] = []
    for (const id of ids)
      if (kept.length === 0 || id - kept[kept.length - 1]! > REPEAT_MIN_GAP) kept.push(id)
    if (kept.length < 2) continue
    const first = kept[0]!
    groups.push({
      text: sentenceText(idx, first),
      common: common.has(idx.norm[first]!),
      occurrences: kept.map((id) => ({
        chapter: idx.chapter[id]! < 0 ? null : idx.chapter[id]!,
        sentenceIndex: idx.ordinal[id]!,
      })),
    })
  }
  groups.sort((x, y) => y.occurrences.length - x.occurrences.length)
  opts.onProgress?.(1)
  return { kind: 'repeat', total: groups.length, groups: groups.slice(0, MAX_RESULTS) }
}
