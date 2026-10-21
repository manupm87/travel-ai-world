#!/bin/sh
# Shared entrypoint for both images, everywhere they run:
#
#   entrypoint.sh                 serve on :8000 (Compose, Lambda through the Web Adapter)
#
# There is nothing to run before serving: core_api keeps its data in DynamoDB
# (ADR 0023), whose table Terraform owns on AWS and the service creates itself
# against a local endpoint.
set -e

echo "==> [${SERVICE}] Starting uvicorn on :8000"
# Structured logs use route templates. Avoid duplicate Uvicorn access lines,
# which include concrete paths and query strings, when this observer is enabled.
case "${ACCESS_LOG_ENABLED:-false}" in
  1|true|True|TRUE|yes|Yes|YES|on|On|ON) set -- --no-access-log ;;
  *) set -- ;;
esac
exec uvicorn "${SERVICE}.main:app" --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*" "$@"
