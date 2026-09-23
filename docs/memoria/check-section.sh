#!/usr/bin/env bash
# Compila la memoria con una sola sección real (las demás vacías) para detectar errores LaTeX.
# Uso: bash check-section.sh 05-arquitectura-ia [otra-seccion ...]
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
T="${TECTONIC:-/tmp/claude-1000/-workspace/38552591-0294-4513-bfc6-75f679efd51e/scratchpad/bin/tectonic}"
command -v tectonic >/dev/null && T=tectonic
W="$(mktemp -d)"; mkdir -p "$W/sections"
cp "$DIR/main.tex" "$DIR/referencias.bib" "$W/"; cp -r "$DIR/figures" "$W/" 2>/dev/null || true
for f in "$DIR"/sections/*.tex; do echo "" > "$W/sections/$(basename "$f")"; done
for s in "$@"; do cp "$DIR/sections/$s.tex" "$W/sections/$s.tex"; done
( cd "$W" && "$T" --keep-logs main.tex 2>&1 | grep -v 'accessing absolute path' | grep -E 'error|Error|Overfull|Undefined|undefined|Missing|Runaway' | grep -v 'Underfull' | head -40 )
if [ -f "$W/main.pdf" ]; then echo "OK: $(pdfinfo "$W/main.pdf" 2>/dev/null | grep Pages) -> $W/main.pdf"; else echo "FAIL: no PDF"; fi
