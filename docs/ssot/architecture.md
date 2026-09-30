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

No network requests after the page loads, except the lazily loaded chunks of
this site. Parsing happens on the main thread (HWPX needs `DOMParser`;
`mammoth` and rhwp are loaded on demand); only the extracted text goes to the
worker.

## File map

Where to look first for a given change. Tests sit next to their module.

| Path                                                              | What lives there                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                                    | React root, stylesheet imports, service-worker registration, HWP reader preload after `load`            |
| `src/shared/types.ts`                                             | Data contracts between parser, engine, worker and UI                                                    |
| `src/shared/constants.ts`                                         | Every threshold and limit (table below)                                                                 |
| `src/parsers/parseFile.ts`                                        | Extension → text; `.docx` via mammoth; `.hwp`/`.hwpx` by content (ZIP → HWPX, else HWP 5)               |
| `src/parsers/text.ts`, `hwpx.ts`, `hwp.ts`                        | `.txt` decoding (BOM, EUC-KR fallback); HWPX section XML; HWP 5 via rhwp (ADR 0005)                     |
| `src/parsers/chapters.ts`                                         | Chapter detection: filename numbers, filename order, title lines                                        |
| `src/parsers/manuscript.ts`                                       | Many files → one `Manuscript` (split by title lines when every file has them) → engine `ManuscriptText` |
| `src/engine/sentences.ts`                                         | Sentence split and normalised index in typed arrays                                                     |
| `src/engine/fingerprints.ts`, `candidates.ts`                     | Winnowing fingerprints, inverted index, candidate pairs                                                 |
| `src/engine/editDistance.ts`                                      | Banded Levenshtein → similarity ratio                                                                   |
| `src/engine/common.ts`                                            | 흔한 표현 detection, chapter-range mask                                                                 |
| `src/engine/compare.ts`                                           | A/B scan, passage chaining, chapter grouping, streaming snapshots                                       |
| `src/engine/repeats.ts`                                           | 내부 반복: union-find over near-duplicates in one manuscript                                            |
| `src/engine/diff.ts`                                              | Character diff behind the marks in the detail pane and the report                                       |
| `src/worker/`                                                     | `protocol.ts` messages, `worker.ts` entry, `client.ts` `runInWorker` (abort = terminate)                |
| `src/app/App.tsx`                                                 | Screen state machine (start → analyzing → results), header, export wiring                               |
| `src/app/StartScreen.tsx`, `SlotCard.tsx`, `RangeSlider.tsx`      | File slots, chapter table edits, 검사 범위                                                              |
| `src/app/slot.ts`, `dropFiles.ts`                                 | Slot model and labels; folder drops                                                                     |
| `src/app/AnalyzingScreen.tsx`                                     | Progress until the first findings arrive                                                                |
| `src/app/ResultsShell.tsx`                                        | Shared result layout: windowed list, row ticks for export, keyboard, search, panels                     |
| `src/app/CompareView.tsx`, `RepeatView.tsx`                       | Row and detail rendering for each mode                                                                  |
| `src/app/results.ts`                                              | Tier labels, filters, search, row keys, position labels shared by views and report                      |
| `src/app/CopyButton.tsx`, `Marked.tsx`, `Modal.tsx`, `Panels.tsx` | Copy, shared-text marks, confirm dialog, diagnostics/shortcut HUDs                                      |
| `src/app/ExportOverlay.tsx`, `src/export/`                        | Export dialog; printable report; repeat context lookup; PNG pieces and PDF saving                       |
| `src/app/styles/`                                                 | One stylesheet per screen; `export.css` holds the print rules                                           |
| `public/sw.js`, `scripts/sw-precache.ts`                          | Offline cache; the build injects hashed file names                                                      |
| `scripts/compare.ts`                                              | CLI: compare two files, or find repeats in one                                                          |
| `bench/`                                                          | Synthetic corpus generator and threshold benchmark (`npm run bench`)                                    |

## Pipeline

1. **Parse** — `parsers/`: bytes → text. `.txt` (UTF-8 with BOM handling, EUC-KR fallback), `.docx` (mammoth, dynamically imported). `.hwp` and `.hwpx` are told apart by content, not name: a ZIP is HWPX (fflate + `DOMParser` on `Contents/section*.xml`; each `<hp:t>` belongs to its closest `<hp:p>` so table cells are not doubled; `<hp:lineBreak/>` → newline), anything else goes to rhwp (`@rhwp/core`, dynamically imported WASM, `getTextFileUnicode`). A password-protected HWP 5 file → `EncryptedFileError`. Any other failure names the file (`FileReadError` in `app/slot.ts`).
2. **Chapters** — `parsers/chapters.ts`: filename numbers, filename order, or in-text title lines (rules in `CONTEXT.md`). `parsers/manuscript.ts` merges files into one `ManuscriptText` (`{ text, chapters }`); text before the first title stays in the first chapter.
3. **Sentence index** — `engine/sentences.ts`: split on Korean sentence enders and newlines; per sentence keep start/end offsets, chapter, in-chapter ordinal, and an NFC letters-only normalised form, in typed arrays.
4. **Candidate retrieval** — `engine/fingerprints.ts`: Rabin–Karp rolling hashes over `NGRAM`-char windows, winnowed with window `WINDOW`, inverted index over side B (over A itself in 내부 반복); fingerprints occurring in more than `MAX_POSTINGS` sentences are dropped as non-discriminative. `engine/candidates.ts` returns sentences sharing ≥ `MIN_SHARED_FINGERPRINTS` fingerprints.
5. **Precise compare** — `engine/editDistance.ts`: Ukkonen-banded Levenshtein on the normalised sentences → ratio. Pairs below `TIER_EDITED` are discarded, so nothing weaker than 일부 수정 is ever reported. There is no n-gram-only fallback: it only produced hits in the old 부분 유사 band, which was pure noise on unrelated manuscripts.
6. **Passage chaining** — `engine/compare.ts`: pairs on one diagonal ((i,j) after (i−1,j−1)) become one passage; score = mean of member scores. **A run stops at a chapter boundary on either side**: a manuscript copied wholesale is one unbroken diagonal, and without the break every copied chapter collapsed into a single finding.
7. **Noise removal** — a one-sentence passage whose text is a 흔한 표현 (`engine/common.ts`: ≤ `COMMON_MAX_CHARS` chars, appearing in ≥ `COMMON_MIN_CHAPTERS` chapters) is dropped, not tagged. The same rule drops 흔한 표현 groups in 내부 반복.
8. **Chapter grouping** — passages are grouped by (chapter of A, chapter of B). One `ChapterMatch` = one row in the UI: tier (`near` when any of its passages is 거의 동일, from the _rounded_ percentage), `count` of matched sentences, `runs` of passages, and the strongest `MAX_PASSAGES_PER_MATCH` of them in reading order. Scores exist only inside the engine; they are never shown, because the ratio is not calibrated against any external notion of copying.
9. **Repeats** — `engine/repeats.ts`: union-find over near-duplicate sentence pairs inside one manuscript; occurrences closer than `REPEAT_MIN_GAP` sentences count once.
10. **Result cap** — chapter pairs are sorted by 거의 동일 count, then matched-sentence count, and cut to `MAX_RESULTS`; `total` carries the uncapped count and the UI says how many were hidden.
11. **Streaming** — every `PARTIAL_EVERY_MS` the scan regroups the pairs found so far and posts them as a `partial` response. The UI leaves the progress screen at the first partial, so review starts about a second into a 2M-char run instead of after it. Stopping keeps what was scanned.
12. **Diff for display** — `engine/diff.ts`: LCS character diff per passage, computed when a result row is opened or a report row is rendered; 1-char equal islands are folded into the surrounding change. Above 250,000 LCS cells (a whole copied chapter) the texts are first matched sentence by sentence and only the unmatched stretches between equal sentences are diffed by character. The UI marks the **shared** text (`Marked.tsx`).

Scale target: 500 chapters × 4,000 chars per side (≈ 2M chars), ≤ 5 s.
Measured: ~1.5–1.7 s in Node and ~3.6 s end to end in Chrome including parsing
and rendering, with the first findings on screen after ~0.8 s
(`docs/benchmark.md`).

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
  stats: RunStats // phase timings, sentence counts, pairs scored vs. pairs possible
}
interface RepeatGroup {
  text: string
  // id: sentence id in indexSentences() of the searched text, for the report's context lookup
  occurrences: { chapter: number | null; sentenceIndex: number; id: number }[]
}
interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
  total: number
  stats: RunStats
}
```

Tier counts are derived in the UI (`src/app/results.ts`), not carried in the
result. Diffs are computed on demand, not stored. Only suspicions reach the
UI and the report: everything below 일부 수정, and every 흔한 표현, is dropped
by the engine, so there is no "noise" filter to switch off.

## Thresholds

All in `src/shared/constants.ts`; rationale in
`docs/benchmark.md`.

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
| `PROGRESS_EVERY`                           | progress tick, in query sentences        | 500                   |
| `PARTIAL_EVERY_MS`                         | streaming snapshot cadence               | 400 ms                |

## Result review

The two result views (`CompareView`, `RepeatView`) share `ResultsShell` in `src/app/ResultsShell.tsx`:

- **Windowed list** — rows are a fixed 75 px (`.item` in `styles/results.css`, `ROW_H` in `ResultsShell.tsx`), so 3,000 findings render as ~20 nodes.
- **Keyboard** — `j`/`k`/arrows, `g`/`G`, `/` to search, `x` to tick a row for export, `c` to copy, `d` for diagnostics, `?` for the sheet. Shift+click ticks every row between the last clicked one and this one; 전체 선택 ticks the rows the tab and search leave visible. Ticks are keyed by chapter pair / group text (`matchKey`, `groupKey`) and live in `App`, like the search query, so the export can use them.
- **Repeat detail** — the first 100 places of a group are listed; `외 N곳 더 보기` lists the rest.
- **Diagnostics** (`src/app/Panels.tsx`) — phase timings plus `pairsScored / pairsNaive`, which is what the fingerprint index buys: 0.014 % on a 2M × 2M-char run.

## Offline

`public/sw.js` caches the shell and this build's JS, CSS and rhwp's WASM
(~3.7 MB gzipped, ADR 0006) at install, then every same-origin GET as it is
requested.
Assets are cache-first (their names carry a
content hash, so a hit is never the wrong file); **navigations are network-first**
with a cache fallback, because the HTML shell names the hashed assets of its build
and serving a cached one pins the whole app to an old version. The cache is named
after the build, so `activate` drops the previous one.
The point is verification, not speed: pulling the network and reloading proves
the "nothing is uploaded" claim.

## Export

The overlay picks what goes in (**범위**) and how much of each row (**분량**); rows come from `App.tsx`:

- 범위: 지금 목록 (tab + search, as on screen), 상위 10/50/100 of that list, or 선택한 N개 (ticked rows, whatever the tab). Opening the overlay with ticked rows selects 선택한 N개.
- 분량: 요약표만 (one table row per finding), 일부 (compare: the first 3 sentences of each passage, repeat: the first 3 places, then `… 외 N`), 전부 (default). Repeat places show the sentence before and after within the same chapter segment, short ones included (`src/export/context.ts` re-indexes the searched text, finds the occurrence by `id`, and reads the neighbours from the raw text). The report's 범위 line counts against the uncapped `total`.
- The header shows `A4 약 N쪽`: the report cloned at the A4 text width (688 px) divided by 920 px, a figure calibrated against Chrome's PDF of `docs/samples`.
- **PDF**: `window.print()` with `@media print` rules in `src/app/styles/export.css`. The report keeps selectable text and the browser paginates it. The print rules undo the overlay's scroll box and height cap (with them the printout stopped after one screenful), print two-column blocks as tables so every browser can split them across pages, and keep colours (`print-color-adjust: exact`).
- **PNG**: `html2canvas-pro` at 2×. A report taller than one canvas (`MAX_CANVAS_SIDE`, 16,000 px) is cut into pieces of whole rows (a longer row is split between its children, a summary table between its rows with the header repeated), each rendered from a clone outside the overlay and zipped with fflate (stored, not deflated). Marks are split per word in the clones and words kept whole: html2canvas paints a mark that wraps as one box over both lines.

## Build and deploy

Vite static build → `dist/`; GitHub Actions workflow on `main` publishes to
GitHub Pages. `base` is `/web-novel-similarity/`, the repository name. No environment
variables. `html2canvas-pro`, `mammoth` and `@rhwp/core` are dynamically
imported so they stay out of the initial bundle; rhwp is then fetched after the
page's `load` event (ADR 0006).
