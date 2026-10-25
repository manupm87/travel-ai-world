Lint and format the backend workspace with Ruff.

```bash
just lint        # ruff check + ruff format --check + pyright (and eslint for the frontend)
just format      # ruff format + ruff check --fix
```

Without `just`, from `src/backend/`:

```bash
uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
uv run pyright
uv run ruff format . ../../scripts   # what `just format` writes
```

Configuration lives in `src/backend/pyproject.toml` (`[tool.ruff]`: line length 88, target py312; the rule set is listed in the root `AGENTS.md`) and applies to every workspace member.
