# Stage 1: Build Dependencies
FROM python:3.12-slim AS builder

# Install uv from the official Astral image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install system dependencies required for building packages
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable bytecode compilation and use a custom venv location
ENV UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# Copy dependency definitions
COPY pyproject.toml uv.lock ./

# Install dependencies (without the project itself to maximize caching)
RUN uv sync --frozen --no-dev --no-install-project

# Now copy the project itself and install it
COPY ./app /app/app
COPY ./alembic /app/alembic
COPY alembic.ini README.md ./
RUN uv sync --frozen --no-dev

# Stage 2: Production Run
FROM python:3.12-slim
WORKDIR /app

# Install only runtime system dependencies (no gcc/build tools)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Create non-root user and set permissions
RUN useradd -m appuser && \
    chown -R appuser:appuser /app /opt/venv

# Set up environment variables — venv/bin on PATH gives us alembic + uvicorn directly
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy source code and config (after user creation and before switching user)
COPY ./app /app/app
COPY ./alembic /app/alembic
COPY alembic.ini ./
COPY entrypoint.sh /app/entrypoint.sh

# Fix permissions and line endings
RUN chmod +x /app/entrypoint.sh && \
    sed -i 's/\r$//' /app/entrypoint.sh && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
