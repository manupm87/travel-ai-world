# One Dockerfile, two images. Build from the workspace root (src/backend/):
#
#   docker build --build-arg SERVICE=core_api -t travel-core-api .
#   docker build --build-arg SERVICE=ai_api   -t travel-ai-api   .
#
# SERVICE is the import package (services/<SERVICE>/<SERVICE>); the uv
# package name is the same with dashes. Only that service and the workspace
# libraries it depends on end up in the image.
#
# The same image runs in Docker Compose, on ECS and on AWS Lambda: the AWS
# Lambda Web Adapter (ADR 0009) ships as a Lambda extension in
# /opt/extensions and only activates when the Lambda runtime API is present;
# everywhere else uvicorn simply listens on :8000.

# Global build args: FROM lines below reference them, so they are declared
# before the first stage (stage-level ARG SERVICE re-declarations inherit them).
ARG PYTHON_VERSION=3.12
ARG LWA_VERSION=0.9.1
ARG SERVICE

# The adapter binary, as a stage: `COPY --from` does not expand variables.
FROM public.ecr.aws/awsguru/aws-lambda-adapter:${LWA_VERSION} AS lwa

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

# ── Stage 2a: per-service Lambda Web Adapter settings ───────────────────────
# ENV cannot branch on a build arg, so each service has a one-line stage and
# the runtime stage inherits from the matching one.
FROM python:${PYTHON_VERSION}-slim AS lambda-env-core_api
ENV AWS_LWA_INVOKE_MODE=buffered \
    AWS_LWA_READINESS_CHECK_PATH=/api/v1/health/

FROM python:${PYTHON_VERSION}-slim AS lambda-env-ai_api
# Response streaming end to end: the SSE chat is not buffered by Lambda.
ENV AWS_LWA_INVOKE_MODE=response_stream \
    AWS_LWA_READINESS_CHECK_PATH=/api/v1/ai/health/

# ── Stage 2: minimal runtime ────────────────────────────────────────────────
FROM lambda-env-${SERVICE}
ARG SERVICE
WORKDIR /app

COPY --from=lwa /lambda-adapter /opt/extensions/lambda-adapter
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
    SERVICE=${SERVICE} \
    AWS_LWA_PORT=8000

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys, urllib.request; \
        p = '/api/v1/ai/health/' if '${SERVICE}' == 'ai_api' else '/api/v1/health/'; \
        sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000' + p).status == 200 else 1)"

ENTRYPOINT ["/app/entrypoint.sh"]
