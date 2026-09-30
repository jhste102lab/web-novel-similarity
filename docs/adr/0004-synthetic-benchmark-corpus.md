# 0004 — Tier thresholds are tuned on a fully synthetic corpus

Status: Accepted (2026-09-21), amended for private local validation (2026-09-22).

## Context

Tier boundaries (`거의 동일` / `일부 수정` / `부분 유사`) and the 흔한 표현
detector need a labeled set of sentence pairs. Real manuscripts are
unpublished commercial text and cannot be committed to a public repository.
Options: tune privately on real text and commit only synthetic samples; use
only synthetic data; or use public-domain Korean text.

## Decision

- The benchmark corpus is generated entirely by a script in the repository
  (`bench/`) from a small hand-written seed of original sentences in the
  target register (modern web-novel prose). No third-party or user manuscript
  text is used.
- The generator produces labeled pairs by applying controlled edits:
  synonym swaps, particle changes, clause insertion/deletion, reordering,
  and unrelated pairs. Labels are the applied edit class, so the corpus is
  deterministic and reproducible from a seed.
- Thresholds live in `src/shared/constants.ts` and are changed only together
  with the benchmark report.

- Real manuscripts MAY be used only for local validation of false-positive
  rates. Their text, title, filename, path, hash, fingerprints, diffs, and
  per-manuscript results are never committed. A public report may contain only
  anonymous aggregate counts and the resulting threshold decision.
- Private manuscripts live outside the repository when practical; the local
  `manuscripts/` fallback is gitignored. Neither location is a dataset shipped
  with the application.

## Consequences

- Synthetic thresholds may not reflect every real stylistic habit. Private
  local validation can improve confidence and threshold calibration, but
  adding manuscripts does not train or automatically improve the engine.
- Anyone can re-run the benchmark; the repository stays free of copyrighted
  text.
