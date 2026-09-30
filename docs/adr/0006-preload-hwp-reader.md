# 0006 — Fetch the HWP 5 reader after page load

Status: Accepted (2026-09-30). Amends ADR 0005 (WASM fetched on first HWP 5
file, not precached).

## Context

ADR 0005 loads rhwp only when an HWP 5 file is dropped, so that file waits for
the WASM (~9.9 MB, ~3.7 MB gzipped; 0.3–0.5 s on a fast line, seconds on a
slow one) on top of parsing (~0.6 s per MB). The owner asked for the fastest
first HWP load, whatever it costs. The whole app is otherwise ~104 kB gzipped.

| Option                                          | First HWP 5 file                           | Cost                                                        |
| ----------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Load on first use (ADR 0005)                    | Waits for download and compile             | None for non-HWP users                                      |
| Fetch and compile after the page's `load` event | Reader ready by the time a file is dropped | Every visitor downloads 3.7 MB once; first paint unaffected |
| Bundle into the initial load                    | Same                                       | First paint waits for 3.7 MB                                |
| Start on file-picker open / drag enter          | Partly hidden                              | Still waits on a slow line                                  |

## Decision

- `main.tsx` calls `preloadHwp()` on `load`: the dynamic import of
  `@rhwp/core` plus `init()`, shared with `extractHwpText` (one in-flight
  promise; a failure is retried when a file needs the reader).
- The service worker precaches the WASM with the build's JS and CSS, so HWP 5
  also opens offline after the first visit.

## Consequences

- Every visit costs 3.7 MB of transfer on the first load (then cached) and the
  memory of one compiled WASM module.
- A file dropped before the preload finishes still waits for the remainder
  (same in-flight promise); on a slow line that can be seconds.
- Parsing time is unchanged; it stays on the main thread (ADR 0005).
- Still no request besides the site's own files (ADR 0001 unchanged).
