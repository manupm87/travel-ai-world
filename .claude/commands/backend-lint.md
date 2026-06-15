Lint and format backend code using Ruff.

Steps:
1. Execute Ruff checks from the `backend/` directory:
   ```bash
   cd backend
   uv run ruff check
   ```

2. To automatically fix fixable issues, append the `--fix` flag:
   ```bash
   uv run ruff check --fix
   ```

3. To format code (Ruff replaces Black):
   ```bash
   uv run ruff format
   ```

Note:
- The configuration is defined in `backend/pyproject.toml` (line-length `88`, ignored directories: `alembic`, `venv`).
- `target-version = "py312"` is Ruff's AST parsing target — the actual runtime is Python 3.14.3 as defined in `.python-version`.
