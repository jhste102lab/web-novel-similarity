import {
  PARTIAL_EVERY_MS,
  PROGRESS_EVERY,
  REPEAT_MIN_GAP,
  TIER_EDITED,
} from '../shared/constants.ts'
import type { ManuscriptText, RepeatGroup, RepeatResult, RunStats } from '../shared/types.ts'
import { CandidateFinder } from './candidates.ts'
import { commonPhrases, inRange } from './common.ts'
import type { RunOptions } from './compare.ts'
import { similarity } from './editDistance.ts'
import { buildFingerprintIndex } from './fingerprints.ts'
import { indexSentences, sentenceText, type SentenceIndex } from './sentences.ts'

/** Finds sentences that recur (verbatim or lightly edited) inside one manuscript. */
export function findRepeats(
  a: ManuscriptText,
  opts: Omit<RunOptions, 'onPartial'> & { onPartial?: (r: RepeatResult) => void } = {},
): RepeatResult {
  const t0 = performance.now()
  const idx = indexSentences(a.text, a.chapters)
  const include = inRange(idx, opts.rangeA)
  const t1 = performance.now()
  const fp = buildFingerprintIndex(idx.norm, include)
  const finder = new CandidateFinder(fp, idx.norm.length)
  const n = idx.norm.length
  const t2 = performance.now()

  let queried = 0
  for (let i = 0; i < include.length; i++) if (include[i]) queried++
  const stats: RunStats = {
    indexMs: t1 - t0,
    fingerprintMs: t2 - t1,
    scanMs: 0,
    groupMs: 0,
    totalMs: 0,
    chars: a.text.length,
    sentencesA: queried,
    sentencesB: queried,
    // Self comparison scores each unordered pair once.
    pairsNaive: (queried * (queried - 1)) / 2,
    pairsScored: 0,
  }

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

  const common = commonPhrases([idx])
  const snapshot = (): RepeatResult => {
    const tg = performance.now()
    const result = buildResult(idx, include, find, common, stats)
    stats.groupMs = performance.now() - tg
    return result
  }

  let nextPartial = performance.now() + PARTIAL_EVERY_MS
  let joins = 0
  let lastEmitted = 0
  const scanStart = performance.now()
  for (let i = 0; i < n; i++) {
    if (i % PROGRESS_EVERY === 0) {
      opts.onProgress?.(i / n)
      const now = performance.now()
      if (opts.onPartial && now >= nextPartial && joins > lastEmitted) {
        lastEmitted = joins
        nextPartial = now + PARTIAL_EVERY_MS
        stats.scanMs = now - scanStart
        stats.totalMs = now - t0
        opts.onPartial(snapshot())
      }
    }
    if (!include[i]) continue
    const cands = finder.find(fp, i, i)
    for (let k = 0; k < cands.length; k += 2) {
      const j = cands[k]!
      stats.pairsScored++
      if (similarity(idx.norm[i]!, idx.norm[j]!, TIER_EDITED) > 0) {
        parent[find(j)] = find(i)
        joins++
      }
    }
  }
  stats.scanMs = performance.now() - scanStart

  const result = snapshot()
  opts.onProgress?.(1)
  // The snapshot copied stats before grouping finished, so the final numbers land on the copy.
  result.stats.groupMs = stats.groupMs
  result.stats.totalMs = performance.now() - t0
  return result
}

function buildResult(
  idx: SentenceIndex,
  include: Uint8Array,
  find: (x: number) => number,
  common: Set<string>,
  stats: RunStats,
): RepeatResult {
  const members = new Map<number, number[]>()
  for (let i = 0; i < idx.norm.length; i++) {
    if (!include[i]) continue
    const root = find(i)
    const list = members.get(root)
    if (list) list.push(i)
    else members.set(root, [i])
  }
  const groups: RepeatGroup[] = []
  for (const ids of members.values()) {
    ids.sort((x, y) => x - y)
    const kept: number[] = []
    for (const id of ids)
      if (kept.length === 0 || id - kept[kept.length - 1]! > REPEAT_MIN_GAP) kept.push(id)
    if (kept.length < 2) continue
    const first = kept[0]!
    // A stock phrase recurring across chapters is a habit, not a suspicion.
    if (common.has(idx.norm[first]!)) continue
    const occurrences = kept.map((id) => ({
      chapter: idx.chapter[id]! < 0 ? null : idx.chapter[id]!,
      sentenceIndex: idx.ordinal[id]!,
      start: idx.starts[id]!,
      end: idx.ends[id]!,
    }))
    groups.push({ text: sentenceText(idx, first), occurrences })
  }
  groups.sort((x, y) => y.occurrences.length - x.occurrences.length)
  return { kind: 'repeat', groups, stats: { ...stats } }
}
