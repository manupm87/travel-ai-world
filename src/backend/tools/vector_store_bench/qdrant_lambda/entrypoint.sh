#!/bin/sh
# Lambda gives every execution environment a writable /tmp and nothing else, so
# the collection built into the image is copied there once per cold start. The
# copy is part of the init duration the spike measures.
set -e

if [ ! -d /tmp/storage ]; then
  echo "==> copying the collection into /tmp"
  cp -r /opt/qdrant-storage /tmp/storage
fi

exec /qdrant/qdrant
