# 0007 — Build the report PDF with PDFKit in a worker; drop PNG and print

Status: Accepted (2026-09-30). Supersedes the "PDF export uses the browser print
dialog" amendment of ADR 0003 and the PNG export.

## Context

The report was an HTML overlay: PDF via `window.print()`, PNG via
`html2canvas-pro`. With real results (3,989 chapter pairs) the owner reported
that the printed PDF still clipped content and that exports passed 100 MB. The
print path depends on each browser's pagination (Safari and Chrome differ), puts
the whole report in the DOM first, and cannot say "page n / N" reliably. The
owner asked for PDF only, built by a library, working past 3,000 pages, with the
manuscripts' file names and a page counter; the report always holds every
finding.

Measured in Node on 3,000 dense A4 pages (two text columns, highlights, three
text runs per line), Pretendard TTF embedded:

| Library     | Time   | Output  | Memory                                     |
| ----------- | ------ | ------- | ------------------------------------------ |
| jsPDF 3     | 10.3 s | 24.3 MB | 836 MB heap before output, 1.9 GB peak RSS |
| PDFKit 0.20 | 7.5 s  | 23.8 MB | 35 MB heap, 268 MB peak RSS                |

jsPDF keeps every page in memory until it writes the file; PDFKit writes a page
out when the next one starts.

## Decision

- `src/export/pdf.ts` lays the report out itself (words wrapped by glyph
  advance widths, a word longer than the line split by character, rows split
  across pages with a `(계속)` band) against a small `Canvas` interface. It runs
  twice: once without drawing to count pages, then drawing, so every footer says
  `n / N`.
- `src/export/pdf.worker.ts` draws through PDFKit's browser build (`pdfkit`
  0.20, MIT; it uses fflate, already a dependency) in a Web Worker, with
  `Pretendard-Regular.ttf` from the `pretendard` package as the only font; the
  PDF embeds a subset. The service worker precaches the TTF so export works
  offline.
- The export dialog, its 범위 / 분량 options, row selection, the HTML report,
  the print stylesheet and PNG export are removed. `html2canvas-pro` is removed.

## Consequences

- No preview: 내보내기 builds the file directly and shows `n / N쪽` progress
  with 취소.
- Every browser gets the same pages. Text stays selectable and searchable.
- Opening an export costs a 2.7 MB font fetch (then cached) and a 0.5 MB worker.
- The synthetic worst case (168,083 chapter pairs, `docs/benchmark.md`) gives
  51,311 pages; see the benchmark for time and size.
- Marks use one colour for text both sides share; the report has no summary
  table any more (a finding list is the report).
