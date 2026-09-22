# Architecture

Current SSOT for runtime structure. Status: **implemented** — this document
describes the code in `src/`. Change the code and this document in the same
commit.

## Runtime shape

```
browser tab
 ├─ app (React, main thread)   drop files → parse → chapter table → postMessage
 └─ worker (Web Worker)        index → retrieve candidates → compare → chain → tier → postMessage
```

No network requests after the page loads. Parsing happens on the main thread
(it needs `DOMParser`, and `mammoth` is loaded on demand); only the extracted
text goes to the worker.

## Module map

| Path           | Role                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `src/parsers/` | bytes → text, chapter detection, `Manuscript` assembly                                               |
| `src/engine/`  | sentence index, fingerprints, candidate retrieval, edit distance, compare, repeats                   |
| `src/worker/`  | `protocol.ts` message types, `worker.ts` entry, `client.ts` `runInWorker`                            |
| `src/app/`     | React screens (start / analyzing / results), slot state, range slider, export modal, dotplot, panels |
| `src/export/`  | printable report components and PNG/PDF saving                                                       |
| `src/shared/`  | `types.ts` (data contracts), `constants.ts` (every tunable)                                          |
| `public/sw.js` | offline cache; the build injects this build's file names (`scripts/sw-precache.ts`)                  |

## Pipeline

1. **Parse** — `parsers/`: bytes → text. `.txt` (UTF-8 with BOM handling, EUC-KR fallback), `.docx` (mammoth, dynamically imported), `.hwpx` (fflate + `DOMParser` on `Contents/section*.xml`). `.hwp` → `UnsupportedFormatError`.
2. **Chapters** — `parsers/chapters.ts`: filename numbers, filename order, or in-text title lines (rules in `CONTEXT.md`). `parsers/manuscript.ts` merges files into one `ManuscriptText` (`{ text, chapters }`).
3. **Sentence index** — `engine/sentences.ts`: split on Korean sentence enders and newlines; per sentence keep start/end offsets, chapter, in-chapter ordinal, and an NFC letters-only normalised form, in typed arrays.
4. **Candidate retrieval** — `engine/fingerprints.ts`: Rabin–Karp rolling hashes over `NGRAM`-char windows, winnowed with window `WINDOW`, inverted index over side B (over A itself in 내부 반복); fingerprints occurring in more than `MAX_POSTINGS` sentences are dropped as non-discriminative. `engine/candidates.ts` returns sentences sharing ≥ `MIN_SHARED_FINGERPRINTS` fingerprints.
5. **Precise compare** — `engine/editDistance.ts`: Ukkonen-banded Levenshtein on the normalised sentences → ratio. Pairs below `TIER_EDITED` are discarded, so nothing weaker than 일부 수정 is ever reported. There is no n-gram-only fallback: it only produced hits in the old 부분 유사 band, which was pure noise on unrelated manuscripts.
6. **Passage chaining** — `engine/compare.ts`: pairs on one diagonal ((i,j) after (i−1,j−1)) become one passage; score = mean of member scores. **A run stops at a chapter boundary on either side**: a manuscript copied wholesale is one unbroken diagonal, and without the break every copied chapter collapsed into a single finding.
7. **Noise removal** — a one-sentence passage whose text is a 흔한 표현 (`engine/common.ts`: ≤ `COMMON_MAX_CHARS` chars, appearing in ≥ `COMMON_MIN_CHAPTERS` chapters) is dropped, not tagged. The same rule drops 흔한 표현 groups in 내부 반복.
8. **Chapter grouping** — passages are grouped by (chapter of A, chapter of B). One `ChapterMatch` = one row in the UI: tier (`near` when any of its passages is 거의 동일, from the _rounded_ percentage), `count` of suspicious passages, and the strongest `MAX_PASSAGES_PER_MATCH` of them in reading order. Scores exist only inside the engine; they are never shown, because the ratio is not calibrated against any external notion of copying.
9. **Repeats** — `engine/repeats.ts`: union-find over near-duplicate sentence pairs inside one manuscript; occurrences closer than `REPEAT_MIN_GAP` sentences count once.
10. **Result cap** — chapter pairs are sorted by 거의 동일 count, then passage count, and cut to `MAX_RESULTS`; `total` carries the uncapped count and the UI says how many were hidden.
11. **Streaming** — every `PARTIAL_EVERY_MS` the scan regroups the pairs found so far and posts them as a `partial` response. The UI leaves the progress screen at the first partial, so review starts about a second into a 2M-char run instead of after it. Stopping keeps what was scanned.
12. **Chapter map** — `buildGrid` emits one cell per chapter pair, **including pairs the `MAX_RESULTS` cap drops from the list**, for the dotplot. 내부 반복 builds the same shape from chapter pairs that share a repeated sentence.
13. **Diff for display** — `engine/diff.ts`: LCS character diff per passage, computed when a result row is opened; 1-char equal islands are folded into the surrounding change.

Scale target: 500 chapters × 4,000 chars per side (≈ 2M chars), ≤ 5 s.
Measured: ~1.5–1.7 s in Node and ~3.6 s end to end in Chrome including parsing
and rendering, with the first findings on screen after ~0.8 s
(`docs/plan/2026-09-21-benchmark.md`).

## Worker protocol

```ts
// src/worker/protocol.ts
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
  | { type: 'partial'; result: CompareResult | RepeatResult } // findings so far, repeatedly
  | { type: 'result'; result: CompareResult | RepeatResult }
  | { type: 'error'; message: string }
```

The engine is synchronous; 중단 terminates the worker (`client.ts`), so there
is no abort message and no cancellation checks inside the hot loops.

## Result types

`src/shared/types.ts` is the contract:

```ts
interface Span {
  chapter: number | null
  sentenceIndex: number
  text: string
}
interface Passage {
  tier: 'near' | 'edited'
  a: Span
  b: Span
}
interface ChapterMatch {
  a: number | null // chapter of A
  b: number | null
  tier: 'near' | 'edited' // 'near' when any passage is 거의 동일
  count: number // suspicious *sentences* in this chapter pair
  runs: number // passages found, including those beyond the cap
  passages: Passage[] // up to MAX_PASSAGES_PER_MATCH, strongest, in reading order
}
interface CompareResult {
  kind: 'compare'
  matches: ChapterMatch[]
  total: number // chapter pairs before the MAX_RESULTS cap
  grid: Grid | null // every chapter pair, capped and filtered, for the dotplot
  stats: RunStats // phase timings, sentence counts, pairs scored vs. pairs possible
}
interface RepeatGroup {
  text: string
  occurrences: { chapter: number | null; sentenceIndex: number }[]
}
interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
  total: number
  grid: Grid | null
  stats: RunStats
}
```

Tier counts are derived in the UI (`src/app/results.ts`), not carried in the
result. Diffs are computed on demand, not stored. Only suspicions reach the
UI and the report: everything below 일부 수정, and every 흔한 표현, is dropped
by the engine, so there is no "noise" filter to switch off.

## Thresholds

All in `src/shared/constants.ts`; rationale in
`docs/plan/2026-09-21-benchmark.md`.

| Constant                                   | Meaning                                  | Value                 |
| ------------------------------------------ | ---------------------------------------- | --------------------- |
| `MIN_SENTENCE_CHARS`                       | shorter sentences are not indexed        | 8                     |
| `NGRAM`                                    | fingerprint n-gram length                | 5                     |
| `WINDOW`                                   | winnowing window                         | 4                     |
| `MIN_SHARED_FINGERPRINTS`                  | candidate cut                            | 1                     |
| `MAX_POSTINGS`                             | fingerprint dropped above this           | 400                   |
| `MAX_CANDIDATES_PER_SENTENCE`              | candidates scored per query sentence     | 16                    |
| `TIER_NEAR`                                | score ≥ → 거의 동일                      | 0.90                  |
| `TIER_EDITED`                              | score ≥ → 일부 수정; below → dropped     | 0.62                  |
| `COMMON_MAX_CHARS` / `COMMON_MIN_CHAPTERS` | 흔한 표현, dropped                       | 14 chars / 4 chapters |
| `REPEAT_MIN_GAP`                           | 내부 반복 occurrences must be this apart | 3 sentences           |
| `MAX_RESULTS`                              | findings kept for display                | 3,000                 |
| `MAX_PASSAGES_PER_MATCH`                   | passages kept per chapter pair           | 20                    |
| `MAX_GRID_CELLS`                           | dotplot cells kept                       | 40,000                |
| `PROGRESS_EVERY`                           | progress tick, in query sentences        | 500                   |
| `PARTIAL_EVERY_MS`                         | streaming snapshot cadence               | 400 ms                |

## Result review

The two result views share `ResultsShell` in `src/app/ResultsScreen.tsx`:

- **Windowed list** — rows are a fixed 75 px (`.item` in `styles.css`, `ROW_H` in the view), so 3,000 findings render as ~20 nodes.
- **Keyboard** — `j`/`k`/arrows, `g`/`G`, `/` to search, `c` to copy, `m` for the map, `d` for diagnostics, `?` for the sheet.
- **Dotplot** (`src/app/Dotplot.tsx`) — chapter × chapter canvas, opacity by density on a √ scale, red where a pair contains 거의 동일; clicking a dot selects that chapter pair, and says so when the pair is outside the current list.
- **Diagnostics** (`src/app/Panels.tsx`) — phase timings plus `pairsScored / pairsNaive`, which is what the fingerprint index buys: 0.014 % on a 2M × 2M-char run.

## Offline

`public/sw.js` caches the shell and this build's JS/CSS at install, then every
same-origin GET as it is requested, cache-first with a background refresh.
Asset names are content-hashed, so a stale entry is never wrong; a new build
installs a new worker and `skipWaiting` + `clients.claim` hand over at once.
The point is verification, not speed: pulling the network and reloading proves
the "nothing is uploaded" claim.

## Export

- **PDF**: `window.print()` with `@media print` rules in `src/app/styles.css`. The report keeps selectable text and the browser paginates it. Rasterising the whole report into one image produced blank pages once it exceeded the canvas height limit.
- **PNG**: `html2canvas-pro`, scale capped so neither side exceeds `MAX_CANVAS_SIDE` (16,000 px).

## Build and deploy

Vite static build → `dist/`; GitHub Actions workflow on `main` publishes to
GitHub Pages. `base` is fixed to `/novel-similarity/`. No environment
variables. `html2canvas-pro` and `mammoth` are dynamically imported so they
stay out of the initial bundle.
