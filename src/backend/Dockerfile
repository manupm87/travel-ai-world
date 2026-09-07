# One Dockerfile, two images. Build from the workspace root (src/backend/):
#
#   docker build --build-arg SERVICE=core_api -t travel-core-api .
#   docker build --build-arg SERVICE=ai_api   -t travel-ai-api   .
#
# SERVICE is the import package (services/<SERVICE>/<SERVICE>); the uv
# package name is the same with dashes. Only that service and the workspace
# libraries it depends on end up in the image.

ARG PYTHON_VERSION=3.12

# ── Stage 1: resolve and install into /opt/venv ─────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder
ARG SERVICE
RUN test -n "$SERVICE" || { echo "build-arg SERVICE=core_api|ai_api is required" >&2; exit 1; }

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# Dependency layer: manifests only, so it is cached until a dependency changes.
COPY pyproject.toml uv.lock ./
COPY libs/travel_common/pyproject.toml libs/travel_common/
COPY services/core_api/pyproject.toml services/core_api/
COPY services/ai_api/pyproject.toml services/ai_api/
COPY tools/scraper/pyproject.toml tools/scraper/
RUN uv sync --frozen --no-dev --no-install-workspace \
    --package "$(echo "$SERVICE" | tr _ -)"

# Source layer: the shared library and this service, installed as real
# packages (not editable) so the runtime image needs no source tree.
COPY libs/travel_common libs/travel_common
COPY services/${SERVICE} services/${SERVICE}
RUN uv sync --frozen --no-dev --no-editable \
    --package "$(echo "$SERVICE" | tr _ -)"

# Runtime files that live outside the package (migrations, if the service has them).
RUN mkdir -p /runtime \
    && if [ -d "services/${SERVICE}/alembic" ]; then \
         cp -r "services/${SERVICE}/alembic" "services/${SERVICE}/alembic.ini" /runtime/; \
       fi

# ── Stage 2: minimal runtime ────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim
ARG SERVICE
WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /runtime /app
COPY docker/entrypoint.sh /app/entrypoint.sh

RUN useradd -m appuser \
    && sed -i 's/\r$//' /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh \
    && chown -R appuser:appuser /app

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SERVICE=${SERVICE}

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys, urllib.request; \
        p = '/api/v1/ai/health/' if '${SERVICE}' == 'ai_api' else '/api/v1/health/'; \
        sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000' + p).status == 200 else 1)"

ENTRYPOINT ["/app/entrypoint.sh"]
