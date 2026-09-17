#!/usr/bin/env bash
# Package the bench function. The Lambda runtime's own boto3 predates the
# `s3vectors` client, so a current one travels in the zip.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
build="${here}/build"

rm -rf "${build}" "${here}/bench.zip"
mkdir -p "${build}"
cp "${here}/handler.py" "${build}/"

python3 -m pip install --quiet --no-compile --target "${build}" "boto3>=1.43"
find "${build}" -name "__pycache__" -type d -prune -exec rm -rf {} +
find "${build}" -name "*.dist-info" -type d -prune -exec rm -rf {} +

(cd "${build}" && zip -qr "${here}/bench.zip" .)
echo "==> $(du -h "${here}/bench.zip" | cut -f1) ${here}/bench.zip"
