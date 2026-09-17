#!/bin/sh
# Lambda gives every execution environment a writable /tmp and nothing else, and
# Qdrant demands a writable storage directory even when it only reads
# (qdrant/qdrant#3321), so the collection travels as a tar in the image and is
# unpacked once per cold start. That extraction is part of the init duration the
# spike measures.
set -e

if [ ! -d /tmp/storage ]; then
  echo "==> extracting the collection into /tmp"
  tar -xf /opt/qdrant-storage.tar -C /tmp
  echo "==> extracted"
fi

exec /qdrant/qdrant
