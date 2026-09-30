# web-novel-similarity — Domain Context

Browser-only web tool that finds reused or lightly edited sentences between two
web-novel manuscripts, or repeated sentences inside one manuscript. It is a
reference aid, not a plagiarism verdict.

Owning documents: this file (terms and settled product decisions),
`docs/adr/` (why), `docs/ssot/` (current contracts). See `docs/README.md`.

## Glossary

| Term (KO)                     | Meaning                                                                            | Boundary / scenario                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 원고 (Manuscript)             | One logical work loaded into a slot (A or B).                                      | Built from one file or many files; always one text with chapter offsets. 500 `.txt` files dropped into slot A become one 원고 with 500 회차.                                                                                                          |
| 회차 (Chapter)                | A numbered episode inside a 원고.                                                  | Detected, never configured. See "Chapter detection". A 원고 may have no 회차; positions are then reported by sentence index.                                                                                                                          |
| 검사 모드 (Mode)              | `A/B 비교` (two slots) or `내부 반복` (slot A only).                               | Chosen with the `원고 두 개 비교` switch on the start screen; the page opens with it on (A/B 비교).                                                                                                                                                   |
| 검사 범위 (Range)             | Inclusive chapter interval per 원고 that the check covers.                         | Dual-handle slider under each filled card; default = all. Rows outside the range are dimmed in the file list. Absent when the 원고 has no 회차.                                                                                                       |
| 유사 구간 (Passage)           | A run of consecutive matched sentences on both sides.                              | Evidence unit inside a 회차 쌍; one matched sentence is a passage of length 1. Never a top-level row.                                                                                                                                                 |
| 회차 쌍 (Chapter match)       | One 회차 of A and one 회차 of B with every 유사 구간 between them.                 | Primary result unit in `A/B 비교`. A 원고 without 회차 yields a single pair labelled `본문`.                                                                                                                                                          |
| 내부 반복 그룹 (Repeat group) | One expression and every 회차 where it recurs.                                     | Primary result unit in `내부 반복`. Filtered by occurrence count (`3회 이상`, `5회 이상`).                                                                                                                                                            |
| 등급 (Tier)                   | `거의 동일` or `일부 수정`. Nothing weaker is reported.                            | Thresholds fixed by the benchmark (ADR 0004). No percentage is shown: the internal ratio is not calibrated against any external standard.                                                                                                             |
| 흔한 표현 (Common phrase)     | Short stock sentence that recurs widely ("잠시 침묵이 흘렀다").                    | Not a suspicion: dropped by the engine, never listed or tagged.                                                                                                                                                                                       |
| 보고서 (Report)               | PDF of the active tab's findings in the list's current sort order; search ignored. | First page lists manuscript titles, chapter extent, full file names, result counts and the tab exported. Each page has A/B file names in the header and an `n / N` footer. Shared text is highlighted; surrounding sentences are dimmed and unmarked. |

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
- Export: 내보내기 opens a preview of the report's first 30 pages in the
  browser's PDF viewer, with the total page count. `PDF로 저장` asks
  `PDF로 저장할까요?`, then builds the whole report (the active tab's findings,
  in the list's current sort order; search ignored) and downloads it.
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
- Export: DOM-free two-pass PDF layout with PDFKit 0.20 in a Web Worker,
  subset-embedded Pretendard TTF and cancellable page progress (ADR 0007).

Review (2026-09-22, after hands-on use):

- Findings stream in while the scan runs; 중단 keeps what was scanned.
- A 유사 구간 never crosses a 회차 boundary, so a work copied wholesale shows
  one 회차 쌍 per copied 회차. Rows count matched sentences (`유사 문장 N개`),
  the detail adds the passage count (`구간 N개`).
- Review aids: search box, per-passage `문장 복사`, keyboard (`j`/`k`, `/`,
  `c`, `d`, `?`), a diagnostics panel with phase timings.
- Works offline after the first visit (service worker); no chapter-map view.

Review (2026-09-30):

- The page opens in A/B 비교 (Review #4; earlier 내부 반복);
  `원고 두 개 비교` switches to one slot.
- The header title returns to the start screen. Loaded files stay; results
  are discarded after a confirm dialog (`처음으로 갈까요?`, or
  `검사를 중단하고 처음으로 갈까요?` while a scan runs).
- Leaving the page while files or results are loaded triggers the browser's
  own leave-page prompt (reload, close, back).
- A failed drop names the file (`‘12화.hwpx’ 파일을 읽지 못했어요.`).

Review (2026-09-30 #2, shared-text marks; updated after real-result feedback):

- Result order defaults to 회차순; the list's sort bar also offers 유사도순
  for comparison and 반복 많은 순 for repeats. The PDF follows this order.
- Marks show what the two sides **share**, in the detail pane and the PDF
  (earlier: what differed). Comparison passages and repeat places show two
  neighbouring sentences a side on screen and in the PDF, dimmed and never
  marked.
- Export is a PDF of every finding, independent of tab and search. No export
  scope or amount options, image export or row selection remains.
- Every chapter pair and repeat group is kept; there is no result cap.
  The strongest 20 passages per chapter pair are still retained.
- A repeat's detail lists 100 places and then `외 N곳 더 보기`.
- The HWP 5 reader is fetched right after the page loads and precached for
  offline use, so the first HWP file rarely waits for it (ADR 0006).

Review (2026-09-30 #3, owner feedback on real results):

- Chapter order should be the default, so results can be read front to back.
- Show the surrounding sentences to make a finding's context visible.
- Long downloads must complete reliably, not clip or stop partway through.
- Export scope is always every finding, regardless of tab or search.
- Use a PDF library only, with reports beyond 3,000 pages supported (ADR 0007).
- Remove the export-scope control.
- Remove the export-amount control.
- Exports over 100 MB must work.
- Show every finding; remove the 3,000-result limit and its hidden-results note.
- Include A/B file names and a current/total page footer such as `3 / 100`.
- Reference: a KCI/CopyKiller report PDF, used for layout ideas only.

Review (2026-09-30 #4, owner feedback on the PDF):

- A/B labels carry the source file: the detail header reads
  `A 원본.txt ↔ B 편집본.txt`, each column is headed by its 회차, and panes
  read `A 원본.txt · 3화 · 1번째 문장`; the PDF bands and columns likewise.
- PDF: first page is a ruled table (검사일 / 원고 A / 원고 B / 결과), each
  manuscript tinted in its colour (A blue, B green); passages sit in tinted
  A/B columns with a lettered chip. The per-pair note
  (`일부 수정 · 유사 문장 N개 · 구간 M개`) is dropped; the tier dot stays and
  the legend names it.
- 내보내기 opens the preview at once; the whole file is built only after the
  save is confirmed with 예/아니오.
- Context: four sentences a side, keeping the manuscript's line breaks (at
  most one blank line).
- A slot shows a spinner (and `n / N개` for many files) while files are read.
- Export follows the active tab (전체 / 거의 동일 / 일부 수정, 3회 / 5회 이상),
  replacing Review #3's "always every finding"; the first page names it
  (`담은 결과`). Search is not applied.
- Within a chapter pair the report shows each text once (owner's choice among
  mocked options, 2026-09-30): findings whose context overlaps are joined into
  one stretch with several marks (`14·16번째 문장`), and stretches linked by a
  finding share one block, stacked per side. The on-screen detail still lists
  passages one by one.

## Open decisions

None on the product side. Engineering contracts (result schema, worker
protocol, thresholds) live in `docs/ssot/architecture.md` and now describe
shipped code.
