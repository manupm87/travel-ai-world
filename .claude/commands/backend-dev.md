Run the backend FastAPI development server locally with live reload.

Steps:
1. Ensure you are in the `backend/` directory.
2. Run the `fastapi dev` command via `uv`:
   ```bash
   cd backend
   uv run fastapi dev app/main.py
   ```
3. The server will start, typically at `http://127.0.0.1:8000`.
4. You can access the Swagger UI documentation at `http://127.0.0.1:8000/docs`.

Note: 
- `uv` handles running the command safely in its managed environment without needing to manually activate the `venv` first.
- The dev server tracks changes across all files and reloads automatically.
