# Benchmark 2026-09-21

Thresholds: near ≥ 0.9, edited ≥ 0.62, partial ≥ 0.45. Seeds: 80.

## Sentence pairs (one edit class per seed)

| class     | expected | n   | min  | p10  | median | p90  | agree |
| --------- | -------- | --- | ---- | ---- | ------ | ---- | ----- |
| identical | near     | 80  | 100% | 100% | 100%   | 100% | 100%  |
| typo      | near     | 80  | 91%  | 93%  | 95%    | 96%  | 100%  |
| particle  | near     | 80  | 91%  | 94%  | 95%    | 96%  | 100%  |
| synonym   | edited   | 80  | 0%   | 58%  | 70%    | 82%  | 78%   |
| insert    | edited   | 80  | 50%  | 62%  | 71%    | 82%  | 89%   |
| delete    | edited   | 80  | 50%  | 62%  | 74%    | 85%  | 85%   |
| reorder   | partial  | 80  | 0%   | 0%   | 57%    | 61%  | 83%   |
| heavy     | partial  | 80  | 0%   | 0%   | 45%    | 67%  | 30%   |
| unrelated | —        | 80  | 0%   | 0%   | 0%     | 0%   | 100%  |

## Planted passages in documents

| class     | expected | planted | reported | as expected |
| --------- | -------- | ------- | -------- | ----------- |
| identical | near     | 9       | 9        | 9           |
| typo      | near     | 9       | 7        | 7           |
| particle  | near     | 9       | 9        | 9           |
| synonym   | edited   | 9       | 8        | 7           |
| insert    | edited   | 9       | 9        | 8           |
| delete    | edited   | 9       | 9        | 9           |
| reorder   | partial  | 9       | 9        | 7           |
| heavy     | partial  | 9       | 4        | 3           |
| unrelated | —        | 8       | 0        | 8           |

False positives (not planted, not 흔한 표현): 0. Passages tagged 흔한 표현: 4.

## Performance

A 2,011,184 chars, B 2,010,687 chars, 591,624 passages, 1687 ms (Node v26.9.0).

## Real manuscripts (local, not committed)

Three `.txt` files supplied by the owner, read with the title-line chapter rule (`#N화`).

| Run                                                                             | Result                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Self-repeat, manuscript flagged as heavily repetitive (156k chars, 38 chapters) | 88 repeat groups, largest 47 occurrences of one sentence, 161 ms                  |
| Self-repeat, two ordinary manuscripts (139k / 87k chars)                        | 19 and 11 groups, all ≤ 4 occurrences, ~30 ms                                     |
| A/B of the two ordinary manuscripts (unrelated works)                           | 9 passages, all `partial` at 45–56 %, generic short sentences ("미간을 찌푸렸다") |
| A/B of the repetitive manuscript vs an ordinary one                             | 0 passages                                                                        |

## Decisions

- Thresholds fixed at near ≥ 0.90, edited ≥ 0.62, partial ≥ 0.45. Lowering `partial`
  further starts admitting unrelated sentences; raising it drops heavily edited copies.
- Fingerprint-overlap score is capped at `edited - 0.01`, so reordered clauses are
  reported as `partial` and never as `edited`/`near`.
- `MIN_SHARED_FINGERPRINTS = 1`: short sentences (≤ 15 chars) with one typo share
  only one fingerprint; requiring two lost them. Performance stayed within target.
- Stock sentences recurring in ≥ 4 chapters are tagged 흔한 표현 and listed once.

## In-browser run (2026-09-21, Chrome 153 headless, M5)

Two synthetic 500-chapter manuscripts (2.01M chars each, generated from the
same seed pool so almost every sentence matches something) loaded through the
real UI on the production build:

| Step                                      | Result                                     |
| ----------------------------------------- | ------------------------------------------ |
| load + parse + chapter detection per file | ~1.2 s (`500화 · 201만 자` shown)          |
| compare (worker) + first paint of results | ~7 s end to end                            |
| passages found                            | 591,623 (거의 동일 2,961 of the top 3,000) |
| 내부 반복 on one 2.01M-char manuscript    | ~1.0 s, 1,147 groups                       |

Two caps were added because of this run:

- `MAX_RESULTS = 3000` — the uncapped result held ~600k passages with their
  text on both sides; the renderer reached 11.8 GB RSS and stopped responding.
  The UI now shows `전체 591,623개 중 상위 3,000개만 표시해요`.
- The 내부 반복 detail pane lists at most 100 occurrences of a group
  (`외 882곳` for the rest); one synthetic group occurred 982 times.

Also verified in the same session: 중단 mid-run returns to the start screen
with both slots still loaded, `새로 비교` asks before discarding results,
a `.hwp` drop shows `hwp는 열 수 없어요. 한글에서 hwpx로 저장해 주세요.`,
PDF export produces paginated selectable text (24 pages for a 513-passage
report, 179 pages for the 1,004-group repeat report), and PNG export produces
a 860 × 16,000 px image.
