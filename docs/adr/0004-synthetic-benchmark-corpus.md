# 0004 — Tier thresholds are tuned on a fully synthetic corpus

Status: Accepted (2026-09-21).

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
- Thresholds live in one constants file in the engine and are changed only
  together with the benchmark report.

## Consequences

- Thresholds may not reflect every real stylistic habit. Users adjust
  sensitivity by switching result tabs, which limits the damage of a slightly
  off boundary.
- Anyone can re-run the benchmark; the repository stays free of copyrighted
  text.
