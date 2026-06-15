# 🚀 Travel AI World — Backend API

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.12-3776AB.svg?style=for-the-badge&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red?style=for-the-badge)

The FastAPI backend powering Travel AI World. Provides Google OAuth authentication, real-time AI chat streaming via NVIDIA, and full trip CRUD management through a layered async architecture.

## ✨ Features

- 🏗️ **Layered Architecture:** Controllers (Routers) → Services → Repositories → Models
- 🔐 **Google OAuth 2.0:** Exclusive authentication via Google — no passwords stored
- 🤖 **AI Chat Streaming:** SSE proxy to NVIDIA Kimi K2.6 with retry + exponential backoff
- 👥 **User Management:** Google profile sync, JWT sessions, Role-Based Access Control (Admin/User)
- 💾 **Async Database:** PostgreSQL via `asyncpg` + SQLAlchemy 2.0 (SQLite fallback for dev)
- 🗃️ **Migrations:** Alembic pre-configured for async schemas
- 🚦 **Error Handling:** Centralized semantic exceptions extending `HTTPException`
- 🧪 **Testing:** `pytest-asyncio` with dedicated test database and coverage reporting
- 🚀 **CI/CD:** GitHub Actions with `uv` caching, `Ruff` linting, and import validation

---

## Development with Dev Containers

This project includes a **Development Container** configuration (`.devcontainer/`) so you can spin up a reproducible environment with a single click in VS Code (or any compatible IDE).

1. **Open the folder** in VS Code and run **`Dev Containers: Re‑open in Container`** (or accept the prompt that appears).
2. VS Code will build the Docker image defined in `.devcontainer/Dockerfile` and start the services described in `.devcontainer/docker-compose.yml` (frontend, backend, PostgreSQL, scraper, plus a helper devcontainer service).
3. The repository source is mounted at `/workspace` inside the container, matching the `workspaceFolder` setting, so any edits you make are persisted to your host files.
4. After the container is ready, the `postCreateCommand` runs automatically:
   ```bash
   pip install -r backend/requirements.txt && npm install --prefix frontend
   ```
   installing backend Python dependencies and frontend Node packages.
5. The services are exposed on the host ports **3000** (frontend), **8000** (backend), **5432** (PostgreSQL) and **6333** (optional tools). Open `http://localhost:3000` to view the app.

You can now work exactly as described in the original **Quick Start Guide**, but everything runs inside an isolated Docker environment, ensuring the same versions of Node, Python, and other tools across all developers.

---

## 🛠️ Quick Start Guide

### 1. Prerequisites ⚡

The only tool you need to manage this project is **[uv](https://github.com/astral-sh/uv)**. It replaces `pip`, `venv`, and `pip-tools` with a single, ultra-fast interface.

**Install `uv` globally:**
- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```
- **macOS / Linux:**
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Via pip:**
  ```bash
  pip install uv
  ```

**Why `uv`?**
- **Speed**: Resolves and installs dependencies significantly faster than `pip`.
- **Determinism**: The `uv.lock` file ensures you install the exact same versions across all environments.
- **Convenience**: `uv run` executes commands in the managed virtual environment without requiring manual activation.

### 2. Installation & Setup

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd travel-ai-world

# 2. Enter the backend directory
cd backend

# 3. Setup environment and install dependencies
# Note: We use --all-extras to install testing tools (pytest) and linters (ruff).
# By default, `uv sync` only installs the core dependencies needed to run the API 
# in production. This intentional separation keeps the production image lightweight 
# and secure, while using `--all-extras` gives developers locally all the tools they need.
uv sync --all-extras
```

### 3. Environment Configuration

Copy the `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

> [!IMPORTANT]
> **Required environment variables:**
> - `SECRET_KEY` — JWT signing key (generate a strong random string)
> - `GOOGLE_CLIENT_ID` — Google OAuth Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
> - `GOOGLE_CLIENT_SECRET` — Google OAuth Client Secret
> - `NVIDIA_API_KEY` — API key for AI chat functionality
>
> **Database:** The `.env.example` defaults to PostgreSQL. Set `DB_ENGINE="sqlite"` for quick local testing without a database server. If using PostgreSQL locally, ensure `DB_SERVER="127.0.0.1"` (not `localhost` on Windows).
>
> **CORS (production):** Set `BACKEND_CORS_ORIGINS` to your frontend URL(s) — e.g. `BACKEND_CORS_ORIGINS=["https://yourdomain.com"]`. The default allows only `localhost:3000` and `localhost:5173`.

### 4. Database Setup

Once your `.env` is properly configured and pointing to a running database (or sqlite), apply migrations to create the underlying tables:

```bash
uv run alembic upgrade head
```

### 5. Run the API

Start the local development server:

```bash
uv run fastapi dev app/main.py
```

Then visit:

- **Swagger Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Interactive Spec:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## 🔐 Authentication

The backend uses **Google OAuth 2.0 exclusively**. There is no password-based login or registration.

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/auth/google` | `POST` | Accepts a Google ID token, verifies it with Google's tokeninfo API, creates/updates the user, returns a JWT |

**Security stack:**
- `verify_google_token()` — validates the token audience matches `GOOGLE_CLIENT_ID`
- `create_access_token()` — issues a JWT signed with `SECRET_KEY`
- `HTTPBearer` — extracts Bearer tokens from `Authorization` header
- No `bcrypt`, no `OAuth2PasswordBearer`, no password fields in the database

---

## 🤖 AI Chat

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/v1/chat` | `POST` | None | Streams AI responses via SSE |

The chat endpoint proxies requests to NVIDIA's API (`moonshotai/kimi-k2.6`) with:
- **Retry logic** with exponential backoff (up to 2 retries)
- **Streaming SSE** — content chunks arrive as `data: {"content": "..."}` events
- **Fail-fast** — returns 503 if `NVIDIA_API_KEY` is not configured

---

## ✅ Running Tests

The test suite runs against a **dedicated PostgreSQL database** named `<DB_NAME>_test` (auto-created from your `.env` `DB_NAME` value). Schema is rebuilt fresh on every run, so your development data is never touched.

```bash
uv run pytest -v
```

## 🏗️ Project Architecture Layout

If you intend to add a new `Item` feature, you should follow this exact sequence:

1. `app/models/item.py` — Create the SQLAlchemy model inheriting from `Base`.
2. `app/models/__init__.py` — Import `Item` here so Alembic and the test harness discover it.
3. `app/schemas/item.py` — Define Pydantic inputs and outputs (`ItemCreate`, `ItemResponse`).
4. `app/repositories/item_repository.py` — Handle solely DB operations (`create`, `get_by_id`).
5. `app/services/item_service.py` — Hold business rules.
6. `app/api/v1/endpoints/items.py` — Handle HTTP traffic and inject dependencies via `Depends()`.
