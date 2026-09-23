# AGENTS.md

Operating contract for AI agents working in this repository. Detailed rules
are owned by the documents linked below and are not repeated here.

## Goal and collaboration

- Build and maintain a browser-only similarity checker for Korean web-novel
  manuscripts (see `CONTEXT.md`). No server, no accounts, no telemetry.
- Do not agree with the user by default. Separate verified facts, inference
  and remaining uncertainty.
- Reply to the user in Korean. Write code, comments, commit messages and every
  file under `docs/` and `AGENTS.md` in English. The root `README.md` is the
  only Korean document.

## Permissions

- Questions, reviews, diagnoses and plans: read and report; do not edit files.
- Implementation requests: make in-scope local changes and run non-destructive
  checks without asking.
- Commit and push to a branch when asked. Merging, publishing a release,
  changing Pages settings or repository settings need explicit approval.
- Never commit real manuscript text, user files or anything under a
  `.gitignore`d manuscripts folder. Fixtures are synthetic (ADR 0004).
- Never add a network call, analytics or storage of manuscript content
  (ADR 0001). Such a change needs a new ADR and the owner's approval.

## Sources of truth

| Scope                                                         | Document                         |
| ------------------------------------------------------------- | -------------------------------- |
| Document map and update rules                                 | `docs/README.md`                 |
| Terms, chapter detection, product decisions                   | `CONTEXT.md`                     |
| Runtime structure, worker protocol, result types, thresholds  | `docs/ssot/architecture.md`      |
| Code style, module boundaries, testing, approved dependencies | `docs/ssot/engineering-rules.md` |
| Why decisions were made                                       | `docs/adr/`                      |
| Where a feature lives (file map)                              | `docs/ssot/architecture.md`      |

Code beats documents for "what exists"; documents beat code for "what was
decided". If they disagree, fix the document in the same change.

## Invariants

- `src/engine/` and `src/parsers/` have no DOM or React imports and are
  tested by input/output only.
- Every UI string is Korean. Wording and visible settings follow the
  shipped app and `CONTEXT.md`; no mockup is kept. No explanatory copy,
  no settings the owner has not accepted.
- Dependencies outside the table in `docs/ssot/engineering-rules.md` are not
  added without updating that table.
- Thresholds change only together with an updated `docs/benchmark.md` (`npm run bench`).

## Done criteria

- The change builds (`npm run build`), lints and passes `npm test`.
- Behaviour claims are backed by a command run in the same turn, or are
  labelled as unverified.
- Affected documents in `docs/README.md` "Update rules" are updated in the
  same change.
