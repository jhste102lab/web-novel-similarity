# 0001 — All manuscript processing stays in the browser

Status: Accepted. Engine language amended by ADR 0002; the JSON save/reopen
and live network counter below were dropped during mockup review (see
`CONTEXT.md`, Settled decisions).

## Context

Manuscripts are unpublished commercial text. The tool is deployed as static
assets (GitHub Pages or Cloudflare Workers static assets) and used internally
without accounts. Expected input is up to ~2,000,000 characters per manuscript,
two manuscripts per run.

## Decision

- No backend API. Manuscripts never leave the browser; only `index.html`,
  JS, CSS and WASM are served.
- Comparison runs in a Web Worker calling a single Rust `similarity-core`
  crate compiled to WASM. The same crate is reused later for a Tauri build;
  the algorithm is never re-implemented in TypeScript.
- Results live in memory only. Refresh discards them; users can save results
  as a local JSON file and re-open it.
- The UI shows this behaviour rather than describing it: one line in the drop
  area and a live "network requests: 0" status during analysis.

## Consequences

- No server-side format conversion: file parsing (`.txt`, `.docx`, `.hwpx`)
  must be done with browser libraries. `.hwp` (binary) is excluded for now
  because browser parsers fail on encrypted/distribution files.
- Performance is bounded by the user's machine; candidate retrieval before
  precise comparison is mandatory (no all-pairs comparison).
- Adding local persistence (IndexedDB) later is cheap; adding a server is a
  policy change and needs a new ADR.
