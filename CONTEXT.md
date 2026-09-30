# web-novel-similarity — Domain Context

Browser-only web tool that finds reused or lightly edited sentences between two
web-novel manuscripts, or repeated sentences inside one manuscript. It is a
reference aid, not a plagiarism verdict.

Owning documents: this file (terms and settled product decisions),
`docs/adr/` (why), `docs/ssot/` (current contracts). See `docs/README.md`.

## Glossary

| Term (KO)                     | Meaning                                                            | Boundary / scenario                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 원고 (Manuscript)             | One logical work loaded into a slot (A or B).                      | Built from one file or many files; always one text with chapter offsets. 500 `.txt` files dropped into slot A become one 원고 with 500 회차.              |
| 회차 (Chapter)                | A numbered episode inside a 원고.                                  | Detected, never configured. See "Chapter detection". A 원고 may have no 회차; positions are then reported by sentence index.                              |
| 검사 모드 (Mode)              | `A/B 비교` (two slots) or `내부 반복` (slot A only).               | Chosen with the `원고 두 개 비교` switch on the start screen; the page opens with it off (내부 반복).                                                     |
| 검사 범위 (Range)             | Inclusive chapter interval per 원고 that the check covers.         | Dual-handle slider under each filled card; default = all. Rows outside the range are dimmed in the file list. Absent when the 원고 has no 회차.           |
| 유사 구간 (Passage)           | A run of consecutive matched sentences on both sides.              | Evidence unit inside a 회차 쌍; one matched sentence is a passage of length 1. Never a top-level row.                                                     |
| 회차 쌍 (Chapter match)       | One 회차 of A and one 회차 of B with every 유사 구간 between them. | Primary result unit in `A/B 비교`. A 원고 without 회차 yields a single pair labelled `본문`.                                                              |
| 내부 반복 그룹 (Repeat group) | One expression and every 회차 where it recurs.                     | Primary result unit in `내부 반복`. Filtered by occurrence count (`3회 이상`, `5회 이상`).                                                                |
| 등급 (Tier)                   | `거의 동일` or `일부 수정`. Nothing weaker is reported.            | Thresholds fixed by the benchmark (ADR 0004). No percentage is shown: the internal ratio is not calibrated against any external standard.                 |
| 흔한 표현 (Common phrase)     | Short stock sentence that recurs widely ("잠시 침묵이 흘렀다").    | Not a suspicion: dropped by the engine, never listed or tagged.                                                                                           |
| 보고서 (Report)               | PDF/PNG export of the summary and the passage list.                | 원고 appear under a user-editable title (default: filename). Fixed footer: `문자 유사도 기반 참고 자료`. States its 범위 (`전체 26개`, `1,560개 중 4개`). |

## Chapter detection

Automatic; the user corrects wrong cells in the file list instead of choosing a rule.

| Input                                                  | Rule                                                                                           | Card label                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Many files, each with numbered title lines (see below) | Every file is split at its titles; the titles give the 회차.                                   | `본문 제목 줄 N개`                    |
| Many files, last number in filename                    | That number is the 회차. Files without a number get `?` and are counted as `회차 못 읽음 N개`. | `파일명 숫자`                         |
| Many files, no numbers                                 | Natural filename order → 1, 2, 3…                                                              | `파일 이름순 (숫자 없음)`             |
| One file with short numbered title lines, consecutive  | Each title starts a 회차.                                                                      | `본문 제목 줄 N개`                    |
| One file, no titles                                    | No 회차; positions by sentence index. No 검사 범위.                                            | `회차 없음 — 위치는 문장 번호로 표시` |

Title lines (≤ 40 characters, compared after NFKC so full-width digits count):
`제N화`, `N화`, `N회`, `N장`, `N편` with an optional `M부` before and a
separator or bracket after; `Chapter N`, `Episode N`, `EP.N`, `Ch.N`; `N.`;
and a work name before the number when the line ends there (`검은달 12화`).
Any of them may open with a bracket or mark (`[`, `(`, `<`, `【`, `〈`, `《`,
`「`, `『`, `#`, `*`). At least two titles, and 80 % of neighbours consecutive.
A title repeated on the very next line (`[EP.3] 작품 3편.` then `작품 3편.`)
is one title. Text before the first title (프롤로그, a header) belongs to the
first 회차. Not titles: a number glued to the next word (`1화부터`) and bare
numbers (`#1`, `[1]`).

Cell editing: digits only, `화` suffix added on blur, Enter moves to the next
row. After four consecutive corrected values the card offers
`아래 N개 이어서 채우기`; `되돌리기` restores detected values.

## Settled decisions

Product (2026-09-21, design accepted):

- Modes: `A/B 비교` and `내부 반복`, chosen by one switch. No preset or
  sensitivity setting; the result tabs are the sensitivity control.
- Input formats: `.txt`, `.docx`, `.hwp`, `.hwpx`. The content, not the
  extension, decides between HWP 5 and HWPX (an HWP 5 file renamed to
  `.hwpx` opens). Password-protected HWP is rejected with a hint to remove
  the password in 한글 (ADR 0005, 2026-09-30).
- Only pre-check setting: 검사 범위 per 원고.
- Results: left list of 회차 쌍 + right detail with the A/B panes; the text
  both sides share is highlighted with `<mark>` (Review 2026-09-30 #2). Filter
  tabs: 전체 / 거의 동일 / 일부 수정 (A/B) and 전체 / 3회 이상 / 5회 이상 (내부 반복).
- Only suspicions are shown. Below 일부 수정 and every 흔한 표현 is removed by
  the engine, and no similarity percentage is displayed anywhere.
- Export: PDF and PNG of summary + passage list, opened as an overlay first.
- Privacy is shown, not explained: one line under the title
  (`파일은 서버에 저장하지 않고 사용자의 브라우저에서만 처리됩니다`).
- Persistence: memory only. Refresh discards results. No JSON save/reopen.
- File dates: only `File.lastModified` is available in a browser, shown as
  `파일 수정일`. Creation date needs the future desktop build.
- Devices: PC and tablet. Mobile is out of scope.
- Visual language: NovelTrack tokens (Pretendard Variable, near-white
  background, white cards). No gradients, no glass, no explanatory copy.
- Header product name: `웹소설 문장 · 문단 유사도 검사`.
- Public repository: `jhste102lab/web-novel-similarity`, served from
  GitHub Pages at `/web-novel-similarity/` (Vite `base`).

Engineering (2026-09-21, ADR 0002–0004):

- Engine in TypeScript inside a Web Worker first; Rust/WASM only if measured
  too slow or when the desktop build happens.
- React + Vite + TypeScript; npm; MIT; GitHub Pages via Actions. The accepted
  design's stylesheet is used verbatim (no Tailwind — ADR 0003 amendment).
- Tier thresholds tuned on a fully synthetic, committed benchmark corpus.
- Export: PNG via `html2canvas-pro`, PDF via the browser print dialog
  (ADR 0003 amendment).

Review (2026-09-22, after hands-on use):

- Findings stream in while the scan runs; 중단 keeps what was scanned.
- A 유사 구간 never crosses a 회차 boundary, so a work copied wholesale shows
  one 회차 쌍 per copied 회차. Rows count matched sentences (`유사 문장 N개`),
  the detail adds the passage count (`구간 N개`).
- Review aids: search box, per-passage `문장 복사`, keyboard (`j`/`k`, `/`,
  `c`, `d`, `?`), a diagnostics panel with phase timings.
- Export option: passages per 회차 쌍 (전체 / 5 / 1) — replaced by 범위 and
  분량, Review 2026-09-30 #2.
- Works offline after the first visit (service worker); no chapter-map view.

Review (2026-09-30):

- The page opens in 내부 반복 (one slot); `원고 두 개 비교` turns on A/B.
- The header title returns to the start screen. Loaded files stay; results
  are discarded after a confirm dialog (`처음으로 갈까요?`, or
  `검사를 중단하고 처음으로 갈까요?` while a scan runs).
- Leaving the page while files or results are loaded triggers the browser's
  own leave-page prompt (reload, close, back).
- A failed drop names the file (`‘12화.hwpx’ 파일을 읽지 못했어요.`).

Review (2026-09-30 #2, export scope; decided on an HTML mockup):

- Result rows can be ticked for export: checkbox, `전체 선택` (the rows the
  tab and search show), `선택 해제`, Shift+click for a range, `x` on the
  current row. Ticks survive tab and search changes.
- Export overlay 범위: `지금 목록 N개` (tab + search) / `상위 10·50·100개` /
  `선택한 N개`; opening it with ticked rows selects `선택한 N개`.
- Export overlay 분량: `요약표만` / `대조 일부`·`위치 일부` (first 3 sentences
  of a passage, first 3 places of a repeat) / `대조 전부`·`위치 전부` (default).
- Marks show what the two sides **share**, in the detail pane and the report
  (earlier: what differed). Repeat places in the report show the sentence
  before and after, the repeated one marked.
- The overlay shows `A4 약 N쪽`; the save menu reads `PNG · N장 (압축 파일)`
  when the report is cut into several images and `PDF · N쪽`.
- A repeat's detail lists 100 places and then `외 N곳 더 보기`.
- The report has no coloured side bar; tier dots and marks print in colour.
- The HWP 5 reader is fetched right after the page loads and precached for
  offline use, so the first HWP file does not wait for it (ADR 0006).

## Open decisions

None on the product side. Engineering contracts (result schema, worker
protocol, thresholds) live in `docs/ssot/architecture.md` and now describe
shipped code.
