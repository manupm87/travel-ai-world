# `.devcontainer` – Development Container

This folder contains the *Development Container* configuration for the **Travel AI World** monorepo.  It allows every contributor to spin up an isolated, reproducible environment that mirrors the project's required tools (Node 20, Python 3.12, Docker‑in‑Docker, GitHub CLI, etc.) without having to install anything on the host machine.

---

## What is a Dev Container?

A **Dev Container** is a Docker‑based environment that VS Code (or any compatible IDE) can open automatically.  When you open the repository and select **"Re‑open in Container"**, the IDE:
1. Builds the image defined in `Dockerfile` (Node + Python + extra tooling).
2. Starts the services described in `.devcontainer/docker-compose.yml` (frontend, backend, PostgreSQL, scraper, plus a helper `devcontainer` service).
3. Mounts the repository source at `/workspace` inside the container, so you edit the same files you see on the host.
4. Executes the `postCreateCommand` from `devcontainer.json` to install the project dependencies (`pip install -r backend/requirements.txt` and `npm install --prefix frontend`).

The result is a fully‑functional development stack that works the same on Windows, macOS, or Linux.

---

## What we added / improved

| Improvement | Reason | Location |
|------------|--------|----------|
| **Port 6333 forwarding** | Allows optional tools (e.g., TensorBoard, Jupyter) to be reachable from the host. | `devcontainer` service `ports` in `docker-compose.yml` |
| **`restart: unless-stopped`** policy | Guarantees containers are automatically restarted if they crash or the Docker daemon restarts. | All services in `docker-compose.yml` |
| **Health‑check for PostgreSQL** | Ensures dependent services (`backend`, `scraper`) wait until the database is ready. | `postgres` service `healthcheck` in `docker-compose.yml` |
| **Docker‑in‑Docker socket** | Enables you to run Docker commands (e.g., building images) from inside the dev container. | Volume mount `/var/run/docker.sock` in `devcontainer` service |

---

## How to use it

1. **Open the repo in VS Code** and run the command **"Dev Containers: Re‑open in Container"** (or click the popup that appears when the folder contains a `.devcontainer`).
2. VS Code will build the image and start the compose stack (`docker compose up -d`).
3. Once the terminal inside the container is ready, you can run the usual project commands exactly as described in the frontend and backend README files, e.g.:
   ```bash
   # Inside the container
   cd frontend
   npm run dev   # http://localhost:3000
   cd ../backend
   uv run fastapi dev app/main.py   # http://localhost:8000
   ```
4. The services are already exposed on the host ports `3000`, `8000` and `5433` (Postgres). Open your browser at `http://localhost:3000` to view the app. Inside Docker, the backend continues to reach PostgreSQL at `db:5432`.

---

## Gotchas & Tips

- The container uses **pnpm** as the global package manager (installed in the Dockerfile).  You can still use `npm` – it will delegate to pnpm under the hood.
- If you need to run additional Docker commands from inside the container, the Docker socket is already mounted.
- To stop everything, run `docker compose down` from a terminal on the host (or use the VS Code command **"Dev Containers: Reopen Folder Locally"**).