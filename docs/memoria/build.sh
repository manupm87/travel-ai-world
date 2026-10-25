#!/bin/sh
# Builds main.pdf with pdflatex + biber (TeX Live or MiKTeX with automatic package install).
set -e
cd "$(dirname "$0")"
pdflatex -interaction=nonstopmode -halt-on-error main.tex > build.log 2>&1 || { grep -A5 "^!" main.log | head -30; exit 1; }
biber main >> build.log 2>&1 || { tail -20 build.log; exit 1; }
pdflatex -interaction=nonstopmode main.tex >> build.log 2>&1
pdflatex -interaction=nonstopmode main.tex >> build.log 2>&1
grep -E "^!|Warning: (Reference|Citation).*undefined" main.log || true
echo "main.pdf built"
