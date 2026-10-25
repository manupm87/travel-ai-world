Run the backend test suites.

```bash
just test-backend        # travel_common + core_api + ai_api + city_corpus
just test-core           # core_api only — DynamoDB is mocked in-process (moto), no database needed
just test-ai             # ai_api only — no network, no API key (FakeProvider + MockTransport)
just test-common
just test-corpus         # city_corpus, fixtures only
```

A single file or test, from the package directory:

```bash
cd src/backend/services/core_api
uv run pytest tests/api/test_trips.py::test_other_users_trip_is_not_found -v
```

Notes:

- No `.env`, database or network needed: core_api's `conftest.py` sets a test `SECRET_KEY`.
- Tests are async by default (`asyncio_mode = "auto"`) and use `--import-mode=importlib`; never import `tests.*` across packages.
- Test doubles for `ai_api` live in `ai_api/testing.py`.
