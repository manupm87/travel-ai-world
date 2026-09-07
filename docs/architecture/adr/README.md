# Architecture Decision Records

One file per decision, numbered, never deleted (superseded ones get a new status and a pointer).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-backend-split.md) | Split the backend into `core_api` and `ai_api` | Accepted |
| [0002](0002-auth-between-services.md) | Stateless JWT in `ai_api`; forward the user's token to `core_api` | Accepted |
| [0003](0003-frontend-two-base-urls.md) | Frontend supports two base URLs; reverse proxy is optional | Accepted |
| [0004](0004-repository-layout.md) | Source under `src/`, infrastructure under `infra/`, one ignore file | Accepted |
| [0005](0005-trip-aggregate-nested-resources.md) | `Trip` is the aggregate root; child resources are nested and declarative | Accepted |

## Template

```markdown
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What forces are at play; what we observed in the code.

## Decision
What we do, in one or two paragraphs. Concrete: files, names, boundaries.

## Consequences
Good, bad, and what to revisit and when.
```
