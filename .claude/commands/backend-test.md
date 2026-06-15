Run the test suite for the backend application.

Steps:
1. Navigate to the `backend/` directory.
2. Run pytest with `uv`:
   ```bash
   cd backend
   uv run pytest -v
   ```
3. Tests run against a **dedicated PostgreSQL database** named `<DB_NAME>_test` (auto-created from your `.env`). The schema is rebuilt from scratch each run — your development data is never touched.
4. If testing a specific file or test function, supply the path:
   ```bash
   uv run pytest tests/api/test_users.py -v
   uv run pytest tests/api/test_users.py::test_create_user -v
   ```

Note:
- Tests are configured to run asynchronously with `pytest-asyncio` (`asyncio_mode = "auto"` in `pyproject.toml`).
- A running PostgreSQL instance is required, configured via `.env`.
