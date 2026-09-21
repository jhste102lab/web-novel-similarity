import {
  NGRAM_SCORE_CAP,
  TIER_EDITED,
  TIER_NEAR,
  TIER_PARTIAL,
  PROGRESS_EVERY,
  MAX_RESULTS,
} from '../shared/constants.ts'
import type { ChapterRange, CompareResult, ManuscriptText, Passage, Tier } from '../shared/types.ts'
import { CandidateFinder } from './candidates.ts'
import { commonPhrases, inRange } from './common.ts'
import { pairScore } from './editDistance.ts'
import { buildFingerprintIndex } from './fingerprints.ts'
import { indexSentences, type SentenceIndex } from './sentences.ts'

export interface RunOptions {
  rangeA?: ChapterRange
  rangeB?: ChapterRange
  /** Called with 0–1 every PROGRESS_EVERY query sentences. Abort is done by terminating the worker. */
  onProgress?: (pct: number) => void
}

export function tierOf(score: number): Tier {
  return score >= TIER_NEAR ? 'near' : score >= TIER_EDITED ? 'edited' : 'partial'
}

/** Matched sentence pair; `key` = i * stride + j lets passage chaining find the diagonal predecessor. */
interface Pair {
  i: number
  j: number
  score: number
}

export function compare(
  a: ManuscriptText,
  b: ManuscriptText,
  opts: RunOptions = {},
): CompareResult {
  const idxA = indexSentences(a.text, a.chapters)
  const idxB = indexSentences(b.text, b.chapters)
  const includeA = inRange(idxA, opts.rangeA)
  const fpA = buildFingerprintIndex(idxA.norm, includeA)
  const fpB = buildFingerprintIndex(idxB.norm, inRange(idxB, opts.rangeB))
  const finder = new CandidateFinder(fpB, idxB.norm.length)

  const pairs: Pair[] = []
  for (let i = 0; i < idxA.norm.length; i++) {
    if (i % PROGRESS_EVERY === 0) opts.onProgress?.(i / idxA.norm.length)
    if (!includeA[i]) continue
    const cands = finder.find(fpA, i)
    for (let k = 0; k < cands.length; k += 2) {
      const j = cands[k]!
      const score = pairScore(
        idxA.norm[i]!,
        idxB.norm[j]!,
        cands[k + 1]!,
        fpA.fpStart[i + 1]! - fpA.fpStart[i]!,
        fpB.fpStart[j + 1]! - fpB.fpStart[j]!,
        TIER_PARTIAL,
        NGRAM_SCORE_CAP,
      )
      if (score > 0) pairs.push({ i, j, score })
    }
  }
  const common = commonPhrases([idxA, idxB])
  const runs = chainRuns(pairs, idxB.norm.length + 1)
  // Rounded percentage decides the tier so "90%" is never shown as a lower tier than 90 means.
  for (const r of runs) r.score = Math.round((r.sum / r.len) * 100)
  const kept = dedupeCommon(runs, idxA, common)
  kept.sort((x, y) => y.score - x.score || x.i0 - y.i0)
  opts.onProgress?.(1)
  return {
    kind: 'compare',
    total: kept.length,
    passages: kept.slice(0, MAX_RESULTS).map((r) => ({
      tier: tierOf(r.score / 100),
      score: r.score,
      common: r.common,
      a: span(idxA, r.i0, r.i1),
      b: span(idxB, r.j0, r.j1),
    })),
  }
}

/** A stock phrase matching in many places is listed once, not once per place pair. */
function dedupeCommon(runs: Run[], idxA: SentenceIndex, common: Set<string>): Run[] {
  const seen = new Set<string>()
  return runs.filter((r) => {
    const norm = idxA.norm[r.i0]!
    r.common = r.len === 1 && common.has(norm)
    if (!r.common) return true
    if (seen.has(norm)) return false
    seen.add(norm)
    return true
  })
}

/** One diagonal run of matched sentence pairs, before it is turned into a Passage. */
interface Run {
  i0: number
  j0: number
  i1: number
  j1: number
  sum: number
  len: number
  score: number
  common: boolean
}

/** Joins pairs lying on one diagonal ((i,j) after (i-1,j-1)) into runs. */
function chainRuns(pairs: Pair[], stride: number): Run[] {
  pairs.sort((x, y) => x.i - y.i || x.j - y.j)
  const runs: Run[] = []
  const runAt = new Map<number, number>()
  for (const p of pairs) {
    const prev = runAt.get((p.i - 1) * stride + (p.j - 1))
    if (prev === undefined) {
      runAt.set(p.i * stride + p.j, runs.length)
      runs.push({
        i0: p.i,
        j0: p.j,
        i1: p.i,
        j1: p.j,
        sum: p.score,
        len: 1,
        score: 0,
        common: false,
      })
    } else {
      const r = runs[prev]!
      r.i1 = p.i
      r.j1 = p.j
      r.sum += p.score
      r.len++
      runAt.set(p.i * stride + p.j, prev)
    }
  }
  return runs
}

function span(idx: SentenceIndex, from: number, to: number): Passage['a'] {
  const c = idx.chapter[from]!
  return {
    chapter: c < 0 ? null : c,
    sentenceIndex: idx.ordinal[from]!,
    text: idx.text.slice(idx.starts[from], idx.ends[to]).trim(),
  }
}
