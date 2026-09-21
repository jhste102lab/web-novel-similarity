# 유사도 검사 — UI mockup (2026-09-21, minimal)

Open `index.html`. Bottom pill is reviewer-only and switches states.

States: 시작 → 파일 선택됨 → 비교 중 → 결과 / 내부 반복 → PDF. Plus `hwp` (rejected file).

What is on screen and nothing else:

- 시작: two drop cards (A, B), one button. One line under the title says the file stays in the browser.
- 결과: title `A ↔ B`, tier tabs with counts, list (chapter pair, %, first line), detail (A/B side by side, changed words marked).
- 내부 반복: tabs 전체 / 3회 이상 / 5회 이상, list (count, chapter range, sentence), detail (each chapter).
- 내보내기: PDF or PNG.

Removed from the previous draft, restore only if asked: preset/advanced settings, file list per manuscript, chapter strip, search/sort, stage list in progress, context sentences, sentence numbers, 흔한 표현 tag, JSON save, live network counter.
