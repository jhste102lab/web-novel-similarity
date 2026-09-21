# Engineering rules

Current SSOT for how code in this repository is written. Owner of: module
boundaries, style, testing, dependencies. Architecture facts live in
`architecture.md`.

## Module boundaries

```
src/
  engine/      pure TypeScript, no DOM, no React. Input: text + chapter offsets. Output: result types.
  parsers/     file → { text, chapters }. One file per format (txt, docx, hwpx). No UI.
  worker/      Web Worker entry; owns the message protocol; calls engine + parsers.
  app/         React: screens, components, hooks. Talks to the worker only through `worker/client.ts`.
  export/      report DOM → PDF/PNG.
  shared/      types and constants used by more than one layer.
bench/         synthetic corpus generator and threshold report (Node scripts).
```

- Dependencies point downward only: `app → worker client → (worker) → engine | parsers`. `engine` and `parsers` import nothing from `app` or `worker`.
- A module exports one clear thing. No barrel files that re-export whole directories; import from the file that owns the symbol.
- Chapter detection is one function in `parsers/chapters.ts` used by every parser; never duplicated per format.
- Thresholds, limits and tier names live in `shared/constants.ts` only.

## Style

- TypeScript strict. No `any`; use `unknown` at trust boundaries (file bytes, worker messages) and narrow.
- Functions small enough to read without scrolling; one level of abstraction each.
- Names say what, not how. Korean UI strings are literals in the component that shows them; no i18n layer.
- No comments that restate code. A comment explains a non-obvious constraint or a measured number. Deliberate shortcuts are marked `// ponytail: <ceiling>, <upgrade path>`.
- No speculative abstractions: no interface with one implementation, no config for values that never change, no "utils" grab-bag.
- Delete dead code in the same change that makes it dead. No commented-out code, no `TODO` without an issue link.
- Formatting and linting are enforced by tooling (Prettier + ESLint, config in repo); never format by hand in a review.

## Hot paths (engine)

- Sentences are indexed once into typed arrays (`Uint32Array` offsets, `Uint32Array` hashes). No per-sentence objects inside loops.
- Candidate retrieval runs before any precise comparison; all-pairs comparison is a bug.
- Progress is reported from the worker at most every 100 ms.
- Every algorithm is a named function with a doc comment citing the public algorithm (Rabin–Karp, winnowing, Myers) so a reader can verify it against the literature.

## Testing

- Unit tests with Vitest next to the module (`*.test.ts`). Test observable behaviour: given text, expected passages/tiers; given a filename set, expected chapters.
- One test earns its place only if a plausible bug would fail it. No tests for wiring, defaults or forwarding.
- Fixtures are synthetic (ADR 0004). No real manuscript text in the repository, including in bug reports.
- `bench/` is not part of `npm test`; it is run manually and its report is committed under `docs/plan/`.

## Dependencies

Add a dependency only when it replaces a meaningful amount of non-trivial code. Record it here.

| Package          | Why                                 | Replacement considered                                   |
| ---------------- | ----------------------------------- | -------------------------------------------------------- |
| react, react-dom | UI (ADR 0003)                       | —                                                        |
| mammoth          | `.docx` text extraction             | own OOXML reader (more code, less tested)                |
| fflate           | unzip `.hwpx`                       | `DecompressionStream` (no ZIP central directory support) |
| html2canvas-pro  | PNG export (PDF uses browser print) | jspdf (blank pages past the canvas height limit)         |
| pretendard       | UI font                             | —                                                        |

Anything not listed here is not approved yet.

## Git

- Branch `main` is deployable; GitHub Actions builds and publishes it to Pages.
- Commit messages: imperative, one topic. Documents affected by a change are updated in the same commit (see `docs/README.md`).
