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

| Path           | Role                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `src/parsers/` | bytes → text, chapter detection, `Manuscript` assembly                              |
| `src/engine/`  | sentence index, fingerprints, candidate retrieval, edit distance, compare, repeats  |
| `src/worker/`  | `protocol.ts` message types, `worker.ts` entry, `client.ts` `runInWorker`           |
| `src/app/`     | React screens (start / analyzing / results), slot state, range slider, export modal |
| `src/export/`  | printable report components and PNG/PDF saving                                      |
| `src/shared/`  | `types.ts` (data contracts), `constants.ts` (every tunable)                         |

## Pipeline

1. **Parse** — `parsers/`: bytes → text. `.txt` (UTF-8 with BOM handling, EUC-KR fallback), `.docx` (mammoth, dynamically imported), `.hwpx` (fflate + `DOMParser` on `Contents/section*.xml`). `.hwp` → `UnsupportedFormatError`.
2. **Chapters** — `parsers/chapters.ts`: filename numbers, filename order, or in-text title lines (rules in `CONTEXT.md`). `parsers/manuscript.ts` merges files into one `ManuscriptText` (`{ text, chapters }`).
3. **Sentence index** — `engine/sentences.ts`: split on Korean sentence enders and newlines; per sentence keep start/end offsets, chapter, in-chapter ordinal, and an NFC letters-only normalised form, in typed arrays.
4. **Candidate retrieval** — `engine/fingerprints.ts`: Rabin–Karp rolling hashes over `NGRAM`-char windows, winnowed with window `WINDOW`, inverted index over side B (over A itself in 내부 반복); fingerprints occurring in more than `MAX_POSTINGS` sentences are dropped as non-discriminative. `engine/candidates.ts` returns sentences sharing ≥ `MIN_SHARED_FINGERPRINTS` fingerprints.
5. **Precise compare** — `engine/editDistance.ts`: Ukkonen-banded Levenshtein on the normalised sentences → ratio; when only n-gram overlap supports a pair, the score is capped below the 일부 수정 threshold (`NGRAM_SCORE_CAP`).
6. **Passage chaining** — `engine/compare.ts`: pairs on one diagonal ((i,j) after (i−1,j−1)) become one passage; score = mean of member scores.
7. **Tier + tags** — tier from the _rounded_ percentage, so a displayed "90%" is never labelled below 거의 동일. 흔한 표현 (`engine/common.ts`) = sentence ≤ `COMMON_MAX_CHARS` chars appearing in ≥ `COMMON_MIN_CHAPTERS` chapters; such a passage is listed once, not once per pair.
8. **Repeats** — `engine/repeats.ts`: union-find over near-duplicate sentence pairs inside one manuscript; occurrences closer than `REPEAT_MIN_GAP` sentences count once.
9. **Result cap** — findings are sorted by score/occurrence count and cut to `MAX_RESULTS`; `total` carries the uncapped count and the UI says how many were hidden. Without the cap a 2M × 2M char pair produced ~600k passages and a multi-GB DOM.
10. **Diff for display** — `engine/diff.ts`: LCS character diff per passage, computed when a result row is opened; 1-char equal islands are folded into the surrounding change.

Scale target: 500 chapters × 4,000 chars per side (≈ 2M chars), ≤ 5 s.
Measured: ~1.5–1.7 s in Node and ~7 s end to end in Chrome including parsing
and rendering (`docs/plan/2026-09-21-benchmark.md`).

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
  tier: 'near' | 'edited' | 'partial'
  score: number // 0–100
  common: boolean
  a: Span
  b: Span
}
interface CompareResult {
  kind: 'compare'
  passages: Passage[]
  total: number // before the MAX_RESULTS cap
}
interface RepeatGroup {
  text: string
  common: boolean
  occurrences: { chapter: number | null; sentenceIndex: number }[]
}
interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
  total: number
}
```

Tier counts are derived in the UI (`src/app/results.ts`), not carried in the
result. Diffs are computed on demand, not stored.

## Thresholds

All in `src/shared/constants.ts`; rationale in
`docs/plan/2026-09-21-benchmark.md`.

| Constant                                   | Meaning                                  | Value                 |
| ------------------------------------------ | ---------------------------------------- | --------------------- |
| `NGRAM`                                    | fingerprint n-gram length                | 5                     |
| `WINDOW`                                   | winnowing window                         | 4                     |
| `MIN_SHARED_FINGERPRINTS`                  | candidate cut                            | 1                     |
| `MAX_POSTINGS`                             | fingerprint dropped above this           | 2,000                 |
| `TIER_NEAR`                                | score ≥ → 거의 동일                      | 0.90                  |
| `TIER_EDITED`                              | score ≥ → 일부 수정                      | 0.62                  |
| `TIER_PARTIAL`                             | score ≥ → 부분 유사; below → dropped     | 0.45                  |
| `NGRAM_SCORE_CAP`                          | ceiling for n-gram-only evidence         | `TIER_EDITED` − 0.01  |
| `COMMON_MAX_CHARS` / `COMMON_MIN_CHAPTERS` | 흔한 표현 tag                            | 14 chars / 4 chapters |
| `REPEAT_MIN_GAP`                           | 내부 반복 occurrences must be this apart | 1 sentence            |
| `MAX_RESULTS`                              | findings kept for display                | 3,000                 |
| `PROGRESS_EVERY`                           | progress tick, in query sentences        | 500                   |

## Export

- **PDF**: `window.print()` with `@media print` rules in `src/app/styles.css`. The report keeps selectable text and the browser paginates it. Rasterising the whole report into one image produced blank pages once it exceeded the canvas height limit.
- **PNG**: `html2canvas-pro`, scale capped so neither side exceeds `MAX_CANVAS_SIDE` (16,000 px).

## Build and deploy

Vite static build → `dist/`; GitHub Actions workflow on `main` publishes to
GitHub Pages. `base` is fixed to `/novel-similarity/`. No environment
variables. `html2canvas-pro` and `mammoth` are dynamically imported so they
stay out of the initial bundle.
