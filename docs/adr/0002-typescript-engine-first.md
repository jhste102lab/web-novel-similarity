# 0002 — Similarity engine in TypeScript first, Rust/WASM only if measured slow

Status: Accepted (2026-09-21). Amends ADR 0001.

## Context

ADR 0001 assumed a Rust `similarity-core` crate compiled to WASM. The
algorithms are all standard and allocation-light (rolling hash, winnowing,
n-gram Jaccard, bit-parallel edit distance, Myers diff, diagonal chaining).
Target: 500 chapters × 4,000 characters per side, a few seconds on a laptop.
A WASM toolchain adds build steps, CI time and a second language to a small
public repository.

## Decision

- The engine is written in TypeScript with typed arrays and runs in a Web
  Worker. It is a pure module (`src/engine/`) with no DOM or React imports.
- Performance is measured on the synthetic benchmark (ADR 0004). Rust/WASM is
  introduced only if the TypeScript engine misses the target on the reference
  input, or when the desktop (Tauri) build is started.
- The worker message protocol and result types are defined independently of
  the engine language so that a WASM engine can be swapped in later.

## Consequences

- One language, `npm run build` only; no `wasm-pack` in CI.
- Hot paths must avoid per-sentence object allocation; the engineering rules
  in `docs/ssot/engineering-rules.md` list the constraints.
- If WASM arrives later, the engine directory becomes a thin adapter; the UI
  and worker protocol do not change.
