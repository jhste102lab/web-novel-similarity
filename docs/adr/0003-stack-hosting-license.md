# 0003 — React/Vite, GitHub Pages, MIT

Status: Accepted (2026-09-21), amended during implementation (2026-09-21) —
see _Amendments_.

## Context

Public repository, single static page, no backend. The author's sibling
project (NovelTrack) uses React 19, Tailwind 4, TypeScript, npm and the
Pretendard design tokens; reusing that stack keeps patterns and reviewers
consistent. Alternatives considered: vanilla TypeScript (less code but
hand-written state management for list editing, filters and modals) and
Svelte (smaller bundle, different from the team standard).

## Decision

- UI: React 19 + Vite + TypeScript + Tailwind 4. Package manager: npm.
- Hosting: GitHub Pages, deployed by a GitHub Actions workflow on push to
  `main`. Build output is static; no runtime environment variables.
- License: MIT, copyright holder `jhste102lab`.
- Export: jsPDF + html2canvas (or an equally maintained equivalent chosen at
  implementation time) with an embedded Korean font, so that saving is one
  click without the browser print dialog.
- File parsing in the browser: `mammoth` for `.docx` (already used in
  NovelTrack); `.hwpx` is a ZIP of XML and is read with `fflate` plus the
  platform `DOMParser`.

## Consequences

- Bundle grows by the PDF/canvas libraries and the font; acceptable for a
  desktop-only tool.
- Pages has a soft bandwidth limit (100 GB/month); irrelevant at expected
  usage. Moving to Cloudflare Pages later is a workflow change only.
- MIT permits commercial forks; that is intended.

## Amendments (2026-09-21, implementation)

- **Tailwind dropped.** The accepted mockup
  (`docs/mockups/2026-09-21-similarity-check/index.html`) had to be matched
  pixel for pixel; its stylesheet was moved verbatim into
  `src/app/styles.css` (since split by screen into `src/app/styles/`) instead of being re-expressed in utility classes.
- **PDF export uses the browser print dialog.** jsPDF + html2canvas produced
  a blank multi-page PDF because a full report exceeds the canvas height
  limit. Printing keeps selectable Korean text and real pagination, so `jspdf`
  was removed; PNG export still uses `html2canvas-pro`, with the scale capped
  to 16,000 px. The one-click goal is not met for PDF: the browser shows its
  print sheet.
