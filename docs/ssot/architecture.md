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
| `src/engine/context.ts`                                           | Offset-based neighbouring sentence pieces shared by detail panes and PDF                                |
| `src/worker/`                                                     | `protocol.ts` messages, `worker.ts` entry, `client.ts` `runInWorker` (abort = terminate)                |
| `src/app/App.tsx`                                                 | Screen state machine (start → analyzing → results), header, export wiring                               |
| `src/app/StartScreen.tsx`, `SlotCard.tsx`, `RangeSlider.tsx`      | File slots, chapter table edits, 검사 범위                                                              |
| `src/app/slot.ts`, `dropFiles.ts`                                 | Slot model and labels; folder drops                                                                     |
| `src/app/AnalyzingScreen.tsx`                                     | Progress until the first findings arrive                                                                |
| `src/app/ResultsShell.tsx`                                        | Shared result layout: windowed list, sort bar, keyboard, search, panels                                 |
| `src/app/CompareView.tsx`, `RepeatView.tsx`                       | Row and detail rendering for each mode                                                                  |
| `src/app/results.ts`                                              | Tier labels, filters, search, sorting and position labels shared by views and PDF                       |
| `src/app/blocks.ts`                                               | A chapter pair's findings as joined, linked stretches for the detail pane and the PDF                   |
| `src/app/CopyButton.tsx`, `Marked.tsx`, `Modal.tsx`, `Panels.tsx` | Copy, shared-text marks, confirm dialog, diagnostics/shortcut HUDs                                      |
| `src/export/pdf.ts`, `pdf.worker.ts`, `exportPdf.ts`              | DOM-free PDF layout; PDFKit worker; progress, cancellation and download client                          |
| `src/app/styles/`                                                 | One stylesheet per screen                                                                               |
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
10. **Result order** — chapter pairs are sorted by 거의 동일 sentence count, then matched-sentence count; repeat groups by occurrence count. Every finding is kept. The UI defaults to chapter order and can switch back to this engine order.
11. **Streaming** — every `PARTIAL_EVERY_MS` the scan regroups the pairs found so far and posts them as a `partial` response. The UI leaves the progress screen at the first partial, so review starts about a second into a 2M-char run instead of after it. Stopping keeps what was scanned.
12. **Diff for display** — `engine/diff.ts`: LCS character diff per passage, computed when a result row is opened or the PDF is laid out; 1-char equal islands are folded into the surrounding change. Above 250,000 LCS cells (a whole copied chapter) the texts are first matched sentence by sentence and only the unmatched stretches between equal sentences are diffed by character. The UI and PDF mark the **shared** text.

Scale target: 500 chapters × 4,000 chars per side (≈ 2M chars), ≤ 5 s.
Measured without a result cap: 6.5 s end to end in Chrome on an M5 Mac for
168,083 chapter pairs, with 1.66 GB main-thread JS heap after results; changing
sort order took 0.1 s (`docs/benchmark.md`, 2026-09-30).

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
  start: number // [start, end) offsets in the engine text
  end: number
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
  stats: RunStats // phase timings, sentence counts, pairs scored vs. pairs possible
}
interface Occurrence {
  chapter: number | null
  sentenceIndex: number
  start: number // [start, end) offsets in the engine text
  end: number
}
interface RepeatGroup {
  text: string
  occurrences: Occurrence[]
}
interface RepeatResult {
  kind: 'repeat'
  groups: RepeatGroup[]
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
| `MAX_PASSAGES_PER_MATCH`                   | passages kept per chapter pair           | 20                    |
| `PROGRESS_EVERY`                           | progress tick, in query sentences        | 500                   |
| `PARTIAL_EVERY_MS`                         | streaming snapshot cadence               | 400 ms                |

## Result review

The two result views (`CompareView`, `RepeatView`) share `ResultsShell` in `src/app/ResultsShell.tsx`:

- **Windowed list** — rows are a fixed 75 px (`.item` in `styles/results.css`, `ROW_H` in `ResultsShell.tsx`); only the viewport plus six rows on each side is rendered, even with 168,083 findings. No findings are hidden by a result cap.
- **Sorting** — `.sortbar` above the list offers 회차순 (default: A chapter then B chapter for comparison; first occurrence offset for repeats) and 유사도순 / 반복 많은 순 (engine order). `Order = 'chapter' | 'score'`, `sortMatches` and `sortGroups` live in `results.ts`; `App.tsx` owns the order, also used by the PDF.
- **Keyboard** — `j`/`k`/arrows, `g`/`G`, `/` to search, `c` to copy, `d` for diagnostics, `?` for the sheet. There are no export checkboxes or row-selection shortcuts.
- **Context** — comparison passages and repeat places show up to four sentences before and after in dimmed `.ctx` text, never marked. `aroundOf(ManuscriptText)` returns `(start, end) => { before, text, after }` from `engine/context.ts`; chapter segment boundaries are found by offset, not label. `before`/`after` are raw slices that keep the manuscript's line breaks (runs of blank lines collapse to one) and carry their own separator, so views concatenate them without adding spaces; panes and repeat places use `white-space: pre-line`. Short sentence pieces count; neighbours beyond the 1,000-character lookup reach show only their nearer part.
- **Joined context** — `joinOf(ManuscriptText)` in `engine/context.ts` takes a chapter pair's finding spans and returns `Joined[]`: spans whose context bounds overlap become one stretch, split into context and finding `pieces` (finding pieces carry their span index). `blocksOf` in `src/app/blocks.ts` joins A and B spans separately and links stretches through findings (union-find) into blocks. A block is rows of `{ a, b }` boxes (`PdfBlock`): each A stretch in reading order, beside the first B stretch whose first matched A stretch it is; further such B stretches get rows with `a: null`. Each box has `label` (`원본.txt · 12화 · 3·5번째 문장`), `link` (`↔ B 6·30번째 문장`) and `pieces`; a finding matched in several places is marked against the first. The detail pane (`MatchDetail` in `CompareView.tsx`, one `.blk` per block, `.pane.none` for an empty side) and the report use the same blocks.
- **File names** — `slotFileAt(slot)` (`src/app/slot.ts`) maps an engine-text offset to its source file (`Part.file`), in `engineOrder`. The comparison detail header reads `A 원본.txt ↔ B 편집본.txt`, a `.cmp.chs` row puts each side's 회차 over its column, and each pane is labelled `A 원본.txt · 3화 · 1번째 문장`.
- **Loading files** — `loadSlot(files, onProgress)` yields a frame before parsing and then at most every 50 ms, so the slot card's `.slot.loading` spinner (a compositor-driven CSS rotation) and, for many files, `n / N개` with a bar are painted while files are read.
- **Repeat detail** — the first 100 places of a group are listed; `외 N곳 더 보기` lists the rest.
- **Diagnostics** (`src/app/Panels.tsx`) — phase timings plus `pairsScored / pairsNaive`, which is what the fingerprint index buys: 0.014 % on a 2M × 2M-char run.

## Offline

`public/sw.js` caches the shell and this build's JS, CSS, rhwp's WASM
and the report's TTF font at install, then every same-origin GET as it is
requested. `scripts/sw-precache.ts` includes `.ttf`, so PDF export works offline.
Assets are cache-first (their names carry a
content hash, so a hit is never the wrong file); **navigations are network-first**
with a cache fallback, because the HTML shell names the hashed assets of its build
and serving a cached one pins the whole app to an old version. The cache is named
after the build, so `activate` drops the previous one.
The point is verification, not speed: pulling the network and reloading proves
the "nothing is uploaded" claim.

## Export

내보내기 opens the `.ov` overlay at once and builds a **preview** of the report's
first `PREVIEW_PAGES` (30) pages, shown in the browser's own PDF viewer
(`<iframe>` on a blob URL) with `전체 N쪽 · 앞 30쪽 미리보기`. There is no export
setting. The report holds the **active tab's findings** (search ignored; the
first page's `담은 결과` names the tab), in the list's current sort order. The per-chapter-pair passage limit still applies;
repeats include every place.

- **Client** — `src/export/exportPdf.ts` starts a fresh worker per build and returns `{ blob, pages }`. `PDF로 저장` asks `PDF로 저장할까요?` (예/아니오); then the whole report is built with `PDF 만드는 중 n / N쪽`, a bar and 취소 in the overlay header, downloaded, and the overlay closes. A report of 30 pages or fewer saves the preview file itself. Closing or cancelling terminates the worker; a failure is shown in the overlay body. The download name is `유사도 검사 2026. 9. 30.pdf` for that date.
- **Worker** — `src/export/pdf.worker.ts` uses PDFKit 0.20's browser build and `Pretendard-Regular.ttf` from `pretendard/dist/public/static/alternative/`, subset-embedded. Text stays selectable. PDFKit emits completed pages; the layout yields every ten pages to let its output queue drain.
- **Layout** — `src/export/pdf.ts` is DOM-free and runs twice: count pages without drawing, then draw with a known total; `renderPdf(…, limit)` stops the drawing pass after `limit` pages for the preview, whose footers still show the full total. Every page has a file-name running header (`A 원본.txt ↔ B 편집본.txt`; many files use `first 외 N개`), an `n / N` footer on the left and the date on the right.
- **First page** — `유사도 검사 결과` / `내부 반복 검사 결과`, then a ruled table: 검사일; 원고 A title and chapter extent with the full file-name list (`A 파일 N개`, naturally sorted in `Slot.files`) on A's tint; the same for B on B's tint; result counts, 정렬, and 참고 when stopped. The legend explains 겹치는 부분, 앞뒤 문장 and the tier dots.
- **Comparison** — each side has a colour (A blue, B green). A grey band carries a tier dot and `A 원본.txt · 12화` over the A column, `↔ B 편집본.txt · 15화` over the B column. Each block row (see Joined context) is up to two tinted boxes, one per stretch, headed by a lettered chip, the label and the grey `link` line; rows of a block sit 5 pt apart, blocks 14 pt. A box split over pages repeats its tint, not its heading. Shared text is highlighted; neighbouring sentences are grey and unmarked.
- **Repeats** — a band such as `6회 · 27화~39화`, followed by every place with a label column and the repeated text plus context. Rows in either mode split across pages with a `(계속)` band.

Measured in Chrome on an M5 Mac (production build via Vite preview): the
26 chapter pairs in `docs/samples` produced 62 pages, 0.33 MB; the preview
opened in ~0.2 s. The synthetic worst case produced 134,926 pages, 460 MB: the
preview took 25 s and the saved file 191 s (`docs/benchmark.md`).

## Build and deploy

Vite static build → `dist/`; GitHub Actions workflow on `main` publishes to
GitHub Pages. `base` is `/web-novel-similarity/`, the repository name. No environment
variables. `mammoth` and `@rhwp/core` are dynamically imported so they stay out
of the initial bundle; rhwp is then fetched after the page's `load` event
(ADR 0006). PDFKit is confined to the export worker chunk (ADR 0007).
