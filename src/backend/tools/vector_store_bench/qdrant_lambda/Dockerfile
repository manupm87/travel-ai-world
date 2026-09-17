# Candidate A of the spike: Qdrant running as a Lambda function.
#
# The corpus is read-only, so the collection is built at image build time and
# copied into /tmp at start instead of being restored from an S3 snapshot: one
# less moving part, no IAM at runtime, and a cold start that does not depend on
# S3 throughput. Reindexing means rebuilding the image, which is what a spike
# wants anyway.
#
# Build from src/backend/tools (so the corpus and the artefact are in context).
# --provenance=false --sbom=false: Lambda rejects the OCI index buildx would
# otherwise produce to carry attestations.
#   docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
#     -f vector_store_bench/qdrant_lambda/Dockerfile -t <repo>:budapest --push .
ARG QDRANT_VERSION=v1.12.5
ARG LWA_VERSION=0.9.1

FROM public.ecr.aws/awsguru/aws-lambda-adapter:${LWA_VERSION} AS lwa

# ── Build the collection once, with the same binary that will serve it ───────
FROM qdrant/qdrant:${QDRANT_VERSION} AS builder
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/loader && /opt/loader/bin/pip install --no-cache-dir \
    "qdrant-client>=1.12" "numpy>=2.1" "pydantic>=2.11"

WORKDIR /build
COPY vector_store_bench/vector_store_bench /build/vector_store_bench
COPY vector_store_bench/.artifacts/budapest /build/artifact
COPY city_corpus/data/budapest/documents.jsonl /build/documents.jsonl
COPY vector_store_bench/qdrant_lambda/load_collection.py /build/load_collection.py

ENV QDRANT__STORAGE__STORAGE_PATH=/qdrant/storage \
    QDRANT__TELEMETRY_DISABLED=true \
    PYTHONPATH=/build
# The image has no pkill, so the server is stopped by its own PID, and with
# SIGTERM rather than SIGKILL: Qdrant flushes the collection on the way out.
RUN set -e; \
    /qdrant/qdrant & \
    qdrant_pid=$!; \
    for _ in $(seq 1 60); do \
      /opt/loader/bin/python -c "import socket; socket.create_connection(('127.0.0.1', 6333), 1)" 2>/dev/null && break; \
      sleep 1; \
    done; \
    /opt/loader/bin/python /build/load_collection.py; \
    kill -TERM "$qdrant_pid"; \
    wait "$qdrant_pid" || true

# ── Runtime: the official image plus the adapter ─────────────────────────────
FROM qdrant/qdrant:${QDRANT_VERSION}
COPY --from=lwa /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=builder /qdrant/storage /opt/qdrant-storage
COPY vector_store_bench/qdrant_lambda/entrypoint.sh /entrypoint.sh
USER root
RUN chmod +x /entrypoint.sh

# The adapter proxies each invocation to Qdrant's HTTP API on 6333 and waits for
# /readyz before the first one, so a cold start never answers early.
ENV AWS_LWA_PORT=6333 \
    AWS_LWA_READINESS_CHECK_PATH=/readyz \
    AWS_LWA_INVOKE_MODE=buffered \
    QDRANT__STORAGE__STORAGE_PATH=/tmp/storage \
    QDRANT__TELEMETRY_DISABLED=true \
    QDRANT__SERVICE__ENABLE_CORS=false

ENTRYPOINT ["/entrypoint.sh"]
