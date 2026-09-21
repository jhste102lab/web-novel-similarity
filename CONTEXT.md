# novel-similarity — Domain Context

Browser-only web tool that finds reused or lightly edited sentences between two
web-novel manuscripts, or repeated sentences inside one manuscript. It is a
reference aid, not a plagiarism verdict.

Owning documents: this file (terms and settled product decisions),
`docs/adr/` (why), `docs/ssot/` (current contracts). See `docs/README.md`.

## Glossary

| Term (KO)                     | Meaning                                                                                     | Boundary / scenario                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 원고 (Manuscript)             | One logical work loaded into a slot (A or B).                                               | Built from one file or many files; always one text with chapter offsets. 500 `.txt` files dropped into slot A become one 원고 with 500 회차.    |
| 회차 (Chapter)                | A numbered episode inside a 원고.                                                           | Detected, never configured. See "Chapter detection". A 원고 may have no 회차; positions are then reported by sentence index.                    |
| 검사 모드 (Mode)              | `A/B 비교` (two slots) or `내부 반복` (slot A only).                                        | Chosen with the `원고 두 개 비교` switch on the start screen.                                                                                   |
| 검사 범위 (Range)             | Inclusive chapter interval per 원고 that the check covers.                                  | Dual-handle slider under each filled card; default = all. Rows outside the range are dimmed in the file list. Absent when the 원고 has no 회차. |
| 유사 구간 (Passage)           | A run of consecutive matched sentences on both sides, shown as one result.                  | Primary result unit in `A/B 비교`. One matched sentence is a passage of length 1.                                                               |
| 내부 반복 그룹 (Repeat group) | One expression and every 회차 where it recurs.                                              | Primary result unit in `내부 반복`. Filtered by occurrence count (`3회 이상`, `5회 이상`).                                                      |
| 등급 (Tier)                   | Similarity band shown before the number: `거의 동일` > `일부 수정` > `부분 유사`.           | Thresholds are fixed by the benchmark (ADR 0004), not by the user.                                                                              |
| 흔한 표현 (Common phrase)     | Tag, orthogonal to 등급, on short stock sentences that recur widely ("잠시 침묵이 흘렀다"). | Shown only under its own filter tab; excluded from 등급 tabs and from the 보고서.                                                               |
| 보고서 (Report)               | PDF/PNG export of the summary and the passage list.                                         | 원고 appear under a user-editable title (default: filename). Fixed footer: `문자 유사도 기반 참고 자료`.                                        |

## Chapter detection

Automatic; the user corrects wrong cells in the file list instead of choosing a rule.

| Input                                                                                     | Rule                                                                                           | Card label                            |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Many files, last number in filename                                                       | That number is the 회차. Files without a number get `?` and are counted as `회차 못 읽음 N개`. | `파일명 숫자`                         |
| Many files, no numbers                                                                    | Natural filename order → 1, 2, 3…                                                              | `파일 이름순 (숫자 없음)`             |
| One file with short numbered title lines (`제N화`, `N화`, `N.`, `Chapter N`), consecutive | Each title starts a 회차.                                                                      | `본문 제목 "제N화" N개`               |
| One file, no titles                                                                       | No 회차; positions by sentence index. No 검사 범위.                                            | `회차 없음 — 위치는 문장 번호로 표시` |

Cell editing: digits only, `화` suffix added on blur, Enter moves to the next
row. After four consecutive corrected values the card offers
`아래 N개 이어서 채우기`; `되돌리기` restores detected values.

## Settled decisions

Product (2026-09-21, mockup accepted):

- Modes: `A/B 비교` and `내부 반복`, chosen by one switch. No preset or
  sensitivity setting; the result tabs are the sensitivity control.
- Input formats: `.txt`, `.docx`, `.hwpx`. `.hwp` is rejected with a hint to
  re-save as HWPX from 한글.
- Only pre-check setting: 검사 범위 per 원고.
- Results: left list + right detail; A/B panes with character-level `<mark>`
  diffs. Filter tabs: 전체 / 거의 동일 / 일부 수정 / 부분 유사 / 흔한 표현
  (A/B) and 전체 / 3회 이상 / 5회 이상 / 흔한 표현 (내부 반복).
- Export: PDF and PNG of summary + passage list, opened as an overlay first.
- Privacy is shown, not explained: one line under the title
  (`파일은 서버에 저장하지 않고 사용자의 브라우저에서만 처리됩니다`).
- Persistence: memory only. Refresh discards results. No JSON save/reopen.
- File dates: only `File.lastModified` is available in a browser, shown as
  `파일 수정일`. Creation date needs the future desktop build.
- Devices: PC and tablet. Mobile is out of scope.
- Visual language: NovelTrack tokens (Pretendard Variable, near-white
  background, white cards). No gradients, no glass, no explanatory copy.
- Header product name: `문장 · 문단 유사도 검사`.

Engineering (2026-09-21, ADR 0002–0004):

- Engine in TypeScript inside a Web Worker first; Rust/WASM only if measured
  too slow or when the desktop build happens.
- React + Vite + TypeScript; npm; MIT; GitHub Pages via Actions. The mockup
  stylesheet is used verbatim (no Tailwind — ADR 0003 amendment).
- Tier thresholds tuned on a fully synthetic, committed benchmark corpus.
- Export: PNG via `html2canvas-pro`, PDF via the browser print dialog
  (ADR 0003 amendment).

## Open decisions

None on the product side. Engineering contracts (result schema, worker
protocol, thresholds) live in `docs/ssot/architecture.md` and now describe
shipped code.
