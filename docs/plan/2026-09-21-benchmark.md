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

## Real manuscripts (local, not committed)

Three `.txt` files supplied by the owner, read with the title-line chapter rule (`#N화`).

| Run                                                                             | Result                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Self-repeat, manuscript flagged as heavily repetitive (156k chars, 38 chapters) | 78 repeat groups, largest 48 occurrences of one sentence, ~250 ms  |
| Self-repeat, two ordinary manuscripts (139k / 87k chars)                        | 19 and 11 groups, all ≤ 4 occurrences, ~30 ms                      |
| A/B of the two ordinary manuscripts (unrelated works)                           | **0 chapter pairs** (9 false positives before the 0.62 floor)      |
| A/B of the repetitive manuscript vs an ordinary one                             | 0 chapter pairs                                                    |
| A/B of a manuscript vs a script-mutated copy of itself                          | 53 chapter pairs (23 거의 동일, 30 일부 수정), 421 passages, 44 ms |

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
- **Results are grouped by chapter pair.** Sentence-level rows reached hundreds of
  entries for one copied work; the same finding is 53 chapter-pair rows.
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

- `MAX_RESULTS = 3000` chapter pairs. Before grouping and capping, the result held
  ~600k sentence-level passages with their text on both sides; the renderer reached
  11.8 GB RSS and stopped responding. The UI shows
  `전체 N개 중 상위 3,000개만 표시해요` when the cap bites.
- `MAX_PASSAGES_PER_MATCH = 20` passages per chapter pair, strongest first, with
  `유사 문장 26개 · 상위 20개 표시` in the detail header.
- The 내부 반복 detail pane lists at most 100 occurrences of a group (`외 882곳`
  for the rest); one synthetic group occurred 982 times.

Also verified in the same session: 중단 mid-run returns to the start screen with
both slots still loaded, `새로 비교` asks before discarding results, a `.hwp` drop
shows `hwp는 열 수 없어요. 한글에서 hwpx로 저장해 주세요.`, PDF export produces
paginated selectable text, and PNG export produces a 860 × 16,000 px image.
