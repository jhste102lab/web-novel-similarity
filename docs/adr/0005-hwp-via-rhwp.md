# 0005 — Read HWP 5 with rhwp; decide HWP vs HWPX by content

Status: Accepted (2026-09-30). Amends ADR 0001 (`.hwp` excluded) and ADR 0003
(parsing libraries).

## Context

A user's `.hwpx` files failed with `파일을 읽지 못했어요.` They were HWP 5
binaries (OLE compound files, `D0 CF 11 E0`, FileHeader `HWP Document File`)
with a `.hwpx` name. The parser trusted the extension, `fflate` found no ZIP,
and the generic error hid the reason. Korean web-novel manuscripts are often
HWP 5, and "re-save as HWPX in 한글" is a step many users cannot take.

Options measured on the reported files (1.4 MB, 242 chapters):

| Option                                             | Evidence                                                                                                                      | Verdict                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `@rhwp/core` 0.8.6 (MIT, Rust → WASM, active)      | Reads both files; text identical to its own HWPX export; detects passwords; no transitive dependencies; ~0.6 s per MB in Node | Chosen                                                        |
| Own CFB + BodyText reader on `fflate` (~120 lines) | Same text in 0.14 s                                                                                                           | Rejected by the owner: no hand-written HWP parser to maintain |
| `hwp.js` / `@hwp.js/parser`                        | Unmaintained since 2022 / alpha since 2024, HWP only, pulls `cfb` + `pako`                                                    | Rejected                                                      |
| `@ohah/hwpjs`, `node-hwp`                          | Release candidate, 45 MB / Node-only, 82 MB                                                                                   | Rejected                                                      |

## Decision

- `.hwp` and `.hwpx` go to the same entry. A ZIP signature (`PK`) means HWPX
  and keeps the existing `fflate` + `DOMParser` path; anything else goes to
  rhwp, which detects HWP 5 (and reports unknown formats).
- rhwp is dynamically imported and its WASM (~9.9 MB, ~3.7 MB gzipped) is
  fetched only when an HWP 5 file is opened. HWPX users do not download it.
- Password-protected documents are reported as such; the user removes the
  password in 한글.

## Consequences

- The WASM is not precached by the service worker (only JS/CSS are); it is
  cached when first fetched, so HWP 5 works offline only after one online use.
- Parsing stays on the main thread; a 1 MB HWP 5 file blocks it for about
  half a second.
- rhwp is pre-1.0 and changes often; the version is pinned exactly.
- Nothing leaves the browser: rhwp's only request is its own WASM file
  (ADR 0001 unchanged).
