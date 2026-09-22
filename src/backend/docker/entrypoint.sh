#!/bin/sh
# Shared entrypoint for both images, everywhere they run:
#
#   entrypoint.sh                 serve on :8000 (Compose, ECS, Lambda through the Web Adapter)
#
# There is nothing to run before serving: core_api keeps its data in DynamoDB
# (ADR 0023), whose table Terraform owns on AWS and the service creates itself
# against a local endpoint.
set -e

echo "==> [${SERVICE}] Starting uvicorn on :8000"
exec uvicorn "${SERVICE}.main:app" --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
