# Documentation index

Entry point for document governance. Everything under `docs/` and
`AGENTS.md` is written for AI agents and contributors and is in English. The
root `README.md` is the user-facing page and is in Korean.

## Precedence

1. `AGENTS.md` — agent permissions, safety and done criteria.
2. Code, build config and workflows — current implementation facts.
3. `CONTEXT.md` — domain terms and settled product decisions.
4. `docs/ssot/*` — current engineering contracts.
5. `docs/adr/*` — why a decision was made.
6. `docs/benchmark.md` — measurements behind the thresholds, as of its date.

When code and a Current document disagree, check the code, then fix the
document in the same change.

## Current SSOT

| Scope                                                        | Document                         |
| ------------------------------------------------------------ | -------------------------------- |
| Terms, chapter detection, product decisions                  | `CONTEXT.md`                     |
| File map, worker protocol, result types, thresholds location | `docs/ssot/architecture.md`      |
| Code style, module boundaries, testing, dependency policy    | `docs/ssot/engineering-rules.md` |

## Directory status

| Path                       | Status   | Use                                                             |
| -------------------------- | -------- | --------------------------------------------------------------- |
| `CONTEXT.md`, `docs/ssot/` | Current  | Persistent contracts                                            |
| `docs/adr/`                | Decision | Accepted decisions and their context; amend by adding a new ADR |
| `docs/benchmark.md`        | Evidence | Latest benchmark report; regenerate with `npm run bench`        |
| `docs/images/`             | Current  | README screenshots, taken with `docs/samples/`                  |
| `docs/samples/`            | Current  | Two synthetic sample manuscripts (safe to publish)              |

## Update rules by change type

| Change                                          | Also update                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| New term, changed product behaviour             | `CONTEXT.md`                                               |
| Module added/moved, worker message, result type | `docs/ssot/architecture.md`                                |
| Tier threshold                                  | `docs/ssot/architecture.md` and `docs/benchmark.md`        |
| New dependency                                  | `docs/ssot/engineering-rules.md` (dependency table)        |
| Decision with alternatives                      | new `docs/adr/NNNN-*.md`                                   |
| Visible UI change shown in a README screenshot  | recapture it in `docs/images/` (1440×900, `docs/samples/`) |

A rule lives in exactly one document; other documents link to it.
