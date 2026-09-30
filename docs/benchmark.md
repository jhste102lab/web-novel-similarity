# Benchmark 2026-09-21

Thresholds: near ≥ 0.9, edited ≥ 0.62; below 0.62 nothing is reported. Seeds: 80.

## Sentence pairs (one edit class per seed)

| class     | expected | n   | min  | p10  | median | p90  | agree |
| --------- | -------- | --- | ---- | ---- | ------ | ---- | ----- |
| identical | near     | 80  | 100% | 100% | 100%   | 100% | 100%  |
| typo      | near     | 80  | 91%  | 93%  | 95%    | 96%  | 100%  |
| particle  | near     | 80  | 91%  | 94%  | 95%    | 96%  | 100%  |
| synonym   | edited   | 80  | 0%   | 0%   | 70%    | 82%  | 78%   |
| insert    | edited   | 80  | 0%   | 0%   | 71%    | 82%  | 89%   |
| delete    | edited   | 80  | 0%   | 0%   | 74%    | 85%  | 85%   |
| reorder   | —        | 80  | 0%   | 0%   | 0%     | 0%   | 99%   |
| heavy     | —        | 80  | 0%   | 0%   | 0%     | 67%  | 83%   |
| unrelated | —        | 80  | 0%   | 0%   | 0%     | 0%   | 100%  |

## Planted passages in documents

| class     | expected | planted | reported | as expected |
| --------- | -------- | ------- | -------- | ----------- |
| identical | near     | 9       | 9        | 9           |
| typo      | near     | 9       | 7        | 7           |
| particle  | near     | 9       | 9        | 9           |
| synonym   | edited   | 9       | 7        | 7           |
| insert    | edited   | 9       | 8        | 7           |
| delete    | edited   | 9       | 9        | 9           |
| reorder   | —        | 9       | 2        | 7           |
| heavy     | —        | 9       | 1        | 8           |
| unrelated | —        | 8       | 0        | 8           |

False positives (reported passages that were not planted): 0.

## Performance

A 2,011,184 chars, B 2,010,687 chars, 168,083 chapter pairs, 1356 ms (Node v26.9.0).

## Private local validation

Real manuscripts were used locally only to check false positives and repeat
behaviour. No text, title, filename, path, length, hash, fingerprint, diff, or
per-manuscript result is recorded here. Cross-comparisons among known-unrelated
works produced no findings after the 0.62 floor; locally generated edited
copies confirmed that real similarities are still detected and grouped.

## Decisions

- **Nothing below `edited` (0.62) is reported.** Every hit in the old 0.45–0.62
  `부분 유사` band was a false positive: unrelated manuscripts produced 9 of them,
  all generic short sentences. Cost: word-order-shuffled copies are missed
  (`reorder` and `heavy` recall dropped to 2/9 and 1/9).
- **The n-gram-only score path was removed.** It could only produce results inside
  that band, so it is dead weight once the band is gone.
- **No percentage is shown.** The score is `1 − edit distance / longer length` on
  letters-only normalised text, averaged over a chained passage. It ranks findings
  correctly but is not calibrated against any external notion of copying, so it is
  kept inside the engine and used only for tiering and sorting.
- **흔한 표현 is dropped, not tagged.** A stock sentence (≤ 14 chars, ≥ 4 chapters)
  matching elsewhere is not a suspicion, in either mode.
- **Results are grouped by chapter pair.** Sentence-level output can reach
  hundreds of entries for one copied work; grouping reduces it to reviewable
  chapter-pair rows.
- `MIN_SHARED_FINGERPRINTS = 1`: short sentences (≤ 15 chars) with one typo share
  only one fingerprint; requiring two lost them. Performance stayed within target.

## In-browser run (Chrome 153 headless, M5)

Two synthetic 500-chapter manuscripts (2.01M chars each, generated from the same
seed pool so almost every sentence matches something) loaded through the real UI
on the production build:

| Step                                      | Result                            |
| ----------------------------------------- | --------------------------------- |
| load + parse + chapter detection per file | ~1.2 s (`500화 · 201만 자` shown) |
| compare (worker) + first paint of results | ~7 s end to end                   |
| 내부 반복 on one 2.01M-char manuscript    | ~1.0 s                            |

Caps added because of this run:

- The former `MAX_RESULTS = 3000` chapter-pair cap was removed on 2026-09-30
  because the owner wants every finding. Historically, before grouping and
  capping, ~600k sentence-level passages held text on both sides; the renderer
  reached 11.8 GB RSS and stopped responding. The former
  `전체 N개 중 상위 3,000개만 표시해요` note is gone.
  The new Chrome run on an M5 Mac (production build via Vite preview, synthetic
  500 × 500 chapters, ~2M chars per side from `bench/run.ts`'s Performance
  section) showed all 168,083 chapter pairs: comparison finished in 6.5 s end
  to end, main-thread JS heap was 1.66 GB after results, and a sort toggle took
  0.1 s. Its PDF (tinted A/B columns, four context sentences a side) had
  134,385 pages, 477 MB; the 30-page preview took 26 s (mostly counting pages)
  and saving the whole file 152 s. Earlier layouts gave 83,831 pages / 337 MB /
  130 s (two sentences) and 51,311 pages / 222 MB / 86 s (one sentence).
  Before yielding every ten pages to drain PDFKit's output queue, the
  one-sentence export took 249 s.
- `MAX_PASSAGES_PER_MATCH = 20` passages per chapter pair, strongest first, with
  `유사 문장 26개 · 상위 20개 표시` in the detail header.
- The 내부 반복 detail pane lists at most 100 occurrences of a group (`외 882곳`
  for the rest); one synthetic group occurred 982 times.

Historically, also verified in that session: 중단 mid-run returned to the start
screen with both slots still loaded, `새로 비교` asked before discarding results,
a `.hwp` drop showed `hwp는 열 수 없어요. 한글에서 hwpx로 저장해 주세요.`,
the old print-based PDF export produced paginated selectable text, and the
former PNG export produced a 860 × 16,000 px image. These describe the old
behaviour, not the current HWP reader, streaming stop or PDF export.

The 2026-09-30 PDF export measurements (Chrome, M5 Mac, production build via
Vite preview) also covered `docs/samples`: 26 chapter pairs, 62 pages, 0.33 MB,
~0.3 s. In Node, 3,000 dense pages took PDFKit 7.5 s / 23.8 MB / 268 MB peak
RSS, versus jsPDF 10.3 s / 24.3 MB / 1.9 GB peak RSS (ADR 0007).

## Input-format and range checks (browser, production build)

| Input                                       | Result                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| 21 files named `제N화.txt` selected at once | `21개 파일 · 21화 · 14만 자`, rule `파일명 숫자`                         |
| `.docx` (spec-shaped OOXML, one chapter)    | 895 chars extracted, rule `회차 없음 — 위치는 문장 번호로 표시`          |
| `.hwpx` (ZIP + `Contents/section0.xml`)     | 854 chars extracted, same rule                                           |
| Multi-file 원고 (txt) ↔ single `.hwpx` 원고 | 1 chapter pair, `A 0화 ↔ B 본문`, 거의 동일 — cross-format compare works |
| A range set to `10~20화`, B left at 전체    | 53 → 24 chapter pairs, every reported A chapter ≥ 10                     |

Fixtures were generated locally (`.docx`/`.hwpx` written with fflate from one
chapter of a sample manuscript) and are not committed. A file produced by 한글
itself has not been tested; the parser only reads `Contents/section*.xml` text
nodes, so a real file with the same part layout is expected to behave the same.
