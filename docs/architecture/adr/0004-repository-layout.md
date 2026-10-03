# 0004 — Source under `src/`, infrastructure under `infra/`, one ignore file

> **Updated by [ADR 0028](0028-retire-the-legacy-scraper.md)** (`tools/scraper` removed).

**Status:** Accepted (updated by [0028](0028-retire-the-legacy-scraper.md))
**Date:** 2026-09-07

## Context

The repository root had twenty entries: `backend/`, `frontend/`, `Scraper/`,
`infra_terraform_gcp/`, `infra_terraform_aws/`, a design file, a folder of generated images,
a Windows wrapper script and five nested `.gitignore` files. Code, infrastructure and tooling
were mixed at the same level, the scraper had no dependency manifest and was neither linted nor
locked, and the two Terraform folders repeated most of their documentation.

## Decision

1. **All source code lives under `src/`**: `src/frontend/` (Next.js) and `src/backend/` (the uv
   workspace). Their internal layout does not change; the workspace root, the Docker build
   context and the lockfile stay at `src/backend/`.
2. **The scraper is a workspace member** at `src/backend/tools/scraper/` (`tools/*` in the
   workspace `members`), declared with `package = false`: it shares the virtualenv, the lockfile and
   the ruff configuration, is linted in CI, and is never installed into an image. Its output
   (`data/`) is ignored.
3. **One `infra/` folder with one subfolder per cloud** (`infra/gcp/`, `infra/aws/`). What both
   clouds share (images from GHCR, secrets, state, CORS/OAuth, migrations at start) is documented
   once in `infra/README.md`; the per-cloud READMEs keep only what differs.
4. **One root `.gitignore`** replaces the nested ones; the design file moves to `docs/design/`.
5. Paths are referenced through the `justfile` variables, the `paths-filter` block of
   `.github/workflows/pr.yml`, the devcontainer volumes and `scripts/check_docs.py`. Those are
   the places to update if a top-level folder moves again.

## Consequences

- The root reads as: code (`src/`), infrastructure (`infra/`), documentation (`docs/`), tooling
  (`scripts/`, `justfile`, dotfiles).
- Every branch open before this change needs a rebase; `git` follows the renames, so history is
  preserved (`git log --follow`).
- The devcontainer's named volumes mount at the new paths, so existing containers must be
  rebuilt once ("Dev Containers: Rebuild Container").
- Earlier ADRs mention the old paths (`backend/`, `frontend/`); they are historical records and
  are not rewritten.
