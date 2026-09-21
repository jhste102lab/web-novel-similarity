// Usage: node bench/run.ts [--report docs/plan/YYYY-MM-DD-benchmark.md]
import { writeFileSync } from 'node:fs'
import { compare, tierOf } from '../src/engine/compare.ts'
import { pairScore } from '../src/engine/editDistance.ts'
import { winnow } from '../src/engine/fingerprints.ts'
import { normalize } from '../src/engine/sentences.ts'
import { NGRAM_SCORE_CAP, TIER_EDITED, TIER_NEAR, TIER_PARTIAL } from '../src/shared/constants.ts'
import type { Chapter, ManuscriptText, Tier } from '../src/shared/types.ts'
import { CLASSES, EXPECTED, mutate, rng, type EditClass } from './mutate.ts'
import { SEEDS, STOCK } from './seeds.ts'

const out: string[] = []
const log = (s = ''): void => {
  out.push(s)
  console.log(s)
}
const pct = (x: number): string => `${Math.round(x * 100)}%`

function toManuscript(chapters: string[]): ManuscriptText {
  let text = ''
  const list: Chapter[] = []
  chapters.forEach((c, i) => {
    list.push({ label: i + 1, start: text.length })
    text += c + '\n\n'
  })
  return { text, chapters: list }
}

// 1. Sentence pairs: score distribution and tier agreement per edit class.
log(`# Benchmark ${new Date().toISOString().slice(0, 10)}`)
log()
log(
  `Thresholds: near ≥ ${TIER_NEAR}, edited ≥ ${TIER_EDITED}, partial ≥ ${TIER_PARTIAL}. Seeds: ${SEEDS.length}.`,
)
log()
log('## Sentence pairs (one edit class per seed)')
log()
log('| class | expected | n | min | p10 | median | p90 | agree |')
log('|---|---|---|---|---|---|---|---|')
const r = rng(42)
for (const cls of CLASSES) {
  const scores: number[] = []
  let agree = 0
  SEEDS.forEach((s, i) => {
    const other = SEEDS[(i + 37) % SEEDS.length]!
    const na = normalize(s)
    const nb = normalize(mutate(cls, s, other, r))
    const fa = winnow(na)
    const fb = new Set(winnow(nb))
    const shared = fa.filter((h) => fb.has(h)).length
    const score = pairScore(na, nb, shared, fa.length, fb.size, TIER_PARTIAL, NGRAM_SCORE_CAP)
    scores.push(score)
    const got: Tier | null = score >= TIER_PARTIAL ? tierOf(score) : null
    if (got === EXPECTED[cls]) agree++
  })
  scores.sort((x, y) => x - y)
  const q = (p: number): string =>
    pct(scores[Math.min(scores.length - 1, Math.floor(p * scores.length))]!)
  log(
    `| ${cls} | ${EXPECTED[cls] ?? '—'} | ${scores.length} | ${q(0)} | ${q(0.1)} | ${q(0.5)} | ${q(0.9)} | ${pct(agree / scores.length)} |`,
  )
}

// 2. Documents: plant one mutated copy per seed into B (shuffled inside each chapter),
//    measure recall per class and false positives.
function buildDocs(): { a: ManuscriptText; b: ManuscriptText; planted: Map<string, EditClass> } {
  const r2 = rng(7)
  const planted = new Map<string, EditClass>()
  const chaptersA: string[] = []
  const chaptersB: string[] = []
  const perChapter = 8
  for (let c = 0; c < Math.ceil(SEEDS.length / perChapter); c++) {
    const seeds = SEEDS.slice(c * perChapter, (c + 1) * perChapter)
    const linesA = [...seeds]
    const linesB: string[] = []
    seeds.forEach((s, k) => {
      const cls = CLASSES[(c * perChapter + k) % CLASSES.length]!
      const other = SEEDS[(c * perChapter + k + 41) % SEEDS.length]!
      // Unrelated: shuffle words of another seed so vocabulary overlaps but the sentence does not.
      const shuffled = other
        .split(' ')
        .sort(() => r2() - 0.5)
        .join(' ')
      linesB.push(mutate(cls, s, shuffled, r2))
      planted.set(s, cls)
    })
    // Stock sentences in every chapter of both sides → must be tagged 흔한 표현, not counted as findings.
    linesA.splice(3, 0, STOCK[c % STOCK.length]!)
    linesB.splice(2, 0, STOCK[c % STOCK.length]!)
    chaptersA.push(`#${c + 1}화\n${linesA.join('\n')}`)
    chaptersB.push(`#${c + 1}화\n${linesB.sort(() => r2() - 0.5).join('\n')}`)
  }
  return { a: toManuscript(chaptersA), b: toManuscript(chaptersB), planted }
}

log()
log('## Planted passages in documents')
log()
const docs = buildDocs()
const result = compare(docs.a, docs.b)
const found = new Map<string, Tier>()
let falsePositives = 0
let commonTagged = 0
for (const p of result.passages) {
  if (p.common) commonTagged++
  let hit = false
  for (const [seed] of docs.planted) {
    if (!p.a.text.includes(seed) && !seed.includes(p.a.text)) continue
    hit = true
    if (!found.has(seed)) found.set(seed, p.tier)
  }
  if (!hit && !p.common) falsePositives++
}
log('| class | expected | planted | reported | as expected |')
log('|---|---|---|---|---|')
for (const cls of CLASSES) {
  const seeds = [...docs.planted].filter(([, c]) => c === cls).map(([s]) => s)
  const reported = seeds.filter((s) => found.has(s)).length
  const ok = seeds.filter((s) => (found.get(s) ?? null) === EXPECTED[cls]).length
  log(`| ${cls} | ${EXPECTED[cls] ?? '—'} | ${seeds.length} | ${reported} | ${ok} |`)
}
log()
log(
  `False positives (not planted, not 흔한 표현): ${falsePositives}. Passages tagged 흔한 표현: ${commonTagged}.`,
)

// 3. Performance: 500 chapters × ~4,000 chars per side, heavy overlap (worst case for candidates).
function bigDoc(seed: number, chapters: number, charsPerChapter: number): ManuscriptText {
  const r3 = rng(seed)
  const list: string[] = []
  for (let c = 0; c < chapters; c++) {
    const lines: string[] = []
    let len = 0
    while (len < charsPerChapter) {
      const s = SEEDS[Math.floor(r3() * SEEDS.length)]!
      const cls = CLASSES[Math.floor(r3() * (CLASSES.length - 1))]!
      const line = mutate(cls, s, s, r3)
      lines.push(line)
      len += line.length + 1
    }
    list.push(`#${c + 1}화\n${lines.join('\n')}`)
  }
  return toManuscript(list)
}

log()
log('## Performance')
log()
const A = bigDoc(1, 500, 4000)
const B = bigDoc(2, 500, 4000)
const t0 = performance.now()
const big = compare(A, B)
const ms = Math.round(performance.now() - t0)
log(
  `A ${A.text.length.toLocaleString()} chars, B ${B.text.length.toLocaleString()} chars, ${big.passages.length.toLocaleString()} passages, ${ms} ms (Node ${process.version}).`,
)

const reportAt = process.argv.indexOf('--report')
if (reportAt >= 0) {
  writeFileSync(process.argv[reportAt + 1]!, out.join('\n') + '\n')
  console.log(`\nwritten ${process.argv[reportAt + 1]}`)
}
